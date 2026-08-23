import { DiagnosisType, LabOrderPriority } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { presentClinicalData } from "../clinic/clinical-data-presenter.js";
import { clinicService, type ClinicService } from "../clinic/clinic.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";
import { paymentMethodSchema } from "../payments/payment-methods.js";

const uuid = z.uuid();
const money = z.union([z.string(), z.number()]).transform(String);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/);
const optionalNumber = (minimum: number, maximum: number) =>
  z.coerce.number().finite().min(minimum).max(maximum).optional();
const assessmentSchema = z.object({
  chiefComplaint: z.string().trim().min(1).max(2000),
  historyPresentIllness: optionalText(6000),
  pastMedicalHistory: optionalText(4000),
  pastSurgicalHistory: optionalText(4000),
  currentMedicines: optionalText(4000),
  allergies: optionalText(4000),
  symptoms: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  vitalSigns: z
    .object({
      temperature: optionalNumber(25, 50),
      systolicBp: optionalNumber(40, 300),
      diastolicBp: optionalNumber(20, 200),
      pulse: optionalNumber(20, 300),
      respiratoryRate: optionalNumber(5, 100),
      oxygenSaturation: optionalNumber(0, 100),
      weight: optionalNumber(0, 1000),
      height: optionalNumber(0, 300),
    })
    .default({}),
  physicalExamination: z
    .object({
      generalAppearance: optionalText(2000),
      chest: optionalText(2000),
      cardiovascular: optionalText(2000),
      abdomen: optionalText(2000),
      skin: optionalText(2000),
      neurological: optionalText(2000),
      other: optionalText(3000),
    })
    .default({}),
  examinationNotes: optionalText(6000),
  provisionalDiagnosis: optionalText(3000),
});

export function createClinicRouter(
  authentication: AuthService,
  service: ClinicService = clinicService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication));

  router.get("/visits", requirePermission("clinic.read"), async (request, response) => {
    const branchId = uuid.parse(request.query.branchId);
    const visits =
      request.query.view === "summary"
        ? await service.visitSummaries(request.auth!, branchId)
        : await service.visits(request.auth!, branchId);
    response.json({ data: presentClinicalData(request.auth!, visits) });
  });
  router.get("/doctors", requirePermission("clinic.assign"), async (request, response) =>
    response.json({
      data: await service.doctors(request.auth!, uuid.parse(request.query.branchId)),
    }),
  );
  router.get("/visits/:visitId", requirePermission("clinic.read"), async (request, response) =>
    response.json({
      data: presentClinicalData(
        request.auth!,
        await service.visit(request.auth!, uuid.parse(request.params.visitId)),
      ),
    }),
  );
  router.get(
    "/patients/:patientId/history",
    requirePermission("clinic.history"),
    async (request, response) =>
      response.json({
        data: presentClinicalData(
          request.auth!,
          await service.patientHistory(request.auth!, uuid.parse(request.params.patientId)),
        ),
      }),
  );
  router.post("/visits", requirePermission("clinic.register"), async (request, response) => {
    const body = z
      .object({
        branchId: uuid,
        patientId: uuid,
        consultationFee: money,
        doctorMembershipId: uuid.optional(),
      })
      .parse(request.body);
    response.status(201).json({
      data: await service.register(
        request.auth!,
        body,
        response.locals.requestId as string | undefined,
      ),
    });
  });
  router.post(
    "/visits/:visitId/consultation-payment",
    requirePermission("clinic.payment"),
    async (request, response) => {
      const body = z
        .object({
          method: paymentMethodSchema,
          idempotencyKey,
          externalReference: optionalText(180),
        })
        .parse(request.body);
      response.json({
        data: await service.payConsultation(
          request.auth!,
          uuid.parse(request.params.visitId),
          body,
          response.locals.requestId as string | undefined,
        ),
      });
    },
  );
  router.put(
    "/visits/:visitId/assessment",
    requirePermission("clinic.examine"),
    async (request, response) =>
      response.json({
        data: presentClinicalData(
          request.auth!,
          await service.saveAssessment(
            request.auth!,
            uuid.parse(request.params.visitId),
            assessmentSchema.parse(request.body),
            response.locals.requestId as string | undefined,
          ),
        ),
      }),
  );
  router.post(
    "/visits/:visitId/lab-orders",
    requirePermission("lab.order"),
    async (request, response) => {
      const body = z
        .object({
          testIds: z.array(uuid).min(1).max(100),
          clinicalNotes: optionalText(2000),
          priority: z.nativeEnum(LabOrderPriority).default("ROUTINE"),
        })
        .parse(request.body);
      response.status(201).json({
        data: presentClinicalData(
          request.auth!,
          await service.requestLabTests(
            request.auth!,
            uuid.parse(request.params.visitId),
            body,
            response.locals.requestId as string | undefined,
          ),
        ),
      });
    },
  );
  router.put(
    "/visits/:visitId/diagnoses/:type",
    requirePermission("diagnosis.create"),
    async (request, response) => {
      const type = z.nativeEnum(DiagnosisType).parse(request.params.type);
      const body = z
        .object({
          diagnoses: z
            .array(
              z.object({
                description: z.string().trim().min(1).max(3000),
                code: optionalText(40),
              }),
            )
            .min(1)
            .max(20),
        })
        .parse(request.body);
      response.json({
        data: presentClinicalData(
          request.auth!,
          await service.recordDiagnoses(
            request.auth!,
            uuid.parse(request.params.visitId),
            type,
            body.diagnoses,
            response.locals.requestId as string | undefined,
          ),
        ),
      });
    },
  );
  router.post(
    "/visits/:visitId/complete-review",
    requirePermission("clinic.complete"),
    async (request, response) =>
      response.json({
        data: presentClinicalData(
          request.auth!,
          await service.completeDoctorReview(
            request.auth!,
            uuid.parse(request.params.visitId),
            response.locals.requestId as string | undefined,
          ),
        ),
      }),
  );
  router.post(
    "/visits/:visitId/lab/:labVisitId/sample",
    requirePermission("lab.sample"),
    async (request, response) =>
      response.json({
        data: presentClinicalData(
          request.auth!,
          await service.collectSample(
            request.auth!,
            uuid.parse(request.params.visitId),
            uuid.parse(request.params.labVisitId),
            z
              .object({
                samples: z
                  .array(
                    z.object({
                      visitTestId: uuid,
                      sampleId: z.string().trim().min(1).max(80),
                      sampleNotes: optionalText(1000),
                    }),
                  )
                  .min(1)
                  .max(100),
              })
              .parse(request.body ?? {}),
            response.locals.requestId as string | undefined,
          ),
        ),
      }),
  );
  return router;
}
