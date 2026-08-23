# PHMS Security Hardening

## Implemented controls

- Cookie-authenticated state mutations require a trusted `Origin` or `Referer`; trusted origins come from `WEB_ORIGINS`.
- Login and password-change endpoints are rate limited. Authentication failures and password changes write security audit events without passwords, cookies, tokens, or request bodies.
- Passwords remain Argon2 hashed and sessions remain opaque, server-side, revocable records.
- Authorization uses granular permissions for clinic lookup, lab order/catalog/sample/result operations, and role-specific receipt printing.
- Doctor, laboratory, reception, and pharmacy roles receive only the data and actions needed for their workflow. Financial details are not exposed to Doctor or Laboratory Technician.
- Tenant and branch filters remain enforced in service queries and PostgreSQL RLS context. Row locks use parameterized Prisma SQL.
- Completed laboratory results cannot be overwritten through normal result entry; an amendment workflow is required.

## Deployment requirements

Set `WEB_ORIGINS` to a comma-separated allowlist of the exact HTTPS web origins. Keep secure cookies and TLS enabled in production. Apply migrations using the normal reviewed deployment pipeline and a least-privileged PostgreSQL runtime role.

## Audit event examples

`LOGIN_FAILED`, `AUTH_RATE_LIMITED`, `PASSWORD_CHANGED`, `LAB_SAMPLE_COLLECTED`, `LAB_SAMPLE_REJECTED`, `LAB_RESULT_COMPLETED`, and `DOCTOR_REVIEW_COMPLETED`.

Never add clinical notes, passwords, tokens, or complete result payloads to audit metadata.
