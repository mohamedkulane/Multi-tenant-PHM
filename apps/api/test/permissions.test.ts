import type { TenantRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { roleHasPermission, type Permission } from "../src/auth/permissions.js";

describe("tenant role permissions", () => {
  it.each<[TenantRole, Permission, boolean]>([
    ["OWNER", "tenant.manage", true],
    ["ADMIN", "tenant.manage", false],
    ["MANAGER", "sale.void", true],
    ["PHARMACIST", "inventory.manage", true],
    ["CASHIER", "audit.read", false],
    ["AUDITOR", "sale.create", false],
  ])("%s / %s is %s", (role, permission, expected) => {
    expect(roleHasPermission(role, permission)).toBe(expected);
  });
});
