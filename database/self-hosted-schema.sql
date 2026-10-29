-- VOKASI self-hosted PostgreSQL schema baseline
-- Generated from current Supabase public base tables on 2026-10-29.
-- NOT a drop-in production migration: auth, RPCs, storage, and data migration must be ported.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','super_admin','student')),
  is_active boolean NOT NULL DEFAULT true,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS public."classes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "major_id" uuid NOT NULL,
  "grade_level" smallint NOT NULL,
  "class_name" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "school_year" text NOT NULL DEFAULT '2026/2027'::text
);

CREATE TABLE IF NOT EXISTS public."majors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "code" text
);

CREATE TABLE IF NOT EXISTS public."school_admins" (
  "user_id" uuid NOT NULL,
  "display_name" text NOT NULL DEFAULT 'Admin Sekolah'::text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "access_role" text NOT NULL DEFAULT 'admin'::text
);

CREATE TABLE IF NOT EXISTS public."school_import_batches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_by" uuid,
  "rows_received" integer NOT NULL DEFAULT 0,
  "accounts_created" integer NOT NULL DEFAULT 0,
  "accounts_existing" integer NOT NULL DEFAULT 0,
  "failed_rows" integer NOT NULL DEFAULT 0,
  "result_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."student_attempts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "auth_user_id" uuid NOT NULL,
  "username" text NOT NULL,
  "session_key" uuid NOT NULL,
  "completed_at_ms" bigint NOT NULL,
  "signature" text NOT NULL DEFAULT ''::text,
  "correct" smallint NOT NULL,
  "answered" smallint NOT NULL,
  "question_count" smallint NOT NULL,
  "score" smallint NOT NULL,
  "earned_xp" smallint NOT NULL DEFAULT 0,
  "seconds_spent" integer NOT NULL DEFAULT 0,
  "practice_category" text,
  "name_snapshot" text NOT NULL DEFAULT ''::text,
  "class_snapshot" text NOT NULL DEFAULT ''::text,
  "major_snapshot" text NOT NULL DEFAULT ''::text,
  "review_summary" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."student_email_challenges" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "email" text NOT NULL,
  "purpose" text NOT NULL,
  "code_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."student_profiles" (
  "user_id" uuid NOT NULL,
  "roster_id" uuid,
  "recovery_email" text,
  "email_verified_at" timestamp with time zone,
  "avatar_path" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."student_roster" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "full_name" text NOT NULL,
  "class_id" uuid NOT NULL,
  "admission_year" integer NOT NULL,
  "registration_status" text NOT NULL DEFAULT 'pending'::text,
  "username" text,
  "auth_user_id" uuid,
  "registered_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "major_id" uuid,
  "normalized_name" text,
  "identity_key" text,
  "current_school_year" text NOT NULL DEFAULT '2026/2027'::text,
  "data_status" text NOT NULL DEFAULT 'valid'::text
);

