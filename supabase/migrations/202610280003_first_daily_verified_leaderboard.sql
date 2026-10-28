-- The first server-verified mandatory completion of each WIB day is final for that day's official ranking.
-- Later repeats are kept for the student's history but cannot lower or raise the official score.
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
$function$
;
