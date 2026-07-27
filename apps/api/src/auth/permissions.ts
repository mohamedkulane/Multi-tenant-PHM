import type { TenantRole } from "@prisma/client";

export const permissions = [
  "tenant.read",
  "tenant.manage",
  "branch.read",
  "branch.manage",
  "member.read",
  "member.manage",
  "inventory.read",
  "inventory.manage",
  "sale.read",
  "sale.create",
  "sale.payment",
  "sale.return",
  "sale.void",
  "expense.read",
  "expense.manage",
  "expense.void",
  "report.read",
  "audit.read",
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Record<TenantRole, ReadonlySet<Permission>> = {
  OWNER: new Set(permissions),
  ADMIN: new Set(permissions.filter((permission) => permission !== "tenant.manage")),
  MANAGER: new Set([
    "tenant.read",
    "branch.read",
    "member.read",
    "inventory.read",
    "inventory.manage",
    "sale.read",
    "sale.create",
    "sale.payment",
    "sale.return",
    "sale.void",
    "expense.read",
    "expense.manage",
    "report.read",
    "audit.read",
  ]),
  PHARMACIST: new Set([
    "branch.read",
    "inventory.read",
    "inventory.manage",
    "sale.read",
    "sale.create",
    "report.read",
  ]),
  CASHIER: new Set(["branch.read", "inventory.read", "sale.read", "sale.create"]),
  AUDITOR: new Set([
    "tenant.read",
    "branch.read",
    "member.read",
    "inventory.read",
    "expense.read",
    "report.read",
    "audit.read",
  ]),
};

export function roleHasPermission(role: TenantRole, permission: Permission) {
  return rolePermissions[role].has(permission);
}
