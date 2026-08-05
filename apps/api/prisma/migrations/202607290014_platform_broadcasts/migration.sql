-- Super Admin broadcasts with per-membership delivery and immutable platform evidence.

CREATE TABLE public.platform_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  target_tenant_id uuid,
  target_branch_id uuid,
  target_membership_id uuid,
  target_role public."TenantRole",
  target_type varchar(30) NOT NULL,
  title varchar(180) NOT NULL,
  message varchar(500) NOT NULL,
  delivery_count integer NOT NULL DEFAULT 0,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT platform_broadcast_actor_fkey
    FOREIGN KEY (actor_user_id) REFERENCES public.platform_users (user_id) ON DELETE RESTRICT,
  CONSTRAINT platform_broadcast_tenant_fkey
    FOREIGN KEY (target_tenant_id) REFERENCES public.tenants (id) ON DELETE RESTRICT,
  CONSTRAINT platform_broadcast_branch_fkey
    FOREIGN KEY (target_tenant_id, target_branch_id)
    REFERENCES public.branches (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT platform_broadcast_membership_fkey
    FOREIGN KEY (target_tenant_id, target_membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT platform_broadcast_target_check CHECK (
    target_type IN ('ALL_TENANTS', 'TENANT', 'BRANCH', 'ROLE', 'USER')
  ),
  CONSTRAINT platform_broadcast_delivery_check CHECK (delivery_count >= 0)
);

CREATE TABLE public.platform_broadcast_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  branch_id uuid,
  membership_id uuid NOT NULL,
  read_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT platform_broadcast_delivery_broadcast_fkey
    FOREIGN KEY (broadcast_id) REFERENCES public.platform_broadcasts (id) ON DELETE RESTRICT,
  CONSTRAINT platform_broadcast_delivery_membership_fkey
    FOREIGN KEY (tenant_id, membership_id)
    REFERENCES public.tenant_memberships (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT platform_broadcast_delivery_branch_fkey
    FOREIGN KEY (tenant_id, branch_id)
    REFERENCES public.branches (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT platform_broadcast_delivery_unique UNIQUE (broadcast_id, membership_id)
);

CREATE INDEX platform_broadcasts_created_idx
  ON public.platform_broadcasts (created_at);
CREATE INDEX platform_broadcasts_tenant_created_idx
  ON public.platform_broadcasts (target_tenant_id, created_at);
CREATE INDEX platform_broadcast_deliveries_tenant_member_read_created_idx
  ON public.platform_broadcast_deliveries (tenant_id, membership_id, read_at, created_at);

CREATE TRIGGER platform_broadcasts_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.platform_broadcasts
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_write();

CREATE OR REPLACE FUNCTION app_private.require_platform_broadcast_delivery_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.platform_admin', true) IS DISTINCT FROM 'true'
     AND current_setting('app.notification_write', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'broadcast delivery state requires an authorized workflow'
      USING ERRCODE = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER platform_broadcast_deliveries_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.platform_broadcast_deliveries
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_broadcast_delivery_write();

ALTER TABLE public.platform_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_broadcasts FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_broadcasts_super_admin ON public.platform_broadcasts
  USING (app_private.current_platform_role() = 'SUPER_ADMIN')
  WITH CHECK (
    actor_user_id = app_private.current_user_id()
    AND app_private.current_platform_role() = 'SUPER_ADMIN'
  );

ALTER TABLE public.platform_broadcast_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_broadcast_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_broadcast_deliveries_tenant ON public.platform_broadcast_deliveries
  USING (tenant_id = app_private.current_tenant_id())
  WITH CHECK (tenant_id = app_private.current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'phms_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.platform_broadcasts TO phms_app;
    GRANT SELECT, INSERT, UPDATE ON public.platform_broadcast_deliveries TO phms_app;
  END IF;
END;
$$;