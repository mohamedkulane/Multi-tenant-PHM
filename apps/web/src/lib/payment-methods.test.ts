import { describe, expect, it } from "vitest";
import { PAYMENT_METHOD_OPTIONS, formatPaymentMethod, toPaymentMethod } from "./payment-methods";

describe("payment method UI configuration", () => {
  it("exposes only the three supported methods", () => {
    expect(PAYMENT_METHOD_OPTIONS).toEqual([
      { value: "EVC_PLUS", label: "EVC-Plus" },
      { value: "E_DAHAB", label: "E-Dahab" },
      { value: "SALAAM_BANK", label: "Salaam Bank" },
      { value: "MERCHANT", label: "Merchant" },
    ]);
  });

  it("never exposes raw canonical values to customers", () => {
    expect(formatPaymentMethod("EVC_PLUS")).toBe("EVC-Plus");
    expect(formatPaymentMethod("E_DAHAB")).toBe("E-Dahab");
    expect(formatPaymentMethod("SALAAM_BANK")).toBe("Salaam Bank");
    expect(formatPaymentMethod("MERCHANT")).toBe("Merchant");
  });

  it("falls back safely when a DOM value is unsupported", () => {
    expect(toPaymentMethod("CASH")).toBe("EVC_PLUS");
  });
});
