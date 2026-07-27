import { createHmac, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export function hashOneTimeToken(token: string) {
  return createHmac("sha256", env.SESSION_SECRET).update(token, "utf8").digest("hex");
}

export function createOneTimeToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashOneTimeToken(raw) };
}
