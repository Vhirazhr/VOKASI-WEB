BEGIN;
-- Every school roster change made via the website has a server-side audit trail.
CREATE TABLE IF NOT EXISTS public.vokasi_admin_change_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 admin_auth_user_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,
 target_id uuid NOT NULL,
 before_data jsonb,
 after_data jsonb,
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vokasi_admin_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vokasi_change_log_admin_read ON public.vokasi_admin_change_log;
CREATE POLICY vokasi_change_log_admin_read ON public.vokasi_admin_change_log FOR SELECT TO authenticated
 USING((SELECT public.is_school_admin()));
REVOKE ALL ON public.vokasi_admin_change_log FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.vokasi_admin_change_log TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_create_class(p_major_id uuid,p_name text,p_grade smallint,p_year text DEFAULT '2026/2027')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_id uuid; v_name text:=btrim(p_name);
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN RAISE EXCEPTION 'Khusus admin sekolah.'; END IF;
 IF p_grade NOT IN (10,11,12) OR length(v_name)<2 OR length(v_name)>80
 OR p_year !~ '^[0-9]{4}/[0-9]{4}$'
 THEN RAISE EXCEPTION 'Nama, tingkat kelas atau tahun ajaran tidak valid.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.majors WHERE id=p_major_id AND is_active) THEN
 RAISE EXCEPTION 'Jurusan tidak ditemukan atau tidak aktif.'; END IF;
 IF EXISTS(SELECT 1 FROM public.classes WHERE major_id=p_major_id AND lower(btrim(class_name))=lower(v_name)
 AND school_year=p_year) THEN RAISE EXCEPTION 'Kelas dengan nama dan tahun ajaran tersebut sudah ada.'; END IF;
 INSERT INTO public.classes(major_id,grade_level,class_name,school_year)
 VALUES(p_major_id,p_grade,v_name,p_year) RETURNING id INTO v_id;
 INSERT INTO public.vokasi_admin_change_log(admin_auth_user_id,action,target_id,after_data)
 VALUES(auth.uid(),'create_class',v_id,jsonb_build_object('class_name',v_name,'major_id',p_major_id,'grade_level',p_grade,'school_year',p_year));
 RETURN v_id;
END $fn$;
REVOKE ALL ON FUNCTION public.vokasi_admin_create_class(uuid,text,smallint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_create_class(uuid,text,smallint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_move_student(p_roster_id uuid,p_new_class_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $fn$
DECLARE v_old record; v_target record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN RAISE EXCEPTION 'Khusus admin sekolah.'; END IF;
 SELECT id,class_id,major_id,full_name INTO v_old FROM public.student_roster
 WHERE id=p_roster_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Siswa tidak ditemukan.'; END IF;
 SELECT id,major_id,is_active INTO v_target FROM public.classes WHERE id=p_new_class_id;
 IF NOT FOUND OR NOT v_target.is_active THEN RAISE EXCEPTION 'Kelas tujuan tidak aktif atau tidak ditemukan.'; END IF;
 IF COALESCE(v_old.major_id,(SELECT major_id FROM public.classes WHERE id=v_old.class_id)) <> v_target.major_id
 THEN RAISE EXCEPTION 'Pindah jurusan membutuhkan proses administrasi tersendiri.'; END IF;
 IF v_old.class_id=p_new_class_id THEN RETURN TRUE; END IF;
 UPDATE public.student_roster SET class_id=p_new_class_id,major_id=v_target.major_id,
 updated_at=clock_timestamp() WHERE id=p_roster_id;
 INSERT INTO public.vokasi_admin_change_log(admin_auth_user_id,action,target_id,before_data,after_data)
 VALUES(auth.uid(),'move_student_class',p_roster_id,
 jsonb_build_object('class_id',v_old.class_id),
 jsonb_build_object('class_id',p_new_class_id));
 RETURN TRUE;
END $fn$;
REVOKE ALL ON FUNCTION public.vokasi_admin_move_student(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_move_student(uuid,uuid) TO authenticated;
COMMIT;
