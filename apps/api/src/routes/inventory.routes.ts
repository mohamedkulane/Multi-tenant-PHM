import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { inventoryService, type InventoryService } from "../inventory/inventory.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();
const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);
const positiveBigInt = z
  .union([z.string().regex(/^[1-9][0-9]*$/), z.number().int().positive()])
  .transform((value) => BigInt(value));
const decimal = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/);

const receiveSchema = z.object({
  branchId: uuid,
  supplierName: z.string().trim().max(180).optional(),
  supplierId: uuid.optional(),
  referenceNumber: z.string().trim().max(100).optional(),
  idempotencyKey,
  receivedAt: z.coerce.date().optional(),
  lines: z
    .array(
      z.object({
        productId: uuid,
        packageCode: z.string().trim().min(1).max(40),
        packageQuantity: z.number().int().positive(),
        batchNumber: z.string().trim().min(1).max(100),
        expiryDate: z.coerce.date(),
        unitCost: decimal,
      }),
    )
    .min(1)
    .max(100),
});

const adjustmentSchema = z.object({
  branchId: uuid,
  batchId: uuid,
  direction: z.enum(["IN", "OUT"]),
  quantityBaseUnits: positiveBigInt,
  reason: z.string().trim().min(3).max(500),
  idempotencyKey,
});

const expirySchema = z.object({
  branchId: uuid,
  batchId: uuid,
  reason: z.string().trim().min(3).max(500),
  idempotencyKey,
});

const transferSchema = z
  .object({
    sourceBranchId: uuid,
    destinationBranchId: uuid,
    idempotencyKey,
    notes: z.string().trim().max(500).optional(),
    lines: z
      .array(
        z.object({
          sourceBatchId: uuid,
          quantityBaseUnits: positiveBigInt,
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (body) => body.sourceBranchId !== body.destinationBranchId,
    "Source and destination branches must differ",
  );

export function createInventoryRouter(
  authentication: AuthService,
  service: InventoryService = inventoryService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication));

  router.get("/stock", requirePermission("inventory.read"), async (request, response) => {
    const branchId = uuid.parse(request.query.branchId);
    const query = z.string().trim().max(100).optional().parse(request.query.q);
    response.json({
      data: await service.listStock(request.auth!, branchId, query),
    });
  });

  router.get("/movements", requirePermission("inventory.read"), async (request, response) => {
    const branchId = uuid.parse(request.query.branchId);
    const productId = uuid.optional().parse(request.query.productId);
    response.json({
      data: await service.listMovements(request.auth!, branchId, productId),
    });
  });

  router.post("/receipts", requirePermission("inventory.manage"), async (request, response) => {
    const result = await service.receive(
      request.auth!,
      receiveSchema.parse(request.body),
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  router.post("/adjustments", requirePermission("inventory.manage"), async (request, response) => {
    const result = await service.adjust(
      request.auth!,
      adjustmentSchema.parse(request.body),
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  router.post(
    "/expiry-write-offs",
    requirePermission("inventory.manage"),
    async (request, response) => {
      const result = await service.writeOffExpired(
        request.auth!,
        expirySchema.parse(request.body),
        response.locals.requestId as string | undefined,
      );
      response.status(201).json({ data: result });
    },
  );

  router.post("/transfers", requirePermission("inventory.manage"), async (request, response) => {
    const result = await service.transfer(
      request.auth!,
      transferSchema.parse(request.body),
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  return router;
}
