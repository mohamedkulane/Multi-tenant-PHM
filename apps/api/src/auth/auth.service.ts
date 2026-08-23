import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext, withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import type {
  AuthenticatedPrincipal,
  AuthService,
  ChangePasswordInput,
  LoginInput,
  UpdateProfileInput,
  SecurityAuditInput,
} from "./auth.types.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSessionToken, hashSessionSecret, parseSessionToken } from "./session-token.js";

const invalidCredentials = () =>
  new AppError({
    statusCode: 401,
    code: "INVALID_CREDENTIALS",
    message: "Invalid organization, username, or password",
  });

const activeTenantStatuses = new Set(["TRIAL", "ACTIVE"]);
const sessionDurationMs = env.SESSION_TTL_HOURS * 60 * 60 * 1000;

function normalizeLoginName(value: string) {
  return value.trim().toLowerCase();
}

function toPrincipal(input: {
  sessionId: string;
  tenant: { id: string; name: string };
  user: { id: string; fullName: string; email: string | null };
  membership: {
    id: string;
    username: string;
    role: AuthenticatedPrincipal["role"];
    allBranches: boolean;
    branches: Array<{ branchId: string }>;
  };
}): AuthenticatedPrincipal {
  return {
    sessionId: input.sessionId,
    tenantId: input.tenant.id,
    tenantName: input.tenant.name,
    userId: input.user.id,
    fullName: input.user.fullName,
    email: input.user.email,
    membershipId: input.membership.id,
    username: input.membership.username,
    role: input.membership.role,
    allBranches:
      (input.membership.role === "OWNER" || input.membership.role === "ADMIN") &&
      input.membership.allBranches,
    branchIds: input.membership.branches.map(({ branchId }) => branchId),
  };
}

async function loadPrincipal(
  transaction: Prisma.TransactionClient,
  session: {
    id: string;
    tenantId: string;
    membershipId: string;
    userId: string;
  },
) {
  await setTransactionContext(transaction, {
    tenantId: session.tenantId,
    membershipId: session.membershipId,
    userId: session.userId,
  });

  const [tenant, membership, user] = await Promise.all([
    transaction.tenant.findUnique({
      where: { id: session.tenantId },
      select: { id: true, name: true, status: true },
    }),
    transaction.tenantMembership.findUnique({
      where: {
        tenantId_id: {
          tenantId: session.tenantId,
          id: session.membershipId,
        },
      },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        allBranches: true,
        branches: { select: { branchId: true } },
      },
    }),
    transaction.user.findUnique({
      where: { id: session.userId },
      select: { id: true, fullName: true, email: true, status: true },
    }),
  ]);

  const subscription = await transaction.tenantSubscription.findUnique({
    where: { tenantId: session.tenantId },
    select: { endsAt: true },
  });
  if (
    !tenant ||
    !membership ||
    !user ||
    !activeTenantStatuses.has(tenant.status) ||
    membership.status !== "ACTIVE" ||
    user.status !== "ACTIVE" ||
    Boolean(subscription?.endsAt && subscription.endsAt <= new Date())
  ) {
    return null;
  }

  return toPrincipal({ sessionId: session.id, tenant, membership, user });
}

