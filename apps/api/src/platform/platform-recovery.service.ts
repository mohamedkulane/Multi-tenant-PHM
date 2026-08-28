import type { Prisma } from "@prisma/client";
import { hashPassword } from "../auth/password.js";
import { hashSessionSecret } from "../auth/session-token.js";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { AppError } from "../errors/app-error.js";
import { logger } from "../lib/logger.js";
import { platformMailer, type PlatformMailer } from "./platform-mail.js";
import { createPlatformToken, parsePlatformToken } from "./platform-token.js";

export type RecoveryPurpose = "verify" | "reset";
export interface PlatformRecoveryService {
  assertConfigured(): void;
  request(email: string, purpose: RecoveryPurpose): Promise<void>;
  consume(token: string, purpose: RecoveryPurpose, password?: string): Promise<void>;
}
const invalidLink = () =>
  new AppError({
    statusCode: 400,
    code: "RECOVERY_LINK_INVALID",
    message: "This link has expired, was already used, or is invalid. Request a new email.",
  });

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
  // Serialize token issue/consume with password and email changes, including concurrent requests.
  await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${userId}::uuid FOR UPDATE`;
}

export class PrismaPlatformRecoveryService implements PlatformRecoveryService {
  constructor(private readonly mailer: PlatformMailer = platformMailer) {}

  assertConfigured() {
    this.mailer.assertConfigured();
  }

  async request(email: string, purpose: RecoveryPurpose) {
    this.assertConfigured();
    const directory = await prisma.platformLoginDirectory.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!directory?.active) return;
    const issued = await prisma.$transaction(async (tx) => {
      await lockUser(tx, directory.userId);
      const access = await tx.platformUser.findUnique({
        where: { userId: directory.userId },
        include: { user: true },
      });
      if (
        !access?.active ||
        !["SUPER_ADMIN", "ADMIN"].includes(access.role) ||
        access.user.status !== "ACTIVE" ||
        !access.user.email
      )
        return null;
      const verified = Boolean(
        access.emailVerifiedAt && access.verifiedEmail === access.user.email,
      );
      if ((purpose === "reset" && !verified) || (purpose === "verify" && verified)) return null;
      const previous = await tx.platformRecoveryToken.findUnique({
        where: { userId_purpose: { userId: access.userId, purpose } },
      });
      // Per-account cooldown persists across processes and restarts; no inbox flooding.
      if (previous && Date.now() - previous.createdAt.getTime() < 60_000) return null;
      const token = createPlatformToken(purpose, [access.userId]);
      const data = {
        email: access.user.email,
        tokenHash: token.hash,
        tokenVersion: access.user.tokenVersion,
        expiresAt: new Date(Date.now() + (purpose === "verify" ? 60 : 20) * 60_000),
        consumedAt: null,
        createdAt: new Date(),
      };
      await tx.platformRecoveryToken.upsert({
        where: { userId_purpose: { userId: access.userId, purpose } },
        create: { userId: access.userId, purpose, ...data },
        update: data,
      });
      return { email: access.user.email, token: token.raw, userId: access.userId };
    });
    if (!issued) return;
    const url = new URL(
      `/platform/${purpose === "verify" ? "verify-email" : "reset-password"}`,
      env.PLATFORM_WEB_URL,
    );
    // Fragments are never sent to HTTP access logs or Referer headers.
    url.hash = new URLSearchParams({ token: issued.token }).toString();
    try {
      await this.mailer.send(
        issued.email,
        purpose === "verify"
          ? "Verify your PHMS platform email"
          : "Reset your PHMS platform password",
        `${purpose === "verify" ? "Verify that you own this email address to enable password recovery." : "Choose a new password for your platform account."}\n\n${url.toString()}\n\nThis link can be used once and expires in ${purpose === "verify" ? "60" : "20"} minutes. If you did not request it, ignore this email. No password has been changed.`,
      );
    } catch {
      // Never log provider errors, addresses or links: providers may include credentials/message bodies.
      logger.error(
        { event: "PLATFORM_RECOVERY_DELIVERY_FAILED", userId: issued.userId },
        "Platform email delivery failed; check SMTP configuration",
      );
      throw new AppError({
        statusCode: 503,
        code: "EMAIL_DELIVERY_UNAVAILABLE",
        message: "Email delivery failed",
      });
    }
  }

  async consume(raw: string, purpose: RecoveryPurpose, password?: string) {
    const parsed = parsePlatformToken(raw, purpose, 1);
    if (
      !parsed ||
      (purpose === "reset" && (!password || password.length < 16 || password.length > 256))
    )
      throw invalidLink();
    const userId = parsed.ids[0]!;
    // Hash only after token validation, inside the locked transaction, to avoid a public Argon2 DoS.
    const changed = await prisma.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const token = await tx.platformRecoveryToken.findUnique({
        where: { userId_purpose: { userId, purpose } },
      });
      const access = await tx.platformUser.findUnique({
        where: { userId },
        include: { user: true },
      });
      if (
        !token ||
        token.tokenHash !== hashSessionSecret(parsed.secret) ||
        token.consumedAt ||
        token.expiresAt <= new Date() ||
        !access?.active ||
        !["SUPER_ADMIN", "ADMIN"].includes(access.role) ||
        access.user.status !== "ACTIVE" ||
        token.email !== access.user.email ||
        token.tokenVersion !== access.user.tokenVersion ||
        (purpose === "reset" &&
          (!access.emailVerifiedAt || access.verifiedEmail !== access.user.email))
      )
        throw invalidLink();
      await tx.platformRecoveryToken.update({
        where: { userId_purpose: { userId, purpose } },
        data: { consumedAt: new Date() },
      });
      if (purpose === "verify") {
        await tx.platformUser.update({
          where: { userId },
          data: { verifiedEmail: token.email, emailVerifiedAt: new Date() },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash: await hashPassword(password!), tokenVersion: { increment: 1 } },
        });
        await tx.platformSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.supportSession.updateMany({
          where: { platformUserId: userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.platformAuditLog.create({
        data: {
          actorUserId: userId,
          action: purpose === "verify" ? "PLATFORM_EMAIL_VERIFIED" : "PLATFORM_PASSWORD_RESET",
          entityType: "platform_user",
          entityId: userId,
        },
      });
      return token.email;
    });
    if (purpose === "reset") {
      // Notification failure must not roll back an already-completed password reset.
      void this.mailer
        .send(
          changed,
          "Your PHMS platform password was changed",
          "Your password was reset and your platform sessions were closed. If this was not you, contact your platform administrator immediately.",
        )
        .catch(() =>
          logger.error(
            { event: "PLATFORM_PASSWORD_NOTICE_FAILED", userId },
            "Password-change notification could not be delivered",
          ),
        );
    }
  }
}
export const platformRecoveryService = new PrismaPlatformRecoveryService();
