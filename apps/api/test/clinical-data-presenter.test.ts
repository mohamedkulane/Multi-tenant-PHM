import type { TenantRole } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "../src/auth/auth.types.js";
import { presentClinicalData } from "../src/clinic/clinical-data-presenter.js";

function principal(role: TenantRole): AuthenticatedPrincipal {
  return {
    sessionId: "session",
    tenantId: "tenant",
    tenantName: "Tenant",
    userId: "user",
    fullName: "User",
    membershipId: "membership",
    username: "user",
    role,
    allBranches: false,
    branchIds: ["branch"],
  };
}

const visit = {
  id: "visit",
  consultationFee: "5.00",
  consultationPaymentStatus: "PAID",
  clinicalPayments: [{ amount: "5.00", method: "CASH" }],
  labVisits: [
    {
      id: "lab",
      subtotal: "9.00",
      discount: "0.00",
      total: "9.00",
      amountPaid: "9.00",
      paymentMethod: "CASH",
      payments: [{ amount: "9.00", method: "CASH" }],
      tests: [{ testName: "Malaria", price: "3.00", labTest: { name: "Malaria", price: "3.00" } }],
    },
  ],
};

describe("clinical financial data presentation", () => {
  it.each<TenantRole>(["DOCTOR", "LAB_TECHNICIAN"])(
    "returns only PAID status and no financial data to %s",
    (role) => {
      const output = presentClinicalData(principal(role), visit) as Record<string, unknown>;
      const serialized = JSON.stringify(output);

      expect(serialized).not.toMatch(
        /consultationFee|clinicalPayments|subtotal|discount|amountPaid|paymentMethod|payments|price/,
      );
      expect(output["consultationPaymentStatus"]).toBe("PAID");
      expect(serialized).toContain('"paymentStatus":"PAID"');
      expect(serialized).toContain('"testName":"Malaria"');
    },
  );

  it("keeps full financial data for Reception", () => {
    expect(presentClinicalData(principal("RECEPTIONIST"), visit)).toBe(visit);
  });
});
