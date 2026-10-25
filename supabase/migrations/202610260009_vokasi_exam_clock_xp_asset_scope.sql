-- Restrict visual assets to the student's own sessions; strict exam clock and verified-only daily XP.
-- No existing student results or school accounts are modified.
BEGIN;
CREATE OR REPLACE FUNCTION vokasi_private.web_process(p_session uuid, p_question_index integer DEFAULT NULL::integer, p_choice integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE; q jsonb; v_now timestamptz;
 v_start timestamptz; v_seconds int; v_idx int; v_correct boolean;
 v_feedback jsonb:=NULL; v_elapsed int; v_response jsonb; v_wait_ms bigint:=0;
BEGIN
 SELECT * INTO s FROM public.vokasi_web_exam_sessions
 WHERE id=p_session AND auth_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sesi bukan milik akun ini.'; END IF;
 IF s.status='prepared' OR s.status='cancelled' OR s.status='complete' THEN
  RETURN vokasi_private.web_view(p_session);
 END IF;
 v_now=clock_timestamp();
 -- Rebound even already-running sessions that previously gained per-answer time.
 s.overall_deadline_at=LEAST(s.overall_deadline_at,
   s.started_at + make_interval(secs => (SELECT SUM((z->>'seconds')::int) FROM jsonb_array_elements(s.questions) z)));
 -- After a disconnected client returns, consume all expired questions, never free time.
 WHILE s.current_index < s.question_count
  AND (v_now>=s.question_deadline_at OR v_now>=s.overall_deadline_at) LOOP
   q=s.questions->s.current_index;
   s.answers=s.answers||jsonb_build_array(jsonb_build_object(
    'question_id',(q->>'id')::int,'selected_index',NULL,'status','TIMEOUT',
    'response_seconds',(q->>'seconds')::int));
   s.current_index=s.current_index+1;
   IF s.current_index < s.question_count THEN
    v_start=s.question_deadline_at;
    s.question_started_at=v_start;
    s.question_deadline_at=v_start+make_interval(secs=>(s.questions->s.current_index->>'seconds')::int);
   END IF;
  END LOOP;
  IF s.current_index<s.question_count AND p_question_index=s.current_index
   AND p_choice IS NOT NULL AND v_now>=s.question_started_at THEN
    q=s.questions->s.current_index;
    IF p_choice NOT BETWEEN 0 AND (jsonb_array_length(q->'options')-1)
     THEN RAISE EXCEPTION 'Pilihan jawaban tidak valid.'; END IF;
    v_correct=(p_choice=(q->>'answer_index')::int);
    v_elapsed=LEAST((q->>'seconds')::int,GREATEST(0,
     FLOOR(EXTRACT(EPOCH FROM (v_now-s.question_started_at)))::int));
    s.answers=s.answers||jsonb_build_array(jsonb_build_object(
      'question_id',(q->>'id')::int,'selected_index',p_choice,
      'status',CASE WHEN v_correct THEN 'BENAR' ELSE 'SALAH' END,
      'response_seconds',v_elapsed));
    v_feedback=jsonb_build_object('correct',v_correct,'selected_index',p_choice);
    s.current_index=s.current_index+1;
    IF s.current_index<s.question_count THEN
      s.question_started_at=v_now+interval '1 second';
      s.question_deadline_at=s.question_started_at+make_interval(
        secs=>(s.questions->s.current_index->>'seconds')::int);
    END IF;
    -- Hard cutoff: feedback should not extend the total 1800-second session.
    s.overall_deadline_at=s.started_at + make_interval(secs => (SELECT SUM((z->>'seconds')::int) FROM jsonb_array_elements(s.questions) z));
    v_wait_ms=1000;
  END IF;
 UPDATE public.vokasi_web_exam_sessions SET
   answers=s.answers,current_index=s.current_index,question_started_at=s.question_started_at,
   question_deadline_at=s.question_deadline_at,overall_deadline_at=s.overall_deadline_at
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
END; $function$;
CREATE OR REPLACE FUNCTION vokasi_private.web_finish(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE; v_correct int; v_answered int;
 v_score int; v_username text; v_full text; v_class text; v_major text;
 v_xp int; v_attempt_id uuid; v_epoch bigint; v_signature text;
BEGIN
 SELECT * INTO s FROM public.vokasi_web_exam_sessions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.status='complete' THEN RETURN; END IF;
 IF s.status<>'active' OR s.current_index < s.question_count THEN RETURN; END IF;
 SELECT COUNT(*) FILTER(WHERE a->>'status'='BENAR'),
   COUNT(*) FILTER(WHERE a->>'selected_index' IS NOT NULL)
 INTO v_correct,v_answered FROM jsonb_array_elements(s.answers) a;
 v_score=(v_correct*100)/s.question_count;
 SELECT r.username,r.full_name,c.class_name,m.name INTO v_username,v_full,v_class,v_major
 FROM public.student_roster r
 JOIN public.classes c ON c.id=r.class_id
 LEFT JOIN public.majors m ON m.id=r.major_id
 WHERE r.auth_user_id=s.auth_user_id AND r.registration_status='registered' LIMIT 1;
 IF v_username IS NULL THEN RAISE EXCEPTION 'Akun tidak terdaftar pada daftar siswa resmi.'; END IF;
 v_epoch=(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint;
 IF s.practice_category IS NULL THEN v_xp=0; -- existing DB trigger calculates 50 once/day
 ELSE
  -- Award practice XP at most once per category/day even if two devices finish together.
  PERFORM pg_advisory_xact_lock(hashtextextended(s.auth_user_id::text || ':' || s.practice_category || ':' ||
       (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text, 722));
  SELECT CASE WHEN v_correct>0 AND NOT EXISTS(
    SELECT 1 FROM public.student_attempts a
     WHERE a.auth_user_id=s.auth_user_id AND a.practice_category=s.practice_category
       AND a.earned_xp>0
       AND EXISTS(SELECT 1 FROM public.vokasi_web_verified_results proof
         WHERE proof.attempt_id=a.id AND proof.auth_user_id=a.auth_user_id)
       AND (to_timestamp(a.completed_at_ms/1000.0) AT TIME ZONE 'Asia/Jakarta')::date =
           (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date
  ) THEN 5 ELSE 0 END INTO v_xp;
 END IF;
 v_signature='WEB-SERVER-v1:'||s.id::text;
 INSERT INTO public.student_attempts(auth_user_id,username,session_key,completed_at_ms,signature,
  correct,answered,question_count,score,earned_xp,seconds_spent,practice_category,
  name_snapshot,class_snapshot,major_snapshot,review_summary)
 VALUES(s.auth_user_id,v_username,s.id,v_epoch,v_signature,
   v_correct,v_answered,s.question_count,v_score,v_xp,
   LEAST(7200,GREATEST(0,EXTRACT(EPOCH FROM clock_timestamp()-s.started_at)::int)),
   s.practice_category,coalesce(v_full,''),coalesce(v_class,''),coalesce(v_major,''),s.answers)
 ON CONFLICT(auth_user_id,session_key) DO UPDATE SET
   completed_at_ms=EXCLUDED.completed_at_ms,signature=EXCLUDED.signature,
   correct=EXCLUDED.correct,answered=EXCLUDED.answered,question_count=EXCLUDED.question_count,
   score=EXCLUDED.score,earned_xp=EXCLUDED.earned_xp,
   seconds_spent=EXCLUDED.seconds_spent,review_summary=EXCLUDED.review_summary
 RETURNING id INTO v_attempt_id;
 INSERT INTO public.vokasi_web_verified_results(session_id,attempt_id,auth_user_id,score,correct,question_count)
 VALUES(s.id,v_attempt_id,s.auth_user_id,v_score,v_correct,s.question_count)
 ON CONFLICT(session_id) DO NOTHING;
 UPDATE public.vokasi_web_exam_sessions SET status='complete',completed_at=clock_timestamp(),final_score=v_score
 WHERE id=p_id AND current_index=question_count;
END; $function$;
CREATE OR REPLACE FUNCTION public.vokasi_limit_daily_compulsory_xp()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  session_day date;
  prior_compulsory boolean;
BEGIN
  IF NEW.practice_category IS NULL AND NEW.question_count = 100 THEN
    session_day := (pg_catalog.to_timestamp(NEW.completed_at_ms / 1000.0)
      AT TIME ZONE 'Asia/Jakarta')::date;

    -- Serialize submissions by student and local day, including concurrent phones.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(NEW.auth_user_id::text || ':' || session_day::text, 0)
    );

    SELECT EXISTS (
      SELECT 1
      FROM public.student_attempts AS recorded
      WHERE recorded.auth_user_id = NEW.auth_user_id
        AND recorded.practice_category IS NULL
        AND recorded.question_count = 100
        AND EXISTS (SELECT 1 FROM public.vokasi_web_verified_results proof
          WHERE proof.attempt_id=recorded.id AND proof.auth_user_id=recorded.auth_user_id)
        AND (pg_catalog.to_timestamp(recorded.completed_at_ms / 1000.0)
            AT TIME ZONE 'Asia/Jakarta')::date = session_day
    ) INTO prior_compulsory;

    NEW.earned_xp := CASE WHEN prior_compulsory THEN 0 ELSE 50 END;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.vokasi_web_can_read_figure(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
 SELECT auth.uid() IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.student_roster r
   WHERE r.auth_user_id=auth.uid() AND r.registration_status='registered')
 AND EXISTS (
   SELECT 1 FROM public.vokasi_web_exam_sessions s
   WHERE s.auth_user_id=auth.uid()
     AND (
        s.status='complete' OR
        (s.status='active' AND clock_timestamp() <= s.overall_deadline_at+interval '15 minutes') OR
        (s.status='prepared' AND clock_timestamp() <= s.created_at+interval '15 minutes')
     )
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(s.questions) AS item(q)
       WHERE item.q->>'image_path'=p_path
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(item.q->'options') AS opt(o)
             WHERE opt.o->>'image_path'=p_path)
     )
 )
$function$;

COMMIT;
