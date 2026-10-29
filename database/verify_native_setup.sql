-- Run after applying database/schema.sql and database/functions.sql to the cPanel PostgreSQL database.
-- These are read-only checks; they do not modify any data.

SELECT
  current_database() AS database_name,
  current_user AS connected_database_user,
  current_setting('server_version') AS postgres_version;

SELECT expected_relation, to_regclass(expected_relation) AS resolved_relation
FROM (VALUES
  ('public.app_users'),
  ('public.app_sessions'),
  ('public.school_admins'),
  ('public.app_admin_invites'),
  ('public.majors'),
  ('public.classes'),
  ('public.student_roster'),
  ('public.student_profiles'),
  ('public.student_attempts'),
  ('public.vokasi_web_exam_sessions'),
  ('public.vokasi_question_drafts'),
  ('public.vokasi_web_published_questions'),
  ('public.vokasi_web_bank_release'),
  ('public.vokasi_web_import_drafts'),
  ('storage.objects')
) AS expected(expected_relation);

SELECT expected_function, to_regprocedure(expected_function) AS resolved_function
FROM (VALUES
  ('public.vokasi_web_prepare_session(text)'),
  ('public.vokasi_web_begin_session(uuid)'),
  ('public.vokasi_web_submit_answer(uuid,integer,integer)'),
  ('public.vokasi_web_completed_review(uuid)'),
  ('public.vokasi_admin_import_questions(jsonb,text)'),
  ('public.vokasi_admin_list_administrators()'),
  ('public.vokasi_admin_question_health()')
) AS expected(expected_function);

SELECT 'app_users' AS table_name, count(*)::bigint AS row_count FROM public.app_users
UNION ALL SELECT 'student_roster', count(*)::bigint FROM public.student_roster
UNION ALL SELECT 'classes', count(*)::bigint FROM public.classes
UNION ALL SELECT 'majors', count(*)::bigint FROM public.majors
UNION ALL SELECT 'student_attempts', count(*)::bigint FROM public.student_attempts
UNION ALL SELECT 'question_drafts', count(*)::bigint FROM public.vokasi_question_drafts
UNION ALL SELECT 'published_questions', count(*)::bigint FROM public.vokasi_web_published_questions
UNION ALL SELECT 'local_storage_metadata', count(*)::bigint FROM storage.objects
UNION ALL SELECT 'pending_admin_invites', count(*)::bigint
  FROM public.app_admin_invites WHERE accepted_at IS NULL AND expires_at > now();
