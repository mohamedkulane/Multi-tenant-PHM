import type { AuthenticatedPrincipal } from "../src/auth/auth.types.js";
import { describe, expect, it } from "vitest";
import { canAccessBranch } from "../src/middleware/authorization.js";

const principal: AuthenticatedPrincipal = {
  sessionId: "22222222-2222-4222-8222-222222222222",
  tenantId: "11111111-1111-4111-8111-111111111111",
  tenantName: "Acme Pharmacy",
  userId: "33333333-3333-4333-8333-333333333333",
  fullName: "Branch User",
  membershipId: "44444444-4444-4444-8444-444444444444",
  username: "branch-user",
  role: "CASHIER",
  allBranches: false,
  branchIds: ["55555555-5555-4555-8555-555555555555"],
};

describe("branch authorization", () => {
  it("allows an explicitly assigned branch", () => {
    expect(canAccessBranch(principal, principal.branchIds[0]!)).toBe(true);
  });

  it("rejects an unassigned branch", () => {
    expect(canAccessBranch(principal, "66666666-6666-4666-8666-666666666666")).toBe(false);
  });

  it("allows every branch only when the membership has allBranches", () => {
    expect(
      canAccessBranch({ ...principal, allBranches: true }, "66666666-6666-4666-8666-666666666666"),
    ).toBe(true);
  });
});
