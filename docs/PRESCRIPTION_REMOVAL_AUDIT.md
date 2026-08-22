# Digital medical order removal audit

## Decision

PHMS no longer creates, stores, edits, prints, reports, or dispenses a digital medical order. After the doctor records the final diagnosis and completes the clinical review, medication is written manually on the hospital's physical paper outside PHMS. Pharmacy remains an independent FEFO point of sale and may optionally link a sale to a completed clinic visit.

## Dependency audit

The removed domain previously crossed:

- Prisma models, enums, clinic visit relations, and sale foreign keys.
- Clinic create/read endpoints, permissions, workflow statuses, and audit events.
- Checkout payload validation, item matching, dispensing state, and visit completion coupling.
- Operational charts, printable documents, clinical tabs, legacy patient workflow screens, and cart state.
- Route, permission, workflow, checkout, and navigation tests.

`Product.requiresPrescription` is intentionally retained. It is an inventory/POS compliance flag and is not a digital medical-order record.

## Historical data strategy

Before active tables are removed, migration `202608220024_remove_digital_prescriptions` copies every existing record, its items, and linked sale IDs into `app_private.legacy_prescription_archives` as JSON. Access is revoked from `PUBLIC` and the runtime `phms_app` role. This sealed snapshot is available only to the database owner for controlled historical recovery and is not part of the application schema or API.

Historical visits in medication-dispensing states are moved only by captured visit ID to `COMPLETED`; unrelated doctor-review visits are not changed.

## Canonical completion state

`COMPLETED` is the single terminal clinical state. A pharmacy sale is not required to complete a clinic visit.
