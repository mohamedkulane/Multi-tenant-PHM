import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import {
  platformCookieName,
  readPlatformCookie,
  requirePlatformAuthentication,
} from "../middleware/platform-authentication.js";
import type { PlatformAuthService } from "../platform/platform-auth.types.js";
import {
  platformRecoveryService,
  type PlatformRecoveryService,
} from "../platform/platform-recovery.service.js";
import { logger } from "../lib/logger.js";

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/v1/platform",
    ...(expires ? { expires } : {}),
  };
}

export function createPlatformAuthRouter(
  service: PlatformAuthService,
  recovery: PlatformRecoveryService = platformRecoveryService,
) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many sign-in attempts. Please wait 15 minutes before trying again.",
      },
    },
  });
  const recoveryLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many recovery requests. Wait 15 minutes before trying again.",
      },
    },
  });
  router.use(
    ["/forgot-password", "/request-verification", "/reset-password", "/verify-email"],
    recoveryLimiter,
    (_req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      next();
    },
  );
  for (const [path, purpose] of [
    ["/forgot-password", "reset"],
    ["/request-verification", "verify"],
  ] as const) {
    router.post(path, (request, response) => {
      const { email } = z.object({ email: z.email().max(320) }).parse(request.body);
      recovery.assertConfigured();
      // Respond before account lookup/SMTP so response content and timing cannot enumerate emails.
      response
        .status(202)
        .json({
          data: {
            message:
              purpose === "verify"
                ? "If this is an active platform account that needs verification, a link will be sent. Check your inbox and spam folder."
                : "If this is an active platform account with a verified email, a reset link will be sent. Check your inbox and spam folder.",
          },
        });
      setImmediate(() => {
        void recovery
          .request(email, purpose)
          .catch(() =>
            logger.error(
              { event: "PLATFORM_RECOVERY_REQUEST_FAILED" },
              "Recovery request failed; check database and mail service",
            ),
          );
      });
    });
  }
  router.post("/verify-email", async (request, response) => {
    const { token } = z.object({ token: z.string().min(1).max(256) }).parse(request.body);
    await recovery.consume(token, "verify");
    response.json({ data: { message: "Email verified. You can now request a password reset." } });
  });
  router.post("/reset-password", async (request, response) => {
    const body = z
      .object({
        token: z.string().min(1).max(256),
        password: z.string().min(16).max(256),
        confirmPassword: z.string(),
      })
      .refine((value) => value.password === value.confirmPassword, {
        path: ["confirmPassword"],
        message: "Passwords do not match",
      })
      .parse(request.body);
    await recovery.consume(body.token, "reset", body.password);
    response.clearCookie(platformCookieName, cookieOptions());
    response.json({
      data: {
        message:
          "Password changed. All existing platform sessions have been closed. Sign in with your new password.",
      },
    });
  });

  router.post("/login", limiter, async (request, response) => {
    const body = z
      .object({
        email: z.email().max(320),
        password: z.string().min(8).max(256),
      })
      .parse(request.body);
    const result = await service.login({
      ...body,
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(request.header("user-agent")
        ? { userAgent: request.header("user-agent")!.slice(0, 512) }
        : {}),
    });
    if (!["SUPER_ADMIN", "ADMIN"].includes(result.principal.role)) {
      throw new AppError({
        statusCode: 401,
        code: "INVALID_PLATFORM_CREDENTIALS",
        message: "Invalid platform credentials",
      });
    }
    response.cookie(platformCookieName, result.sessionToken, cookieOptions(result.expiresAt));
    response.json({ data: result.principal });
  });

  router.post("/logout", async (request, response) => {
    await service.logout(readPlatformCookie(request.headers.cookie));
    response.clearCookie(platformCookieName, cookieOptions());
    response.status(204).send();
  });

  router.get("/me", requirePlatformAuthentication(service), (request, response) => {
    response.json({ data: request.platformAuth });
  });

  return router;
}
