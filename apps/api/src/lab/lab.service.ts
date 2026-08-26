import { randomUUID } from "node:crypto";
import {
  Prisma,
  type AllergyStatus,
  type EstimatedAgeUnit,
  type LabInterpretation,
  type LabResultStatus,
  type LabResultType,
} from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext, withTenantContext } from "../database/tenant-context.js";
import { nextDocumentNumber } from "../database/document-number.js";
import { AppError } from "../errors/app-error.js";
import { parseMoney, formatMoney } from "../finance/money.js";
import { canAccessBranch } from "../middleware/authorization.js";
import type { CanonicalPaymentMethod } from "../payments/payment-methods.js";

export interface PatientInput {
  name: string;
  sex: string;
  dateOfBirth?: Date | undefined;
  estimatedAgeValue?: number | undefined;
  estimatedAgeUnit?: EstimatedAgeUnit | undefined;
  allergyStatus: AllergyStatus;
  phone?: string | undefined;
  address?: string | undefined;
  emergencyContactName?: string | undefined;
  emergencyContactPhone?: string | undefined;
  bloodGroup?: string | undefined;
  allergies?: string | undefined;
  notes?: string | undefined;
}

export interface LabTestInput {
  categoryId: string;
  code?: string | undefined;
  name: string;
  description?: string | undefined;
  price: string;
  sampleType?: string | undefined;
  resultType: LabResultType;
  unit?: string | undefined;
  referenceRange?: string | undefined;
  resultOptions?: Prisma.InputJsonValue | undefined;
  panelComponents?: Prisma.InputJsonValue | undefined;
}

export interface VisitInput {
  branchId: string;
  patientId: string;
  testIds: string[];
  discount: string;
  paymentTiming: "NOW" | "LATER";
  amountPaid: string;
  paymentMethod?: CanonicalPaymentMethod | undefined;
  paymentReference?: string | undefined;
  clinicalNotes?: string | undefined;
}

export interface LabPaymentInput {
  amount: string;
  discount?: string | undefined;
  method: CanonicalPaymentMethod;
  externalReference?: string | undefined;
  notes?: string | undefined;
  idempotencyKey: string;
}

