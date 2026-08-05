# Page Dependency Trees

## /lab (Laboratory)

Entry: `apps/web/src/pages/operations-pages.tsx` (LabPage)
Dependencies:

- `apps/web/src/pages/operations-pages.tsx`
  - `apps/web/src/api/client.ts`
  - `apps/web/src/components/ui.tsx`
  - `apps/web/src/components/toast.tsx`
  - `apps/web/src/types.ts`
- `apps/web/src/application.tsx`
  - `apps/web/src/components/shell.tsx`
  - `apps/web/src/styles.css`

## /sales (Pharmacy POS)

Entry: `apps/web/src/pages/tenant-pages.tsx` (SalesPage)
Dependencies:

- `apps/web/src/pages/tenant-pages.tsx`
  - `apps/web/src/pages/sales-cart.ts`
  - `apps/web/src/api/client.ts`
  - `apps/web/src/components/ui.tsx`
  - `apps/web/src/components/toast.tsx`
  - `apps/web/src/types.ts`
- `apps/web/src/application.tsx`
  - `apps/web/src/components/shell.tsx`
  - `apps/web/src/styles.css`

## /dashboard

Entry: `apps/web/src/pages/tenant-pages.tsx` (DashboardPage)
Dependencies mirror the tenant shell and shared UI primitives above, plus Recharts.

## /products

Entry: `apps/web/src/pages/tenant-pages.tsx` (ProductsPage)
Dependencies: shared API client, UI primitives, toast, types, tenant shell, global styles.

## /inventory

Entry: `apps/web/src/pages/tenant-pages.tsx` (InventoryPage)
Dependencies: shared API client, UI primitives, toast, types, tenant shell, global styles.

## /customers

Entry: `apps/web/src/pages/operations-pages.tsx` (CustomersPage)
Dependencies: shared API client, UI primitives, toast, types, tenant shell, global styles.

## /account

Entry: `apps/web/src/pages/tenant-pages.tsx` (AccountPage)
Dependencies: shared API client, UI primitives, toast, types, tenant shell, global styles.
