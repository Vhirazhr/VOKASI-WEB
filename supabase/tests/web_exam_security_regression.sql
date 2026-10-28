-- Non-destructive server regression suite for VOKASI-WEB.
-- Run manually in Supabase SQL Editor as a project owner.
-- The whole script ROLLS BACK; no test attempts, sessions, or XP are retained.
BEGIN;
SELECT set_config(
 'request.jwt.claim.sub',
 (SELECT auth_user_id::text FROM public.student_roster
  WHERE registration_status='registered' AND auth_user_id IS NOT NULL
  ORDER BY created_at LIMIT 1),
 true
);
DO $test$
DECLARE
 p jsonb; d jsonb; begun jsonb; response jsonb; reply jsonb; review jsonb;
 v_session_id uuid; i integer; bad integer; total_seconds integer; current_questions integer;
 answer_count integer; proof_count integer; unverified integer;
 timeout_status text; timeout_selection jsonb;
BEGIN
 -- Idempotent preparation and randomization rules.
 p:=public.vokasi_web_prepare_session(NULL);
 d:=public.vokasi_web_prepare_session(NULL);
 IF p->>'session_id' IS DISTINCT FROM d->>'session_id' THEN
  RAISE EXCEPTION 'Concurrent preparation changed the session ID';
 END IF;
 v_session_id=(p->>'session_id')::uuid;
 SELECT question_count,
   (SELECT COALESCE(sum((q->>'seconds')::int),0) FROM jsonb_array_elements(questions) q),
   (SELECT count(*) FROM jsonb_array_elements(questions) q
     JOIN public.vokasi_visual_asset_blocks b
       ON (q->>'id')::int=b.source_number AND q->>'image_path'=b.blocked_image_path)
 INTO current_questions,total_seconds,bad
 FROM public.vokasi_web_exam_sessions WHERE id=v_session_id;
 IF current_questions<>100 OR total_seconds<>1800 OR bad<>0 THEN
   RAISE EXCEPTION 'Invalid 100-question blueprint: % questions, % seconds, % blocked',current_questions,total_seconds,bad;
 END IF;
 begun:=public.vokasi_web_begin_session(v_session_id);
 IF begun->>'status'<>'active' OR begun->'question' ? 'answer_index' THEN
   RAISE EXCEPTION 'Wrong start status or answer key leaked';
 END IF;
 d:=public.vokasi_web_prepare_session(NULL);
 IF d->>'session_id' IS DISTINCT FROM p->>'session_id' THEN
   RAISE EXCEPTION 'Refresh replaced an active session';
 END IF;

 -- Practice: answer duplication, server scoring and full-device review.
 -- End the prepared compulsory session without recording any results.
 UPDATE public.vokasi_web_exam_sessions SET status='cancelled' WHERE id=v_session_id;
 p:=public.vokasi_web_prepare_session('Pembagian');
 v_session_id=(p->>'session_id')::uuid;
 begun:=public.vokasi_web_begin_session(v_session_id);
 FOR i IN 0..9 LOOP
   UPDATE public.vokasi_web_exam_sessions SET
     question_started_at=clock_timestamp()-interval '1 second',
     question_deadline_at=clock_timestamp()+interval '45 seconds',
     overall_deadline_at=clock_timestamp()+interval '30 minutes'
   WHERE id=v_session_id;
   response:=public.vokasi_web_submit_answer(v_session_id,i,0);
   IF i=0 THEN
     reply:=public.vokasi_web_submit_answer(v_session_id,i,0);
     SELECT jsonb_array_length(answers) INTO answer_count
       FROM public.vokasi_web_exam_sessions WHERE id=v_session_id;
     IF answer_count<>1 THEN RAISE EXCEPTION 'Duplicate answer was counted twice'; END IF;
   END IF;
 END LOOP;
 SELECT count(*) INTO proof_count FROM public.vokasi_web_verified_results v WHERE v.session_id=v_session_id;
 IF proof_count<>1 THEN RAISE EXCEPTION 'Missing verified result'; END IF;
 review:=public.vokasi_web_completed_review(v_session_id);
 IF jsonb_array_length(review)<>10 OR NOT review->0 ? 'correct_index' THEN
   RAISE EXCEPTION 'Cross-device review incomplete';
 END IF;

 -- A choice clicked but never submitted remains client-only. Once its timer
 -- expires, server state must contain a TIMEOUT with no selected answer.
 p:=public.vokasi_web_prepare_session('Pembagian');
 v_session_id=(p->>'session_id')::uuid;
 begun:=public.vokasi_web_begin_session(v_session_id);
 UPDATE public.vokasi_web_exam_sessions
 SET question_started_at=clock_timestamp()-interval '5 seconds',
     question_deadline_at=clock_timestamp()-interval '1 second',
     overall_deadline_at=clock_timestamp()+interval '30 minutes'
 WHERE id=v_session_id;
 response:=public.vokasi_web_get_quiz_state(v_session_id);
 SELECT answers->0->>'status',answers->0->'selected_index'
 INTO timeout_status,timeout_selection
 FROM public.vokasi_web_exam_sessions WHERE id=v_session_id;
 IF timeout_status IS DISTINCT FROM 'TIMEOUT'
    OR timeout_selection IS DISTINCT FROM 'null'::jsonb THEN
   RAISE EXCEPTION 'Unsubmitted choice was persisted: status %, selection %',
     timeout_status,timeout_selection;
 END IF;
 PERFORM public.vokasi_web_cancel_session(v_session_id);

 IF has_table_privilege('authenticated','public.student_attempts','INSERT') THEN
   RAISE EXCEPTION 'Unverified client score insert path remains open';
 END IF;
 SELECT count(*) INTO unverified FROM public.vokasi_verified_attempts
 WHERE signature NOT LIKE 'WEB-SERVER-v1:%';
 IF unverified>0 THEN RAISE EXCEPTION 'Unverified attempt leaked into report view'; END IF;
END;
$test$;
ROLLBACK;
