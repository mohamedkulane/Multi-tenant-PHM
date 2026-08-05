import { randomUUID } from "node:crypto";
import type { LabResultStatus, PaymentMethod } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext, withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { parseMoney, formatMoney } from "../finance/money.js";
import { canAccessBranch } from "../middleware/authorization.js";

export interface PatientInput {
  name: string;
  age: number;
  sex?: string | undefined;
  phone?: string | undefined;
  notes?: string | undefined;
}

export interface VisitInput {
  branchId: string;
  patientId: string;
  testIds: string[];
  discount: string;
  paymentTiming: "NOW" | "LATER";
  amountPaid: string;
  paymentMethod?: PaymentMethod | undefined;
  clinicalNotes?: string | undefined;
}

export interface LabPaymentInput {
  amount: string;
  method: PaymentMethod;
  externalReference?: string | undefined;
  notes?: string | undefined;
  idempotencyKey: string;
}

function text(value: string | undefined) {
  return value?.trim() || null;
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
  tests: { orderBy: { categoryName: "asc" as const } },
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

  async createTest(
    principal: AuthenticatedPrincipal,
    input: { categoryId: string; name: string; price: string },
  ) {
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
          name: input.name.trim(),
          price: formatMoney(parseMoney(input.price, "lab test price")),
        },
      });
    });
  }

  async updateTest(
    principal: AuthenticatedPrincipal,
    testId: string,
    input: { categoryId: string; name: string; price: string; active: boolean },
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
      return transaction.labTest.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: testId } },
        data: {
          categoryId: input.categoryId,
          name: input.name.trim(),
          price: formatMoney(parseMoney(input.price, "lab test price")),
          active: input.active,
        },
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
    return withTenantContext(prisma, principal, (transaction) =>
      transaction.patient.create({
        data: {
          tenantId: principal.tenantId,
          name: input.name.trim(),
          age: input.age,
          sex: text(input.sex),
          phone: text(input.phone),
          notes: text(input.notes),
        },
      }),
    );
  }

  async visits(principal: AuthenticatedPrincipal, branchId: string) {
    requireBranch(principal, branchId);
    return withTenantContext(prisma, { ...principal, branchId }, (transaction) =>
      transaction.labVisit.findMany({
        where: { tenantId: principal.tenantId, branchId },
        include: visitInclude,
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
    );
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
      const visit = await transaction.labVisit.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          patientId: patient.id,
          visitNumber: `LAB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`,
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
      await transaction.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT id FROM public.lab_visits WHERE tenant_id = $1::uuid AND id = $2::uuid FOR UPDATE",
        principal.tenantId,
        visitId,
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
      const total = parseMoney(visit.total.toString());
      const paid = parseMoney(visit.amountPaid.toString());
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
        data: { amountPaid: formatMoney(paid + payment), paymentMethod: input.method },
      });
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
    input: { resultStatus: LabResultStatus; resultNote?: string | undefined },
  ) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const visit = await transaction.labVisit.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: { tests: true },
      });
      if (!visit || !canAccessBranch(principal, visit.branchId))
        throw new AppError({
          statusCode: 404,
          code: "LAB_VISIT_NOT_FOUND",
          message: "Lab visit not found",
        });
      if (!visit.tests.some((test) => test.id === visitTestId))
        throw new AppError({
          statusCode: 404,
          code: "LAB_VISIT_TEST_NOT_FOUND",
          message: "Lab visit test not found",
        });
      await transaction.labVisitTest.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitTestId } },
        data: {
          resultStatus: input.resultStatus,
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
      return transaction.labVisit.findUniqueOrThrow({
        where: { tenantId_id: { tenantId: principal.tenantId, id: visitId } },
        include: visitInclude,
      });
    });
  }
}

export const labService = new LabService();
