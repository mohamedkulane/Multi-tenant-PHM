# M13 Lab, alerts, analytics, subscriptions, and platform settings

Completed: 2026-08-04

## Delivered behavior

- Lab prescriptions were removed from the Prisma schema, API permissions/routes, service, and frontend.
- Lab visits support discounts and payment now or later. Patient and visit lists provide search and 10-row pagination.
- Lab reports use browser print and contain pharmacy, branch, patient, test/result, subtotal, discount, total, paid, balance, payment history, and signature information.
- Raw Prisma and database messages are replaced with user-friendly page errors and toasts.
- Expired batches cannot be received or transferred. Alerts automatically scan expired, near-expiry, low-stock, and overdue-debt conditions.
- The header displays a red unread count, a notification dropdown, and clickable platform-message toasts linked to the Alerts Center.
- Tenant dashboard top products use an animated donut chart. Sales trend supports daily, weekly, and monthly views.
- Platform tenant lifecycle uses a donut chart.
- Report jobs export Excel-compatible `.xls` workbooks with styled headings and spreadsheet-formula protection.
- Staff and branch Delete actions use safe archival: sessions and access are revoked while sales, stock, finance, and audit history remain intact.
- OWNER and ADMIN can update tenant branding. Database writes remain tenant-scoped and trigger-protected.
- Platform Settings controls platform name, logo, colors, support contact, monthly fee, currency, payment number, and renewal instructions.
- Each tenant subscription expires monthly. Expired tenants cannot establish or continue tenant sessions. Login shows the configured payment details.
- A Platform Super Admin can renew a tenant for 1–36 months and record a payment reference and note in the platform audit trail.

## Database migrations

- `202608040020_remove_prescriptions_and_tenant_branding_access`
- `202608040021_platform_settings_and_monthly_subscriptions`

Both migrations were applied successfully to the local `phms_dev` PostgreSQL database using the migration/admin connection.

## Verification

- Prisma schema validation: passed.
- Prisma Client generation: passed.
- TypeScript type-check for API and web: passed.
- ESLint for API and web: passed.
- API automated tests: 108 passed, 31 skipped integration/environment cases.
- Web automated tests: 20 passed.
- Production API and web build: passed.
- Live API readiness: database up and service ready.

## Operating workflow

1. Platform Super Admin opens **Platform Settings** and records platform branding and monthly payment instructions.
2. The Super Admin opens a tenant detail page and uses **Renew subscription** after confirming payment.
3. A pharmacy OWNER or ADMIN opens **Account → Branding & invoice** to manage pharmacy branding.
4. Pharmacy users open **Alerts and notifications** to review stock and platform alerts.
5. Lab users register/select a patient, choose tests, apply an allowed discount, select pay-now or pay-later, record results, then use browser print for the final report.
