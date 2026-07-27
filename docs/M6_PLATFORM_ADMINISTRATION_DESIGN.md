# M6 platform administration and support-access design

## Trust boundaries

Platform identity and tenant identity remain separate:

- a `SUPER_ADMIN` manages tenant lifecycle, plans, and approvals
- `SUPPORT` may request time-limited read-only tenant access
- a platform `AUDITOR` reads platform audit evidence
- none of these roles automatically becomes a tenant membership
- tenant `OWNER` remains the highest pharmacy role

Platform sessions use a dedicated cookie and session table. Tenant sessions use
the existing tenant cookie and tenant session table.

## Tenant onboarding transaction

Onboarding creates, atomically:

1. tenant and login directory entry
2. plan subscription
3. default branding
4. owner global user
5. active owner tenant membership
6. initial branch
7. platform audit event

Passwords are Argon2id hashes. Slug, owner username, and email are normalized.
No partial tenant is committed.

## Plans and limits

Plans are global platform configuration. Effective limits are copied by
reference through a tenant subscription:

- maximum branches
- maximum active memberships
- maximum products
- maximum monthly sales

PostgreSQL triggers enforce limits on insert so API bugs cannot bypass them.
Limit failures use a stable database error and are translated to a conflict.

## Tenant lifecycle

- `TRIAL` and `ACTIVE`: tenant login and work allowed
- `SUSPENDED`: login and existing session authentication denied
- `CANCELLED`: login denied; data retained for controlled retention/export

Suspension revokes active tenant sessions in the same transaction and records
the reason in the platform audit log.

## Branding

Tenant branding stores:

- display name
- logo URL
- primary and accent colors
- invoice footer
- support contact

Branding is tenant-owned and protected by forced RLS. Platform administration
sets the target tenant context explicitly before reading or writing it.

## Support access

Support access is never silent:

1. a support user creates a reason-coded request for one tenant
2. a different active `SUPER_ADMIN` approves it
3. approval specifies an expiry no more than four hours away
4. the support user activates the approval once to obtain an opaque session
5. the session produces a tenant principal limited to `AUDITOR` permissions
6. every request, approval, activation, revocation, and expiry is platform-audited
7. the session can be revoked immediately

Support cannot create sales, change inventory, collect payments, manage users,
or alter tenant settings. It can only use existing read/report permissions.

## Platform security invariants

1. Platform tokens are HMAC-digested and never stored in plaintext.
2. Platform sessions are independent from tenant sessions.
3. Platform APIs require platform authentication and explicit role checks.
4. Platform database rows use platform-user RLS, not tenant RLS.
5. Target-tenant operations set `app.tenant_id` explicitly.
6. Platform audit rows are append-only.
7. Approval requires a different super administrator from the requester.
8. Support sessions are short-lived, read-only, revocable, and tenant-specific.
9. Tenant suspension revokes normal tenant sessions.
10. Platform users never receive `BYPASSRLS`.
