# M3 product catalog and inventory completion

## Outcome

M3 is complete. The platform now has a tenant-isolated product catalogue,
category-aware packaging, batch inventory, and an immutable stock ledger backed
by PostgreSQL row-level security.

Completed locally on July 26, 2026:

- PostgreSQL databases: `phms_dev` and `phms_test`
- migration role: `phms_migrator`
- runtime role: `phms_app`
- migrations applied: `202607260003_m3_inventory_core` and
  `202607260004_m3_inventory_security`
- live inventory workflow tests: 7 passed, 0 skipped
- complete API test suite: 50 passed, 0 skipped
- web test suite: 1 passed
- lint, type checks, production builds, and formatting: passed
- dependency audit: 0 vulnerabilities
- Prisma schema: valid; all 4 migrations current in both local databases

## Domain decisions

- Product identity and packaging definitions are tenant-owned.
- A product has one integer base unit used by every stock operation.
- Package levels convert to base units through positive integer multipliers.
- Monetary values use fixed PostgreSQL numeric values and API decimal strings,
  never JavaScript floating-point arithmetic.
- Branch products control branch availability without duplicating the product.
- Inventory is held in batches so expiry, cost, source, and quantity remain
  traceable.
- Stock movements are the immutable business ledger; batch balances are a
  transactionally maintained projection.
- Receipt and expiry workflows are batch-aware.
- Transfers create paired source and destination movements in one transaction.

The detailed category and packaging rules are recorded in
`M3_DOMAIN_DESIGN.md`. The preserved legacy behavior and intentional changes
are recorded in `M3_LEGACY_INVENTORY_CHARACTERIZATION.md`.

## Implemented data model

- `products`
- `product_packages`
- `branch_products`
- `inventory_batches`
- `inventory_receipts`
- `inventory_receipt_items`
- `stock_movements`
- `inventory_transfers`
- `inventory_transfer_items`

All tenant-owned relationships include `tenant_id` and use compound tenant
foreign keys. Branch-bound relationships also validate that the branch belongs
to the same tenant.

## Implemented workflows

1. Create and update products with optimistic version checks.
2. Define category-valid packaging levels and exact base-unit conversions.
3. Enable or disable a product at a branch.
4. Receive stock into an existing or new batch.
5. Retry a receipt safely with an idempotency key.
6. Apply a reason-coded positive or negative adjustment.
7. Reject any operation that would produce negative stock.
8. Write an expired batch down to zero with an `EXPIRED` ledger movement.
9. Transfer stock atomically between assigned branches.
10. Browse current batches and the immutable movement history.

## API endpoints

All endpoints require an authenticated tenant session. Branch-scoped operations
also require assignment to the requested branch.

| Method  | Endpoint                                         | Purpose                         |
| ------- | ------------------------------------------------ | ------------------------------- |
| `GET`   | `/api/v1/products`                               | List tenant products            |
| `POST`  | `/api/v1/products`                               | Create a product                |
| `GET`   | `/api/v1/products/:productId`                    | Read one tenant product         |
| `PATCH` | `/api/v1/products/:productId`                    | Update with version protection  |
| `GET`   | `/api/v1/inventory/branches/:branchId/stock`     | List current batch stock        |
| `GET`   | `/api/v1/inventory/branches/:branchId/movements` | List stock ledger entries       |
| `POST`  | `/api/v1/inventory/receipts`                     | Receive stock idempotently      |
| `POST`  | `/api/v1/inventory/adjustments`                  | Adjust stock with a reason      |
| `POST`  | `/api/v1/inventory/expiry-write-offs`            | Dispose of expired stock        |
| `POST`  | `/api/v1/inventory/transfers`                    | Transfer stock between branches |

## Database and security invariants

1. Every inventory row is tenant-owned and protected by forced RLS.
2. Missing tenant context exposes no inventory records.
3. Compound foreign keys reject cross-tenant product, branch, batch, receipt,
   movement, and transfer references.
4. Application transactions set tenant, user, membership, and branch context.
5. Service authorization requires the relevant permission and branch
   assignment before database work starts.
6. Batch rows are locked before balance-changing operations.
7. A database trigger rejects negative batch balances.
8. Direct batch balance changes are rejected unless the trusted inventory
   workflow sets a transaction-local write guard.
9. Stock movements cannot be updated or deleted.
10. Idempotency keys are unique within the tenant and workflow.
11. Receipt and transfer headers, lines, batches, balances, movements, and
    audit events commit or roll back together.
12. Product updates use an optimistic `version` to reject lost updates.

## Automated evidence

- twelve supported product categories and valid package levels
- invalid package hierarchy rejection
- exact package-to-base-unit conversion
- product API authentication, validation, and delegation contracts
- inventory API authentication, branch validation, and delegation contracts
- tenant product isolation
- receipt idempotency
- non-negative adjustment enforcement
- paired branch transfer movements
- unassigned-branch transfer rejection
- expired batch write-off
- direct balance-write protection
- immutable stock ledger enforcement

## Operational notes

- Use `phms_migrator` only for Prisma migration, deployment, and controlled
  seeding.
- Run the API with `phms_app`; it has no superuser or `BYPASSRLS` capability.
- Keep `apps/api/.env` and `.env.database.local` local and uncommitted.
- New inventory writes must go through the inventory service so locking,
  authorization, idempotency, audit, and ledger invariants remain intact.

## M4 handoff

M4 can build sales, invoices, debt, payments, and expenses on this stock
boundary. Checkout must:

- lock the selected batches in a deterministic order
- perform conditional non-negative decrements
- write immutable `SALE` movements
- snapshot product name, package, quantity, unit price, tax, discount, and cost
  into sale items
- use a tenant-scoped idempotency key
- allocate tenant/branch invoice numbers transactionally
- commit the sale, payment/debt entry, stock movements, balances, and audit
  event in one database transaction
