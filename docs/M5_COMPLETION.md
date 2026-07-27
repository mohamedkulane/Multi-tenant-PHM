# M5 reporting and asynchronous work completion

## Outcome

M5 is complete. The platform now provides tenant-safe dashboards, financial and
inventory reports, margin analysis, durable export/notification jobs,
deduplicated alerts, CSV artifacts, and server-generated invoice PDFs.

Completed locally on July 26, 2026:

- migrations: `202607260007_m5_reporting_jobs_core` and
  `202607260008_m5_reporting_jobs_security`
- local databases: `phms_dev` and `phms_test`
- M5 live PostgreSQL workflows: 5 passed, 0 skipped
- M5 artifact and route contracts: 9 passed
- complete API/PostgreSQL suite: 83 passed, 0 skipped
- web suite: 1 passed
- Prisma schema valid; all 8 migrations current in both local databases
- all repository quality gates: passed
- dependency audit: 0 vulnerabilities

## Reporting

- dashboard cards for gross sales, returns, net sales, collections,
  receivables, overdue debt, posted expenses, and low stock
- daily net-sales trend and top-product movement
- bounded sales, inventory, debt, expense, customer-history, and margin reports
- exact Decimal margin using immutable sale allocation cost
- explicit removal of voided sales and expenses
- refund-aware collection and net-revenue calculations
- report indexes for sales, payments, stock, expenses, and debt

## Durable jobs and exports

- PostgreSQL local-first durable outbox
- tenant-scoped deduplication keys
- `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, and `DEAD` states
- transactional job claim with `FOR UPDATE SKIP LOCKED`
- trusted worker mutation guard
- retry scheduling with exponential backoff
- immutable CSV artifacts with SHA-256 checksum and seven-day expiry
- tenant and branch authorization on status and download
- spreadsheet formula-injection protection

## Notifications

- low-stock alerts
- expiring-batch alerts
- overdue-debt alerts
- stable fingerprints prevent duplicate alerts
- persistent unread/read state
- acknowledgement records membership and timestamp
- notification rows cannot be deleted by the runtime role

## Invoice documents

The API generates downloadable PDF invoices from immutable M4 snapshots,
including tenant, branch, customer, items, totals, return value, payment/refund
history, status, and trace identifier. Long invoices paginate automatically.

## API endpoints

| Method | Endpoint                                     | Purpose                    |
| ------ | -------------------------------------------- | -------------------------- |
| `GET`  | `/api/v1/reports/dashboard`                  | Branch dashboard           |
| `GET`  | `/api/v1/reports/sales`                      | Sales report               |
| `GET`  | `/api/v1/reports/inventory`                  | Inventory report           |
| `GET`  | `/api/v1/reports/debts`                      | Debt report                |
| `GET`  | `/api/v1/reports/expenses`                   | Expense report             |
| `GET`  | `/api/v1/reports/margin`                     | Product margin report      |
| `GET`  | `/api/v1/reports/customer-history`           | Customer sale history      |
| `GET`  | `/api/v1/reports/invoices/:saleId.pdf`       | Download invoice PDF       |
| `POST` | `/api/v1/jobs/exports`                       | Queue report export        |
| `POST` | `/api/v1/jobs/notification-scans`            | Queue notification scan    |
| `GET`  | `/api/v1/jobs/:jobId`                        | Read job status            |
| `POST` | `/api/v1/jobs/:jobId/process`                | Local worker execution     |
| `GET`  | `/api/v1/jobs/exports/:exportId/download`    | Download CSV artifact      |
| `GET`  | `/api/v1/notifications`                      | List branch notifications  |
| `POST` | `/api/v1/notifications/:notificationId/read` | Acknowledge a notification |

## Verified security invariants

1. Jobs, notifications, and artifacts use forced tenant RLS.
2. Branch access is checked for reports, jobs, downloads, alerts, and invoices.
3. Cross-tenant report and artifact reads return no records.
4. Direct job state changes are rejected without the worker guard.
5. Export artifacts are append-only.
6. Notification state changes require the notification workflow guard.
7. Synchronous report ranges are limited to 366 days.
8. Report result sizes are bounded.
9. Job payloads contain no credentials or session tokens.
10. Financial metrics derive from immutable M3/M4 evidence.

## M6 handoff

M6 can build platform administration: tenant onboarding, plans, limits,
suspension, branding, and audited support sessions. Platform operations must
remain separate from tenant roles and must never obtain silent RLS bypass.
