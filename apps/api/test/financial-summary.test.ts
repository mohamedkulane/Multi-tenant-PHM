import { describe, expect, it } from "vitest";
import { financialSummary } from "../src/reporting/financial-summary.js";

const input = {
  pharmacyRevenue: "100.10",
  consultationRevenue: "20.20",
  laboratoryRevenue: "30.30",
  costOfGoods: "60.05",
  operatingExpenses: "40.15",
  pharmacyReceivables: "10",
  consultationReceivables: "20",
  laboratoryReceivables: "5",
  overduePharmacyReceivables: "4",
  missingCostItems: 0,
};
describe("financial overview", () => {
  it("combines each revenue stream once and subtracts COGS and posted expenses precisely", () => {
    const result = financialSummary(input);
    expect(result.totalRevenue).toBe("150.6000");
    expect(result.grossProfit).toBe("90.5500");
    expect(result.netIncome).toBe("50.4000");
    expect(result.accountsReceivable).toBe("35.0000");
  });
  it("does not count debt collection as new revenue or subtract outstanding AR from profit", () => {
    const paid = financialSummary({
      ...input,
      pharmacyReceivables: "0",
      consultationReceivables: "0",
      laboratoryReceivables: "0",
    });
    expect(paid.netIncome).toBe(financialSummary(input).netIncome);
    expect(paid.accountsReceivable).toBe("0.0000");
  });
  it("shows losses and retains the missing-cost warning", () => {
    const result = financialSummary({ ...input, operatingExpenses: "200", missingCostItems: 2 });
    expect(result.netIncome).toBe("-109.4500");
    expect(result.missingCostItems).toBe(2);
  });
});
