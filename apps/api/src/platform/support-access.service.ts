import { PlatformRole, Prisma, SupportRequestStatus, TenantRole } from "@prisma/client";
import { hashSessionSecret } from "../auth/session-token.js";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../errors/app-error.js";
import type { PlatformPrincipal } from "./platform-auth.types.js";
import { createPlatformToken, parsePlatformToken } from "./platform-token.js";

const maximumAccessMs = 4 * 60 * 60 * 1000;
const supportMembershipId = "00000000-0000-0000-0000-000000000000";

export interface SupportAccessService {
  list(principal: PlatformPrincipal): Promise<unknown[]>;
  request(principal: PlatformPrincipal, tenantId: string, reason: string): Promise<unknown>;
  decide(
    principal: PlatformPrincipal,
    requestId: string,
    input: { approve: boolean; reason: string; durationMinutes?: number | undefined },
  ): Promise<unknown>;
  activate(
    principal: PlatformPrincipal,
    requestId: string,
  ): Promise<{ sessionToken: string; expiresAt: Date }>;
  revoke(principal: PlatformPrincipal, requestId: string, reason: string): Promise<void>;
  authenticate(rawToken: string | undefined): Promise<AuthenticatedPrincipal | null>;
  logout(rawToken: string | undefined): Promise<void>;
}

