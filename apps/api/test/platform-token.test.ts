import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPlatformToken, parsePlatformToken } from "../src/platform/platform-token.js";

describe("platform and support tokens", () => {
  it("round-trips a platform session token without storing the raw secret", () => {
    const userId = randomUUID();
    const token = createPlatformToken("platform", [userId]);
    const parsed = parsePlatformToken(token.raw, "platform", 1);

    expect(parsed?.ids).toEqual([userId]);
    expect(parsed?.secret).toHaveLength(43);
    expect(token.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(token.raw).not.toContain(token.hash);
  });

  it("binds support tokens to both platform user and tenant", () => {
    const userId = randomUUID();
    const tenantId = randomUUID();
    const token = createPlatformToken("support", [userId, tenantId]);

    expect(parsePlatformToken(token.raw, "support", 2)?.ids).toEqual([userId, tenantId]);
    expect(parsePlatformToken(token.raw, "platform", 1)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(parsePlatformToken("support.not-a-uuid.secret", "support", 2)).toBeNull();
    expect(parsePlatformToken(undefined, "platform", 1)).toBeNull();
  });
});
