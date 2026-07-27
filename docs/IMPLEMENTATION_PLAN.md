# PHMS implementation plan

The platform is built in verified milestones. A milestone is complete only when
its code, migrations, security checks, tests, documentation, and build all pass.

## M1 - Foundation

- npm workspaces, TypeScript, linting, formatting and shared scripts
- Express API lifecycle, validation, secure middleware, logging and health checks
- React/Vite application shell and API status
- Prisma 7 configuration for local PostgreSQL
- local PostgreSQL and pgAdmin 4 instructions
- automated unit/API/frontend tests and production builds

## M2 - Tenant identity and database isolation

- users, platform users, tenants, branches and memberships
- roles, permissions, invitations and sessions
- Prisma migrations and PostgreSQL RLS policies
- transaction-local tenant database context
- mandatory two-tenant and branch-isolation tests

## M3 - Product catalog and inventory

- category-specific packaging domain services
- products, inventory batches and immutable stock movements
- receiving, adjustment, expiry and branch transfer workflows
- characterization tests against the current PHMS behavior

## M4 - Sales, invoices, debt and expenses

- atomic checkout and conditional stock decrement
- invoice sequence and immutable sale-item snapshots
- debt and payment transactions with idempotency
- expenses, permissions and audit coverage

## M5 - Reports and asynchronous work

- dashboards and indexed PostgreSQL aggregates
- Redis, BullMQ, notifications, PDF invoices and exports
- job tenant context, retries and deduplication

## M6 - Platform administration

- tenant onboarding, branding, plans, limits and suspension
- audited support sessions and platform operations

## M7 - Migration and production readiness

- MongoDB legacy import into a legacy tenant/default branch
- reconciliation, security review, performance tests
- backup/restore and rollback rehearsals

## M8 - Pilot and rollout

- controlled pilot tenant
- stability window, SLO validation, incident and rollback readiness
- phased customer rollout
