# M2 tenant identity and database isolation completion

## Outcome

M2 is complete. The tenancy schema and PostgreSQL RLS migrations are applied to
both local databases, the API connects through the restricted `phms_app` role,
and all live two-tenant isolation tests pass.

Completed locally on July 26, 2026:

- PostgreSQL databases: `phms_dev` and `phms_test`
- migration role: `phms_migrator`
- runtime role: `phms_app`
- migrations applied: `202607260001_m2_tenancy_core` and
  `202607260002_m2_rls_security`
- live API/database tests: 30 passed, 0 skipped
- dependency audit: 0 vulnerabilities

## Implemented

- Prisma models for global users, platform users, tenants, login directory,
  branches, tenant memberships, branch assignments, sessions, invitations and
  append-only audit events
- compound `(tenant_id, id)` keys and foreign keys that reject cross-tenant
  branch, membership and invitation references
- PostgreSQL `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`
- fail-closed RLS policies for every tenant-owned table
- transaction-local `app.tenant_id`, `app.user_id`, `app.membership_id` and
  `app.branch_id` context through Prisma interactive transactions
- minimal tenant-login directory containing only slug, tenant ID and status
- code-defined tenant permissions and branch-assignment authorization
- tenant-aware login with generic non-enumerating errors
- Argon2id password hashing and verification
- opaque HMAC-digested, expiring and revocable HttpOnly cookie sessions
- login throttling, credential-log redaction, logout and `/me`
- hashed one-time tokens for invitations and future password resets
- immutable database audit events for successful login and logout
- secure proxy trust default and API-wide session cookie scope

## Role model

Platform roles remain separate from tenant roles. A platform super administrator
does not automatically become a tenant owner and cannot bypass RLS through a
normal tenant session.

| Scope    | Role          | Purpose                                             |
| -------- | ------------- | --------------------------------------------------- |
| Platform | `SUPER_ADMIN` | Platform lifecycle and emergency administration     |
| Platform | `SUPPORT`     | Future time-limited, audited support access         |
| Platform | `AUDITOR`     | Platform-level compliance review                    |
| Tenant   | `OWNER`       | Tenant governance and all tenant permissions        |
| Tenant   | `ADMIN`       | Day-to-day administration except ownership controls |
| Tenant   | `MANAGER`     | Operations, reports and controlled sale reversal    |
| Tenant   | `PHARMACIST`  | Inventory and pharmacy sales work                   |
| Tenant   | `CASHIER`     | Checkout and read-only stock availability           |
| Tenant   | `AUDITOR`     | Read-only business and audit reporting              |

Platform support impersonation is deliberately deferred to M6. It must be
time-limited, reason-coded, approved and audited.

## API endpoints

| Method | Endpoint              | Result                                                          |
| ------ | --------------------- | --------------------------------------------------------------- |
| `POST` | `/api/v1/auth/login`  | Validates tenant, membership and password; issues a new session |
| `GET`  | `/api/v1/auth/me`     | Returns the tenant principal and branch assignments             |
| `POST` | `/api/v1/auth/logout` | Revokes the database session and clears the cookie              |

## Verified security invariants

1. Tenant-owned Prisma work runs in an interactive transaction.
2. The transaction sets tenant context before the first tenant query.
3. Missing context returns zero tenant-owned rows.
4. `WITH CHECK` rejects records carrying another tenant ID.
5. Compound foreign keys reject cross-tenant relationships.
6. Runtime credentials use `phms_app`, not `postgres` or the table owner.
7. `phms_app` is not superuser and has no `BYPASSRLS`.
8. Session and one-time token secrets are not stored in plaintext.
9. Audit rows cannot be updated or deleted.
10. Platform and tenant authorization paths remain separate.

## Automated evidence

- session token format, opacity and HMAC digesting
- one-time token digesting
- Argon2id password verification
- tenant role permission boundaries
- assigned and unassigned branch access
- login cookie security
- `/me` authentication
- logout revocation contract
- runtime role privilege safety
- missing-context fail-closed behavior
- Tenant A sees only Tenant A data
- Tenant A cannot write Tenant B data
- existing health, request and error contracts

## M3 handoff

M3 can now build products, batches and immutable stock movements on the M2
boundary. Every new tenant-owned table must:

- contain `tenant_id`
- use compound tenant foreign keys
- receive `ENABLE` and `FORCE` RLS policies
- be accessed only inside `withTenantContext`
- add positive and cross-tenant negative tests
- enforce branch assignments in service-level authorization
