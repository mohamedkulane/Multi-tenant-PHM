# M9 CRUD and Professional UI Completion

## Outcome

M9 completes the application-facing CRUD and lifecycle controls for the tenant
workspace and platform control plane. Financial and inventory evidence is never
hard-deleted: products, branches, memberships, plans, categories, sales, and
expenses use deactivate, revoke, suspend, return, or void operations with audit
evidence.

## Tenant workflows

- Products: create, search, read, edit identity, edit package prices, activate,
  and deactivate with optimistic version checks.
- Inventory: receive stock, view batch stock, view movement history, adjust,
  transfer, and write off expired stock.
- Sales: create checkout, list invoices, view invoice details, download PDF,
  add payments, return items, and void sales.
- Debts: list receivables, summarize outstanding balances, and collect
  payments.
- Expenses: create and manage categories, activate/deactivate categories, post
  expenses, list the ledger, and void incorrect entries.
- Staff: invite users, revoke invitations, update roles, update branch access,
  suspend/revoke/reactivate memberships, and revoke active sessions when access
  changes.
- Branches: create, edit, activate/deactivate, prevent removal of the final
  active branch, and remove stale branch assignments.
- Tenant settings: owner-controlled organization name, timezone, currency,
  display name, colors, logo URL, invoice footer, and support contact.
- Reports and operations: bounded reports, durable CSV export jobs, invoice
  PDF downloads, alert scans, and notification read state.

## Platform workflows

- Tenants: onboard, search, filter, inspect, change lifecycle status, change
  plan and overrides, and maintain branding.
- Plans: create, read, edit limits, activate, and deactivate.
- Support access: request tenant-bound access, independently approve/reject,
  activate once, expire automatically, and revoke immediately.
- Audit: append-only tenant and platform evidence remains visible.

## Authorization

- OWNER controls tenant settings and all tenant administration.
- ADMIN controls branches, staff, catalog, inventory, sales, debts, expenses,
  reports, and audit, but not owner-only tenant settings.
- MANAGER operates inventory, sales, payments, returns, expenses, reports, and
  audit within assigned branches.
- PHARMACIST and CASHIER retain narrower operational permissions.
- AUDITOR and support sessions remain read-only.
- SUPER_ADMIN controls platform tenant lifecycle, plans, branding, and
  independent support approval.

## Verification

- API and web lint pass.
- API and web TypeScript checks pass.
- Targeted new CRUD route tests: 15 passed.
- Full available suite: 79 tests passed; PostgreSQL integration files require
  both local test role URLs in the environment.
- API and web production builds pass.
- Prettier format check passes.
- `npm audit --audit-level=high`: zero vulnerabilities.
- Local API readiness reports PostgreSQL `up`; local web responds successfully.

## Local PostgreSQL integration variables

The live integration suite intentionally skips unless both variables are
available to the API test process:

```text
TEST_ADMIN_DATABASE_URL=postgresql://phms_migrator:<encoded-password>@localhost:5432/phms_test?schema=public
TEST_DATABASE_URL=postgresql://phms_app:<encoded-password>@localhost:5432/phms_test?schema=public
```

Passwords remain local and must not be committed.
