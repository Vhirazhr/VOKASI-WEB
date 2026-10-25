-- Web-only publication of the NEW 500-question visual bank.
-- Run AFTER 202610250001_vokasi_visual_question_drafts.sql.
-- Does not touch Android, user accounts, student_attempts or historic scores.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vokasi_web_published_questions (
  source_number INTEGER PRIMARY KEY CHECK (source_number BETWEEN 1 AND 500),
  category TEXT NOT NULL,
  difficulty_code TEXT NOT NULL,
  question TEXT NOT NULL,
  question_image_path TEXT,
  options JSONB NOT NULL,
  correct_index INTEGER NOT NULL,
  time_limit_seconds INTEGER NOT NULL,
  explanation TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS public.vokasi_web_bank_release (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active BOOLEAN NOT NULL DEFAULT FALSE,
  version TEXT NOT NULL DEFAULT 'VOKASI-NEW-20261026-v1',
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.vokasi_web_bank_release(id,active) VALUES(1,FALSE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.vokasi_web_published_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vokasi_web_bank_release ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vokasi_web_active_student_read ON public.vokasi_web_published_questions;
CREATE POLICY vokasi_web_active_student_read ON public.vokasi_web_published_questions FOR SELECT TO authenticated
USING (
  (SELECT public.is_school_admin()) OR
  (EXISTS (SELECT 1 FROM public.vokasi_web_bank_release release
   WHERE release.id=1 AND release.active=TRUE)
   AND EXISTS (SELECT 1 FROM public.student_profiles p WHERE p.user_id=auth.uid()))
);
DROP POLICY IF EXISTS vokasi_web_release_read ON public.vokasi_web_bank_release;
CREATE POLICY vokasi_web_release_read ON public.vokasi_web_bank_release FOR SELECT TO authenticated
USING ((SELECT public.is_school_admin()) OR
 EXISTS (SELECT 1 FROM public.student_profiles p WHERE p.user_id=auth.uid()));
REVOKE ALL ON public.vokasi_web_published_questions,public.vokasi_web_bank_release FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vokasi_web_published_questions,public.vokasi_web_bank_release TO authenticated;
GRANT ALL ON public.vokasi_web_published_questions,public.vokasi_web_bank_release TO service_role;

CREATE OR REPLACE FUNCTION public.vokasi_web_publish_new_bank()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public,storage
AS $$
DECLARE
  bank_count INTEGER;
  group_name TEXT;
  group_count INTEGER;
  needed INTEGER;
  expected_time INTEGER;
  release_version TEXT := 'VOKASI-NEW-20261026-v1';
BEGIN
  IF NOT public.is_school_admin() THEN RAISE EXCEPTION 'Hanya admin sekolah yang boleh menerbitkan soal.'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(20261026,500);

  SELECT COUNT(*) INTO bank_count FROM public.vokasi_question_drafts WHERE source_number BETWEEN 1 AND 500;
  IF bank_count <> 500 THEN
    RAISE EXCEPTION 'Draft harus lengkap 500 soal nomor 1-500; ditemukan % soal.',bank_count;
  END IF;
  IF (SELECT COUNT(DISTINCT source_number) FROM public.vokasi_question_drafts WHERE source_number BETWEEN 1 AND 500) <> 500 THEN
    RAISE EXCEPTION 'Ada nomor draft duplikat, termasuk kemungkinan soal yang sudah diimpor dua kali.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vokasi_question_drafts
    WHERE source_number BETWEEN 1 AND 500 AND
    (BTRIM(category)='' OR (BTRIM(question)='' AND question_image_path IS NULL)
     OR jsonb_typeof(options)<>'array' OR jsonb_array_length(options) NOT BETWEEN 2 AND 6
     OR correct_index<0 OR correct_index>=jsonb_array_length(options))) THEN
    RAISE EXCEPTION 'Ada pertanyaan, kunci atau pilihan yang kosong/tidak valid.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.vokasi_question_drafts d
     WHERE d.source_number BETWEEN 1 AND 500
       AND (SELECT COUNT(*) FROM jsonb_array_elements(d.options) opt
            WHERE COALESCE(BTRIM(opt->>'text'),'')<>'' OR
                  COALESCE(NULLIF(opt->>'image_path',''),'')<>'')
           <> jsonb_array_length(d.options)) THEN
    RAISE EXCEPTION 'Ada pilihan jawaban tanpa teks dan tanpa gambar.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vokasi_question_drafts d
     WHERE d.source_number BETWEEN 1 AND 500
       AND (SELECT COUNT(*) FROM jsonb_array_elements(d.options) opt
         WHERE COALESCE(BTRIM(opt->>'text'),'')<>'')
         <> (SELECT COUNT(DISTINCT LOWER(BTRIM(opt->>'text'))) FROM jsonb_array_elements(d.options) opt
             WHERE COALESCE(BTRIM(opt->>'text'),'')<>'')) THEN
    RAISE EXCEPTION 'Ada teks pilihan jawaban yang sama. Periksa soal nomor 339 dan soal lainnya.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.vokasi_question_drafts d
    WHERE d.source_number=350 AND d.question LIKE '%4x%29%'
      AND COALESCE(d.options->d.correct_index->>'text','') <> '9'
  ) THEN
    RAISE EXCEPTION 'Soal nomor 350: 4x - 7 = 29, maka x = 9. Periksa kunci.';
  END IF;

  FOR group_name,needed,expected_time IN
    SELECT * FROM (VALUES
      ('HITUNG_DASAR',30,5),
      ('HITUNG_MENENGAH',20,10),
      ('HITUNG_LANJUT',10,15),
      ('NUMERASI_CAMPURAN',10,30),
      ('FISIKA_DASAR',10,35),
      ('LOGIKA',10,25),
      ('POLA_GAMBAR',10,40)
    ) AS rules(code,quota,seconds)
  LOOP
    SELECT COUNT(*) INTO group_count
      FROM public.vokasi_question_drafts
      WHERE source_number BETWEEN 1 AND 500
      AND difficulty_code=group_name AND time_limit_seconds=expected_time;
    IF group_count < needed THEN
      RAISE EXCEPTION 'Stok soal/timer % kurang: perlu %, ada %', group_name,needed,group_count;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.vokasi_question_drafts
    WHERE source_number BETWEEN 1 AND 500
    AND difficulty_code NOT IN ('HITUNG_DASAR','HITUNG_MENENGAH','HITUNG_LANJUT',
      'NUMERASI_CAMPURAN','FISIKA_DASAR','LOGIKA','POLA_GAMBAR')) THEN
    RAISE EXCEPTION 'Ada kode tingkat kesulitan tidak dikenal.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vokasi_question_drafts
    WHERE source_number BETWEEN 451 AND 500 AND question_image_path IS NULL) THEN
    RAISE EXCEPTION 'Ada ilustrasi soal pola gambar nomor 451-500 yang hilang.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.vokasi_question_drafts q
    WHERE q.source_number BETWEEN 1 AND 500 AND q.question_image_path IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='vokasi-question-figures' AND o.name=q.question_image_path))
    THEN RAISE EXCEPTION 'Ada file gambar soal yang tidak ditemukan di Storage.'; END IF;
  IF EXISTS (SELECT 1 FROM public.vokasi_question_drafts q
    CROSS JOIN LATERAL jsonb_array_elements(q.options) opt
    WHERE q.source_number BETWEEN 1 AND 500 AND NULLIF(opt->>'image_path','') IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='vokasi-question-figures' AND o.name=opt->>'image_path'))
    THEN RAISE EXCEPTION 'Ada file gambar pilihan jawaban yang hilang.'; END IF;

  -- Snapshot is atomic. Later changes to admin drafts cannot silently alter active questions.
  DELETE FROM public.vokasi_web_published_questions;
  INSERT INTO public.vokasi_web_published_questions (
      source_number,category,difficulty_code,question,question_image_path,
      options,correct_index,time_limit_seconds,explanation)
    SELECT source_number,category,difficulty_code,question,question_image_path,
      options,correct_index,time_limit_seconds,explanation
    FROM public.vokasi_question_drafts
    WHERE source_number BETWEEN 1 AND 500;
  INSERT INTO public.vokasi_web_bank_release(id,active,version,published_at,published_by)
    VALUES(1,TRUE,release_version,NOW(),auth.uid())
  ON CONFLICT (id) DO UPDATE SET active=TRUE,version=EXCLUDED.version,
    published_at=EXCLUDED.published_at,published_by=EXCLUDED.published_by;
  RETURN release_version;
END;
$$;
REVOKE ALL ON FUNCTION public.vokasi_web_publish_new_bank() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_publish_new_bank() TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_web_pause_bank()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public
AS $$
BEGIN
  IF NOT public.is_school_admin() THEN RAISE EXCEPTION 'Khusus admin.'; END IF;
  UPDATE public.vokasi_web_bank_release SET active=FALSE WHERE id=1;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.vokasi_web_pause_bank() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_pause_bank() TO authenticated;

-- Figures remain private: school members can view only pictures from the published snapshot.
DROP POLICY IF EXISTS vokasi_published_figure_student_read ON storage.objects;
CREATE POLICY vokasi_published_figure_student_read ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id='vokasi-question-figures'
  AND EXISTS (SELECT 1 FROM public.student_profiles p WHERE p.user_id=auth.uid())
  AND EXISTS (SELECT 1 FROM public.vokasi_web_bank_release r WHERE r.id=1 AND r.active=TRUE)
  AND EXISTS (
    SELECT 1 FROM public.vokasi_web_published_questions q
    WHERE q.question_image_path=name
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(q.options) opt WHERE opt->>'image_path'=name)
  )
);
COMMIT;
