-- FIX: React StrictMode / refresh can call prepare twice; do not cancel a valid session.
-- Scoped to VOKASI-WEB secure sessions; preserves Android and all historic results.
-- Reuses the existing prepared/active session per student + category using transaction lock.
CREATE OR REPLACE FUNCTION public.vokasi_web_prepare_session(p_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,vokasi_private AS $$
DECLARE v_user uuid:=auth.uid(); v_group text; v_quota int; v_slice jsonb;
 v_raw jsonb:='[]'::jsonb; v_ordered jsonb:='[]'::jsonb;
 v_q jsonb; v_opts jsonb; v_clean jsonb; v_correct int; v_len int; v_assets jsonb:='[]'::jsonb;
 v_id uuid; v_version text; v_path text; opt jsonb;
 v_existing public.vokasi_web_exam_sessions%ROWTYPE;
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
 -- Calls can overlap during React development remounts, refresh, or slow image preload.
 -- Reuse exactly the same active/prepared session for the same user and category.
 -- The per-user transaction lock makes concurrent requests idempotent.
 SELECT * INTO v_existing
 FROM public.vokasi_web_exam_sessions
 WHERE auth_user_id=v_user AND bank_version=v_version
   AND practice_category IS NOT DISTINCT FROM p_category
   AND (status='active' OR
       (status='prepared' AND created_at >= clock_timestamp()-interval '15 minutes'))
 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
   FOR v_q IN SELECT value FROM jsonb_array_elements(v_existing.questions) LOOP
     IF NULLIF(v_q->>'image_path','') IS NOT NULL THEN
       v_assets=v_assets||jsonb_build_array(v_q->>'image_path');
     END IF;
     FOR opt IN SELECT value FROM jsonb_array_elements(v_q->'options') LOOP
       IF NULLIF(opt->>'image_path','') IS NOT NULL THEN
         v_assets=v_assets||jsonb_build_array(opt->>'image_path');
       END IF;
     END LOOP;
   END LOOP;
   RETURN jsonb_build_object(
     'session_id',v_existing.id,'status',v_existing.status,
     'image_paths',v_assets,'total',v_existing.question_count,'reused',true);
 END IF;
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
 IF v_len <> (CASE WHEN p_category IS NULL THEN 100 ELSE 10 END) THEN
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
