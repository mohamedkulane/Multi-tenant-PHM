import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const tenantIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;

export interface ParsedSessionToken {
  tenantId: string;
  secret: string;
}

export function createSessionToken(tenantId: string) {
  const secret = randomBytes(32).toString("base64url");
  return {
    raw: `${tenantId}.${secret}`,
    hash: hashSessionSecret(secret),
  };
}

export function parseSessionToken(raw: string | undefined): ParsedSessionToken | null {
  if (!raw) return null;
  const separator = raw.indexOf(".");
  if (separator < 0 || raw.indexOf(".", separator + 1) >= 0) return null;

  const tenantId = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (!tenantIdPattern.test(tenantId) || !secretPattern.test(secret)) return null;
  return { tenantId: tenantId.toLowerCase(), secret };
}

export function hashSessionSecret(secret: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(secret, "utf8").digest("hex");
}
