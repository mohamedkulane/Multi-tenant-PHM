import type { DebtStatus } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { canAccessBranch } from "../middleware/authorization.js";

export interface DebtService {
  list(principal: AuthenticatedPrincipal, branchId: string): Promise<unknown[]>;
  get(principal: AuthenticatedPrincipal, debtId: string): Promise<unknown>;
}

function currentStatus(
  status: DebtStatus,
  remainingAmount: { comparedTo(value: number): number },
  dueDate: Date,
) {
  if (status === "VOIDED" || remainingAmount.comparedTo(0) === 0) return status;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return dueDate.getTime() < today.getTime() ? "OVERDUE" : "OPEN";
}

export class PrismaDebtService implements DebtService {
  async list(principal: AuthenticatedPrincipal, branchId: string) {
    if (!canAccessBranch(principal, branchId)) {
      throw new AppError({
        statusCode: 403,
        code: "BRANCH_ACCESS_DENIED",
        message: "You do not have access to this branch",
      });
    }
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId,
      },
      async (transaction) => {
        const debts = await transaction.debt.findMany({
          where: { tenantId: principal.tenantId, branchId },
          include: {
            sale: {
              select: {
                invoiceNumber: true,
                customerName: true,
                customerPhone: true,
              },
            },
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
          take: 200,
        });
        return debts.map((debt) => ({
          ...debt,
          status: currentStatus(debt.status, debt.remainingAmount, debt.dueDate),
        }));
      },
    );
  }

  async get(principal: AuthenticatedPrincipal, debtId: string) {
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const debt = await transaction.debt.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: debtId } },
          include: {
            sale: {
              include: {
                payments: { orderBy: { createdAt: "asc" } },
                items: { orderBy: { createdAt: "asc" } },
              },
            },
          },
        });
        if (!debt || !canAccessBranch(principal, debt.branchId)) {
          throw new AppError({
            statusCode: 404,
            code: "DEBT_NOT_FOUND",
            message: "Debt not found",
          });
        }
        return {
          ...debt,
          status: currentStatus(debt.status, debt.remainingAmount, debt.dueDate),
        };
      },
    );
  }
}

export const debtService = new PrismaDebtService();
