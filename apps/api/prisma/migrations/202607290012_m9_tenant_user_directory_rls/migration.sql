-- Tenant administrators need the identity fields of staff belonging to their
-- tenant. This SELECT-only policy keeps mutation rules self-scoped while
-- allowing a tenant-bound transaction to resolve membership.user safely.
CREATE POLICY users_tenant_member_directory_select ON public.users
  FOR SELECT
  USING (
    id = app_private.current_user_id()
    OR EXISTS (
      SELECT 1
      FROM public.tenant_memberships membership
      WHERE membership.tenant_id = app_private.current_tenant_id()
        AND membership.user_id = users.id
    )
  );
