# M5 legacy reporting and notification characterization

## Legacy behavior inspected

- administrator dashboard and staff shortcut dashboard
- sales and customer-history reports
- daily, weekly, and monthly charts
- category revenue and units
- top medicine movement
- paid versus remaining distribution
- low-stock, expiry, and overdue-debt notifications
- printable invoice component

## Preserved user outcomes

- filter reports by date and product category
- see sales count, revenue, debt, overdue debt, low stock, and expenses
- inspect recent sales and receivables
- view daily, weekly, and monthly trends
- compare category sales and top products
- search customer history by phone
- see batches approaching expiry
- receive low-stock, expiry, and overdue-debt alerts
- download or print an invoice
- export report data

## Legacy weaknesses corrected by M5

- MongoDB loads entire collections and aggregates in application memory
- reports have no tenant or branch boundary
- revenue does not consistently subtract returns and voids
- collection reporting mixes sale totals with later debt mutations
- margin cannot be reproduced because batch cost allocations are ignored
- expense deletion can change historical results
- alert scans run inside the HTTP request
- notification results are not persisted, deduplicated, or acknowledged
- exports have no durable job, retry, ownership, or expiry record
- invoice rendering is tied to the browser rather than a server snapshot
- there are no measured indexes or bounded report ranges

## M5 compatibility decisions

M5 reports exclusively from immutable M3/M4 evidence:

- net sales: completed sale total less return value; voided sales contribute zero
- cash collection: `PAYMENT` events less `REFUND` and `REVERSAL` events
- margin: net sale value less allocated batch cost for unreturned quantities
- expenses: only `POSTED` expenses
- debt: current positive receivable, with overdue derived from due date
- stock: current guarded batch projection, grouped by product and branch
- expiry: positive batches within the requested horizon

Every query is tenant-scoped, requires explicit branch access where applicable,
uses a bounded date range, and returns exact decimal strings.
