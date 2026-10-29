-- One-time, 48-hour activation links for native administrator accounts.
-- Safe to apply after database/schema.sql.
CREATE TABLE IF NOT EXISTS public.app_admin_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  CONSTRAINT app_admin_invites_email_length CHECK (length(btrim(email)) BETWEEN 3 AND 254),
  CONSTRAINT app_admin_invites_display_name_length CHECK (length(btrim(display_name)) BETWEEN 3 AND 100),
  CONSTRAINT app_admin_invites_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_admin_invites_pending_email_unique_ci
  ON public.app_admin_invites (lower(btrim(email)))
  WHERE accepted_at IS NULL;
