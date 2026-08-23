import { z } from "zod";

export const PAYMENT_METHODS = ["EVC_PLUS", "E_DAHAB", "SALAAM_BANK"] as const;

export type CanonicalPaymentMethod = (typeof PAYMENT_METHODS)[number];

export const UNSUPPORTED_PAYMENT_METHOD_MESSAGE =
  "Unsupported payment method. Choose EVC-Plus, E-Dahab, or Salaam Bank.";

export const paymentMethodSchema = z.enum(PAYMENT_METHODS, {
  error: UNSUPPORTED_PAYMENT_METHOD_MESSAGE,
});

export function formatPaymentMethod(value: string) {
  const labels: Record<CanonicalPaymentMethod, string> = {
    EVC_PLUS: "EVC-Plus",
    E_DAHAB: "E-Dahab",
    SALAAM_BANK: "Salaam Bank",
  };
  return value in labels ? labels[value as CanonicalPaymentMethod] : value.replaceAll("_", " ");
}
