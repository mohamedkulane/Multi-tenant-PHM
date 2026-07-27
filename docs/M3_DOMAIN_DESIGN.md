# M3 catalogue and inventory domain design

## Aggregate boundaries

### Product catalogue

A tenant-wide product defines stable commercial identity:

- name, category, SKU and barcode
- generic/brand information, strength and manufacturer
- prescription flag and active/archive state
- base unit
- sellable packaging levels with exact conversion factors and prices

Product deletion becomes archival once operational history exists.

### Branch inventory

A branch-product record defines:

- whether the branch carries the product
- reorder threshold in base units
- optional branch-specific selling overrides in a later slice

### Inventory batch

A batch is branch- and product-specific:

- batch/lot number
- expiry date
- received date and supplier reference
- unit cost
- current cached on-hand quantity in base units

The cached quantity is updated only in the same transaction that appends a stock
movement. The movement ledger is the audit source of truth.

### Stock movement

Every stock change appends one immutable movement:

- receipt
- positive or negative adjustment
- sale or return
- transfer out or transfer in
- expiry/write-off

Movement quantity is a signed integer in base units. Updates and deletes are
blocked by PostgreSQL triggers.

## Receiving

1. Validate tenant, branch permission, product and package level.
2. Convert the received package quantity to base units.
3. Create or select the exact branch/product/batch.
4. Lock the batch balance row.
5. Increase cached on-hand quantity.
6. Append a receipt movement with an idempotency key.
7. Append the tenant audit event.
8. Commit atomically.

## Adjustment

Adjustments require a reason. Negative adjustments lock the batch and reject a
result below zero. The balance update, movement and audit event commit together.

## Expiry

Expired stock is not silently hidden or deleted. A write-off workflow locks the
batch, moves the remaining quantity to zero through an `EXPIRED` movement, and
records the actor and reason.

## Branch transfer

A transfer is one tenant transaction:

1. Validate different source and destination branches.
2. Verify the actor can access both branches.
3. Lock source batches in deterministic order.
4. Reject insufficient or expired stock.
5. Append source `TRANSFER_OUT` movements.
6. create/match destination batches and append `TRANSFER_IN` movements.
7. Mark the transfer completed and append an audit event.

The compound tenant foreign keys prevent cross-tenant branch or product
references even if application validation fails.

## Concurrency and precision

- PostgreSQL row locks serialize updates to a batch balance.
- balances never become negative
- quantities use integer base units
- package conversion factors use positive integers
- money uses `numeric`, never JavaScript floating point for persistence
- idempotency keys prevent duplicate receiving, adjustment and transfer writes

## Isolation checklist for every M3 table

- required `tenant_id`
- branch ID where the record is location-owned
- compound tenant foreign keys
- `ENABLE ROW LEVEL SECURITY`
- `FORCE ROW LEVEL SECURITY`
- `USING` and `WITH CHECK` policy
- supporting tenant/branch/product indexes
- positive and cross-tenant negative tests