async function setPlatformContext(
  transaction: Prisma.TransactionClient,
  userId: string,
  tenantId = "",
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT
      set_config('app.user_id', ${userId}, true),
      set_config('app.tenant_id', ${tenantId}, true),
      set_config('app.platform_admin', 'true', true)
    `,
  );
}

function requireSupportRole(principal: PlatformPrincipal) {
  if (principal.role !== PlatformRole.SUPER_ADMIN && principal.role !== PlatformRole.SUPPORT) {
    throw new AppError({
      statusCode: 403,
      code: "PLATFORM_PERMISSION_DENIED",
      message: "Support access permission is required",
    });
  }
}

function invalidSupportSession() {
  return new AppError({
    statusCode: 409,
    code: "SUPPORT_SESSION_UNAVAILABLE",
    message: "The support request is not approved or is no longer valid",
  });
}

export class PrismaSupportAccessService implements SupportAccessService {
  async list(principal: PlatformPrincipal) {
    requireSupportRole(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformContext(transaction, principal.userId);
      return transaction.supportAccessRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { sessions: { orderBy: { createdAt: "desc" } } },
      });
    });
  }

  async request(principal: PlatformPrincipal, tenantId: string, reason: string) {
    requireSupportRole(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformContext(transaction, principal.userId, tenantId);
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
      const accessRequest = await transaction.supportAccessRequest.create({
        data: {
          targetTenantId: tenantId,
          requestedByUserId: principal.userId,
          reason: reason.trim(),
        },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "SUPPORT_ACCESS_REQUESTED",
          entityType: "support_access_request",
          entityId: accessRequest.id,
          targetTenantId: tenantId,
          after: { reason: accessRequest.reason },
        },
      });
      return accessRequest;
    });
  }

  async decide(
    principal: PlatformPrincipal,
    requestId: string,
    input: { approve: boolean; reason: string; durationMinutes?: number | undefined },
  ) {
    if (principal.role !== PlatformRole.SUPER_ADMIN) {
      throw new AppError({
        statusCode: 403,
        code: "PLATFORM_PERMISSION_DENIED",
        message: "Super administrator approval is required",
      });
    }
    return prisma.$transaction(async (transaction) => {
      await setPlatformContext(transaction, principal.userId);
      const current = await transaction.supportAccessRequest.findUnique({
        where: { id: requestId },
      });
      if (!current) {
        throw new AppError({
          statusCode: 404,
          code: "SUPPORT_REQUEST_NOT_FOUND",
          message: "Support access request not found",
        });
      }
      if (current.status !== SupportRequestStatus.PENDING) throw invalidSupportSession();
      if (current.requestedByUserId === principal.userId) {
        throw new AppError({
          statusCode: 409,
          code: "SUPPORT_SELF_APPROVAL_FORBIDDEN",
          message: "The requester cannot approve their own support access",
        });
      }

      const expiresAt = input.approve
        ? new Date(Date.now() + Math.min(Math.max(input.durationMinutes ?? 60, 5), 240) * 60_000)
        : null;
      const accessRequest = await transaction.supportAccessRequest.update({
        where: { id: requestId },
        data: input.approve
          ? {
              status: SupportRequestStatus.APPROVED,
              approvedByUserId: principal.userId,
              approvedAt: new Date(),
              expiresAt,
              decisionReason: input.reason.trim(),
            }
          : {
              status: SupportRequestStatus.REJECTED,
              rejectedAt: new Date(),
              decisionReason: input.reason.trim(),
            },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: input.approve ? "SUPPORT_ACCESS_APPROVED" : "SUPPORT_ACCESS_REJECTED",
          entityType: "support_access_request",
          entityId: requestId,
          targetTenantId: current.targetTenantId,
          after: {
            status: accessRequest.status,
            expiresAt: accessRequest.expiresAt?.toISOString(),
            decisionReason: accessRequest.decisionReason,
          },
        },
      });
      return accessRequest;
    });
  }

  async activate(principal: PlatformPrincipal, requestId: string) {
    requireSupportRole(principal);
    return prisma.$transaction(async (transaction) => {
      await setPlatformContext(transaction, principal.userId);
      const accessRequest = await transaction.supportAccessRequest.findUnique({
        where: { id: requestId },
      });
      if (
        !accessRequest ||
        accessRequest.requestedByUserId !== principal.userId ||
        accessRequest.status !== SupportRequestStatus.APPROVED ||
        !accessRequest.expiresAt ||
        accessRequest.expiresAt <= new Date()
      ) {
        throw invalidSupportSession();
      }
      const previousSession = await transaction.supportSession.findFirst({
        where: { requestId },
        select: { id: true },
      });
      if (previousSession) {
        throw new AppError({
          statusCode: 409,
          code: "SUPPORT_SESSION_ALREADY_ACTIVATED",
          message: "This support approval has already been activated",
        });
      }
      const expiresAt = new Date(
        Math.min(accessRequest.expiresAt.getTime(), Date.now() + maximumAccessMs),
      );
      const token = createPlatformToken("support", [
        principal.userId,
        accessRequest.targetTenantId,
      ]);
      const session = await transaction.supportSession.create({
        data: {
          requestId,
          platformUserId: principal.userId,
          targetTenantId: accessRequest.targetTenantId,
          tokenHash: token.hash,
          expiresAt,
        },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "SUPPORT_SESSION_ACTIVATED",
          entityType: "support_session",
          entityId: session.id,
          targetTenantId: accessRequest.targetTenantId,
          after: { expiresAt: expiresAt.toISOString(), readOnly: true },
        },
      });
      return { sessionToken: token.raw, expiresAt };
    });
  }

  async revoke(principal: PlatformPrincipal, requestId: string, reason: string) {
    requireSupportRole(principal);
    await prisma.$transaction(async (transaction) => {
      await setPlatformContext(transaction, principal.userId);
      const accessRequest = await transaction.supportAccessRequest.findUnique({
        where: { id: requestId },
      });
      if (!accessRequest) {
        throw new AppError({
          statusCode: 404,
          code: "SUPPORT_REQUEST_NOT_FOUND",
          message: "Support access request not found",
        });
      }
      if (
        principal.role !== PlatformRole.SUPER_ADMIN &&
        accessRequest.requestedByUserId !== principal.userId
      ) {
        throw new AppError({
          statusCode: 403,
          code: "PLATFORM_PERMISSION_DENIED",
          message: "Only the requester or a super administrator may revoke access",
        });
      }
      await transaction.supportAccessRequest.update({
        where: { id: requestId },
        data: {
          status: SupportRequestStatus.REVOKED,
          revokedAt: new Date(),
          decisionReason: reason.trim(),
        },
      });
      await transaction.supportSession.updateMany({
        where: { requestId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: principal.userId,
          action: "SUPPORT_ACCESS_REVOKED",
          entityType: "support_access_request",
          entityId: requestId,
          targetTenantId: accessRequest.targetTenantId,
          after: { reason: reason.trim() },
        },
      });
    });
  }

  async authenticate(rawToken: string | undefined) {
    const parsed = parsePlatformToken(rawToken, "support", 2);
    if (!parsed) return null;
    const [platformUserId, targetTenantId] = parsed.ids as [string, string];
    return prisma.$transaction(async (transaction) => {
      await setPlatformContext(transaction, platformUserId, targetTenantId);
      const session = await transaction.supportSession.findUnique({
        where: { tokenHash: hashSessionSecret(parsed.secret) },
        include: { request: true },
      });
      if (
        !session ||
        session.platformUserId !== platformUserId ||
        session.targetTenantId !== targetTenantId ||
        session.revokedAt
      ) {
        return null;
      }
      const now = new Date();
      if (
        session.expiresAt <= now ||
        session.request.status !== SupportRequestStatus.APPROVED ||
        !session.request.expiresAt ||
        session.request.expiresAt <= now
      ) {
        await transaction.supportSession.update({
          where: { id: session.id },
          data: { revokedAt: now },
        });
        if (
          session.request.status === SupportRequestStatus.APPROVED &&
          session.request.expiresAt &&
          session.request.expiresAt <= now
        ) {
          await transaction.supportAccessRequest.update({
            where: { id: session.request.id },
            data: { status: SupportRequestStatus.EXPIRED },
          });
        }
        await transaction.platformAuditLog.create({
          data: {
            actorUserId: platformUserId,
            action: "SUPPORT_SESSION_EXPIRED",
            entityType: "support_session",
            entityId: session.id,
            targetTenantId,
          },
        });
        return null;
      }
      const [tenant, user, platformUser] = await Promise.all([
        transaction.tenant.findUnique({
          where: { id: targetTenantId },
          select: { id: true, name: true, status: true },
        }),
        transaction.user.findUnique({
          where: { id: platformUserId },
          select: { id: true, fullName: true, email: true, status: true },
        }),
        transaction.platformUser.findUnique({
          where: { userId: platformUserId },
          select: { active: true },
        }),
      ]);
      if (
        !tenant ||
        !["TRIAL", "ACTIVE"].includes(tenant.status) ||
        !user?.email ||
        user.status !== "ACTIVE" ||
        !platformUser?.active
      ) {
        return null;
      }
      if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
        await transaction.supportSession.update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() },
        });
      }
      return {
        sessionId: session.id,
        tenantId: tenant.id,
        tenantName: tenant.name,
        userId: user.id,
        fullName: user.fullName,
        membershipId: supportMembershipId,
        username: user.email,
        role: TenantRole.AUDITOR,
        allBranches: true,
        branchIds: [],
        isSupportSession: true,
        supportSessionId: session.id,
      } satisfies AuthenticatedPrincipal;
    });
  }

  async logout(rawToken: string | undefined) {
    const parsed = parsePlatformToken(rawToken, "support", 2);
    if (!parsed) return;
    const [platformUserId, targetTenantId] = parsed.ids as [string, string];
    await prisma.$transaction(async (transaction) => {
      await setPlatformContext(transaction, platformUserId, targetTenantId);
      const session = await transaction.supportSession.findUnique({
        where: { tokenHash: hashSessionSecret(parsed.secret) },
      });
      if (!session || session.platformUserId !== platformUserId || session.revokedAt) return;
      await transaction.supportSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: platformUserId,
          action: "SUPPORT_SESSION_LOGOUT",
          entityType: "support_session",
          entityId: session.id,
          targetTenantId,
        },
      });
    });
  }
}

export const supportAccessService = new PrismaSupportAccessService();
