-- Persist each student's current option server-side while keeping the question editable.
-- On deadline, score the last saved option; only a genuinely unanswered question is TIMEOUT.
BEGIN;

ALTER TABLE public.vokasi_web_exam_sessions
  ADD COLUMN IF NOT EXISTS pending_choice integer,
  ADD COLUMN IF NOT EXISTS pending_question_index integer,
  ADD COLUMN IF NOT EXISTS pending_selected_at timestamptz;

CREATE OR REPLACE FUNCTION vokasi_private.web_view(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,vokasi_private
AS $$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE; q jsonb; choices jsonb;
BEGIN
  SELECT * INTO s
  FROM public.vokasi_web_exam_sessions
  WHERE id=p_id AND auth_user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak tersedia.'; END IF;

  IF s.status='complete' THEN
    RETURN jsonb_build_object(
      'session_id',s.id,'status','complete','category',s.practice_category,
      'score',s.final_score,'total',s.question_count,
      'correct',(SELECT COUNT(*) FROM jsonb_array_elements(s.answers) a WHERE a->>'status'='BENAR'),
      'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint
    );
  END IF;
  IF s.status='cancelled' THEN RAISE EXCEPTION 'Sesi lama telah digantikan sesi baru.'; END IF;
  IF s.status='prepared' THEN
    RETURN jsonb_build_object(
      'session_id',s.id,'status','prepared','total',s.question_count,
      'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint
    );
  END IF;

  q=s.questions->s.current_index;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('text',c->>'text','image_path',c->>'image_path') ORDER BY n
  ),'[]'::jsonb)
  INTO choices
  FROM jsonb_array_elements(q->'options') WITH ORDINALITY x(c,n);

  RETURN jsonb_build_object(
    'session_id',s.id,'status','active','category',s.practice_category,
    'index',s.current_index,'total',s.question_count,
    'pending_choice',CASE WHEN s.pending_question_index=s.current_index THEN s.pending_choice ELSE NULL END,
    'question',jsonb_build_object(
      'id',(q->>'id')::int,'category',q->>'category','text',q->>'question',
      'image_path',q->>'image_path','options',choices,'seconds',(q->>'seconds')::int
    ),
    'question_deadline_ms',(EXTRACT(EPOCH FROM s.question_deadline_at)*1000)::bigint,
    'overall_deadline_ms',(EXTRACT(EPOCH FROM s.overall_deadline_at)*1000)::bigint,
    'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint
  );
