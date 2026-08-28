import { randomBytes } from "node:crypto";
import { hashSessionSecret } from "../auth/session-token.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const secretPattern = /^[A-Za-z0-9_-]{43}$/;

export function createPlatformToken(
  prefix: "platform" | "support" | "verify" | "reset",
  ids: string[],
) {
  const secret = randomBytes(32).toString("base64url");
  return {
    raw: [prefix, ...ids, secret].join("."),
    hash: hashSessionSecret(secret),
  };
}

export function parsePlatformToken(
  raw: string | undefined,
  prefix: "platform" | "support" | "verify" | "reset",
  idCount: number,
) {
  if (!raw) return null;
  const parts = raw.split(".");
  if (
    parts.length !== idCount + 2 ||
    parts[0] !== prefix ||
    !parts.slice(1, 1 + idCount).every((value) => uuidPattern.test(value)) ||
    !secretPattern.test(parts.at(-1)!)
  ) {
    return null;
  }
  return {
    ids: parts.slice(1, 1 + idCount).map((value) => value.toLowerCase()),
    secret: parts.at(-1)!,
  };
}
