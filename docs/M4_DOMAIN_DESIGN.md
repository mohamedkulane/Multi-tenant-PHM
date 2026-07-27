# M4 sales and finance domain design

## Transaction boundary

Checkout is one serializable PostgreSQL transaction:

1. authenticate tenant membership and authorize the branch
2. resolve or replay the tenant-scoped idempotency key
3. lock the branch invoice sequence
4. resolve product package and immutable price snapshot
5. lock eligible inventory batches in expiry-first order
6. reject expired or insufficient stock
7. create the sale and item snapshots
8. create batch allocations and immutable `SALE` stock movements
9. update guarded batch balance projections
10. create the initial payment when amount paid is positive
11. create debt when a balance remains
12. write the audit event
13. commit everything or roll back everything

## Money

- PostgreSQL uses `numeric(19,4)` for customer-facing money.
- Unit cost snapshots use `numeric(19,6)`.
- API inputs and outputs use canonical decimal strings.
- Arithmetic is performed with integer minor units at four-decimal precision.
- A line total is quantity multiplied by package unit price.
- `subtotal = sum(line totals)`.
- `grand total = max(0, subtotal - discount)`.
- `balance = grand total - successful non-refund payments`.
- Payment and refund amounts cannot exceed the current balance they settle.

## Invoice numbering

Each tenant and branch has an independent daily sequence.

Format:

`INV-{BRANCH_CODE}-{YYYYMMDD}-{000001}`

The `(tenant_id, branch_id, business_date)` sequence row is updated inside the
checkout transaction. Rollbacks do not consume a committed invoice number.

## Aggregate model

### Sale

The invoice header and lifecycle aggregate. It stores customer snapshots,
totals, payment state, status, invoice number, idempotency key, branch, actor,
and timestamps.

### Sale item

An immutable commercial snapshot of product name, SKU, package label,
base-unit conversion, quantity, price, cost, subtotal, discount allocation,
tax, and final line total.

### Sale item allocation

Records exactly which inventory batches supplied a sale item and the unit cost
at checkout. It is the basis for traceable returns and margin reports.

### Payment

An append-only tender event. Negative corrections are represented by a linked
reversal/refund event, never by editing a successful payment.

### Debt

The outstanding receivable projection for one sale. Payments are authoritative;
debt paid and remaining totals are updated in the same locked transaction.
`OVERDUE` is derived when an open balance passes its due date.

### Return

An idempotent, reason-coded event containing returned item quantities. Returns
restore the original allocated batches and write immutable `RETURN` movements.
A refund payment event may be recorded in the same transaction.

### Expense

An expense is posted once and later voided with actor, time, and reason. It is
never physically deleted. Categories are tenant-owned; expenses are branch
scoped.

## Lifecycle states

Sale:

- `COMPLETED`
- `PARTIALLY_RETURNED`
- `RETURNED`
- `VOIDED`

Debt:

- `OPEN`
- `OVERDUE`
- `PAID`
- `VOIDED`

Expense:

- `POSTED`
- `VOIDED`

## Authorization

| Capability                   | Roles                                      |
| ---------------------------- | ------------------------------------------ |
| Create and read branch sales | Owner, Admin, Manager, Pharmacist, Cashier |
| Record debt payment          | Owner, Admin, Manager                      |
| Return items                 | Owner, Admin, Manager                      |
| Void a completed sale        | Owner, Admin, Manager                      |
| Read expenses                | Owner, Admin, Manager, Auditor             |
| Create expenses              | Owner, Admin, Manager                      |
| Void expenses                | Owner, Admin                               |
| Read financial reports       | Owner, Admin, Manager, Pharmacist, Auditor |

Every operation additionally requires access to its branch.

## Database invariants

1. All business rows carry `tenant_id` and forced RLS.
2. All cross-table references use tenant compound keys.
3. Invoice and idempotency uniqueness are tenant scoped.
4. Completed sale items and allocations are immutable.
5. Payment and return records are append-only.
6. Sale, payment, debt, and expense totals are non-negative.
7. Paid plus outstanding equals the sale total before returns.
8. Returned quantity cannot exceed sold quantity.
9. Refund cannot exceed the refundable amount.
10. A void or return uses compensating stock and payment records.
11. Batch balance writes retain the M3 guarded-write trigger.
12. Audit events commit with the command they describe.

## Locking and deadlock prevention

- Lock idempotency/header rows before mutable projections.
- Lock inventory batches in `(expiry_date, id)` order.
- Lock sale, then debt, then payment state for later collections.
- Lock return allocations in sale-item and batch order.
- Never call an external payment provider inside the database transaction.

## API command design

- `POST /api/v1/sales`
- `GET /api/v1/sales`
- `GET /api/v1/sales/:saleId`
- `POST /api/v1/sales/:saleId/payments`
- `POST /api/v1/sales/:saleId/returns`
- `POST /api/v1/sales/:saleId/void`
- `GET /api/v1/debts`
- `GET /api/v1/debts/:debtId`
- `GET /api/v1/expense-categories`
- `POST /api/v1/expense-categories`
- `GET /api/v1/expenses`
- `POST /api/v1/expenses`
- `POST /api/v1/expenses/:expenseId/void`
