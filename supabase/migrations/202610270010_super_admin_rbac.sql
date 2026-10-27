-- One immutable owner / super administrator. Other active admins keep operational access.
-- All administrator-management mutations are verified server-side and audit logged.
BEGIN;
ALTER TABLE public.school_admins
 ADD COLUMN IF NOT EXISTS access_role text NOT NULL DEFAULT 'admin';
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.school_admins'::regclass AND conname='school_admin_access_role_check')
 THEN ALTER TABLE public.school_admins ADD CONSTRAINT school_admin_access_role_check CHECK(access_role IN ('admin','super_admin')); END IF;
END $$;
DO $$
DECLARE owner_id uuid; matches integer;
BEGIN
 SELECT count(*),min(a.user_id::text)::uuid INTO matches,owner_id
 FROM public.school_admins a JOIN auth.users u ON u.id=a.user_id
 WHERE lower(btrim(u.email))='fakhirazahra88@gmail.com' AND a.is_active AND u.deleted_at IS NULL;
 IF matches<>1 OR owner_id IS NULL THEN
  RAISE EXCEPTION 'Super Admin bootstrap refused: expected exactly one active existing account for designated email.';
 END IF;
 UPDATE public.school_admins SET access_role='admin' WHERE access_role<>'admin' AND user_id<>owner_id;
 UPDATE public.school_admins SET access_role='super_admin' WHERE user_id=owner_id;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS only_one_vokasi_super_admin
 ON public.school_admins(access_role) WHERE access_role='super_admin';

CREATE OR REPLACE FUNCTION public.vokasi_is_super_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT EXISTS(SELECT 1 FROM public.school_admins a
  WHERE a.user_id=(SELECT auth.uid()) AND a.is_active AND a.access_role='super_admin');
$$;
REVOKE ALL ON FUNCTION public.vokasi_is_super_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_is_super_admin() TO authenticated;

-- Prevent the designated super admin from being accidentally demoted, disabled,
-- or deleted by any application credential (including service role functions).
CREATE OR REPLACE FUNCTION public.vokasi_guard_super_admin() RETURNS trigger
LANGUAGE plpgsql SET search_path=''
AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.access_role='super_admin' THEN
   RAISE EXCEPTION 'Super Admin utama tidak dapat dihapus dari aplikasi.';
  END IF;
  RETURN OLD;
 END IF;
 IF OLD.access_role='super_admin' THEN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.access_role<>'super_admin' OR NOT NEW.is_active THEN
   RAISE EXCEPTION 'Akun Super Admin utama dilindungi.';
  END IF;
 ELSE
  IF NEW.access_role<>'admin' THEN
   RAISE EXCEPTION 'Role Super Admin utama tidak dapat dipindahkan lewat aplikasi.';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vokasi_protect_super_admin ON public.school_admins;
CREATE TRIGGER vokasi_protect_super_admin BEFORE UPDATE OR DELETE ON public.school_admins
 FOR EACH ROW EXECUTE FUNCTION public.vokasi_guard_super_admin();

DROP FUNCTION IF EXISTS public.vokasi_admin_list_administrators();
CREATE FUNCTION public.vokasi_admin_list_administrators()
RETURNS TABLE(user_id uuid,display_name text,email text,is_active boolean,
 access_status text,joined_at timestamptz,last_sign_in_at timestamptz,
 email_verified boolean,is_current boolean,access_role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Daftar admin hanya untuk administrator aktif.' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT
  a.user_id,coalesce(nullif(btrim(a.display_name),''),'Administrator')::text,
  coalesce(u.email,'')::text,a.is_active,
  CASE
   WHEN u.id IS NULL OR u.deleted_at IS NOT NULL THEN 'Tidak tersedia'
   WHEN NOT a.is_active THEN 'Nonaktif'
   WHEN u.banned_until IS NOT NULL AND u.banned_until>now() THEN 'Dibatasi'
   WHEN u.invited_at IS NOT NULL AND u.last_sign_in_at IS NULL THEN 'Menunggu aktivasi'
   ELSE 'Aktif'
  END::text,a.created_at,u.last_sign_in_at,u.email_confirmed_at IS NOT NULL,
  a.user_id=auth.uid(),a.access_role
 FROM public.school_admins a LEFT JOIN auth.users u ON u.id=a.user_id
 ORDER BY a.access_role='super_admin' DESC,a.is_active DESC,a.created_at ASC,a.user_id;
END;$$;
REVOKE ALL ON FUNCTION public.vokasi_admin_list_administrators() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_list_administrators() TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_super_admin_manage_account(
 p_target uuid,p_action text,p_display_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE previous public.school_admins%ROWTYPE; result jsonb; new_name text;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.vokasi_is_super_admin() THEN
  RAISE EXCEPTION 'Hanya Super Admin yang dapat mengatur akun administrator.' USING ERRCODE='42501';
 END IF;
 IF p_target IS NULL OR p_action NOT IN ('edit','activate','deactivate','remove') THEN
  RAISE EXCEPTION 'Tindakan administrasi tidak valid.';
 END IF;
 IF p_target=auth.uid() THEN
  RAISE EXCEPTION 'Akun sendiri tidak bisa diubah dari menu Manajemen Admin.';
 END IF;
 SELECT * INTO previous FROM public.school_admins WHERE user_id=p_target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Administrator tidak ditemukan. Muat ulang daftar.'; END IF;
 IF previous.access_role='super_admin' THEN
  RAISE EXCEPTION 'Super Admin utama tidak dapat dimodifikasi melalui panel ini.';
 END IF;
 CASE p_action
 WHEN 'edit' THEN
  new_name:=btrim(regexp_replace(coalesce(p_display_name,''),'[[:space:]]+',' ','g'));
  IF char_length(new_name) NOT BETWEEN 3 AND 100 THEN
   RAISE EXCEPTION 'Nama administrator harus 3 sampai 100 karakter.';
  END IF;
  UPDATE public.school_admins SET display_name=new_name WHERE user_id=p_target;
 WHEN 'activate' THEN
  UPDATE public.school_admins SET is_active=true WHERE user_id=p_target;
 WHEN 'deactivate' THEN
  UPDATE public.school_admins SET is_active=false WHERE user_id=p_target;
 WHEN 'remove' THEN
  DELETE FROM public.school_admins WHERE user_id=p_target;
 END CASE;
 SELECT to_jsonb(a) INTO result FROM public.school_admins a WHERE a.user_id=p_target;
 INSERT INTO public.vokasi_admin_change_log(admin_auth_user_id,action,target_id,before_data,after_data)
 VALUES(auth.uid(),'manage_admin_'||p_action,p_target,to_jsonb(previous),result);
 RETURN jsonb_build_object('ok',true,'action',p_action,'target',p_target);
END;$$;
REVOKE ALL ON FUNCTION public.vokasi_super_admin_manage_account(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_super_admin_manage_account(uuid,text,text) TO authenticated;
COMMIT;
