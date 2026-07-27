# M2 tenant identity and RLS build sequence

M2 establishes the security boundary that every later pharmacy module uses.

## Step 1: Identity and tenant schema

Add Prisma models and migrations for:

- `users`
- `platform_users`
- `tenants`
- `branches`
- `tenant_memberships`
- `membership_branches`
- `sessions`
- `invitations`
- `roles`, `permissions` and role-permission assignments where configured data
  is selected over code-defined defaults
- append-only `audit_logs`

Use UUID identifiers, `timestamptz`, normalized unique keys and explicit status
enums. Tenant memberships, not global users, hold tenant roles.

## Step 2: Runtime database roles and RLS context

- verify `phms_app` does not own tables and has no `BYPASSRLS`
- establish transaction-local `app.tenant_id`, `app.user_id`,
  `app.membership_id` and allowed branch context
- use Prisma interactive transactions for tenant-owned repository calls
- fail closed when context is absent

## Step 3: PostgreSQL RLS policies

- enable and force RLS on every tenant-owned table
- add `USING` and `WITH CHECK` policies
- add PostgreSQL functions that read validated transaction-local context
- add compound tenant/branch constraints and indexes
- keep platform-wide operations on a separately authorized path

## Step 4: Authentication and sessions

- Argon2id password hashing
- tenant-aware login and membership verification
- secure HttpOnly cookie sessions
- rotation, expiry, revocation and logout
- login throttling and non-enumerating errors
- invitation and password-reset token hashing

## Step 5: Authorization

- central permission catalog
- platform and tenant role separation
- branch assignment checks
- permission middleware plus service-level business checks
- controlled, time-limited support access with audit

## Step 6: Mandatory isolation tests

For every repository and endpoint:

- Tenant A can access its own records
- Tenant B can access its own records
- Tenant A cannot read, count, search, update, delete or reference Tenant B data
- branch-restricted users cannot access an unassigned branch
- direct UUID substitution returns not found/forbidden without data leakage
- background/repository operations fail without tenant context
- the runtime database role cannot bypass RLS

## M2 exit gate

M2 is complete only when migrations apply to a clean `phms_test` database, the
normal runtime role passes all positive tests, every cross-tenant negative test
passes, session security is verified, and npm/lint/typecheck/test/build gates
remain green.
