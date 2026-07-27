# M3 legacy inventory characterization

## Current single-tenant model

The legacy MongoDB application stores one `Medicine` record containing:

- product name and category
- exactly one batch number
- exactly one expiry date
- category-specific packaging configuration
- prices
- current stock and minimum stock

This combines catalogue identity, stock location, batch traceability, packaging,
pricing and the mutable balance into one document.

## Behaviors to preserve

- twelve pharmacy/product categories
- tablet hierarchy: large carton → small box → strip → tablet/capsule
- category-specific outer-package counts
- explicit base-unit price support for non-tablet categories
- derived tablet box, strip and unit prices
- whole-number sale quantities
- stock validation before sale
- low-stock thresholds
- 30-day expiry notifications and 90-day expiry reports
- audit events for product changes

## Defects or risks that M3 must not preserve

1. Stock is overwritten directly on the medicine document; there is no
   immutable movement history.
2. Sale validation and stock writes are not one database transaction, allowing
   partial updates and overselling under concurrency.
3. A product can have only one batch and expiry date.
4. There is no branch/location dimension.
5. Floating-point numbers are used for money and fractional stock.
6. Deleting a medicine can erase the identity referenced by operational history.
7. Baby products label the `box` sale mode as a pack but deduct a complete
   carton.
8. Women's products calculate carton stock as packs × pads but the `box` sale
   mode deducts only one pack.
9. Drops label stock as bottles while also multiplying it by bottles per carton.
10. Pricing and stock conversion logic is duplicated across backend and frontend.

## M3 compatibility decision

The new system keeps the category names and packaging concepts but replaces
ambiguous `box` behavior with explicit package codes such as `carton`, `pack`,
`small_box`, `strip` and `unit`.

All inventory is recorded in an integer base unit. Package levels contain an
integer conversion factor to the base unit. Prices are persisted as PostgreSQL
`numeric` values and converted to minor units at API/domain boundaries.

The catalogue becomes tenant-wide, while batches, balances, movements,
receiving and transfers are branch-owned.
