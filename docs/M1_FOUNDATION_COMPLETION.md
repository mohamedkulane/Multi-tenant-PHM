# M1 foundation completion

Status: complete  
Completed: July 26, 2026

## Delivered

- npm workspace with `@phms/api` and `@phms/web`
- strict TypeScript, ESLint, Prettier and consolidated verification scripts
- Express 5 API with Helmet, controlled CORS, request IDs, structured redacted
  logging, consistent error responses and graceful shutdown
- liveness and database-readiness endpoints
- Prisma ORM/Migrate, PostgreSQL driver adapter and initial global platform
  setting model
- React 19, Vite 8, TanStack Query, Tailwind CSS 4 and accessible M1 shell
- API and frontend tests
- local PostgreSQL 18 and pgAdmin 4 setup documentation
- implementation plan and architecture decision records
- dependency lockfile with zero reported vulnerabilities

## Local environment evidence

- Node.js: 22.17.1
- npm: 11.7.0
- PostgreSQL service: `postgresql-x64-18`, running
- PostgreSQL readiness: `localhost:5432 - accepting connections`
- pgAdmin 4 executable:
  `C:\Program Files\PostgreSQL\18\pgAdmin 4\runtime\pgAdmin4.exe`

## Verification evidence

- Prisma schema validation: passed
- Prisma client generation: passed
- ESLint: passed
- TypeScript API and web typecheck: passed
- API tests: 4 passed
- Web tests: 1 passed
- API production build: passed
- Web production build: passed
- Prettier check: passed
- npm audit: zero vulnerabilities
- Runtime smoke:
  - liveness returned HTTP 200 and `status: up`
  - request ID was present
  - readiness returned safe HTTP 503 with intentionally invalid database
    credentials

## Deliberate boundary

M1 does not create local database roles or store administrator credentials.
The developer creates `phms_migrator`, `phms_app`, `phms_test`, `phms_dev` and
`phms_test` through pgAdmin using `LOCAL_POSTGRESQL_PGADMIN.md`.

Tenant models, sessions, permissions, transaction-local tenant context and RLS
policies begin in M2. No tenant-owned feature is allowed before the M2
two-tenant isolation suite passes.
