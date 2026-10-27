-- Read-only, admin-only diagnostics for Bank Soal review tabs.
-- Does not change active questions, drafts, exam sessions, or results.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_admin_question_health()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path='pg_catalog','public','storage'
AS $bank_health$
DECLARE
 v_row record;
 v_opt jsonb;
 v_issues text[];
 v_issue_rows jsonb:='[]'::jsonb;
 v_draft_rows jsonb:='[]'::jsonb;
 v_expected int;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
   RAISE EXCEPTION 'Hanya admin sekolah yang dapat memeriksa kualitas bank soal.';
 END IF;
 FOR v_row IN SELECT source_number AS number,NULL::uuid AS draft_id,category,difficulty_code,
  question,question_image_path,options,correct_index,time_limit_seconds
  FROM public.vokasi_web_published_questions
 LOOP
  v_issues:=ARRAY[]::text[];
  IF btrim(coalesce(v_row.question,''))='' AND v_row.question_image_path IS NULL
   THEN v_issues:=array_append(v_issues,'Pertanyaan atau gambar belum tersedia'); END IF;
  IF v_row.difficulty_code='POLA_GAMBAR' AND v_row.question_image_path IS NULL
   THEN v_issues:=array_append(v_issues,'Gambar utama belum dilampirkan'); END IF;
  IF v_row.question_image_path IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='vokasi-question-figures'
    AND o.name=v_row.question_image_path
  ) THEN v_issues:=array_append(v_issues,'File gambar soal tidak ditemukan'); END IF;
  IF jsonb_typeof(v_row.options) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_row.options) NOT BETWEEN 2 AND 6 THEN
    v_issues:=array_append(v_issues,'Pilihan jawaban belum lengkap');
  ELSE
    IF v_row.correct_index<0 OR v_row.correct_index>=jsonb_array_length(v_row.options)
     THEN v_issues:=array_append(v_issues,'Kunci jawaban tidak valid'); END IF;
    FOR v_opt IN SELECT value FROM jsonb_array_elements(v_row.options) LOOP
      IF btrim(coalesce(v_opt->>'text',''))='' AND nullif(v_opt->>'image_path','') IS NULL
       THEN v_issues:=array_append(v_issues,'Ada pilihan jawaban kosong'); EXIT; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_row.options) o
      WHERE nullif(o->>'image_path','') IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM storage.objects f WHERE f.bucket_id='vokasi-question-figures'
       AND f.name=o->>'image_path'
      )) THEN v_issues:=array_append(v_issues,'File gambar pilihan tidak ditemukan'); END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(v_row.options) o WHERE btrim(coalesce(o->>'text',''))<>'')
      <> (SELECT count(DISTINCT lower(btrim(o->>'text'))) FROM jsonb_array_elements(v_row.options) o WHERE btrim(coalesce(o->>'text',''))<>'')
     THEN v_issues:=array_append(v_issues,'Ada pilihan jawaban yang sama'); END IF;
  END IF;
  v_expected:=CASE v_row.difficulty_code
     WHEN 'HITUNG_DASAR' THEN 5 WHEN 'HITUNG_MENENGAH' THEN 10
     WHEN 'HITUNG_LANJUT' THEN 15 WHEN 'NUMERASI_CAMPURAN' THEN 30
     WHEN 'FISIKA_DASAR' THEN 35 WHEN 'LOGIKA' THEN 25
     WHEN 'POLA_GAMBAR' THEN 40 ELSE NULL END;
  IF v_expected IS NULL OR v_row.time_limit_seconds<>v_expected
   THEN v_issues:=array_append(v_issues,'Kelompok ujian atau waktu perlu diperiksa'); END IF;
  IF NOT (
    (v_row.category IN ('Perkalian','Pembagian') AND v_row.difficulty_code IN ('HITUNG_DASAR','HITUNG_MENENGAH','HITUNG_LANJUT'))
    OR (v_row.category='Fisika Dasar' AND v_row.difficulty_code='FISIKA_DASAR')
    OR (v_row.category='Numerasi Campuran' AND v_row.difficulty_code='NUMERASI_CAMPURAN')
    OR (v_row.category='Logika dan Penalaran' AND v_row.difficulty_code='LOGIKA')
    OR (v_row.category='Pola Gambar' AND v_row.difficulty_code='POLA_GAMBAR')
  ) THEN v_issues:=array_append(v_issues,'Materi dan kelompok ujian tidak sesuai'); END IF;
  IF cardinality(v_issues)>0 THEN
   v_issue_rows:=v_issue_rows||jsonb_build_array(jsonb_build_object('number',v_row.number,'reasons',to_jsonb(v_issues)));
  END IF;
 END LOOP;
 -- Inspect authoring drafts, including legacy mirrored drafts. UI hides identical published mirrors.
 FOR v_row IN SELECT id AS draft_id,source_number AS number,category,difficulty_code,
  question,question_image_path,options,correct_index,time_limit_seconds
  FROM public.vokasi_question_drafts
 LOOP
  v_issues:=ARRAY[]::text[];
  IF btrim(coalesce(v_row.question,''))='' AND v_row.question_image_path IS NULL
   THEN v_issues:=array_append(v_issues,'Pertanyaan atau gambar belum tersedia'); END IF;
  IF v_row.difficulty_code='POLA_GAMBAR' AND v_row.question_image_path IS NULL
   THEN v_issues:=array_append(v_issues,'Gambar utama belum dilampirkan'); END IF;
  IF v_row.question_image_path IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM storage.objects f WHERE f.bucket_id='vokasi-question-figures'
   AND f.name=v_row.question_image_path
  ) THEN v_issues:=array_append(v_issues,'File gambar soal tidak ditemukan'); END IF;
  IF jsonb_typeof(v_row.options) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_row.options) NOT BETWEEN 2 AND 6 THEN
   v_issues:=array_append(v_issues,'Pilihan jawaban belum lengkap');
  ELSE
   IF v_row.correct_index<0 OR v_row.correct_index>=jsonb_array_length(v_row.options)
    THEN v_issues:=array_append(v_issues,'Kunci jawaban tidak valid'); END IF;
   FOR v_opt IN SELECT value FROM jsonb_array_elements(v_row.options) LOOP
    IF btrim(coalesce(v_opt->>'text',''))='' AND nullif(v_opt->>'image_path','') IS NULL
     THEN v_issues:=array_append(v_issues,'Ada pilihan jawaban kosong'); EXIT; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_row.options) o
     WHERE nullif(o->>'image_path','') IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM storage.objects f WHERE f.bucket_id='vokasi-question-figures' AND f.name=o->>'image_path')
   ) THEN v_issues:=array_append(v_issues,'File gambar pilihan tidak ditemukan'); END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(v_row.options) o WHERE btrim(coalesce(o->>'text',''))<>'')
     <> (SELECT count(DISTINCT lower(btrim(o->>'text'))) FROM jsonb_array_elements(v_row.options) o WHERE btrim(coalesce(o->>'text',''))<>'')
   THEN v_issues:=array_append(v_issues,'Ada pilihan jawaban yang sama'); END IF;
  END IF;
  v_expected:=CASE v_row.difficulty_code
   WHEN 'HITUNG_DASAR' THEN 5 WHEN 'HITUNG_MENENGAH' THEN 10
   WHEN 'HITUNG_LANJUT' THEN 15 WHEN 'NUMERASI_CAMPURAN' THEN 30
   WHEN 'FISIKA_DASAR' THEN 35 WHEN 'LOGIKA' THEN 25
   WHEN 'POLA_GAMBAR' THEN 40 ELSE NULL END;
  IF v_expected IS NULL OR v_row.time_limit_seconds<>v_expected
   THEN v_issues:=array_append(v_issues,'Kelompok ujian atau waktu perlu diperiksa'); END IF;
  IF cardinality(v_issues)>0 THEN
   v_draft_rows:=v_draft_rows||jsonb_build_array(jsonb_build_object('id',v_row.draft_id,'reasons',to_jsonb(v_issues)));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('published',v_issue_rows,'drafts',v_draft_rows);
END;
$bank_health$;
REVOKE ALL ON FUNCTION public.vokasi_admin_question_health() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_question_health() TO authenticated;
COMMIT;
