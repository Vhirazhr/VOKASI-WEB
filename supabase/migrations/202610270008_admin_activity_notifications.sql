-- Admin monitoring: read-only verified school events and per-admin notification receipts.
-- No modifications to attempts, scores, accounts, or exam sessions.
BEGIN;
CREATE TABLE IF NOT EXISTS public.vokasi_admin_notification_reads (
 admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 attempt_id uuid NOT NULL REFERENCES public.student_attempts(id) ON DELETE CASCADE,
 read_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (admin_id,attempt_id)
);
ALTER TABLE public.vokasi_admin_notification_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vokasi_admin_notification_reads FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS vokasi_attempts_monitor_recent_idx ON public.student_attempts(completed_at_ms DESC);
CREATE INDEX IF NOT EXISTS vokasi_admin_changes_monitor_recent_idx ON public.vokasi_admin_change_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS vokasi_question_edits_monitor_recent_idx ON vokasi_private.vokasi_question_edit_audit(changed_at DESC);

CREATE OR REPLACE FUNCTION public.vokasi_admin_get_notifications(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.vokasi_admin_get_notifications(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_get_notifications(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_mark_notifications_read(p_attempt_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.vokasi_admin_mark_notifications_read(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_mark_notifications_read(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_admin_monitor_activity(
 p_kind text DEFAULT 'all',
 p_days integer DEFAULT 30,
 p_limit integer DEFAULT 30,
 p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
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
$$;
REVOKE ALL ON FUNCTION public.vokasi_admin_monitor_activity(text,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_monitor_activity(text,integer,integer,integer) TO authenticated;
COMMIT;
