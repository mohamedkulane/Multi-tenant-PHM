import { describe, expect, it } from "vitest";
import { filterReceptionVisits, hasPaidLabReceipt, receptionVisitStatus } from "./reception-visits";
const visit = {
  id: "v1",
  visitNumber: "VIS/V001",
  status: "LAB_RESULTS_READY",
  createdAt: "2026-08-20T22:30:00Z",
  patient: { name: "Test Patient", patientNumber: "PT/P001" },
  labVisits: [{ total: "12", amountPaid: "12" }],
};
describe("reception history and receipts", () => {
  it("keeps historical and completed visits in the default view", () =>
    expect(
      filterReceptionVisits([visit, { ...visit, id: "v2", status: "COMPLETED" }], "", ""),
    ).toHaveLength(2));
  it("searches patient and visit identifiers", () => {
    for (const query of ["test patient", "pt/p001", "vis/v001"])
      expect(filterReceptionVisits([visit], query, "")).toHaveLength(1);
    expect(filterReceptionVisits([visit], "missing", "")).toHaveLength(0);
  });
  it("filters dates in the branch timezone", () => {
    expect(filterReceptionVisits([visit], "", "2026-08-21", "Africa/Nairobi")).toHaveLength(1);
    expect(filterReceptionVisits([visit], "", "2026-08-20", "Africa/Nairobi")).toHaveLength(0);
  });
  it("shows payment clearance without disclosing results or later clinical stages", () => {
    for (const status of ["LAB_RESULTS_READY", "DOCTOR_REVIEW", "AT_PHARMACY", "COMPLETED"])
      expect(receptionVisitStatus({ ...visit, status })).toBe("LAB PAYMENT CLEARED");
  });
  it("allows old paid receipts, but not missing or partial payment data", () => {
    expect(hasPaidLabReceipt(visit)).toBe(true);
    expect(hasPaidLabReceipt({ ...visit, labVisits: [{ total: 12, amountPaid: 3 }] })).toBe(false);
    expect(hasPaidLabReceipt({ ...visit, labVisits: [{}] })).toBe(false);
  });
  it("keeps a new unpaid order actionable without losing the previous receipt", () => {
    expect(receptionVisitStatus({ ...visit, status: "AWAITING_LAB_PAYMENT" })).toBe(
      "AWAITING_LAB_PAYMENT",
    );
    expect(
      hasPaidLabReceipt({
        ...visit,
        labVisits: [{ total: 20, amountPaid: 0 }, ...visit.labVisits],
      }),
    ).toBe(true);
  });
});
