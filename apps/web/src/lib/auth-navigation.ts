export const platformDashboardPath = "/platform/dashboard";

export function tenantLandingPath(role: string) {
  if (["DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECHNICIAN"].includes(role)) return "/clinic";
  return "/dashboard";
}
