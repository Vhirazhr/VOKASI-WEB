-- Intentionally public, bounded showcase. No base-table grants or scoring changes.
BEGIN;
CREATE SCHEMA IF NOT EXISTS vokasi_landing_private;
REVOKE ALL ON SCHEMA vokasi_landing_private FROM PUBLIC;
GRANT USAGE ON SCHEMA vokasi_landing_private TO anon, authenticated;

CREATE OR REPLACE FUNCTION vokasi_landing_private.top_school_scores()
RETURNS TABLE(rank bigint, display_name text, classroom text, mandatory_average integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
WITH daily AS (
  SELECT a.auth_user_id, a.score,
    ROW_NUMBER() OVER (
      PARTITION BY a.auth_user_id,
        (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      ORDER BY a.completed_at_ms DESC, a.session_key DESC
    ) AS attempt_rank
  FROM public.vokasi_verified_attempts a
  WHERE a.practice_category IS NULL
    AND (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      >= DATE_TRUNC('quarter', NOW() AT TIME ZONE 'Asia/Jakarta')::date
), scores AS (
  SELECT auth_user_id, ROUND(AVG(score))::integer AS average, COUNT(*) AS days
  FROM daily WHERE attempt_rank = 1 GROUP BY auth_user_id
), eligible AS (
  SELECT r.id, CONCAT_WS(' ', SPLIT_PART(BTRIM(r.full_name), ' ', 1),
    NULLIF(SPLIT_PART(BTRIM(r.full_name), ' ', 2), '')) AS name,
    c.class_name, s.average, s.days
  FROM scores s JOIN public.student_roster r ON r.auth_user_id = s.auth_user_id
  JOIN public.classes c ON c.id = r.class_id
  JOIN public.majors m ON m.id = c.major_id
  WHERE r.registration_status = 'registered' AND r.username IS NOT NULL
    AND s.average IS NOT NULL
)
SELECT ROW_NUMBER() OVER (ORDER BY average DESC, days DESC, name COLLATE "id-ID-x-icu", id),
  name, class_name, average
FROM eligible ORDER BY average DESC, days DESC, name COLLATE "id-ID-x-icu", id
LIMIT 10;
$$;
REVOKE ALL ON FUNCTION vokasi_landing_private.top_school_scores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION vokasi_landing_private.top_school_scores() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.vokasi_public_leaderboard()
RETURNS TABLE(rank bigint, display_name text, classroom text, mandatory_average integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM vokasi_landing_private.top_school_scores() ORDER BY rank; $$;
REVOKE ALL ON FUNCTION public.vokasi_public_leaderboard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vokasi_public_leaderboard() TO anon, authenticated;
COMMENT ON FUNCTION public.vokasi_public_leaderboard() IS
  'Public top ten: abbreviated name, class and verified compulsory score only. Same quarter/daily-latest average as school dashboard. No raw student access.';
COMMIT;
