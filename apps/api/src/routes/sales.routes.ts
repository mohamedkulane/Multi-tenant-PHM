import { PaymentMethod } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { salesService, type SalesService } from "../finance/sales.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();
const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);
const money = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,4})?$/);
const paymentMethod = z.nativeEnum(PaymentMethod);
const positiveBigInt = z
  .union([z.string().regex(/^[1-9][0-9]*$/), z.number().int().positive()])
  .transform((value) => BigInt(value));

const checkoutSchema = z.object({
  branchId: uuid,
  customerName: z.string().trim().min(1).max(180),
  customerPhone: z.string().trim().max(40).optional(),
  customerId: uuid.optional(),
  clinicVisitId: uuid.optional(),
  prescriptionId: uuid.optional(),
  discount: money.default("0"),
  amountPaid: money.default("0"),
  paymentMethod: paymentMethod.optional(),
  paymentReference: z.string().trim().max(180).optional(),
  dueDate: z.coerce.date().optional(),
  idempotencyKey,
  lines: z
    .array(
      z.object({
        productId: uuid,
        packageCode: z.string().trim().min(1).max(40),
        packageQuantity: z.number().int().positive(),
        prescriptionItemId: uuid.optional(),
      }),
    )
    .min(1)
    .max(100),
});

const paymentSchema = z.object({
  branchId: uuid,
  amount: money,
  method: paymentMethod,
  externalReference: z.string().trim().max(180).optional(),
  notes: z.string().trim().max(500).optional(),
  idempotencyKey,
});

const returnSchema = z.object({
  branchId: uuid,
  reason: z.string().trim().min(3).max(500),
  refundMethod: paymentMethod.optional(),
  idempotencyKey,
  lines: z
    .array(
      z.object({
        saleItemId: uuid,
        quantityBaseUnits: positiveBigInt,
      }),
    )
    .min(1)
    .max(100),
});

const voidSchema = z.object({
  branchId: uuid,
  reason: z.string().trim().min(3).max(500),
  refundMethod: paymentMethod.optional(),
  idempotencyKey,
});

export function createSalesRouter(
  authentication: AuthService,
  service: SalesService = salesService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication));

  router.get("/", requirePermission("sale.read"), async (request, response) => {
    const branchId = uuid.parse(request.query.branchId);
    const search = z.string().trim().max(100).optional().parse(request.query.q);
    response.json({ data: await service.list(request.auth!, branchId, search) });
  });

  router.get("/:saleId", requirePermission("sale.read"), async (request, response) => {
    response.json({ data: await service.get(request.auth!, uuid.parse(request.params.saleId)) });
  });

  router.post("/", requirePermission("sale.create"), async (request, response) => {
    const result = await service.checkout(
      request.auth!,
      checkoutSchema.parse(request.body),
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  router.post("/:saleId/payments", requirePermission("sale.payment"), async (request, response) => {
    const body = paymentSchema.parse(request.body);
    const result = await service.addPayment(
      request.auth!,
      { ...body, saleId: uuid.parse(request.params.saleId) },
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  router.post("/:saleId/returns", requirePermission("sale.return"), async (request, response) => {
    const body = returnSchema.parse(request.body);
    const result = await service.returnSale(
      request.auth!,
      { ...body, saleId: uuid.parse(request.params.saleId) },
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  router.post("/:saleId/void", requirePermission("sale.void"), async (request, response) => {
    const body = voidSchema.parse(request.body);
    const result = await service.voidSale(
      request.auth!,
      { ...body, saleId: uuid.parse(request.params.saleId) },
      response.locals.requestId as string | undefined,
    );
    response.status(201).json({ data: result });
  });

  return router;
}
