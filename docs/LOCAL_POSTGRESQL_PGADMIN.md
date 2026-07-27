# Local PostgreSQL and pgAdmin 4 setup

## Detected local installation

The M1 environment check found:

- PostgreSQL Server 18 service: `postgresql-x64-18`
- Service state: running
- PostgreSQL readiness: `localhost:5432 - accepting connections`
- `psql.exe`: `C:\Program Files\PostgreSQL\18\bin\psql.exe`
- `pg_isready.exe`: `C:\Program Files\PostgreSQL\18\bin\pg_isready.exe`
- pgAdmin 4: `C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\pgAdmin4.exe`

PostgreSQL is the database server. pgAdmin 4 is the graphical administration
client. Prisma is the application's typed database layer and migration tool.

## 1. Register the local server in pgAdmin 4

1. Start pgAdmin 4.
2. Select **Register > Server**.
3. Set the name to `PHMS Local PostgreSQL 18`.
4. On **Connection**, use:
   - Host: `localhost`
   - Port: `5432`
   - Maintenance database: `postgres`
   - Username: `postgres`
5. Enter the PostgreSQL administrator password chosen during installation.
6. Save the registration.

Do not place the PostgreSQL administrator password in the project environment
files. The application must never connect as `postgres`.

## 2. Create local roles

Open the Query Tool on the `postgres` maintenance database. Replace both
password placeholders with different strong local-only passwords before running:

```sql
CREATE ROLE phms_migrator
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  PASSWORD 'REPLACE_WITH_MIGRATOR_PASSWORD';

CREATE ROLE phms_app
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  PASSWORD 'REPLACE_WITH_APP_PASSWORD';

CREATE ROLE phms_test
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  PASSWORD 'REPLACE_WITH_TEST_PASSWORD';
```

If a role already exists, alter it through pgAdmin rather than storing real
passwords in a reusable SQL file.

## 3. Create databases

Run from the `postgres` maintenance database:

```sql
CREATE DATABASE phms_dev OWNER phms_migrator;
CREATE DATABASE phms_test OWNER phms_test;
```

Reconnect the Query Tool to `phms_dev` and grant application access:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO phms_app;
GRANT CONNECT ON DATABASE phms_dev TO phms_app;

ALTER DEFAULT PRIVILEGES FOR ROLE phms_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO phms_app;

ALTER DEFAULT PRIVILEGES FOR ROLE phms_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO phms_app;
```

M2 will add the database policies and grants that prevent the application role
from bypassing tenant Row-Level Security.

## 4. Configure local environment files

Copy the examples:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/web/.env.example apps/web/.env
```

Update `apps/api/.env`:

```dotenv
DATABASE_URL=postgresql://phms_app:URL_ENCODED_APP_PASSWORD@localhost:5432/phms_dev?schema=public
SESSION_SECRET=GENERATE_AT_LEAST_32_RANDOM_CHARACTERS
```

Prisma migrations must use a migration-role connection. Before running a local
migration, set `DATABASE_URL` temporarily to the `phms_migrator` connection,
run the migration, and restore the application-role connection before starting
the API. M2 will introduce separate, validated runtime and migration variables
so this cannot be confused in automated environments.

## 5. Verify the local server

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_isready.exe' -h localhost -p 5432
npm run db:validate
npm run db:generate
```

After applying migrations:

```powershell
npm run db:migrate
npm run dev
```

Health endpoints:

- Liveness: `http://localhost:5001/api/v1/health/live`
- Database readiness: `http://localhost:5001/api/v1/health/ready`

Liveness can succeed without PostgreSQL. Readiness must return HTTP 503 until
the configured database connection is available.

## Security rules

- Never use the `postgres` superuser for the API.
- Never commit `.env` files or real passwords.
- Use separate development and test databases.
- Keep migration and runtime roles separate.
- The runtime role must not own tenant tables and must not have `BYPASSRLS`.
- Review generated Prisma migration SQL before applying it.
- Back up development data before destructive migration experiments.

## M6 platform owner bootstrap

After all migrations are applied, keep `DATABASE_URL` configured for the
non-superuser `phms_app` role. In a temporary PowerShell terminal:

```powershell
$env:PLATFORM_ADMIN_EMAIL='owner@example.com'
$env:PLATFORM_ADMIN_FULL_NAME='Platform Owner'
$env:PLATFORM_ADMIN_PASSWORD='use-a-unique-password-of-16-or-more-characters'
npm run db:bootstrap-platform-admin --workspace @phms/api
Remove-Item Env:PLATFORM_ADMIN_PASSWORD
```

The command creates or rotates the platform owner through the same forced-RLS
runtime boundary used by the API. It stores only an Argon2id hash, revokes older
platform sessions on rotation and writes an immutable platform audit event.
