import { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { canAccessBranch } from "../middleware/authorization.js";
import { formatMoney, parseMoney } from "./money.js";

export interface CreateExpenseInput {
  branchId: string;
  categoryId: string;
  title: string;
  amount: string;
  expenseDate: Date;
  note?: string | undefined;
  idempotencyKey: string;
}

export interface ExpenseService {
  listCategories(principal: AuthenticatedPrincipal, includeInactive?: boolean): Promise<unknown[]>;
  createCategory(
    principal: AuthenticatedPrincipal,
    name: string,
    requestId?: string,
  ): Promise<unknown>;
  updateCategory(
    principal: AuthenticatedPrincipal,
    categoryId: string,
    input: { name?: string | undefined; active?: boolean | undefined },
    requestId?: string,
  ): Promise<unknown>;
  list(principal: AuthenticatedPrincipal, branchId: string): Promise<unknown[]>;
  create(
    principal: AuthenticatedPrincipal,
    input: CreateExpenseInput,
    requestId?: string,
  ): Promise<unknown>;
  void(
    principal: AuthenticatedPrincipal,
    branchId: string,
    expenseId: string,
    reason: string,
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

async function context<T>(
  principal: AuthenticatedPrincipal,
  branchId: string | undefined,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (transaction) => {
    await setTransactionContext(transaction, {
      tenantId: principal.tenantId,
      userId: principal.userId,
      membershipId: principal.membershipId,
      ...(branchId ? { branchId } : {}),
    });
    return operation(transaction);
  });
}

function optionalText(value: string | undefined) {
  return value?.trim() || undefined;
}

export class PrismaExpenseService implements ExpenseService {
  async listCategories(principal: AuthenticatedPrincipal, includeInactive = false) {
    return context(principal, undefined, (transaction) =>
      transaction.expenseCategory.findMany({
        where: { tenantId: principal.tenantId, ...(includeInactive ? {} : { active: true }) },
        orderBy: { name: "asc" },
      }),
    );
  }

  async createCategory(principal: AuthenticatedPrincipal, name: string, requestId?: string) {
    return context(principal, undefined, async (transaction) => {
      const category = await transaction.expenseCategory.create({
        data: { tenantId: principal.tenantId, name: name.trim() },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "EXPENSE_CATEGORY_CREATED",
          entityType: "expense_category",
          entityId: category.id,
          after: { name: category.name },
        },
      });
      return category;
    });
  }

  async updateCategory(
    principal: AuthenticatedPrincipal,
    categoryId: string,
    input: { name?: string | undefined; active?: boolean | undefined },
    requestId?: string,
  ) {
    return context(principal, undefined, async (transaction) => {
      const current = await transaction.expenseCategory.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: categoryId } },
      });
      if (!current) {
        throw new AppError({
          statusCode: 404,
          code: "EXPENSE_CATEGORY_NOT_FOUND",
          message: "Expense category not found",
        });
      }
      const category = await transaction.expenseCategory.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: categoryId } },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: category.active ? "EXPENSE_CATEGORY_UPDATED" : "EXPENSE_CATEGORY_DEACTIVATED",
          entityType: "expense_category",
          entityId: category.id,
          before: { name: current.name, active: current.active },
          after: { name: category.name, active: category.active },
        },
      });
      return category;
    });
  }

  async list(principal: AuthenticatedPrincipal, branchId: string) {
    requireBranchAccess(principal, branchId);
    return context(principal, branchId, (transaction) =>
      transaction.expense.findMany({
        where: { tenantId: principal.tenantId, branchId },
        include: { category: true },
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
        take: 200,
      }),
    );
  }

  async create(principal: AuthenticatedPrincipal, input: CreateExpenseInput, requestId?: string) {
    requireBranchAccess(principal, input.branchId);
    const amount = parseMoney(input.amount);
    if (amount === 0n) {
      throw new AppError({
        statusCode: 400,
        code: "INVALID_EXPENSE_AMOUNT",
        message: "Expense amount must be greater than zero",
      });
    }
    return context(principal, input.branchId, async (transaction) => {
      const replay = await transaction.expense.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: principal.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (replay) return replay;
      const category = await transaction.expenseCategory.findUnique({
        where: {
          tenantId_id: { tenantId: principal.tenantId, id: input.categoryId },
        },
      });
      if (!category?.active) {
        throw new AppError({
          statusCode: 404,
          code: "EXPENSE_CATEGORY_NOT_FOUND",
          message: "Expense category not found",
        });
      }
      const expense = await transaction.expense.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          categoryId: input.categoryId,
          title: input.title.trim(),
          amount: formatMoney(amount),
          expenseDate: input.expenseDate,
          note: optionalText(input.note) ?? null,
          idempotencyKey: input.idempotencyKey,
          createdByMembershipId: principal.membershipId,
          createdByUserId: principal.userId,
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId: input.branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "EXPENSE_POSTED",
          entityType: "expense",
          entityId: expense.id,
          after: {
            title: expense.title,
            categoryId: expense.categoryId,
            amount: formatMoney(amount),
          },
        },
      });
      return expense;
    });
  }

  async void(
    principal: AuthenticatedPrincipal,
    branchId: string,
    expenseId: string,
    reason: string,
    requestId?: string,
  ) {
    requireBranchAccess(principal, branchId);
    return context(principal, branchId, async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT set_config('app.finance_write', 'true', true)`);
      const expense = await transaction.expense.findUnique({
        where: {
          tenantId_id: { tenantId: principal.tenantId, id: expenseId },
        },
      });
      if (!expense || expense.branchId !== branchId) {
        throw new AppError({
          statusCode: 404,
          code: "EXPENSE_NOT_FOUND",
          message: "Expense not found",
        });
      }
      if (expense.status === "VOIDED") return expense;
      const updated = await transaction.expense.update({
        where: {
          tenantId_id: { tenantId: principal.tenantId, id: expenseId },
        },
        data: {
          status: "VOIDED",
          voidedAt: new Date(),
          voidedByMembershipId: principal.membershipId,
          voidReason: reason.trim(),
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          branchId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "EXPENSE_VOIDED",
          entityType: "expense",
          entityId: expenseId,
          before: { status: expense.status },
          after: { status: updated.status, reason },
        },
      });
      return updated;
    });
  }
}

export const expenseService = new PrismaExpenseService();
