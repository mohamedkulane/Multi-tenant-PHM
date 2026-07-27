# PHMS Multi-Tenant Platform

This folder is the clean implementation workspace for the PostgreSQL multi-tenant
version of PHMS. The existing application in the parent workspace remains the
behavioral reference for pharmacy packaging, pricing, inventory, sales, invoices,
debts, expenses, reports, staff, and audit workflows.

## Selected stack

- React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS
- Node.js, TypeScript, Express, Zod, Pino
- PostgreSQL, Prisma ORM, Prisma Migrate, PostgreSQL Row-Level Security
- pgAdmin 4 for local PostgreSQL administration
- Vitest, Supertest, React Testing Library, Playwright in later milestones

## Workspace

```text
apps/
  api/     Express API, Prisma, migrations, domain modules and workers
  web/     React application
docs/      Build plans, decisions and local setup
```

## Development commands

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env
npm run db:validate
npm run check
npm run dev
```

The API listens on `http://localhost:5001` and the web application on
`http://localhost:5173` by default.

Database-backed readiness requires a running local PostgreSQL server and the
database configuration described in `docs/LOCAL_POSTGRESQL_PGADMIN.md`.

## M6 platform administration

M6 adds a separate platform control plane for tenant onboarding, plans, limits,
branding, suspension and approved read-only support access. See
`docs/M6_COMPLETION.md` for the complete workflow and
`docs/M6_PLATFORM_ADMINISTRATION_DESIGN.md` for its security design.

After migrations, bootstrap the first platform owner with the secure
`db:bootstrap-platform-admin` workspace command documented in the M6 completion
and local PostgreSQL runbooks. Do not store that password in the repository.

## Application pages

Start the localhost-only development services:

```powershell
cd C:\Users\maxam\PHMS\multi-tenant-PHM
npm run dev
```

Open:

- pharmacy login: `http://127.0.0.1:5173/login`
- staff invitation acceptance: `http://127.0.0.1:5173/accept-invitation`
- platform login: `http://127.0.0.1:5173/platform/login`
- API status: `http://127.0.0.1:5001/api`
- database readiness: `http://127.0.0.1:5001/api/v1/health/ready`

The pharmacy workspace includes dashboard, products, inventory, sales/invoices,
debts, expenses, reports, staff/branches, jobs/alerts, audit and account pages.
The platform workspace includes tenant onboarding/lifecycle, plans, support access
and platform audit.

## M7 and M8 operations

- migration/production runbook: `docs/M7_MIGRATION_AND_PRODUCTION_READINESS.md`
- pilot/rollout runbook: `docs/M8_PILOT_AND_ROLLOUT.md`
- completion and external execution gates: `docs/M7_M8_COMPLETION.md`
