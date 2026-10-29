-- Ephemeral PostgreSQL integration assertions. All fixture writes are rolled back.
\set ON_ERROR_STOP on
BEGIN;

DO $test$
DECLARE
  admin_id uuid := gen_random_uuid();
  student_id uuid := gen_random_uuid();
  major_id uuid;
  class_id uuid;
BEGIN
  INSERT INTO public.app_users (id, username, display_name, password_hash)
  VALUES
    (admin_id, 'ci_super_admin', 'CI Super Admin', 'ci-only-no-login'),
    (student_id, 'ci_student', 'CI Student', 'ci-only-no-login');

  INSERT INTO public.school_admins (user_id, display_name, access_role)
  VALUES (admin_id, 'CI Super Admin', 'super_admin');

  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Anonymous identity should be NULL';
  END IF;

  -- Unauthenticated requests cannot create a major.
  BEGIN
    PERFORM public.vokasi_admin_create_major('Tidak Diizinkan', 'XX');
    RAISE EXCEPTION 'UNAUTHORIZED_ADMIN_CALL_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'UNAUTHORIZED_ADMIN_CALL_SUCCEEDED' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%admin sekolah%' THEN RAISE; END IF;
  END;

  PERFORM set_config('app.user_id', admin_id::text, true);
  IF auth.uid() IS DISTINCT FROM admin_id OR NOT public.is_school_admin()
     OR NOT public.vokasi_is_super_admin() THEN
    RAISE EXCEPTION 'Native super-admin identity and authorization failed';
  END IF;

  major_id := public.vokasi_admin_create_major('Jurusan CI', 'TC');
  class_id := public.vokasi_admin_create_class(major_id, 'X CI', 10::smallint, '2026/2027');
  IF NOT EXISTS (SELECT 1 FROM public.classes WHERE id = class_id) THEN
    RAISE EXCEPTION 'Native major/class creation failed';
  END IF;

  -- Protected administration must reject an authenticated non-admin.
  PERFORM set_config('app.user_id', student_id::text, true);
  IF public.is_school_admin() OR public.vokasi_is_super_admin() THEN
    RAISE EXCEPTION 'Student unexpectedly obtained admin permissions';
  END IF;
  BEGIN
    PERFORM public.vokasi_admin_create_major('Tidak Diizinkan', 'XY');
    RAISE EXCEPTION 'STUDENT_ADMIN_CALL_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'STUDENT_ADMIN_CALL_SUCCEEDED' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%admin sekolah%' THEN RAISE; END IF;
  END;

  -- Student without a registered roster record may not prepare an exam.
  BEGIN
    PERFORM public.vokasi_web_prepare_session(NULL::text);
    RAISE EXCEPTION 'UNREGISTERED_EXAM_CALL_SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'UNREGISTERED_EXAM_CALL_SUCCEEDED' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%siswa yang terdaftar%' THEN RAISE; END IF;
  END;

  -- Public and school leaderboard SQL must be executable on an empty result set.
  PERFORM * FROM public.vokasi_public_leaderboard();
  PERFORM * FROM public.vokasi_school_leaderboard();

  PERFORM set_config('app.user_id', '', true);
END
$test$;

ROLLBACK;
