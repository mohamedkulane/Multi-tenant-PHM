# M2 local PostgreSQL migration and verification runbook

This runbook is designed for PostgreSQL 18 and pgAdmin 4 on the detected local
machine. Password placeholders must be replaced only in pgAdmin or temporary
shell environment variables. Never save real passwords in repository files.

## 1. Create roles in pgAdmin

Connect to the `postgres` maintenance database as the local `postgres`
administrator and run:

```sql
CREATE ROLE phms_migrator LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS
  PASSWORD 'REPLACE_WITH_MIGRATOR_PASSWORD';

CREATE ROLE phms_app LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS
  PASSWORD 'REPLACE_WITH_APP_PASSWORD';
```

If the roles already exist, use `ALTER ROLE` to confirm the flags instead of
creating duplicates.

## 2. Create clean databases

Run each `CREATE DATABASE` outside a transaction:

```sql
CREATE DATABASE phms_dev OWNER phms_migrator;
CREATE DATABASE phms_test OWNER phms_migrator;
GRANT CONNECT ON DATABASE phms_dev TO phms_app;
GRANT CONNECT ON DATABASE phms_test TO phms_app;
```

On each database, revoke public schema creation:

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
```

The M2 security migration grants the runtime table privileges when `phms_app`
already exists.

## 3. Apply migrations with the migration role

In a temporary PowerShell session:

```powershell
$env:DATABASE_URL='postgresql://phms_migrator:URL_ENCODED_PASSWORD@localhost:5432/phms_dev?schema=public'
npm run db:deploy
```

Repeat for `phms_test`. Do not put the migrator URL in the API `.env`.

## 4. Configure the runtime API

Copy `apps/api/.env.example` to `apps/api/.env`, then enter:

```dotenv
DATABASE_URL=postgresql://phms_app:URL_ENCODED_APP_PASSWORD@localhost:5432/phms_dev?schema=public
SESSION_SECRET=AT_LEAST_32_RANDOM_CHARACTERS
SESSION_COOKIE_NAME=phms_session
SESSION_TTL_HOURS=12
```

The cookie is host-only because no `Domain` attribute is configured. Production
adds `Secure` automatically and always uses `HttpOnly` and `SameSite=Lax`.

## 5. Run real RLS tests

Set the test URLs only for the current PowerShell session:

```powershell
$env:TEST_ADMIN_DATABASE_URL='postgresql://phms_migrator:URL_ENCODED_PASSWORD@localhost:5432/phms_test?schema=public'
$env:TEST_DATABASE_URL='postgresql://phms_app:URL_ENCODED_PASSWORD@localhost:5432/phms_test?schema=public'
npm run test -w @phms/api
```

Expected result: every test passes and none of the four database isolation tests
is marked skipped.

## 6. Verify role safety in pgAdmin

Run `database/bootstrap/verify_runtime_role.sql` while connected to either PHMS
database. Expected values for `phms_app`:

- `rolsuper = false`
- `rolcreaterole = false`
- `rolcreatedb = false`
- `rolbypassrls = false`
- owns zero application tables

## 7. Final gate

```powershell
npm audit
npm run db:validate
npm run check
npm run format:check
```

Only after all checks pass should M2 be marked complete and M3 begin.
