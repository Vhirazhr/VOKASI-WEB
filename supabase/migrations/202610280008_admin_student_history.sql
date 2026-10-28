-- Admin-side recent student learning history (Android parity).
-- Returns score metadata only, never an exam answer key.
CREATE OR REPLACE FUNCTION public.vokasi_admin_student_history(p_student uuid,p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Akses hanya untuk administrator aktif.';
 END IF;
 IF p_student IS NULL OR p_limit < 1 OR p_limit > 100 THEN
  RAISE EXCEPTION 'Parameter permintaan tidak valid.';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM public.student_roster
  WHERE auth_user_id=p_student AND registration_status='registered'
 ) THEN
  RETURN '[]'::jsonb;
 END IF;
 RETURN (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'session_key',r.session_key,
    'completed_at_ms',r.completed_at_ms,
    'score',r.score,'correct',r.correct,
    'question_count',r.question_count,
    'practice_category',r.practice_category
  ) ORDER BY r.completed_at_ms DESC),'[]'::jsonb)
  FROM (
   SELECT session_key,completed_at_ms,score,correct,question_count,practice_category
   FROM public.vokasi_verified_attempts
   WHERE auth_user_id=p_student AND practice_category IS NULL
   ORDER BY completed_at_ms DESC,id DESC
   LIMIT p_limit
  ) r
 );
END;
$function$;
REVOKE ALL ON FUNCTION public.vokasi_admin_student_history(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_student_history(uuid,integer) TO authenticated;
