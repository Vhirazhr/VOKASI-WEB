-- Read-only administrator directory for the Pengaturan page.
-- Auth email and sign-in metadata must NEVER be fetched directly from the client.
-- Only currently active school admins may see the directory.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_admin_list_administrators()
RETURNS TABLE (
 user_id uuid,
 display_name text,
 email text,
 is_active boolean,
 access_status text,
 joined_at timestamptz,
 last_sign_in_at timestamptz,
 email_verified boolean,
 is_current boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $admin_directory$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Hanya administrator sekolah aktif yang boleh melihat daftar administrator.'
   USING ERRCODE='42501';
 END IF;
 RETURN QUERY
 SELECT
  a.user_id,
  coalesce(nullif(btrim(a.display_name),''),'Administrator')::text,
  coalesce(u.email,'')::text,
  a.is_active,
  CASE
   WHEN u.id IS NULL OR u.deleted_at IS NOT NULL THEN 'Tidak tersedia'
   WHEN NOT a.is_active THEN 'Nonaktif'
   WHEN u.banned_until IS NOT NULL AND u.banned_until>now() THEN 'Dibatasi'
   ELSE 'Aktif'
  END::text,
  a.created_at,
  u.last_sign_in_at,
  u.email_confirmed_at IS NOT NULL,
  a.user_id=auth.uid()
 FROM public.school_admins AS a
 LEFT JOIN auth.users AS u ON u.id=a.user_id
 ORDER BY a.is_active DESC,a.created_at ASC,a.user_id ASC;
END;
$admin_directory$;

REVOKE ALL ON FUNCTION public.vokasi_admin_list_administrators() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_list_administrators() TO authenticated;
COMMIT;
