-- Read-only M2 verification. Safe to run in pgAdmin Query Tool.
SELECT
  rolname,
  rolsuper,
  rolcreaterole,
  rolcreatedb,
  rolcanlogin,
  rolbypassrls
FROM pg_roles
WHERE rolname IN ('phms_migrator', 'phms_app')
ORDER BY rolname;

SELECT count(*) AS application_tables_owned_by_phms_app
FROM pg_class AS relation
JOIN pg_roles AS owner_role ON owner_role.oid = relation.relowner
JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
WHERE owner_role.rolname = 'phms_app'
  AND namespace.nspname = 'public'
  AND relation.relkind IN ('r', 'p');

SELECT
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'platform_users',
    'tenants',
    'branches',
    'tenant_memberships',
    'membership_branches',
    'sessions',
    'invitations',
    'invitation_branches',
    'audit_logs'
  )
ORDER BY tablename;
