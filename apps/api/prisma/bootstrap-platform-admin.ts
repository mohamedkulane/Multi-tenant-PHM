import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../src/auth/password.js";
import { prisma } from "../src/database/prisma.js";

const input = z
  .object({
    email: z.email().max(320),
    fullName: z.string().trim().min(2).max(150),
    password: z.string().min(16).max(256),
  })
  .parse({
    email: process.env.PLATFORM_ADMIN_EMAIL,
    fullName: process.env.PLATFORM_ADMIN_FULL_NAME,
    password: process.env.PLATFORM_ADMIN_PASSWORD,
  });

async function bootstrap() {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.platformLoginDirectory.findUnique({
    where: { email },
    select: { userId: true },
  });
  const userId = existing?.userId ?? randomUUID();
  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT
        set_config('app.user_id', ${userId}, true),
        set_config('app.platform_admin', 'true', true)
      `,
    );
    await transaction.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email,
        fullName: input.fullName,
        passwordHash,
      },
      update: {
        email,
        fullName: input.fullName,
        passwordHash,
        status: "ACTIVE",
        tokenVersion: { increment: 1 },
      },
    });
    await transaction.platformUser.upsert({
      where: { userId },
      create: { userId, role: "SUPER_ADMIN" },
      update: { role: "SUPER_ADMIN", active: true },
    });
    await transaction.platformSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await transaction.platformAuditLog.create({
      data: {
        actorUserId: userId,
        action: existing ? "PLATFORM_SUPER_ADMIN_ROTATED" : "PLATFORM_SUPER_ADMIN_BOOTSTRAPPED",
        entityType: "platform_user",
        entityId: userId,
        metadata: { source: "local-bootstrap-command" },
      },
    });
  });

  console.log(`Platform super administrator is ready: ${email}`);
}

bootstrap()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
