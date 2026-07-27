# Database bootstrap

Local roles and databases are created through pgAdmin 4 using
`docs/LOCAL_POSTGRESQL_PGADMIN.md`.

This directory will contain reviewed environment bootstrap scripts that are
separate from Prisma application migrations:

- database roles and least-privilege grants
- database creation notes
- RLS runtime-role grants
- production provisioning templates

Real passwords and environment-specific secrets must never be stored here.