function text(value: string | undefined) {
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

const visitInclude = {
  patient: true,
  tests: { include: { labTest: true }, orderBy: { categoryName: "asc" as const } },
  payments: { orderBy: { createdAt: "asc" as const } },
};

export class LabService {
  async categories(principal: AuthenticatedPrincipal) {
    return withTenantContext(prisma, principal, (transaction) =>
      transaction.labCategory.findMany({
        where: { tenantId: principal.tenantId },
        include: { tests: { orderBy: { name: "asc" } } },
        orderBy: { name: "asc" },
      }),
    );
  }

  async createCategory(principal: AuthenticatedPrincipal, name: string) {
    return withTenantContext(prisma, principal, (transaction) =>
      transaction.labCategory.create({ data: { tenantId: principal.tenantId, name: name.trim() } }),
    );
  }

  async updateCategory(
    principal: AuthenticatedPrincipal,
    categoryId: string,
    input: { name: string; active: boolean },
  ) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const found = await transaction.labCategory.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: categoryId } },
      });
      if (!found)
        throw new AppError({
          statusCode: 404,
          code: "LAB_CATEGORY_NOT_FOUND",
          message: "Lab category not found",
        });
      return transaction.labCategory.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: categoryId } },
        data: { name: input.name.trim(), active: input.active },
      });
    });
  }

  async archiveCategory(principal: AuthenticatedPrincipal, categoryId: string) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const category = await transaction.labCategory.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: categoryId } },
      });
      if (!category)
        throw new AppError({
          statusCode: 404,
          code: "LAB_CATEGORY_NOT_FOUND",
          message: "Lab category not found",
        });
      await transaction.labTest.updateMany({
        where: { tenantId: principal.tenantId, categoryId },
        data: { active: false },
      });
      return transaction.labCategory.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: categoryId } },
        data: { active: false },
      });
    });
  }

  async createTest(principal: AuthenticatedPrincipal, input: LabTestInput) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const category = await transaction.labCategory.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: input.categoryId } },
      });
      if (!category)
        throw new AppError({
          statusCode: 404,
          code: "LAB_CATEGORY_NOT_FOUND",
          message: "Lab category not found",
        });
      return transaction.labTest.create({
        data: {
          tenantId: principal.tenantId,
          categoryId: input.categoryId,
          code: input.code?.trim().toUpperCase() ?? "LT-" + randomUUID().slice(0, 8).toUpperCase(),
          name: input.name.trim(),
          description: text(input.description),
          price: formatMoney(parseMoney(input.price, "lab test price")),
          sampleType: text(input.sampleType),
          resultType: input.resultType,
          unit: text(input.unit),
          referenceRange: text(input.referenceRange),
          ...(input.resultOptions !== undefined ? { resultOptions: input.resultOptions } : {}),
          ...(input.panelComponents !== undefined
            ? { panelComponents: input.panelComponents }
            : {}),
        },
      });
    });
  }

  async updateTest(
    principal: AuthenticatedPrincipal,
    testId: string,
    input: LabTestInput & { active: boolean },
  ) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const found = await transaction.labTest.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: testId } },
      });
      if (!found)
        throw new AppError({
          statusCode: 404,
          code: "LAB_TEST_NOT_FOUND",
          message: "Lab test not found",
        });
      const category = await transaction.labCategory.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: input.categoryId } },
      });
      if (!category)
        throw new AppError({
          statusCode: 404,
          code: "LAB_CATEGORY_NOT_FOUND",
          message: "Lab category not found",
        });
      return transaction.labTest.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: testId } },
        data: {
          categoryId: input.categoryId,
          code: input.code?.trim().toUpperCase() ?? "LT-" + randomUUID().slice(0, 8).toUpperCase(),
          name: input.name.trim(),
          description: text(input.description),
          price: formatMoney(parseMoney(input.price, "lab test price")),
          sampleType: text(input.sampleType),
          resultType: input.resultType,
          unit: text(input.unit),
          referenceRange: text(input.referenceRange),
          ...(input.resultOptions !== undefined ? { resultOptions: input.resultOptions } : {}),
          ...(input.panelComponents !== undefined
            ? { panelComponents: input.panelComponents }
            : {}),
          active: input.active,
        },
      });
    });
  }

  async archiveTest(principal: AuthenticatedPrincipal, testId: string) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const found = await transaction.labTest.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: testId } },
      });
      if (!found)
        throw new AppError({
          statusCode: 404,
          code: "LAB_TEST_NOT_FOUND",
          message: "Lab test not found",
        });
      return transaction.labTest.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: testId } },
        data: { active: false },
      });
    });
  }

  async patients(principal: AuthenticatedPrincipal, search?: string) {
    return withTenantContext(prisma, principal, (transaction) => {
      const q = search?.trim();
      return transaction.patient.findMany({
        where: {
          tenantId: principal.tenantId,
          ...(q
            ? {
                OR: [
                  { patientNumber: { contains: q, mode: "insensitive" } },
                  { name: { contains: q, mode: "insensitive" } },
                  { phone: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: { _count: { select: { visits: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
    });
  }

  async createPatient(principal: AuthenticatedPrincipal, input: PatientInput) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const patientNumber = await nextDocumentNumber(
        transaction,
        principal.tenantId,
        "PATIENT",
        "PT/P",
      );
      return transaction.patient.create({
        data: {
          tenantId: principal.tenantId,
          patientNumber,
          name: input.name.trim(),
          sex: input.sex.trim(),
          dateOfBirth: input.dateOfBirth ?? null,
          estimatedAgeValue: input.estimatedAgeValue ?? null,
          estimatedAgeUnit: input.estimatedAgeUnit ?? null,
          allergyStatus: input.allergyStatus,
          phone: text(input.phone),
          address: text(input.address),
          emergencyContactName: text(input.emergencyContactName),
          emergencyContactPhone: text(input.emergencyContactPhone),
          bloodGroup: text(input.bloodGroup),
          allergies: text(input.allergies),
          notes: text(input.notes),
        },
      });
    });
  }

  async visits(principal: AuthenticatedPrincipal, branchId: string) {
    requireBranch(principal, branchId);
    return withTenantContext(prisma, { ...principal, branchId }, async (transaction) => {
      const visits = await transaction.labVisit.findMany({
        where: { tenantId: principal.tenantId, branchId },
        include: visitInclude,
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      return principal.role === "LAB_TECHNICIAN"
        ? visits.filter((visit) => !visit.amountPaid.lessThan(visit.total))
        : visits;
    });
  }

  async visit(principal: AuthenticatedPrincipal, visitId: string) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const visit = await transaction.labVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: visitInclude,
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "LAB_VISIT_NOT_FOUND",
          message: "Lab visit not found",
        });
      if (principal.role === "LAB_TECHNICIAN" && visit.amountPaid.lessThan(visit.total))
        throw new AppError({
          statusCode: 404,
          code: "LAB_VISIT_NOT_FOUND",
          message: "Lab visit not found",
        });
      return visit;
    });
  }

  async createVisit(principal: AuthenticatedPrincipal, input: VisitInput, requestId?: string) {
    requireBranch(principal, input.branchId);
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
      const uniqueTestIds = [...new Set(input.testIds)];
      const tests = await transaction.labTest.findMany({
        where: { tenantId: principal.tenantId, id: { in: uniqueTestIds }, active: true },
        include: { category: true },
      });
      if (!tests.length || tests.length !== uniqueTestIds.length)
        throw new AppError({
          statusCode: 400,
          code: "INVALID_LAB_TESTS",
          message: "Choose one or more active lab tests",
        });
      const subtotal = tests.reduce((sum, test) => sum + parseMoney(test.price.toString()), 0n);
      const discount = parseMoney(input.discount, "lab discount");
      if (discount > subtotal)
        throw new AppError({
          statusCode: 400,
          code: "LAB_DISCOUNT_EXCEEDS_SUBTOTAL",
          message: "Lab discount cannot exceed subtotal",
        });
      const total = subtotal - discount;
      const paid = parseMoney(input.amountPaid, "lab amount paid");
      if (paid > total)
        throw new AppError({
          statusCode: 400,
          code: "LAB_PAYMENT_EXCEEDS_TOTAL",
          message: "Lab payment cannot exceed total",
        });
      if (paid > 0n && !input.paymentMethod)
        throw new AppError({
          statusCode: 400,
          code: "LAB_PAYMENT_METHOD_REQUIRED",
          message: "Payment method is required",
        });
      if (input.paymentTiming === "NOW" && paid !== total)
        throw new AppError({
          statusCode: 400,
          code: "LAB_PAY_NOW_REQUIRES_FULL_PAYMENT",
          message: "Pay now requires the full lab total",
        });
      if (input.paymentTiming === "LATER" && paid !== 0n)
        throw new AppError({
          statusCode: 400,
          code: "LAB_PAY_LATER_REQUIRES_ZERO_PAYMENT",
          message: "Pay later must be registered without an initial payment",
        });
      const visitNumber = await nextDocumentNumber(
        transaction,
        principal.tenantId,
        "LAB_ORDER",
        "LAB/L",
      );
      const visit = await transaction.labVisit.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          patientId: patient.id,
          visitNumber,
          status: "RESULTS_PENDING",
          clinicalNotes: text(input.clinicalNotes),
          subtotal: formatMoney(subtotal),
          discount: formatMoney(discount),
          total: formatMoney(total),
          amountPaid: formatMoney(paid),
          paymentMethod: input.paymentMethod ?? null,
          registeredByMembershipId: principal.membershipId,
          tests: {
            create: tests.map((test) => ({
              labTestId: test.id,
              testName: test.name,
              categoryName: test.category.name,
              price: test.price,
              sampleType: test.sampleType,
              resultType: test.resultType,
              unit: test.unit,
              referenceRange: test.referenceRange,
            })),
          },
        },
        include: visitInclude,
      });
      if (paid > 0n && input.paymentMethod) {
        await transaction.labPayment.create({
          data: {
            tenantId: principal.tenantId,
            branchId: input.branchId,
            visitId: visit.id,
            amount: formatMoney(paid),
            method: input.paymentMethod,
            externalReference: text(input.paymentReference),
            idempotencyKey: `lab-visit-initial:${visit.id}`,
            collectedByMembershipId: principal.membershipId,
            collectedByUserId: principal.userId,
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
          action: "LAB_VISIT_REGISTERED",
          entityType: "lab_visit",
          entityId: visit.id,
          after: {
            visitNumber: visit.visitNumber,
            patientId: patient.id,
            total: formatMoney(total),
          },
        },
      });
      return visit;
    });
  }

  async addPayment(
    principal: AuthenticatedPrincipal,
    visitId: string,
    input: LabPaymentInput,
    requestId?: string,
  ) {
    const payment = parseMoney(input.amount, "lab payment");
    if (payment <= 0n)
      throw new AppError({
        statusCode: 400,
        code: "LAB_PAYMENT_MUST_BE_POSITIVE",
        message: "Lab payment must be greater than zero",
      });
    return prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, principal);
      const existing = await transaction.labPayment.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: principal.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.visitId !== visitId || existing.amount.toFixed(4) !== formatMoney(payment))
          throw new AppError({
            statusCode: 409,
            code: "IDEMPOTENCY_KEY_REUSED",
            message: "This payment request was already used with different details",
          });
        return transaction.labVisit.findUniqueOrThrow({
          where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
          include: visitInclude,
        });
      }
      await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM public.lab_visits
                   WHERE tenant_id = ${principal.tenantId}::uuid AND id = ${visitId}::uuid
                   FOR UPDATE`,
      );
      const visit = await transaction.labVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "LAB_VISIT_NOT_FOUND",
          message: "Lab visit not found",
        });
      const subtotal = parseMoney(visit.subtotal.toString());
      const paid = parseMoney(visit.amountPaid.toString());
      const currentDiscount = parseMoney(visit.discount.toString());
      const discount =
        input.discount === undefined ? currentDiscount : parseMoney(input.discount, "lab discount");
      if (discount > subtotal)
        throw new AppError({
          statusCode: 400,
          code: "LAB_DISCOUNT_EXCEEDS_SUBTOTAL",
          message: "Lab discount cannot exceed subtotal",
        });
      if (paid > 0n && discount !== currentDiscount)
        throw new AppError({
          statusCode: 409,
          code: "LAB_DISCOUNT_LOCKED_AFTER_PAYMENT",
          message: "Lab discount cannot be changed after a payment has been recorded",
        });
      const total = subtotal - discount;
      if (payment > total - paid)
        throw new AppError({
          statusCode: 400,
          code: "LAB_PAYMENT_EXCEEDS_BALANCE",
          message: "Lab payment cannot exceed the outstanding balance",
        });
      await transaction.labPayment.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          visitId,
          amount: formatMoney(payment),
          method: input.method,
          externalReference: text(input.externalReference),
          notes: text(input.notes),
          idempotencyKey: input.idempotencyKey,
          collectedByMembershipId: principal.membershipId,
          collectedByUserId: principal.userId,
        },
      });
      await transaction.labVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        data: {
          discount: formatMoney(discount),
          total: formatMoney(total),
          amountPaid: formatMoney(paid + payment),
          paymentMethod: input.method,
        },
      });
      if (visit.clinicVisitId) {
        await transaction.clinicalPayment.create({
          data: {
            tenantId: principal.tenantId,
            branchId: visit.branchId,
            patientId: visit.patientId,
            clinicVisitId: visit.clinicVisitId,
            labVisitId: visit.id,
            type: "LAB",
            receiptNumber:
              "RCT-L-" +
              new Date().toISOString().slice(0, 10).replaceAll("-", "") +
              "-" +
              randomUUID().slice(0, 8).toUpperCase(),
            amount: formatMoney(payment),
            method: input.method,
            externalReference: text(input.externalReference),
            idempotencyKey: "lab:" + input.idempotencyKey,
            notes: text(input.notes),
            collectedByMembershipId: principal.membershipId,
            collectedByUserId: principal.userId,
          },
        });
      }
      if (visit.clinicVisitId && paid + payment === total) {
        await transaction.clinicVisit.update({
          where: { tenantId_id: { tenantId: principal.tenantId, id: visit.clinicVisitId } },
          data: { status: "WAITING_FOR_SAMPLE" },
        });
      }
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "LAB_PAYMENT_RECORDED",
          entityType: "lab_visit",
          entityId: visitId,
          after: {
            amount: formatMoney(payment),
            discount: formatMoney(discount),
            method: input.method,
            amountPaid: formatMoney(paid + payment),
            remainingBalance: formatMoney(total - paid - payment),
          },
        },
      });
      return transaction.labVisit.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: visitInclude,
      });
    });
  }

  async markResult(
    principal: AuthenticatedPrincipal,
    visitId: string,
    visitTestId: string,
    input: {
      resultStatus: LabResultStatus;
      resultValue?: string | undefined;
      numericValue?: number | undefined;
      interpretation?: LabInterpretation | undefined;
      resultData?: unknown;
      resultNote?: string | undefined;
    },
  ) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const visit = await transaction.labVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: { tests: { include: { labTest: true } } },
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "LAB_VISIT_NOT_FOUND",
          message: "Lab visit not found",
        });
      const target = visit.tests.find((test) => test.id === visitTestId);
      if (!target)
        throw new AppError({
          statusCode: 404,
          code: "LAB_VISIT_TEST_NOT_FOUND",
          message: "Lab visit test not found",
        });
      if (visit.clinicVisitId && visit.amountPaid.lessThan(visit.total))
        throw new AppError({
          statusCode: 409,
          code: "LAB_PAYMENT_REQUIRED",
          message: "Lab fee must be paid in full before results can be entered",
        });
      if (visit.clinicVisitId && !target.sampleCollectedAt)
        throw new AppError({
          statusCode: 409,
          code: "LAB_SAMPLE_REQUIRED",
          message: "The patient sample must be collected before results can be entered",
        });
      if (target.resultStatus !== "PENDING")
        throw new AppError({
          statusCode: 409,
          code: "LAB_RESULT_AMENDMENT_REQUIRED",
          message: "A completed laboratory result must be changed through the amendment workflow",
        });
      if (input.resultStatus === "PENDING")
        throw new AppError({
          statusCode: 400,
          code: "LAB_RESULT_INCOMPLETE",
          message: "Choose a completed result status",
        });
      if (target.resultType !== "POSITIVE_NEGATIVE" && input.resultStatus !== "COMPLETED")
        throw new AppError({
          statusCode: 400,
          code: "LAB_RESULT_STATUS_INVALID",
          message: "This result type must use the completed status",
        });
      if (target.resultType === "NUMERIC" && input.numericValue === undefined)
        throw new AppError({
          statusCode: 400,
          code: "NUMERIC_RESULT_REQUIRED",
          message: "A numeric result is required before this test can be completed.",
        });
      if (target.resultType === "TEXT" && !input.resultValue?.trim())
        throw new AppError({
          statusCode: 400,
          code: "TEXT_RESULT_REQUIRED",
          message: "Result text is required before this test can be completed.",
        });
      if (target.resultType === "SELECT") {
        const selected = input.resultValue?.trim();
        const configured = Array.isArray(target.labTest.resultOptions)
          ? target.labTest.resultOptions.filter(
              (value): value is string => typeof value === "string",
            )
          : [];
        if (!selected || !configured.includes(selected))
          throw new AppError({
            statusCode: 400,
            code: "SELECT_RESULT_INVALID",
            message: "Select one of the configured result options.",
          });
      }
      if (target.resultType === "PANEL") {
        const result =
          input.resultData &&
          typeof input.resultData === "object" &&
          !Array.isArray(input.resultData)
            ? (input.resultData as Record<string, unknown>)
            : null;
        const components = Array.isArray(target.labTest.panelComponents)
          ? target.labTest.panelComponents
          : [];
        const missing = components.some((component) => {
          if (!component || typeof component !== "object" || Array.isArray(component)) return true;
          const definition = component as Record<string, unknown>;
          const name = typeof definition["name"] === "string" ? definition["name"] : "";
          const required = definition["required"] !== false;
          const value = result?.[name];
          return (
            required &&
            (value === undefined || value === null || (typeof value === "string" && !value.trim()))
          );
        });
        if (!result || components.length === 0 || missing)
          throw new AppError({
            statusCode: 400,
            code: "PANEL_RESULT_REQUIRED",
            message: "All required panel result components must be completed.",
          });
      }
      if (
        target.resultType === "POSITIVE_NEGATIVE" &&
        !["POSITIVE", "NEGATIVE", "INCONCLUSIVE"].includes(input.resultStatus)
      )
        throw new AppError({
          statusCode: 400,
          code: "QUALITATIVE_RESULT_REQUIRED",
          message: "Choose positive, negative or inconclusive",
        });

      await transaction.labVisitTest.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitTestId } },
        data: {
          resultStatus: input.resultStatus,
          resultValue:
            text(input.resultValue) ??
            (target.resultType === "POSITIVE_NEGATIVE" ? input.resultStatus : null),
          numericValue: input.numericValue ?? null,
          interpretation: input.interpretation ?? null,
          ...(input.resultData ? { resultData: jsonValue(input.resultData) } : {}),
          resultNote: text(input.resultNote),
          markedAt: new Date(),
          markedByMembershipId: principal.membershipId,
        },
      });
      const pending = await transaction.labVisitTest.count({
        where: { tenantId: principal.tenantId, visitId, resultStatus: "PENDING" },
      });
      await transaction.labVisit.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        data:
          pending === 0
            ? { status: "COMPLETED", completedAt: new Date() }
            : { status: "RESULTS_PENDING" },
      });
      if (pending === 0 && visit.clinicVisitId) {
        await transaction.clinicVisit.update({
          where: { tenantId_id: { tenantId: principal.tenantId, id: visit.clinicVisitId } },
          data: { status: "LAB_RESULTS_READY" },
        });
      }
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: visit.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          action: pending === 0 ? "LAB_ORDER_COMPLETED" : "LAB_RESULT_RECORDED",
          entityType: "lab_visit_test",
          entityId: visitTestId,
          metadata: {
            visitId,
            resultType: target.resultType,
            interpretation: input.interpretation ?? null,
          },
        },
      });
      return transaction.labVisit.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: visitInclude,
      });
    });
  }
}

export const labService = new LabService();
