-- Resolve RLS recursion by reading the already-authenticated platform role from
-- transaction-local context instead of querying platform_users from a policy.

CREATE OR REPLACE FUNCTION app_private.current_platform_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(current_setting('app.platform_role', true), '')
$$;
