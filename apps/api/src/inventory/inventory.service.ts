import { Prisma, type StockMovementType } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext, withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { canAccessBranch } from "../middleware/authorization.js";

export interface ReceiptLineInput {
  productId: string;
  packageCode: string;
  packageQuantity: number;
  batchNumber: string;
  expiryDate: Date;
  unitCost: string;
}

export interface ReceiveInventoryInput {
  branchId: string;
  supplierName?: string | undefined;
  referenceNumber?: string | undefined;
  idempotencyKey: string;
  receivedAt?: Date | undefined;
  lines: ReceiptLineInput[];
}

export interface AdjustInventoryInput {
  branchId: string;
  batchId: string;
  direction: "IN" | "OUT";
  quantityBaseUnits: bigint;
  reason: string;
  idempotencyKey: string;
}

export interface ExpireInventoryInput {
  branchId: string;
  batchId: string;
  reason: string;
  idempotencyKey: string;
}

export interface TransferLineInput {
  sourceBatchId: string;
  quantityBaseUnits: bigint;
}

export interface TransferInventoryInput {
  sourceBranchId: string;
  destinationBranchId: string;
  idempotencyKey: string;
  notes?: string | undefined;
  lines: TransferLineInput[];
}

export interface InventoryService {
  listStock(
    principal: AuthenticatedPrincipal,
    branchId: string,
    query?: string,
  ): Promise<unknown[]>;
  listMovements(
    principal: AuthenticatedPrincipal,
    branchId: string,
    productId?: string,
  ): Promise<unknown[]>;
  receive(
    principal: AuthenticatedPrincipal,
    input: ReceiveInventoryInput,
    requestId?: string,
  ): Promise<unknown>;
  adjust(
    principal: AuthenticatedPrincipal,
    input: AdjustInventoryInput,
    requestId?: string,
  ): Promise<unknown>;
  writeOffExpired(
    principal: AuthenticatedPrincipal,
    input: ExpireInventoryInput,
    requestId?: string,
  ): Promise<unknown>;
  transfer(
    principal: AuthenticatedPrincipal,
    input: TransferInventoryInput,
    requestId?: string,
  ): Promise<unknown>;
}

function requireBranchAccess(principal: AuthenticatedPrincipal, branchId: string) {
  if (!canAccessBranch(principal, branchId)) {
    throw new AppError({
      statusCode: 403,
      code: "BRANCH_ACCESS_DENIED",
      message: "You do not have access to this branch",
    });
  }
}

function serializeMovement<T extends { quantityDelta: bigint; balanceAfter: bigint }>(movement: T) {
  return {
    ...movement,
    quantityDelta: movement.quantityDelta.toString(),
    balanceAfter: movement.balanceAfter.toString(),
  };
}

async function enableInventoryWrite(transaction: Prisma.TransactionClient) {
  await transaction.$queryRaw(Prisma.sql`SELECT set_config('app.inventory_write', 'true', true)`);
}

async function lockBatch(transaction: Prisma.TransactionClient, tenantId: string, batchId: string) {
  const rows = await transaction.$queryRaw<
    Array<{
      id: string;
      branch_id: string;
      product_id: string;
      batch_number: string;
      expiry_date: Date;
      unit_cost: Prisma.Decimal | null;
      quantity_on_hand: bigint;
    }>
  >(Prisma.sql`
    SELECT id, branch_id, product_id, batch_number, expiry_date, unit_cost, quantity_on_hand
    FROM public.inventory_batches
    WHERE tenant_id = ${tenantId}::uuid AND id = ${batchId}::uuid
    FOR UPDATE
  `);
  const batch = rows[0];
  if (!batch) {
    throw new AppError({
      statusCode: 404,
      code: "BATCH_NOT_FOUND",
      message: "Inventory batch not found",
    });
  }
  return batch;
}

async function updateBalanceAndMove(
  transaction: Prisma.TransactionClient,
  input: {
    principal: AuthenticatedPrincipal;
    batch: Awaited<ReturnType<typeof lockBatch>>;
    delta: bigint;
    type: StockMovementType;
    idempotencyKey: string;
    reason?: string;
    referenceType?: string;
    referenceId?: string;
  },
) {
  const balanceAfter = input.batch.quantity_on_hand + input.delta;
  if (balanceAfter < 0n) {
    throw new AppError({
      statusCode: 409,
      code: "INSUFFICIENT_STOCK",
      message: "The requested operation would make stock negative",
    });
  }
  await enableInventoryWrite(transaction);
  await transaction.inventoryBatch.update({
    where: {
      tenantId_id: {
        tenantId: input.principal.tenantId,
        id: input.batch.id,
      },
    },
    data: { quantityOnHand: balanceAfter },
  });
  const movement = await transaction.stockMovement.create({
    data: {
      tenantId: input.principal.tenantId,
      branchId: input.batch.branch_id,
      productId: input.batch.product_id,
      batchId: input.batch.id,
      type: input.type,
      quantityDelta: input.delta,
      balanceAfter,
      idempotencyKey: input.idempotencyKey,
      actorMembershipId: input.principal.membershipId,
      actorUserId: input.principal.userId,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.referenceType ? { referenceType: input.referenceType } : {}),
      ...(input.referenceId ? { referenceId: input.referenceId } : {}),
    },
  });
  return movement;
}

