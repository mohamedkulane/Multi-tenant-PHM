import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";

export interface SupplierInput {
  name: string;
  contactPerson?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  address?: string | undefined;
  notes?: string | undefined;
  active?: boolean | undefined;
}

export class SupplierService {
  async list(principal: AuthenticatedPrincipal) {
    return withTenantContext(prisma, principal, (transaction) =>
      transaction.supplier.findMany({
        where: { tenantId: principal.tenantId },
        include: { _count: { select: { receipts: true } } },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      }),
    );
  }

  async save(
    principal: AuthenticatedPrincipal,
    supplierId: string | undefined,
    input: SupplierInput,
    requestId?: string,
  ) {
    return withTenantContext(prisma, principal, async (transaction) => {
      const data = {
        name: input.name.trim(),
        contactPerson: input.contactPerson?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim().toLowerCase() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        ...(input.active === undefined ? {} : { active: input.active }),
      };
      if (supplierId) {
        const exists = await transaction.supplier.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: supplierId } },
        });
        if (!exists)
          throw new AppError({
            statusCode: 404,
            code: "SUPPLIER_NOT_FOUND",
            message: "Supplier not found",
          });
      }
      const supplier = supplierId
        ? await transaction.supplier.update({
            where: { tenantId_id: { tenantId: principal.tenantId, id: supplierId } },
            data,
          })
        : await transaction.supplier.create({ data: { tenantId: principal.tenantId, ...data } });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          ...(requestId ? { requestId } : {}),
          action: supplierId ? "SUPPLIER_UPDATED" : "SUPPLIER_CREATED",
          entityType: "supplier",
          entityId: supplier.id,
          after: { name: supplier.name, active: supplier.active },
        },
      });
      return supplier;
    });
  }
}

export const supplierService = new SupplierService();
