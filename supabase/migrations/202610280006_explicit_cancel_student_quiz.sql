-- Students can explicitly end an unfinished exam without creating a result,
-- awarding XP, or resuming it the next time they enter the quiz.
-- The check and update are atomic and limited to the authenticated owner.
BEGIN;
CREATE OR REPLACE FUNCTION public.vokasi_web_cancel_session(p_session uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog','public'
AS $function$
DECLARE
 v_uid uuid := (SELECT auth.uid());
 v_status text;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Harus masuk sebagai siswa.'; END IF;

 SELECT status INTO v_status
 FROM public.vokasi_web_exam_sessions
 WHERE id=p_session AND auth_user_id=v_uid
 FOR UPDATE;

 IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan untuk akun ini.'; END IF;

 IF v_status IN ('active','prepared') THEN
   UPDATE public.vokasi_web_exam_sessions
   SET status='cancelled'
   WHERE id=p_session AND auth_user_id=v_uid;
   RETURN jsonb_build_object('status','cancelled','session_id',p_session);
 END IF;

 -- Completed scores are immutable; a prior cancellation is idempotent.
 RETURN jsonb_build_object('status',v_status,'session_id',p_session);
END;
$function$;
REVOKE ALL ON FUNCTION public.vokasi_web_cancel_session(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.vokasi_web_cancel_session(uuid) TO authenticated;
COMMIT;