export class PrismaAuthService implements AuthService {
  async login(input: LoginInput) {
    const tenantSlug = normalizeLoginName(input.tenantSlug);
    const username = normalizeLoginName(input.username);
    const directory = await prisma.tenantLoginDirectory.findUnique({
      where: { slug: tenantSlug },
      select: { tenantId: true, status: true },
    });

    if (!directory || !activeTenantStatuses.has(directory.status)) {
      throw invalidCredentials();
    }

    return withTenantContext(prisma, { tenantId: directory.tenantId }, async (transaction) => {
      const membership = await transaction.tenantMembership.findUnique({
        where: {
          tenantId_username: {
            tenantId: directory.tenantId,
            username,
          },
        },
        select: {
          id: true,
          tenantId: true,
          userId: true,
          username: true,
          role: true,
          status: true,
          allBranches: true,
          branches: { select: { branchId: true } },
        },
      });

      if (!membership || membership.status !== "ACTIVE") {
        throw invalidCredentials();
      }

      await setTransactionContext(transaction, {
        tenantId: directory.tenantId,
        membershipId: membership.id,
        userId: membership.userId,
      });

      const [user, tenant] = await Promise.all([
        transaction.user.findUnique({
          where: { id: membership.userId },
          select: {
            id: true,
            fullName: true,
            email: true,
            passwordHash: true,
            status: true,
            platformAccess: { select: { active: true } },
          },
        }),
        transaction.tenant.findUnique({
          where: { id: directory.tenantId },
          select: { id: true, name: true },
        }),
      ]);

      if (
        !user ||
        !tenant ||
        user.status !== "ACTIVE" ||
        user.platformAccess?.active ||
        !(await verifyPassword(user.passwordHash, input.password))
      ) {
        throw invalidCredentials();
      }

      const [subscription, billingSetting] = await Promise.all([
        transaction.tenantSubscription.findUnique({
          where: { tenantId: directory.tenantId },
          select: { endsAt: true },
        }),
        transaction.platformSetting.findUnique({ where: { key: "billing" } }),
      ]);
      if (subscription?.endsAt && subscription.endsAt <= new Date()) {
        const billing =
          billingSetting?.value &&
          typeof billingSetting.value === "object" &&
          !Array.isArray(billingSetting.value)
            ? (billingSetting.value as Record<string, unknown>)
            : {};
        const billingText = (key: string, fallback: string) => {
          const value = billing[key];
          return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
        };
        throw new AppError({
          statusCode: 402,
          code: "TENANT_SUBSCRIPTION_EXPIRED",
          message:
            "Subscription-ka pharmacy-ga wuu dhacay. Bixi " +
            billingText("monthlyFee", "fee-ga") +
            " " +
            billingText("currencyCode", "") +
            " lambarka " +
            billingText("paymentNumber", "platform admin") +
            ". " +
            billingText("instructions", "La xiriir platform admin."),
        });
      }
      const token = createSessionToken(directory.tenantId);
      const expiresAt = new Date(Date.now() + sessionDurationMs);
      const session = await transaction.session.create({
        data: {
          tenantId: directory.tenantId,
          membershipId: membership.id,
          userId: user.id,
          tokenHash: token.hash,
          expiresAt,
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        },
        select: { id: true },
      });

      await transaction.auditLog.create({
        data: {
          tenantId: directory.tenantId,
          actorUserId: user.id,
          actorMembershipId: membership.id,
          action: "AUTH_LOGIN",
          entityType: "session",
          entityId: session.id,
          metadata: { method: "password" },
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        },
      });

      return {
        sessionToken: token.raw,
        expiresAt,
        principal: toPrincipal({
          sessionId: session.id,
          tenant,
          membership,
          user,
        }),
      };
    });
  }

  async authenticate(rawSessionToken: string | undefined) {
    const parsed = parseSessionToken(rawSessionToken);
    if (!parsed) return null;

    return withTenantContext(prisma, { tenantId: parsed.tenantId }, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { tokenHash: hashSessionSecret(parsed.secret) },
        select: {
          id: true,
          tenantId: true,
          membershipId: true,
          userId: true,
          expiresAt: true,
          revokedAt: true,
          lastSeenAt: true,
        },
      });

      if (
        !session ||
        session.tenantId !== parsed.tenantId ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        return null;
      }

      const principal = await loadPrincipal(transaction, session);
      if (!principal) return null;

