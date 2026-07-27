import { randomUUID } from "node:crypto";
import { DebtStatus, PaymentType, Prisma, SaleStatus } from "@prisma/client";
import type { PaymentMethod } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { canAccessBranch } from "../middleware/authorization.js";
import {
  decimalToMoney,
  decimalToUnitCost,
  formatMoney,
  formatUnitCost,
  parseMoney,
} from "./money.js";

export interface CheckoutLineInput {
  productId: string;
  packageCode: string;
  packageQuantity: number;
}

export interface CheckoutInput {
  branchId: string;
  customerName: string;
  customerPhone?: string | undefined;
  discount: string;
  amountPaid: string;
  paymentMethod?: PaymentMethod | undefined;
  paymentReference?: string | undefined;
  dueDate?: Date | undefined;
  idempotencyKey: string;
  lines: CheckoutLineInput[];
}

export interface AddPaymentInput {
  branchId: string;
  saleId: string;
  amount: string;
  method: PaymentMethod;
  externalReference?: string | undefined;
  notes?: string | undefined;
  idempotencyKey: string;
}

export interface ReturnLineInput {
  saleItemId: string;
  quantityBaseUnits: bigint;
}

export interface ReturnSaleInput {
  branchId: string;
  saleId: string;
  reason: string;
  refundMethod?: PaymentMethod | undefined;
  idempotencyKey: string;
  lines: ReturnLineInput[];
}

export interface VoidSaleInput {
  branchId: string;
  saleId: string;
  reason: string;
  refundMethod?: PaymentMethod | undefined;
  idempotencyKey: string;
}

export interface SalesService {
  list(principal: AuthenticatedPrincipal, branchId: string, search?: string): Promise<unknown[]>;
  get(principal: AuthenticatedPrincipal, saleId: string): Promise<unknown>;
  checkout(
    principal: AuthenticatedPrincipal,
    input: CheckoutInput,
    requestId?: string,
  ): Promise<unknown>;
  addPayment(
    principal: AuthenticatedPrincipal,
    input: AddPaymentInput,
    requestId?: string,
  ): Promise<unknown>;
  returnSale(
    principal: AuthenticatedPrincipal,
    input: ReturnSaleInput,
    requestId?: string,
  ): Promise<unknown>;
  voidSale(
    principal: AuthenticatedPrincipal,
    input: VoidSaleInput,
    requestId?: string,
  ): Promise<unknown>;
}

interface LockedBatch {
  id: string;
  product_id: string;
  quantity_on_hand: bigint;
  unit_cost: Prisma.Decimal | null;
}

interface LockedSale {
  id: string;
  branch_id: string;
  status: SaleStatus;
  grand_total: Prisma.Decimal;
  amount_paid: Prisma.Decimal;
  remaining_balance: Prisma.Decimal;
  returned_total: Prisma.Decimal;
}

const saleInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: { allocations: true },
  },
  payments: { orderBy: { createdAt: "asc" as const } },
  debt: true,
  returns: {
    orderBy: { createdAt: "asc" as const },
    include: { items: true },
  },
};

function requireBranchAccess(principal: AuthenticatedPrincipal, branchId: string) {
  if (!canAccessBranch(principal, branchId)) {
    throw new AppError({
      statusCode: 403,
      code: "BRANCH_ACCESS_DENIED",
      message: "You do not have access to this branch",
    });
  }
}

function serialize<T>(value: T): T {
  const json = JSON.stringify(value, (_key, nested: unknown) =>
    typeof nested === "bigint" ? nested.toString() : nested,
  );
  const parsed: unknown = JSON.parse(json);
  return parsed as T;
}

function optionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function businessDateUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dateStamp(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

function defaultDueDate(date: Date) {
  return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
}

function debtStatus(remaining: bigint, dueDate: Date, now = new Date()): DebtStatus {
  if (remaining === 0n) return DebtStatus.PAID;
  return dueDate.getTime() < businessDateUtc(now).getTime() ? DebtStatus.OVERDUE : DebtStatus.OPEN;
}

async function enableTrustedFinanceWrites(transaction: Prisma.TransactionClient) {
  await transaction.$queryRaw(Prisma.sql`
    SELECT
      set_config('app.finance_write', 'true', true),
      set_config('app.inventory_write', 'true', true)
  `);
}

async function withFinanceTransaction<T>(
  principal: AuthenticatedPrincipal,
  branchId: string,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  requireBranchAccess(principal, branchId);
  return prisma.$transaction(
    async (transaction) => {
      await setTransactionContext(transaction, {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId,
      });
      await enableTrustedFinanceWrites(transaction);
      return operation(transaction);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 20_000,
    },
  );
}

async function lockSale(transaction: Prisma.TransactionClient, tenantId: string, saleId: string) {
  const rows = await transaction.$queryRaw<LockedSale[]>(Prisma.sql`
    SELECT id, branch_id, status, grand_total, amount_paid, remaining_balance, returned_total
    FROM public.sales
    WHERE tenant_id = ${tenantId}::uuid AND id = ${saleId}::uuid
    FOR UPDATE
  `);
  const sale = rows[0];
  if (!sale) {
    throw new AppError({
      statusCode: 404,
      code: "SALE_NOT_FOUND",
      message: "Sale not found",
    });
  }
  return sale;
}

function assertSaleBranch(sale: LockedSale, branchId: string) {
  if (sale.branch_id !== branchId) {
    throw new AppError({
      statusCode: 404,
      code: "SALE_NOT_FOUND",
      message: "Sale not found",
    });
  }
}

async function readSale(transaction: Prisma.TransactionClient, tenantId: string, saleId: string) {
  return transaction.sale.findUniqueOrThrow({
    where: { tenantId_id: { tenantId, id: saleId } },
    include: saleInclude,
  });
}

export class PrismaSalesService implements SalesService {
  async list(principal: AuthenticatedPrincipal, branchId: string, search?: string) {
    requireBranchAccess(principal, branchId);
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId,
      });
      const normalized = search?.trim();
      const sales = await transaction.sale.findMany({
        where: {
          tenantId: principal.tenantId,
          branchId,
          ...(normalized
            ? {
                OR: [
                  { invoiceNumber: { contains: normalized, mode: "insensitive" as const } },
                  { customerName: { contains: normalized, mode: "insensitive" as const } },
                  { customerPhone: { contains: normalized, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        include: { items: true, debt: true },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return serialize(sales);
    });
  }

  async get(principal: AuthenticatedPrincipal, saleId: string) {
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      });
      const sale = await transaction.sale.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: saleId } },
        include: saleInclude,
      });
      if (!sale || !canAccessBranch(principal, sale.branchId)) {
        throw new AppError({
          statusCode: 404,
          code: "SALE_NOT_FOUND",
          message: "Sale not found",
        });
      }
      return serialize(sale);
    });
  }

  async checkout(principal: AuthenticatedPrincipal, input: CheckoutInput, requestId?: string) {
    return withFinanceTransaction(principal, input.branchId, async (transaction) => {
      const replay = await transaction.sale.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: principal.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: saleInclude,
      });
      if (replay) return serialize(replay);

      const branch = await transaction.branch.findUnique({
        where: {
          tenantId_id: { tenantId: principal.tenantId, id: input.branchId },
        },
        select: { code: true, active: true },
      });
      if (!branch?.active) {
        throw new AppError({
          statusCode: 409,
          code: "BRANCH_INACTIVE",
          message: "The branch is not active",
        });
      }

      const seenProducts = new Set<string>();
      const businessDate = businessDateUtc();
      const preparedLines: Array<{
        id: string;
        productId: string;
        productPackageId: string;
        productName: string;
        sku: string | null;
        packageCode: string;
        packageLabel: string;
        unitsPerPackage: bigint;
        packageQuantity: number;
        baseUnitsSold: bigint;
        unitPrice: bigint;
        subtotal: bigint;
        weightedUnitCost: bigint;
        allocations: Array<{ batch: LockedBatch; quantity: bigint; unitCost: bigint }>;
      }> = [];

      for (const line of input.lines) {
        if (seenProducts.has(line.productId)) {
          throw new AppError({
            statusCode: 400,
            code: "DUPLICATE_SALE_PRODUCT",
            message: "Combine duplicate product lines before checkout",
          });
        }
        seenProducts.add(line.productId);

        const packaging = await transaction.productPackage.findUnique({
          where: {
            tenantId_productId_code: {
              tenantId: principal.tenantId,
              productId: line.productId,
              code: line.packageCode,
            },
          },
          include: { product: true },
        });
        if (!packaging || !packaging.active || !packaging.sellable || !packaging.product.active) {
          throw new AppError({
            statusCode: 404,
            code: "SALE_PACKAGE_NOT_FOUND",
            message: "Sellable product package not found",
          });
        }
        if (!packaging.salePrice) {
          throw new AppError({
            statusCode: 409,
            code: "SALE_PRICE_NOT_CONFIGURED",
            message: `Pricing is not configured for ${packaging.product.name}`,
          });
        }
        const branchProduct = await transaction.branchProduct.findUnique({
          where: {
            tenantId_branchId_productId: {
              tenantId: principal.tenantId,
              branchId: input.branchId,
              productId: line.productId,
            },
          },
          select: { active: true },
        });
        if (branchProduct && !branchProduct.active) {
          throw new AppError({
            statusCode: 409,
            code: "PRODUCT_DISABLED_AT_BRANCH",
            message: `${packaging.product.name} is disabled at this branch`,
          });
        }

        const required = packaging.unitsPerPackage * BigInt(line.packageQuantity);
        const batches = await transaction.$queryRaw<LockedBatch[]>(Prisma.sql`
          SELECT id, product_id, quantity_on_hand, unit_cost
          FROM public.inventory_batches
          WHERE tenant_id = ${principal.tenantId}::uuid
            AND branch_id = ${input.branchId}::uuid
            AND product_id = ${line.productId}::uuid
            AND quantity_on_hand > 0
            AND expiry_date >= ${businessDate}::date
          ORDER BY expiry_date ASC, id ASC
          FOR UPDATE
        `);
        let remaining = required;
        const allocations: Array<{
          batch: LockedBatch;
          quantity: bigint;
          unitCost: bigint;
        }> = [];
        for (const batch of batches) {
          if (remaining === 0n) break;
          const quantity = batch.quantity_on_hand < remaining ? batch.quantity_on_hand : remaining;
          const unitCost = batch.unit_cost ? decimalToUnitCost(batch.unit_cost) : 0n;
          allocations.push({ batch, quantity, unitCost });
          remaining -= quantity;
        }
        if (remaining > 0n) {
          throw new AppError({
            statusCode: 409,
            code: "INSUFFICIENT_STOCK",
            message: `${packaging.product.name} does not have enough unexpired stock`,
          });
        }
        const unitPrice = decimalToMoney(packaging.salePrice);
        const subtotal = unitPrice * BigInt(line.packageQuantity);
        const weightedUnitCost =
          allocations.reduce(
            (total, allocation) => total + allocation.unitCost * allocation.quantity,
            0n,
          ) / required;
        preparedLines.push({
          id: randomUUID(),
          productId: line.productId,
          productPackageId: packaging.id,
          productName: packaging.product.name,
          sku: packaging.product.sku,
          packageCode: packaging.code,
          packageLabel: packaging.label,
          unitsPerPackage: packaging.unitsPerPackage,
          packageQuantity: line.packageQuantity,
          baseUnitsSold: required,
          unitPrice,
          subtotal,
          weightedUnitCost,
          allocations,
        });
      }

      const subtotal = preparedLines.reduce((total, line) => total + line.subtotal, 0n);
      const discount = parseMoney(input.discount, "discount");
      if (discount > subtotal) {
        throw new AppError({
          statusCode: 400,
          code: "DISCOUNT_EXCEEDS_SUBTOTAL",
          message: "Discount cannot exceed subtotal",
        });
      }
      const grandTotal = subtotal - discount;
      const amountPaid = parseMoney(input.amountPaid, "amount paid");
      if (amountPaid > grandTotal) {
        throw new AppError({
          statusCode: 400,
          code: "PAYMENT_EXCEEDS_TOTAL",
          message: "Amount paid cannot exceed the grand total",
        });
      }
      if (amountPaid > 0n && !input.paymentMethod) {
        throw new AppError({
          statusCode: 400,
          code: "PAYMENT_METHOD_REQUIRED",
          message: "Payment method is required when an amount is paid",
        });
      }

      const sequence = await transaction.invoiceSequence.upsert({
        where: {
          tenantId_branchId_businessDate: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            businessDate,
          },
        },
        create: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          businessDate,
          lastValue: 1,
        },
        update: { lastValue: { increment: 1 } },
      });
      const invoiceNumber = `INV-${branch.code.toUpperCase()}-${dateStamp(
        businessDate,
      )}-${String(sequence.lastValue).padStart(6, "0")}`;
      const saleId = randomUUID();
      const remainingBalance = grandTotal - amountPaid;
      await transaction.sale.create({
        data: {
          id: saleId,
          tenantId: principal.tenantId,
          branchId: input.branchId,
          invoiceNumber,
          businessDate,
          customerName: input.customerName.trim(),
          customerPhone: optionalText(input.customerPhone) ?? null,
          subtotal: formatMoney(subtotal),
          discount: formatMoney(discount),
          grandTotal: formatMoney(grandTotal),
          amountPaid: formatMoney(amountPaid),
          remainingBalance: formatMoney(remainingBalance),
          idempotencyKey: input.idempotencyKey,
          soldByMembershipId: principal.membershipId,
          soldByUserId: principal.userId,
        },
      });

      let allocatedDiscount = 0n;
      for (const [lineIndex, line] of preparedLines.entries()) {
        const lineDiscount =
          lineIndex === preparedLines.length - 1
            ? discount - allocatedDiscount
            : subtotal === 0n
              ? 0n
              : (discount * line.subtotal) / subtotal;
        allocatedDiscount += lineDiscount;
        await transaction.saleItem.create({
          data: {
            id: line.id,
            tenantId: principal.tenantId,
            saleId,
            productId: line.productId,
            productPackageId: line.productPackageId,
            productName: line.productName,
            sku: line.sku,
            packageCode: line.packageCode,
            packageLabel: line.packageLabel,
            unitsPerPackage: line.unitsPerPackage,
            packageQuantity: line.packageQuantity,
            baseUnitsSold: line.baseUnitsSold,
            unitPrice: formatMoney(line.unitPrice),
            unitCost: formatUnitCost(line.weightedUnitCost),
            subtotal: formatMoney(line.subtotal),
            discountAmount: formatMoney(lineDiscount),
            lineTotal: formatMoney(line.subtotal - lineDiscount),
          },
        });
        for (const [allocationIndex, allocation] of line.allocations.entries()) {
          const balanceAfter = allocation.batch.quantity_on_hand - allocation.quantity;
          await transaction.inventoryBatch.update({
            where: {
              tenantId_id: {
                tenantId: principal.tenantId,
                id: allocation.batch.id,
              },
            },
            data: { quantityOnHand: balanceAfter },
          });
          await transaction.saleItemAllocation.create({
            data: {
              tenantId: principal.tenantId,
              saleItemId: line.id,
              batchId: allocation.batch.id,
              quantityBaseUnits: allocation.quantity,
              unitCost: formatUnitCost(allocation.unitCost),
            },
          });
          await transaction.stockMovement.create({
            data: {
              tenantId: principal.tenantId,
              branchId: input.branchId,
              productId: line.productId,
              batchId: allocation.batch.id,
              type: "SALE",
              quantityDelta: -allocation.quantity,
              balanceAfter,
              referenceType: "sale",
              referenceId: saleId,
              idempotencyKey: `sale:${saleId}:${lineIndex}:${allocationIndex}`,
              actorMembershipId: principal.membershipId,
              actorUserId: principal.userId,
            },
          });
        }
      }

      if (amountPaid > 0n) {
        await transaction.payment.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            saleId,
            method: input.paymentMethod!,
            amount: formatMoney(amountPaid),
            externalReference: optionalText(input.paymentReference) ?? null,
            idempotencyKey: `checkout:${input.idempotencyKey}`,
            collectedByMembershipId: principal.membershipId,
            collectedByUserId: principal.userId,
          },
        });
      }
      if (remainingBalance > 0n) {
        const dueDate = input.dueDate ?? defaultDueDate(businessDate);
        await transaction.debt.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            saleId,
            totalAmount: formatMoney(grandTotal),
            paidAmount: formatMoney(amountPaid),
            remainingAmount: formatMoney(remainingBalance),
            dueDate,
            status: debtStatus(remainingBalance, dueDate),
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "SALE_COMPLETED",
          entityType: "sale",
          entityId: saleId,
          metadata: { invoiceNumber, lineCount: preparedLines.length },
          after: {
            grandTotal: formatMoney(grandTotal),
            amountPaid: formatMoney(amountPaid),
            remainingBalance: formatMoney(remainingBalance),
          },
        },
      });
      return serialize(await readSale(transaction, principal.tenantId, saleId));
    });
  }

  async addPayment(principal: AuthenticatedPrincipal, input: AddPaymentInput, requestId?: string) {
    return withFinanceTransaction(principal, input.branchId, async (transaction) => {
      const replay = await transaction.payment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: principal.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (replay) return serialize(replay);

      const sale = await lockSale(transaction, principal.tenantId, input.saleId);
      assertSaleBranch(sale, input.branchId);
      if (sale.status === SaleStatus.VOIDED || sale.status === SaleStatus.RETURNED) {
        throw new AppError({
          statusCode: 409,
          code: "SALE_NOT_COLLECTIBLE",
          message: "This sale cannot accept a payment",
        });
      }
      const amount = parseMoney(input.amount);
      const remaining = decimalToMoney(sale.remaining_balance);
      if (amount === 0n || amount > remaining) {
        throw new AppError({
          statusCode: 400,
          code: "INVALID_PAYMENT_AMOUNT",
          message: "Payment must be positive and cannot exceed the remaining balance",
        });
      }
      const payment = await transaction.payment.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          saleId: input.saleId,
          method: input.method,
          amount: formatMoney(amount),
          externalReference: optionalText(input.externalReference) ?? null,
          notes: optionalText(input.notes) ?? null,
          idempotencyKey: input.idempotencyKey,
          collectedByMembershipId: principal.membershipId,
          collectedByUserId: principal.userId,
        },
      });
      const paid = decimalToMoney(sale.amount_paid) + amount;
      const balance = remaining - amount;
      await transaction.sale.update({
        where: {
          tenantId_id: { tenantId: principal.tenantId, id: input.saleId },
        },
        data: {
          amountPaid: formatMoney(paid),
          remainingBalance: formatMoney(balance),
        },
      });
      const debt = await transaction.debt.findUnique({
        where: {
          tenantId_saleId: { tenantId: principal.tenantId, saleId: input.saleId },
        },
      });
      if (debt) {
        await transaction.debt.update({
          where: {
            tenantId_id: { tenantId: principal.tenantId, id: debt.id },
          },
          data: {
            paidAmount: formatMoney(paid),
            remainingAmount: formatMoney(balance),
            status: debtStatus(balance, debt.dueDate),
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "SALE_PAYMENT_RECORDED",
          entityType: "payment",
          entityId: payment.id,
          metadata: { saleId: input.saleId, amount: formatMoney(amount), method: input.method },
        },
      });
      return serialize(payment);
    });
  }

  async returnSale(principal: AuthenticatedPrincipal, input: ReturnSaleInput, requestId?: string) {
    return this.processReturn(principal, input, false, requestId);
  }

  async voidSale(principal: AuthenticatedPrincipal, input: VoidSaleInput, requestId?: string) {
    const sale = (await this.get(principal, input.saleId)) as unknown as {
      branchId: string;
      items: Array<{ id: string; baseUnitsSold: string; baseUnitsReturned: string }>;
    };
    if (sale.branchId !== input.branchId) {
      throw new AppError({ statusCode: 404, code: "SALE_NOT_FOUND", message: "Sale not found" });
    }
    const lines = sale.items
      .map((item) => ({
        saleItemId: item.id,
        quantityBaseUnits: BigInt(item.baseUnitsSold) - BigInt(item.baseUnitsReturned),
      }))
      .filter((item) => item.quantityBaseUnits > 0n);
    if (lines.length === 0) {
      throw new AppError({
        statusCode: 409,
        code: "SALE_ALREADY_RETURNED",
        message: "The sale has no remaining quantities to void",
      });
    }
    return this.processReturn(
      principal,
      {
        branchId: input.branchId,
        saleId: input.saleId,
        reason: input.reason,
        refundMethod: input.refundMethod,
        idempotencyKey: input.idempotencyKey,
        lines,
      },
      true,
      requestId,
    );
  }

  private async processReturn(
    principal: AuthenticatedPrincipal,
    input: ReturnSaleInput,
    voiding: boolean,
    requestId?: string,
  ) {
    return withFinanceTransaction(principal, input.branchId, async (transaction) => {
      const replay = await transaction.saleReturn.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: principal.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        include: { items: true },
      });
      if (replay) return serialize(replay);

      const sale = await lockSale(transaction, principal.tenantId, input.saleId);
      assertSaleBranch(sale, input.branchId);
      if (sale.status === SaleStatus.VOIDED) {
        throw new AppError({
          statusCode: 409,
          code: "SALE_ALREADY_VOIDED",
          message: "The sale is already voided",
        });
      }
      const returnId = randomUUID();
      const prepared: Array<{
        saleItemId: string;
        productId: string;
        quantity: bigint;
        refund: bigint;
        newReturned: bigint;
        restores: Array<{ batchId: string; quantity: bigint }>;
      }> = [];
      let returnValue = 0n;

      for (const [lineIndex, line] of input.lines.entries()) {
        const rows = await transaction.$queryRaw<
          Array<{
            id: string;
            product_id: string;
            base_units_sold: bigint;
            base_units_returned: bigint;
            line_total: Prisma.Decimal;
          }>
        >(Prisma.sql`
          SELECT id, product_id, base_units_sold, base_units_returned, line_total
          FROM public.sale_items
          WHERE tenant_id = ${principal.tenantId}::uuid
            AND sale_id = ${input.saleId}::uuid
            AND id = ${line.saleItemId}::uuid
          FOR UPDATE
        `);
        const item = rows[0];
        if (!item) {
          throw new AppError({
            statusCode: 404,
            code: "SALE_ITEM_NOT_FOUND",
            message: "Sale item not found",
          });
        }
        const available = item.base_units_sold - item.base_units_returned;
        if (line.quantityBaseUnits <= 0n || line.quantityBaseUnits > available) {
          throw new AppError({
            statusCode: 400,
            code: "INVALID_RETURN_QUANTITY",
            message: "Return quantity exceeds the remaining sold quantity",
          });
        }
        const priorRefund = await transaction.saleReturnItem.aggregate({
          where: {
            tenantId: principal.tenantId,
            saleItemId: item.id,
          },
          _sum: { refundAmount: true },
        });
        const lineTotal = decimalToMoney(item.line_total);
        const refund =
          line.quantityBaseUnits === available
            ? lineTotal -
              (priorRefund._sum.refundAmount ? decimalToMoney(priorRefund._sum.refundAmount) : 0n)
            : (lineTotal * line.quantityBaseUnits) / item.base_units_sold;
        returnValue += refund;

        const allocations = await transaction.saleItemAllocation.findMany({
          where: { tenantId: principal.tenantId, saleItemId: item.id },
          orderBy: { id: "asc" },
        });
        let skip = item.base_units_returned;
        let remaining = line.quantityBaseUnits;
        const restores: Array<{ batchId: string; quantity: bigint }> = [];
        for (const allocation of allocations) {
          if (remaining === 0n) break;
          if (skip >= allocation.quantityBaseUnits) {
            skip -= allocation.quantityBaseUnits;
            continue;
          }
          const availableInAllocation = allocation.quantityBaseUnits - skip;
          skip = 0n;
          const quantity = availableInAllocation < remaining ? availableInAllocation : remaining;
          restores.push({ batchId: allocation.batchId, quantity });
          remaining -= quantity;
        }
        if (remaining !== 0n) {
          throw new AppError({
            statusCode: 409,
            code: "RETURN_ALLOCATION_CONFLICT",
            message: "The original stock allocation cannot satisfy this return",
          });
        }
        prepared.push({
          saleItemId: item.id,
          productId: item.product_id,
          quantity: line.quantityBaseUnits,
          refund,
          newReturned: item.base_units_returned + line.quantityBaseUnits,
          restores,
        });
        void lineIndex;
      }

      const paid = decimalToMoney(sale.amount_paid);
      const refundAmount = returnValue < paid ? returnValue : paid;
      const refundPayment =
        refundAmount > 0n
          ? await transaction.payment.findFirst({
              where: {
                tenantId: principal.tenantId,
                saleId: input.saleId,
                type: PaymentType.PAYMENT,
              },
              orderBy: { createdAt: "desc" },
            })
          : null;
      if (refundAmount > 0n && (!input.refundMethod || !refundPayment)) {
        throw new AppError({
          statusCode: 400,
          code: "REFUND_METHOD_REQUIRED",
          message: "Refund method is required for a paid sale return",
        });
      }

      await transaction.saleReturn.create({
        data: {
          id: returnId,
          tenantId: principal.tenantId,
          branchId: input.branchId,
          saleId: input.saleId,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason.trim(),
          refundAmount: formatMoney(refundAmount),
          processedByMembershipId: principal.membershipId,
          processedByUserId: principal.userId,
        },
      });
      for (const [itemIndex, item] of prepared.entries()) {
        await transaction.saleReturnItem.create({
          data: {
            tenantId: principal.tenantId,
            returnId,
            saleItemId: item.saleItemId,
            quantityBaseUnits: item.quantity,
            refundAmount: formatMoney(item.refund),
          },
        });
        await transaction.saleItem.update({
          where: {
            tenantId_id: { tenantId: principal.tenantId, id: item.saleItemId },
          },
          data: { baseUnitsReturned: item.newReturned },
        });
        for (const [restoreIndex, restore] of item.restores.entries()) {
          const batches = await transaction.$queryRaw<
            Array<{ id: string; quantity_on_hand: bigint }>
          >(Prisma.sql`
            SELECT id, quantity_on_hand
            FROM public.inventory_batches
            WHERE tenant_id = ${principal.tenantId}::uuid
              AND id = ${restore.batchId}::uuid
            FOR UPDATE
          `);
          const batch = batches[0]!;
          const balanceAfter = batch.quantity_on_hand + restore.quantity;
          await transaction.inventoryBatch.update({
            where: {
              tenantId_id: { tenantId: principal.tenantId, id: restore.batchId },
            },
            data: { quantityOnHand: balanceAfter },
          });
          await transaction.stockMovement.create({
            data: {
              tenantId: principal.tenantId,
              branchId: input.branchId,
              productId: item.productId,
              batchId: restore.batchId,
              type: voiding ? "VOID" : "RETURN",
              quantityDelta: restore.quantity,
              balanceAfter,
              referenceType: voiding ? "sale_void" : "sale_return",
              referenceId: returnId,
              idempotencyKey: `return:${returnId}:${itemIndex}:${restoreIndex}`,
              reason: input.reason,
              actorMembershipId: principal.membershipId,
              actorUserId: principal.userId,
            },
          });
        }
      }
      if (refundAmount > 0n) {
        await transaction.payment.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            saleId: input.saleId,
            type: PaymentType.REFUND,
            method: input.refundMethod!,
            amount: formatMoney(refundAmount),
            relatedPaymentId: refundPayment!.id,
            idempotencyKey: `refund:${input.idempotencyKey}`,
            notes: input.reason,
            collectedByMembershipId: principal.membershipId,
            collectedByUserId: principal.userId,
          },
        });
      }
      const previousReturned = decimalToMoney(sale.returned_total);
      const returnedTotal = previousReturned + returnValue;
      const newPaid = paid - refundAmount;
      const effectiveTotal = decimalToMoney(sale.grand_total) - returnedTotal;
      const remainingBalance = effectiveTotal > newPaid ? effectiveTotal - newPaid : 0n;
      const allItems = await transaction.saleItem.findMany({
        where: { tenantId: principal.tenantId, saleId: input.saleId },
        select: { baseUnitsSold: true, baseUnitsReturned: true },
      });
      const fullyReturned = allItems.every((item) => item.baseUnitsSold === item.baseUnitsReturned);
      const status = voiding
        ? SaleStatus.VOIDED
        : fullyReturned
          ? SaleStatus.RETURNED
          : SaleStatus.PARTIALLY_RETURNED;
      await transaction.sale.update({
        where: {
          tenantId_id: { tenantId: principal.tenantId, id: input.saleId },
        },
        data: {
          status,
          returnedTotal: formatMoney(returnedTotal),
          amountPaid: formatMoney(newPaid),
          remainingBalance: formatMoney(remainingBalance),
          ...(voiding
            ? {
                voidedAt: new Date(),
                voidedByMembershipId: principal.membershipId,
                voidReason: input.reason.trim(),
              }
            : {}),
        },
      });
      const debt = await transaction.debt.findUnique({
        where: {
          tenantId_saleId: { tenantId: principal.tenantId, saleId: input.saleId },
        },
      });
      if (debt) {
        await transaction.debt.update({
          where: {
            tenantId_id: { tenantId: principal.tenantId, id: debt.id },
          },
          data: {
            totalAmount: formatMoney(effectiveTotal),
            paidAmount: formatMoney(newPaid),
            remainingAmount: formatMoney(remainingBalance),
            status: voiding ? DebtStatus.VOIDED : debtStatus(remainingBalance, debt.dueDate),
          },
        });
      }
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: voiding ? "SALE_VOIDED" : "SALE_RETURNED",
          entityType: "sale",
          entityId: input.saleId,
          metadata: {
            returnId,
            returnValue: formatMoney(returnValue),
            refundAmount: formatMoney(refundAmount),
            reason: input.reason,
          },
        },
      });
      return serialize(await readSale(transaction, principal.tenantId, input.saleId));
    });
  }
}

export const salesService = new PrismaSalesService();
