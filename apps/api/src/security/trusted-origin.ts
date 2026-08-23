import type { RequestHandler } from "express";
import { parseCookie } from "cookie";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export const trustedWebOrigins = new Set(
  (Array.isArray(env.WEB_ORIGINS) ? env.WEB_ORIGINS : String(env.WEB_ORIGINS).split(","))
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

function normalizedOrigin(value: string | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).origin.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function isTrustedRequestOrigin(origin: string | undefined, referer: string | undefined) {
  const candidate = normalizedOrigin(origin) ?? normalizedOrigin(referer);
  return Boolean(candidate && trustedWebOrigins.has(candidate));
}

const mutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Cookie-authenticated browser mutations must originate from a configured web origin.
 * Test-only requests without browser metadata remain supported so service/route tests do
 * not need to emulate a browser; an explicitly untrusted Origin is always rejected.
 */
export const requireTrustedMutationOrigin: RequestHandler = (request, _response, next) => {
  if (!mutationMethods.has(request.method)) return next();

  const hasSessionCookie = Boolean(
    request.headers.cookie && parseCookie(request.headers.cookie)[env.SESSION_COOKIE_NAME],
  );
  if (!hasSessionCookie) return next();

  const origin = request.header("origin");
  const referer = request.header("referer");
  if (env.NODE_ENV === "test" && !origin && !referer) return next();
  if (isTrustedRequestOrigin(origin, referer)) return next();

  next(
    new AppError({
      statusCode: 403,
      code: "UNTRUSTED_MUTATION_ORIGIN",
      message: "This authenticated change did not originate from a trusted application",
    }),
  );
};
