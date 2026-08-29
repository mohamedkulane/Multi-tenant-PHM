import { describe, expect, it } from "vitest";
import {
  PAYMENT_METHODS,
  formatPaymentMethod,
  paymentMethodSchema,
} from "../src/payments/payment-methods.js";

describe("canonical payment methods", () => {
  it.each(PAYMENT_METHODS)("accepts %s for new transactions", (method) => {
    expect(paymentMethodSchema.parse(method)).toBe(method);
  });

  it.each(["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "BANK", "OTHER"])(
    "rejects legacy method %s for new transactions",
    (method) => expect(paymentMethodSchema.safeParse(method).success).toBe(false),
  );

  it("formats canonical methods for customer-facing documents", () => {
    expect(formatPaymentMethod("EVC_PLUS")).toBe("EVC-Plus");
    expect(formatPaymentMethod("E_DAHAB")).toBe("E-Dahab");
    expect(formatPaymentMethod("SALAAM_BANK")).toBe("Salaam Bank");
    expect(formatPaymentMethod("MERCHANT")).toBe("Merchant");
  });
});
