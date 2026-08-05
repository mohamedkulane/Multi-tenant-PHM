# M12 — Customer Accounts, Suppliers, Laboratory and Invoice Controls

## Scope

M12 adds four tenant-isolated operating domains without changing the existing inventory and finance transaction rules:

- reusable customer accounts and a chronological sales/debt/payment ledger;
- supplier master data linked to inventory receipts;
- laboratory catalog, patient registration, visits, results, billing, and browser-print reports;
- tenant-managed invoice layout and pharmacist discount controls.

## Customer and debt workflow

1. Staff registers a customer once using name and unique phone number.
2. POS staff selects the customer account before checkout.
3. The sale stores `customer_id` plus immutable customer name/phone snapshots.
4. Any unpaid balance continues to create the existing per-invoice debt record.
5. The customer ledger aggregates all linked invoices, balances and payments.
6. A returning customer can receive another credit sale on the same account.
7. Each ledger invoice opens as a clean branded browser-print invoice; no PDF download is required.

The existing debt collection workflow remains per invoice, preserving payment allocation and audit evidence.

## Supplier workflow

OWNER, ADMIN and MANAGER can maintain suppliers. PHARMACIST and AUDITOR have read access. An inventory receipt can select an active supplier; the receipt retains both `supplier_id` and the supplier-name snapshot.

## Laboratory workflow

1. OWNER, ADMIN or MANAGER creates laboratory categories.
2. Tests/diseases are registered under a category with an active status and price.
3. A patient is registered with name, age, optional sex, phone and notes.
4. A visit selects one or more active tests and snapshots their category, name and price.
5. A lab discount is applied before payment and cannot exceed the subtotal.
6. The patient chooses **Pay now** or **Pay when collecting result**. Unpaid visits visibly retain their balance.
7. OWNER, ADMIN or MANAGER collects a later payment from the visit. Payments are append-only, idempotent and cannot exceed the locked outstanding balance.
8. Authorized staff marks each result as NEGATIVE, POSITIVE or INCONCLUSIVE and adds a note.
9. Positive results are highlighted in the UI.
10. The laboratory result and billing summary are finalized with a complete audit trail.
11. The professional laboratory report is printed directly from the browser; Lab does not create prescriptions or PDFs.

## Invoice and branding controls

OWNER and ADMIN manage these settings from Account:

- display name, logo URL, primary color and accent color;
- invoice title and footer;
- A4, A5 or 80mm thermal paper size;
- invoice-logo visibility;
- maximum pharmacist sale discount percentage.

The tenant logo is displayed prominently at the top of the tenant sidebar. Sales invoices use a branded browser-print layout with customer, item, payment and balance details.

## Discount enforcement

The frontend shows the configured value, but the API is authoritative. For PHARMACIST checkouts, the server calculates the maximum allowed discount from the subtotal and rejects a larger value with `PHARMACIST_DISCOUNT_LIMIT_EXCEEDED`.

## Notification behavior

Opening the notification area performs a current scan. Notifications distinguish:

- `EXPIRED MEDICINE` for stock already past its expiry date;
- `EXPIRES TODAY` for same-day expiry;
- `EXPIRING MEDICINE` for stock inside the configured horizon;
- low-stock products using each branch's reorder threshold;
- overdue customer debt.

## Security and tenancy

Migration `202608010018_customer_supplier_lab` enables and forces PostgreSQL RLS on every new tenant table. Each policy compares `tenant_id` with `app_private.current_tenant_id()`. Foreign keys include tenant IDs wherever records cross domain boundaries. Runtime access remains assigned to the restricted `phms_app` role; schema migrations require `phms_migrator`.

## Local migration

The local `.env` must contain a working `phms_migrator` connection. Temporarily set `DATABASE_URL` to the migrator connection for `phms_dev`, run `npm run db:deploy --workspace @phms/api`, then restore `DATABASE_URL` to `phms_app` before starting the application.

## Checkout and branch rules

- A sale with any remaining balance requires a real customer name and phone number or a selected customer account.
- A fully paid or otherwise zero-balance sale cannot accept another payment. The API validates the balance and the UI hides the payment action.
- OWNER and ADMIN may operate across all authorized branches. MANAGER, PHARMACIST, CASHIER and AUDITOR must be assigned to one or more specific branches.
- Branch restrictions are enforced by API authorization and PostgreSQL tenant context, not only by the frontend.

Migration 202608010019_lab_payments adds the append-only, tenant-isolated Lab payment ledger with RLS and idempotency protection.
