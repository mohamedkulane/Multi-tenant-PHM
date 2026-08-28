import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaPlatformRecoveryService } from "../src/platform/platform-recovery.service.js";
import { createPlatformToken } from "../src/platform/platform-token.js";
import { createPlatformAuthRouter } from "../src/routes/platform-auth.routes.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import type { PlatformAuthService } from "../src/platform/platform-auth.types.js";
import type * as EnvModule from "../src/config/env.js";

const db = vi.hoisted(() => ({
  directory: { findUnique: vi.fn() },
  tx: {
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    platformUser: { findUnique: vi.fn(), update: vi.fn() },
    platformRecoveryToken: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    platformSession: { updateMany: vi.fn() },
    supportSession: { updateMany: vi.fn() },
    platformAuditLog: { create: vi.fn() },
  },
}));
vi.mock("../src/database/prisma.js", () => ({
  prisma: {
    platformLoginDirectory: db.directory,
    $transaction: (callback: (tx: typeof db.tx) => unknown) => callback(db.tx),
  },
}));
vi.mock("../src/config/env.js", async (original) => {
  const module = await original<typeof EnvModule>();
  return { env: { ...module.env, PLATFORM_WEB_URL: "https://phms.example.test" } };
});
vi.mock("../src/auth/password.js", () => ({
  hashPassword: vi.fn().mockResolvedValue("argon2-hash"),
}));
const userId = "6f15cb24-20f2-42df-b0ef-88e7e2a20011";
const email = "admin@example.test";
const mailer = { assertConfigured: vi.fn(), send: vi.fn().mockResolvedValue(undefined) };
const service = new PrismaPlatformRecoveryService(mailer);
const access = () => ({
  userId,
  role: "SUPER_ADMIN",
  active: true,
  verifiedEmail: email,
  emailVerifiedAt: new Date(),
  user: { id: userId, email, status: "ACTIVE", tokenVersion: 2 },
});
const recoveryToken = (purpose: "verify" | "reset" = "reset") => {
  const token = createPlatformToken(purpose, [userId]);
  return {
    raw: token.raw,
    record: {
      userId,
      purpose,
      email,
      tokenHash: token.hash,
      tokenVersion: 2,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 600_000),
      createdAt: new Date(Date.now() - 120_000),
    },
  };
};
beforeEach(() => {
  vi.clearAllMocks();
  db.directory.findUnique.mockResolvedValue({ userId, email, active: true });
  db.tx.platformUser.findUnique.mockResolvedValue(access());
  db.tx.platformRecoveryToken.findUnique.mockResolvedValue(null);
  mailer.assertConfigured.mockImplementation(() => undefined);
  mailer.send.mockResolvedValue(undefined);
});
describe("platform email ownership and recovery", () => {
  it("does not send reset email for unknown or unverified users", async () => {
    db.directory.findUnique.mockResolvedValueOnce(null);
    await service.request(email, "reset");
    db.tx.platformUser.findUnique.mockResolvedValue({ ...access(), emailVerifiedAt: null });
    await service.request(email, "reset");
    expect(mailer.send).not.toHaveBeenCalled();
  });
  it("issues a hashed, expiring verification token bound to the registered email", async () => {
    db.tx.platformUser.findUnique.mockResolvedValue({ ...access(), emailVerifiedAt: null });
    await service.request(" ADMIN@example.test ", "verify");
    expect(db.directory.findUnique).toHaveBeenCalledWith({ where: { email } });
    const body = String(mailer.send.mock.calls[0]?.[2]);
    expect(body).toContain("https://phms.example.test/platform/verify-email#token=");
    const stored = db.tx.platformRecoveryToken.upsert.mock.calls[0]?.[0] as {
      create: { tokenHash: string; expiresAt: Date; email: string };
    };
    expect(stored.create.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body).not.toContain(stored.create.tokenHash);
    expect(stored.create.email).toBe(email);
    expect(stored.create.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
  it("enforces a per-account resend cooldown", async () => {
    db.tx.platformRecoveryToken.findUnique.mockResolvedValue({ createdAt: new Date() });
    await service.request(email, "reset");
    expect(mailer.send).not.toHaveBeenCalled();
  });
  it("only marks the email verified when the valid link is explicitly consumed", async () => {
    const token = recoveryToken("verify");
    db.tx.platformRecoveryToken.findUnique.mockResolvedValue(token.record);
    await service.consume(token.raw, "verify");
    expect(db.tx.platformUser.update).toHaveBeenCalledWith({
      where: { userId },
      data: { verifiedEmail: email, emailVerifiedAt: expect.any(Date) },
    });
    expect(db.tx.user.update).not.toHaveBeenCalled();
  });
  it.each(["expired", "used", "wrong email", "changed password", "disabled", "unverified"])(
    "rejects %s reset links",
    async (reason) => {
      const token = recoveryToken();
      db.tx.platformRecoveryToken.findUnique.mockResolvedValue({
        ...token.record,
        ...(reason === "expired" ? { expiresAt: new Date(0) } : {}),
        ...(reason === "used" ? { consumedAt: new Date() } : {}),
        ...(reason === "wrong email" ? { email: "other@example.test" } : {}),
        ...(reason === "changed password" ? { tokenVersion: 1 } : {}),
      });
      db.tx.platformUser.findUnique.mockResolvedValue({
        ...access(),
        ...(reason === "disabled" ? { active: false } : {}),
        ...(reason === "unverified" ? { emailVerifiedAt: null } : {}),
      });
      await expect(
        service.consume(token.raw, "reset", "New-long-password-123!"),
      ).rejects.toMatchObject({ code: "RECOVERY_LINK_INVALID" });
      expect(db.tx.user.update).not.toHaveBeenCalled();
    },
  );
  it("rejects token purpose substitution and malformed tokens", async () => {
    await expect(
      service.consume(recoveryToken("verify").raw, "reset", "New-long-password-123!"),
    ).rejects.toMatchObject({ code: "RECOVERY_LINK_INVALID" });
    await expect(service.consume("broken", "verify")).rejects.toMatchObject({
      code: "RECOVERY_LINK_INVALID",
    });
  });
  it("changes the password and revokes all platform and support sessions atomically", async () => {
    const token = recoveryToken();
    db.tx.platformRecoveryToken.findUnique.mockResolvedValue(token.record);
    await service.consume(token.raw, "reset", "New-long-password-123!");
    expect(db.tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: { passwordHash: "argon2-hash", tokenVersion: { increment: 1 } },
    });
    expect(db.tx.platformRecoveryToken.update).toHaveBeenCalled();
    expect(db.tx.platformSession.updateMany).toHaveBeenCalledWith({
      where: { userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.tx.supportSession.updateMany).toHaveBeenCalled();
    expect(db.tx.platformAuditLog.create).toHaveBeenCalled();
    expect(JSON.stringify(db.tx.platformAuditLog.create.mock.calls)).not.toContain(token.raw);
  });
});
describe("public recovery routes", () => {
  const auth = {
    login: vi.fn(),
    logout: vi.fn(),
    authenticate: vi.fn(),
  } satisfies PlatformAuthService;
  function app(
    recovery = {
      assertConfigured: vi.fn(),
      request: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockResolvedValue(undefined),
    },
  ) {
    const server = express();
    server.use(express.json());
    server.use(createPlatformAuthRouter(auth, recovery));
    server.use(errorHandler);
    return { server, recovery };
  }
  it("accepts requests without revealing account existence", async () => {
    const { server, recovery } = app();
    const a = await request(server).post("/forgot-password").send({ email });
    const b = await request(server)
      .post("/forgot-password")
      .send({ email: "unknown@example.test" });
    expect(a.status).toBe(202);
    expect(a.body).toEqual(b.body);
    expect(a.headers["cache-control"]).toBe("no-store");
    await vi.waitFor(() => expect(recovery.request).toHaveBeenCalledTimes(2));
  });
  it("rejects weak and mismatched passwords before consuming a token", async () => {
    const { server, recovery } = app();
    expect(
      (
        await request(server)
          .post("/reset-password")
          .send({ token: "x", password: "short", confirmPassword: "short" })
      ).status,
    ).toBe(400);
    const result = await request(server)
      .post("/reset-password")
      .send({ token: "x", password: "New-long-password-123!", confirmPassword: "different" });
    expect(result.status).toBe(400);
    expect(result.body.error.details.issues[0].path).toBe("confirmPassword");
    expect(recovery.consume).not.toHaveBeenCalled();
  });
});
