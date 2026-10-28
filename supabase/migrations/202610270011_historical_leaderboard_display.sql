-- Historical leaderboard: display pre-server-verification completed mandatory sessions,
-- without reclassifying them as verified scores. Read-only; no legacy backfill.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_school_legacy_leaderboard()
RETURNS TABLE (
 username text,display_name text,major text,classroom text,
 mandatory_average integer,mandatory_days bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $body$
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
$body$;
REVOKE ALL ON FUNCTION public.vokasi_school_legacy_leaderboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_school_legacy_leaderboard() TO authenticated;
COMMIT;
