-- Class directory CRUD: controlled admin-only edits and deletion.
-- Existing classes and students are untouched by this migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.vokasi_admin_update_class(
 p_class_id uuid,
 p_major_id uuid,
 p_name text,
 p_grade smallint,
 p_year text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $class_edit$
DECLARE
 v_before public.classes%ROWTYPE;
 v_name text := btrim(coalesce(p_name,''));
 v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Hanya admin sekolah yang boleh mengubah kelas.';
 END IF;
 IF p_class_id IS NULL OR p_major_id IS NULL OR p_grade NOT IN (10,11,12)
    OR length(v_name) NOT BETWEEN 2 AND 80
    OR coalesce(p_year,'') !~ '^[0-9]{4}/[0-9]{4}$'
    OR split_part(p_year,'/',2)::integer <> split_part(p_year,'/',1)::integer+1
 THEN RAISE EXCEPTION 'Lengkapi jurusan, nama kelas, tingkat, dan tahun ajaran yang valid.'; END IF;
 SELECT * INTO v_before FROM public.classes WHERE id=p_class_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kelas tidak ditemukan. Segarkan daftar kelas.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.majors WHERE id=p_major_id AND is_active)
 THEN RAISE EXCEPTION 'Jurusan tujuan tidak ditemukan atau sudah tidak aktif.'; END IF;
 SELECT count(*) INTO v_count FROM public.student_roster WHERE class_id=p_class_id;
 IF v_count>0 AND p_major_id IS DISTINCT FROM v_before.major_id THEN
  RAISE EXCEPTION 'Kelas mempunyai % siswa. Jurusan tidak bisa diubah sebelum siswa dipindahkan.',v_count;
 END IF;
 IF EXISTS(SELECT 1 FROM public.classes c WHERE c.id<>p_class_id
 AND c.major_id=p_major_id AND lower(btrim(c.class_name))=lower(v_name)
 AND c.school_year=p_year) THEN
  RAISE EXCEPTION 'Nama kelas tersebut sudah ada pada jurusan dan tahun ajaran yang sama.';
 END IF;
 UPDATE public.classes
 SET major_id=p_major_id,class_name=v_name,grade_level=p_grade,school_year=p_year
 WHERE id=p_class_id;
 INSERT INTO public.vokasi_admin_change_log(admin_auth_user_id,action,target_id,before_data,after_data)
 VALUES (auth.uid(),'update_class',p_class_id,to_jsonb(v_before),
   (SELECT to_jsonb(c) FROM public.classes c WHERE c.id=p_class_id));
 RETURN true;
END;
$class_edit$;
REVOKE ALL ON FUNCTION public.vokasi_admin_update_class(uuid,uuid,text,smallint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_update_class(uuid,uuid,text,smallint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_delete_empty_class(p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public
AS $class_delete$
DECLARE v_before public.classes%ROWTYPE; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Hanya admin sekolah yang boleh menghapus kelas.';
 END IF;
 IF p_class_id IS NULL THEN RAISE EXCEPTION 'Pilih kelas yang ingin dihapus.'; END IF;
 SELECT * INTO v_before FROM public.classes WHERE id=p_class_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Kelas tidak ditemukan. Segarkan daftar kelas.'; END IF;
 SELECT count(*) INTO v_count FROM public.student_roster WHERE class_id=p_class_id;
 IF v_count>0 THEN
  RAISE EXCEPTION 'Kelas masih memiliki % siswa. Pindahkan siswa terlebih dahulu sebelum menghapus kelas.',v_count;
 END IF;
 DELETE FROM public.classes WHERE id=p_class_id;
 INSERT INTO public.vokasi_admin_change_log(admin_auth_user_id,action,target_id,before_data)
 VALUES (auth.uid(),'delete_empty_class',p_class_id,to_jsonb(v_before));
 RETURN true;
EXCEPTION WHEN foreign_key_violation THEN
 RAISE EXCEPTION 'Kelas masih direferensikan data lain dan tidak dapat dihapus.';
END;
$class_delete$;
REVOKE ALL ON FUNCTION public.vokasi_admin_delete_empty_class(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_delete_empty_class(uuid) TO authenticated;
COMMIT;
