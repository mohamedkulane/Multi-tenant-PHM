-- M6 platform identity, plan enforcement, tenant administration, and controlled support access.

ALTER TABLE public.platform_login_directory
  ADD CONSTRAINT platform_login_directory_user_fkey
  FOREIGN KEY (user_id) REFERENCES public.platform_users (user_id) ON DELETE CASCADE;

ALTER TABLE public.platform_sessions
  ADD CONSTRAINT platform_sessions_user_fkey
  FOREIGN KEY (user_id) REFERENCES public.platform_users (user_id) ON DELETE CASCADE;

ALTER TABLE public.platform_audit_logs
  ADD CONSTRAINT platform_audit_actor_fkey
  FOREIGN KEY (actor_user_id) REFERENCES public.platform_users (user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT platform_audit_tenant_fkey
  FOREIGN KEY (target_tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT;

ALTER TABLE public.tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_tenant_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_subscriptions_plan_fkey
  FOREIGN KEY (plan_code) REFERENCES public.plans (code) ON DELETE RESTRICT;

ALTER TABLE public.tenant_branding
  ADD CONSTRAINT tenant_branding_tenant_fkey
  FOREIGN KEY (tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  ADD CONSTRAINT tenant_branding_colors_check
  CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$' AND accent_color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE public.support_access_requests
  ADD CONSTRAINT support_request_tenant_fkey
  FOREIGN KEY (target_tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_request_requester_fkey
  FOREIGN KEY (requested_by_user_id) REFERENCES public.platform_users (user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_request_approver_fkey
  FOREIGN KEY (approved_by_user_id) REFERENCES public.platform_users (user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_request_reason_check
  CHECK (length(btrim(reason)) >= 10),
  ADD CONSTRAINT support_request_approval_check
  CHECK (
    (status = 'PENDING' AND approved_by_user_id IS NULL AND approved_at IS NULL AND expires_at IS NULL)
    OR
    (status = 'APPROVED' AND approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL
      AND expires_at > approved_at AND expires_at <= approved_at + interval '4 hours'
      AND approved_by_user_id <> requested_by_user_id)
    OR status IN ('REJECTED', 'REVOKED', 'EXPIRED')
  );

ALTER TABLE public.support_sessions
  ADD CONSTRAINT support_session_platform_user_fkey
  FOREIGN KEY (platform_user_id) REFERENCES public.platform_users (user_id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_session_tenant_fkey
  FOREIGN KEY (target_tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_session_expiry_check
  CHECK (expires_at > created_at);

CREATE OR REPLACE FUNCTION app_private.current_platform_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role::text
  FROM public.platform_users
  WHERE user_id = app_private.current_user_id() AND active
$$;

REVOKE ALL ON FUNCTION app_private.current_platform_role() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.require_platform_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.platform_admin', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'platform state may only be changed by an authorized platform workflow'
      USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION app_private.reject_platform_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform audit logs are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION app_private.sync_platform_login_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  target_user_id := COALESCE(to_jsonb(NEW) ->> 'user_id', to_jsonb(NEW) ->> 'id')::uuid;
  INSERT INTO public.platform_login_directory (user_id, email, active, updated_at)
  SELECT pu.user_id, lower(u.email), pu.active AND u.status = 'ACTIVE', now()
  FROM public.platform_users pu
  JOIN public.users u ON u.id = pu.user_id
  WHERE pu.user_id = target_user_id AND u.email IS NOT NULL
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email, active = EXCLUDED.active, updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_users_sync_login
AFTER INSERT OR UPDATE ON public.platform_users
FOR EACH ROW EXECUTE FUNCTION app_private.sync_platform_login_directory();

CREATE TRIGGER users_sync_platform_login
AFTER UPDATE OF email, status ON public.users
FOR EACH ROW EXECUTE FUNCTION app_private.sync_platform_login_directory();

CREATE TRIGGER plans_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.plans
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_write();

CREATE TRIGGER tenant_subscriptions_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_subscriptions
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_write();

CREATE TRIGGER tenant_branding_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_branding
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_write();

CREATE TRIGGER support_requests_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.support_access_requests
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_write();

CREATE TRIGGER support_sessions_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.support_sessions
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_write();

CREATE TRIGGER platform_audit_append_only
BEFORE UPDATE OR DELETE ON public.platform_audit_logs
FOR EACH ROW EXECUTE FUNCTION app_private.reject_platform_audit_mutation();

ALTER TABLE public.platform_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_sessions_self ON public.platform_sessions
  USING (user_id = app_private.current_user_id())
  WITH CHECK (user_id = app_private.current_user_id());

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_audit_select ON public.platform_audit_logs
  FOR SELECT USING (
    actor_user_id = app_private.current_user_id()
    OR app_private.current_platform_role() IN ('SUPER_ADMIN', 'AUDITOR')
  );
CREATE POLICY platform_audit_insert ON public.platform_audit_logs
  FOR INSERT WITH CHECK (actor_user_id = app_private.current_user_id());

ALTER TABLE public.support_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_access_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY support_requests_platform ON public.support_access_requests
  USING (
    requested_by_user_id = app_private.current_user_id()
    OR approved_by_user_id = app_private.current_user_id()
    OR app_private.current_platform_role() IN ('SUPER_ADMIN', 'AUDITOR')
  )
  WITH CHECK (
    requested_by_user_id = app_private.current_user_id()
    OR app_private.current_platform_role() = 'SUPER_ADMIN'
  );

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY support_sessions_platform ON public.support_sessions
  USING (
    platform_user_id = app_private.current_user_id()
    OR app_private.current_platform_role() IN ('SUPER_ADMIN', 'AUDITOR')
  )
  WITH CHECK (
    platform_user_id = app_private.current_user_id()
    OR app_private.current_platform_role() = 'SUPER_ADMIN'
  );

ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_subscriptions_isolation ON public.tenant_subscriptions
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

ALTER TABLE public.tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_branding FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_branding_isolation ON public.tenant_branding
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

CREATE OR REPLACE FUNCTION app_private.tenant_limit(limit_key text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(ts.overrides ->> limit_key, '')::integer,
    NULLIF(p.limits ->> limit_key, '')::integer,
    2147483647
  )
  FROM public.tenants t
  LEFT JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id
  JOIN public.plans p ON p.code = COALESCE(ts.plan_code, t.plan_code)
  WHERE t.id = app_private.current_tenant_id()
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_tenant_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  limit_key text;
  current_count bigint;
  maximum integer;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'branches' THEN
      limit_key := 'maxBranches';
      SELECT count(*) INTO current_count FROM public.branches
        WHERE tenant_id = NEW.tenant_id;
    WHEN 'tenant_memberships' THEN
      limit_key := 'maxUsers';
      SELECT count(*) INTO current_count FROM public.tenant_memberships
        WHERE tenant_id = NEW.tenant_id AND status <> 'REVOKED';
    WHEN 'products' THEN
      limit_key := 'maxProducts';
      SELECT count(*) INTO current_count FROM public.products
        WHERE tenant_id = NEW.tenant_id;
    WHEN 'sales' THEN
      limit_key := 'maxMonthlySales';
      SELECT count(*) INTO current_count FROM public.sales
        WHERE tenant_id = NEW.tenant_id
          AND business_date >= date_trunc('month', NEW.business_date)::date
          AND business_date < (date_trunc('month', NEW.business_date) + interval '1 month')::date;
    ELSE
      RETURN NEW;
  END CASE;
  maximum := app_private.tenant_limit(limit_key);
  IF current_count >= maximum THEN
    RAISE EXCEPTION 'PLAN_LIMIT_EXCEEDED:%', limit_key USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER branches_enforce_plan_limit
BEFORE INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_tenant_limit();
CREATE TRIGGER memberships_enforce_plan_limit
BEFORE INSERT ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_tenant_limit();
CREATE TRIGGER products_enforce_plan_limit
BEFORE INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_tenant_limit();
CREATE TRIGGER sales_enforce_plan_limit
BEFORE INSERT ON public.sales
FOR EACH ROW EXECUTE FUNCTION app_private.enforce_tenant_limit();

SELECT set_config('app.platform_admin', 'true', true);

INSERT INTO public.plans (code, name, description, limits, updated_at)
VALUES
  ('starter', 'Starter', 'Single-location starter plan',
    '{"maxBranches":1,"maxUsers":5,"maxProducts":1000,"maxMonthlySales":5000}', now()),
  ('growth', 'Growth', 'Multi-branch growth plan',
    '{"maxBranches":10,"maxUsers":100,"maxProducts":25000,"maxMonthlySales":100000}', now()),
  ('enterprise', 'Enterprise', 'Enterprise plan',
    '{"maxBranches":1000,"maxUsers":10000,"maxProducts":1000000,"maxMonthlySales":10000000}', now())
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT EXECUTE ON FUNCTION
      app_private.current_platform_role(),
      app_private.tenant_limit(text)
    TO phms_app;

    GRANT SELECT ON public.platform_login_directory, public.plans TO phms_app;
    GRANT SELECT, INSERT, UPDATE ON
      public.platform_sessions,
      public.support_access_requests,
      public.support_sessions,
      public.tenant_subscriptions,
      public.tenant_branding
    TO phms_app;
    GRANT SELECT, INSERT ON public.platform_audit_logs TO phms_app;
    GRANT USAGE, SELECT ON SEQUENCE public.platform_audit_logs_id_seq TO phms_app;
    GRANT INSERT, UPDATE, DELETE ON public.plans TO phms_app;
  END IF;
END;
$$;
