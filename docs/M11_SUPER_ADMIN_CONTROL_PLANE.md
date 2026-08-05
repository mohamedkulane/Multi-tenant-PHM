# M11 — Super Admin Control Plane

## Purpose

M11 completes the platform-owner workspace used to operate the multi-tenant PHMS service without crossing tenant data boundaries.

## Platform roles

| Role          | Access                                                                             |
| ------------- | ---------------------------------------------------------------------------------- |
| `SUPER_ADMIN` | Full platform lifecycle, identity, plan, notification, support, and audit controls |
| `ADMIN`       | Read-only platform overview, tenant directory/detail, usage, and plans             |

Platform identities use `/platform/login`, a dedicated platform cookie, platform middleware, and platform routes. Tenant identities cannot authenticate through this boundary.

## Pages

- `/platform/dashboard`: live tenant, branch, user, product, sales, support, session, lifecycle, growth, alert, and recent-audit metrics.
- `/platform/tenants`: searchable and paginated organization directory.
- `/platform/tenants/new`: atomic tenant onboarding for Super Admin only.
- `/platform/tenants/:tenantId`: lifecycle, branding, branches, effective-plan usage, and tenant-user access controls.
- `/platform/plans`: plan CRUD, limits, enable/disable, and tenant overrides.
- `/platform/administrators`: create, promote/demote, enable/disable, rotate password, and revoke sessions.
- `/platform/notifications`: send to all tenants, one tenant, branch, role, or user, with per-user delivery/read state.
- `/platform/support`: approval-based, time-limited, revocable, read-only tenant support sessions.
- `/platform/audit`: append-only evidence with search, action filters, metrics, and pagination.

## User-control workflow

1. Super Admin selects a platform administrator or tenant membership.
2. A reason is required for security-sensitive changes.
3. Disabling an identity revokes its active sessions immediately.
4. The final active Super Admin and final active tenant Owner are protected.
5. Every change is appended to `platform_audit_logs`.

## Notification workflow

1. Super Admin selects `ALL_TENANTS`, `TENANT`, `BRANCH`, `ROLE`, or `USER`.
2. The API resolves only active tenant memberships matching the target.
3. One `platform_broadcast_deliveries` record is created per recipient.
4. Each recipient has independent read/unread state in the existing tenant notification center.
5. Broadcast target, delivery count, actor, and time remain in platform history and audit evidence.

## Plan controls

Supported limits are `maxBranches`, `maxUsers`, `maxProducts`, and `maxMonthlySales`. PostgreSQL enforcement remains authoritative. Tenant detail shows current usage against effective limits, including tenant-specific overrides.

## PostgreSQL security

- Tenant aggregates are calculated inside tenant-specific transaction contexts; no global tenant-table RLS bypass was introduced.
- Super Admin identity policies are explicit for `users`, `platform_users`, and `platform_sessions`.
- Authenticated platform role is stored transaction-locally in `app.platform_role`.
- `app_private.current_platform_role()` reads that setting and never queries an RLS-protected identity table, preventing policy recursion.
- Platform broadcasts are platform-only; deliveries are tenant-isolated and membership-scoped.
- Runtime continues to use `phms_app`; schema migrations use the separately configured owner connection.

## API endpoints

- `GET /api/v1/platform/overview`
- `GET|POST /api/v1/platform/users`
- `PATCH /api/v1/platform/users/:userId`
- `POST /api/v1/platform/users/:userId/revoke-sessions`
- `GET /api/v1/platform/tenants/:tenantId/users`
- `PATCH /api/v1/platform/tenants/:tenantId/users/:membershipId/status`
- `GET|POST /api/v1/platform/broadcasts`
- Existing tenant, plan, branding, support, and audit endpoints remain in place.

## Verification completed

- Prisma schema validation: passed.
- PostgreSQL migrations: 17 applied, none pending.
- Live runtime RLS smoke test: passed as `phms_app` with a Super Admin principal.
- API readiness and liveness: HTTP 200.
- API: lint passed, type-check passed, 90 tests passed, 31 configured integration tests skipped.
- Web: lint passed, type-check passed, 18 tests passed.

Production build was intentionally not run, following the existing instruction not to rebuild the project.
