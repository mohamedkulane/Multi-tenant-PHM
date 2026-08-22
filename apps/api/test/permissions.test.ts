import type { TenantRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { roleHasPermission, type Permission } from "../src/auth/permissions.js";
import { canAccessBranch } from "../src/middleware/authorization.js";

describe("tenant role permissions", () => {
  it.each<TenantRole>(["OWNER", "ADMIN", "DOCTOR", "PHARMACIST", "RECEPTIONIST", "LAB_TECHNICIAN"])(
    "%s can load the tenant workspace",
    (role) => {
      expect(roleHasPermission(role, "tenant.read")).toBe(true);
    },
  );
  it.each<[TenantRole, Permission, boolean]>([
    ["OWNER", "tenant.manage", true],
    ["ADMIN", "tenant.manage", false],
    ["DOCTOR", "clinic.consult", true],
    ["PHARMACIST", "inventory.manage", true],
    ["RECEPTIONIST", "audit.read", false],
    ["RECEPTIONIST", "customer.manage", true],
    ["PHARMACIST", "clinic.complete", false],
    ["ADMIN", "supplier.manage", true],
    ["LAB_TECHNICIAN", "lab.result", true],
    ["LAB_TECHNICIAN", "sale.create", false],
    ["LAB_TECHNICIAN", "clinic.complete", false],
    ["LAB_TECHNICIAN", "clinic.examine", false],
    ["DOCTOR", "report.read", false],
    ["DOCTOR", "sale.read", false],
    ["DOCTOR", "expense.read", false],
    ["RECEPTIONIST", "sale.read", false],
    ["PHARMACIST", "diagnosis.create", false],
    ["PHARMACIST", "report.read", false],
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
    expect(canAccessBranch({ ...principal, role: "DOCTOR", allBranches: true }, "branch-b")).toBe(
      false,
    );
    expect(
      canAccessBranch({ ...principal, role: "PHARMACIST", allBranches: true }, "branch-a"),
    ).toBe(true);
    expect(
      canAccessBranch({ ...principal, role: "RECEPTIONIST", allBranches: true }, "branch-b"),
    ).toBe(false);
    expect(
      canAccessBranch({ ...principal, role: "LAB_TECHNICIAN", allBranches: true }, "branch-b"),
    ).toBe(false);
  });
});
