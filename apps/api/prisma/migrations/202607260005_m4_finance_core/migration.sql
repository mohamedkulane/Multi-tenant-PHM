-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'VOIDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PAYMENT', 'REFUND', 'REVERSAL');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'OVERDUE', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('POSTED', 'VOIDED');











-- CreateTable
CREATE TABLE "invoice_sequences" (
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("tenant_id","branch_id","business_date")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "invoice_number" VARCHAR(80) NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "customer_name" VARCHAR(180) NOT NULL,
    "customer_phone" VARCHAR(40),
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "grand_total" DECIMAL(19,4) NOT NULL,
    "amount_paid" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "remaining_balance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "returned_total" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "sold_by_membership_id" UUID NOT NULL,
    "sold_by_user_id" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_membership_id" UUID,
    "void_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_package_id" UUID NOT NULL,
    "product_name" VARCHAR(180) NOT NULL,
    "sku" VARCHAR(80),
    "package_code" VARCHAR(40) NOT NULL,
    "package_label" VARCHAR(80) NOT NULL,
    "units_per_package" BIGINT NOT NULL,
    "package_quantity" INTEGER NOT NULL,
    "base_units_sold" BIGINT NOT NULL,
    "base_units_returned" BIGINT NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(19,4) NOT NULL,
    "unit_cost" DECIMAL(19,6) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(19,4) NOT NULL,
    "discount_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_item_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity_base_units" BIGINT NOT NULL,
    "unit_cost" DECIMAL(19,6) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_item_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "type" "PaymentType" NOT NULL DEFAULT 'PAYMENT',
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "external_reference" VARCHAR(180),
    "idempotency_key" VARCHAR(120) NOT NULL,
    "related_payment_id" UUID,
    "notes" VARCHAR(500),
    "collected_by_membership_id" UUID NOT NULL,
    "collected_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "total_amount" DECIMAL(19,4) NOT NULL,
    "paid_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "remaining_amount" DECIMAL(19,4) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "refund_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "processed_by_membership_id" UUID NOT NULL,
    "processed_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_return_items" (
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "quantity_base_units" BIGINT NOT NULL,
    "refund_amount" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("tenant_id","return_id","sale_item_id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "expense_date" DATE NOT NULL,
    "note" VARCHAR(1000),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" VARCHAR(120) NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_membership_id" UUID,
    "void_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_tenant_id_branch_id_created_at_idx" ON "sales"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_tenant_id_customer_phone_created_at_idx" ON "sales"("tenant_id", "customer_phone", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_id_key" ON "sales"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_invoice_number_key" ON "sales"("tenant_id", "invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_idempotency_key_key" ON "sales"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sale_items_tenant_id_sale_id_idx" ON "sale_items"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "sale_items_tenant_id_product_id_idx" ON "sale_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_tenant_id_id_key" ON "sale_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "sale_item_allocations_tenant_id_batch_id_idx" ON "sale_item_allocations"("tenant_id", "batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_item_allocations_tenant_id_id_key" ON "sale_item_allocations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_item_allocations_tenant_id_sale_item_id_batch_id_key" ON "sale_item_allocations"("tenant_id", "sale_item_id", "batch_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_sale_id_created_at_idx" ON "payments"("tenant_id", "sale_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_id_key" ON "payments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key" ON "payments"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "debts_tenant_id_branch_id_status_due_date_idx" ON "debts"("tenant_id", "branch_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "debts_tenant_id_id_key" ON "debts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "debts_tenant_id_sale_id_key" ON "debts"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "sale_returns_tenant_id_sale_id_created_at_idx" ON "sale_returns"("tenant_id", "sale_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_tenant_id_id_key" ON "sale_returns"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_returns_tenant_id_idempotency_key_key" ON "sale_returns"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "sale_return_items_tenant_id_sale_item_id_idx" ON "sale_return_items"("tenant_id", "sale_item_id");

-- CreateIndex
CREATE INDEX "expense_categories_tenant_id_active_idx" ON "expense_categories"("tenant_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenant_id_id_key" ON "expense_categories"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenant_id_name_key" ON "expense_categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_branch_id_expense_date_idx" ON "expenses"("tenant_id", "branch_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_category_id_expense_date_idx" ON "expenses"("tenant_id", "category_id", "expense_date");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenant_id_id_key" ON "expenses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenant_id_idempotency_key_key" ON "expenses"("tenant_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_item_allocations" ADD CONSTRAINT "sale_item_allocations_tenant_id_sale_item_id_fkey" FOREIGN KEY ("tenant_id", "sale_item_id") REFERENCES "sale_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_tenant_id_return_id_fkey" FOREIGN KEY ("tenant_id", "return_id") REFERENCES "sale_returns"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_tenant_id_sale_item_id_fkey" FOREIGN KEY ("tenant_id", "sale_item_id") REFERENCES "sale_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "expense_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
