import type { PlatformRole } from "@prisma/client";
import { parseCookie } from "cookie";
import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";
import type { PlatformAuthService } from "../platform/platform-auth.types.js";

export const platformCookieName = "phms_platform_session";

export function readPlatformCookie(header: string | undefined) {
  return header ? parseCookie(header)[platformCookieName] : undefined;
}

export function requirePlatformAuthentication(service: PlatformAuthService): RequestHandler {
  return async (request, _response, next) => {
    const principal = await service.authenticate(readPlatformCookie(request.headers.cookie));
    if (!principal) {
      next(
        new AppError({
          statusCode: 401,
          code: "PLATFORM_AUTHENTICATION_REQUIRED",
          message: "Platform authentication is required",
        }),
      );
      return;
    }
    request.platformAuth = principal;
    next();
  };
}

export function requirePlatformRole(...roles: PlatformRole[]): RequestHandler {
  return (request, _response, next) => {
    if (!request.platformAuth || !roles.includes(request.platformAuth.role)) {
      next(
        new AppError({
          statusCode: 403,
          code: "PLATFORM_PERMISSION_DENIED",
          message: "You do not have permission for this platform operation",
        }),
      );
      return;
    }
    next();
  };
}