END;
$$;
REVOKE ALL ON FUNCTION vokasi_private.web_view(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION vokasi_private.web_process(
  p_session uuid,p_question_index integer DEFAULT NULL,p_choice integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','vokasi_private'
AS $function$
DECLARE
  s public.vokasi_web_exam_sessions%ROWTYPE;
  q jsonb;
  v_now timestamptz;
  v_start timestamptz;
  v_correct boolean;
  v_feedback jsonb:=NULL;
  v_elapsed integer;
  v_response jsonb;
  v_wait_ms bigint:=0;
BEGIN
  SELECT * INTO s
  FROM public.vokasi_web_exam_sessions
  WHERE id=p_session AND auth_user_id=auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi bukan milik akun ini.'; END IF;
  IF s.status='prepared' OR s.status='cancelled' OR s.status='complete' THEN
    RETURN vokasi_private.web_view(p_session);
  END IF;

  v_now=clock_timestamp();
  -- Keep the overall deadline fixed to the original server-issued time budget.
  s.overall_deadline_at=LEAST(
    s.overall_deadline_at,
    s.started_at + make_interval(secs => (
      SELECT SUM((z->>'seconds')::integer) FROM jsonb_array_elements(s.questions) z
    ))
  );

  -- Finalize expired questions from the latest saved choice. Only a question
  -- with no saved choice is marked TIMEOUT.
  WHILE s.current_index < s.question_count
    AND (v_now>=s.question_deadline_at OR v_now>=s.overall_deadline_at)
  LOOP
    q=s.questions->s.current_index;
    IF s.pending_question_index=s.current_index
      AND s.pending_choice IS NOT NULL
      AND s.pending_choice BETWEEN 0 AND (jsonb_array_length(q->'options')-1)
    THEN
      v_correct=(s.pending_choice=(q->>'answer_index')::integer);
      v_elapsed=LEAST(
        (q->>'seconds')::integer,
        GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (
          COALESCE(s.pending_selected_at,s.question_started_at)-s.question_started_at
        )))::integer)
      );
      s.answers=s.answers||jsonb_build_array(jsonb_build_object(
        'question_id',(q->>'id')::integer,
        'selected_index',s.pending_choice,
        'status',CASE WHEN v_correct THEN 'BENAR' ELSE 'SALAH' END,
        'response_seconds',v_elapsed
      ));
    ELSE
      s.answers=s.answers||jsonb_build_array(jsonb_build_object(
        'question_id',(q->>'id')::integer,
        'selected_index',NULL,
        'status','TIMEOUT',
        'response_seconds',(q->>'seconds')::integer
      ));
    END IF;

    s.pending_choice=NULL;
    s.pending_question_index=NULL;
    s.pending_selected_at=NULL;
    s.current_index=s.current_index+1;
    IF s.current_index < s.question_count THEN
      v_start=s.question_deadline_at;
      s.question_started_at=v_start;
      s.question_deadline_at=v_start+make_interval(
        secs=>(s.questions->s.current_index->>'seconds')::integer
      );
    END IF;
  END LOOP;

  -- Explicitly pressing "Kirim jawaban" finalizes the current choice early.
  IF s.current_index<s.question_count
    AND p_question_index=s.current_index
    AND p_choice IS NOT NULL
    AND v_now>=s.question_started_at
  THEN
    q=s.questions->s.current_index;
    IF p_choice NOT BETWEEN 0 AND (jsonb_array_length(q->'options')-1)
      THEN RAISE EXCEPTION 'Pilihan jawaban tidak valid.'; END IF;
    v_correct=(p_choice=(q->>'answer_index')::integer);
    v_elapsed=LEAST(
      (q->>'seconds')::integer,
      GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (v_now-s.question_started_at)))::integer)
    );
    s.answers=s.answers||jsonb_build_array(jsonb_build_object(
      'question_id',(q->>'id')::integer,
      'selected_index',p_choice,
      'status',CASE WHEN v_correct THEN 'BENAR' ELSE 'SALAH' END,
      'response_seconds',v_elapsed
    ));
    v_feedback=jsonb_build_object('correct',v_correct,'selected_index',p_choice);
    s.pending_choice=NULL;
    s.pending_question_index=NULL;
    s.pending_selected_at=NULL;
    s.current_index=s.current_index+1;
    IF s.current_index<s.question_count THEN
      s.question_started_at=v_now+interval '1 second';
      s.question_deadline_at=s.question_started_at+make_interval(
        secs=>(s.questions->s.current_index->>'seconds')::integer
      );
    END IF;
    s.overall_deadline_at=s.overall_deadline_at+interval '1 second';
    v_wait_ms=1000;
  END IF;

  UPDATE public.vokasi_web_exam_sessions SET
    answers=s.answers,
    current_index=s.current_index,
    question_started_at=s.question_started_at,
    question_deadline_at=s.question_deadline_at,
    overall_deadline_at=s.overall_deadline_at,
    pending_choice=s.pending_choice,
    pending_question_index=s.pending_question_index,
    pending_selected_at=s.pending_selected_at
  WHERE id=s.id;

  IF s.current_index>=s.question_count THEN
    PERFORM vokasi_private.web_finish(s.id);
  END IF;
  v_response=vokasi_private.web_view(s.id);
  IF v_feedback IS NOT NULL THEN
    RETURN v_response||jsonb_build_object('feedback',v_feedback,'feedback_wait_ms',v_wait_ms);
  END IF;
  IF p_choice IS NOT NULL THEN
    RETURN v_response||jsonb_build_object('late',true);
  END IF;
  RETURN v_response;
END;
$function$;
REVOKE ALL ON FUNCTION vokasi_private.web_process(uuid,integer,integer) FROM PUBLIC,anon,authenticated;

-- Save or revise a pending choice without advancing the question.
CREATE OR REPLACE FUNCTION public.vokasi_web_select_answer(
  p_session uuid,p_question_index integer,p_choice integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','vokasi_private'
AS $function$
DECLARE
  s public.vokasi_web_exam_sessions%ROWTYPE;
  q jsonb;
  v_now timestamptz;
  v_response jsonb;
BEGIN
  -- Resolve any deadline first, so a late request cannot overwrite an expired answer.
  v_response:=vokasi_private.web_process(p_session,NULL,NULL);

  SELECT * INTO s
  FROM public.vokasi_web_exam_sessions
  WHERE id=p_session AND auth_user_id=auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi bukan milik akun ini.'; END IF;
  IF s.status<>'active' THEN RETURN vokasi_private.web_view(p_session); END IF;

  v_now=clock_timestamp();
  IF v_now>=s.question_deadline_at OR v_now>=s.overall_deadline_at THEN
    RETURN vokasi_private.web_process(p_session,NULL,NULL);
  END IF;
  IF p_question_index IS DISTINCT FROM s.current_index THEN
    RETURN vokasi_private.web_view(p_session);
  END IF;

  q=s.questions->s.current_index;
  IF p_choice IS NULL OR p_choice<0 OR p_choice>=jsonb_array_length(q->'options') THEN
    RAISE EXCEPTION 'Pilihan jawaban tidak valid.';
  END IF;

  UPDATE public.vokasi_web_exam_sessions SET
    pending_choice=p_choice,
    pending_question_index=s.current_index,
    pending_selected_at=v_now
  WHERE id=s.id;

  RETURN vokasi_private.web_view(p_session);
END;
$function$;
REVOKE ALL ON FUNCTION public.vokasi_web_select_answer(uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_select_answer(uuid,integer,integer) TO authenticated;

COMMIT;
