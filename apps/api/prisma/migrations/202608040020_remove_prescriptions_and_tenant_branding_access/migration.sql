DROP TABLE IF EXISTS public.prescription_items;
DROP TABLE IF EXISTS public.prescriptions;

CREATE OR REPLACE FUNCTION app_private.require_platform_or_tenant_branding_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_tenant_id uuid;
  tenant_role text;
BEGIN
  IF current_setting('app.platform_admin', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  row_tenant_id := COALESCE(to_jsonb(NEW) ->> 'tenant_id', to_jsonb(OLD) ->> 'tenant_id')::uuid;
  SELECT role::text INTO tenant_role
  FROM public.tenant_memberships
  WHERE tenant_id = app_private.current_tenant_id()
    AND id = app_private.current_membership_id()
    AND status = 'ACTIVE';

  IF row_tenant_id IS DISTINCT FROM app_private.current_tenant_id()
    OR tenant_role NOT IN ('OWNER', 'ADMIN') THEN
    RAISE EXCEPTION 'tenant branding may only be changed by the tenant owner or admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tenant_branding_guard_write ON public.tenant_branding;
CREATE TRIGGER tenant_branding_guard_write
BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_branding
FOR EACH ROW EXECUTE FUNCTION app_private.require_platform_or_tenant_branding_write();
