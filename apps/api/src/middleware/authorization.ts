import type { RequestHandler } from "express";
import { roleHasPermission, type Permission } from "../auth/permissions.js";
import { AppError } from "../errors/app-error.js";

const supportReadPermissions = new Set<Permission>([
  "tenant.read",
  "branch.read",
  "member.read",
  "customer.read",
  "supplier.read",
  "clinic.read",
  "lab.order.read",
  "lab.catalog.read",
  "lab.result.read",
  "inventory.read",
  "expense.read",
  "report.read",
  "audit.read",
]);

export function requirePermission(permission: Permission): RequestHandler {
  return (request, _response, next) => {
    const permitted = request.auth?.isSupportSession
      ? supportReadPermissions.has(permission)
      : Boolean(request.auth && roleHasPermission(request.auth.role, permission));
    if (!request.auth || !permitted) {
      next(
        new AppError({
          statusCode: 403,
          code: "PERMISSION_DENIED",
          message: "You do not have permission to perform this action",
        }),
      );
      return;
    }
    next();
  };
}

export function requireAnyPermission(...requested: Permission[]): RequestHandler {
  return (request, _response, next) => {
    const permitted = request.auth?.isSupportSession
      ? requested.some((permission) => supportReadPermissions.has(permission))
      : Boolean(
          request.auth &&
          requested.some((permission) => roleHasPermission(request.auth!.role, permission)),
        );
    if (!request.auth || !permitted) {
      next(
        new AppError({
          statusCode: 403,
          code: "PERMISSION_DENIED",
          message: "You do not have permission to perform this action",
        }),
      );
      return;
    }
    next();
  };
}

export function canAccessBranch(principal: NonNullable<Express.Request["auth"]>, branchId: string) {
  const mayUseAllBranches =
    principal.isSupportSession || principal.role === "OWNER" || principal.role === "ADMIN";
  return (mayUseAllBranches && principal.allBranches) || principal.branchIds.includes(branchId);
}
