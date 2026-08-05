import { Prisma } from "@prisma/client";
import { verifyPassword } from "../auth/password.js";
import { hashSessionSecret } from "../auth/session-token.js";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../errors/app-error.js";
import type {
  PlatformAuthService,
  PlatformLoginInput,
  PlatformPrincipal,
} from "./platform-auth.types.js";
import { createPlatformToken, parsePlatformToken } from "./platform-token.js";

const sessionDurationMs = env.SESSION_TTL_HOURS * 60 * 60 * 1000;
const allowedPlatformLoginRoles = new Set(["SUPER_ADMIN", "ADMIN"]);
const invalidCredentials = () =>
  new AppError({
    statusCode: 401,
    code: "INVALID_PLATFORM_CREDENTIALS",
    message: "Invalid platform credentials",
  });

async function setPlatformUser(transaction: Prisma.TransactionClient, userId: string) {
  await transaction.$queryRaw(Prisma.sql`SELECT set_config('app.user_id', ${userId}, true)`);
}

export class PrismaPlatformAuthService implements PlatformAuthService {
  async login(input: PlatformLoginInput) {
    const directory = await prisma.platformLoginDirectory.findUnique({
      where: { email: input.email.trim().toLowerCase() },
    });
    if (!directory?.active) throw invalidCredentials();

    return prisma.$transaction(async (transaction) => {
      await setPlatformUser(transaction, directory.userId);
      const [user, access] = await Promise.all([
        transaction.user.findUnique({
          where: { id: directory.userId },
          select: {
            id: true,
            email: true,
            fullName: true,
            passwordHash: true,
            status: true,
          },
        }),
        transaction.platformUser.findUnique({
          where: { userId: directory.userId },
        }),
      ]);
      if (
        !user?.email ||
        user.status !== "ACTIVE" ||
        !access?.active ||
        !allowedPlatformLoginRoles.has(access.role) ||
        !(await verifyPassword(user.passwordHash, input.password))
      ) {
        throw invalidCredentials();
      }
      const token = createPlatformToken("platform", [user.id]);
      const expiresAt = new Date(Date.now() + sessionDurationMs);
      const session = await transaction.platformSession.create({
        data: {
          userId: user.id,
          tokenHash: token.hash,
          expiresAt,
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: user.id,
          action: "PLATFORM_AUTH_LOGIN",
          entityType: "platform_session",
          entityId: session.id,
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
        },
      });
      return {
        sessionToken: token.raw,
        expiresAt,
        principal: {
          sessionId: session.id,
          userId: user.id,
          email: user.email,
          fullName: user.fullName,
          role: access.role,
        },
      };
    });
  }

  async authenticate(rawToken: string | undefined) {
    const parsed = parsePlatformToken(rawToken, "platform", 1);
    if (!parsed) return null;
    const userId = parsed.ids[0]!;
    return prisma.$transaction(async (transaction) => {
      await setPlatformUser(transaction, userId);
      const session = await transaction.platformSession.findUnique({
        where: { tokenHash: hashSessionSecret(parsed.secret) },
      });
      if (
        !session ||
        session.userId !== userId ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        return null;
      }
      const [user, access] = await Promise.all([
        transaction.user.findUnique({
          where: { id: userId },
          select: { email: true, fullName: true, status: true },
        }),
        transaction.platformUser.findUnique({ where: { userId } }),
      ]);
      if (
        !user?.email ||
        user.status !== "ACTIVE" ||
        !access?.active ||
        !allowedPlatformLoginRoles.has(access.role)
      )
        return null;
      if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
        await transaction.platformSession.update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() },
        });
      }
      return {
        sessionId: session.id,
        userId,
        email: user.email,
        fullName: user.fullName,
        role: access.role,
      } satisfies PlatformPrincipal;
    });
  }

  async logout(rawToken: string | undefined) {
    const parsed = parsePlatformToken(rawToken, "platform", 1);
    if (!parsed) return;
    const userId = parsed.ids[0]!;
    await prisma.$transaction(async (transaction) => {
      await setPlatformUser(transaction, userId);
      const session = await transaction.platformSession.findUnique({
        where: { tokenHash: hashSessionSecret(parsed.secret) },
      });
      if (!session || session.userId !== userId || session.revokedAt) return;
      await transaction.platformSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      await transaction.platformAuditLog.create({
        data: {
          actorUserId: userId,
          action: "PLATFORM_AUTH_LOGOUT",
          entityType: "platform_session",
          entityId: session.id,
        },
      });
    });
  }
}

export const platformAuthService = new PrismaPlatformAuthService();
