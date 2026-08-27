import { randomUUID } from "node:crypto";
import { MembershipStatus, PlatformRole, Prisma, TenantRole, TenantStatus } from "@prisma/client";
import { hashPassword } from "../auth/password.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../errors/app-error.js";
import { provisionDefaultLabCatalog } from "../lab/default-lab-catalog.js";
import type { PlatformPrincipal } from "./platform-auth.types.js";
import { summarizeSubscriptionCollections } from "./subscription-collections.js";

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
  monthlyFee: string;
}

export interface BrandingInput {
  displayName: string;
  logoUrl?: string | undefined;
  primaryColor: string;
  accentColor: string;
  invoiceFooter?: string | undefined;
  supportContact?: string | undefined;
}
export interface PlatformSettingsInput {
  displayName: string;
  logoUrl?: string | undefined;
  primaryColor: string;
  accentColor: string;
  supportContact?: string | undefined;
  paymentNumber: string;
  currencyCode: string;
  billingInstructions: string;
}
export interface CreatePlatformUserInput {
  email: string;
  fullName: string;
  password: string;
  role: "ADMIN" | "SUPER_ADMIN";
}

export interface UpdatePlatformUserInput {
  fullName?: string | undefined;
  role?: "ADMIN" | "SUPER_ADMIN" | undefined;
  active?: boolean | undefined;
  password?: string | undefined;
  reason: string;
}

export interface PlatformBroadcastInput {
  targetType: "ALL_TENANTS" | "TENANT" | "BRANCH" | "ROLE" | "USER";
  tenantId?: string | undefined;
  branchId?: string | undefined;
  membershipId?: string | undefined;
  role?: TenantRole | undefined;
  title: string;
  message: string;
}
export interface PlatformAdminService {
  overview(principal: PlatformPrincipal): Promise<unknown>;
  subscriptionCollections(principal: PlatformPrincipal, year: number): Promise<unknown>;
  listPlatformUsers(principal: PlatformPrincipal): Promise<unknown[]>;
  createPlatformUser(
    principal: PlatformPrincipal,
    input: CreatePlatformUserInput,
    requestId?: string,
  ): Promise<unknown>;
  updatePlatformUser(
    principal: PlatformPrincipal,
    userId: string,
    input: UpdatePlatformUserInput,
    requestId?: string,
  ): Promise<unknown>;
  revokePlatformSessions(
    principal: PlatformPrincipal,
    userId: string,
    reason: string,
    requestId?: string,
  ): Promise<{ revoked: number }>;
  listTenantUsers(principal: PlatformPrincipal, tenantId: string): Promise<unknown[]>;
  setTenantUserActive(
    principal: PlatformPrincipal,
    tenantId: string,
    membershipId: string,
    active: boolean,
    reason: string,
    requestId?: string,
  ): Promise<unknown>;
  listBroadcasts(principal: PlatformPrincipal): Promise<unknown[]>;
  sendBroadcast(
    principal: PlatformPrincipal,
    input: PlatformBroadcastInput,
    requestId?: string,
  ): Promise<unknown>;
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
  updateTenant(
    principal: PlatformPrincipal,
    tenantId: string,
    input: { name: string; timezone: string; currencyCode: string },
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
  getSettings(principal: PlatformPrincipal): Promise<unknown>;
  updateSettings(
    principal: PlatformPrincipal,
    input: PlatformSettingsInput,
    requestId?: string,
  ): Promise<unknown>;
  renewSubscription(
    principal: PlatformPrincipal,
    tenantId: string,
    months: number,
    paymentAmount: string,
    paymentReference: string | undefined,
    note: string | undefined,
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
      set_config('app.platform_role', ${principal.role}, true),
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
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [subscription, branding, activeProducts, monthlySales] = await Promise.all([
      transaction.tenantSubscription.findUnique({ where: { tenantId } }),
      transaction.tenantBranding.findUnique({ where: { tenantId } }),
      transaction.product.count({ where: { tenantId, active: true } }),
      transaction.sale.count({
        where: { tenantId, createdAt: { gte: monthStart }, status: { not: "VOIDED" } },
      }),
    ]);
    const plan = await transaction.plan.findUnique({
      where: { code: subscription?.planCode ?? tenant.planCode },
    });
    const planLimits =
      plan?.limits && typeof plan.limits === "object" && !Array.isArray(plan.limits)
        ? (plan.limits as Record<string, unknown>)
        : {};
    const overrideLimits =
      subscription?.overrides &&
      typeof subscription.overrides === "object" &&
      !Array.isArray(subscription.overrides)
        ? (subscription.overrides as Record<string, unknown>)
        : {};
    const limit = (key: string) => Number(overrideLimits[key] ?? planLimits[key] ?? 0);
    return {
      ...tenant,
      activeUsers: tenant.memberships.length,
      subscription,
      branding,
      plan,
      usage: {
        branches: {
          used: tenant.branches.filter((branch) => branch.active).length,
          limit: limit("maxBranches"),
        },
        users: { used: tenant.memberships.length, limit: limit("maxUsers") },
        products: { used: activeProducts, limit: limit("maxProducts") },
        monthlySales: { used: monthlySales, limit: limit("maxMonthlySales") },
      },
    };
  });
}

