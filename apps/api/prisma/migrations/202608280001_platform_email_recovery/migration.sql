ALTER TABLE public.platform_users
  ADD COLUMN verified_email VARCHAR(320),
  ADD COLUMN email_verified_at TIMESTAMPTZ(3);

CREATE TABLE public.platform_recovery_tokens (
  user_id UUID NOT NULL REFERENCES public.platform_users(user_id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('verify', 'reset')),
  email VARCHAR(320) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  token_version INTEGER NOT NULL,
  expires_at TIMESTAMPTZ(3) NOT NULL,
  consumed_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, purpose)
);
ALTER TABLE public.platform_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_recovery_tokens FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_recovery_self ON public.platform_recovery_tokens
  USING (user_id = app_private.current_user_id())
  WITH CHECK (user_id = app_private.current_user_id());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_recovery_tokens TO phms_app;
  END IF;
END $$;
