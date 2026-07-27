import { randomUUID } from "node:crypto";
import { MembershipStatus, Prisma, TenantRole, TenantStatus } from "@prisma/client";
import { hashPassword } from "../auth/password.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../errors/app-error.js";
import type { PlatformPrincipal } from "./platform-auth.types.js";

export interface OnboardTenantInput {
  name: string;
  slug: string;
  timezone: string;
  currencyCode: string;
  planCode: string;
  branchName: string;
  branchCode: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerUsername: string;
  ownerPassword: string;
}

export interface BrandingInput {
  displayName: string;
  logoUrl?: string | undefined;
  primaryColor: string;
  accentColor: string;
  invoiceFooter?: string | undefined;
  supportContact?: string | undefined;
}

export interface PlatformAdminService {
  listPlans(principal: PlatformPrincipal): Promise<unknown[]>;
  upsertPlan(
    principal: PlatformPrincipal,
    code: string,
    input: {
      name: string;
      description?: string | undefined;
      limits: Record<string, number>;
      active?: boolean | undefined;
    },
  ): Promise<unknown>;
  listTenants(principal: PlatformPrincipal): Promise<unknown[]>;
  getTenant(principal: PlatformPrincipal, tenantId: string): Promise<unknown>;
  onboard(
    principal: PlatformPrincipal,
    input: OnboardTenantInput,
    requestId?: string,
  ): Promise<unknown>;
  setStatus(
    principal: PlatformPrincipal,
    tenantId: string,
    status: TenantStatus,
    reason: string,
    requestId?: string,
  ): Promise<unknown>;
  setPlan(
    principal: PlatformPrincipal,
    tenantId: string,
    planCode: string,
    overrides: Record<string, number>,
    requestId?: string,
  ): Promise<unknown>;
  setBranding(
    principal: PlatformPrincipal,
    tenantId: string,
    input: BrandingInput,
    requestId?: string,
  ): Promise<unknown>;
  audit(principal: PlatformPrincipal, take?: number): Promise<unknown[]>;
}

