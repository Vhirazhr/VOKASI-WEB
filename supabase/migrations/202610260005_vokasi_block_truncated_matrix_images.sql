-- Prevent publishing known truncated matrix diagrams originally sourced at 700 x 115 px.
-- Only blocks the six confirmed defective images, not valid wide diagrams.
-- An admin replaces them with complete diagrams through the draft editor.
CREATE TABLE IF NOT EXISTS public.vokasi_visual_asset_blocks (
 source_number integer PRIMARY KEY CHECK (source_number BETWEEN 451 AND 500),
 blocked_image_path text NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vokasi_visual_asset_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vokasi_visual_asset_blocks FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.vokasi_visual_asset_blocks TO service_role;
INSERT INTO public.vokasi_visual_asset_blocks(source_number,blocked_image_path,reason)
SELECT source_number,question_image_path,
 'Gambar matriks dari Word hanya 700x115 piksel; baris bawah terpotong. Ganti dengan diagram penuh.'
FROM public.vokasi_web_published_questions
WHERE source_number BETWEEN 479 AND 484 AND question_image_path IS NOT NULL
ON CONFLICT(source_number) DO NOTHING;

CREATE OR REPLACE FUNCTION public.vokasi_web_stop_broken_visual_release()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $guard$
DECLARE broken_count integer;
BEGIN
 IF NEW.active THEN
   SELECT COUNT(*) INTO broken_count
   FROM public.vokasi_visual_asset_blocks b
   JOIN public.vokasi_question_drafts q ON q.source_number=b.source_number
   WHERE q.question_image_path IS NOT DISTINCT FROM b.blocked_image_path;
   IF broken_count>0 THEN
    RAISE EXCEPTION 'Gambar matriks soal 479-484 ada yang masih terpotong (% belum diganti). Unggah gambar utuh melalui Editor soal sebelum aktivasi.',broken_count;
   END IF;
 END IF;
 RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.vokasi_web_stop_broken_visual_release() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS vokasi_web_stop_broken_visual_release ON public.vokasi_web_bank_release;
CREATE TRIGGER vokasi_web_stop_broken_visual_release BEFORE INSERT OR UPDATE ON public.vokasi_web_bank_release
FOR EACH ROW EXECUTE FUNCTION public.vokasi_web_stop_broken_visual_release();

-- Pause new starts while required diagrams are incomplete. Keep all 500 questions,
-- user accounts, attempts and verified scores intact; activation can resume after corrections.
UPDATE public.vokasi_web_bank_release SET active=FALSE WHERE id=1;
