-- Safe admin-only creation of pending roster entries and school majors.
-- Existing accounts, usernames, results, and linked auth identities are never modified.
CREATE OR REPLACE FUNCTION public.vokasi_admin_add_pending_students(p_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $vokasi$
DECLARE
  v_row jsonb; v_name text; v_username text; v_class uuid; v_year integer;
  v_class_row record; v_inserted uuid; v_count integer:=0; v_name_key text;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_school_admin() THEN
    RAISE EXCEPTION 'Hanya admin sekolah yang dapat menambah siswa.';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows)<1 OR jsonb_array_length(p_rows)>200 THEN
    RAISE EXCEPTION 'Masukkan 1 sampai 200 siswa setiap penyimpanan.';
  END IF;
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(v_row) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Format baris siswa tidak valid.';
    END IF;
    v_name:=pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(v_row->>'full_name','')),'[[:space:]]+',' ','g');
    v_name_key:=pg_catalog.lower(v_name);
    v_username:=pg_catalog.lower(pg_catalog.btrim(COALESCE(v_row->>'username','')));
    IF v_username='' THEN v_username:=NULL; END IF;
    IF pg_catalog.length(v_name)<3 OR pg_catalog.length(v_name)>120 THEN
      RAISE EXCEPTION 'Nama siswa harus berisi 3 sampai 120 karakter.';
    END IF;
    IF v_username IS NOT NULL AND v_username !~ '^[a-z0-9][a-z0-9._-]{2,39}$' THEN
      RAISE EXCEPTION 'Username harus 3-40 karakter huruf kecil, angka, titik, garis bawah atau minus.';
    END IF;
    IF COALESCE(v_row->>'class_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'ID kelas tidak valid.';
    END IF;
    v_class:=(v_row->>'class_id')::uuid;
    IF COALESCE(v_row->>'admission_year','') !~ '^[0-9]{4}$' THEN
      RAISE EXCEPTION 'Tahun angkatan harus 4 angka.';
    END IF;
    v_year:=(v_row->>'admission_year')::integer;
    IF v_year NOT BETWEEN 2000 AND 2100 THEN
      RAISE EXCEPTION 'Tahun angkatan di luar rentang yang diperbolehkan.';
    END IF;
    SELECT id,major_id,school_year INTO v_class_row
    FROM public.classes WHERE id=v_class AND is_active=TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kelas tujuan tidak ditemukan atau tidak aktif.'; END IF;
    -- Lock against two concurrent import requests creating the same student record.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_class::text||':'||v_name_key||':'||v_year::text,0));
    IF EXISTS (
      SELECT 1 FROM public.student_roster
      WHERE class_id=v_class AND admission_year=v_year
        AND pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(full_name),'[[:space:]]+',' ','g'))=v_name_key
    ) THEN RAISE EXCEPTION 'Siswa % sudah tercatat di kelas/angkatan yang sama.',v_name; END IF;
    IF v_username IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.student_roster WHERE pg_catalog.lower(pg_catalog.btrim(username))=v_username
    ) THEN RAISE EXCEPTION 'Username % sudah terpakai.',v_username; END IF;
    INSERT INTO public.student_roster(full_name,username,class_id,major_id,admission_year,
       registration_status,current_school_year,normalized_name,data_status)
    VALUES(v_name,v_username,v_class,v_class_row.major_id,v_year,
       'pending',v_class_row.school_year,v_name_key,'valid')
    RETURNING id INTO v_inserted;
    INSERT INTO public.vokasi_admin_change_log(admin_auth_user_id,action,target_id,after_data)
    VALUES((SELECT auth.uid()),'create_pending_student',v_inserted,
       pg_catalog.jsonb_build_object('name',v_name,'class_id',v_class,'admission_year',v_year));
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END
$vokasi$;
REVOKE ALL ON FUNCTION public.vokasi_admin_add_pending_students(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_add_pending_students(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_create_major(p_name text,p_code text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $vokasi$
DECLARE v_name text;v_code text;v_new uuid;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.is_school_admin() THEN
   RAISE EXCEPTION 'Hanya admin sekolah yang dapat menambah jurusan.';
 END IF;
 v_name:=pg_catalog.regexp_replace(pg_catalog.btrim(COALESCE(p_name,'')),'[[:space:]]+',' ','g');
 v_code:=pg_catalog.upper(pg_catalog.btrim(COALESCE(p_code,'')));
 IF pg_catalog.length(v_name)<3 OR pg_catalog.length(v_name)>100 THEN
   RAISE EXCEPTION 'Nama jurusan harus berisi 3-100 karakter.';
 END IF;
 IF v_code<>'' AND v_code !~ '^[A-Z0-9]{2,10}$' THEN
   RAISE EXCEPTION 'Kode jurusan harus 2-10 huruf atau angka.';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('major:'||pg_catalog.lower(v_name),0));
 IF EXISTS(SELECT 1 FROM public.majors WHERE pg_catalog.lower(pg_catalog.btrim(name))=pg_catalog.lower(v_name)) THEN
   RAISE EXCEPTION 'Jurusan sudah tercatat. Jangan buat duplikat.';
 END IF;
 IF v_code<>'' AND EXISTS(SELECT 1 FROM public.majors WHERE pg_catalog.upper(pg_catalog.btrim(code))=v_code) THEN
   RAISE EXCEPTION 'Kode jurusan sudah digunakan.';
 END IF;
 INSERT INTO public.majors(name,code) VALUES(v_name,NULLIF(v_code,'')) RETURNING id INTO v_new;
 INSERT INTO public.vokasi_admin_change_log(admin_auth_user_id,action,target_id,after_data)
 VALUES((SELECT auth.uid()),'create_major',v_new,pg_catalog.jsonb_build_object('name',v_name,'code',v_code));
 RETURN v_new;
END $vokasi$;
REVOKE ALL ON FUNCTION public.vokasi_admin_create_major(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_create_major(text,text) TO authenticated;
