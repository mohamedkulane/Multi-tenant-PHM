import { describe, expect, it } from "vitest";
import { platformDashboardPath, tenantLandingPath, tenantRouteAllowed } from "./auth-navigation";

describe("separate login destinations", () => {
  it("uses the dedicated platform dashboard route", () => {
    expect(platformDashboardPath).toBe("/platform/dashboard");
  });

  it.each([
    ["OWNER", "/dashboard"],
    ["ADMIN", "/dashboard"],
    ["DOCTOR", "/doctor/dashboard"],
    ["RECEPTIONIST", "/reception/dashboard"],
    ["PHARMACIST", "/pharmacy/dashboard"],
    ["LAB_TECHNICIAN", "/lab/dashboard"],
  ])("sends %s to %s", (role, destination) => {
    expect(tenantLandingPath(role)).toBe(destination);
  });
});

describe("role route isolation", () => {
  it("keeps doctors away from business finance and reports", () => {
    expect(tenantRouteAllowed("DOCTOR", "/sales")).toBe(false);
    expect(tenantRouteAllowed("DOCTOR", "/expenses")).toBe(false);
    expect(tenantRouteAllowed("DOCTOR", "/reports")).toBe(false);
    expect(tenantRouteAllowed("DOCTOR", "/doctor/queue")).toBe(true);
  });
  it("allows each operational role only its work area", () => {
    expect(tenantRouteAllowed("RECEPTIONIST", "/reception/visits")).toBe(true);
    expect(tenantRouteAllowed("LAB_TECHNICIAN", "/lab/orders")).toBe(true);
    expect(tenantRouteAllowed("LAB_TECHNICIAN", "/lab/sample-collection")).toBe(true);
    expect(tenantRouteAllowed("LAB_TECHNICIAN", "/lab/results-entry")).toBe(true);
    expect(tenantRouteAllowed("LAB_TECHNICIAN", "/lab/completed")).toBe(true);
    expect(tenantRouteAllowed("PHARMACIST", "/sales")).toBe(true);
    expect(tenantRouteAllowed("PHARMACIST", "/reports")).toBe(false);
  });
});
