# M7 migration and production-readiness runbook

## Release boundary

M7 does not weaken RLS or write directly into immutable operational ledgers.
Legacy data moves through a staged, checksum-controlled process:

1. freeze the MongoDB source
2. export users, medicines, sales, debts and expenses to one JSON bundle
3. hash and validate the bundle
4. resolve every validation error
5. create the legacy tenant and default branch through platform onboarding
6. rehearse import into a disposable restored database
7. compare record counts and financial control totals
8. obtain business-owner sign-off
9. back up PostgreSQL
10. run the production import once with an immutable manifest

## Legacy export contract

```json
{
  "users": [],
  "medicines": [],
  "sales": [],
  "debts": [],
  "expenses": []
}
```

Validate without touching PostgreSQL:

```powershell
node scripts/m7/validate-legacy-export.mjs C:\secure\phms-legacy-export.json > C:\secure\validation-report.json
```

The validator detects missing and duplicate IDs, broken user/product/sale
references, duplicate invoices, item subtotal differences, sale-total
differences and debt-balance differences. It emits counts, SHA-256 and financial
control totals. Exit code `2` means import is forbidden.

## Credential migration

Legacy bcrypt password hashes are not copied into the Argon2id system. The
legacy administrator is onboarded as the tenant owner. Other users receive
single-use 72-hour invitations and create new Argon2id passwords.

## Backup

Use the migrator connection only in the private terminal:

```powershell
.\scripts\m7\backup-postgres.ps1 `
  -DatabaseUrl $env:MIGRATION_DATABASE_URL `
  -OutputDirectory C:\secure\phms-backups
```

Backups are custom-format `pg_dump` archives with a SHA-256 manifest. A backup
is not accepted until it restores into an isolated rehearsal database and the
complete test/reconciliation suite passes.

## Performance smoke test

Use a temporary low-privilege tenant session in an isolated environment:

```powershell
$env:PHMS_API_URL='http://127.0.0.1:5001/api/v1'
$env:PHMS_BRANCH_ID='branch-uuid'
$env:PHMS_SESSION_COOKIE='temporary-session-token'
node scripts/m7/load-smoke.mjs
Remove-Item Env:PHMS_SESSION_COOKIE
```

The default gate is 100 requests, concurrency 10, zero failures and inventory
read p95 below 1000 ms. Production load testing must use synthetic data and
never copy patient/customer information outside the protected environment.

## Security review checklist

- runtime and worker roles are not superusers and cannot bypass RLS
- database URLs and session secrets are managed outside Git
- development services bind to `127.0.0.1`
- platform and tenant cookies remain separate
- support sessions remain read-only, approved, one-time and short-lived
- append-only audit, inventory and finance records reject mutation
- every tenant-owned table has forced RLS and two-tenant tests
- logs redact cookies, authorization and passwords
- restore credentials are separate from runtime credentials
- migration files and validation reports are retained with the release evidence

## Rollback

Before DNS or user cutover, rollback means stop the new application and return
users to the unchanged legacy system. After writes begin in PostgreSQL, automatic
rollback to MongoDB is forbidden because it would lose new evidence. The incident
commander chooses one of:

- forward-fix PostgreSQL while the application is read-only
- restore PostgreSQL to the pre-cutover backup and replay approved evidence
- export post-cutover deltas for a reviewed manual recovery

Every rehearsal records start/end time, operator, backup checksum, migration
manifest, reconciliation report and decision.
