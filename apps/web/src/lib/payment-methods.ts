export const PAYMENT_METHOD_OPTIONS = [
  { value: "EVC_PLUS", label: "EVC-Plus" },
  { value: "E_DAHAB", label: "E-Dahab" },
  { value: "SALAAM_BANK", label: "Salaam Bank" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]["value"];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "EVC_PLUS";

export function toPaymentMethod(value: string): PaymentMethod {
  return PAYMENT_METHOD_OPTIONS.some((option) => option.value === value)
    ? (value as PaymentMethod)
    : DEFAULT_PAYMENT_METHOD;
}

export function formatPaymentMethod(value: unknown) {
  const method = PAYMENT_METHOD_OPTIONS.find((option) => option.value === value);
  if (method) return method.label;
  return typeof value === "string" ? value.replaceAll("_", " ") : "—";
}
