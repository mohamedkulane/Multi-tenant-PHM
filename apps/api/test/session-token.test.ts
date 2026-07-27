import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashSessionSecret,
  parseSessionToken,
} from "../src/auth/session-token.js";

const tenantId = "11111111-1111-4111-8111-111111111111";

describe("session token", () => {
  it("creates an opaque secret and stores only its deterministic hash", () => {
    const token = createSessionToken(tenantId);
    const parsed = parseSessionToken(token.raw);

    expect(parsed).not.toBeNull();
    expect(parsed?.tenantId).toBe(tenantId);
    expect(parsed?.secret).toHaveLength(43);
    expect(token.hash).toBe(hashSessionSecret(parsed!.secret));
    expect(token.hash).not.toContain(parsed!.secret);
  });

  it.each([
    undefined,
    "",
    "not-a-token",
    `${tenantId}.short`,
    `not-a-uuid.${"a".repeat(43)}`,
    `${tenantId}.${"a".repeat(43)}.extra`,
  ])("rejects malformed token %s", (raw) => {
    expect(parseSessionToken(raw)).toBeNull();
  });
});
