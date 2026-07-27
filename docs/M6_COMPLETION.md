# M6 platform administration completion

## Outcome

M6 is complete. PHMS now has a platform control plane that is separate from
tenant pharmacy access. It supports secure platform login, transactional tenant
onboarding, branding, subscriptions, database-enforced plan limits, tenant
suspension, immutable platform audit evidence, and approved time-limited support
sessions.

Completed locally on July 27, 2026:

- 11 migrations current in both `phms_dev` and `phms_test`
- M6 route, token and live PostgreSQL checks: 15 passed
- complete API/PostgreSQL suite: 98 passed, 0 skipped
- web suite: 1 passed
- lint, type checks, formatting and both production builds: passed
- development M6 seed: executed
- dependency audit: 0 vulnerabilities

## Platform roles

| Role          | Purpose                                                              |
| ------------- | -------------------------------------------------------------------- |
| `SUPER_ADMIN` | Owns the platform, plans, tenant lifecycle, approval and audit       |
| `SUPPORT`     | Requests and uses explicitly approved read-only tenant access        |
| `AUDITOR`     | Reviews platform audit and support evidence without changing tenants |

Platform roles never substitute for tenant roles. A platform session cannot be
used on a tenant endpoint.

## Delivered components

### Authentication and authorization

- dedicated `phms_platform_session` cookie scoped to `/api/v1/platform`
- separate platform login directory and PostgreSQL session table
- HMAC-digested random tokens; raw secrets are never stored
- explicit platform middleware and role enforcement
- tenant authentication remains isolated
- authenticated support sessions are marked and mapped to tenant `AUDITOR`
  permissions

### Tenant lifecycle

- tenant, subscription, branding, owner, membership and first branch are created
  in one serializable transaction
- new tenants begin in `TRIAL`
- suspension or cancellation revokes every active tenant session
- plan and branding changes produce platform audit evidence
- the secure bootstrap command creates or rotates the first platform owner

### Plans and limits

The database seeds `starter`, `growth` and `enterprise`. Effective limits are
resolved from subscription overrides first, then the selected plan.

PostgreSQL triggers enforce:

- `maxBranches`
- `maxUsers`
- `maxProducts`
- `maxMonthlySales`

The API maps a database `PLAN_LIMIT_EXCEEDED` exception to HTTP `409` without
exposing query internals.

### Controlled support workflow

1. A support employee creates a request with a tenant and reason.
2. A different `SUPER_ADMIN` approves or rejects it.
3. Approval duration is between 5 minutes and 4 hours.
4. Only the requester can activate the approved access.
5. Activation creates an independent, tenant-bound support token.
6. Tenant access is read-only through the existing `AUDITOR` permission set.
7. The requester or a super administrator can revoke it immediately.
8. Every request, decision, activation, logout and revocation is audited.

Self-approval is rejected both by service rules and a PostgreSQL constraint.

## API surface

| Method  | Endpoint                                         | Access                   |
| ------- | ------------------------------------------------ | ------------------------ |
| `POST`  | `/api/v1/platform/auth/login`                    | Public, rate limited     |
| `POST`  | `/api/v1/platform/auth/logout`                   | Platform session         |
| `GET`   | `/api/v1/platform/auth/me`                       | Platform session         |
| `GET`   | `/api/v1/platform/plans`                         | Platform account         |
| `PUT`   | `/api/v1/platform/plans/:code`                   | Super administrator      |
| `GET`   | `/api/v1/platform/tenants`                       | Platform account         |
| `POST`  | `/api/v1/platform/tenants`                       | Super administrator      |
| `GET`   | `/api/v1/platform/tenants/:tenantId`             | Platform account         |
| `PATCH` | `/api/v1/platform/tenants/:tenantId/status`      | Super administrator      |
| `PATCH` | `/api/v1/platform/tenants/:tenantId/plan`        | Super administrator      |
| `PUT`   | `/api/v1/platform/tenants/:tenantId/branding`    | Super administrator      |
| `GET`   | `/api/v1/platform/audit`                         | Super administrator      |
| `GET`   | `/api/v1/platform/support-requests`              | Support or super admin   |
| `POST`  | `/api/v1/platform/support-requests`              | Support or super admin   |
| `POST`  | `/api/v1/platform/support-requests/:id/decision` | Super administrator      |
| `POST`  | `/api/v1/platform/support-requests/:id/activate` | Approved requester       |
| `POST`  | `/api/v1/platform/support-requests/:id/revoke`   | Requester or super admin |

## PostgreSQL and Prisma

M6 adds three Prisma migrations:

1. `202607270009_m6_platform_admin_core`
2. `202607270010_m6_platform_admin_security`
3. `202607270011_m6_support_single_activation`

There are now eleven ordered migrations. The M6 tables are:

- `platform_login_directory`
- `platform_sessions`
- `platform_audit_logs`
- `plans`
- `tenant_subscriptions`
- `tenant_branding`
- `support_access_requests`
- `support_sessions`

Forced RLS protects platform-user and tenant-owned tables. Platform audit rows
cannot be updated or deleted. The runtime role remains non-superuser and cannot
bypass RLS.

## Local first-super-admin bootstrap

Use the normal `phms_app` runtime connection in `apps/api/.env`. In PowerShell,
set temporary values in the current terminal and run:

```powershell
$env:PLATFORM_ADMIN_EMAIL='owner@example.com'
$env:PLATFORM_ADMIN_FULL_NAME='Platform Owner'
$env:PLATFORM_ADMIN_PASSWORD='use-a-unique-password-of-16-or-more-characters'
npm run db:bootstrap-platform-admin --workspace @phms/api
Remove-Item Env:PLATFORM_ADMIN_PASSWORD
```

The password is Argon2id-hashed before storage. Running the command again rotates
the password, restores `SUPER_ADMIN`, revokes existing platform sessions and
adds an audit event. Never place the password in Git or a shared `.env` file.

## Verification

The M6-specific suite covers:

- token parsing and tenant binding
- separate platform-cookie behavior
- route authorization and safe audit serialization
- transactional onboarding and real tenant-owner login
- PostgreSQL plan-limit enforcement
- support request, approval separation, activation and revocation
- read-only support permissions
- branding and plan changes
- audit tamper rejection
- tenant suspension and session revocation

All repository-wide gates passed: formatting, lint, typecheck, 98 API tests, one web test, both production builds, both migration-state checks, the M6 seed, and the dependency audit.

## M7 handoff

M7 can now focus on migration and production readiness: legacy MongoDB import,
reconciliation, security review, performance/load testing, backup/restore and
rollback rehearsals. M7 must preserve the M6 platform/tenant identity separation
and must not weaken forced RLS to simplify migration.
