import type { RequestHandler } from "express";
import { parseCookie } from "cookie";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import type { AuthService } from "../auth/auth.types.js";

export function readSessionCookie(cookieHeader: string | undefined) {
  return cookieHeader ? parseCookie(cookieHeader)[env.SESSION_COOKIE_NAME] : undefined;
}

export function requireAuthentication(service: AuthService): RequestHandler {
  return async (request, _response, next) => {
    const principal = await service.authenticate(readSessionCookie(request.headers.cookie));
    if (!principal) {
      next(
        new AppError({
          statusCode: 401,
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required",
        }),
      );
      return;
    }
    request.auth = principal;
    next();
  };
}
