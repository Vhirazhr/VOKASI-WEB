-- Read-only, student-owned exam progress for the focus-mode question navigator.
-- This returns only verdicts already decided by the server, never future questions,
-- answer keys, pending selections, or other pupils' responses.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_web_quiz_progress(p_session uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 WITH owned AS (
   SELECT s.answers
   FROM public.vokasi_web_exam_sessions s
   WHERE s.id=p_session
     AND s.auth_user_id=(SELECT auth.uid())
     AND s.status IN ('active','complete')
 ), verdicts AS (
   SELECT upper(e.value->>'status') AS verdict,e.ordinality AS n
   FROM owned s
   CROSS JOIN LATERAL jsonb_array_elements(s.answers) WITH ORDINALITY e(value,ordinality)
 )
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM owned) THEN NULL
   ELSE jsonb_build_object(
     'correct', (SELECT count(*) FROM verdicts WHERE verdict='BENAR'),
     'wrong', (SELECT count(*) FROM verdicts WHERE verdict='SALAH'),
     'timeout', (SELECT count(*) FROM verdicts WHERE verdict='TIMEOUT'),
     'statuses', coalesce((SELECT jsonb_agg(verdict ORDER BY n) FROM verdicts),'[]'::jsonb)
   )
 END;
$fn$;
REVOKE ALL ON FUNCTION public.vokasi_web_quiz_progress(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_quiz_progress(uuid) TO authenticated;
COMMIT;
