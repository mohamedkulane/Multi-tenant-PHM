import { LabInterpretation, LabResultStatus, LabResultType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { presentClinicalData } from "../clinic/clinical-data-presenter.js";
import { labService, type LabService } from "../lab/lab.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";
import { paymentMethodSchema } from "../payments/payment-methods.js";

const uuid = z.uuid();
const money = z
  .string()
  .trim()
  .regex(/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,4})?$/);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const labTestSchema = z.object({
  categoryId: uuid,
  code: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  name: z.string().trim().min(2).max(180),
  description: optionalText(1000),
  price: money,
  sampleType: optionalText(80),
  resultType: z.nativeEnum(LabResultType).default("POSITIVE_NEGATIVE"),
  unit: optionalText(80),
  referenceRange: optionalText(180),
  resultOptions: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  panelComponents: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        unit: optionalText(80),
        referenceRange: optionalText(180),
      }),
    )
    .max(100)
    .optional(),
});

export function createLabRouter(authentication: AuthService, service: LabService = labService) {
  const router = Router();
  router.use(requireAuthentication(authentication));
  router.get("/categories", requirePermission("lab.catalog.read"), async (req, res) =>
    res.json({ data: presentClinicalData(req.auth!, await service.categories(req.auth!)) }),
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
  router.delete("/categories/:categoryId", requirePermission("lab.manage"), async (req, res) =>
    res.json({ data: await service.archiveCategory(req.auth!, uuid.parse(req.params.categoryId)) }),
  );
  router.post("/tests", requirePermission("lab.manage"), async (req, res) =>
    res.status(201).json({
      data: await service.createTest(req.auth!, labTestSchema.parse(req.body)),
    }),
  );
  router.put("/tests/:testId", requirePermission("lab.manage"), async (req, res) =>
    res.json({
      data: await service.updateTest(
        req.auth!,
        uuid.parse(req.params.testId),
        labTestSchema.extend({ active: z.boolean() }).parse(req.body),
      ),
    }),
  );
  router.delete("/tests/:testId", requirePermission("lab.manage"), async (req, res) =>
    res.json({ data: await service.archiveTest(req.auth!, uuid.parse(req.params.testId)) }),
  );
  router.get("/patients", requirePermission("patient.lab_identity.read"), async (req, res) =>
    res.json({
      data: presentClinicalData(
        req.auth!,
        await service.patients(req.auth!, z.string().trim().max(100).optional().parse(req.query.q)),
      ),
    }),
  );
  router.post("/patients", requirePermission("patient.create"), async (req, res) =>
    res.status(201).json({
      data: presentClinicalData(
        req.auth!,
        await service.createPatient(
          req.auth!,
          z
            .object({
              name: z.string().trim().min(2).max(180),
              sex: z.string().trim().min(1).max(20),
              dateOfBirth: z.coerce.date().max(new Date()).optional(),
              estimatedAgeValue: z.number().int().min(0).max(130).optional(),
              estimatedAgeUnit: z.enum(["DAYS", "MONTHS", "YEARS"]).optional(),
              allergyStatus: z
                .enum(["NO_KNOWN_ALLERGIES", "HAS_ALLERGIES", "UNKNOWN"])
                .default("UNKNOWN"),
              phone: optionalText(40),
              address: optionalText(500),
              emergencyContactName: optionalText(180),
              emergencyContactPhone: optionalText(40),
              bloodGroup: optionalText(10),
              allergies: optionalText(2000),
              notes: optionalText(1000),
            })
            .superRefine((value, context) => {
              const hasDob = value.dateOfBirth !== undefined;
              const hasEstimate =
                value.estimatedAgeValue !== undefined || value.estimatedAgeUnit !== undefined;
              if (hasDob === hasEstimate) {
                context.addIssue({
                  code: "custom",
                  path: ["dateOfBirth"],
                  message: "Either date of birth or estimated age is required, but not both.",
                });
              }
              if (
                hasEstimate &&
                (value.estimatedAgeValue === undefined || value.estimatedAgeUnit === undefined)
              ) {
                context.addIssue({
                  code: "custom",
                  path: ["estimatedAgeValue"],
                  message: "Estimated age value and unit must be provided together.",
                });
              }
              if (value.allergyStatus === "HAS_ALLERGIES" && !value.allergies?.trim()) {
                context.addIssue({
                  code: "custom",
                  path: ["allergies"],
                  message: "Allergy details are required when the patient has allergies.",
                });
              }
            })
            .parse(req.body),
        ),
      ),
    }),
  );
  router.get("/visits", requirePermission("lab.order.read"), async (req, res) =>
    res.json({
      data: presentClinicalData(
        req.auth!,
        await service.visits(req.auth!, uuid.parse(req.query.branchId)),
      ),
    }),
  );
  router.get("/visits/:visitId", requirePermission("lab.order.read"), async (req, res) =>
    res.json({
      data: presentClinicalData(
        req.auth!,
        await service.visit(req.auth!, uuid.parse(req.params.visitId)),
      ),
    }),
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
            paymentMethod: paymentMethodSchema.optional(),
            paymentReference: z.string().trim().max(180).optional(),
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
            method: paymentMethodSchema,
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
    requirePermission("lab.result.create"),
    async (req, res) =>
      res.json({
        data: presentClinicalData(
          req.auth!,
          await service.markResult(
            req.auth!,
            uuid.parse(req.params.visitId),
            uuid.parse(req.params.visitTestId),
            z
              .object({
                resultStatus: z.nativeEnum(LabResultStatus),
                resultValue: optionalText(1000),
                numericValue: z.coerce.number().finite().optional(),
                interpretation: z.nativeEnum(LabInterpretation).optional(),
                resultData: z.record(z.string(), z.unknown()).optional(),
                resultNote: optionalText(1000),
              })
              .parse(req.body),
          ),
        ),
      }),
  );
  return router;
}
