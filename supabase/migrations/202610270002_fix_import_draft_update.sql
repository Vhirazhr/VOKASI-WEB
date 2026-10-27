-- Restore correct edit semantics for owned, admin-only import drafts.
GRANT UPDATE ON public.vokasi_web_import_drafts TO authenticated;
CREATE POLICY vokasi_web_import_admin_update ON public.vokasi_web_import_drafts
 FOR UPDATE TO authenticated
 USING (public.is_school_admin() AND owner_id=auth.uid())
 WITH CHECK (public.is_school_admin() AND owner_id=auth.uid());
