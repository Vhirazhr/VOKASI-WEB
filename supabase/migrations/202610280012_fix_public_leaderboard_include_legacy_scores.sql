-- Restore all eligible mandatory-score rankings, including validated legacy attempts.
-- Prefer server-verified results for any student/day; use validated legacy results only
-- when that student has no server-verified mandatory attempt on the same WIB day.
CREATE OR REPLACE FUNCTION vokasi_landing_private.top_school_scores()
RETURNS TABLE (
  rank bigint,
  display_name text,
  classroom text,
  mandatory_average integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
WITH verified_days AS (
  SELECT
    a.auth_user_id,
    a.completed_at_ms,
    a.session_key,
    a.score,
    a.correct,
    a.answered,
    a.question_count,
    (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date AS practice_day
  FROM public.vokasi_verified_attempts AS a
  WHERE a.practice_category IS NULL
    AND (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      >= DATE_TRUNC('quarter', NOW() AT TIME ZONE 'Asia/Jakarta')::date
),
verified AS (
  SELECT
    auth_user_id,
    score,
    completed_at_ms,
    session_key
  FROM verified_days
  WHERE question_count = 100
    AND answered BETWEEN 0 AND question_count
    AND correct BETWEEN 0 AND answered
    AND score = ROUND(correct::numeric * 100 / question_count)::integer
),
legacy AS (
  SELECT
    a.auth_user_id,
    a.score,
    a.completed_at_ms,
    a.session_key
  FROM public.student_attempts AS a
  WHERE a.practice_category IS NULL
    AND a.auth_user_id IS NOT NULL
    AND a.signature NOT LIKE 'WEB-SERVER-v1:%'
    AND a.question_count = 100
    AND a.answered BETWEEN 0 AND a.question_count
    AND a.correct BETWEEN 0 AND a.answered
    AND a.score = ROUND(a.correct::numeric * 100 / a.question_count)::integer
    AND (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      >= DATE_TRUNC('quarter', NOW() AT TIME ZONE 'Asia/Jakarta')::date
    AND NOT EXISTS (
      SELECT 1
      FROM verified_days AS v
      WHERE v.auth_user_id = a.auth_user_id
        AND v.practice_day =
          (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
    )
),
all_attempts AS (
  SELECT auth_user_id, score, completed_at_ms, session_key FROM verified
  UNION ALL
  SELECT auth_user_id, score, completed_at_ms, session_key FROM legacy
),
daily AS (
  SELECT
    a.auth_user_id,
    a.score,
    (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date AS practice_day,
    ROW_NUMBER() OVER (
      PARTITION BY
        a.auth_user_id,
        (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      ORDER BY a.completed_at_ms ASC, a.session_key ASC
    ) AS attempt_rank
  FROM all_attempts AS a
),
scores AS (
  SELECT
    auth_user_id,
    ROUND(AVG(score))::integer AS average,
    COUNT(*) AS days
  FROM daily
  WHERE attempt_rank = 1
  GROUP BY auth_user_id
),
eligible AS (
  SELECT
    r.id,
    CONCAT_WS(
      ' ',
      SPLIT_PART(BTRIM(r.full_name), ' ', 1),
      NULLIF(SPLIT_PART(BTRIM(r.full_name), ' ', 2), '')
    ) AS name,
    c.class_name,
    s.average,
    s.days
  FROM scores AS s
  JOIN public.student_roster AS r ON r.auth_user_id = s.auth_user_id
  JOIN public.classes AS c ON c.id = r.class_id
  JOIN public.majors AS m ON m.id = c.major_id
  WHERE r.registration_status = 'registered'
    AND r.username IS NOT NULL
    AND s.average IS NOT NULL
)
SELECT
  ROW_NUMBER() OVER (
    ORDER BY average DESC, days DESC, name COLLATE "id-ID-x-icu", id
  ),
  name,
  class_name,
  average
FROM eligible
ORDER BY average DESC, days DESC, name COLLATE "id-ID-x-icu", id;
$function$;