CREATE TABLE IF NOT EXISTS public."vokasi_admin_change_log" (
  "id" bigint NOT NULL,
  "admin_auth_user_id" uuid NOT NULL,
  "action" text NOT NULL,
  "target_id" uuid NOT NULL,
  "before_data" jsonb,
  "after_data" jsonb,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."vokasi_admin_notification_reads" (
  "admin_id" uuid NOT NULL,
  "attempt_id" uuid NOT NULL,
  "read_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."vokasi_question_drafts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "source_number" integer,
  "category" text NOT NULL,
  "difficulty_code" text,
  "question" text NOT NULL DEFAULT ''::text,
  "question_image_path" text,
  "options" jsonb NOT NULL,
  "correct_index" integer NOT NULL,
  "time_limit_seconds" integer NOT NULL DEFAULT 20,
  "explanation" text NOT NULL DEFAULT ''::text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."vokasi_visual_asset_blocks" (
  "source_number" integer NOT NULL,
  "blocked_image_path" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."vokasi_web_bank_release" (
  "id" smallint NOT NULL DEFAULT 1,
  "active" boolean NOT NULL DEFAULT false,
  "version" text NOT NULL DEFAULT 'VOKASI-NEW-20261026-v1'::text,
  "published_at" timestamp with time zone,
  "published_by" uuid
);

CREATE TABLE IF NOT EXISTS public."vokasi_web_exam_activity_events" (
  "id" bigint NOT NULL,
  "session_id" uuid NOT NULL,
  "auth_user_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "question_index" integer,
  "target_label" text NOT NULL DEFAULT ''::text,
  "target_kind" text NOT NULL DEFAULT ''::text,
  "detail" text NOT NULL DEFAULT ''::text,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public."vokasi_web_exam_sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "auth_user_id" uuid NOT NULL,
  "bank_version" text NOT NULL,
  "practice_category" text,
  "questions" jsonb NOT NULL,
  "answers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "question_count" integer NOT NULL,
  "current_index" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'prepared'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "question_started_at" timestamp with time zone,
  "question_deadline_at" timestamp with time zone,
  "overall_deadline_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "final_score" integer,
  "pending_choice" integer,
  "pending_question_index" integer,
  "pending_selected_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public."vokasi_web_import_drafts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "mode" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."vokasi_web_published_questions" (
  "source_number" integer NOT NULL,
  "category" text NOT NULL,
  "difficulty_code" text NOT NULL,
  "question" text NOT NULL,
  "question_image_path" text,
  "options" jsonb NOT NULL,
  "correct_index" integer NOT NULL,
  "time_limit_seconds" integer NOT NULL,
  "explanation" text NOT NULL DEFAULT ''::text
);

CREATE TABLE IF NOT EXISTS public."vokasi_web_verified_results" (
  "session_id" uuid NOT NULL,
  "attempt_id" uuid,
  "auth_user_id" uuid NOT NULL,
  "score" smallint NOT NULL,
  "correct" smallint NOT NULL,
  "question_count" smallint NOT NULL,
  "verified_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public."classes" ADD CONSTRAINT "classes_class_name_check" CHECK (btrim(class_name) <> ''::text);
ALTER TABLE public."classes" ADD CONSTRAINT "classes_grade_level_check" CHECK (grade_level = ANY (ARRAY[10, 11, 12]));
ALTER TABLE public."classes" ADD CONSTRAINT "classes_major_id_fkey" FOREIGN KEY (major_id) REFERENCES public."majors"(id) ON DELETE RESTRICT;
ALTER TABLE public."classes" ADD CONSTRAINT "classes_pkey" PRIMARY KEY (id);
ALTER TABLE public."majors" ADD CONSTRAINT "majors_name_check" CHECK (btrim(name) <> ''::text);
ALTER TABLE public."majors" ADD CONSTRAINT "majors_pkey" PRIMARY KEY (id);
ALTER TABLE public."school_admins" ADD CONSTRAINT "school_admin_access_role_check" CHECK (access_role = ANY (ARRAY['admin'::text, 'super_admin'::text]));
ALTER TABLE public."school_admins" ADD CONSTRAINT "school_admins_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."school_admins" ADD CONSTRAINT "school_admins_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
ALTER TABLE public."school_import_batches" ADD CONSTRAINT "school_import_batches_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE SET NULL;
ALTER TABLE public."school_import_batches" ADD CONSTRAINT "school_import_batches_pkey" PRIMARY KEY (id);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_answered_check" CHECK (answered >= 0);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_completed_at_ms_check" CHECK (completed_at_ms > 0);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_correct_check" CHECK (correct >= 0);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_counts_check" CHECK (correct <= answered AND answered <= question_count);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_earned_xp_check" CHECK (earned_xp >= 0 AND earned_xp <= 100);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_pkey" PRIMARY KEY (id);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_question_count_check" CHECK (question_count = ANY (ARRAY[10, 100]));
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_review_summary_check" CHECK (jsonb_typeof(review_summary) = 'array'::text AND jsonb_array_length(review_summary) <= 100);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_score_check" CHECK (score = (correct * 100 / question_count));
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_seconds_spent_check" CHECK (seconds_spent >= 0 AND seconds_spent <= 7200);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_session_unique" UNIQUE (auth_user_id, session_key);
ALTER TABLE public."student_attempts" ADD CONSTRAINT "student_attempts_username_check" CHECK (length(btrim(username)) >= 2 AND length(btrim(username)) <= 100);
ALTER TABLE public."student_email_challenges" ADD CONSTRAINT "student_email_challenges_attempts_check" CHECK (attempts >= 0);
ALTER TABLE public."student_email_challenges" ADD CONSTRAINT "student_email_challenges_pkey" PRIMARY KEY (id);
ALTER TABLE public."student_email_challenges" ADD CONSTRAINT "student_email_challenges_purpose_check" CHECK (purpose = ANY (ARRAY['verify_email'::text, 'password_reset'::text]));
ALTER TABLE public."student_email_challenges" ADD CONSTRAINT "student_email_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
ALTER TABLE public."student_profiles" ADD CONSTRAINT "student_profiles_pkey" PRIMARY KEY (user_id);
ALTER TABLE public."student_profiles" ADD CONSTRAINT "student_profiles_roster_id_fkey" FOREIGN KEY (roster_id) REFERENCES public."student_roster"(id) ON DELETE CASCADE;
ALTER TABLE public."student_profiles" ADD CONSTRAINT "student_profiles_roster_id_key" UNIQUE (roster_id);
ALTER TABLE public."student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_admission_year_check" CHECK (admission_year >= 2000 AND admission_year <= 2100);
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL;
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_auth_user_id_key" UNIQUE (auth_user_id);
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public."classes"(id) ON DELETE RESTRICT;
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_data_status_check" CHECK (data_status = ANY (ARRAY['valid'::text, 'needs_review'::text]));
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_full_name_check" CHECK (btrim(full_name) <> ''::text);
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_major_id_fkey" FOREIGN KEY (major_id) REFERENCES public."majors"(id) ON DELETE RESTRICT;
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_pkey" PRIMARY KEY (id);
ALTER TABLE public."student_roster" ADD CONSTRAINT "student_roster_registration_status_check" CHECK (registration_status = ANY (ARRAY['pending'::text, 'registered'::text, 'inactive'::text]));
ALTER TABLE public."vokasi_admin_change_log" ADD CONSTRAINT "vokasi_admin_change_log_admin_auth_user_id_fkey" FOREIGN KEY (admin_auth_user_id) REFERENCES public.app_users(id);
ALTER TABLE public."vokasi_admin_change_log" ADD CONSTRAINT "vokasi_admin_change_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."vokasi_admin_notification_reads" ADD CONSTRAINT "vokasi_admin_notification_reads_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
ALTER TABLE public."vokasi_admin_notification_reads" ADD CONSTRAINT "vokasi_admin_notification_reads_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES public."student_attempts"(id) ON DELETE CASCADE;
ALTER TABLE public."vokasi_admin_notification_reads" ADD CONSTRAINT "vokasi_admin_notification_reads_pkey" PRIMARY KEY (admin_id, attempt_id);
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "question_body_present" CHECK (btrim(question) <> ''::text OR question_image_path IS NOT NULL);
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "question_correct_index" CHECK (correct_index < jsonb_array_length(options));
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "question_options_count" CHECK (jsonb_typeof(options) = 'array'::text AND jsonb_array_length(options) >= 2 AND jsonb_array_length(options) <= 6);
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "vokasi_question_drafts_category_check" CHECK (length(btrim(category)) >= 2 AND length(btrim(category)) <= 100);
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "vokasi_question_drafts_correct_index_check" CHECK (correct_index >= 0 AND correct_index <= 5);
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "vokasi_question_drafts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE RESTRICT;
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "vokasi_question_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "vokasi_question_drafts_source_number_check" CHECK (source_number IS NULL OR source_number >= 1 AND source_number <= 100000);
ALTER TABLE public."vokasi_question_drafts" ADD CONSTRAINT "vokasi_question_drafts_time_limit_seconds_check" CHECK (time_limit_seconds >= 5 AND time_limit_seconds <= 180);
ALTER TABLE public."vokasi_visual_asset_blocks" ADD CONSTRAINT "vokasi_visual_asset_blocks_pkey" PRIMARY KEY (source_number);
ALTER TABLE public."vokasi_visual_asset_blocks" ADD CONSTRAINT "vokasi_visual_asset_blocks_source_number_check" CHECK (source_number >= 451 AND source_number <= 500);
ALTER TABLE public."vokasi_web_bank_release" ADD CONSTRAINT "vokasi_web_bank_release_id_check" CHECK (id = 1);
ALTER TABLE public."vokasi_web_bank_release" ADD CONSTRAINT "vokasi_web_bank_release_pkey" PRIMARY KEY (id);
ALTER TABLE public."vokasi_web_bank_release" ADD CONSTRAINT "vokasi_web_bank_release_published_by_fkey" FOREIGN KEY (published_by) REFERENCES public.app_users(id) ON DELETE SET NULL;
ALTER TABLE public."vokasi_web_exam_activity_events" ADD CONSTRAINT "vokasi_web_exam_activity_events_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
ALTER TABLE public."vokasi_web_exam_activity_events" ADD CONSTRAINT "vokasi_web_exam_activity_events_detail_check" CHECK (char_length(detail) <= 240);
ALTER TABLE public."vokasi_web_exam_activity_events" ADD CONSTRAINT "vokasi_web_exam_activity_events_event_type_check" CHECK (event_type = ANY (ARRAY['tab_hidden'::text, 'tab_visible'::text, 'window_blur'::text, 'window_focus'::text, 'copy'::text, 'paste'::text, 'context_menu'::text, 'fullscreen_exit'::text, 'external_link'::text, 'ui_click'::text, 'answer_option_selected'::text]));
ALTER TABLE public."vokasi_web_exam_activity_events" ADD CONSTRAINT "vokasi_web_exam_activity_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."vokasi_web_exam_activity_events" ADD CONSTRAINT "vokasi_web_exam_activity_events_question_index_check" CHECK (question_index IS NULL OR question_index >= 0 AND question_index <= 1000);
ALTER TABLE public."vokasi_web_exam_activity_events" ADD CONSTRAINT "vokasi_web_exam_activity_events_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public."vokasi_web_exam_sessions"(id) ON DELETE CASCADE;
ALTER TABLE public."vokasi_web_exam_activity_events" ADD CONSTRAINT "vokasi_web_exam_activity_events_target_kind_check" CHECK (char_length(target_kind) <= 40);
ALTER TABLE public."vokasi_web_exam_activity_events" ADD CONSTRAINT "vokasi_web_exam_activity_events_target_label_check" CHECK (char_length(target_label) <= 120);
ALTER TABLE public."vokasi_web_exam_sessions" ADD CONSTRAINT "vokasi_web_exam_sessions_answers_check" CHECK (jsonb_typeof(answers) = 'array'::text);
ALTER TABLE public."vokasi_web_exam_sessions" ADD CONSTRAINT "vokasi_web_exam_sessions_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES public.app_users(id);
ALTER TABLE public."vokasi_web_exam_sessions" ADD CONSTRAINT "vokasi_web_exam_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."vokasi_web_exam_sessions" ADD CONSTRAINT "vokasi_web_exam_sessions_question_count_check" CHECK (question_count = ANY (ARRAY[10, 100]));
ALTER TABLE public."vokasi_web_exam_sessions" ADD CONSTRAINT "vokasi_web_exam_sessions_questions_check" CHECK (jsonb_typeof(questions) = 'array'::text);
ALTER TABLE public."vokasi_web_exam_sessions" ADD CONSTRAINT "vokasi_web_exam_sessions_status_check" CHECK (status = ANY (ARRAY['prepared'::text, 'active'::text, 'complete'::text, 'cancelled'::text]));
ALTER TABLE public."vokasi_web_import_drafts" ADD CONSTRAINT "vokasi_web_import_drafts_file_name_check" CHECK (length(file_name) >= 1 AND length(file_name) <= 250);
ALTER TABLE public."vokasi_web_import_drafts" ADD CONSTRAINT "vokasi_web_import_drafts_mode_check" CHECK (mode = ANY (ARRAY['append'::text, 'replace'::text]));
ALTER TABLE public."vokasi_web_import_drafts" ADD CONSTRAINT "vokasi_web_import_drafts_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.app_users(id) ON DELETE CASCADE;
ALTER TABLE public."vokasi_web_import_drafts" ADD CONSTRAINT "vokasi_web_import_drafts_payload_check" CHECK (jsonb_typeof(payload) = 'array'::text AND jsonb_array_length(payload) >= 1 AND jsonb_array_length(payload) <= 500);
ALTER TABLE public."vokasi_web_import_drafts" ADD CONSTRAINT "vokasi_web_import_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE public."vokasi_web_published_questions" ADD CONSTRAINT "vokasi_web_published_questions_pkey" PRIMARY KEY (source_number);
ALTER TABLE public."vokasi_web_published_questions" ADD CONSTRAINT "vokasi_web_published_questions_source_number_check" CHECK (source_number >= 1 AND source_number <= 100000);
ALTER TABLE public."vokasi_web_verified_results" ADD CONSTRAINT "vokasi_web_verified_results_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES public."student_attempts"(id) ON DELETE RESTRICT;
ALTER TABLE public."vokasi_web_verified_results" ADD CONSTRAINT "vokasi_web_verified_results_attempt_id_key" UNIQUE (attempt_id);
ALTER TABLE public."vokasi_web_verified_results" ADD CONSTRAINT "vokasi_web_verified_results_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES public.app_users(id);
ALTER TABLE public."vokasi_web_verified_results" ADD CONSTRAINT "vokasi_web_verified_results_pkey" PRIMARY KEY (session_id);
ALTER TABLE public."vokasi_web_verified_results" ADD CONSTRAINT "vokasi_web_verified_results_score_check" CHECK (score >= 0 AND score <= 100);
ALTER TABLE public."vokasi_web_verified_results" ADD CONSTRAINT "vokasi_web_verified_results_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public."vokasi_web_exam_sessions"(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS classes_unique_school_year_ci ON public.classes USING btree (major_id, grade_level, lower(btrim(class_name)), school_year);
CREATE UNIQUE INDEX IF NOT EXISTS majors_code_unique ON public.majors USING btree (code);
CREATE UNIQUE INDEX IF NOT EXISTS only_one_vokasi_super_admin ON public.school_admins USING btree (access_role) WHERE (access_role = 'super_admin'::text);
CREATE INDEX IF NOT EXISTS student_attempts_admin_timeline_idx ON public.student_attempts USING btree (completed_at_ms DESC);
CREATE INDEX IF NOT EXISTS student_attempts_auth_timeline_idx ON public.student_attempts USING btree (auth_user_id, completed_at_ms DESC);
CREATE INDEX IF NOT EXISTS student_attempts_incremental_idx ON public.student_attempts USING btree (created_at, id);
CREATE INDEX IF NOT EXISTS student_attempts_username_timeline_idx ON public.student_attempts USING btree (lower(username), completed_at_ms DESC);
CREATE INDEX IF NOT EXISTS vokasi_attempts_monitor_recent_idx ON public.student_attempts USING btree (completed_at_ms DESC);
CREATE INDEX IF NOT EXISTS student_email_challenges_user_purpose_idx ON public.student_email_challenges USING btree (user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS student_roster_admission_year_idx ON public.student_roster USING btree (admission_year);
CREATE INDEX IF NOT EXISTS student_roster_class_idx ON public.student_roster USING btree (class_id);
CREATE UNIQUE INDEX IF NOT EXISTS student_roster_identity_key_unique ON public.student_roster USING btree (identity_key) WHERE ((identity_key IS NOT NULL) AND (btrim(identity_key) <> ''::text));
CREATE INDEX IF NOT EXISTS student_roster_status_idx ON public.student_roster USING btree (registration_status);
CREATE UNIQUE INDEX IF NOT EXISTS student_roster_username_unique_ci ON public.student_roster USING btree (lower(btrim(username))) WHERE ((username IS NOT NULL) AND (btrim(username) <> ''::text));
CREATE INDEX IF NOT EXISTS vokasi_admin_changes_monitor_recent_idx ON public.vokasi_admin_change_log USING btree (changed_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_draft_category_idx ON public.vokasi_question_drafts USING btree (category, created_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_draft_created_idx ON public.vokasi_question_drafts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_exam_activity_recent_idx ON public.vokasi_web_exam_activity_events USING btree (occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS vokasi_exam_activity_session_idx ON public.vokasi_web_exam_activity_events USING btree (session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_exam_activity_student_idx ON public.vokasi_web_exam_activity_events USING btree (auth_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_web_exam_owner ON public.vokasi_web_exam_sessions USING btree (auth_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_web_verified_owner ON public.vokasi_web_verified_results USING btree (auth_user_id, verified_at DESC);

-- Map former auth user UUIDs to app_users.id before importing data.
-- Do not copy Supabase password hashes; use a secure invitation/reset flow.
COMMIT;