function ensureFutureOrCurrentExpiry(expiryDate: Date) {
  if (Number.isNaN(expiryDate.getTime())) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_EXPIRY_DATE",
      message: "Expiry date is invalid",
    });
  }
}

export class PrismaInventoryService implements InventoryService {
  async listStock(principal: AuthenticatedPrincipal, branchId: string, query?: string) {
    requireBranchAccess(principal, branchId);
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId,
      },
      async (transaction) => {
        const batches = await transaction.inventoryBatch.findMany({
          where: {
            tenantId: principal.tenantId,
            branchId,
            ...(query
              ? {
                  product: {
                    name: { contains: query.trim(), mode: "insensitive" },
                  },
                }
              : {}),
          },
          orderBy: [{ expiryDate: "asc" }, { batchNumber: "asc" }],
          select: {
            id: true,
            batchNumber: true,
            expiryDate: true,
            receivedAt: true,
            unitCost: true,
            quantityOnHand: true,
            product: {
              select: {
                id: true,
                name: true,
                category: true,
                baseUnit: true,
                sku: true,
                active: true,
                packages: {
                  where: { active: true },
                  orderBy: { sortOrder: "asc" },
                  select: {
                    code: true,
                    label: true,
                    unitsPerPackage: true,
                    salePrice: true,
                  },
                },
              },
            },
          },
          take: 250,
        });
        return batches.map((batch) => ({
          ...batch,
          quantityOnHand: batch.quantityOnHand.toString(),
          unitCost: batch.unitCost?.toFixed(6) ?? null,
          product: {
            ...batch.product,
            packages: batch.product.packages.map((packaging) => ({
              ...packaging,
              unitsPerPackage: packaging.unitsPerPackage.toString(),
              salePrice: packaging.salePrice?.toFixed(4) ?? null,
            })),
          },
        }));
      },
    );
  }

  async listMovements(principal: AuthenticatedPrincipal, branchId: string, productId?: string) {
    requireBranchAccess(principal, branchId);
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId,
      },
      async (transaction) => {
        const movements = await transaction.stockMovement.findMany({
          where: {
            tenantId: principal.tenantId,
            branchId,
            ...(productId ? { productId } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 250,
          select: {
            id: true,
            productId: true,
            batchId: true,
            type: true,
            quantityDelta: true,
            balanceAfter: true,
            referenceType: true,
            referenceId: true,
            reason: true,
            actorMembershipId: true,
            createdAt: true,
          },
        });
        return movements.map(serializeMovement);
      },
    );
  }

  async receive(
    principal: AuthenticatedPrincipal,
    input: ReceiveInventoryInput,
    requestId?: string,
  ) {
    requireBranchAccess(principal, input.branchId);
    if (input.lines.length === 0) {
      throw new AppError({
        statusCode: 400,
        code: "RECEIPT_LINES_REQUIRED",
        message: "At least one receipt line is required",
      });
    }
    input.lines.forEach((line) => ensureFutureOrCurrentExpiry(line.expiryDate));

    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId: input.branchId,
      },
      async (transaction) => {
        const existing = await transaction.inventoryReceipt.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: principal.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { id: true, receivedAt: true },
        });
        if (existing) return { ...existing, replayed: true };

        const receipt = await transaction.inventoryReceipt.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            idempotencyKey: input.idempotencyKey,
            actorMembershipId: principal.membershipId,
            ...(input.supplierName ? { supplierName: input.supplierName.trim() } : {}),
            ...(input.referenceNumber ? { referenceNumber: input.referenceNumber.trim() } : {}),
            ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
          },
          select: { id: true, receivedAt: true },
        });

        for (const [index, line] of input.lines.entries()) {
          const packaging = await transaction.productPackage.findFirst({
            where: {
              tenantId: principal.tenantId,
              productId: line.productId,
              code: line.packageCode,
              active: true,
              product: { active: true },
            },
            select: { unitsPerPackage: true },
          });
          if (!packaging) {
            throw new AppError({
              statusCode: 404,
              code: "PRODUCT_PACKAGE_NOT_FOUND",
              message: "Product packaging level not found",
            });
          }
          const quantity = packaging.unitsPerPackage * BigInt(line.packageQuantity);
          const batch = await transaction.inventoryBatch.upsert({
            where: {
              tenantId_branchId_productId_batchNumber_expiryDate: {
                tenantId: principal.tenantId,
                branchId: input.branchId,
                productId: line.productId,
                batchNumber: line.batchNumber.trim(),
                expiryDate: line.expiryDate,
              },
            },
            update: { unitCost: line.unitCost },
            create: {
              tenantId: principal.tenantId,
              branchId: input.branchId,
              productId: line.productId,
              batchNumber: line.batchNumber.trim(),
              expiryDate: line.expiryDate,
              unitCost: line.unitCost,
              ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
            },
            select: { id: true },
          });
          const locked = await lockBatch(transaction, principal.tenantId, batch.id);
          await transaction.branchProduct.upsert({
            where: {
              tenantId_branchId_productId: {
                tenantId: principal.tenantId,
                branchId: input.branchId,
                productId: line.productId,
              },
            },
            update: { active: true },
            create: {
              tenantId: principal.tenantId,
              branchId: input.branchId,
              productId: line.productId,
            },
          });
          await transaction.inventoryReceiptItem.create({
            data: {
              tenantId: principal.tenantId,
              receiptId: receipt.id,
              productId: line.productId,
              batchId: batch.id,
              quantity,
              unitCost: line.unitCost,
            },
          });
          await updateBalanceAndMove(transaction, {
            principal,
            batch: locked,
            delta: quantity,
            type: "RECEIPT",
            idempotencyKey: `${input.idempotencyKey}:line:${index}`,
            referenceType: "inventory_receipt",
            referenceId: receipt.id,
          });
        }
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            ...(requestId ? { requestId } : {}),
            action: "INVENTORY_RECEIVED",
            entityType: "inventory_receipt",
            entityId: receipt.id,
            metadata: { lineCount: input.lines.length },
          },
        });
        return { ...receipt, replayed: false };
      },
    );
  }

  async adjust(principal: AuthenticatedPrincipal, input: AdjustInventoryInput, requestId?: string) {
    requireBranchAccess(principal, input.branchId);
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId: input.branchId,
      },
      async (transaction) => {
        const existing = await transaction.stockMovement.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: principal.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) return { ...serializeMovement(existing), replayed: true };

        const batch = await lockBatch(transaction, principal.tenantId, input.batchId);
        if (batch.branch_id !== input.branchId) {
          throw new AppError({
            statusCode: 404,
            code: "BATCH_NOT_FOUND",
            message: "Inventory batch not found",
          });
        }
        const delta = input.direction === "IN" ? input.quantityBaseUnits : -input.quantityBaseUnits;
        const movement = await updateBalanceAndMove(transaction, {
          principal,
          batch,
          delta,
          type: input.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            ...(requestId ? { requestId } : {}),
            action: "INVENTORY_ADJUSTED",
            entityType: "stock_movement",
            entityId: movement.id.toString(),
            metadata: { direction: input.direction },
          },
        });
        return { ...serializeMovement(movement), replayed: false };
      },
    );
  }

  async writeOffExpired(
    principal: AuthenticatedPrincipal,
    input: ExpireInventoryInput,
    requestId?: string,
  ) {
    requireBranchAccess(principal, input.branchId);
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId: input.branchId,
      },
      async (transaction) => {
        const existing = await transaction.stockMovement.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: principal.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (existing) return { ...serializeMovement(existing), replayed: true };

        const batch = await lockBatch(transaction, principal.tenantId, input.batchId);
        if (batch.branch_id !== input.branchId) {
          throw new AppError({
            statusCode: 404,
            code: "BATCH_NOT_FOUND",
            message: "Inventory batch not found",
          });
        }
        if (batch.expiry_date.getTime() > Date.now()) {
          throw new AppError({
            statusCode: 409,
            code: "BATCH_NOT_EXPIRED",
            message: "Only expired stock can use the expiry write-off workflow",
          });
        }
        if (batch.quantity_on_hand === 0n) {
          throw new AppError({
            statusCode: 409,
            code: "BATCH_ALREADY_EMPTY",
            message: "The batch has no stock to write off",
          });
        }
        const movement = await updateBalanceAndMove(transaction, {
          principal,
          batch,
          delta: -batch.quantity_on_hand,
          type: "EXPIRED",
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            ...(requestId ? { requestId } : {}),
            action: "EXPIRED_STOCK_WRITTEN_OFF",
            entityType: "inventory_batch",
            entityId: batch.id,
            metadata: { movementId: movement.id.toString() },
          },
        });
        return { ...serializeMovement(movement), replayed: false };
      },
    );
  }

  async transfer(
    principal: AuthenticatedPrincipal,
    input: TransferInventoryInput,
    requestId?: string,
  ) {
    requireBranchAccess(principal, input.sourceBranchId);
    requireBranchAccess(principal, input.destinationBranchId);
    if (input.sourceBranchId === input.destinationBranchId) {
      throw new AppError({
        statusCode: 400,
        code: "TRANSFER_BRANCHES_MUST_DIFFER",
        message: "Source and destination branches must be different",
      });
    }

    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const replay = await transaction.inventoryTransfer.findUnique({
          where: {
            tenantId_idempotencyKey: {
              tenantId: principal.tenantId,
              idempotencyKey: input.idempotencyKey,
            },
          },
          select: { id: true, status: true, completedAt: true },
        });
        if (replay) return { ...replay, replayed: true };

        const transfer = await transaction.inventoryTransfer.create({
          data: {
            tenantId: principal.tenantId,
            sourceBranchId: input.sourceBranchId,
            destinationBranchId: input.destinationBranchId,
            idempotencyKey: input.idempotencyKey,
            initiatedByMembershipId: principal.membershipId,
            ...(input.notes ? { notes: input.notes.trim() } : {}),
          },
          select: { id: true },
        });

        const orderedLines = [...input.lines].sort((a, b) =>
          a.sourceBatchId.localeCompare(b.sourceBatchId),
        );
        for (const line of orderedLines) {
          const source = await lockBatch(transaction, principal.tenantId, line.sourceBatchId);
          if (source.branch_id !== input.sourceBranchId) {
            throw new AppError({
              statusCode: 404,
              code: "SOURCE_BATCH_NOT_FOUND",
              message: "Source batch not found in the selected branch",
            });
          }
          if (source.expiry_date.getTime() <= Date.now()) {
            throw new AppError({
              statusCode: 409,
              code: "EXPIRED_STOCK_TRANSFER_DENIED",
              message: "Expired stock cannot be transferred",
            });
          }
          const destination = await transaction.inventoryBatch.upsert({
            where: {
              tenantId_branchId_productId_batchNumber_expiryDate: {
                tenantId: principal.tenantId,
                branchId: input.destinationBranchId,
                productId: source.product_id,
                batchNumber: source.batch_number,
                expiryDate: source.expiry_date,
              },
            },
            update: {},
            create: {
              tenantId: principal.tenantId,
              branchId: input.destinationBranchId,
              productId: source.product_id,
              batchNumber: source.batch_number,
              expiryDate: source.expiry_date,
              unitCost: source.unit_cost,
            },
            select: { id: true },
          });
          const destinationLocked = await lockBatch(
            transaction,
            principal.tenantId,
            destination.id,
          );
          await updateBalanceAndMove(transaction, {
            principal,
            batch: source,
            delta: -line.quantityBaseUnits,
            type: "TRANSFER_OUT",
            idempotencyKey: `${input.idempotencyKey}:out:${source.id}`,
            referenceType: "inventory_transfer",
            referenceId: transfer.id,
          });
          await updateBalanceAndMove(transaction, {
            principal,
            batch: destinationLocked,
            delta: line.quantityBaseUnits,
            type: "TRANSFER_IN",
            idempotencyKey: `${input.idempotencyKey}:in:${source.id}`,
            referenceType: "inventory_transfer",
            referenceId: transfer.id,
          });
          await transaction.inventoryTransferItem.create({
            data: {
              tenantId: principal.tenantId,
              transferId: transfer.id,
              productId: source.product_id,
              sourceBatchId: source.id,
              destinationBatchId: destination.id,
              quantity: line.quantityBaseUnits,
            },
          });
          await transaction.branchProduct.upsert({
            where: {
              tenantId_branchId_productId: {
                tenantId: principal.tenantId,
                branchId: input.destinationBranchId,
                productId: source.product_id,
              },
            },
            update: { active: true },
            create: {
              tenantId: principal.tenantId,
              branchId: input.destinationBranchId,
              productId: source.product_id,
            },
          });
        }
        const completedAt = new Date();
        await transaction.inventoryTransfer.update({
          where: {
            tenantId_id: {
              tenantId: principal.tenantId,
              id: transfer.id,
            },
          },
          data: { status: "COMPLETED", completedAt },
        });
        await setTransactionContext(transaction, {
          tenantId: principal.tenantId,
          userId: principal.userId,
          membershipId: principal.membershipId,
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            ...(requestId ? { requestId } : {}),
            action: "INVENTORY_TRANSFER_COMPLETED",
            entityType: "inventory_transfer",
            entityId: transfer.id,
            metadata: {
              sourceBranchId: input.sourceBranchId,
              destinationBranchId: input.destinationBranchId,
              lineCount: input.lines.length,
            },
          },
        });
        return {
          id: transfer.id,
          status: "COMPLETED",
          completedAt,
          replayed: false,
        };
      },
    );
  }
}

export const inventoryService = new PrismaInventoryService();
