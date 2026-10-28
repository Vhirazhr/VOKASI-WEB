-- Personalised recommendations from the five most recent *server-verified*
-- finished sessions. Separate incorrect answers from unanswered timeouts.
-- Read-only and owned by auth.uid(); no answer key or other pupil data returned.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_school_weak_topics()
RETURNS TABLE(category text, answered bigint, correct bigint, wrong bigint, timeout bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
WITH recent AS (
 SELECT s.questions,s.answers
 FROM public.vokasi_web_exam_sessions AS s
 WHERE s.auth_user_id=(SELECT auth.uid())
   AND s.status='complete'
   AND EXISTS (
      SELECT 1 FROM public.vokasi_web_verified_results AS v
      WHERE v.session_id=s.id AND v.auth_user_id=s.auth_user_id
   )
 ORDER BY s.completed_at DESC,s.id DESC
 LIMIT 5
), question_results AS (
 SELECT q.value->>'category' AS subject,
        coalesce(upper(a.value->>'status'),'') AS verdict
 FROM recent s
 CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(s.questions)
   WITH ORDINALITY AS q(value,position)
 LEFT JOIN LATERAL pg_catalog.jsonb_array_elements(s.answers)
   WITH ORDINALITY AS a(value,position)
   ON a.position=q.position
)
SELECT subject::text,
 count(*) FILTER (WHERE verdict IN ('BENAR','SALAH'))::bigint AS answered,
 count(*) FILTER (WHERE verdict='BENAR')::bigint AS correct,
 count(*) FILTER (WHERE verdict='SALAH')::bigint AS wrong,
 count(*) FILTER (WHERE verdict='TIMEOUT')::bigint AS timeout
FROM question_results
WHERE subject IS NOT NULL AND btrim(subject)<>''
GROUP BY subject
ORDER BY wrong DESC,subject ASC;
$fn$;
REVOKE ALL ON FUNCTION public.vokasi_school_weak_topics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_school_weak_topics() TO authenticated;
COMMIT;
