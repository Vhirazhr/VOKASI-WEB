-- Make repeat status explicit using server-verified daily completions.
-- This does not modify attempts, scores, XP, or answer data.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_web_quiz_progress(p_session uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
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
REVOKE ALL ON FUNCTION public.vokasi_web_quiz_progress(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_quiz_progress(uuid) TO authenticated;
COMMIT;
