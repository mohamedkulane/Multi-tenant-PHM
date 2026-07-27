-- M2 PostgreSQL defense-in-depth boundary.
-- Tenant context is transaction-local and must be set by the API before any
-- tenant-owned query. FORCE ROW LEVEL SECURITY also protects table owners.

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_private.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_private.current_membership_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.membership_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_private.sync_tenant_login_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.tenant_login_directory (tenant_id, slug, status, updated_at)
  VALUES (NEW.id, NEW.slug, NEW.status, CURRENT_TIMESTAMP)
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    slug = EXCLUDED.slug,
    status = EXCLUDED.status,
    updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION app_private.sync_tenant_login_directory() FROM PUBLIC;

CREATE TRIGGER tenants_sync_login_directory
AFTER INSERT OR UPDATE OF slug, status ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION app_private.sync_tenant_login_directory();

ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_slug_normalized CHECK (slug = lower(slug)),
  ADD CONSTRAINT tenants_currency_code_uppercase CHECK (currency_code = upper(currency_code));

ALTER TABLE public.tenant_login_directory
  ADD CONSTRAINT tenant_login_directory_slug_normalized CHECK (slug = lower(slug));

ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_username_normalized CHECK (username = lower(username));

ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_username_normalized CHECK (username = lower(username)),
  ADD CONSTRAINT invitations_lifecycle_check CHECK (
    accepted_at IS NULL OR revoked_at IS NULL
  );

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at);

ALTER TABLE public.users
  ADD CONSTRAINT users_email_normalized CHECK (email IS NULL OR email = lower(email));

-- Global identity rows are visible only to the identity currently established
-- inside the transaction. Tenant-owned rows additionally require tenant match.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_self_isolation ON public.users
  USING (id = app_private.current_user_id())
  WITH CHECK (id = app_private.current_user_id());

ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_users FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_users_self_isolation ON public.platform_users
  USING (user_id = app_private.current_user_id())
  WITH CHECK (user_id = app_private.current_user_id());

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_isolation ON public.tenants
  USING (id = app_private.current_tenant_id())
  WITH CHECK (id = app_private.current_tenant_id());

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches FORCE ROW LEVEL SECURITY;
CREATE POLICY branches_tenant_isolation ON public.branches
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_memberships_isolation ON public.tenant_memberships
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.membership_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_branches FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_branches_isolation ON public.membership_branches
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_tenant_isolation ON public.sessions
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_tenant_isolation ON public.invitations
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.invitation_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_branches FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_branches_isolation ON public.invitation_branches
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select_tenant ON public.audit_logs
  FOR SELECT
  USING (tenant_id = app_private.current_tenant_id());
CREATE POLICY audit_logs_insert_tenant ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    tenant_id = app_private.current_tenant_id()
    AND (
      actor_membership_id IS NULL
      OR actor_membership_id = app_private.current_membership_id()
    )
  );

CREATE OR REPLACE FUNCTION app_private.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only'
    USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION app_private.reject_audit_mutation();

-- Apply runtime privileges only when the documented application role already
-- exists. This keeps migrations portable for CI and fresh developer machines.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT USAGE ON SCHEMA public, app_private TO phms_app;
    GRANT EXECUTE ON FUNCTION
      app_private.current_tenant_id(),
      app_private.current_user_id(),
      app_private.current_membership_id()
    TO phms_app;

    GRANT SELECT ON public.tenant_login_directory, public.platform_settings TO phms_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      public.users,
      public.platform_users,
      public.tenants,
      public.branches,
      public.tenant_memberships,
      public.membership_branches,
      public.sessions,
      public.invitations,
      public.invitation_branches
    TO phms_app;
    GRANT SELECT, INSERT ON public.audit_logs TO phms_app;
    GRANT USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq TO phms_app;
  END IF;
END
$$;
