-- Admin-only edit for published bank questions; existing data is not modified.
BEGIN;
CREATE TABLE IF NOT EXISTS vokasi_private.vokasi_question_edit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  source_number integer NOT NULL,
  before_row jsonb NOT NULL,
  after_row jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON vokasi_private.vokasi_question_edit_audit FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_get_edit_question(p_source_number integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public'
AS $$
DECLARE v_row public.vokasi_web_published_questions%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Khusus admin sekolah.';
 END IF;
 SELECT * INTO v_row FROM public.vokasi_web_published_questions WHERE source_number=p_source_number;
 IF NOT FOUND THEN RAISE EXCEPTION 'Soal sudah tidak ditemukan. Segarkan halaman.'; END IF;
 RETURN to_jsonb(v_row);
END;$$;
REVOKE ALL ON FUNCTION public.vokasi_admin_get_edit_question(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_get_edit_question(integer) TO authenticated;

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
 IF v_row.difficulty_code='POLA_GAMBAR' AND v_img IS NULL THEN
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
 -- Category, group and timer intentionally remain fixed to protect exam quotas.
 UPDATE public.vokasi_web_published_questions
 SET question=v_question,question_image_path=v_img,options=v_options,
     correct_index=v_correct,explanation=v_explanation
 WHERE source_number=p_source_number;
 SELECT to_jsonb(t) INTO v_after FROM public.vokasi_web_published_questions t
 WHERE source_number=p_source_number;
 -- Synchronize only legacy drafts still identical to the published version.
 -- Leave separately edited drafts untouched.
 UPDATE public.vokasi_question_drafts d
 SET question=v_question,question_image_path=v_img,options=v_options,
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