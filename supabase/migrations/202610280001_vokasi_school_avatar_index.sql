-- List only private photo paths belonging to registered pupils.
-- The authenticated student can subsequently sign short-lived URLs using
-- existing storage SELECT policies. No image content or emails are exposed.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_school_avatar_index()
RETURNS TABLE(username text, avatar_path text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
  SELECT r.username::text, o.name::text
  FROM public.student_roster r
  JOIN storage.objects o
    ON o.bucket_id = 'vokasi-avatars'
   AND o.name = r.username || '/avatar.jpg'
  WHERE r.registration_status = 'registered'
    AND r.username IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.student_roster caller
      WHERE caller.auth_user_id = (SELECT auth.uid())
        AND caller.registration_status = 'registered'
    )
  ORDER BY r.username
  LIMIT 2500;
$fn$;
REVOKE ALL ON FUNCTION public.vokasi_school_avatar_index() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vokasi_school_avatar_index() TO authenticated;
COMMIT;
