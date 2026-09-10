type SaleRecord = Record<string, unknown>;

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function summarizeCustomerLedgerSale(sale: SaleRecord) {
  const status = typeof sale["status"] === "string" ? sale["status"] : "COMPLETED";
  const originalTotal = amount(sale["grandTotal"]);
  const returnedTotal = Math.min(originalTotal, amount(sale["returnedTotal"]));
  const netTotal = Math.max(0, originalTotal - returnedTotal);
  const amountPaid = amount(sale["amountPaid"]);
  const remainingBalance = amount(sale["remainingBalance"]);

  if (status === "VOIDED") {
    return {
      statusLabel: "Voided",
      balanceNote: "Voided sale",
      tone: "muted" as const,
      originalTotal,
      returnedTotal,
      netTotal,
      amountPaid,
      remainingBalance,
    };
  }
  if (status === "RETURNED") {
    return {
      statusLabel: "Fully returned",
      balanceNote: "Cleared by return",
      tone: "warning" as const,
      originalTotal,
      returnedTotal,
      netTotal,
      amountPaid,
      remainingBalance,
    };
  }
  if (status === "PARTIALLY_RETURNED") {
    return {
      statusLabel: "Partially returned",
      balanceNote: remainingBalance > 0 ? "Amount due after return" : "Settled after return",
      tone: remainingBalance > 0 ? ("danger" as const) : ("warning" as const),
      originalTotal,
      returnedTotal,
      netTotal,
      amountPaid,
      remainingBalance,
    };
  }
  return {
    statusLabel: remainingBalance > 0 ? "Payment due" : "Paid in full",
    balanceNote: remainingBalance > 0 ? "Amount due" : "Paid in full",
    tone: remainingBalance > 0 ? ("danger" as const) : ("success" as const),
    originalTotal,
    returnedTotal,
    netTotal,
    amountPaid,
    remainingBalance,
  };
}
