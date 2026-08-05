# M10 — Staff, Branding, Product Units, and Sales Completion

## Delivered

- Immediate tenant/platform login redirect with success toast.
- Tenant-safe staff directory RLS policy.
- Direct active staff registration with password hashing.
- Owner/Admin role boundaries and branch-scoped assignment enforcement.
- Owner/Admin branding management for display name, logo, colors, invoice footer, and support contact.
- Pharmacy logo shown in the tenant header.
- Category-aware product packaging forms for all twelve pharmacy categories.
- Package-specific pricing and integer base-unit conversions.
- Multi-item sales cart using package codes, quantities, and package prices.
- Atomic PostgreSQL checkout with FEFO batch allocation and base-unit stock deduction.

## Security rules

- Tenant user directory access is SELECT-only and limited to users with a membership in the current tenant.
- Only an OWNER can create or manage an ADMIN.
- ADMIN users may create MANAGER, PHARMACIST, CASHIER, and AUDITOR accounts.
- Branch-scoped administrators cannot grant all-branch access or assign branches outside their own scope.
- OWNER is never available through ordinary staff registration.
- Every staff creation and branding update writes an immutable tenant audit event.

## Product and sale unit model

- Stock is stored in indivisible base units.
- Every sellable package stores `units_per_package`.
- Checkout converts package quantity into base units and decrements inventory atomically.
- Sale items preserve product, package, quantity, unit price, cost, and allocation evidence.
- Packages currently cover carton, box, small box, strip, pack, bottle, vial/ampoule, bag,
  tube/jar, tablet/capsule, pad, and piece variants as appropriate for the category.

## Verification

- Prisma migration `202607290012_m9_tenant_user_directory_rls` applied to local `phms_dev`.
- ESLint passed for API and web.
- TypeScript type checking passed for API and web.
- API tests: 77 passed, 29 live integration tests skipped by environment.
- Web tests: 4 passed, including immediate login redirect and success toast.
- API and web production builds passed.
- Prettier formatting check passed.
