import type { TenantRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { roleHasPermission, type Permission } from "../src/auth/permissions.js";
import { canAccessBranch } from "../src/middleware/authorization.js";

describe("tenant role permissions", () => {
  it.each<TenantRole>(["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "CASHIER", "AUDITOR"])(
    "%s can load the tenant workspace",
    (role) => {
      expect(roleHasPermission(role, "tenant.read")).toBe(true);
    },
  );
  it.each<[TenantRole, Permission, boolean]>([
    ["OWNER", "tenant.manage", true],
    ["ADMIN", "tenant.manage", false],
    ["MANAGER", "sale.void", true],
    ["PHARMACIST", "inventory.manage", true],
    ["CASHIER", "audit.read", false],
    ["CASHIER", "customer.manage", true],
    ["PHARMACIST", "lab.manage", false],
    ["ADMIN", "supplier.manage", true],
    ["AUDITOR", "lab.manage", false],
    ["AUDITOR", "sale.create", false],
  ])("%s / %s is %s", (role, permission, expected) => {
    expect(roleHasPermission(role, permission)).toBe(expected);
  });
});

describe("branch role scope", () => {
  const principal = {
    sessionId: "session",
    tenantId: "tenant",
    tenantName: "Tenant",
    userId: "user",
    fullName: "User",
    membershipId: "membership",
    username: "user",
    branchIds: ["branch-a"] as string[],
  } as const;

  it("allows OWNER and ADMIN to use an all-branches grant", () => {
    expect(canAccessBranch({ ...principal, role: "OWNER", allBranches: true }, "branch-b")).toBe(
      true,
    );
    expect(canAccessBranch({ ...principal, role: "ADMIN", allBranches: true }, "branch-b")).toBe(
      true,
    );
  });

  it("keeps every other role inside assigned branches even with a legacy all-branches flag", () => {
    expect(canAccessBranch({ ...principal, role: "MANAGER", allBranches: true }, "branch-b")).toBe(
      false,
    );
    expect(
      canAccessBranch({ ...principal, role: "PHARMACIST", allBranches: true }, "branch-a"),
    ).toBe(true);
    expect(canAccessBranch({ ...principal, role: "CASHIER", allBranches: true }, "branch-b")).toBe(
      false,
    );
    expect(canAccessBranch({ ...principal, role: "AUDITOR", allBranches: true }, "branch-b")).toBe(
      false,
    );
  });
});
