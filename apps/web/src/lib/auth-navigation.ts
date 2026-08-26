export const platformDashboardPath = "/platform/dashboard";

export function tenantLandingPath(role: string) {
  if (role === "DOCTOR") return "/doctor/dashboard";
  if (role === "RECEPTIONIST") return "/reception/dashboard";
  if (role === "LAB_TECHNICIAN") return "/lab/dashboard";
  if (role === "PHARMACIST") return "/pharmacy/dashboard";
  return "/dashboard";
}

export function tenantRouteAllowed(role: string, pathname: string) {
  if (["OWNER", "ADMIN"].includes(role)) return true;
  if (pathname === "/account" || pathname === "/clinic") return true;
  if (role === "DOCTOR")
    return (
      pathname.startsWith("/doctor/") || /^\/clinic\/visits\/[^/]+(?:\/print\/lab)?$/.test(pathname)
    );
  if (role === "RECEPTIONIST")
    return (
      pathname.startsWith("/reception/") ||
      /^\/clinic\/visits\/[^/]+\/print\/(consultation-receipt|lab-receipt)$/.test(pathname)
    );
  if (role === "LAB_TECHNICIAN")
    return (
      pathname === "/lab" ||
      pathname.startsWith("/lab/") ||
      /^\/clinic\/visits\/[^/]+(?:\/print\/lab)?$/.test(pathname)
    );
  if (role === "PHARMACIST")
    return (
      pathname.startsWith("/pharmacy/") ||
      ["/sales", "/invoices", "/inventory", "/products", "/suppliers", "/customers"].includes(
        pathname,
      )
    );
  return false;
}
