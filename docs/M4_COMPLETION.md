# M4 sales and finance completion

## Outcome

M4 is complete. The platform now supports tenant- and branch-isolated checkout,
invoices, payments, debt, returns, sale voiding, and expenses on PostgreSQL.
Inventory and finance evidence commit together and destructive financial
deletion is prohibited.

Completed locally on July 26, 2026:

- migrations: `202607260005_m4_finance_core` and
  `202607260006_m4_finance_security`
- local databases: `phms_dev` and `phms_test`
- complete API/PostgreSQL suite: 69 passed, 0 skipped
- web suite: 1 passed
- M4 live finance workflows: 7 passed, 0 skipped
- M4 exact-money and route contracts: 12 passed
- lint, type checks, production builds, and formatting: passed
- dependency audit: 0 vulnerabilities

## Implemented model

- daily tenant/branch invoice sequences
- sales and immutable commercial item snapshots
- batch-level sale allocations
- append-only payments and refunds
- one receivable/debt projection per credit sale
- append-only sale returns and return items
- tenant expense categories
- posted and voided branch expenses

## Implemented workflows

### Checkout

- validates category package and whole package quantity
- reads the configured package price
- performs exact four-decimal arithmetic
- locks unexpired inventory batches in expiry-first order
- rejects insufficient stock
- allocates one daily branch invoice number
- snapshots name, SKU, package, quantity, unit price, unit cost, discount, tax,
  and line total
- writes batch allocations and immutable `SALE` stock movements
- records an initial payment
- creates debt when a balance remains
- writes the audit event
- replays safely by tenant idempotency key
- commits or rolls back as one serializable PostgreSQL transaction

### Payments and debt

- accepts positive payments up to the locked remaining balance
- records method, external reference, collector, notes, and idempotency key
- updates sale and debt totals in the same transaction
- derives `OPEN`, `OVERDUE`, `PAID`, and `VOIDED` debt status
- exposes branch-scoped debt lists and payment history

### Returns and voids

- rejects quantities greater than the unreturned sold quantity
- restores the original inventory batch allocations
- writes immutable `RETURN` or `VOID` stock movements
- calculates the return value from immutable line snapshots
- records a linked append-only refund
- updates return, payment, balance, sale, and debt projections atomically
- requires a reason and elevated tenant permission

### Expenses

- uses tenant-owned expense categories
- posts positive, exact-decimal branch expenses idempotently
- records creator, date, note, and audit event
- voids with actor, timestamp, and reason
- never physically deletes an expense

## API endpoints

| Method | Endpoint                           | Purpose                          |
| ------ | ---------------------------------- | -------------------------------- |
| `GET`  | `/api/v1/sales`                    | List/search branch sales         |
| `POST` | `/api/v1/sales`                    | Atomic checkout                  |
| `GET`  | `/api/v1/sales/:saleId`            | Invoice and financial history    |
| `POST` | `/api/v1/sales/:saleId/payments`   | Record a debt payment            |
| `POST` | `/api/v1/sales/:saleId/returns`    | Return sale quantities           |
| `POST` | `/api/v1/sales/:saleId/void`       | Void remaining sale quantities   |
| `GET`  | `/api/v1/debts`                    | List branch receivables          |
| `GET`  | `/api/v1/debts/:debtId`            | Read debt, invoice, and payments |
| `GET`  | `/api/v1/expenses/categories`      | List tenant expense categories   |
| `POST` | `/api/v1/expenses/categories`      | Create an expense category       |
| `GET`  | `/api/v1/expenses`                 | List branch expenses             |
| `POST` | `/api/v1/expenses`                 | Post an expense                  |
| `POST` | `/api/v1/expenses/:expenseId/void` | Void an expense                  |

## Permission model

| Capability               | Roles                                      |
| ------------------------ | ------------------------------------------ |
| Read/create branch sales | Owner, Admin, Manager, Pharmacist, Cashier |
| Collect debt payments    | Owner, Admin, Manager                      |
| Return or void sales     | Owner, Admin, Manager                      |
| Read expenses            | Owner, Admin, Manager, Auditor             |
| Create expenses          | Owner, Admin, Manager                      |
| Void expenses            | Owner, Admin                               |

Branch assignment is still required for every branch-scoped action.

## Verified database invariants

1. All M4 business tables have forced tenant RLS.
2. Missing or different tenant context cannot see sales or finance rows.
3. Compound foreign keys reject cross-tenant branches, products, packages,
   batches, memberships, sales, items, payments, debt, returns, and expenses.
4. Direct updates to sales, sale-item projections, debts, invoice sequences,
   and expenses are blocked without the transaction-local finance guard.
5. Payments, batch allocations, returns, and return items are append-only.
6. The runtime role has no delete privilege on finance evidence.
7. Database checks enforce positive quantities, positive tender/expense values,
   non-negative totals, valid void state, and bounded return quantities.
8. Checkout and later financial commands use tenant-scoped idempotency keys.
9. Inventory batches are locked before decrement or restoration.
10. Invoice sequences, sale, stock, payment/debt, and audit writes share one
    transaction.

## Legacy corrections

The M4 implementation intentionally replaces:

- non-transactional MongoDB stock decrements
- floating-point currency
- random invoice suffixes
- race-prone debt payment updates
- missing payment evidence
- destructive expense deletion
- absent return and cancellation workflows

The detailed evidence is in `M4_LEGACY_FINANCE_CHARACTERIZATION.md`; the domain
and locking contract is in `M4_DOMAIN_DESIGN.md`.

## M5 handoff

M5 can build dashboards, reports, exports, notifications, and background jobs
from immutable M3/M4 records. M5 must:

- report revenue from posted sales net of return values
- report cash collections from payment events net of refunds
- calculate margin from sale allocations and captured unit costs
- exclude voided expenses and include posted expenses by branch/date/category
- derive overdue debt without rewriting rows during reads
- preserve tenant and branch context in every background job
- use idempotent job keys and safe retries
- produce invoice PDFs from immutable snapshots
- add indexed aggregate queries and measured query plans before caching
