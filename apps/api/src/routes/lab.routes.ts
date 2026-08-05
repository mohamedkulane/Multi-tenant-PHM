import { LabResultStatus, PaymentMethod } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { labService, type LabService } from "../lab/lab.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();
const money = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,4})?$/);

export function createLabRouter(authentication: AuthService, service: LabService = labService) {
  const router = Router();
  router.use(requireAuthentication(authentication));
  router.get("/categories", requirePermission("lab.read"), async (req, res) =>
    res.json({ data: await service.categories(req.auth!) }),
  );
  router.post("/categories", requirePermission("lab.manage"), async (req, res) =>
    res.status(201).json({
      data: await service.createCategory(
        req.auth!,
        z.object({ name: z.string().trim().min(2).max(150) }).parse(req.body).name,
      ),
    }),
  );
  router.put("/categories/:categoryId", requirePermission("lab.manage"), async (req, res) =>
    res.json({
      data: await service.updateCategory(
        req.auth!,
        uuid.parse(req.params.categoryId),
        z.object({ name: z.string().trim().min(2).max(150), active: z.boolean() }).parse(req.body),
      ),
    }),
  );
  router.post("/tests", requirePermission("lab.manage"), async (req, res) =>
    res.status(201).json({
      data: await service.createTest(
        req.auth!,
        z
          .object({ categoryId: uuid, name: z.string().trim().min(2).max(180), price: money })
          .parse(req.body),
      ),
    }),
  );
  router.put("/tests/:testId", requirePermission("lab.manage"), async (req, res) =>
    res.json({
      data: await service.updateTest(
        req.auth!,
        uuid.parse(req.params.testId),
        z
          .object({
            categoryId: uuid,
            name: z.string().trim().min(2).max(180),
            price: money,
            active: z.boolean(),
          })
          .parse(req.body),
      ),
    }),
  );
  router.get("/patients", requirePermission("lab.read"), async (req, res) =>
    res.json({
      data: await service.patients(
        req.auth!,
        z.string().trim().max(100).optional().parse(req.query.q),
      ),
    }),
  );
  router.post("/patients", requirePermission("lab.manage"), async (req, res) =>
    res.status(201).json({
      data: await service.createPatient(
        req.auth!,
        z
          .object({
            name: z.string().trim().min(2).max(180),
            age: z.number().int().min(0).max(130),
            sex: z.string().trim().max(20).optional(),
            phone: z.string().trim().max(40).optional(),
            notes: z.string().trim().max(1000).optional(),
          })
          .parse(req.body),
      ),
    }),
  );
  router.get("/visits", requirePermission("lab.read"), async (req, res) =>
    res.json({ data: await service.visits(req.auth!, uuid.parse(req.query.branchId)) }),
  );
  router.get("/visits/:visitId", requirePermission("lab.read"), async (req, res) =>
    res.json({ data: await service.visit(req.auth!, uuid.parse(req.params.visitId)) }),
  );
  router.post("/visits", requirePermission("lab.manage"), async (req, res) =>
    res.status(201).json({
      data: await service.createVisit(
        req.auth!,
        z
          .object({
            branchId: uuid,
            patientId: uuid,
            testIds: z.array(uuid).min(1).max(100),
            discount: money.default("0"),
            paymentTiming: z.enum(["NOW", "LATER"]).default("LATER"),
            amountPaid: money.default("0"),
            paymentMethod: z.nativeEnum(PaymentMethod).optional(),
            clinicalNotes: z.string().trim().max(2000).optional(),
          })
          .parse(req.body),
        res.locals.requestId as string | undefined,
      ),
    }),
  );
  router.post("/visits/:visitId/payments", requirePermission("lab.payment"), async (req, res) =>
    res.status(201).json({
      data: await service.addPayment(
        req.auth!,
        uuid.parse(req.params.visitId),
        z
          .object({
            amount: money.refine((value) => Number(value) > 0, "Payment must be positive"),
            method: z.nativeEnum(PaymentMethod),
            externalReference: z.string().trim().max(180).optional(),
            notes: z.string().trim().max(500).optional(),
            idempotencyKey: z.string().trim().min(8).max(120),
          })
          .parse(req.body),
        res.locals.requestId as string | undefined,
      ),
    }),
  );
  router.patch(
    "/visits/:visitId/tests/:visitTestId/result",
    requirePermission("lab.result"),
    async (req, res) =>
      res.json({
        data: await service.markResult(
          req.auth!,
          uuid.parse(req.params.visitId),
          uuid.parse(req.params.visitTestId),
          z
            .object({
              resultStatus: z.nativeEnum(LabResultStatus),
              resultNote: z.string().trim().max(1000).optional(),
            })
            .parse(req.body),
        ),
      }),
  );
  return router;
}