      if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
        await transaction.session.update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() },
        });
      }
      return principal;
    });
  }

  async logout(rawSessionToken: string | undefined) {
    const parsed = parseSessionToken(rawSessionToken);
    if (!parsed) return;

    await withTenantContext(prisma, { tenantId: parsed.tenantId }, async (transaction) => {
      const session = await transaction.session.findUnique({
        where: { tokenHash: hashSessionSecret(parsed.secret) },
        select: {
          id: true,
          tenantId: true,
          membershipId: true,
          userId: true,
          revokedAt: true,
        },
      });
      if (!session || session.tenantId !== parsed.tenantId || session.revokedAt) return;

      await setTransactionContext(transaction, {
        tenantId: session.tenantId,
        membershipId: session.membershipId,
        userId: session.userId,
      });
      await transaction.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          actorMembershipId: session.membershipId,
          action: "AUTH_LOGOUT",
          entityType: "session",
          entityId: session.id,
        },
      });
    });
  }

  async updateProfile(principal: AuthenticatedPrincipal, input: UpdateProfileInput) {
    const fullName = input.fullName.trim();
    const email = input.email?.trim().toLowerCase() || null;
    return withTenantContext(prisma, principal, async (transaction) => {
      await setTransactionContext(transaction, principal);
      try {
        const user = await transaction.user.update({
          where: { id: principal.userId },
          data: { fullName, email },
          select: { id: true, fullName: true, email: true },
        });
        await transaction.auditLog.create({
          data: {
            tenantId: principal.tenantId,
            actorUserId: principal.userId,
            actorMembershipId: principal.membershipId,
            action: "ACCOUNT_PROFILE_UPDATED",
            entityType: "user",
            entityId: principal.userId,
          },
        });
        return { ...principal, ...user };
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw new AppError({
            statusCode: 409,
            code: "EMAIL_ALREADY_IN_USE",
            message: "This email address is already in use",
          });
        }
        throw error;
      }
    });
  }

  async changePassword(principal: AuthenticatedPrincipal, input: ChangePasswordInput) {
    return withTenantContext(prisma, principal, async (transaction) => {
      await setTransactionContext(transaction, principal);
      const user = await transaction.user.findUnique({
        where: { id: principal.userId },
        select: { passwordHash: true },
      });
      if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw new AppError({
          statusCode: 400,
          code: "CURRENT_PASSWORD_INCORRECT",
          message: "Current password is incorrect",
        });
      }
      if (await verifyPassword(user.passwordHash, input.newPassword)) {
        throw new AppError({
          statusCode: 400,
          code: "PASSWORD_UNCHANGED",
          message: "New password must be different from the current password",
        });
      }
      const passwordHash = await hashPassword(input.newPassword);
      await transaction.user.update({
        where: { id: principal.userId },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      });
      const revokedSessions = await transaction.session.updateMany({
        where: {
          userId: principal.userId,
          id: { not: principal.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: {
          tenantId: principal.tenantId,
          actorUserId: principal.userId,
          actorMembershipId: principal.membershipId,
          action: "PASSWORD_CHANGED",
          entityType: "user",
          entityId: principal.userId,
          metadata: { revokedSessionCount: revokedSessions.count },
        },
      });
      return { changed: true as const };
    });
  }
  async recordSecurityEvent(input: SecurityAuditInput) {
    const tenantId =
      input.principal?.tenantId ??
      (
        await prisma.tenantLoginDirectory.findUnique({
          where: { slug: normalizeLoginName(input.tenantSlug ?? "") },
          select: { tenantId: true },
        })
      )?.tenantId;
    if (!tenantId) return;

    await withTenantContext(prisma, { tenantId }, async (transaction) => {
      const membership = input.principal
        ? null
        : await transaction.tenantMembership.findUnique({
            where: {
              tenantId_username: {
                tenantId,
                username: normalizeLoginName(input.username ?? ""),
              },
            },
            select: { id: true, userId: true },
          });
      const actorUserId = input.principal?.userId ?? membership?.userId;
      const actorMembershipId = input.principal?.membershipId ?? membership?.id;
      await setTransactionContext(transaction, {
        tenantId,
        ...(actorUserId ? { userId: actorUserId } : {}),
        ...(actorMembershipId ? { membershipId: actorMembershipId } : {}),
      });
      await transaction.auditLog.create({
        data: {
          tenantId,
          ...(actorUserId ? { actorUserId } : {}),
          ...(actorMembershipId ? { actorMembershipId } : {}),
          action: input.action,
          entityType: "security_event",
          entityId: input.principal?.sessionId ?? null,
          metadata: input.metadata ?? {},
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 512) } : {}),
        },
      });
    });
  }
}

export const authService = new PrismaAuthService();
