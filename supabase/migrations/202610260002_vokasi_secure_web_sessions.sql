-- Secure VOKASI WEB quiz RPC. Additive and compatible with the existing Android APK.
-- New web results are server-graded; legacy Android submissions remain marked unverified.
BEGIN;
CREATE SCHEMA IF NOT EXISTS vokasi_private;
REVOKE ALL ON SCHEMA vokasi_private FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.vokasi_web_exam_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id),
  bank_version text NOT NULL,
  practice_category text,
  questions jsonb NOT NULL CHECK(jsonb_typeof(questions)='array'),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(answers)='array'),
  question_count integer NOT NULL CHECK(question_count IN(10,100)),
  current_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'prepared' CHECK(status IN('prepared','active','complete','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  question_started_at timestamptz,
  question_deadline_at timestamptz,
  overall_deadline_at timestamptz,
  completed_at timestamptz,
  final_score integer
);
CREATE INDEX IF NOT EXISTS vokasi_web_exam_owner ON public.vokasi_web_exam_sessions(auth_user_id,created_at DESC);
ALTER TABLE public.vokasi_web_exam_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vokasi_web_exam_sessions FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.vokasi_web_exam_sessions TO service_role;

CREATE TABLE IF NOT EXISTS public.vokasi_web_verified_results(
 session_id uuid PRIMARY KEY REFERENCES public.vokasi_web_exam_sessions(id) ON DELETE RESTRICT,
 attempt_id uuid UNIQUE REFERENCES public.student_attempts(id) ON DELETE RESTRICT,
 auth_user_id uuid NOT NULL REFERENCES auth.users(id),
 score smallint NOT NULL CHECK(score BETWEEN 0 AND 100),
 correct smallint NOT NULL,
 question_count smallint NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vokasi_web_verified_owner ON public.vokasi_web_verified_results(auth_user_id,verified_at DESC);
ALTER TABLE public.vokasi_web_verified_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vokasi_verified_read ON public.vokasi_web_verified_results;
CREATE POLICY vokasi_verified_read ON public.vokasi_web_verified_results FOR SELECT TO authenticated
 USING(auth_user_id=auth.uid() OR (SELECT public.is_school_admin()));
REVOKE ALL ON public.vokasi_web_verified_results FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vokasi_web_verified_results TO authenticated;
GRANT ALL ON public.vokasi_web_verified_results TO service_role;

-- Only school admins may read published answer keys in the REST API.
DROP POLICY IF EXISTS vokasi_web_active_student_read ON public.vokasi_web_published_questions;
CREATE POLICY vokasi_web_active_student_read ON public.vokasi_web_published_questions FOR SELECT TO authenticated
USING((SELECT public.is_school_admin()));

-- Older direct browser quiz fetch must NOT be used by students; current web will use the RPC.
-- Keep admin RPC access because the web admin/editor needs to manage question content.
REVOKE EXECUTE ON FUNCTION public.is_school_admin() FROM PUBLIC, anon;

-- An internal function constructs only sanitized response objects, NEVER the answer index.
CREATE OR REPLACE FUNCTION vokasi_private.web_view(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE; q jsonb; choices jsonb; review jsonb;
BEGIN
 SELECT * INTO s FROM public.vokasi_web_exam_sessions WHERE id=p_id AND auth_user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak tersedia.'; END IF;
 IF s.status='complete' THEN
   RETURN jsonb_build_object('session_id',s.id,'status','complete','category',s.practice_category,
     'score',s.final_score,'total',s.question_count,
     'correct',(SELECT COUNT(*) FROM jsonb_array_elements(s.answers) a WHERE a->>'status'='BENAR'),
     'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint);
 END IF;
 IF s.status='cancelled' THEN RAISE EXCEPTION 'Sesi lama telah digantikan sesi baru.'; END IF;
 IF s.status='prepared' THEN
   RETURN jsonb_build_object('session_id',s.id,'status','prepared','total',s.question_count,
       'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint);
 END IF;
 q=s.questions->s.current_index;
 SELECT coalesce(jsonb_agg(jsonb_build_object('text',c->>'text','image_path',c->>'image_path') ORDER BY n),'[]'::jsonb)
 INTO choices FROM jsonb_array_elements(q->'options') WITH ORDINALITY x(c,n);
 RETURN jsonb_build_object('session_id',s.id,'status','active','category',s.practice_category,
  'index',s.current_index,'total',s.question_count,'question',jsonb_build_object(
     'id',(q->>'id')::int,'category',q->>'category','text',q->>'question',
     'image_path',q->>'image_path','options',choices,'seconds',(q->>'seconds')::int
  ),'question_deadline_ms',(EXTRACT(EPOCH FROM s.question_deadline_at)*1000)::bigint,
  'overall_deadline_ms',(EXTRACT(EPOCH FROM s.overall_deadline_at)*1000)::bigint,
  'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint);
END; $$;
REVOKE ALL ON FUNCTION vokasi_private.web_view(uuid) FROM PUBLIC,anon,authenticated;

-- Finalize with authoritative score and persist a separately verifiable proof.
CREATE OR REPLACE FUNCTION vokasi_private.web_finish(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
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
  SELECT CASE WHEN v_correct>0 AND NOT EXISTS(
    SELECT 1 FROM public.student_attempts a
     WHERE a.auth_user_id=s.auth_user_id AND a.practice_category=s.practice_category
       AND a.earned_xp>0
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
END; $$;
REVOKE ALL ON FUNCTION vokasi_private.web_finish(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_web_prepare_session(p_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
DECLARE v_user uuid:=auth.uid(); v_group text; v_quota int; v_slice jsonb;
 v_raw jsonb:='[]'::jsonb; v_ordered jsonb:='[]'::jsonb;
 v_q jsonb; v_opts jsonb; v_clean jsonb; v_correct int; v_len int; v_assets jsonb:='[]'::jsonb;
 v_id uuid; v_version text; v_path text; opt jsonb;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.student_roster WHERE auth_user_id=v_user AND registration_status='registered'
 ) THEN RAISE EXCEPTION 'Hanya siswa yang terdaftar boleh mengerjakan latihan.'; END IF;
 SELECT version INTO v_version FROM public.vokasi_web_bank_release WHERE id=1 AND active=true;
 IF v_version IS NULL THEN RAISE EXCEPTION 'Bank soal belum aktif.'; END IF;
 IF p_category IS NOT NULL AND p_category NOT IN
 ('Perkalian','Pembagian','Numerasi Campuran','Fisika Dasar','Logika dan Penalaran','Pola Gambar')
 THEN RAISE EXCEPTION 'Kategori latihan tidak dikenal.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,511));
 IF p_category IS NULL THEN
  FOR v_group,v_quota IN SELECT * FROM (VALUES
    ('HITUNG_DASAR',30),('HITUNG_MENENGAH',20),('HITUNG_LANJUT',10),
    ('NUMERASI_CAMPURAN',10),('FISIKA_DASAR',10),('LOGIKA',10),('POLA_GAMBAR',10)
  ) AS groups(code,quota)
  LOOP
   SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO v_slice
   FROM (SELECT * FROM public.vokasi_web_published_questions
     WHERE difficulty_code=v_group ORDER BY random() LIMIT v_quota) r;
   IF jsonb_array_length(v_slice)<>v_quota THEN RAISE EXCEPTION 'Stok % tidak lengkap.',v_group; END IF;
   v_raw=v_raw||v_slice;
  END LOOP;
 ELSE
  SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO v_raw FROM (
    SELECT * FROM public.vokasi_web_published_questions
    WHERE category=p_category ORDER BY random() LIMIT 10
  ) r;
 END IF;
 SELECT COALESCE(jsonb_agg(q ORDER BY random()),'[]'::jsonb) INTO v_raw
 FROM jsonb_array_elements(v_raw) q;
 v_len=jsonb_array_length(v_raw);
 IF v_len<>CASE WHEN p_category IS NULL THEN 100 ELSE 10 END THEN
  RAISE EXCEPTION 'Jumlah soal pada kategori kurang.'; END IF;
 FOR v_q IN SELECT value FROM jsonb_array_elements(v_raw) LOOP
  SELECT jsonb_agg(jsonb_build_object('text',e->>'text','image_path',e->>'image_path',
       'original',(n-1)::int) ORDER BY random())
  INTO v_opts FROM jsonb_array_elements(v_q->'options') WITH ORDINALITY o(e,n);
  SELECT (n-1)::int INTO v_correct FROM jsonb_array_elements(v_opts) WITH ORDINALITY o(e,n)
   WHERE (e->>'original')::int=(v_q->>'correct_index')::int;
  IF v_correct IS NULL THEN RAISE EXCEPTION 'Kunci soal bermasalah.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('text',e->>'text','image_path',e->>'image_path') ORDER BY n)
  INTO v_clean FROM jsonb_array_elements(v_opts) WITH ORDINALITY o(e,n);
  v_ordered=v_ordered||jsonb_build_array(jsonb_build_object(
   'id',(v_q->>'source_number')::int,'category',v_q->>'category',
   'question',v_q->>'question','image_path',v_q->>'question_image_path',
   'options',v_clean,'answer_index',v_correct,'explanation',v_q->>'explanation',
   'seconds',(v_q->>'time_limit_seconds')::int));
  IF NULLIF(v_q->>'question_image_path','') IS NOT NULL
   THEN v_assets=v_assets||jsonb_build_array(v_q->>'question_image_path'); END IF;
  FOR opt IN SELECT value FROM jsonb_array_elements(v_clean) LOOP
   IF NULLIF(opt->>'image_path','') IS NOT NULL THEN
    v_assets=v_assets||jsonb_build_array(opt->>'image_path'); END IF;
  END LOOP;
 END LOOP;
 IF p_category IS NULL AND
  (SELECT SUM((v->>'seconds')::int) FROM jsonb_array_elements(v_ordered) v)<>1800
  THEN RAISE EXCEPTION 'Blueprint harus tepat 100 soal/1800 detik.'; END IF;
 UPDATE public.vokasi_web_exam_sessions SET status='cancelled'
 WHERE auth_user_id=v_user AND status IN ('prepared','active') AND created_at < clock_timestamp();
 INSERT INTO public.vokasi_web_exam_sessions(auth_user_id,bank_version,practice_category,questions,question_count)
 VALUES(v_user,v_version,p_category,v_ordered,v_len) RETURNING id INTO v_id;
 RETURN jsonb_build_object('session_id',v_id,'status','prepared','image_paths',v_assets,
  'total',v_len);
END; $$;
REVOKE ALL ON FUNCTION public.vokasi_web_prepare_session(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_prepare_session(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_web_begin_session(p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE; t timestamptz; q jsonb; seconds int;
BEGIN
 SELECT * INTO s FROM public.vokasi_web_exam_sessions
  WHERE id=p_session AND auth_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sesi bukan milik akun ini.'; END IF;
 IF s.status='prepared' THEN
  IF s.created_at < clock_timestamp()-interval '15 minutes' THEN
   RAISE EXCEPTION 'Persiapan sesi kedaluwarsa. Mulai lagi.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.vokasi_web_bank_release WHERE id=1 AND active=true)
    THEN RAISE EXCEPTION 'Latihan sedang dijeda admin.'; END IF;
  t=clock_timestamp();q=s.questions->0;seconds=(q->>'seconds')::int;
  UPDATE public.vokasi_web_exam_sessions SET status='active',started_at=t,
   question_started_at=t,question_deadline_at=t+make_interval(secs=>seconds),
   overall_deadline_at=t+make_interval(secs=>(SELECT SUM((x->>'seconds')::int)
      FROM jsonb_array_elements(s.questions) x))
  WHERE id=s.id;
 END IF;
 RETURN vokasi_private.web_view(p_session);
END; $$;
REVOKE ALL ON FUNCTION public.vokasi_web_begin_session(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_begin_session(uuid) TO authenticated;

-- Serialize every answer for a session and advance expired questions based on SERVER time.
CREATE OR REPLACE FUNCTION vokasi_private.web_process(p_session uuid,p_question_index int DEFAULT NULL,p_choice int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
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
    s.overall_deadline_at=s.overall_deadline_at+interval '1 second';
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
END; $$;
REVOKE ALL ON FUNCTION vokasi_private.web_process(uuid,int,int) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_web_get_quiz_state(p_session uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
 SELECT vokasi_private.web_process(p_session,NULL,NULL);
$$;
REVOKE ALL ON FUNCTION public.vokasi_web_get_quiz_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_get_quiz_state(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_web_submit_answer(p_session uuid,p_question_index int,p_choice int)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
 SELECT vokasi_private.web_process(p_session,p_question_index,p_choice);
$$;
REVOKE ALL ON FUNCTION public.vokasi_web_submit_answer(uuid,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_submit_answer(uuid,int,int) TO authenticated;

-- Releasing explanation/answer keys only when finished (study mode).
CREATE OR REPLACE FUNCTION public.vokasi_web_completed_review(p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.vokasi_web_exam_sessions
  WHERE id=p_session AND auth_user_id=auth.uid() AND status='complete';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pembahasan hanya tersedia setelah sesi selesai.'; END IF;
 RETURN (SELECT jsonb_agg(jsonb_build_object(
  'id',(q->>'id')::int,'category',q->>'category','text',q->>'question',
  'image_path',q->>'image_path','options',q->'options',
  'correct_index',(q->>'answer_index')::int,'selected_index',a->'selected_index',
  'status',a->>'status','response_seconds',(a->>'response_seconds')::int,
  'explanation',q->>'explanation'
 ) ORDER BY pos)
 FROM jsonb_array_elements(s.questions) WITH ORDINALITY qq(q,pos)
 LEFT JOIN LATERAL (SELECT value AS a FROM jsonb_array_elements(s.answers) WITH ORDINALITY a(value,ord)
   WHERE ord=pos) answers ON true);
END; $$;
REVOKE ALL ON FUNCTION public.vokasi_web_completed_review(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_completed_review(uuid) TO authenticated;

-- Storage RLS must test publication through SECURITY DEFINER now that key rows are admin-only.
CREATE OR REPLACE FUNCTION public.vokasi_web_can_read_figure(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $figure$
 SELECT auth.uid() IS NOT NULL
   AND EXISTS(SELECT 1 FROM public.student_roster r
     WHERE r.auth_user_id=auth.uid() AND r.registration_status='registered')
   AND EXISTS(SELECT 1 FROM public.vokasi_web_bank_release b WHERE b.id=1 AND b.active=true)
   AND EXISTS(SELECT 1 FROM public.vokasi_web_published_questions q
      WHERE q.question_image_path=p_path
       OR EXISTS(SELECT 1 FROM jsonb_array_elements(q.options) x
         WHERE x->>'image_path'=p_path));
$figure$;
REVOKE ALL ON FUNCTION public.vokasi_web_can_read_figure(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_can_read_figure(text) TO authenticated;
DROP POLICY IF EXISTS vokasi_published_figure_student_read ON storage.objects;
CREATE POLICY vokasi_published_figure_student_read ON storage.objects
FOR SELECT TO authenticated USING (
 bucket_id='vokasi-question-figures' AND public.vokasi_web_can_read_figure(name)
);

COMMIT;