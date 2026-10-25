-- VOKASI Web question-draft workshop (October 2026)
-- ADDITIVE ONLY: does not modify Android bank, student_attempts, classes or existing auth.
-- Apply using Supabase SQL Editor in the SAME school project, as the project owner.
-- Requires the original public.is_school_admin() function to exist.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vokasi_question_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_number INTEGER CHECK (source_number IS NULL OR source_number BETWEEN 1 AND 100000),
  category TEXT NOT NULL CHECK (LENGTH(BTRIM(category)) BETWEEN 2 AND 100),
  difficulty_code TEXT,
  question TEXT NOT NULL DEFAULT '',
  question_image_path TEXT,
  options JSONB NOT NULL,
  correct_index INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 5),
  time_limit_seconds INTEGER NOT NULL DEFAULT 20 CHECK (time_limit_seconds BETWEEN 5 AND 180),
  explanation TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT question_body_present CHECK (BTRIM(question) <> '' OR question_image_path IS NOT NULL),
  CONSTRAINT question_options_count CHECK (
    jsonb_typeof(options) = 'array'
    AND jsonb_array_length(options) BETWEEN 2 AND 6
  ),
  CONSTRAINT question_correct_index CHECK (correct_index < jsonb_array_length(options))
);
CREATE INDEX IF NOT EXISTS vokasi_draft_category_idx ON public.vokasi_question_drafts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_draft_created_idx ON public.vokasi_question_drafts(created_at DESC);

ALTER TABLE public.vokasi_question_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vokasi_draft_admin_read ON public.vokasi_question_drafts;
CREATE POLICY vokasi_draft_admin_read ON public.vokasi_question_drafts
  FOR SELECT TO authenticated USING ((SELECT public.is_school_admin()));
DROP POLICY IF EXISTS vokasi_draft_admin_insert ON public.vokasi_question_drafts;
CREATE POLICY vokasi_draft_admin_insert ON public.vokasi_question_drafts
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_school_admin()) AND created_by = auth.uid());
DROP POLICY IF EXISTS vokasi_draft_admin_update ON public.vokasi_question_drafts;
CREATE POLICY vokasi_draft_admin_update ON public.vokasi_question_drafts
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_school_admin()))
  WITH CHECK ((SELECT public.is_school_admin()));
DROP POLICY IF EXISTS vokasi_draft_admin_delete ON public.vokasi_question_drafts;
CREATE POLICY vokasi_draft_admin_delete ON public.vokasi_question_drafts
  FOR DELETE TO authenticated USING ((SELECT public.is_school_admin()));
REVOKE ALL ON public.vokasi_question_drafts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vokasi_question_drafts TO authenticated;
GRANT ALL ON public.vokasi_question_drafts TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
 'vokasi-question-figures',
 'vokasi-question-figures',
 FALSE,
 3145728,
 ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS vokasi_question_figures_admin_read ON storage.objects;
CREATE POLICY vokasi_question_figures_admin_read ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id = 'vokasi-question-figures' AND (SELECT public.is_school_admin()));
DROP POLICY IF EXISTS vokasi_question_figures_admin_upload ON storage.objects;
CREATE POLICY vokasi_question_figures_admin_upload ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id = 'vokasi-question-figures' AND (SELECT public.is_school_admin())
   AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS vokasi_question_figures_admin_delete ON storage.objects;
CREATE POLICY vokasi_question_figures_admin_delete ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id = 'vokasi-question-figures' AND (SELECT public.is_school_admin()));

COMMIT;
