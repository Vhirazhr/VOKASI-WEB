-- Make web-server verification proof impossible to claim through a direct client INSERT.
-- Legacy Android attempts still allowed, but are NOT proof of server grading.
DROP POLICY IF EXISTS student_attempts_insert_own ON public.student_attempts;
CREATE POLICY student_attempts_insert_own ON public.student_attempts FOR INSERT TO authenticated
WITH CHECK (
 auth_user_id=auth.uid()
 AND signature NOT LIKE 'WEB-SERVER-v1:%'
 AND EXISTS (SELECT 1 FROM public.student_roster r
    WHERE r.auth_user_id=auth.uid() AND r.registration_status='registered'
    AND lower(btrim(r.username))=lower(btrim(student_attempts.username)))
);