async function setPlatformWorkflow(
  transaction: Prisma.TransactionClient,
  principal: PlatformPrincipal,
  tenantId?: string,
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT
      set_config('app.user_id', ${principal.userId}, true),
      set_config('app.tenant_id', ${tenantId ?? ""}, true),
      set_config('app.platform_admin', 'true', true)
    `,
  );
}

const planLimitKeys = ["maxBranches", "maxUsers", "maxProducts", "maxMonthlySales"] as const;

function validateLimits(limits: Record<string, number>, requireAll: boolean) {
  const validKeys = new Set<string>(planLimitKeys);
  const entries = Object.entries(limits);
  const invalid =
    entries.some(([key, value]) => !validKeys.has(key) || !Number.isInteger(value) || value < 1) ||
    (requireAll && planLimitKeys.some((key) => limits[key] === undefined));
  if (invalid) {
    throw new AppError({
      statusCode: 400,
      code: "PLAN_LIMITS_INVALID",
      message: "Plan limits must contain valid positive values for supported resources",
    });
  }
}
function requireSuperAdmin(principal: PlatformPrincipal) {
  if (principal.role !== "SUPER_ADMIN") {
    throw new AppError({
      statusCode: 403,
      code: "PLATFORM_PERMISSION_DENIED",
      message: "Super administrator permission is required",
    });
  }
}

async function readTenant(principal: PlatformPrincipal, tenantId: string) {
  return prisma.$transaction(async (transaction) => {
    await setPlatformWorkflow(transaction, principal, tenantId);
    const tenant = await transaction.tenant.findUnique({
      where: { id: tenantId },
      include: {
        branches: { orderBy: { createdAt: "asc" } },
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          select: { id: true },
        },
      },
    });
    if (!tenant) return null;
    const [subscription, branding] = await Promise.all([
      transaction.tenantSubscription.findUnique({ where: { tenantId } }),
      transaction.tenantBranding.findUnique({ where: { tenantId } }),
    ]);
    return {
      ...tenant,
      activeUsers: tenant.memberships.length,
      subscription,
      branding,
    };
  });
}

export class PrismaPlatformAdminService implements PlatformAdminService {
  async listPlans(principal: PlatformPrincipal) {
    void principal;
    return prisma.plan.findMany({ orderBy: { code: "asc" } });
  }

  async upsertPlan(
    principal: PlatformPrincipal,
    code: string,
    input: {
      name: string;
      description?: string | undefined;
      limits: Record<string, number>;
      active?: boolean | undefined;
    },
  ) {
    requireSuperAdmin(principal);
    validateLimits(input.limits, true);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const plan = await transaction.plan.upsert({
        where: { code },
        create: {
          code,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          limits: input.limits,
          active: input.active ?? true,
        },
        update: {
          name: input.name.trim(),
          description: input.description?.trim() || null,
          limits: input.limits,
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "PLAN_UPSERTED",
          entityType: "plan",
          entityId: code,
          after: { name: plan.name, limits: plan.limits, active: plan.active },
        },
      });
      return plan;
    });
  }

  async listTenants(principal: PlatformPrincipal) {
    const directory = await prisma.tenantLoginDirectory.findMany({
      orderBy: { slug: "asc" },
      take: 500,
    });
    const tenants = await Promise.all(
      directory.map(({ tenantId }) => readTenant(principal, tenantId)),
    );
    return tenants.filter((tenant) => tenant !== null);
  }

  async getTenant(principal: PlatformPrincipal, tenantId: string) {
    const tenant = await readTenant(principal, tenantId);
    if (!tenant) {
      throw new AppError({
        statusCode: 404,
        code: "TENANT_NOT_FOUND",
        message: "Tenant not found",
      });
    }
    return tenant;
  }

  async onboard(principal: PlatformPrincipal, input: OnboardTenantInput, requestId?: string) {
    requireSuperAdmin(principal);
    const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan?.active) {
      throw new AppError({
        statusCode: 400,
        code: "PLAN_NOT_FOUND",
        message: "Active plan not found",
      });
    }
    const tenantId = randomUUID();
    const ownerUserId = randomUUID();
    const membershipId = randomUUID();
    const branchId = randomUUID();
    const passwordHash = await hashPassword(input.ownerPassword);

    return prisma.$transaction(
      async (transaction) => {
        await setPlatformWorkflow(transaction, principal, tenantId);
        const tenant = await transaction.tenant.create({
          data: {
            id: tenantId,
            name: input.name.trim(),
            slug: input.slug.trim().toLowerCase(),
            status: TenantStatus.TRIAL,
            planCode: input.planCode,
            timezone: input.timezone,
            currencyCode: input.currencyCode.toUpperCase(),
          },
        });
        await transaction.tenantSubscription.create({
          data: { tenantId, planCode: input.planCode },
        });
        await transaction.tenantBranding.create({
          data: { tenantId, displayName: tenant.name },
        });

        await transaction.$queryRaw(
          Prisma.sql`SELECT set_config('app.user_id', ${ownerUserId}, true)`,
        );
        await transaction.user.create({
          data: {
            id: ownerUserId,
            email: input.ownerEmail.trim().toLowerCase(),
            fullName: input.ownerFullName.trim(),
            passwordHash,
          },
        });
        await transaction.tenantMembership.create({
          data: {
            id: membershipId,
            tenantId,
            userId: ownerUserId,
            username: input.ownerUsername.trim().toLowerCase(),
            role: TenantRole.OWNER,
            status: MembershipStatus.ACTIVE,
            allBranches: true,
          },
        });
        await transaction.branch.create({
          data: {
            id: branchId,
            tenantId,
            name: input.branchName.trim(),
            code: input.branchCode.trim().toUpperCase(),
            timezone: input.timezone,
          },
        });

        await transaction.$queryRaw(
          Prisma.sql`SELECT set_config('app.user_id', ${principal.userId}, true)`,
        );
        await transaction.platformAuditLog.create({
          data: {
            actorUserId: principal.userId,
            action: "TENANT_ONBOARDED",
            entityType: "tenant",
            entityId: tenantId,
            targetTenantId: tenantId,
            ...(requestId ? { metadata: { requestId } } : {}),
            after: {
              name: tenant.name,
              slug: tenant.slug,
              planCode: input.planCode,
              ownerUserId,
              branchId,
            },
          },
        });
        return {
          tenant,
          owner: {
            userId: ownerUserId,
            membershipId,
            username: input.ownerUsername.trim().toLowerCase(),
          },
          branch: { id: branchId, code: input.branchCode.trim().toUpperCase() },
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20_000,
      },
    );
  }

  async setStatus(
    principal: PlatformPrincipal,
    tenantId: string,
    status: TenantStatus,
    reason: string,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal, tenantId);
      const current = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!current) {
        throw new AppError({
          statusCode: 404,
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
        });
      }
      const tenant = await transaction.tenant.update({
        where: { id: tenantId },
        data: { status },
      });
      if (status === TenantStatus.SUSPENDED || status === TenantStatus.CANCELLED) {
        await transaction.session.updateMany({
          where: { tenantId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "TENANT_STATUS_CHANGED",
          entityType: "tenant",
          entityId: tenantId,
          targetTenantId: tenantId,
          before: { status: current.status },
          after: { status, reason },
          metadata: requestId ? { requestId } : {},
        },
      });
      return tenant;
    });
  }

  async setPlan(
    principal: PlatformPrincipal,
    tenantId: string,
    planCode: string,
    overrides: Record<string, number>,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    validateLimits(overrides, false);
    const plan = await prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan?.active) {
      throw new AppError({
        statusCode: 400,
        code: "PLAN_NOT_FOUND",
        message: "Active plan not found",
      });
    }
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal, tenantId);
      const tenant = await transaction.tenant.update({
        where: { id: tenantId },
        data: { planCode },
      });
      const subscription = await transaction.tenantSubscription.upsert({
        where: { tenantId },
        create: { tenantId, planCode, overrides },
        update: { planCode, overrides, endsAt: null },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "TENANT_PLAN_CHANGED",
          entityType: "tenant_subscription",
          entityId: tenantId,
          targetTenantId: tenantId,
          after: { planCode, overrides },
          metadata: requestId ? { requestId } : {},
        },
      });
      return { tenant, subscription };
    });
  }

  async setBranding(
    principal: PlatformPrincipal,
    tenantId: string,
    input: BrandingInput,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal, tenantId);
      const branding = await transaction.tenantBranding.upsert({
        where: { tenantId },
        create: {
          tenantId,
          displayName: input.displayName.trim(),
          logoUrl: input.logoUrl?.trim() || null,
          primaryColor: input.primaryColor.toUpperCase(),
          accentColor: input.accentColor.toUpperCase(),
          invoiceFooter: input.invoiceFooter?.trim() || null,
          supportContact: input.supportContact?.trim() || null,
        },
        update: {
          displayName: input.displayName.trim(),
          logoUrl: input.logoUrl?.trim() || null,
          primaryColor: input.primaryColor.toUpperCase(),
          accentColor: input.accentColor.toUpperCase(),
          invoiceFooter: input.invoiceFooter?.trim() || null,
          supportContact: input.supportContact?.trim() || null,
        },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "TENANT_BRANDING_CHANGED",
          entityType: "tenant_branding",
          entityId: tenantId,
          targetTenantId: tenantId,
          after: {
            displayName: branding.displayName,
            primaryColor: branding.primaryColor,
            accentColor: branding.accentColor,
          },
          metadata: requestId ? { requestId } : {},
        },
      });
      return branding;
    });
  }

  async audit(principal: PlatformPrincipal, take = 100) {
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      return transaction.platformAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(take, 1), 500),
      });
    });
  }
}

export const platformAdminService = new PrismaPlatformAdminService();
