-- Reviewed answers in admin monitoring: completed & verified sessions only.
-- Never accept a roster ID or rely on a frontend-only admin check.
CREATE OR REPLACE FUNCTION public.vokasi_admin_completed_review(p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 s public.vokasi_web_exam_sessions%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_school_admin() THEN
  RAISE EXCEPTION 'Akses hanya untuk administrator aktif.';
 END IF;
 SELECT ses.* INTO s
 FROM public.vokasi_web_exam_sessions ses
 WHERE ses.id=p_session
   AND ses.status='complete'
   AND EXISTS(
     SELECT 1 FROM public.vokasi_web_verified_results vr
     WHERE vr.session_id=ses.id AND vr.auth_user_id=ses.auth_user_id
   );
 IF NOT FOUND THEN
   RAISE EXCEPTION 'Hasil terverifikasi tidak ditemukan.';
 END IF;
 RETURN (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',(q->>'id')::integer,
   'text',q->>'question',
   'category',q->>'category',
   'image_path',q->>'image_path',
   'options',q->'options',
   'correct_index',(q->>'answer_index')::integer,
   'selected_index',a->'selected_index',
   'status',a->>'status',
   'response_seconds',(a->>'response_seconds')::integer,
   'explanation',q->>'explanation'
  ) ORDER BY pos),'[]'::jsonb)
  FROM jsonb_array_elements(s.questions) WITH ORDINALITY qq(q,pos)
  LEFT JOIN LATERAL(
    SELECT value AS a FROM jsonb_array_elements(s.answers) WITH ORDINALITY aa(value,ord)
    WHERE ord=pos
  ) joined ON true
 );
END;
$function$;
REVOKE ALL ON FUNCTION public.vokasi_admin_completed_review(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_admin_completed_review(uuid) TO authenticated;
