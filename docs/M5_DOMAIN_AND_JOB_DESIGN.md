# M5 reporting, jobs, notifications, and documents design

## Reporting boundary

Reports are read models over M3/M4 records. They do not rewrite business
transactions and do not become a second source of truth.

| Metric             | Authoritative source                                  |
| ------------------ | ----------------------------------------------------- |
| gross sales        | `sales.grand_total` excluding voids                   |
| returns            | `sales.returned_total`                                |
| net sales          | gross less returns                                    |
| collections        | payment events net of refunds and reversals           |
| receivables        | non-voided debt remaining amount                      |
| cost of goods sold | sale batch allocations adjusted for returned quantity |
| margin             | net sales less cost of goods sold                     |
| expenses           | posted expense events                                 |
| stock              | guarded inventory batch balance projection            |

## Date and branch semantics

- Requests supply ISO `YYYY-MM-DD` dates.
- Maximum synchronous report range is 366 days.
- Dates are interpreted in the branch timezone contract; the current local
  implementation uses stored business dates for financial reports.
- Branch reports require branch assignment.
- Tenant-wide category/customer reports require `report.read`.
- All monetary output is a decimal string.

## Durable job model

M5 uses PostgreSQL as the local-first durable outbox and job queue. This avoids
requiring Redis for pgAdmin development while preserving the interface needed
for a future BullMQ adapter.

Job lifecycle:

`QUEUED -> RUNNING -> SUCCEEDED`

Failures retry with exponential backoff until `max_attempts`, then become
`DEAD`. Workers claim jobs with `FOR UPDATE SKIP LOCKED`, set tenant context
before business queries, and use a tenant-scoped deduplication key.

Supported jobs:

- `REPORT_EXPORT`
- `NOTIFICATION_SCAN`

Export artifacts carry tenant, optional branch, filename, MIME type, checksum,
content, and expiry time. A user can download only artifacts visible through
the same tenant RLS and branch authorization.

## Notifications

Notification scans create stable fingerprints so repeated scans do not create
duplicates. Types:

- low stock
- batch expiring within the selected horizon
- overdue debt
- permanently failed job

Notifications are persistent and can be acknowledged without deleting them.

## Invoice documents

Invoice PDF generation reads the immutable sale, item, payment, return, branch,
and tenant snapshots under tenant context. The document contains:

- pharmacy and branch
- invoice number and date
- customer
- item package/quantity/price/line total
- subtotal, discount, tax, total, returned value, paid, and balance
- payment/refund history
- status and traceable sale identifier

## Security invariants

1. Jobs, notifications, and artifacts carry `tenant_id` and forced RLS.
2. Branch-scoped artifacts and notifications carry `branch_id`.
3. Job payload never contains passwords, session tokens, or database URLs.
4. Deduplication is unique within a tenant.
5. Only trusted worker code can claim or complete jobs.
6. Successful artifacts are immutable.
7. Downloads reauthorize tenant and branch access.
8. CSV values are escaped against spreadsheet formula injection.
9. PDF text is escaped and generated from server-side snapshots.
10. Report ranges and result sizes are bounded.
