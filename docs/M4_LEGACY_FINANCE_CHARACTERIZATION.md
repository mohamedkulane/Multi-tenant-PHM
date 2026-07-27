# M4 legacy sales and finance characterization

## Scope inspected

The legacy MongoDB application was traced through its sale, invoice, debt,
expense, dashboard, report, notification, route, model, and React screen code.
This document is the behavior baseline for M4.

## Legacy sale behavior

1. An authenticated administrator or staff member can create a sale.
2. Customer name and at least one cart item are required.
3. Quantity is a positive whole number.
4. The selected sale unit must be allowed by the medicine category.
5. Packaging metadata converts the sold package into base units.
6. The server derives the price from the stored package configuration.
7. Stock is checked against the medicine's saved base-unit quantity.
8. Subtotal is the sum of item quantity multiplied by package price.
9. Discount is subtracted from subtotal, with a zero floor.
10. Amount paid is capped at the grand total.
11. Any remaining balance creates a debt, due in seven days by default.
12. The initial payment is also copied into debt payment history.
13. The sale stores medicine name, sale unit, quantity, units deducted, price,
    and subtotal snapshots.
14. Staff can list only their own sales and invoices; administrators see all.

## Legacy invoice behavior

- A sale is also the invoice record.
- Invoice numbers use `INV-YYYYMMDD-RANDOM`.
- Invoice numbers are globally unique rather than tenant/branch scoped.
- Invoices can be searched by number, customer name, or phone.
- The printable invoice includes customer, line items, subtotal, discount,
  total, paid amount, balance, cashier, and date.

## Legacy debt and payment behavior

- A debt is created only when checkout leaves a positive balance.
- Status is derived as `paid`, `unpaid`, or `overdue`.
- Administrators can list debts, read a debt, and add a payment.
- A payment must be positive and is capped at the remaining balance.
- Payment history stores only amount and timestamp.
- Each payment updates both the debt totals and the linked sale totals.

## Legacy expense behavior

- Administrators can list, create, and delete expenses.
- An expense contains title, free-text category, amount, date, note, and actor.
- Deletion permanently removes the record and writes an audit event.

## Reporting dependencies

- Sales reports aggregate sale count, grand total, amount paid, and balance.
- Customer history joins sales and debts by phone text.
- Dashboard revenue reads sale totals and debt payments.
- Overdue debt notifications compare due date with the current time.

## Missing or unsafe legacy behavior

The following behavior must not be copied:

- stock decrements happen before sale creation and are not in one transaction
- concurrent checkouts can oversell the same stock
- a partial failure can reduce stock without creating the sale or debt
- money uses JavaScript floating point
- random invoice numbers do not provide an auditable branch sequence
- idempotency is absent, so retries can duplicate sales and payments
- debt and sale totals can diverge under concurrent payments
- payment method, reference, collector, and reversal state are not recorded
- expenses are hard-deleted
- sale items do not retain cost, tax, or batch allocation evidence
- there is no sale return, refund, or controlled void workflow
- legacy staff visibility is actor-based rather than explicit branch access
- MongoDB documents have no tenant boundary

## M4 compatibility decisions

M4 preserves:

- category-specific package sales
- positive whole package quantities
- exact base-unit deduction
- customer name and optional phone
- fixed discount support
- full, partial, or zero payment at checkout
- automatic debt creation for a remaining balance
- seven-day default due date
- searchable and printable invoices
- debt payment history
- expense entry and reporting

M4 intentionally improves:

- one PostgreSQL transaction for sale, stock, payment/debt, and audit
- fixed decimal money represented as strings at the API boundary
- deterministic tenant/branch invoice sequences
- immutable item, payment, allocation, and ledger evidence
- idempotent checkout, payment, return, and expense commands
- branch and permission authorization
- append-only reversal instead of destructive deletion
- controlled returns and full-sale voiding
- tenant RLS and compound tenant foreign keys
