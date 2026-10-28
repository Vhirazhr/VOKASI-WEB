-- Passive, transparent exam activity reporting for VOKASI web.
-- Records only browser events on the active quiz page; never reads clipboard contents,
-- other tabs, search queries, or names of apps opened outside this page.
BEGIN;

CREATE TABLE IF NOT EXISTS public.vokasi_web_exam_activity_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.vokasi_web_exam_sessions(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'tab_hidden','tab_visible','window_blur','window_focus',
    'copy','paste','context_menu','fullscreen_exit',
    'external_link','ui_click','answer_option_selected'
  )),
  question_index integer CHECK (question_index IS NULL OR question_index BETWEEN 0 AND 1000),
  target_label text NOT NULL DEFAULT '' CHECK (char_length(target_label) <= 120),
  target_kind text NOT NULL DEFAULT '' CHECK (char_length(target_kind) <= 40),
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 240),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS vokasi_exam_activity_recent_idx
  ON public.vokasi_web_exam_activity_events(occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS vokasi_exam_activity_student_idx
  ON public.vokasi_web_exam_activity_events(auth_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_exam_activity_session_idx
  ON public.vokasi_web_exam_activity_events(session_id, occurred_at DESC);

ALTER TABLE public.vokasi_web_exam_activity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vokasi_web_exam_activity_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.vokasi_web_exam_activity_events TO service_role;

CREATE OR REPLACE FUNCTION public.vokasi_web_record_exam_activity(
  p_session uuid,
  p_event_type text,
  p_question_index integer DEFAULT NULL,
  p_target_label text DEFAULT NULL,
  p_target_kind text DEFAULT NULL,
  p_detail text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.vokasi_web_record_exam_activity(uuid,text,integer,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_record_exam_activity(uuid,text,integer,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_exam_activity(
  p_days integer DEFAULT 7,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_student uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.vokasi_admin_exam_activity(integer,integer,integer,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_exam_activity(integer,integer,integer,uuid) TO authenticated;

COMMIT;
