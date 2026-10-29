-- VOKASI native PostgreSQL business functions.
-- Source is the live VOKASI function definitions, adapted to the local auth.uid() and storage.objects compatibility layer.
-- Apply AFTER database/schema.sql, using the same database owner/runtime role for this testing setup.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_school_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.school_admins AS a
        WHERE a.user_id = auth.uid()
          AND a.is_active = TRUE
    );
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_add_pending_students(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_completed_review(p_session uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 s public.vokasi_web_exam_sessions%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Akses hanya untuk administrator aktif.';
 END IF;
 SELECT ses.* INTO s
 FROM public.vokasi_web_exam_sessions ses
 WHERE ses.id=p_session
   AND ses.status='complete'
   AND EXISTS(
     SELECT 1 FROM public.vokasi_web_verified_results vr
     WHERE vr.session_id=ses.id AND vr.auth_user_id=ses.auth_user_id
   );
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Hasil terverifikasi tidak ditemukan.';
 END IF;
 RETURN (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',(q->>'id')::integer,
   'text',q->>'question',
   'category',q->>'category',
   'image_path',q->>'image_path',
   'options',q->'options',
   'correct_index',(q->>'answer_index')::integer,
   'selected_index',a->'selected_index',
   'status',a->>'status',
   'response_seconds',(a->>'response_seconds')::integer,
   'explanation',q->>'explanation'
  ) ORDER BY pos),'[]'::jsonb)
  FROM jsonb_array_elements(s.questions) WITH ORDINALITY qq(q,pos)
  LEFT JOIN LATERAL(
    SELECT value AS a FROM jsonb_array_elements(s.answers) WITH ORDINALITY aa(value,ord)
    WHERE ord=pos
  ) joined ON true
 );
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_create_class(p_major_id uuid, p_name text, p_grade smallint, p_year text DEFAULT '2026/2027'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
END $function$

CREATE OR REPLACE FUNCTION public.vokasi_admin_create_major(p_name text, p_code text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END $function$

CREATE OR REPLACE FUNCTION public.vokasi_admin_delete_empty_class(p_class_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_edit_published_question(p_source_number integer, p_expected jsonb, p_change jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE
 v_row public.vokasi_web_published_questions%ROWTYPE;
 v_before jsonb;
 v_after jsonb;
 v_question text;
 v_img text;
 v_options jsonb;
 v_choice jsonb;
 v_choice_path text;
 v_correct integer;
 v_explanation text;
 v_category text;
 v_group text;
 v_seconds integer;
 v_remaining integer;
 v_required integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Hanya admin sekolah boleh mengedit soal.';
 END IF;
 IF p_source_number IS NULL OR jsonb_typeof(p_change) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Permintaan edit tidak valid.';
 END IF;
 PERFORM pg_advisory_xact_lock(20261026,500);
 SELECT * INTO v_row FROM public.vokasi_web_published_questions
 WHERE source_number=p_source_number FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Soal tidak ditemukan. Segarkan halaman.'; END IF;
 v_before:=to_jsonb(v_row);
 IF v_before IS DISTINCT FROM p_expected THEN
   RAISE EXCEPTION 'Soal ini sudah diperbarui oleh admin lain. Segarkan sebelum mengedit kembali.';
 END IF;
 v_question:=btrim(coalesce(p_change->>'question',''));
 v_img:=nullif(btrim(coalesce(p_change->>'question_image_path','')),'');
 v_explanation:=btrim(coalesce(p_change->>'explanation',''));
 v_category:=btrim(coalesce(p_change->>'category',''));
 v_group:=btrim(coalesce(p_change->>'difficulty_code',''));
 IF NOT (
   (v_category IN ('Perkalian','Pembagian') AND
     v_group IN ('HITUNG_DASAR','HITUNG_MENENGAH','HITUNG_LANJUT'))
   OR (v_category='Numerasi Campuran' AND v_group='NUMERASI_CAMPURAN')
   OR (v_category='Fisika Dasar' AND v_group='FISIKA_DASAR')
   OR (v_category='Logika dan Penalaran' AND v_group='LOGIKA')
   OR (v_category='Pola Gambar' AND v_group='POLA_GAMBAR')
 ) THEN
  RAISE EXCEPTION 'Materi dan kelompok ujian tidak cocok. Pilih kelompok sesuai jenis soal.';
 END IF;
 v_seconds:=CASE v_group
   WHEN 'HITUNG_DASAR' THEN 5
   WHEN 'HITUNG_MENENGAH' THEN 10
   WHEN 'HITUNG_LANJUT' THEN 15
   WHEN 'NUMERASI_CAMPURAN' THEN 30
   WHEN 'FISIKA_DASAR' THEN 35
   WHEN 'LOGIKA' THEN 25
   WHEN 'POLA_GAMBAR' THEN 40 ELSE NULL END;
 IF v_seconds IS NULL THEN RAISE EXCEPTION 'Kelompok soal tidak valid.'; END IF;
 -- Lock bank mutations with imports; a move must not starve any mandatory exam group.
 IF v_group IS DISTINCT FROM v_row.difficulty_code THEN
  SELECT count(*) INTO v_remaining FROM public.vokasi_web_published_questions
  WHERE difficulty_code=v_row.difficulty_code;
  v_required:=CASE v_row.difficulty_code
    WHEN 'HITUNG_DASAR' THEN 30 WHEN 'HITUNG_MENENGAH' THEN 20
    WHEN 'HITUNG_LANJUT' THEN 10 WHEN 'NUMERASI_CAMPURAN' THEN 10
    WHEN 'FISIKA_DASAR' THEN 10 WHEN 'LOGIKA' THEN 10
    WHEN 'POLA_GAMBAR' THEN 10 ELSE 0 END;
  IF v_remaining-1 < v_required THEN
   RAISE EXCEPTION 'Tidak bisa dipindahkan: kelompok asal membutuhkan minimal % soal untuk ujian wajib (tersisa % jika dipindahkan).',v_required,v_remaining-1;
  END IF;
 END IF;
 IF v_category IS DISTINCT FROM v_row.category THEN
  SELECT count(*) INTO v_remaining FROM public.vokasi_web_published_questions
  WHERE category=v_row.category;
  IF v_remaining-1<10 THEN
   RAISE EXCEPTION 'Tidak bisa dipindahkan: materi % harus mempunyai minimal 10 soal latihan.',v_row.category;
  END IF;
 END IF;
 v_options:=p_change->'options';
 IF length(v_question)>10000 OR length(v_explanation)>20000
   OR (v_question='' AND v_img IS NULL) THEN
  RAISE EXCEPTION 'Pertanyaan wajib memiliki teks atau gambar, maksimal 10.000 karakter.';
 END IF;
 IF jsonb_typeof(v_options) IS DISTINCT FROM 'array'
   OR jsonb_array_length(v_options) NOT BETWEEN 2 AND 6 THEN
  RAISE EXCEPTION 'Pilihan jawaban harus 2 sampai 6.';
 END IF;
 IF coalesce(p_change->>'correct_index','') !~ '^[0-5]$' THEN
  RAISE EXCEPTION 'Pilih kunci jawaban A sampai F.';
 END IF;
 v_correct:=(p_change->>'correct_index')::integer;
 IF v_correct>=jsonb_array_length(v_options) THEN
  RAISE EXCEPTION 'Kunci jawaban tidak sesuai pilihan.';
 END IF;
 IF v_group='POLA_GAMBAR' AND v_img IS NULL THEN
  RAISE EXCEPTION 'Soal pola gambar wajib memiliki gambar utama.';
 END IF;
 IF v_img IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM storage.objects WHERE bucket_id='vokasi-question-figures' AND name=v_img
 ) THEN RAISE EXCEPTION 'Gambar pertanyaan belum tersedia di Storage.'; END IF;
 FOR v_choice IN SELECT value FROM jsonb_array_elements(v_options) LOOP
   IF jsonb_typeof(v_choice) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Format pilihan jawaban tidak valid.';
   END IF;
   v_choice_path:=nullif(btrim(coalesce(v_choice->>'image_path','')),'');
   IF btrim(coalesce(v_choice->>'text',''))='' AND v_choice_path IS NULL THEN
    RAISE EXCEPTION 'Pilihan jawaban tidak boleh kosong.';
   END IF;
   IF length(coalesce(v_choice->>'text',''))>3000 THEN
    RAISE EXCEPTION 'Teks pilihan terlalu panjang.';
   END IF;
   IF v_choice_path IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id='vokasi-question-figures' AND name=v_choice_path
   ) THEN RAISE EXCEPTION 'Salah satu gambar pilihan tidak ditemukan di Storage.'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM jsonb_array_elements(v_options) x
   WHERE btrim(coalesce(x->>'text',''))<>'') <>
   (SELECT count(DISTINCT lower(btrim(x->>'text'))) FROM jsonb_array_elements(v_options) x
   WHERE btrim(coalesce(x->>'text',''))<>'') THEN
  RAISE EXCEPTION 'Teks pilihan tidak boleh duplikat.';
 END IF;
 -- Category and group can change, but timer is dictated by the group.
 UPDATE public.vokasi_web_published_questions
 SET category=v_category,difficulty_code=v_group,time_limit_seconds=v_seconds,
     question=v_question,question_image_path=v_img,options=v_options,
     correct_index=v_correct,explanation=v_explanation
 WHERE source_number=p_source_number;
 SELECT to_jsonb(t) INTO v_after FROM public.vokasi_web_published_questions t
 WHERE source_number=p_source_number;
 -- Synchronize only legacy drafts still identical to the published version.
 -- Leave separately edited drafts untouched.
 UPDATE public.vokasi_question_drafts d
 SET category=v_category,difficulty_code=v_group,time_limit_seconds=v_seconds,
     question=v_question,question_image_path=v_img,options=v_options,
     correct_index=v_correct,explanation=v_explanation,updated_at=clock_timestamp()
 WHERE d.source_number=p_source_number
   AND d.category=v_row.category AND d.difficulty_code=v_row.difficulty_code
   AND d.question=v_row.question AND d.question_image_path IS NOT DISTINCT FROM v_row.question_image_path
   AND d.options=v_row.options AND d.correct_index=v_row.correct_index
   AND d.time_limit_seconds=v_row.time_limit_seconds AND d.explanation=v_row.explanation;
 INSERT INTO vokasi_private.vokasi_question_edit_audit(actor_id,source_number,before_row,after_row)
 VALUES (auth.uid(),p_source_number,v_before,v_after);
 UPDATE public.vokasi_web_bank_release SET
  version='VOKASI-NEW-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||substr(gen_random_uuid()::text,1,8),
  published_at=clock_timestamp(),published_by=auth.uid()
 WHERE id=1;
 RETURN v_after;
END;$function$

CREATE OR REPLACE FUNCTION public.vokasi_admin_exam_activity(p_days integer DEFAULT 7, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_student uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_response jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR NOT public.is_school_admin() THEN
    RAISE EXCEPTION 'Laporan aktivitas ujian hanya dapat dilihat administrator.' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days NOT IN (1,7,30,90)
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RAISE EXCEPTION 'Filter laporan aktivitas tidak valid.';
  END IF;

  WITH base AS (
    SELECT
      e.id, e.session_id, e.auth_user_id, e.event_type, e.question_index,
      e.target_label, e.target_kind, e.detail, e.occurred_at,
      s.status AS session_status, s.practice_category,
      coalesce(nullif(btrim(r.full_name),''), nullif(btrim(r.username),''), 'Siswa') AS student_name,
      coalesce(nullif(btrim(r.username),''), '') AS username,
      coalesce(nullif(btrim(c.class_name),''), 'Kelas belum tersedia') AS class_name,
      coalesce(nullif(btrim(m.name),''), 'Jurusan belum tersedia') AS major_name
    FROM public.vokasi_web_exam_activity_events AS e
    JOIN public.vokasi_web_exam_sessions AS s ON s.id = e.session_id
    LEFT JOIN public.student_roster AS r ON r.auth_user_id = e.auth_user_id
    LEFT JOIN public.classes AS c ON c.id = r.class_id
    LEFT JOIN public.majors AS m ON m.id = c.major_id
    WHERE e.occurred_at >= pg_catalog.now() - pg_catalog.make_interval(days => p_days)
      AND (p_student IS NULL OR e.auth_user_id = p_student)
  ), student_summary AS (
    SELECT
      auth_user_id, student_name, username, class_name, major_name,
      count(*)::integer AS total_events,
      count(*) FILTER (WHERE event_type = 'tab_hidden')::integer AS tab_switches,
      count(*) FILTER (WHERE event_type IN ('copy','paste','context_menu'))::integer AS clipboard_events,
      count(*) FILTER (WHERE event_type = 'external_link')::integer AS external_links,
      count(*) FILTER (WHERE event_type IN ('ui_click','answer_option_selected'))::integer AS click_events,
      count(DISTINCT session_id)::integer AS sessions,
      max(occurred_at) AS last_event_at
    FROM base
    GROUP BY auth_user_id, student_name, username, class_name, major_name
  ), paged AS (
    SELECT * FROM base
    ORDER BY occurred_at DESC, id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT pg_catalog.jsonb_build_object(
    'total_events', (SELECT count(*) FROM base),
    'students_count', (SELECT count(*) FROM student_summary),
    'students', coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'auth_user_id', auth_user_id,
        'student_name', student_name,
        'username', username,
        'class_name', class_name,
        'major_name', major_name,
        'total_events', total_events,
        'tab_switches', tab_switches,
        'clipboard_events', clipboard_events,
        'external_links', external_links,
        'click_events', click_events,
        'sessions', sessions,
        'last_event_at', last_event_at
      ) ORDER BY total_events DESC, last_event_at DESC)
      FROM student_summary
    ), '[]'::jsonb),
    'items', coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', id,
        'session_id', session_id,
        'auth_user_id', auth_user_id,
        'student_name', student_name,
        'username', username,
        'class_name', class_name,
        'major_name', major_name,
        'event_type', event_type,
        'question_index', question_index,
        'target_label', target_label,
        'target_kind', target_kind,
        'detail', detail,
        'occurred_at', occurred_at,
        'session_status', session_status,
        'practice_category', practice_category
      ) ORDER BY occurred_at DESC, id DESC)
      FROM paged
    ), '[]'::jsonb)
  ) INTO v_response;

  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_get_edit_question(p_source_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_row public.vokasi_web_published_questions%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Khusus admin sekolah.';
 END IF;
 SELECT * INTO v_row FROM public.vokasi_web_published_questions WHERE source_number=p_source_number;
 IF NOT FOUND THEN RAISE EXCEPTION 'Soal sudah tidak ditemukan. Segarkan halaman.'; END IF;
 RETURN to_jsonb(v_row);
END;$function$

CREATE OR REPLACE FUNCTION public.vokasi_admin_get_notifications(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Akses notifikasi khusus administrator aktif.' USING ERRCODE='42501';
 END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
  RAISE EXCEPTION 'Jumlah notifikasi tidak valid.';
 END IF;
 WITH verified_events AS (
  SELECT a.id, a.completed_at_ms, a.score, a.practice_category,
   coalesce(nullif(btrim(r.full_name),''),nullif(btrim(a.name_snapshot),''),'Siswa') AS student_name,
   coalesce(nullif(c.class_name,''),nullif(a.class_snapshot,''),'Kelas belum tersedia') AS class_name,
   rd.read_at IS NOT NULL AS is_read
  FROM public.student_attempts a
  JOIN public.vokasi_web_verified_results v ON v.attempt_id=a.id AND v.auth_user_id=a.auth_user_id
  LEFT JOIN public.student_roster r ON r.auth_user_id=a.auth_user_id
  LEFT JOIN public.classes c ON c.id=r.class_id
  LEFT JOIN public.vokasi_admin_notification_reads rd ON rd.attempt_id=a.id AND rd.admin_id=auth.uid()
  WHERE a.signature LIKE 'WEB-SERVER-v1:%'
   AND a.completed_at_ms >= (extract(epoch from now()-interval '14 days')*1000)::bigint
 ), last_events AS (
  SELECT * FROM verified_events ORDER BY completed_at_ms DESC,id DESC LIMIT p_limit
 )
 SELECT jsonb_build_object(
  'unread_count',(SELECT count(*) FROM verified_events WHERE NOT is_read),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id', id,'occurred_at',to_timestamp(completed_at_ms/1000.0),
    'student_name',student_name,'class_name',class_name,'score',score,
    'practice_category',practice_category,'is_read',is_read
   ) ORDER BY completed_at_ms DESC,id DESC) FROM last_events),'[]'::jsonb)
 ) INTO v_result;
 RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_import_questions(p_questions jsonb, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE
  v_user uuid:=auth.uid();
  v_count int;
  v_before int;
  v_after int;
  v_next int;
  v_idx int:=0;
  v_json jsonb;
  v_opt jsonb;
  v_options jsonb;
  v_text text;
  v_category text;
  v_group text;
  v_seconds int;
  v_correct int;
  v_question text;
  v_img text;
  v_opt_text text;
  v_opt_img text;
  v_snapshot jsonb;
  v_version text;
  v_groups jsonb:='{}'::jsonb;
  v_code text;
  v_quota int;
BEGIN
  IF v_user IS NULL OR NOT public.is_school_admin() THEN
    RAISE EXCEPTION 'Hanya administrator sekolah yang boleh mengubah bank soal.';
  END IF;
  IF p_mode NOT IN ('append','replace') OR p_mode IS NULL THEN
    RAISE EXCEPTION 'Pilih Tambahkan atau Ganti seluruh bank.';
  END IF;
  IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Data soal harus berupa daftar JSON.';
  END IF;
  v_count:=jsonb_array_length(p_questions);
  IF v_count NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Impor per paket harus 1 sampai 500 soal.';
  END IF;
  IF p_mode='replace' AND v_count<>500 THEN
    RAISE EXCEPTION 'Penggantian seluruh bank wajib berisi tepat 500 soal lengkap (ditemukan %). Bank lama tidak diubah.',v_count;
  END IF;
  PERFORM pg_advisory_xact_lock(20261026,500);
  SELECT count(*) INTO v_before FROM public.vokasi_web_published_questions;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.source_number),'[]'::jsonb)
   INTO v_snapshot FROM public.vokasi_web_published_questions t;
  IF p_mode='append' AND (v_before < 500 OR v_before+v_count>2500) THEN
    RAISE EXCEPTION 'Bank aktif belum lengkap atau kapasitas nomor soal terlampaui.';
  END IF;
  -- Validate the WHOLE incoming batch before any deletion or insert.
  FOR v_json IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    v_idx:=v_idx+1;
    v_question:=btrim(coalesce(v_json->>'question',''));
    v_category:=btrim(coalesce(v_json->>'category',''));
    v_group:=btrim(coalesce(v_json->>'difficulty_code',''));
    v_img:=nullif(btrim(coalesce(v_json->>'question_image_path','')),'');
    v_options:=v_json->'options';
    IF v_category NOT IN ('Perkalian','Pembagian','Numerasi Campuran','Fisika Dasar','Logika dan Penalaran','Pola Gambar') THEN
      RAISE EXCEPTION 'Soal %: kategori belum didukung siswa.',v_idx;
    END IF;
    v_seconds:=CASE v_group
      WHEN 'HITUNG_DASAR' THEN 5 WHEN 'HITUNG_MENENGAH' THEN 10
      WHEN 'HITUNG_LANJUT' THEN 15 WHEN 'NUMERASI_CAMPURAN' THEN 30
      WHEN 'FISIKA_DASAR' THEN 35 WHEN 'LOGIKA' THEN 25
      WHEN 'POLA_GAMBAR' THEN 40 ELSE NULL END;
    IF v_seconds IS NULL OR nullif(v_json->>'time_limit_seconds','')::int IS DISTINCT FROM v_seconds THEN
      RAISE EXCEPTION 'Soal %: kelompok atau durasi tidak sesuai blueprint.',v_idx;
    END IF;
    IF (v_question='' AND v_img IS NULL) OR length(v_question)>10000 OR jsonb_typeof(v_options) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Soal %: pertanyaan atau format pilihan tidak valid.',v_idx;
    END IF;
    IF jsonb_array_length(v_options) NOT BETWEEN 2 AND 6 THEN
      RAISE EXCEPTION 'Soal %: harus ada 2 sampai 6 opsi.',v_idx;
    END IF;
    IF nullif(v_json->>'correct_index','') IS NULL OR (v_json->>'correct_index')!~'^[0-5]$' THEN
      RAISE EXCEPTION 'Soal %: kunci jawaban A-F wajib dipilih.',v_idx;
    END IF;
    v_correct:=(v_json->>'correct_index')::int;
    IF v_correct>=jsonb_array_length(v_options) THEN
      RAISE EXCEPTION 'Soal %: indeks jawaban benar tidak ada dalam opsi.',v_idx;
    END IF;
    IF v_group='POLA_GAMBAR' AND v_img IS NULL THEN
      RAISE EXCEPTION 'Soal visual % memerlukan gambar. Gunakan editor soal untuk unggah gambar.',v_idx;
    END IF;
    IF v_img IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='vokasi-question-figures' AND o.name=v_img) THEN
      RAISE EXCEPTION 'Gambar pertanyaan soal % tidak ditemukan di Storage.',v_idx;
    END IF;
    FOR v_opt IN SELECT value FROM jsonb_array_elements(v_options) LOOP
      v_opt_text:=btrim(coalesce(v_opt->>'text',''));
      v_opt_img:=nullif(btrim(coalesce(v_opt->>'image_path','')),'');
      IF v_opt_text='' AND v_opt_img IS NULL THEN
        RAISE EXCEPTION 'Soal %: opsi jawaban kosong.',v_idx;
      END IF;
      IF v_opt_img IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='vokasi-question-figures' AND o.name=v_opt_img) THEN
        RAISE EXCEPTION 'Soal %: gambar opsi tidak ada di Storage.',v_idx;
      END IF;
    END LOOP;
    IF (
      (SELECT count(*) FROM jsonb_array_elements(v_options) e WHERE btrim(coalesce(e->>'text',''))<>'')
      <>
      (SELECT count(DISTINCT lower(btrim(e->>'text'))) FROM jsonb_array_elements(v_options) e
       WHERE btrim(coalesce(e->>'text',''))<>'')
    ) THEN
      RAISE EXCEPTION 'Soal %: opsi dengan teks berbeda posisi tetapi sama. Periksa sebelum terbit.',v_idx;
    END IF;
    v_groups:=jsonb_set(v_groups,ARRAY[v_group],to_jsonb(coalesce((v_groups->>v_group)::int,0)+1));
  END LOOP;
  IF p_mode='replace' THEN
    FOR v_code,v_quota IN
      SELECT * FROM (VALUES ('HITUNG_DASAR',30),('HITUNG_MENENGAH',20),
      ('HITUNG_LANJUT',10),('NUMERASI_CAMPURAN',10),('FISIKA_DASAR',10),
      ('LOGIKA',10),('POLA_GAMBAR',10)) AS rule(code,quota)
    LOOP
      IF coalesce((v_groups->>v_code)::int,0)<v_quota THEN
        RAISE EXCEPTION 'Ganti bank ditolak: stok % hanya %, perlu minimal %.',v_code,coalesce((v_groups->>v_code)::int,0),v_quota;
      END IF;
    END LOOP;
  END IF;
  SELECT coalesce(max(source_number),0) INTO v_next FROM public.vokasi_web_published_questions;
  IF p_mode='replace' THEN
    -- Old published rows are safely copied into the private audit, then replaced atomically.
    DELETE FROM public.vokasi_web_published_questions;
    DELETE FROM public.vokasi_question_drafts WHERE source_number BETWEEN 1 AND 500;
    v_next:=0;
  END IF;
  v_idx:=0;
  FOR v_json IN SELECT value FROM jsonb_array_elements(p_questions) LOOP
    v_idx:=v_idx+1;
    v_next:=v_next+1;
    v_options:=v_json->'options';
    INSERT INTO public.vokasi_web_published_questions(
      source_number,category,difficulty_code,question,question_image_path,
      options,correct_index,time_limit_seconds,explanation)
    VALUES(v_next,btrim(v_json->>'category'),btrim(v_json->>'difficulty_code'),
      btrim(coalesce(v_json->>'question','')),
      nullif(btrim(coalesce(v_json->>'question_image_path','')),''),
      v_options,(v_json->>'correct_index')::int,(v_json->>'time_limit_seconds')::int,
      btrim(coalesce(v_json->>'explanation','')));
    INSERT INTO public.vokasi_question_drafts(
      source_number,category,difficulty_code,question,question_image_path,
      options,correct_index,time_limit_seconds,explanation,created_by)
    VALUES(v_next,btrim(v_json->>'category'),btrim(v_json->>'difficulty_code'),
      btrim(coalesce(v_json->>'question','')),
      nullif(btrim(coalesce(v_json->>'question_image_path','')),''),
      v_options,(v_json->>'correct_index')::int,(v_json->>'time_limit_seconds')::int,
      btrim(coalesce(v_json->>'explanation','')),v_user);
  END LOOP;
  SELECT count(*) INTO v_after FROM public.vokasi_web_published_questions;
  INSERT INTO vokasi_private.vokasi_question_import_audit
     (imported_by,mode,before_count,after_count,previous_bank,imported_count)
  VALUES(v_user,p_mode,v_before,v_after,v_snapshot,v_count);
  v_version:='VOKASI-NEW-'||to_char(clock_timestamp(),'YYYYMMDDHH24MISS')||'-'||substr(gen_random_uuid()::text,1,8);
  UPDATE public.vokasi_web_bank_release
    SET active=true,version=v_version,published_at=clock_timestamp(),published_by=v_user
  WHERE id=1;
  RETURN jsonb_build_object('mode',p_mode,'imported',v_count,'before',v_before,'after',v_after,'version',v_version);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_list_administrators()
 RETURNS TABLE(user_id uuid, display_name text, email text, is_active boolean, access_status text, joined_at timestamp with time zone, last_sign_in_at timestamp with time zone, email_verified boolean, is_current boolean, access_role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END;$function$

CREATE OR REPLACE FUNCTION public.vokasi_admin_mark_notifications_read(p_attempt_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count integer;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Akses notifikasi khusus administrator aktif.' USING ERRCODE='42501';
 END IF;
 IF p_attempt_ids IS NOT NULL AND cardinality(p_attempt_ids)>50 THEN
  RAISE EXCEPTION 'Maksimal 50 notifikasi per permintaan.';
 END IF;
 WITH inserted AS (
  INSERT INTO public.vokasi_admin_notification_reads(admin_id,attempt_id)
  SELECT auth.uid(),a.id
  FROM public.student_attempts a
  JOIN public.vokasi_web_verified_results v ON v.attempt_id=a.id AND v.auth_user_id=a.auth_user_id
  WHERE a.signature LIKE 'WEB-SERVER-v1:%'
    AND a.completed_at_ms >= (extract(epoch from now()-interval '14 days')*1000)::bigint
    AND (p_attempt_ids IS NULL OR a.id=ANY(p_attempt_ids))
  ON CONFLICT DO NOTHING RETURNING 1
 )
 SELECT count(*) INTO v_count FROM inserted;
 RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_monitor_activity(p_kind text DEFAULT 'all'::text, p_days integer DEFAULT 30, p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_response jsonb;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Log aktivitas hanya dapat dilihat administrator aktif.' USING ERRCODE='42501';
 END IF;
 IF p_kind IS NULL OR p_kind NOT IN ('all','mandatory','practice','admin') OR
    p_days IS NULL OR p_days NOT IN (7,30,90) OR
    p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR
    p_offset IS NULL OR p_offset<0 OR p_offset>10000 THEN
  RAISE EXCEPTION 'Filter atau halaman log tidak valid.';
 END IF;
 WITH feed AS (
  SELECT ('attempt:'||a.id::text) AS event_id,
    CASE WHEN a.practice_category IS NULL THEN 'mandatory' ELSE 'practice' END AS kind,
    CASE WHEN a.practice_category IS NULL THEN 'Latihan wajib selesai'
     ELSE 'Latihan mandiri selesai' END AS event_title,
    coalesce(nullif(btrim(r.full_name),''),nullif(btrim(a.name_snapshot),''),'Siswa') AS actor,
    coalesce(nullif(c.class_name,''),nullif(a.class_snapshot,''),'Kelas belum tersedia') AS class_name,
    CASE WHEN a.practice_category IS NULL THEN '100 soal wajib'
     ELSE coalesce(nullif(a.practice_category,''),'Latihan mandiri') END AS detail,
    to_timestamp(a.completed_at_ms/1000.0) AS occurred_at, a.score::int AS score
  FROM public.student_attempts a
  JOIN public.vokasi_web_verified_results vr ON vr.attempt_id=a.id AND vr.auth_user_id=a.auth_user_id
  LEFT JOIN public.student_roster r ON r.auth_user_id=a.auth_user_id
  LEFT JOIN public.classes c ON c.id=r.class_id
  WHERE a.signature LIKE 'WEB-SERVER-v1:%'
   AND a.completed_at_ms >= (extract(epoch from now()-(p_days||' days')::interval)*1000)::bigint
   AND p_kind IN ('all',CASE WHEN a.practice_category IS NULL THEN 'mandatory' ELSE 'practice' END)
  UNION ALL
  SELECT ('admin:'||l.id::text),'admin','Perubahan data sekolah',
   coalesce(nullif(ad.display_name,''),'Administrator'),'—',
   replace(l.action,'_',' '),l.changed_at,NULL::integer
  FROM public.vokasi_admin_change_log l
  LEFT JOIN public.school_admins ad ON ad.user_id=l.admin_auth_user_id
  WHERE l.changed_at >= now()-(p_days||' days')::interval
   AND p_kind IN ('all','admin')
  UNION ALL
  SELECT ('edit:'||q.id::text),'admin','Soal bank diperbarui',
   coalesce(nullif(ad.display_name,''),'Administrator'),'—',
   'Soal #'||q.source_number::text,q.changed_at,NULL::integer
  FROM vokasi_private.vokasi_question_edit_audit q
  LEFT JOIN public.school_admins ad ON ad.user_id=q.actor_id
  WHERE q.changed_at >= now()-(p_days||' days')::interval
   AND p_kind IN ('all','admin')
 ), paged AS (
  SELECT * FROM feed ORDER BY occurred_at DESC,event_id DESC LIMIT p_limit OFFSET p_offset
 )
 SELECT jsonb_build_object(
  'total',(SELECT count(*) FROM feed),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',event_id,'kind',kind,'title',event_title,'actor',actor,
    'class_name',class_name,'detail',detail,'occurred_at',occurred_at,'score',score
  ) ORDER BY occurred_at DESC,event_id DESC) FROM paged),'[]'::jsonb)
 ) INTO v_response;
 RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_move_student(p_roster_id uuid, p_new_class_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
END $function$

CREATE OR REPLACE FUNCTION public.vokasi_admin_question_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE
 v_row record;
 v_opt jsonb;
 v_issues text[];
 v_issue_rows jsonb:='[]'::jsonb;
 v_draft_rows jsonb:='[]'::jsonb;
 v_expected int;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
   RAISE EXCEPTION 'Hanya admin sekolah yang dapat memeriksa kualitas bank soal.';
 END IF;
 FOR v_row IN SELECT source_number AS number,NULL::uuid AS draft_id,category,difficulty_code,
  question,question_image_path,options,correct_index,time_limit_seconds
  FROM public.vokasi_web_published_questions
 LOOP
  v_issues:=ARRAY[]::text[];
  IF btrim(coalesce(v_row.question,''))='' AND v_row.question_image_path IS NULL
   THEN v_issues:=array_append(v_issues,'Pertanyaan atau gambar belum tersedia'); END IF;
  IF v_row.difficulty_code='POLA_GAMBAR' AND v_row.question_image_path IS NULL
   THEN v_issues:=array_append(v_issues,'Gambar utama belum dilampirkan'); END IF;
  IF v_row.question_image_path IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM storage.objects o WHERE o.bucket_id='vokasi-question-figures'
    AND o.name=v_row.question_image_path
  ) THEN v_issues:=array_append(v_issues,'File gambar soal tidak ditemukan'); END IF;
  IF jsonb_typeof(v_row.options) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_row.options) NOT BETWEEN 2 AND 6 THEN
    v_issues:=array_append(v_issues,'Pilihan jawaban belum lengkap');
  ELSE
    IF v_row.correct_index<0 OR v_row.correct_index>=jsonb_array_length(v_row.options)
     THEN v_issues:=array_append(v_issues,'Kunci jawaban tidak valid'); END IF;
    FOR v_opt IN SELECT value FROM jsonb_array_elements(v_row.options) LOOP
      IF btrim(coalesce(v_opt->>'text',''))='' AND nullif(v_opt->>'image_path','') IS NULL
       THEN v_issues:=array_append(v_issues,'Ada pilihan jawaban kosong'); EXIT; END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_row.options) o
      WHERE nullif(o->>'image_path','') IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM storage.objects f WHERE f.bucket_id='vokasi-question-figures'
       AND f.name=o->>'image_path'
      )) THEN v_issues:=array_append(v_issues,'File gambar pilihan tidak ditemukan'); END IF;
    IF (SELECT count(*) FROM jsonb_array_elements(v_row.options) o WHERE btrim(coalesce(o->>'text',''))<>'')
      <> (SELECT count(DISTINCT lower(btrim(o->>'text'))) FROM jsonb_array_elements(v_row.options) o WHERE btrim(coalesce(o->>'text',''))<>'')
     THEN v_issues:=array_append(v_issues,'Ada pilihan jawaban yang sama'); END IF;
  END IF;
  v_expected:=CASE v_row.difficulty_code
     WHEN 'HITUNG_DASAR' THEN 5 WHEN 'HITUNG_MENENGAH' THEN 10
     WHEN 'HITUNG_LANJUT' THEN 15 WHEN 'NUMERASI_CAMPURAN' THEN 30
     WHEN 'FISIKA_DASAR' THEN 35 WHEN 'LOGIKA' THEN 25
     WHEN 'POLA_GAMBAR' THEN 40 ELSE NULL END;
  IF v_expected IS NULL OR v_row.time_limit_seconds<>v_expected
   THEN v_issues:=array_append(v_issues,'Kelompok ujian atau waktu perlu diperiksa'); END IF;
  IF NOT (
    (v_row.category IN ('Perkalian','Pembagian') AND v_row.difficulty_code IN ('HITUNG_DASAR','HITUNG_MENENGAH','HITUNG_LANJUT'))
    OR (v_row.category='Fisika Dasar' AND v_row.difficulty_code='FISIKA_DASAR')
    OR (v_row.category='Numerasi Campuran' AND v_row.difficulty_code='NUMERASI_CAMPURAN')
    OR (v_row.category='Logika dan Penalaran' AND v_row.difficulty_code='LOGIKA')
    OR (v_row.category='Pola Gambar' AND v_row.difficulty_code='POLA_GAMBAR')
  ) THEN v_issues:=array_append(v_issues,'Materi dan kelompok ujian tidak sesuai'); END IF;
  IF cardinality(v_issues)>0 THEN
   v_issue_rows:=v_issue_rows||jsonb_build_array(jsonb_build_object('number',v_row.number,'reasons',to_jsonb(v_issues)));
  END IF;
 END LOOP;
 -- Inspect authoring drafts, including legacy mirrored drafts. UI hides identical published mirrors.
 FOR v_row IN SELECT id AS draft_id,source_number AS number,category,difficulty_code,
  question,question_image_path,options,correct_index,time_limit_seconds
  FROM public.vokasi_question_drafts
 LOOP
  v_issues:=ARRAY[]::text[];
  IF btrim(coalesce(v_row.question,''))='' AND v_row.question_image_path IS NULL
   THEN v_issues:=array_append(v_issues,'Pertanyaan atau gambar belum tersedia'); END IF;
  IF v_row.difficulty_code='POLA_GAMBAR' AND v_row.question_image_path IS NULL
   THEN v_issues:=array_append(v_issues,'Gambar utama belum dilampirkan'); END IF;
  IF v_row.question_image_path IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM storage.objects f WHERE f.bucket_id='vokasi-question-figures'
   AND f.name=v_row.question_image_path
  ) THEN v_issues:=array_append(v_issues,'File gambar soal tidak ditemukan'); END IF;
  IF jsonb_typeof(v_row.options) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_row.options) NOT BETWEEN 2 AND 6 THEN
   v_issues:=array_append(v_issues,'Pilihan jawaban belum lengkap');
  ELSE
   IF v_row.correct_index<0 OR v_row.correct_index>=jsonb_array_length(v_row.options)
    THEN v_issues:=array_append(v_issues,'Kunci jawaban tidak valid'); END IF;
   FOR v_opt IN SELECT value FROM jsonb_array_elements(v_row.options) LOOP
    IF btrim(coalesce(v_opt->>'text',''))='' AND nullif(v_opt->>'image_path','') IS NULL
     THEN v_issues:=array_append(v_issues,'Ada pilihan jawaban kosong'); EXIT; END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_row.options) o
     WHERE nullif(o->>'image_path','') IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM storage.objects f WHERE f.bucket_id='vokasi-question-figures' AND f.name=o->>'image_path')
   ) THEN v_issues:=array_append(v_issues,'File gambar pilihan tidak ditemukan'); END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(v_row.options) o WHERE btrim(coalesce(o->>'text',''))<>'')
     <> (SELECT count(DISTINCT lower(btrim(o->>'text'))) FROM jsonb_array_elements(v_row.options) o WHERE btrim(coalesce(o->>'text',''))<>'')
   THEN v_issues:=array_append(v_issues,'Ada pilihan jawaban yang sama'); END IF;
  END IF;
  v_expected:=CASE v_row.difficulty_code
   WHEN 'HITUNG_DASAR' THEN 5 WHEN 'HITUNG_MENENGAH' THEN 10
   WHEN 'HITUNG_LANJUT' THEN 15 WHEN 'NUMERASI_CAMPURAN' THEN 30
   WHEN 'FISIKA_DASAR' THEN 35 WHEN 'LOGIKA' THEN 25
   WHEN 'POLA_GAMBAR' THEN 40 ELSE NULL END;
  IF v_expected IS NULL OR v_row.time_limit_seconds<>v_expected
   THEN v_issues:=array_append(v_issues,'Kelompok ujian atau waktu perlu diperiksa'); END IF;
  IF cardinality(v_issues)>0 THEN
   v_draft_rows:=v_draft_rows||jsonb_build_array(jsonb_build_object('id',v_row.draft_id,'reasons',to_jsonb(v_issues)));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('published',v_issue_rows,'drafts',v_draft_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_student_history(p_student uuid, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Akses hanya untuk administrator aktif.';
 END IF;
 IF p_student IS NULL OR p_limit < 1 OR p_limit > 100 THEN
  RAISE EXCEPTION 'Parameter permintaan tidak valid.';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.student_roster
  WHERE auth_user_id=p_student AND registration_status='registered'
 ) THEN RETURN '[]'::jsonb; END IF;
 RETURN (
  WITH tagged AS (
   SELECT r.session_key,r.completed_at_ms,r.score,r.correct,r.question_count,r.practice_category,
     (row_number() OVER (
       PARTITION BY (to_timestamp(r.completed_at_ms/1000.0) AT TIME ZONE 'Asia/Jakarta')::date
       ORDER BY r.completed_at_ms ASC,r.id ASC
     )=1) AS official
   FROM public.vokasi_verified_attempts r
   WHERE r.auth_user_id=p_student AND r.practice_category IS NULL
  ), recent AS (
   SELECT * FROM tagged ORDER BY completed_at_ms DESC LIMIT p_limit
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'session_key',r.session_key,
    'completed_at_ms',r.completed_at_ms,
    'score',r.score,'correct',r.correct,'question_count',r.question_count,
    'practice_category',r.practice_category,'is_official',r.official
  ) ORDER BY r.completed_at_ms DESC),'[]'::jsonb)
  FROM recent r
 );
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_admin_update_class(p_class_id uuid, p_major_id uuid, p_name text, p_grade smallint, p_year text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.school_admins a
  WHERE a.user_id=(SELECT auth.uid()) AND a.is_active AND a.access_role='super_admin');
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_public_leaderboard()
 RETURNS TABLE(rank bigint, display_name text, classroom text, mandatory_average integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT
    scores.rank,
    regexp_replace(
      COALESCE(scores.display_name, 'Siswa'),
      '(^|[[:space:]])([^[:space:]])[^[:space:]]*',
      E'\\1\\2*****',
      'g'
    ) AS display_name,
    scores.classroom,
    scores.mandatory_average
  FROM vokasi_landing_private.top_school_scores() AS scores
  ORDER BY scores.rank;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_school_avatar_index()
 RETURNS TABLE(username text, avatar_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_school_leaderboard()
 RETURNS TABLE(username text, display_name text, major text, classroom text, season_xp bigint, lifetime_xp bigint, streak bigint, mandatory_average integer, mandatory_days bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH local_today AS (
  SELECT (NOW() AT TIME ZONE 'Asia/Jakarta')::date AS today
), attempts_local AS (
  SELECT a.auth_user_id, a.earned_xp, a.answered, a.score, a.practice_category,
         a.completed_at_ms, a.session_key,
         (TO_TIMESTAMP(a.completed_at_ms / 1000.0)
            AT TIME ZONE 'Asia/Jakarta')::date AS practice_day
  FROM public.vokasi_verified_attempts AS a
), earned AS (
  SELECT a.auth_user_id,
    COALESCE(SUM(a.earned_xp) FILTER (
      WHERE a.practice_day >=
        DATE_TRUNC('quarter', NOW() AT TIME ZONE 'Asia/Jakarta')::date
    ), 0)::bigint AS season_points,
    COALESCE(SUM(a.earned_xp), 0)::bigint AS lifetime_points
  FROM attempts_local AS a
  GROUP BY a.auth_user_id
), practice_days AS (
  SELECT DISTINCT auth_user_id, practice_day AS d
  FROM attempts_local WHERE answered > 0
), indexed_days AS (
  SELECT p.auth_user_id, p.d,
    MAX(p.d) OVER (PARTITION BY p.auth_user_id) AS latest_day,
    (ROW_NUMBER() OVER (
      PARTITION BY p.auth_user_id ORDER BY p.d DESC
    ) - 1)::integer AS day_index
  FROM practice_days AS p
), streaks AS (
  SELECT n.auth_user_id,
    CASE WHEN MAX(n.latest_day) >= (SELECT today - 1 FROM local_today)
      THEN COUNT(*) FILTER (WHERE n.d = n.latest_day - n.day_index)::bigint
      ELSE 0::bigint END AS streak_days
  FROM indexed_days AS n
  GROUP BY n.auth_user_id
), compulsory_latest AS (
  SELECT a.auth_user_id, a.score, a.practice_day,
    ROW_NUMBER() OVER (
      PARTITION BY a.auth_user_id, a.practice_day
      ORDER BY a.completed_at_ms ASC, a.session_key ASC
    ) AS attempt_rank
  FROM attempts_local AS a
  WHERE a.practice_category IS NULL
    AND a.practice_day >=
      DATE_TRUNC('quarter', NOW() AT TIME ZONE 'Asia/Jakarta')::date
), mandatory_scores AS (
  SELECT auth_user_id,
    ROUND(AVG(score))::integer AS avg_score,
    COUNT(*)::bigint AS completed_days
  FROM compulsory_latest
  WHERE attempt_rank = 1
  GROUP BY auth_user_id
)
SELECT r.username,
  CONCAT_WS(' ', SPLIT_PART(BTRIM(r.full_name), ' ', 1),
    NULLIF(SPLIT_PART(BTRIM(r.full_name), ' ', 2), '')) AS display_name,
  m.name AS major,
  c.class_name AS classroom,
  e.season_points AS season_xp,
  e.lifetime_points AS lifetime_xp,
  COALESCE(s.streak_days, 0)::bigint AS streak,
  ms.avg_score AS mandatory_average,
  COALESCE(ms.completed_days, 0)::bigint AS mandatory_days
FROM public.student_roster AS r
JOIN earned AS e ON e.auth_user_id = r.auth_user_id
JOIN public.classes AS c ON c.id = r.class_id
JOIN public.majors AS m ON m.id = c.major_id
LEFT JOIN streaks AS s ON s.auth_user_id = r.auth_user_id
LEFT JOIN mandatory_scores AS ms ON ms.auth_user_id = r.auth_user_id
WHERE r.registration_status = 'registered'
  AND r.username IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.student_roster AS caller
    WHERE caller.auth_user_id = (SELECT auth.uid())
      AND caller.registration_status = 'registered'
  )
ORDER BY e.season_points DESC, r.username
LIMIT 2500;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_school_legacy_leaderboard()
 RETURNS TABLE(username text, display_name text, major text, classroom text, mandatory_average integer, mandatory_days bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH legacy_daily AS (
  SELECT a.auth_user_id,a.score,
   (to_timestamp(a.completed_at_ms/1000.0) AT TIME ZONE 'Asia/Jakarta')::date AS practice_day,
   row_number() OVER (
    PARTITION BY a.auth_user_id,
     (to_timestamp(a.completed_at_ms/1000.0) AT TIME ZONE 'Asia/Jakarta')::date
    ORDER BY a.completed_at_ms DESC,a.session_key DESC
   ) AS daily_rank
  FROM public.student_attempts a
  WHERE a.practice_category IS NULL
   AND a.auth_user_id IS NOT NULL
   AND a.signature NOT LIKE 'WEB-SERVER-v1:%'
   AND a.question_count=100
   AND a.answered BETWEEN 0 AND a.question_count
   AND a.correct BETWEEN 0 AND a.answered
   AND a.score=round(a.correct::numeric*100/a.question_count)::integer
 ),
 scores AS (
  SELECT auth_user_id,round(avg(score))::integer average_score,count(*)::bigint completed_days
  FROM legacy_daily WHERE daily_rank=1 GROUP BY auth_user_id
 )
 SELECT r.username,
  concat_ws(' ',split_part(btrim(r.full_name),' ',1),
   nullif(split_part(btrim(r.full_name),' ',2),''))::text AS display_name,
  m.name AS major,
  c.class_name AS classroom,
  s.average_score,s.completed_days
 FROM scores s
 JOIN public.student_roster r ON r.auth_user_id=s.auth_user_id
 JOIN public.classes c ON c.id=r.class_id
 JOIN public.majors m ON m.id=c.major_id
 WHERE r.registration_status='registered' AND r.username IS NOT NULL
  AND EXISTS(
   SELECT 1 FROM public.student_roster caller
   WHERE caller.auth_user_id=(SELECT auth.uid())
    AND caller.registration_status='registered'
  )
 ORDER BY s.average_score DESC,s.completed_days DESC,r.username
 LIMIT 2500;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_school_weak_topics()
 RETURNS TABLE(category text, answered bigint, correct bigint, wrong bigint, timeout bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
WITH recent AS (
 SELECT s.questions,s.answers
 FROM public.vokasi_web_exam_sessions AS s
 WHERE s.auth_user_id=(SELECT auth.uid())
   AND s.status='complete'
   AND EXISTS (
      SELECT 1 FROM public.vokasi_web_verified_results AS v
      WHERE v.session_id=s.id AND v.auth_user_id=s.auth_user_id
   )
 ORDER BY s.completed_at DESC,s.id DESC
 LIMIT 5
), question_results AS (
 SELECT q.value->>'category' AS subject,
        coalesce(upper(a.value->>'status'),'') AS verdict
 FROM recent s
 CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.questions)
   WITH ORDINALITY AS q(value,position)
 LEFT JOIN LATERAL pg_catalog.jsonb_array_elements(s.answers)
   WITH ORDINALITY AS a(value,position)
   ON a.position=q.position
)
SELECT subject::text,
 count(*) FILTER (WHERE verdict IN ('BENAR','SALAH'))::bigint AS answered,
 count(*) FILTER (WHERE verdict='BENAR')::bigint AS correct,
 count(*) FILTER (WHERE verdict='SALAH')::bigint AS wrong,
 count(*) FILTER (WHERE verdict='TIMEOUT')::bigint AS timeout
FROM question_results
WHERE subject IS NOT NULL AND btrim(subject)<>''
GROUP BY subject
ORDER BY wrong DESC,subject ASC;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_super_admin_manage_account(p_target uuid, p_action text, p_display_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
END;$function$

CREATE OR REPLACE FUNCTION public.vokasi_web_begin_session(p_session uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE; t timestamptz; q jsonb; seconds int;
BEGIN
 SELECT * INTO s FROM public.vokasi_web_exam_sessions
  WHERE id=p_session AND auth_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sesi bukan milik akun ini.'; END IF;
 IF s.status='prepared' THEN
  IF s.created_at < clock_timestamp()-interval '15 minutes' THEN
   RAISE EXCEPTION 'Persiapan sesi kedaluwarsa. Mulai lagi.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.vokasi_web_bank_release WHERE id=1 AND active=true)
    THEN RAISE EXCEPTION 'Latihan sedang dijeda admin.'; END IF;
  t=clock_timestamp();q=s.questions->0;seconds=(q->>'seconds')::int;
  UPDATE public.vokasi_web_exam_sessions SET status='active',started_at=t,
   question_started_at=t,question_deadline_at=t+make_interval(secs=>seconds),
   overall_deadline_at=t+make_interval(secs=>(SELECT SUM((x->>'seconds')::int)
      FROM jsonb_array_elements(s.questions) x))
  WHERE id=s.id;
 END IF;
 RETURN vokasi_private.web_view(p_session);
END; $function$

CREATE OR REPLACE FUNCTION public.vokasi_web_can_read_figure(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
 SELECT auth.uid() IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.student_roster r
   WHERE r.auth_user_id=auth.uid() AND r.registration_status='registered')
 AND EXISTS (
   SELECT 1 FROM public.vokasi_web_exam_sessions s
   WHERE s.auth_user_id=auth.uid()
     AND (
        s.status='complete' OR
        (s.status='active' AND clock_timestamp() <= s.overall_deadline_at+interval '15 minutes') OR
        (s.status='prepared' AND clock_timestamp() <= s.created_at+interval '15 minutes')
     )
     AND EXISTS (
       SELECT 1 FROM jsonb_array_elements(s.questions) AS item(q)
       WHERE item.q->>'image_path'=p_path
          OR EXISTS(SELECT 1 FROM jsonb_array_elements(item.q->'options') AS opt(o)
             WHERE opt.o->>'image_path'=p_path)
     )
 )
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_web_cancel_session(p_session uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
 v_uid uuid := (SELECT auth.uid());
 v_status text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Harus masuk sebagai siswa.'; END IF;

 SELECT status INTO v_status
 FROM public.vokasi_web_exam_sessions
 WHERE id=p_session AND auth_user_id=v_uid
 FOR UPDATE;

 IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan untuk akun ini.'; END IF;

 IF v_status IN ('active','prepared') THEN
   UPDATE public.vokasi_web_exam_sessions
   SET status='cancelled'
   WHERE id=p_session AND auth_user_id=v_uid;
   RETURN jsonb_build_object('status','cancelled','session_id',p_session);
 END IF;

 -- Completed scores are immutable; a prior cancellation is idempotent.
 RETURN jsonb_build_object('status',v_status,'session_id',p_session);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_web_completed_review(p_session uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.vokasi_web_exam_sessions
  WHERE id=p_session AND auth_user_id=auth.uid() AND status='complete';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pembahasan hanya tersedia setelah sesi selesai.'; END IF;
 RETURN (SELECT jsonb_agg(jsonb_build_object(
  'id',(q->>'id')::int,'category',q->>'category','text',q->>'question',
  'image_path',q->>'image_path','options',q->'options',
  'correct_index',(q->>'answer_index')::int,'selected_index',a->'selected_index',
  'status',a->>'status','response_seconds',(a->>'response_seconds')::int,
  'explanation',q->>'explanation'
 ) ORDER BY pos)
 FROM jsonb_array_elements(s.questions) WITH ORDINALITY qq(q,pos)
 LEFT JOIN LATERAL (SELECT value AS a FROM jsonb_array_elements(s.answers) WITH ORDINALITY a(value,ord)
   WHERE ord=pos) answers ON true);
END; $function$

CREATE OR REPLACE FUNCTION public.vokasi_web_get_quiz_state(p_session uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
 SELECT vokasi_private.web_process(p_session,NULL,NULL);
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_web_pause_bank()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT public.is_school_admin() THEN RAISE EXCEPTION 'Khusus admin.'; END IF;
  UPDATE public.vokasi_web_bank_release SET active=FALSE WHERE id=1;
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_web_prepare_session(p_category text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE v_user uuid:=auth.uid(); v_group text; v_quota int; v_slice jsonb;
 v_raw jsonb:='[]'::jsonb; v_ordered jsonb:='[]'::jsonb;
 v_q jsonb; v_opts jsonb; v_clean jsonb; v_correct int; v_len int; v_assets jsonb:='[]'::jsonb;
 v_id uuid; v_version text; v_path text; opt jsonb;
 v_existing public.vokasi_web_exam_sessions%ROWTYPE;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.student_roster WHERE auth_user_id=v_user AND registration_status='registered'
 ) THEN RAISE EXCEPTION 'Hanya siswa yang terdaftar boleh mengerjakan latihan.'; END IF;
 SELECT version INTO v_version FROM public.vokasi_web_bank_release WHERE id=1 AND active=true;
 IF v_version IS NULL THEN RAISE EXCEPTION 'Bank soal belum aktif.'; END IF;
 IF p_category IS NOT NULL AND p_category NOT IN
 ('Perkalian','Pembagian','Numerasi Campuran','Fisika Dasar','Logika dan Penalaran','Pola Gambar')
 THEN RAISE EXCEPTION 'Kategori latihan tidak dikenal.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,511));
 -- Calls can overlap during React development remounts, refresh, or slow image preload.
 -- Reuse exactly the same active/prepared session for the same user and category.
 -- The per-user transaction lock makes concurrent requests idempotent.
 SELECT * INTO v_existing
 FROM public.vokasi_web_exam_sessions
 WHERE auth_user_id=v_user AND bank_version=v_version
   AND practice_category IS NOT DISTINCT FROM p_category
   AND NOT EXISTS (
     SELECT 1 FROM jsonb_array_elements(questions) AS used(q)
     JOIN public.vokasi_visual_asset_blocks AS blocked
       ON blocked.source_number=(used.q->>'id')::integer
      AND blocked.blocked_image_path=used.q->>'image_path'
   )
   AND (status='active' OR
       (status='prepared' AND created_at >= clock_timestamp()-interval '15 minutes'))
 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN
   FOR v_q IN SELECT value FROM jsonb_array_elements(v_existing.questions) LOOP
     IF NULLIF(v_q->>'image_path','') IS NOT NULL THEN
       v_assets=v_assets||jsonb_build_array(v_q->>'image_path');
     END IF;
     FOR opt IN SELECT value FROM jsonb_array_elements(v_q->'options') LOOP
       IF NULLIF(opt->>'image_path','') IS NOT NULL THEN
         v_assets=v_assets||jsonb_build_array(opt->>'image_path');
       END IF;
     END LOOP;
   END LOOP;
   RETURN jsonb_build_object(
     'session_id',v_existing.id,'status',v_existing.status,
     'image_paths',v_assets,'total',v_existing.question_count,'reused',true);
 END IF;
 IF p_category IS NULL THEN
  FOR v_group,v_quota IN SELECT * FROM (VALUES
    ('HITUNG_DASAR',30),('HITUNG_MENENGAH',20),('HITUNG_LANJUT',10),
    ('NUMERASI_CAMPURAN',10),('FISIKA_DASAR',10),('LOGIKA',10),('POLA_GAMBAR',10)
  ) AS groups(code,quota)
  LOOP
   SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO v_slice
   FROM (SELECT * FROM public.vokasi_web_published_questions AS bank
     WHERE bank.difficulty_code=v_group
       AND NOT EXISTS (
         SELECT 1 FROM public.vokasi_visual_asset_blocks AS blocked
         WHERE blocked.source_number=bank.source_number
           AND blocked.blocked_image_path=bank.question_image_path
       )
     ORDER BY random() LIMIT v_quota) r;
   IF jsonb_array_length(v_slice)<>v_quota THEN RAISE EXCEPTION 'Stok % tidak lengkap.',v_group; END IF;
   v_raw=v_raw||v_slice;
  END LOOP;
 ELSE
  SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb) INTO v_raw FROM (
    SELECT * FROM public.vokasi_web_published_questions AS bank
    WHERE bank.category=p_category
      AND NOT EXISTS (
         SELECT 1 FROM public.vokasi_visual_asset_blocks AS blocked
         WHERE blocked.source_number=bank.source_number
           AND blocked.blocked_image_path=bank.question_image_path
      )
    ORDER BY random() LIMIT 10
  ) r;
 END IF;
 SELECT COALESCE(jsonb_agg(q ORDER BY random()),'[]'::jsonb) INTO v_raw
 FROM jsonb_array_elements(v_raw) q;
 v_len=jsonb_array_length(v_raw);
 IF v_len <> (CASE WHEN p_category IS NULL THEN 100 ELSE 10 END) THEN
  RAISE EXCEPTION 'Jumlah soal pada kategori kurang.'; END IF;
 FOR v_q IN SELECT value FROM jsonb_array_elements(v_raw) LOOP
  SELECT jsonb_agg(jsonb_build_object('text',e->>'text','image_path',e->>'image_path',
       'original',(n-1)::int) ORDER BY random())
  INTO v_opts FROM jsonb_array_elements(v_q->'options') WITH ORDINALITY o(e,n);
  SELECT (n-1)::int INTO v_correct FROM jsonb_array_elements(v_opts) WITH ORDINALITY o(e,n)
   WHERE (e->>'original')::int=(v_q->>'correct_index')::int;
  IF v_correct IS NULL THEN RAISE EXCEPTION 'Kunci soal bermasalah.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('text',e->>'text','image_path',e->>'image_path') ORDER BY n)
  INTO v_clean FROM jsonb_array_elements(v_opts) WITH ORDINALITY o(e,n);
  v_ordered=v_ordered||jsonb_build_array(jsonb_build_object(
   'id',(v_q->>'source_number')::int,'category',v_q->>'category',
   'question',v_q->>'question','image_path',v_q->>'question_image_path',
   'options',v_clean,'answer_index',v_correct,'explanation',v_q->>'explanation',
   'seconds',(v_q->>'time_limit_seconds')::int));
  IF NULLIF(v_q->>'question_image_path','') IS NOT NULL
   THEN v_assets=v_assets||jsonb_build_array(v_q->>'question_image_path'); END IF;
  FOR opt IN SELECT value FROM jsonb_array_elements(v_clean) LOOP
   IF NULLIF(opt->>'image_path','') IS NOT NULL THEN
    v_assets=v_assets||jsonb_build_array(opt->>'image_path'); END IF;
  END LOOP;
 END LOOP;
 IF p_category IS NULL AND
  (SELECT SUM((v->>'seconds')::int) FROM jsonb_array_elements(v_ordered) v)<>1800
  THEN RAISE EXCEPTION 'Blueprint harus tepat 100 soal/1800 detik.'; END IF;
 UPDATE public.vokasi_web_exam_sessions SET status='cancelled'
 WHERE auth_user_id=v_user AND status IN ('prepared','active') AND created_at < clock_timestamp();
 INSERT INTO public.vokasi_web_exam_sessions(auth_user_id,bank_version,practice_category,questions,question_count)
 VALUES(v_user,v_version,p_category,v_ordered,v_len) RETURNING id INTO v_id;
 RETURN jsonb_build_object('session_id',v_id,'status','prepared','image_paths',v_assets,
  'total',v_len);
END; $function$

CREATE OR REPLACE FUNCTION public.vokasi_web_publish_new_bank()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
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
  DELETE FROM public.vokasi_web_published_questions
  WHERE source_number BETWEEN 1 AND 500;
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
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_web_quiz_progress(p_session uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH owned AS (
    SELECT s.id,s.answers,s.auth_user_id,s.practice_category,s.status,
           s.started_at,s.completed_at
    FROM public.vokasi_web_exam_sessions AS s
    WHERE s.id=p_session AND s.auth_user_id=(SELECT auth.uid())
      AND s.status IN ('active','complete')
  ), verdicts AS (
    SELECT upper(e.value->>'status') AS verdict,e.ordinality AS n
    FROM owned s CROSS JOIN LATERAL
      jsonb_array_elements(s.answers) WITH ORDINALITY e(value,ordinality)
  ), daily AS (
    SELECT o.*,
      EXISTS (
        SELECT 1 FROM public.vokasi_verified_attempts AS a
        WHERE a.auth_user_id=o.auth_user_id
          AND a.practice_category IS NULL AND a.question_count=100
          AND a.session_key<>o.id
          AND (pg_catalog.to_timestamp(a.completed_at_ms/1000.0)
               AT TIME ZONE 'Asia/Jakarta')::date =
              (coalesce(o.completed_at,pg_catalog.clock_timestamp())
               AT TIME ZONE 'Asia/Jakarta')::date
          AND a.completed_at_ms <
              (extract(epoch FROM coalesce(o.completed_at,pg_catalog.clock_timestamp()))*1000)::bigint
      ) AS earlier_verified_today
    FROM owned o
  )
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM owned) THEN NULL
    ELSE jsonb_build_object(
       'correct',(SELECT count(*) FROM verdicts WHERE verdict='BENAR'),
       'wrong',(SELECT count(*) FROM verdicts WHERE verdict='SALAH'),
       'timeout',(SELECT count(*) FROM verdicts WHERE verdict='TIMEOUT'),
       'statuses',coalesce((SELECT jsonb_agg(verdict ORDER BY n) FROM verdicts),'[]'::jsonb),
       'repeat_today',(SELECT d.practice_category IS NULL AND d.earlier_verified_today FROM daily d),
       'official_today',(SELECT d.practice_category IS NULL AND d.status='complete' AND NOT d.earlier_verified_today FROM daily d)
    ) END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_web_record_exam_activity(p_session uuid, p_event_type text, p_question_index integer DEFAULT NULL::integer, p_target_label text DEFAULT NULL::text, p_target_kind text DEFAULT NULL::text, p_detail text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_status text;
  v_recent_count integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN false;
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN (
    'tab_hidden','tab_visible','window_blur','window_focus',
    'copy','paste','context_menu','fullscreen_exit',
    'external_link','ui_click','answer_option_selected'
  ) THEN
    RAISE EXCEPTION 'Jenis aktivitas ujian tidak valid.';
  END IF;
  IF p_question_index IS NOT NULL AND p_question_index NOT BETWEEN 0 AND 1000 THEN
    RAISE EXCEPTION 'Nomor soal tidak valid.';
  END IF;

  SELECT s.status INTO v_status
  FROM public.vokasi_web_exam_sessions AS s
  WHERE s.id = p_session AND s.auth_user_id = (SELECT auth.uid());

  IF NOT FOUND OR v_status <> 'active' THEN
    RETURN false;
  END IF;

  -- Keep noisy or malfunctioning clients from flooding the audit log.
  SELECT count(*)::integer INTO v_recent_count
  FROM public.vokasi_web_exam_activity_events AS e
  WHERE e.session_id = p_session
    AND e.occurred_at > pg_catalog.clock_timestamp() - interval '1 minute';
  IF v_recent_count >= 90 THEN
    RETURN false;
  END IF;

  INSERT INTO public.vokasi_web_exam_activity_events(
    session_id, auth_user_id, event_type, question_index,
    target_label, target_kind, detail
  ) VALUES (
    p_session,
    (SELECT auth.uid()),
    p_event_type,
    p_question_index,
    left(coalesce(p_target_label, ''), 120),
    left(coalesce(p_target_kind, ''), 40),
    left(coalesce(p_detail, ''), 240)
  );
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_web_select_answer(p_session uuid, p_question_index integer, p_choice integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE
  s public.vokasi_web_exam_sessions%ROWTYPE;
  q jsonb;
  v_now timestamptz;
  v_response jsonb;
BEGIN
  -- Resolve any deadline first, so a late request cannot overwrite an expired answer.
  v_response:=vokasi_private.web_process(p_session,NULL,NULL);

  SELECT * INTO s
  FROM public.vokasi_web_exam_sessions
  WHERE id=p_session AND auth_user_id=auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi bukan milik akun ini.'; END IF;
  IF s.status<>'active' THEN RETURN vokasi_private.web_view(p_session); END IF;

  v_now=clock_timestamp();
  IF v_now>=s.question_deadline_at OR v_now>=s.overall_deadline_at THEN
    RETURN vokasi_private.web_process(p_session,NULL,NULL);
  END IF;
  IF p_question_index IS DISTINCT FROM s.current_index THEN
    RETURN vokasi_private.web_view(p_session);
  END IF;

  q=s.questions->s.current_index;
  IF p_choice IS NULL OR p_choice<0 OR p_choice>=jsonb_array_length(q->'options') THEN
    RAISE EXCEPTION 'Pilihan jawaban tidak valid.';
  END IF;

  UPDATE public.vokasi_web_exam_sessions SET
    pending_choice=p_choice,
    pending_question_index=s.current_index,
    pending_selected_at=v_now
  WHERE id=s.id;

  RETURN vokasi_private.web_view(p_session);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_web_submit_answer(p_session uuid, p_question_index integer, p_choice integer)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
 SELECT vokasi_private.web_process(p_session,p_question_index,p_choice);
$function$;

CREATE OR REPLACE FUNCTION vokasi_private.web_finish(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE; v_correct int; v_answered int;
 v_score int; v_username text; v_full text; v_class text; v_major text;
 v_xp int; v_attempt_id uuid; v_epoch bigint; v_signature text;
BEGIN
 SELECT * INTO s FROM public.vokasi_web_exam_sessions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.status='complete' THEN RETURN; END IF;
 IF s.status<>'active' OR s.current_index < s.question_count THEN RETURN; END IF;
 SELECT COUNT(*) FILTER(WHERE a->>'status'='BENAR'),
   COUNT(*) FILTER(WHERE a->>'selected_index' IS NOT NULL)
 INTO v_correct,v_answered FROM jsonb_array_elements(s.answers) a;
 v_score=(v_correct*100)/s.question_count;
 SELECT r.username,r.full_name,c.class_name,m.name INTO v_username,v_full,v_class,v_major
 FROM public.student_roster r
 JOIN public.classes c ON c.id=r.class_id
 LEFT JOIN public.majors m ON m.id=r.major_id
 WHERE r.auth_user_id=s.auth_user_id AND r.registration_status='registered' LIMIT 1;
 IF v_username IS NULL THEN RAISE EXCEPTION 'Akun tidak terdaftar pada daftar siswa resmi.'; END IF;
 v_epoch=(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint;
 IF s.practice_category IS NULL THEN v_xp=0; -- existing DB trigger calculates 50 once/day
 ELSE
  -- Award practice XP at most once per category/day even if two devices finish together.
  PERFORM pg_advisory_xact_lock(hashtextextended(s.auth_user_id::text || ':' || s.practice_category || ':' ||
       (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date::text, 722));
  SELECT CASE WHEN v_correct>0 AND NOT EXISTS(
    SELECT 1 FROM public.student_attempts a
     WHERE a.auth_user_id=s.auth_user_id AND a.practice_category=s.practice_category
       AND a.earned_xp>0
       AND EXISTS(SELECT 1 FROM public.vokasi_web_verified_results proof
         WHERE proof.attempt_id=a.id AND proof.auth_user_id=a.auth_user_id)
       AND (to_timestamp(a.completed_at_ms/1000.0) AT TIME ZONE 'Asia/Jakarta')::date =
           (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date
  ) THEN 5 ELSE 0 END INTO v_xp;
 END IF;
 v_signature='WEB-SERVER-v1:'||s.id::text;
 INSERT INTO public.student_attempts(auth_user_id,username,session_key,completed_at_ms,signature,
  correct,answered,question_count,score,earned_xp,seconds_spent,practice_category,
  name_snapshot,class_snapshot,major_snapshot,review_summary)
 VALUES(s.auth_user_id,v_username,s.id,v_epoch,v_signature,
   v_correct,v_answered,s.question_count,v_score,v_xp,
   LEAST(7200,GREATEST(0,EXTRACT(EPOCH FROM clock_timestamp()-s.started_at)::int)),
   s.practice_category,coalesce(v_full,''),coalesce(v_class,''),coalesce(v_major,''),s.answers)
 ON CONFLICT(auth_user_id,session_key) DO UPDATE SET
   completed_at_ms=EXCLUDED.completed_at_ms,signature=EXCLUDED.signature,
   correct=EXCLUDED.correct,answered=EXCLUDED.answered,question_count=EXCLUDED.question_count,
   score=EXCLUDED.score,earned_xp=EXCLUDED.earned_xp,
   seconds_spent=EXCLUDED.seconds_spent,review_summary=EXCLUDED.review_summary
 RETURNING id INTO v_attempt_id;
 INSERT INTO public.vokasi_web_verified_results(session_id,attempt_id,auth_user_id,score,correct,question_count)
 VALUES(s.id,v_attempt_id,s.auth_user_id,v_score,v_correct,s.question_count)
 ON CONFLICT(session_id) DO NOTHING;
 UPDATE public.vokasi_web_exam_sessions SET status='complete',completed_at=clock_timestamp(),final_score=v_score
 WHERE id=p_id AND current_index=question_count;
END; $function$

CREATE OR REPLACE FUNCTION vokasi_private.web_process(p_session uuid, p_question_index integer DEFAULT NULL::integer, p_choice integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE
  s public.vokasi_web_exam_sessions%ROWTYPE;
  q jsonb;
  v_now timestamptz;
  v_start timestamptz;
  v_correct boolean;
  v_feedback jsonb:=NULL;
  v_elapsed integer;
  v_response jsonb;
  v_wait_ms bigint:=0;
BEGIN
  SELECT * INTO s
  FROM public.vokasi_web_exam_sessions
  WHERE id=p_session AND auth_user_id=auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi bukan milik akun ini.'; END IF;
  IF s.status='prepared' OR s.status='cancelled' OR s.status='complete' THEN
    RETURN vokasi_private.web_view(p_session);
  END IF;

  v_now=clock_timestamp();
  -- Keep the overall deadline fixed to the original server-issued time budget.
  s.overall_deadline_at=LEAST(
    s.overall_deadline_at,
    s.started_at + make_interval(secs => (
      SELECT SUM((z->>'seconds')::integer) FROM jsonb_array_elements(s.questions) z
    ))
  );

  -- Finalize expired questions from the latest saved choice. Only a question
  -- with no saved choice is marked TIMEOUT.
  WHILE s.current_index < s.question_count
    AND (v_now>=s.question_deadline_at OR v_now>=s.overall_deadline_at)
  LOOP
    q=s.questions->s.current_index;
    IF s.pending_question_index=s.current_index
      AND s.pending_choice IS NOT NULL
      AND s.pending_choice BETWEEN 0 AND (jsonb_array_length(q->'options')-1)
    THEN
      v_correct=(s.pending_choice=(q->>'answer_index')::integer);
      v_elapsed=LEAST(
        (q->>'seconds')::integer,
        GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (
          COALESCE(s.pending_selected_at,s.question_started_at)-s.question_started_at
        )))::integer)
      );
      s.answers=s.answers||jsonb_build_array(jsonb_build_object(
        'question_id',(q->>'id')::integer,
        'selected_index',s.pending_choice,
        'status',CASE WHEN v_correct THEN 'BENAR' ELSE 'SALAH' END,
        'response_seconds',v_elapsed
      ));
    ELSE
      s.answers=s.answers||jsonb_build_array(jsonb_build_object(
        'question_id',(q->>'id')::integer,
        'selected_index',NULL,
        'status','TIMEOUT',
        'response_seconds',(q->>'seconds')::integer
      ));
    END IF;

    s.pending_choice=NULL;
    s.pending_question_index=NULL;
    s.pending_selected_at=NULL;
    s.current_index=s.current_index+1;
    IF s.current_index < s.question_count THEN
      v_start=s.question_deadline_at;
      s.question_started_at=v_start;
      s.question_deadline_at=v_start+make_interval(
        secs=>(s.questions->s.current_index->>'seconds')::integer
      );
    END IF;
  END LOOP;

  -- Explicitly pressing "Kirim jawaban" finalizes the current choice early.
  IF s.current_index<s.question_count
    AND p_question_index=s.current_index
    AND p_choice IS NOT NULL
    AND v_now>=s.question_started_at
  THEN
    q=s.questions->s.current_index;
    IF p_choice NOT BETWEEN 0 AND (jsonb_array_length(q->'options')-1)
      THEN RAISE EXCEPTION 'Pilihan jawaban tidak valid.'; END IF;
    v_correct=(p_choice=(q->>'answer_index')::integer);
    v_elapsed=LEAST(
      (q->>'seconds')::integer,
      GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (v_now-s.question_started_at)))::integer)
    );
    s.answers=s.answers||jsonb_build_array(jsonb_build_object(
      'question_id',(q->>'id')::integer,
      'selected_index',p_choice,
      'status',CASE WHEN v_correct THEN 'BENAR' ELSE 'SALAH' END,
      'response_seconds',v_elapsed
    ));
    v_feedback=jsonb_build_object('correct',v_correct,'selected_index',p_choice);
    s.pending_choice=NULL;
    s.pending_question_index=NULL;
    s.pending_selected_at=NULL;
    s.current_index=s.current_index+1;
    IF s.current_index<s.question_count THEN
      s.question_started_at=v_now+interval '1 second';
      s.question_deadline_at=s.question_started_at+make_interval(
        secs=>(s.questions->s.current_index->>'seconds')::integer
      );
    END IF;
    s.overall_deadline_at=s.overall_deadline_at+interval '1 second';
    v_wait_ms=1000;
  END IF;

  UPDATE public.vokasi_web_exam_sessions SET
    answers=s.answers,
    current_index=s.current_index,
    question_started_at=s.question_started_at,
    question_deadline_at=s.question_deadline_at,
    overall_deadline_at=s.overall_deadline_at,
    pending_choice=s.pending_choice,
    pending_question_index=s.pending_question_index,
    pending_selected_at=s.pending_selected_at
  WHERE id=s.id;

  IF s.current_index>=s.question_count THEN
    PERFORM vokasi_private.web_finish(s.id);
  END IF;
  v_response=vokasi_private.web_view(s.id);
  IF v_feedback IS NOT NULL THEN
    RETURN v_response||jsonb_build_object('feedback',v_feedback,'feedback_wait_ms',v_wait_ms);
  END IF;
  IF p_choice IS NOT NULL THEN
    RETURN v_response||jsonb_build_object('late',true);
  END IF;
  RETURN v_response;
END;
$function$;

CREATE OR REPLACE FUNCTION vokasi_private.web_view(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'vokasi_private'
AS $function$
DECLARE s public.vokasi_web_exam_sessions%ROWTYPE; q jsonb; choices jsonb;
BEGIN
  SELECT * INTO s
  FROM public.vokasi_web_exam_sessions
  WHERE id=p_id AND auth_user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak tersedia.'; END IF;

  IF s.status='complete' THEN
    RETURN jsonb_build_object(
      'session_id',s.id,'status','complete','category',s.practice_category,
      'score',s.final_score,'total',s.question_count,
      'correct',(SELECT COUNT(*) FROM jsonb_array_elements(s.answers) a WHERE a->>'status'='BENAR'),
      'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint
    );
  END IF;
  IF s.status='cancelled' THEN RAISE EXCEPTION 'Sesi lama telah digantikan sesi baru.'; END IF;
  IF s.status='prepared' THEN
    RETURN jsonb_build_object(
      'session_id',s.id,'status','prepared','total',s.question_count,
      'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint
    );
  END IF;

  q=s.questions->s.current_index;
  SELECT coalesce(jsonb_agg(
    jsonb_build_object('text',c->>'text','image_path',c->>'image_path') ORDER BY n
  ),'[]'::jsonb)
  INTO choices
  FROM jsonb_array_elements(q->'options') WITH ORDINALITY x(c,n);

  RETURN jsonb_build_object(
    'session_id',s.id,'status','active','category',s.practice_category,
    'index',s.current_index,'total',s.question_count,
    'pending_choice',CASE WHEN s.pending_question_index=s.current_index THEN s.pending_choice ELSE NULL END,
    'question',jsonb_build_object(
      'id',(q->>'id')::int,'category',q->>'category','text',q->>'question',
      'image_path',q->>'image_path','options',choices,'seconds',(q->>'seconds')::int
    ),
    'question_deadline_ms',(EXTRACT(EPOCH FROM s.question_deadline_at)*1000)::bigint,
    'overall_deadline_ms',(EXTRACT(EPOCH FROM s.overall_deadline_at)*1000)::bigint,
    'server_now_ms',(EXTRACT(EPOCH FROM clock_timestamp())*1000)::bigint
  );
END;
$function$;

-- Prevent other database roles from invoking privileged routines through PUBLIC grants.
-- The application connection owns these routines and calls them only after validating a server-side session.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA vokasi_private FROM PUBLIC;

INSERT INTO public.schema_migrations(version)
VALUES ('20261029_self_hosted_native_functions');

COMMIT;