export class PrismaPlatformAdminService implements PlatformAdminService {
  async subscriptionCollections(principal: PlatformPrincipal, year: number) {
    requireSuperAdmin(principal);
    if (!Number.isInteger(year) || year < 2000 || year > 9998) {
      throw new AppError({ statusCode: 400, code: "INVALID_YEAR", message: "Choose a valid reporting year" });
    }
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const events = await transaction.platformAuditLog.findMany({
        where: {
          action: "TENANT_SUBSCRIPTION_RENEWED",
          entityType: "tenant_subscription",
          createdAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) },
        },
        select: { createdAt: true, after: true },
      });
      return summarizeSubscriptionCollections(year, events);
    });
  }

  async overview(principal: PlatformPrincipal) {
    const tenants = await prisma.tenantLoginDirectory.findMany({ orderBy: { slug: "asc" } });
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);
    const tenantMetrics = await Promise.all(
      tenants.map((directory) =>
        prisma.$transaction(async (transaction) => {
          await setPlatformWorkflow(transaction, principal, directory.tenantId);
          const [tenant, branches, memberships, products, sales] = await Promise.all([
            transaction.tenant.findUnique({
              where: { id: directory.tenantId },
              select: { createdAt: true },
            }),
            transaction.branch.count({ where: { tenantId: directory.tenantId, active: true } }),
            transaction.tenantMembership.count({
              where: { tenantId: directory.tenantId, status: MembershipStatus.ACTIVE },
            }),
            transaction.product.count({ where: { tenantId: directory.tenantId, active: true } }),
            transaction.sale.count({
              where: {
                tenantId: directory.tenantId,
                createdAt: { gte: since },
                status: { not: "VOIDED" },
              },
            }),
          ]);
          return { branches, memberships, products, sales, createdAt: tenant?.createdAt ?? null };
        }),
      ),
    );
    const platform = await prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const [platformUsers, activePlatformSessions, pendingSupport, plans, recentAudit] =
        await Promise.all([
          transaction.platformUser.count({ where: { active: true } }),
          transaction.platformSession.count({
            where: { revokedAt: null, expiresAt: { gt: new Date() } },
          }),
          transaction.supportAccessRequest.count({ where: { status: "PENDING" } }),
          transaction.plan.findMany({ orderBy: { code: "asc" } }),
          transaction.platformAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
        ]);
      return { platformUsers, activePlatformSessions, pendingSupport, plans, recentAudit };
    });
    const lifecycleStatuses: TenantStatus[] = ["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"];
    const statusCounts = tenants.reduce<Record<string, number>>((counts, tenant) => {
      counts[tenant.status] = (counts[tenant.status] ?? 0) + 1;
      return counts;
    }, {});
    const monthFormatter = new Intl.DateTimeFormat("en", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const tenantGrowth = Array.from({ length: 6 }, (_, index) => {
      const month = new Date();
      month.setUTCDate(1);
      month.setUTCHours(0, 0, 0, 0);
      month.setUTCMonth(month.getUTCMonth() - (5 - index));
      const next = new Date(month);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return {
        label: monthFormatter.format(month),
        value: tenantMetrics.filter(
          (metric) => metric.createdAt && metric.createdAt >= month && metric.createdAt < next,
        ).length,
      };
    });
    const sum = (key: "branches" | "memberships" | "products" | "sales") =>
      tenantMetrics.reduce((total, metric) => total + metric[key], 0);
    return {
      cards: {
        totalTenants: tenants.length,
        activeTenants: (statusCounts.ACTIVE ?? 0) + (statusCounts.TRIAL ?? 0),
        activeBranches: sum("branches"),
        activeTenantUsers: sum("memberships"),
        activeProducts: sum("products"),
        salesLast30Days: sum("sales"),
        platformAdmins: platform.platformUsers,
        activePlatformSessions: platform.activePlatformSessions,
        pendingSupport: platform.pendingSupport,
      },
      charts: {
        tenantStatuses: lifecycleStatuses.map((label) => ({
          label,
          value: statusCounts[label] ?? 0,
        })),
        tenantGrowth,
      },
      alerts: [
        ...(platform.pendingSupport > 0
          ? [
              {
                tone: "warning",
                title: "Support approvals pending",
                message: `${platform.pendingSupport} request(s) require review.`,
              },
            ]
          : []),
        ...((statusCounts.SUSPENDED ?? 0) > 0
          ? [
              {
                tone: "danger",
                title: "Suspended tenants",
                message: `${statusCounts.SUSPENDED} tenant(s) are currently suspended.`,
              },
            ]
          : []),
        ...(platform.plans.some((plan) => !plan.active)
          ? [
              {
                tone: "info",
                title: "Inactive plans",
                message: `${platform.plans.filter((plan) => !plan.active).length} plan(s) are retired.`,
              },
            ]
          : []),
      ],
      recentAudit: platform.recentAudit.map((item) => ({ ...item, id: item.id.toString() })),
    };
  }
  async listPlatformUsers(principal: PlatformPrincipal) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const users = await transaction.platformUser.findMany({
        include: {
          user: { select: { email: true, fullName: true, status: true, updatedAt: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      const sessionCounts = await transaction.platformSession.groupBy({
        by: ["userId"],
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        _count: { _all: true },
        _max: { lastSeenAt: true },
      });
      const sessions = new Map(sessionCounts.map((item) => [item.userId, item]));
      return users.map((access) => ({
        userId: access.userId,
        email: access.user.email,
        fullName: access.user.fullName,
        role: access.role,
        active: access.active && access.user.status === "ACTIVE",
        activeSessions: sessions.get(access.userId)?._count._all ?? 0,
        lastSeenAt: sessions.get(access.userId)?._max.lastSeenAt ?? null,
        createdAt: access.createdAt,
        updatedAt: access.updatedAt,
      }));
    });
  }

  async createPlatformUser(
    principal: PlatformPrincipal,
    input: CreatePlatformUserInput,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    const userId = randomUUID();
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const existing = await transaction.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) {
        throw new AppError({
          statusCode: 409,
          code: "PLATFORM_EMAIL_EXISTS",
          message: "This platform email is already registered",
        });
      }
      const user = await transaction.user.create({
        data: { id: userId, email, fullName: input.fullName.trim(), passwordHash },
      });
      const access = await transaction.platformUser.create({
        data: { userId, role: input.role, active: true },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "PLATFORM_USER_CREATED",
          entityType: "platform_user",
          entityId: userId,
          after: { email, fullName: user.fullName, role: access.role, active: access.active },
          metadata: requestId ? { requestId } : {},
        },
      });
      return { userId, email, fullName: user.fullName, role: access.role, active: access.active };
    });
  }

  async updatePlatformUser(
    principal: PlatformPrincipal,
    userId: string,
    input: UpdatePlatformUserInput,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    if (
      principal.userId === userId &&
      (input.active === false || input.role === PlatformRole.ADMIN)
    ) {
      throw new AppError({
        statusCode: 409,
        code: "PLATFORM_SELF_LOCKOUT_DENIED",
        message: "You cannot disable or demote your own active super-admin account",
      });
    }
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const current = await transaction.platformUser.findUnique({
        where: { userId },
        include: { user: { select: { email: true, fullName: true } } },
      });
      if (!current)
        throw new AppError({
          statusCode: 404,
          code: "PLATFORM_USER_NOT_FOUND",
          message: "Platform user not found",
        });
      const removesSuper =
        current.role === PlatformRole.SUPER_ADMIN &&
        (input.active === false || input.role === PlatformRole.ADMIN);
      if (removesSuper) {
        const activeSuperAdmins = await transaction.platformUser.count({
          where: { role: PlatformRole.SUPER_ADMIN, active: true },
        });
        if (activeSuperAdmins <= 1)
          throw new AppError({
            statusCode: 409,
            code: "LAST_SUPER_ADMIN_PROTECTED",
            message: "The final active super administrator cannot be disabled or demoted",
          });
      }
      if (input.fullName !== undefined || passwordHash) {
        await transaction.user.update({
          where: { id: userId },
          data: {
            ...(input.fullName !== undefined ? { fullName: input.fullName.trim() } : {}),
            ...(passwordHash ? { passwordHash, tokenVersion: { increment: 1 } } : {}),
          },
        });
      }
      const access = await transaction.platformUser.update({
        where: { userId },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      const securityChange =
        passwordHash ||
        input.active === false ||
        (input.role !== undefined && input.role !== current.role);
      if (securityChange) {
        await transaction.platformSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: passwordHash ? "PLATFORM_USER_PASSWORD_ROTATED" : "PLATFORM_USER_UPDATED",
          entityType: "platform_user",
          entityId: userId,
          before: { fullName: current.user.fullName, role: current.role, active: current.active },
          after: {
            fullName: input.fullName ?? current.user.fullName,
            role: access.role,
            active: access.active,
          },
          metadata: { reason: input.reason.trim(), ...(requestId ? { requestId } : {}) },
        },
      });
      return {
        userId,
        email: current.user.email,
        fullName: input.fullName ?? current.user.fullName,
        role: access.role,
        active: access.active,
      };
    });
  }

  async revokePlatformSessions(
    principal: PlatformPrincipal,
    userId: string,
    reason: string,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const target = await transaction.platformUser.findUnique({
        where: { userId },
        select: { userId: true },
      });
      if (!target)
        throw new AppError({
          statusCode: 404,
          code: "PLATFORM_USER_NOT_FOUND",
          message: "Platform user not found",
        });
      const result = await transaction.platformSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "PLATFORM_USER_SESSIONS_REVOKED",
          entityType: "platform_user",
          entityId: userId,
          after: { revokedSessions: result.count },
          metadata: { reason: reason.trim(), ...(requestId ? { requestId } : {}) },
        },
      });
      return { revoked: result.count };
    });
  }
  async listTenantUsers(principal: PlatformPrincipal, tenantId: string) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal, tenantId);
      const tenant = await transaction.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });
      if (!tenant) {
        throw new AppError({
          statusCode: 404,
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
        });
      }
      const memberships = await transaction.tenantMembership.findMany({
        where: { tenantId },
        include: {
          user: { select: { email: true, fullName: true, status: true } },
          branches: { include: { branch: { select: { id: true, name: true, code: true } } } },
        },
        orderBy: { createdAt: "asc" },
      });
      const sessions = await transaction.session.groupBy({
        by: ["membershipId"],
        where: { tenantId, revokedAt: null, expiresAt: { gt: new Date() } },
        _count: { _all: true },
        _max: { lastSeenAt: true },
      });
      const sessionMap = new Map(sessions.map((item) => [item.membershipId, item]));
      return memberships.map((membership) => ({
        membershipId: membership.id,
        userId: membership.userId,
        username: membership.username,
        fullName: membership.user.fullName,
        email: membership.user.email,
        role: membership.role,
        status: membership.status,
        allBranches: membership.allBranches,
        branches: membership.branches.map((assignment) => assignment.branch),
        activeSessions: sessionMap.get(membership.id)?._count._all ?? 0,
        lastSeenAt: sessionMap.get(membership.id)?._max.lastSeenAt ?? null,
        createdAt: membership.createdAt,
      }));
    });
  }

  async setTenantUserActive(
    principal: PlatformPrincipal,
    tenantId: string,
    membershipId: string,
    active: boolean,
    reason: string,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal, tenantId);
      const membership = await transaction.tenantMembership.findUnique({
        where: { tenantId_id: { tenantId, id: membershipId } },
        include: { user: { select: { fullName: true, email: true } } },
      });
      if (!membership) {
        throw new AppError({
          statusCode: 404,
          code: "TENANT_USER_NOT_FOUND",
          message: "Tenant user not found",
        });
      }
      if (
        !active &&
        membership.role === TenantRole.OWNER &&
        membership.status === MembershipStatus.ACTIVE
      ) {
        const activeOwners = await transaction.tenantMembership.count({
          where: { tenantId, role: TenantRole.OWNER, status: MembershipStatus.ACTIVE },
        });
        if (activeOwners <= 1) {
          throw new AppError({
            statusCode: 409,
            code: "LAST_TENANT_OWNER_PROTECTED",
            message: "The final active tenant owner cannot be disabled",
          });
        }
      }
      const status = active ? MembershipStatus.ACTIVE : MembershipStatus.SUSPENDED;
      const updated = await transaction.tenantMembership.update({
        where: { tenantId_id: { tenantId, id: membershipId } },
        data: { status },
      });
      const revoked = active
        ? { count: 0 }
        : await transaction.session.updateMany({
            where: { tenantId, membershipId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: active ? "TENANT_USER_ENABLED" : "TENANT_USER_DISABLED",
          entityType: "tenant_membership",
          entityId: membershipId,
          targetTenantId: tenantId,
          before: { status: membership.status, role: membership.role },
          after: { status: updated.status, revokedSessions: revoked.count },
          metadata: { reason: reason.trim(), ...(requestId ? { requestId } : {}) },
        },
      });
      return {
        membershipId,
        fullName: membership.user.fullName,
        email: membership.user.email,
        role: membership.role,
        status: updated.status,
        revokedSessions: revoked.count,
      };
    });
  }

  async listBroadcasts(principal: PlatformPrincipal) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      return transaction.platformBroadcast.findMany({
        orderBy: { createdAt: "desc" },
        take: 250,
      });
    });
  }

  async sendBroadcast(
    principal: PlatformPrincipal,
    input: PlatformBroadcastInput,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    if (input.targetType !== "ALL_TENANTS" && !input.tenantId) {
      throw new AppError({
        statusCode: 400,
        code: "BROADCAST_TENANT_REQUIRED",
        message: "A tenant is required for this recipient type",
      });
    }
    if (input.targetType === "BRANCH" && !input.branchId) {
      throw new AppError({
        statusCode: 400,
        code: "BROADCAST_BRANCH_REQUIRED",
        message: "A branch is required",
      });
    }
    if (input.targetType === "ROLE" && !input.role) {
      throw new AppError({
        statusCode: 400,
        code: "BROADCAST_ROLE_REQUIRED",
        message: "A role is required",
      });
    }
    if (input.targetType === "USER" && !input.membershipId) {
      throw new AppError({
        statusCode: 400,
        code: "BROADCAST_USER_REQUIRED",
        message: "A user is required",
      });
    }
    const tenantIds =
      input.targetType === "ALL_TENANTS"
        ? (
            await prisma.tenantLoginDirectory.findMany({
              where: { status: { in: [TenantStatus.ACTIVE, TenantStatus.TRIAL] } },
              select: { tenantId: true },
            })
          ).map((tenant) => tenant.tenantId)
        : [input.tenantId!];
    if (tenantIds.length === 0) {
      throw new AppError({
        statusCode: 409,
        code: "BROADCAST_NO_TENANTS",
        message: "No eligible tenants were found",
      });
    }
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal, tenantIds[0]);
      const broadcast = await transaction.platformBroadcast.create({
        data: {
          actorUserId: principal.userId,
          targetTenantId: input.tenantId ?? null,
          targetBranchId: input.branchId ?? null,
          targetMembershipId: input.membershipId ?? null,
          targetRole: input.role ?? null,
          targetType: input.targetType,
          title: input.title.trim(),
          message: input.message.trim(),
        },
      });
      let deliveryCount = 0;
      for (const tenantId of tenantIds) {
        await setPlatformWorkflow(transaction, principal, tenantId);
        const memberships = await transaction.tenantMembership.findMany({
          where: {
            tenantId,
            status: MembershipStatus.ACTIVE,
            ...(input.role ? { role: input.role } : {}),
            ...(input.membershipId ? { id: input.membershipId } : {}),
            ...(input.branchId
              ? {
                  OR: [{ allBranches: true }, { branches: { some: { branchId: input.branchId } } }],
                }
              : {}),
          },
          select: { id: true },
        });
        if (memberships.length > 0) {
          const created = await transaction.platformBroadcastDelivery.createMany({
            data: memberships.map((membership) => ({
              broadcastId: broadcast.id,
              tenantId,
              branchId: input.branchId ?? null,
              membershipId: membership.id,
              title: broadcast.title,
              message: broadcast.message,
            })),
            skipDuplicates: true,
          });
          deliveryCount += created.count;
        }
      }
      await setPlatformWorkflow(transaction, principal, input.tenantId ?? tenantIds[0]);
      const updated = await transaction.platformBroadcast.update({
        where: { id: broadcast.id },
        data: { deliveryCount },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "PLATFORM_BROADCAST_SENT",
          entityType: "platform_broadcast",
          entityId: broadcast.id,
          targetTenantId: input.tenantId ?? null,
          after: {
            targetType: input.targetType,
            targetRole: input.role ?? null,
            targetBranchId: input.branchId ?? null,
            targetMembershipId: input.membershipId ?? null,
            deliveryCount,
          },
          metadata: requestId ? { requestId } : {},
        },
      });
      return updated;
    });
  }
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
          data: {
            tenantId,
            planCode: input.planCode,
            monthlyFee: input.monthlyFee,
            endsAt: new Date(new Date().setMonth(new Date().getMonth() + 1)),
          },
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
        await provisionDefaultLabCatalog(transaction, tenantId);

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

  async updateTenant(
    principal: PlatformPrincipal,
    tenantId: string,
    input: { name: string; timezone: string; currencyCode: string },
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal, tenantId);
      const before = await transaction.tenant.findUnique({ where: { id: tenantId } });
      if (!before)
        throw new AppError({
          statusCode: 404,
          code: "TENANT_NOT_FOUND",
          message: "Tenant not found",
        });
      const tenant = await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          name: input.name.trim(),
          timezone: input.timezone.trim(),
          currencyCode: input.currencyCode.trim().toUpperCase(),
        },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "TENANT_UPDATED",
          entityType: "tenant",
          entityId: tenantId,
          targetTenantId: tenantId,
          before: {
            name: before.name,
            timezone: before.timezone,
            currencyCode: before.currencyCode,
          },
          after: {
            name: tenant.name,
            timezone: tenant.timezone,
            currencyCode: tenant.currencyCode,
          },
          metadata: requestId ? { requestId } : {},
        },
      });
      return tenant;
    });
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

  async getSettings(principal: PlatformPrincipal) {
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const settings = await transaction.platformSetting.findMany({
        where: { key: { in: ["platform_profile", "billing"] } },
      });
      return Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
    });
  }

  async updateSettings(
    principal: PlatformPrincipal,
    input: PlatformSettingsInput,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal);
      const profile = {
        displayName: input.displayName.trim(),
        logoUrl: input.logoUrl?.trim() || "",
        primaryColor: input.primaryColor.toUpperCase(),
        accentColor: input.accentColor.toUpperCase(),
        supportContact: input.supportContact?.trim() || "",
      };
      const billing = {
        paymentNumber: input.paymentNumber.trim(),
        currencyCode: input.currencyCode.trim().toUpperCase(),
        instructions: input.billingInstructions.trim(),
      };
      await Promise.all([
        transaction.platformSetting.upsert({
          where: { key: "platform_profile" },
          create: { key: "platform_profile", value: profile },
          update: { value: profile },
        }),
        transaction.platformSetting.upsert({
          where: { key: "billing" },
          create: { key: "billing", value: billing },
          update: { value: billing },
        }),
      ]);
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "PLATFORM_SETTINGS_UPDATED",
          entityType: "platform_settings",
          after: { profile, billing },
          metadata: requestId ? { requestId } : {},
        },
      });
      return { platform_profile: profile, billing };
    });
  }

  async renewSubscription(
    principal: PlatformPrincipal,
    tenantId: string,
    months: number,
    paymentAmount: string,
    paymentReference?: string,
    note?: string,
    requestId?: string,
  ) {
    requireSuperAdmin(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformWorkflow(transaction, principal, tenantId);
      const current = await transaction.tenantSubscription.findUnique({ where: { tenantId } });
      if (!current) {
        throw new AppError({
          statusCode: 404,
          code: "SUBSCRIPTION_NOT_FOUND",
          message: "Tenant subscription not found",
        });
      }
      const start = current.endsAt && current.endsAt > new Date() ? current.endsAt : new Date();
      const billingSetting = await transaction.platformSetting.findUnique({ where: { key: "billing" } });
      const billing = billingSetting?.value as Record<string, unknown> | null | undefined;
      const currencyCode = typeof billing?.["currencyCode"] === "string" && /^[A-Z]{3}$/.test(billing["currencyCode"])
        ? billing["currencyCode"] : "USD";
      const endsAt = new Date(start);
      endsAt.setUTCMonth(endsAt.getUTCMonth() + months);
      const subscription = await transaction.tenantSubscription.update({
        where: { tenantId },
        data: { endsAt, lastPaymentAmount: paymentAmount, lastPaidAt: new Date() },
      });
      await transaction.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "TENANT_SUBSCRIPTION_RENEWED",
          entityType: "tenant_subscription",
          entityId: tenantId,
          targetTenantId: tenantId,
          before: { endsAt: current.endsAt },
          after: { endsAt, months, paymentAmount, currencyCode, paymentReference, note },
          metadata: requestId ? { requestId } : {},
        },
      });
      return subscription;
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
