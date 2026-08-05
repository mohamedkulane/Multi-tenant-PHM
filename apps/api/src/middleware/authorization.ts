import type { RequestHandler } from "express";
import { roleHasPermission, type Permission } from "../auth/permissions.js";
import { AppError } from "../errors/app-error.js";

export function requirePermission(permission: Permission): RequestHandler {
  return (request, _response, next) => {
    if (!request.auth || !roleHasPermission(request.auth.role, permission)) {
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
  const mayUseAllBranches = principal.role === "OWNER" || principal.role === "ADMIN";
  return (mayUseAllBranches && principal.allBranches) || principal.branchIds.includes(branchId);
}
