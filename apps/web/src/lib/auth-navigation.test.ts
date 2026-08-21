import { describe, expect, it } from "vitest";
import { platformDashboardPath, tenantLandingPath } from "./auth-navigation";

describe("separate login destinations", () => {
  it("uses the dedicated platform dashboard route", () => {
    expect(platformDashboardPath).toBe("/platform/dashboard");
  });

  it.each([
    ["OWNER", "/dashboard"],
    ["ADMIN", "/dashboard"],
    ["DOCTOR", "/clinic"],
    ["RECEPTIONIST", "/clinic"],
    ["PHARMACIST", "/clinic"],
    ["LAB_TECHNICIAN", "/clinic"],
  ])("sends %s to %s", (role, destination) => {
    expect(tenantLandingPath(role)).toBe(destination);
  });
});
