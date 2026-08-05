import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";

export interface CustomerInput {
  name: string;
  phone: string;
  address?: string | undefined;
  notes?: string | undefined;
  active?: boolean | undefined;
}

export class CustomerService {
  async list(principal: AuthenticatedPrincipal, search?: string) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const q = search?.trim();
      return transaction.customer.findMany({
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
        include: {
          sales: {
            where: { remainingBalance: { gt: 0 }, status: { not: "VOIDED" } },
            select: { remainingBalance: true },
          },
          _count: { select: { sales: true } },
        },
        orderBy: [{ active: "desc" }, { name: "asc" }],
        take: 500,
      });
    }).then((items) =>
      items.map(({ sales, ...customer }) => ({
        ...customer,
        outstandingBalance: sales.reduce((total, sale) => total + Number(sale.remainingBalance), 0),
      })),
    );
  }

  async get(principal: AuthenticatedPrincipal, customerId: string) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: customerId } },
        include: {
          sales: {
            include: {
              debt: true,
              payments: { orderBy: { createdAt: "asc" } },
              items: { orderBy: { createdAt: "asc" } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });
      if (!customer) {
        throw new AppError({
          statusCode: 404,
          code: "CUSTOMER_NOT_FOUND",
          message: "Customer not found",
        });
      }
      return customer;
    });
  }

  async create(principal: AuthenticatedPrincipal, input: CustomerInput, requestId?: string) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const customer = await transaction.customer.create({
        data: {
          tenantId: principal.tenantId,
          name: input.name.trim(),
          phone: input.phone.trim(),
          address: input.address?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "CUSTOMER_CREATED",
          entityType: "customer",
          entityId: customer.id,
          after: { name: customer.name, phone: customer.phone },
        },
      });
      return customer;
    });
  }

  async update(
    principal: AuthenticatedPrincipal,
    customerId: string,
    input: CustomerInput,
    requestId?: string,
  ) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const before = await transaction.customer.findUnique({
        where: { tenantId_id: { tenantId: principal.tenantId, id: customerId } },
      });
      if (!before) {
        throw new AppError({
          statusCode: 404,
          code: "CUSTOMER_NOT_FOUND",
          message: "Customer not found",
        });
      }
      const customer = await transaction.customer.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: customerId } },
        data: {
          name: input.name.trim(),
          phone: input.phone.trim(),
          address: input.address?.trim() || null,
          notes: input.notes?.trim() || null,
          ...(input.active === undefined ? {} : { active: input.active }),
        },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: "CUSTOMER_UPDATED",
          entityType: "customer",
          entityId: customer.id,
          before: { name: before.name, phone: before.phone, active: before.active },
          after: { name: customer.name, phone: customer.phone, active: customer.active },
        },
      });
      return customer;
    });
  }
}

export const customerService = new CustomerService();
