-- Explicit Super Admin identity controls. Runtime workflows still set app.user_id
-- and app.platform_admin; these policies do not grant tenant-data bypass.

CREATE POLICY users_platform_super_admin ON public.users
  USING (app_private.current_platform_role() = 'SUPER_ADMIN')
  WITH CHECK (app_private.current_platform_role() = 'SUPER_ADMIN');

CREATE POLICY platform_users_super_admin ON public.platform_users
  USING (app_private.current_platform_role() = 'SUPER_ADMIN')
  WITH CHECK (app_private.current_platform_role() = 'SUPER_ADMIN');

CREATE POLICY platform_sessions_super_admin ON public.platform_sessions
  USING (app_private.current_platform_role() = 'SUPER_ADMIN')
  WITH CHECK (app_private.current_platform_role() = 'SUPER_ADMIN');
