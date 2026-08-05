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

function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/api/v1/platform",
    ...(expires ? { expires } : {}),
  };
}

export function createPlatformAuthRouter(service: PlatformAuthService) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
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
