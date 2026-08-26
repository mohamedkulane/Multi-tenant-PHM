import { DiagnosisType, LabOrderPriority } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { presentClinicalData } from "../clinic/clinical-data-presenter.js";
import { clinicService, type ClinicService } from "../clinic/clinic.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requireAnyPermission, requirePermission } from "../middleware/authorization.js";
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
const assessmentSchema = z
  .object({
    chiefComplaint: z.string().trim().max(2000).default(""),
    historyPresentIllness: optionalText(6000),
    pastMedicalHistory: optionalText(4000),
    pastSurgicalHistory: optionalText(4000),
    currentMedicines: optionalText(4000),
    medicationStatus: z.enum(["NONE", "TAKING_MEDICATION", "UNKNOWN"]),
    allergies: optionalText(4000),
    allergyStatus: z.enum(["NO_KNOWN_ALLERGIES", "HAS_ALLERGIES", "UNKNOWN"]),
    noSignificantMedicalHistory: z.boolean().default(false),
    noPastSurgery: z.boolean().default(false),
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
      .superRefine((value, context) => {
        if (value.systolicBp !== undefined && value.diastolicBp === undefined) {
          context.addIssue({
            code: "custom",
            path: ["diastolicBp"],
            message: "Diastolic blood pressure is required when systolic pressure is entered.",
          });
        }
        if (value.diastolicBp !== undefined && value.systolicBp === undefined) {
          context.addIssue({
            code: "custom",
            path: ["systolicBp"],
            message: "Systolic blood pressure is required when diastolic pressure is entered.",
          });
        }
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
  })
  .superRefine((value, context) => {
    if (value.medicationStatus === "TAKING_MEDICATION" && !value.currentMedicines?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["currentMedicines"],
        message: "Medicine details are required when the patient is taking medication.",
      });
    }
    if (value.allergyStatus === "HAS_ALLERGIES" && !value.allergies?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["allergies"],
        message: "Allergy details are required when the patient has allergies.",
      });
    }
  });

export function createClinicRouter(
  authentication: AuthService,
  service: ClinicService = clinicService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication));

  router.get(
    "/visits",
    requireAnyPermission("clinic.read", "clinic.visit.lookup"),
    async (request, response) => {
      const branchId = uuid.parse(request.query.branchId);
      const visits =
        request.query.view === "summary"
          ? await service.visitSummaries(request.auth!, branchId)
          : await service.visits(request.auth!, branchId);
      response.json({ data: presentClinicalData(request.auth!, visits) });
    },
  );
  router.get("/doctors", requirePermission("clinic.assign"), async (request, response) =>
    response.json({
      data: await service.doctors(request.auth!, uuid.parse(request.query.branchId)),
    }),
  );
  router.get(
    "/visits/:visitId",
    requireAnyPermission("clinic.read", "clinic.visit.lookup"),
    async (request, response) =>
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
    async (request, response) => {
      const body = z
        .object({
          disposition: z.enum([
            "DISCHARGED",
            "FOLLOW_UP",
            "REFERRED",
            "ADMITTED",
            "OBSERVATION",
            "EMERGENCY_TRANSFER",
            "OTHER",
          ]),
          diagnosticOutcome: z.enum([
            "FINAL_DIAGNOSIS",
            "NO_DEFINITIVE_DIAGNOSIS",
            "OBSERVATION",
            "REFERRAL",
          ]),
          followUpDate: z.coerce.date().optional(),
          followUpInstructions: optionalText(3000),
          referralDestination: optionalText(300),
          referralReason: optionalText(3000),
          transferReason: optionalText(3000),
          dispositionNotes: optionalText(3000),
        })
        .parse(request.body);
      response.json({
        data: presentClinicalData(
          request.auth!,
          await service.completeDoctorReview(
            request.auth!,
            uuid.parse(request.params.visitId),
            body,
            response.locals.requestId as string | undefined,
          ),
        ),
      });
    },
  );
  router.post(
    "/visits/:visitId/lab/:labVisitId/sample",
    requirePermission("lab.sample.collect"),
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
                      sampleCondition: z.enum([
                        "ACCEPTABLE",
                        "HEMOLYZED",
                        "CLOTTED",
                        "INSUFFICIENT",
                        "CONTAMINATED",
                        "WRONG_CONTAINER",
                        "LEAKING",
                        "OTHER",
                      ]),
                      rejectionReason: optionalText(1000),
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
