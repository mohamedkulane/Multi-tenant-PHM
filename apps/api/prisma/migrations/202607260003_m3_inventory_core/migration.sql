-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'SALE', 'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'EXPIRED', 'VOID');

-- CreateEnum
CREATE TYPE "InventoryTransferStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "normalized_name" VARCHAR(180) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "sku" VARCHAR(80),
    "barcode" VARCHAR(120),
    "generic_name" VARCHAR(180),
    "brand_name" VARCHAR(180),
    "strength" VARCHAR(80),
    "dosage_form" VARCHAR(80),
    "manufacturer" VARCHAR(180),
    "base_unit" VARCHAR(40) NOT NULL,
    "requires_prescription" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_packages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "units_per_package" BIGINT NOT NULL,
    "sale_price" DECIMAL(19,4),
    "sellable" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_products" (
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "reorder_point_base_units" BIGINT NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "branch_products_pkey" PRIMARY KEY ("tenant_id","branch_id","product_id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_number" VARCHAR(100) NOT NULL,
    "expiry_date" DATE NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unit_cost" DECIMAL(19,6),
    "quantity_on_hand" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "supplier_name" VARCHAR(180),
    "reference_number" VARCHAR(100),
    "idempotency_key" VARCHAR(120) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_receipt_items" (
    "tenant_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" BIGINT NOT NULL,
    "unit_cost" DECIMAL(19,6) NOT NULL,

    CONSTRAINT "inventory_receipt_items_pkey" PRIMARY KEY ("tenant_id","receipt_id","product_id","batch_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity_delta" BIGINT NOT NULL,
    "balance_after" BIGINT NOT NULL,
    "reference_type" VARCHAR(60),
    "reference_id" VARCHAR(100),
    "idempotency_key" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(500),
    "actor_membership_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source_branch_id" UUID NOT NULL,
    "destination_branch_id" UUID NOT NULL,
    "status" "InventoryTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotency_key" VARCHAR(120) NOT NULL,
    "notes" VARCHAR(500),
    "initiated_by_membership_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transfer_items" (
    "tenant_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "source_batch_id" UUID NOT NULL,
    "destination_batch_id" UUID NOT NULL,
    "quantity" BIGINT NOT NULL,

    CONSTRAINT "inventory_transfer_items_pkey" PRIMARY KEY ("tenant_id","transfer_id","source_batch_id")
);

-- CreateIndex
CREATE INDEX "products_tenant_id_category_active_idx" ON "products"("tenant_id", "category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_id_key" ON "products"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_normalized_name_key" ON "products"("tenant_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_barcode_key" ON "products"("tenant_id", "barcode");

-- CreateIndex
CREATE INDEX "product_packages_tenant_id_product_id_active_idx" ON "product_packages"("tenant_id", "product_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "product_packages_tenant_id_id_key" ON "product_packages"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_packages_tenant_id_product_id_code_key" ON "product_packages"("tenant_id", "product_id", "code");

-- CreateIndex
CREATE INDEX "branch_products_tenant_id_product_id_idx" ON "branch_products"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_batches_tenant_id_branch_id_product_id_expiry_dat_idx" ON "inventory_batches"("tenant_id", "branch_id", "product_id", "expiry_date");

-- CreateIndex
CREATE INDEX "inventory_batches_tenant_id_branch_id_expiry_date_idx" ON "inventory_batches"("tenant_id", "branch_id", "expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_tenant_id_id_key" ON "inventory_batches"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_tenant_id_branch_id_product_id_batch_numb_key" ON "inventory_batches"("tenant_id", "branch_id", "product_id", "batch_number", "expiry_date");

-- CreateIndex
CREATE INDEX "inventory_receipts_tenant_id_branch_id_received_at_idx" ON "inventory_receipts"("tenant_id", "branch_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_receipts_tenant_id_id_key" ON "inventory_receipts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_receipts_tenant_id_idempotency_key_key" ON "inventory_receipts"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_receipt_items_tenant_id_batch_id_idx" ON "inventory_receipt_items"("tenant_id", "batch_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_branch_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "branch_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_batch_id_created_at_idx" ON "stock_movements"("tenant_id", "batch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_tenant_id_idempotency_key_key" ON "stock_movements"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_transfers_tenant_id_source_branch_id_created_at_idx" ON "inventory_transfers"("tenant_id", "source_branch_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transfers_tenant_id_destination_branch_id_created_idx" ON "inventory_transfers"("tenant_id", "destination_branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_tenant_id_id_key" ON "inventory_transfers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_transfers_tenant_id_idempotency_key_key" ON "inventory_transfers"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "inventory_transfer_items_tenant_id_destination_batch_id_idx" ON "inventory_transfer_items"("tenant_id", "destination_batch_id");

-- AddForeignKey
ALTER TABLE "product_packages" ADD CONSTRAINT "product_packages_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_products" ADD CONSTRAINT "branch_products_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_tenant_id_receipt_id_fkey" FOREIGN KEY ("tenant_id", "receipt_id") REFERENCES "inventory_receipts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_receipt_items" ADD CONSTRAINT "inventory_receipt_items_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "inventory_batches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "inventory_batches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_tenant_id_transfer_id_fkey" FOREIGN KEY ("tenant_id", "transfer_id") REFERENCES "inventory_transfers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_tenant_id_source_batch_id_fkey" FOREIGN KEY ("tenant_id", "source_batch_id") REFERENCES "inventory_batches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "inventory_transfer_items_tenant_id_destination_batch_id_fkey" FOREIGN KEY ("tenant_id", "destination_batch_id") REFERENCES "inventory_batches"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
