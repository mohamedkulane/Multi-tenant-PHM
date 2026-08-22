import { randomUUID } from "node:crypto";
import type { DiagnosisType, LabOrderPriority, PaymentMethod, Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext, withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { formatMoney, parseMoney } from "../finance/money.js";
import { canAccessBranch } from "../middleware/authorization.js";

export interface RegisterClinicVisitInput {
  branchId: string;
  patientId: string;
  consultationFee: string;
  doctorMembershipId?: string | undefined;
}

export interface ClinicalAssessmentInput {
  chiefComplaint: string;
  historyPresentIllness?: string | undefined;
  pastMedicalHistory?: string | undefined;
  pastSurgicalHistory?: string | undefined;
  currentMedicines?: string | undefined;
  allergies?: string | undefined;
  symptoms: string[];
  vitalSigns: {
    temperature?: number | undefined;
    systolicBp?: number | undefined;
    diastolicBp?: number | undefined;
    pulse?: number | undefined;
    respiratoryRate?: number | undefined;
    oxygenSaturation?: number | undefined;
    weight?: number | undefined;
    height?: number | undefined;
  };
  physicalExamination: {
    generalAppearance?: string | undefined;
    chest?: string | undefined;
    cardiovascular?: string | undefined;
    abdomen?: string | undefined;
    skin?: string | undefined;
    neurological?: string | undefined;
    other?: string | undefined;
  };
  examinationNotes?: string | undefined;
  provisionalDiagnosis?: string | undefined;
}

export interface LabRequestInput {
  testIds: string[];
  clinicalNotes?: string | undefined;
  priority: LabOrderPriority;
}

export interface ConsultationPaymentInput {
  method: PaymentMethod;
  idempotencyKey: string;
  externalReference?: string | undefined;
}
function clean(value: string | undefined) {
  return value?.trim() || null;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function requireBranch(principal: AuthenticatedPrincipal, branchId: string) {
  if (!canAccessBranch(principal, branchId)) {
    throw new AppError({
      statusCode: 403,
      code: "BRANCH_ACCESS_DENIED",
      message: "You do not have access to this branch",
    });
  }
}

function requireDoctorAccess(
  principal: AuthenticatedPrincipal,
  visit: { assignedDoctorMembershipId: string | null },
) {
  if (
    principal.role === "DOCTOR" &&
    visit.assignedDoctorMembershipId &&
    visit.assignedDoctorMembershipId !== principal.membershipId
  ) {
    throw new AppError({
      statusCode: 404,
      code: "CLINIC_VISIT_NOT_FOUND",
      message: "Clinic visit not found",
    });
  }
}

const clinicVisitInclude = {
  patient: true,
  clinicalAssessment: true,
  diagnoses: { orderBy: { recordedAt: "asc" as const } },
  clinicalPayments: { orderBy: { paidAt: "asc" as const } },
  labVisits: {
    include: {
      tests: { include: { labTest: true }, orderBy: { categoryName: "asc" as const } },
      payments: { orderBy: { createdAt: "asc" as const } },
    },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.ClinicVisitInclude;

type ClinicVisitRecord = Prisma.ClinicVisitGetPayload<{ include: typeof clinicVisitInclude }>;

function redactClinicalVisit(principal: AuthenticatedPrincipal, visit: ClinicVisitRecord) {
  if (
    principal.isSupportSession ||
    principal.role === "OWNER" ||
    principal.role === "ADMIN" ||
    principal.role === "DOCTOR"
  ) {
    return visit;
  }

  if (principal.role === "LAB_TECHNICIAN") {
    return {
      ...visit,
      clinicalAssessment: null,
      diagnoses: [],
      clinicalPayments: visit.clinicalPayments.filter((payment) => payment.type === "LAB"),
    };
  }

  if (principal.role === "PHARMACIST") {
    return {
      ...visit,
      clinicalAssessment: null,
      diagnoses: [],
      clinicalPayments: [],
      labVisits: [],
    };
  }

  return {
    ...visit,
    clinicalAssessment: null,
    diagnoses: [],
    labVisits: visit.labVisits.map((labVisit) => ({
      ...labVisit,
      tests: labVisit.tests.map((test) => ({
        ...test,
        resultValue: null,
        numericValue: null,
        resultData: null,
        interpretation: null,
        comments: null,
      })),
    })),
  };
}

export class ClinicService {
  async visits(principal: AuthenticatedPrincipal, branchId: string) {
    requireBranch(principal, branchId);
    return withTenantContext(prisma, { ...principal, branchId }, async (transaction) => {
      const visits = await transaction.clinicVisit.findMany({
        where: {
          tenantId: principal.tenantId,
          branchId,
          ...(principal.role === "DOCTOR"
            ? {
                AND: [
                  {
                    OR: [
                      { assignedDoctorMembershipId: principal.membershipId },
                      { assignedDoctorMembershipId: null },
                    ],
                  },
                  {
                    status: {
                      in: [
                        "WAITING_FOR_DOCTOR",
                        "IN_EXAMINATION",
                        "IN_CONSULTATION",
                        "LAB_RESULTS_READY",
                        "RESULTS_READY",
                        "DOCTOR_REVIEW",
                        "COMPLETED",
                      ],
                    },
                  },
                ],
              }
            : principal.role === "LAB_TECHNICIAN"
              ? {
                  status: {
                    in: ["WAITING_FOR_SAMPLE", "WAITING_FOR_LAB", "LAB_IN_PROGRESS"],
                  },
                }
              : principal.role === "PHARMACIST"
                ? { status: "COMPLETED" }
                : {}),
        },
        include: clinicVisitInclude,
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      return visits.map((visit) => redactClinicalVisit(principal, visit));
    });
  }

  async doctors(principal: AuthenticatedPrincipal, branchId: string) {
    requireBranch(principal, branchId);
    return withTenantContext(prisma, { ...principal, branchId }, (transaction) =>
      transaction.tenantMembership.findMany({
        where: {
          tenantId: principal.tenantId,
          role: "DOCTOR",
          status: "ACTIVE",
          OR: [{ allBranches: true }, { branches: { some: { branchId } } }],
        },
        select: {
          id: true,
          username: true,
          user: { select: { fullName: true } },
        },
        orderBy: { username: "asc" },
      }),
    );
  }
  async visit(principal: AuthenticatedPrincipal, visitId: string) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const visit = await transaction.clinicVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: clinicVisitInclude,
      });
      if (!visit || !canAccessBranch(principal, visit.branchId)) {
        throw new AppError({
          statusCode: 404,
          code: "CLINIC_VISIT_NOT_FOUND",
          message: "Clinic visit not found",
        });
      }
      requireDoctorAccess(principal, visit);
      const actorIds = new Set<string>();
      if (visit.assignedDoctorMembershipId) actorIds.add(visit.assignedDoctorMembershipId);
      for (const payment of visit.clinicalPayments) actorIds.add(payment.collectedByMembershipId);
      for (const labVisit of visit.labVisits) {
        if (labVisit.requestedByMembershipId) actorIds.add(labVisit.requestedByMembershipId);
        if (labVisit.sampleCollectedById) actorIds.add(labVisit.sampleCollectedById);
        for (const test of labVisit.tests)
          if (test.markedByMembershipId) actorIds.add(test.markedByMembershipId);
      }
      const actors = actorIds.size
        ? await transaction.tenantMembership.findMany({
            where: { tenantId: principal.tenantId, id: { in: [...actorIds] } },
            select: {
              id: true,
              username: true,
              role: true,
              user: { select: { fullName: true } },
            },
          })
        : [];
      return {
        ...redactClinicalVisit(principal, visit),
        actors: Object.fromEntries(
          actors.map((actor) => [
            actor.id,
            {
              id: actor.id,
              name: actor.user.fullName,
              username: actor.username,
              role: actor.role,
            },
          ]),
        ),
      };
    });
  }

  async register(
    principal: AuthenticatedPrincipal,
    input: RegisterClinicVisitInput,
    requestId?: string,
  ) {
    requireBranch(principal, input.branchId);
    const fee = parseMoney(input.consultationFee, "consultation fee");
    if (fee < 0n)
      throw new AppError({
        statusCode: 400,
        code: "INVALID_CONSULTATION_FEE",
        message: "Consultation fee cannot be negative",
      });
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, { ...principal, branchId: input.branchId });
      const patient = await transaction.patient.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: input.patientId } },
      });
      if (!patient)
        throw new AppError({
          statusCode: 404,
          code: "PATIENT_NOT_FOUND",
          message: "Patient not found",
        });
      if (input.doctorMembershipId) {
        const doctor = await transaction.tenantMembership.findUnique({
          where: {
            tenantId_id: {
              tenantId: principal.tenantId,
              id: input.doctorMembershipId,
            },
          },
          include: { branches: true },
        });
        if (
          !doctor ||
          doctor.role !== "DOCTOR" ||
          doctor.status !== "ACTIVE" ||
          (!doctor.allBranches &&
            !doctor.branches.some((assignment) => assignment.branchId === input.branchId))
        )
          throw new AppError({
            statusCode: 400,
            code: "INVALID_DOCTOR_ASSIGNMENT",
            message: "Choose an active doctor assigned to this branch",
          });
      }
      const paid = fee === 0n;
      const visit = await transaction.clinicVisit.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          patientId: patient.id,
          visitNumber: `CLN-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
          status: paid ? "WAITING_FOR_DOCTOR" : "AWAITING_CONSULTATION_PAYMENT",
          consultationFee: formatMoney(fee),
          consultationPaymentStatus: paid ? "PAID" : "UNPAID",
          ...(paid
            ? { consultationPaidAt: new Date(), consultationCollectedById: principal.membershipId }
            : {}),
          assignedDoctorMembershipId: input.doctorMembershipId ?? null,
          registeredByMembershipId: principal.membershipId,
        },
        include: clinicVisitInclude,
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "CLINIC_VISIT_REGISTERED",
          entityType: "clinic_visit",
          entityId: visit.id,
          after: {
            visitNumber: visit.visitNumber,
            patientId: patient.id,
            consultationFee: formatMoney(fee),
          },
        },
      });
      return visit;
    });
  }

  async payConsultation(
    principal: AuthenticatedPrincipal,
    visitId: string,
    input: ConsultationPaymentInput,
    requestId?: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, principal);
      const existingPayment = await transaction.clinicalPayment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: principal.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existingPayment) {
        if (existingPayment.clinicVisitId !== visitId || existingPayment.type !== "CONSULTATION")
          throw new AppError({
            statusCode: 409,
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "This payment key was already used for another transaction",
          });
        return transaction.clinicVisit.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
          include: clinicVisitInclude,
        });
      }
      await transaction.$queryRawUnsafe(
        "SELECT id FROM public.clinic_visits WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE",
        principal.tenantId,
        visitId,
      );
      const visit = await transaction.clinicVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "CLINIC_VISIT_NOT_FOUND",
          message: "Clinic visit not found",
        });
      if (visit.consultationPaymentStatus === "PAID")
        throw new AppError({
          statusCode: 409,
          code: "CONSULTATION_ALREADY_PAID",
          message: "Consultation fee is already paid",
        });
      const receiptNumber =
        "RCT-C-" +
        new Date().toISOString().slice(0, 10).replaceAll("-", "") +
        "-" +
        randomUUID().slice(0, 8).toUpperCase();
      await transaction.clinicalPayment.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          patientId: visit.patientId,
          clinicVisitId: visit.id,
          type: "CONSULTATION",
          receiptNumber,
          amount: visit.consultationFee,
          method: input.method,
          externalReference: clean(input.externalReference),
          idempotencyKey: input.idempotencyKey,
          collectedByMembershipId: principal.membershipId,
          collectedByUserId: principal.userId,
        },
      });
      const updated = await transaction.clinicVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        data: {
          consultationPaymentStatus: "PAID",
          consultationPaymentMethod: input.method,
          consultationPaidAt: new Date(),
          consultationCollectedById: principal.membershipId,
          status: "WAITING_FOR_DOCTOR",
        },
        include: clinicVisitInclude,
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "CONSULTATION_PAYMENT_RECORDED",
          entityType: "clinical_payment",
          entityId: updated.clinicalPayments.at(-1)?.id ?? null,
          after: {
            visitId,
            receiptNumber,
            amount: visit.consultationFee.toFixed(4),
            method: input.method,
          },
        },
      });
      return updated;
    });
  }

  async saveAssessment(
    principal: AuthenticatedPrincipal,
    visitId: string,
    input: ClinicalAssessmentInput,
    requestId?: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, principal);
      const visit = await transaction.clinicVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "CLINIC_VISIT_NOT_FOUND",
          message: "Clinic visit not found",
        });
      requireDoctorAccess(principal, visit);
      if (visit.consultationPaymentStatus !== "PAID")
        throw new AppError({
          statusCode: 409,
          code: "CONSULTATION_PAYMENT_REQUIRED",
          message: "Consultation fee must be paid before examination",
        });
      if (["COMPLETED", "CANCELLED"].includes(visit.status))
        throw new AppError({
          statusCode: 409,
          code: "VISIT_CLOSED",
          message: "This visit can no longer be examined",
        });

      await transaction.clinicalAssessment.upsert({
        where: {
          tenantId_clinicVisitId: {
            tenantId: principal.tenantId,
            clinicVisitId: visitId,
          },
        },
        create: {
          tenantId: principal.tenantId,
          clinicVisitId: visitId,
          chiefComplaint: input.chiefComplaint.trim(),
          historyPresentIllness: clean(input.historyPresentIllness),
          pastMedicalHistory: clean(input.pastMedicalHistory),
          pastSurgicalHistory: clean(input.pastSurgicalHistory),
          currentMedicines: clean(input.currentMedicines),
          allergies: clean(input.allergies),
          symptoms: jsonValue(input.symptoms),
          vitalSigns: jsonValue(input.vitalSigns),
          physicalExamination: jsonValue(input.physicalExamination),
          examinationNotes: clean(input.examinationNotes),
          provisionalDiagnosis: clean(input.provisionalDiagnosis),
          createdByMembershipId: principal.membershipId,
          updatedByMembershipId: principal.membershipId,
        },
        update: {
          chiefComplaint: input.chiefComplaint.trim(),
          historyPresentIllness: clean(input.historyPresentIllness),
          pastMedicalHistory: clean(input.pastMedicalHistory),
          pastSurgicalHistory: clean(input.pastSurgicalHistory),
          currentMedicines: clean(input.currentMedicines),
          allergies: clean(input.allergies),
          symptoms: jsonValue(input.symptoms),
          vitalSigns: jsonValue(input.vitalSigns),
          physicalExamination: jsonValue(input.physicalExamination),
          examinationNotes: clean(input.examinationNotes),
          provisionalDiagnosis: clean(input.provisionalDiagnosis),
          updatedByMembershipId: principal.membershipId,
        },
      });
      if (input.provisionalDiagnosis?.trim()) {
        await transaction.diagnosis.deleteMany({
          where: {
            tenantId: principal.tenantId,
            clinicVisitId: visitId,
            type: "PROVISIONAL",
          },
        });
        await transaction.diagnosis.create({
          data: {
            tenantId: principal.tenantId,
            clinicVisitId: visitId,
            type: "PROVISIONAL",
            description: input.provisionalDiagnosis.trim(),
            recordedByMembershipId: principal.membershipId,
          },
        });
      }
      await transaction.clinicVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        data: {
          assignedDoctorMembershipId: visit.assignedDoctorMembershipId ?? principal.membershipId,
          chiefComplaint: input.chiefComplaint.trim(),
          history: clean(input.historyPresentIllness),
          examination: clean(input.examinationNotes),
          diagnosis: clean(input.provisionalDiagnosis),
          doctorNotes: clean(input.examinationNotes),
          status: ["LAB_RESULTS_READY", "RESULTS_READY"].includes(visit.status)
            ? "DOCTOR_REVIEW"
            : "IN_EXAMINATION",
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "CLINICAL_ASSESSMENT_SAVED",
          entityType: "clinic_visit",
          entityId: visitId,
          metadata: {
            symptomCount: input.symptoms.length,
            hasVitals: Object.keys(input.vitalSigns).length > 0,
          },
        },
      });
      return transaction.clinicVisit.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: clinicVisitInclude,
      });
    });
  }

  async requestLabTests(
    principal: AuthenticatedPrincipal,
    visitId: string,
    input: LabRequestInput,
    requestId?: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, principal);
      const visit = await transaction.clinicVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: { clinicalAssessment: true },
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "CLINIC_VISIT_NOT_FOUND",
          message: "Clinic visit not found",
        });
      requireDoctorAccess(principal, visit);
      if (!visit.clinicalAssessment)
        throw new AppError({
          statusCode: 409,
          code: "CLINICAL_ASSESSMENT_REQUIRED",
          message: "Save the patient examination before requesting lab tests",
        });
      const uniqueTestIds = [...new Set(input.testIds)];
      if (!uniqueTestIds.length)
        throw new AppError({
          statusCode: 400,
          code: "LAB_TEST_REQUIRED",
          message: "Choose at least one laboratory test",
        });
      const tests = await transaction.labTest.findMany({
        where: { tenantId: principal.tenantId, id: { in: uniqueTestIds }, active: true },
        include: { category: true },
      });
      if (tests.length !== uniqueTestIds.length)
        throw new AppError({
          statusCode: 400,
          code: "INVALID_LAB_TESTS",
          message: "Choose active laboratory tests from this tenant",
        });
      const subtotal = tests.reduce((sum, test) => sum + parseMoney(test.price.toString()), 0n);
      const labVisit = await transaction.labVisit.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          patientId: visit.patientId,
          clinicVisitId: visit.id,
          visitNumber:
            "LAB-" +
            new Date().toISOString().slice(0, 10).replaceAll("-", "") +
            "-" +
            randomUUID().slice(0, 8).toUpperCase(),
          status: "REGISTERED",
          clinicalNotes: clean(input.clinicalNotes),
          priority: input.priority,
          requestedByMembershipId: principal.membershipId,
          sampleType:
            tests
              .map((test) => test.sampleType)
              .filter(Boolean)
              .join(", ") || null,
          subtotal: formatMoney(subtotal),
          total: formatMoney(subtotal),
          registeredByMembershipId: principal.membershipId,
          tests: {
            create: tests.map((test) => ({
              labTestId: test.id,
              testName: test.name,
              categoryName: test.category.name,
              price: test.price,
              resultType: test.resultType,
              unit: test.unit,
              referenceRange: test.referenceRange,
            })),
          },
        },
      });
      await transaction.clinicVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        data: {
          consultationCompletedAt: new Date(),
          status: subtotal > 0n ? "AWAITING_LAB_PAYMENT" : "WAITING_FOR_SAMPLE",
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "LAB_ORDER_REQUESTED",
          entityType: "lab_visit",
          entityId: labVisit.id,
          metadata: { clinicVisitId: visitId, testCount: tests.length, priority: input.priority },
        },
      });
      return transaction.clinicVisit.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: clinicVisitInclude,
      });
    });
  }

  async recordDiagnoses(
    principal: AuthenticatedPrincipal,
    visitId: string,
    type: DiagnosisType,
    diagnoses: Array<{ description: string; code?: string | undefined }>,
    requestId?: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, principal);
      const visit = await transaction.clinicVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: { labVisits: { include: { tests: true } } },
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "CLINIC_VISIT_NOT_FOUND",
          message: "Clinic visit not found",
        });
      requireDoctorAccess(principal, visit);
      if (
        type === "FINAL" &&
        visit.labVisits.some((lab) => lab.tests.some((test) => test.resultStatus === "PENDING"))
      )
        throw new AppError({
          statusCode: 409,
          code: "LAB_RESULTS_PENDING",
          message: "Complete requested laboratory results before final diagnosis",
        });
      await transaction.diagnosis.deleteMany({
        where: { tenantId: principal.tenantId, clinicVisitId: visitId, type },
      });
      await transaction.diagnosis.createMany({
        data: diagnoses.map((diagnosis) => ({
          tenantId: principal.tenantId,
          clinicVisitId: visitId,
          type,
          description: diagnosis.description.trim(),
          code: clean(diagnosis.code),
          recordedByMembershipId: principal.membershipId,
        })),
      });
      await transaction.clinicVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        data: {
          ...(type === "FINAL"
            ? {
                diagnosis: diagnoses.map((item) => item.description.trim()).join("; "),
                status: "DOCTOR_REVIEW" as const,
              }
            : {}),
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: type === "FINAL" ? "FINAL_DIAGNOSIS_RECORDED" : "DIAGNOSIS_RECORDED",
          entityType: "clinic_visit",
          entityId: visitId,
          metadata: { type, count: diagnoses.length },
        },
      });
      return transaction.clinicVisit.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: clinicVisitInclude,
      });
    });
  }
  async completeDoctorReview(
    principal: AuthenticatedPrincipal,
    visitId: string,
    requestId?: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, principal);
      const visit = await transaction.clinicVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: {
          clinicalAssessment: true,
          diagnoses: true,
          labVisits: { include: { tests: true } },
        },
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "CLINIC_VISIT_NOT_FOUND",
          message: "Clinic visit not found",
        });
      requireDoctorAccess(principal, visit);
      if (visit.status === "COMPLETED") {
        return transaction.clinicVisit.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
          include: clinicVisitInclude,
        });
      }
      if (!visit.clinicalAssessment)
        throw new AppError({
          statusCode: 409,
          code: "CONSULTATION_REQUIRED",
          message: "Save the clinical assessment and examination before completing the review",
        });
      const pendingResults = visit.labVisits.some((lab) =>
        lab.tests.some((test) => test.resultStatus === "PENDING"),
      );
      if (pendingResults)
        throw new AppError({
          statusCode: 409,
          code: "LAB_RESULTS_PENDING",
          message: "All requested laboratory results must be completed before doctor review",
        });
      if (!visit.diagnoses.some((diagnosis) => diagnosis.type === "FINAL"))
        throw new AppError({
          statusCode: 409,
          code: "FINAL_DIAGNOSIS_REQUIRED",
          message: "Record at least one final diagnosis before completing the doctor review",
        });
      const completed = await transaction.clinicVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          consultationCompletedAt: visit.consultationCompletedAt ?? new Date(),
        },
        include: clinicVisitInclude,
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "DOCTOR_REVIEW_COMPLETED",
          entityType: "clinic_visit",
          entityId: visitId,
          after: { status: "COMPLETED" },
        },
      });
      return completed;
    });
  }

  async patientHistory(principal: AuthenticatedPrincipal, patientId: string) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const patient = await transaction.patient.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: patientId } },
      });
      if (!patient)
        throw new AppError({
          statusCode: 404,
          code: "PATIENT_NOT_FOUND",
          message: "Patient not found",
        });
      const visits = await transaction.clinicVisit.findMany({
        where: { tenantId: principal.tenantId, patientId },
        include: {
          diagnoses: true,
          labVisits: {
            include: { tests: true },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return { patient, visits };
    });
  }
  async collectSample(
    principal: AuthenticatedPrincipal,
    visitId: string,
    labVisitId: string,
    input: {
      sampleType?: string | undefined;
      sampleId?: string | undefined;
      sampleNotes?: string | undefined;
    } = {},
    requestId?: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, principal);
      const lab = await transaction.labVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: labVisitId } },
      });
      if (!lab || lab.clinicVisitId !== visitId || !canAccessBranch(principal, lab.branchId))
        throw new AppError({
          statusCode: 404,
          code: "LAB_VISIT_NOT_FOUND",
          message: "Lab order not found",
        });
      if (parseMoney(lab.amountPaid.toString()) < parseMoney(lab.total.toString()))
        throw new AppError({
          statusCode: 409,
          code: "LAB_PAYMENT_REQUIRED",
          message: "Lab fee must be paid in full before collecting the sample",
        });
      await transaction.labVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: labVisitId } },
        data: {
          sampleStatus: "COLLECTED",
          sampleCollectedAt: new Date(),
          sampleCollectedById: principal.membershipId,
          sampleType: clean(input.sampleType) ?? lab.sampleType,
          sampleId: clean(input.sampleId),
          sampleNotes: clean(input.sampleNotes),
          status: "RESULTS_PENDING",
        },
      });
      const updated = await transaction.clinicVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        data: { status: "LAB_IN_PROGRESS" },
        include: clinicVisitInclude,
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: lab.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "LAB_SAMPLE_COLLECTED",
          entityType: "lab_visit",
          entityId: labVisitId,
          metadata: { sampleType: clean(input.sampleType) ?? lab.sampleType },
        },
      });
      return updated;
    });
  }
}

export const clinicService = new ClinicService();
