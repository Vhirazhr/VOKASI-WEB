-- Safely allow admins to reclassify existing questions. No active questions are mutated by migration.
-- Maintains mandatory exam quotas and 10-question practice category availability.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_admin_edit_published_question(
 p_source_number integer, p_expected jsonb, p_change jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','storage'
AS $$
DECLARE
 v_row public.vokasi_web_published_questions%ROWTYPE;
 v_before jsonb;
 v_after jsonb;
 v_question text;
 v_img text;
 v_options jsonb;
 v_choice jsonb;
 v_choice_path text;
 v_correct integer;
 v_explanation text;
 v_category text;
 v_group text;
 v_seconds integer;
 v_remaining integer;
 v_required integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Hanya admin sekolah boleh mengedit soal.';
 END IF;
 IF p_source_number IS NULL OR jsonb_typeof(p_change) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Permintaan edit tidak valid.';
 END IF;
 PERFORM pg_advisory_xact_lock(20261026,500);
 SELECT * INTO v_row FROM public.vokasi_web_published_questions
 WHERE source_number=p_source_number FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Soal tidak ditemukan. Segarkan halaman.'; END IF;
 v_before:=to_jsonb(v_row);
 IF v_before IS DISTINCT FROM p_expected THEN
   RAISE EXCEPTION 'Soal ini sudah diperbarui oleh admin lain. Segarkan sebelum mengedit kembali.';
 END IF;
 v_question:=btrim(coalesce(p_change->>'question',''));
 v_img:=nullif(btrim(coalesce(p_change->>'question_image_path','')),'');
 v_explanation:=btrim(coalesce(p_change->>'explanation',''));
 v_category:=btrim(coalesce(p_change->>'category',''));
 v_group:=btrim(coalesce(p_change->>'difficulty_code',''));
 IF NOT (
   (v_category IN ('Perkalian','Pembagian') AND
     v_group IN ('HITUNG_DASAR','HITUNG_MENENGAH','HITUNG_LANJUT'))
   OR (v_category='Numerasi Campuran' AND v_group='NUMERASI_CAMPURAN')
   OR (v_category='Fisika Dasar' AND v_group='FISIKA_DASAR')
   OR (v_category='Logika dan Penalaran' AND v_group='LOGIKA')
   OR (v_category='Pola Gambar' AND v_group='POLA_GAMBAR')
 ) THEN
  RAISE EXCEPTION 'Materi dan kelompok ujian tidak cocok. Pilih kelompok sesuai jenis soal.';
 END IF;
 v_seconds:=CASE v_group
   WHEN 'HITUNG_DASAR' THEN 5
   WHEN 'HITUNG_MENENGAH' THEN 10
   WHEN 'HITUNG_LANJUT' THEN 15
   WHEN 'NUMERASI_CAMPURAN' THEN 30
   WHEN 'FISIKA_DASAR' THEN 35
   WHEN 'LOGIKA' THEN 25
   WHEN 'POLA_GAMBAR' THEN 40 ELSE NULL END;
 IF v_seconds IS NULL THEN RAISE EXCEPTION 'Kelompok soal tidak valid.'; END IF;
 -- Lock bank mutations with imports; a move must not starve any mandatory exam group.
 IF v_group IS DISTINCT FROM v_row.difficulty_code THEN
  SELECT count(*) INTO v_remaining FROM public.vokasi_web_published_questions
  WHERE difficulty_code=v_row.difficulty_code;
  v_required:=CASE v_row.difficulty_code
    WHEN 'HITUNG_DASAR' THEN 30 WHEN 'HITUNG_MENENGAH' THEN 20
    WHEN 'HITUNG_LANJUT' THEN 10 WHEN 'NUMERASI_CAMPURAN' THEN 10
    WHEN 'FISIKA_DASAR' THEN 10 WHEN 'LOGIKA' THEN 10
    WHEN 'POLA_GAMBAR' THEN 10 ELSE 0 END;
  IF v_remaining-1 < v_required THEN
   RAISE EXCEPTION 'Tidak bisa dipindahkan: kelompok asal membutuhkan minimal % soal untuk ujian wajib (tersisa % jika dipindahkan).',v_required,v_remaining-1;
  END IF;
 END IF;
 IF v_category IS DISTINCT FROM v_row.category THEN
  SELECT count(*) INTO v_remaining FROM public.vokasi_web_published_questions
  WHERE category=v_row.category;
  IF v_remaining-1<10 THEN
   RAISE EXCEPTION 'Tidak bisa dipindahkan: materi % harus mempunyai minimal 10 soal latihan.',v_row.category;
  END IF;
 END IF;
 v_options:=p_change->'options';
 IF length(v_question)>10000 OR length(v_explanation)>20000
   OR (v_question='' AND v_img IS NULL) THEN
  RAISE EXCEPTION 'Pertanyaan wajib memiliki teks atau gambar, maksimal 10.000 karakter.';
 END IF;
 IF jsonb_typeof(v_options) IS DISTINCT FROM 'array'
   OR jsonb_array_length(v_options) NOT BETWEEN 2 AND 6 THEN
  RAISE EXCEPTION 'Pilihan jawaban harus 2 sampai 6.';
 END IF;
 IF coalesce(p_change->>'correct_index','') !~ '^[0-5]$' THEN
  RAISE EXCEPTION 'Pilih kunci jawaban A sampai F.';
 END IF;
 v_correct:=(p_change->>'correct_index')::integer;
 IF v_correct>=jsonb_array_length(v_options) THEN
  RAISE EXCEPTION 'Kunci jawaban tidak sesuai pilihan.';
 END IF;
 IF v_group='POLA_GAMBAR' AND v_img IS NULL THEN
  RAISE EXCEPTION 'Soal pola gambar wajib memiliki gambar utama.';
 END IF;
 IF v_img IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM storage.objects WHERE bucket_id='vokasi-question-figures' AND name=v_img
 ) THEN RAISE EXCEPTION 'Gambar pertanyaan belum tersedia di Storage.'; END IF;
 FOR v_choice IN SELECT value FROM jsonb_array_elements(v_options) LOOP
   IF jsonb_typeof(v_choice) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Format pilihan jawaban tidak valid.';
   END IF;
   v_choice_path:=nullif(btrim(coalesce(v_choice->>'image_path','')),'');
   IF btrim(coalesce(v_choice->>'text',''))='' AND v_choice_path IS NULL THEN
    RAISE EXCEPTION 'Pilihan jawaban tidak boleh kosong.';
   END IF;
   IF length(coalesce(v_choice->>'text',''))>3000 THEN
    RAISE EXCEPTION 'Teks pilihan terlalu panjang.';
   END IF;
   IF v_choice_path IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id='vokasi-question-figures' AND name=v_choice_path
   ) THEN RAISE EXCEPTION 'Salah satu gambar pilihan tidak ditemukan di Storage.'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(v_options) x
   WHERE btrim(coalesce(x->>'text',''))<>'') <>
   (SELECT count(DISTINCT lower(btrim(x->>'text'))) FROM jsonb_array_elements(v_options) x
   WHERE btrim(coalesce(x->>'text',''))<>'') THEN
  RAISE EXCEPTION 'Teks pilihan tidak boleh duplikat.';
 END IF;
 -- Category and group can change, but timer is dictated by the group.
 UPDATE public.vokasi_web_published_questions
 SET category=v_category,difficulty_code=v_group,time_limit_seconds=v_seconds,
     question=v_question,question_image_path=v_img,options=v_options,
     correct_index=v_correct,explanation=v_explanation
 WHERE source_number=p_source_number;
 SELECT to_jsonb(t) INTO v_after FROM public.vokasi_web_published_questions t
 WHERE source_number=p_source_number;
 -- Synchronize only legacy drafts still identical to the published version.
 -- Leave separately edited drafts untouched.
 UPDATE public.vokasi_question_drafts d
 SET category=v_category,difficulty_code=v_group,time_limit_seconds=v_seconds,
     question=v_question,question_image_path=v_img,options=v_options,
     correct_index=v_correct,explanation=v_explanation,updated_at=clock_timestamp()
 WHERE d.source_number=p_source_number
   AND d.category=v_row.category AND d.difficulty_code=v_row.difficulty_code
   AND d.question=v_row.question AND d.question_image_path IS NOT DISTINCT FROM v_row.question_image_path
   AND d.options=v_row.options AND d.correct_index=v_row.correct_index
   AND d.time_limit_seconds=v_row.time_limit_seconds AND d.explanation=v_row.explanation;
 INSERT INTO vokasi_private.vokasi_question_edit_audit(actor_id,source_number,before_row,after_row)
 VALUES (auth.uid(),p_source_number,v_before,v_after);
 UPDATE public.vokasi_web_bank_release SET
  version='VOKASI-NEW-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||substr(gen_random_uuid()::text,1,8),
  published_at=clock_timestamp(),published_by=auth.uid()
 WHERE id=1;
 RETURN v_after;
END;$$;

REVOKE ALL ON FUNCTION public.vokasi_admin_edit_published_question(integer,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_edit_published_question(integer,jsonb,jsonb) TO authenticated;
COMMIT;
