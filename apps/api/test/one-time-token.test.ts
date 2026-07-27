import { describe, expect, it } from "vitest";
import { createOneTimeToken, hashOneTimeToken } from "../src/auth/one-time-token.js";

describe("one-time tokens", () => {
  it("returns a random token while persisting only an HMAC digest", () => {
    const token = createOneTimeToken();

    expect(token.raw).toHaveLength(43);
    expect(token.hash).toBe(hashOneTimeToken(token.raw));
    expect(token.hash).not.toContain(token.raw);
  });
});
