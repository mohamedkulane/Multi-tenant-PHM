import { describe, expect, it } from "vitest";
import { summarizeCustomerLedgerSale } from "./customer-ledger";

describe("customer ledger sale summary", () => {
  it("explains a fully returned unpaid sale without calling it paid", () => {
    expect(
      summarizeCustomerLedgerSale({
        status: "RETURNED",
        grandTotal: "2.0000",
        returnedTotal: "2.0000",
        amountPaid: "0.0000",
        remainingBalance: "0.0000",
      }),
    ).toMatchObject({
      statusLabel: "Fully returned",
      balanceNote: "Cleared by return",
      originalTotal: 2,
      returnedTotal: 2,
      netTotal: 0,
      amountPaid: 0,
      remainingBalance: 0,
    });
  });

  it("keeps an unpaid completed sale visibly due", () => {
    expect(
      summarizeCustomerLedgerSale({
        status: "COMPLETED",
        grandTotal: "5.0000",
        returnedTotal: "0.0000",
        amountPaid: "0.0000",
        remainingBalance: "5.0000",
      }),
    ).toMatchObject({
      statusLabel: "Payment due",
      balanceNote: "Amount due",
      tone: "danger",
      netTotal: 5,
      remainingBalance: 5,
    });
  });

  it("shows the net total after a partial return", () => {
    expect(
      summarizeCustomerLedgerSale({
        status: "PARTIALLY_RETURNED",
        grandTotal: 10,
        returnedTotal: 4,
        amountPaid: 2,
        remainingBalance: 4,
      }),
    ).toMatchObject({
      statusLabel: "Partially returned",
      balanceNote: "Amount due after return",
      netTotal: 6,
      remainingBalance: 4,
    });
  });
});
