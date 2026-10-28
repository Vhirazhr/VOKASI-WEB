-- Public landing leaderboard: preserve the first verified mandatory score of each WIB day
-- and mask student names before the public RPC returns any rows.
BEGIN;

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
WITH daily AS (
  SELECT
    a.auth_user_id,
    a.score,
    ROW_NUMBER() OVER (
      PARTITION BY
        a.auth_user_id,
        (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      ORDER BY a.completed_at_ms ASC, a.session_key ASC
    ) AS attempt_rank
  FROM public.vokasi_verified_attempts AS a
  WHERE a.practice_category IS NULL
    AND (TO_TIMESTAMP(a.completed_at_ms / 1000.0) AT TIME ZONE 'Asia/Jakarta')::date
      >= DATE_TRUNC('quarter', NOW() AT TIME ZONE 'Asia/Jakarta')::date
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
ORDER BY average DESC, days DESC, name COLLATE "id-ID-x-icu", id
LIMIT 10;
$function$;

CREATE OR REPLACE FUNCTION public.vokasi_public_leaderboard()
RETURNS TABLE (
  rank bigint,
  display_name text,
  classroom text,
  mandatory_average integer
)
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

COMMIT;
