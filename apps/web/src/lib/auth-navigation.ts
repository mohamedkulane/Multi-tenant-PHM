export const platformDashboardPath = "/platform/dashboard";

export function tenantLandingPath(role: string) {
  if (role === "CASHIER") return "/sales";
  if (role === "PHARMACIST") return "/inventory";
  if (role === "AUDITOR") return "/reports";
  return "/dashboard";
}
