-- Unified VOKASI question import. Deployment does not replace existing questions.
-- Existing 500-question sessions, scores and visual asset blocks remain intact.
BEGIN;

ALTER TABLE public.vokasi_web_published_questions
  DROP CONSTRAINT IF EXISTS vokasi_web_published_questions_source_number_check;
ALTER TABLE public.vokasi_web_published_questions
  ADD CONSTRAINT vokasi_web_published_questions_source_number_check
  CHECK (source_number BETWEEN 1 AND 100000);

CREATE TABLE IF NOT EXISTS public.vokasi_web_import_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 250),
  mode text NOT NULL CHECK (mode IN ('append','replace')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='array' AND jsonb_array_length(payload) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vokasi_web_import_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vokasi_web_import_drafts FROM PUBLIC,anon;
GRANT SELECT,INSERT,DELETE ON public.vokasi_web_import_drafts TO authenticated;
CREATE POLICY vokasi_web_import_admin_read ON public.vokasi_web_import_drafts
  FOR SELECT TO authenticated USING (public.is_school_admin() AND owner_id=auth.uid());
CREATE POLICY vokasi_web_import_admin_insert ON public.vokasi_web_import_drafts
  FOR INSERT TO authenticated WITH CHECK (public.is_school_admin() AND owner_id=auth.uid());
CREATE POLICY vokasi_web_import_admin_delete ON public.vokasi_web_import_drafts
  FOR DELETE TO authenticated USING (public.is_school_admin() AND owner_id=auth.uid());

CREATE TABLE IF NOT EXISTS vokasi_private.vokasi_question_import_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('append','replace')),
  before_count integer NOT NULL,
  after_count integer NOT NULL,
  previous_bank jsonb NOT NULL,
  imported_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON vokasi_private.vokasi_question_import_audit FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_import_questions(p_questions jsonb,p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='pg_catalog','public','storage'
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_count int;
  v_before int;
  v_after int;
  v_next int;
  v_idx int:=0;
  v_json jsonb;
  v_opt jsonb;
  v_options jsonb;
  v_text text;
  v_category text;
  v_group text;
  v_seconds int;
  v_correct int;
  v_question text;
  v_img text;
  v_opt_text text;
  v_opt_img text;
  v_snapshot jsonb;
  v_version text;
  v_groups jsonb:='{}'::jsonb;
  v_code text;
  v_quota int;
BEGIN
  IF v_user IS NULL OR NOT public.is_school_admin() THEN
    RAISE EXCEPTION 'Hanya administrator sekolah yang boleh mengubah bank soal.';
  END IF;
  IF p_mode NOT IN ('append','replace') OR p_mode IS NULL THEN
    RAISE EXCEPTION 'Pilih Tambahkan atau Ganti seluruh bank.';
  END IF;
  IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Data soal harus berupa daftar JSON.';
  END IF;
  v_count:=jsonb_array_length(p_questions);
  IF v_count NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Impor per paket harus 1 sampai 500 soal.';
  END IF;
  IF p_mode='replace' AND v_count<>500 THEN
    RAISE EXCEPTION 'Penggantian seluruh bank wajib berisi tepat 500 soal lengkap (ditemukan %). Bank lama tidak diubah.',v_count;
  END IF;
  PERFORM pg_advisory_xact_lock(20261026,500);
  SELECT count(*) INTO v_before FROM public.vokasi_web_published_questions;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.source_number),'[]'::jsonb)
   INTO v_snapshot FROM public.vokasi_web_published_questions t;
  IF p_mode='append' AND (v_before < 500 OR v_before+v_count>2500) THEN
    RAISE EXCEPTION 'Bank aktif belum lengkap atau kapasitas nomor soal terlampaui.';
  END IF;
  -- Validate the WHOLE incoming batch before any deletion or insert.
  FOR v_json IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    v_idx:=v_idx+1;
    v_question:=btrim(coalesce(v_json->>'question',''));
    v_category:=btrim(coalesce(v_json->>'category',''));
    v_group:=btrim(coalesce(v_json->>'difficulty_code',''));
    v_img:=nullif(btrim(coalesce(v_json->>'question_image_path','')),'');
    v_options:=v_json->'options';
    IF v_category NOT IN ('Perkalian','Pembagian','Numerasi Campuran','Fisika Dasar','Logika dan Penalaran','Pola Gambar') THEN
      RAISE EXCEPTION 'Soal %: kategori belum didukung siswa.',v_idx;
    END IF;
    v_seconds:=CASE v_group
      WHEN 'HITUNG_DASAR' THEN 5 WHEN 'HITUNG_MENENGAH' THEN 10
      WHEN 'HITUNG_LANJUT' THEN 15 WHEN 'NUMERASI_CAMPURAN' THEN 30
      WHEN 'FISIKA_DASAR' THEN 35 WHEN 'LOGIKA' THEN 25
      WHEN 'POLA_GAMBAR' THEN 40 ELSE NULL END;
    IF v_seconds IS NULL OR nullif(v_json->>'time_limit_seconds','')::int IS DISTINCT FROM v_seconds THEN
      RAISE EXCEPTION 'Soal %: kelompok atau durasi tidak sesuai blueprint.',v_idx;
    END IF;
    IF (v_question='' AND v_img IS NULL) OR length(v_question)>10000 OR jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Soal %: pertanyaan atau format pilihan tidak valid.',v_idx;
    END IF;
    IF jsonb_array_length(v_options) NOT BETWEEN 2 AND 6 THEN
      RAISE EXCEPTION 'Soal %: harus ada 2 sampai 6 opsi.',v_idx;
    END IF;
    IF nullif(v_json->>'correct_index','') IS NULL OR (v_json->>'correct_index')!~'^[0-5]$' THEN
      RAISE EXCEPTION 'Soal %: kunci jawaban A-F wajib dipilih.',v_idx;
    END IF;
    v_correct:=(v_json->>'correct_index')::int;
    IF v_correct>=jsonb_array_length(v_options) THEN
      RAISE EXCEPTION 'Soal %: indeks jawaban benar tidak ada dalam opsi.',v_idx;
    END IF;
    IF v_group='POLA_GAMBAR' AND v_img IS NULL THEN
      RAISE EXCEPTION 'Soal visual % memerlukan gambar. Gunakan editor soal untuk unggah gambar.',v_idx;
    END IF;
    IF v_img IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='vokasi-question-figures' AND o.name=v_img) THEN
      RAISE EXCEPTION 'Gambar pertanyaan soal % tidak ditemukan di Storage.',v_idx;
    END IF;
    FOR v_opt IN SELECT value FROM jsonb_array_elements(v_options) LOOP
      v_opt_text:=btrim(coalesce(v_opt->>'text',''));
      v_opt_img:=nullif(btrim(coalesce(v_opt->>'image_path','')),'');
      IF v_opt_text='' AND v_opt_img IS NULL THEN
        RAISE EXCEPTION 'Soal %: opsi jawaban kosong.',v_idx;
      END IF;
      IF v_opt_img IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='vokasi-question-figures' AND o.name=v_opt_img) THEN
        RAISE EXCEPTION 'Soal %: gambar opsi tidak ada di Storage.',v_idx;
      END IF;
    END LOOP;
    IF (
      (SELECT count(*) FROM jsonb_array_elements(v_options) e WHERE btrim(coalesce(e->>'text',''))<>'')
      <>
      (SELECT count(DISTINCT lower(btrim(e->>'text'))) FROM jsonb_array_elements(v_options) e
       WHERE btrim(coalesce(e->>'text',''))<>'')
    ) THEN
      RAISE EXCEPTION 'Soal %: opsi dengan teks berbeda posisi tetapi sama. Periksa sebelum terbit.',v_idx;
    END IF;
    v_groups:=jsonb_set(v_groups,ARRAY[v_group],to_jsonb(coalesce((v_groups->>v_group)::int,0)+1));
  END LOOP;
  IF p_mode='replace' THEN
    FOR v_code,v_quota IN
      SELECT * FROM (VALUES ('HITUNG_DASAR',30),('HITUNG_MENENGAH',20),
      ('HITUNG_LANJUT',10),('NUMERASI_CAMPURAN',10),('FISIKA_DASAR',10),
      ('LOGIKA',10),('POLA_GAMBAR',10)) AS rule(code,quota)
    LOOP
      IF coalesce((v_groups->>v_code)::int,0)<v_quota THEN
        RAISE EXCEPTION 'Ganti bank ditolak: stok % hanya %, perlu minimal %.',v_code,coalesce((v_groups->>v_code)::int,0),v_quota;
      END IF;
    END LOOP;
  END IF;
  SELECT coalesce(max(source_number),0) INTO v_next FROM public.vokasi_web_published_questions;
  IF p_mode='replace' THEN
    -- Old published rows are safely copied into the private audit, then replaced atomically.
    DELETE FROM public.vokasi_web_published_questions;
    DELETE FROM public.vokasi_question_drafts WHERE source_number BETWEEN 1 AND 500;
    v_next:=0;
  END IF;
  v_idx:=0;
  FOR v_json IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    v_idx:=v_idx+1;
    v_next:=v_next+1;
    v_options:=v_json->'options';
    INSERT INTO public.vokasi_web_published_questions(
      source_number,category,difficulty_code,question,question_image_path,
      options,correct_index,time_limit_seconds,explanation)
    VALUES(v_next,btrim(v_json->>'category'),btrim(v_json->>'difficulty_code'),
      btrim(coalesce(v_json->>'question','')),
      nullif(btrim(coalesce(v_json->>'question_image_path','')),''),
      v_options,(v_json->>'correct_index')::int,(v_json->>'time_limit_seconds')::int,
      btrim(coalesce(v_json->>'explanation','')));
    INSERT INTO public.vokasi_question_drafts(
      source_number,category,difficulty_code,question,question_image_path,
      options,correct_index,time_limit_seconds,explanation,created_by)
    VALUES(v_next,btrim(v_json->>'category'),btrim(v_json->>'difficulty_code'),
      btrim(coalesce(v_json->>'question','')),
      nullif(btrim(coalesce(v_json->>'question_image_path','')),''),
      v_options,(v_json->>'correct_index')::int,(v_json->>'time_limit_seconds')::int,
      btrim(coalesce(v_json->>'explanation','')),v_user);
  END LOOP;
  SELECT count(*) INTO v_after FROM public.vokasi_web_published_questions;
  INSERT INTO vokasi_private.vokasi_question_import_audit
     (imported_by,mode,before_count,after_count,previous_bank,imported_count)
  VALUES(v_user,p_mode,v_before,v_after,v_snapshot,v_count);
  v_version:='VOKASI-NEW-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||substr(gen_random_uuid()::text,1,8);
  UPDATE public.vokasi_web_bank_release
    SET active=true,version=v_version,published_at=clock_timestamp(),published_by=v_user
  WHERE id=1;
  RETURN jsonb_build_object('mode',p_mode,'imported',v_count,'before',v_before,'after',v_after,'version',v_version);
END;
$function$;
REVOKE ALL ON FUNCTION public.vokasi_admin_import_questions(jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_import_questions(jsonb,text) TO authenticated;
COMMIT;
