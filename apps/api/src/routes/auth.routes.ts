import { Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { env } from "../config/env.js";
import { readSessionCookie, requireAuthentication } from "../middleware/authentication.js";

const loginSchema = z.object({
  tenantSlug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/i),
  username: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(256),
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(150),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8).max(256),
    newPassword: z.string().min(12).max(256),
    confirmPassword: z.string().min(12).max(256),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/api/v1",
    ...(expires ? { expires } : {}),
  };
}

function safeUserAgent(value: string | undefined) {
  return value?.slice(0, 512);
}

async function safeSecurityAudit(
  service: AuthService,
  input: Parameters<NonNullable<AuthService["recordSecurityEvent"]>>[0],
) {
  try {
    await service.recordSecurityEvent?.(input);
  } catch {
    // Security telemetry must never replace the intended authentication response.
  }
}

export function createAuthRouter(service: AuthService) {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: async (request, response) => {
      const body = request.body as Record<string, unknown>;
      await safeSecurityAudit(service, {
        action: "AUTH_LOGIN_RATE_LIMITED",
        ...(typeof body["tenantSlug"] === "string" ? { tenantSlug: body["tenantSlug"] } : {}),
        ...(typeof body["username"] === "string" ? { username: body["username"] } : {}),
        ...(request.ip ? { ipAddress: request.ip } : {}),
        ...(safeUserAgent(request.header("user-agent"))
          ? { userAgent: safeUserAgent(request.header("user-agent"))! }
          : {}),
        metadata: { route: "/api/v1/auth/login" },
      });
      response.status(429).json({
        error: {
          code: "TOO_MANY_LOGIN_ATTEMPTS",
          message: "Too many login attempts; try again later",
        },
      });
    },
  });

  router.post("/login", loginLimiter, async (request, response) => {
    const body = loginSchema.parse(request.body);
    const ipAddress = request.ip;
    const userAgent = safeUserAgent(request.header("user-agent"));
    try {
      const result = await service.login({
        ...body,
        ...(ipAddress ? { ipAddress } : {}),
        ...(userAgent ? { userAgent } : {}),
      });
      response.cookie(
        env.SESSION_COOKIE_NAME,
        result.sessionToken,
        cookieOptions(result.expiresAt),
      );
      response.status(200).json({ data: result.principal });
    } catch (error) {
      await safeSecurityAudit(service, {
        action: "AUTH_LOGIN_FAILED",
        tenantSlug: body.tenantSlug,
        username: body.username,
        ...(ipAddress ? { ipAddress } : {}),
        ...(userAgent ? { userAgent } : {}),
        metadata: { route: "/api/v1/auth/login" },
      });
      throw error;
    }
  });

  const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (request) =>
      `${request.auth?.membershipId ?? "anonymous"}:${ipKeyGenerator(request.ip ?? "")}`,
    handler: async (request, response) => {
      await safeSecurityAudit(service, {
        action: "PASSWORD_CHANGE_RATE_LIMITED",
        ...(request.auth ? { principal: request.auth } : {}),
        ...(request.ip ? { ipAddress: request.ip } : {}),
        ...(safeUserAgent(request.header("user-agent"))
          ? { userAgent: safeUserAgent(request.header("user-agent"))! }
          : {}),
        metadata: { route: "/api/v1/auth/change-password" },
      });
      response.status(429).json({
        error: {
          code: "PASSWORD_CHANGE_RATE_LIMITED",
          message: "Too many password-change attempts; try again later",
        },
      });
    },
  });

  router.post("/logout", async (request, response) => {
    await service.logout(readSessionCookie(request.headers.cookie));
    response.clearCookie(env.SESSION_COOKIE_NAME, cookieOptions());
    response.status(204).send();
  });

  router.get("/me", requireAuthentication(service), (request, response) => {
    response.json({ data: request.auth });
  });

  router.put("/profile", requireAuthentication(service), async (request, response) => {
    response.json({
      data: await service.updateProfile(request.auth!, profileSchema.parse(request.body)),
    });
  });

  router.post(
    "/change-password",
    requireAuthentication(service),
    passwordChangeLimiter,
    async (request, response) => {
      try {
        const body = passwordSchema.parse(request.body);
        response.json({
          data: await service.changePassword(request.auth!, {
            currentPassword: body.currentPassword,
            newPassword: body.newPassword,
          }),
        });
      } catch (error) {
        await safeSecurityAudit(service, {
          action: "PASSWORD_CHANGE_FAILED",
          ...(request.auth ? { principal: request.auth } : {}),
          ...(request.ip ? { ipAddress: request.ip } : {}),
          ...(safeUserAgent(request.header("user-agent"))
            ? { userAgent: safeUserAgent(request.header("user-agent"))! }
            : {}),
          metadata: { route: "/api/v1/auth/change-password" },
        });
        throw error;
      }
    },
  );

  return router;
}
