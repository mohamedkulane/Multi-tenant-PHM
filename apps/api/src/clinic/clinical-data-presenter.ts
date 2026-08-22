import { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";

const clinicalOnlyRoles = new Set(["DOCTOR", "LAB_TECHNICIAN"]);
const hiddenFinancialFields = new Set([
  "price",
  "subtotal",
  "discount",
  "total",
  "amountPaid",
  "paymentMethod",
  "payments",
  "clinicalPayments",
  "consultationFee",
  "consultationPaymentMethod",
  "consultationPaidAt",
  "consultationCollectedById",
]);

function moneyNumber(value: unknown) {
  if (value === null || value === undefined) return Number.NaN;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (["string", "number", "bigint"].includes(typeof value)) return Number(value);
  return Number.NaN;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.prototype.toString.call(value) === "[object Object]";
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!isPlainObject(value)) return value;

  const total = moneyNumber(value["total"]);
  const paid = moneyNumber(value["amountPaid"]);
  const paymentIsComplete = Number.isFinite(total) && Number.isFinite(paid) && paid >= total;
  const output: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value)) {
    if (hiddenFinancialFields.has(key)) continue;
    if (key === "consultationPaymentStatus") {
      if (child === "PAID") output[key] = "PAID";
      continue;
    }
    output[key] = redact(child);
  }

  if (paymentIsComplete) output["paymentStatus"] = "PAID";
  return output;
}

/**
 * Doctor and laboratory payloads are clinical records, not financial records.
 * Keep a completed PAID marker only; remove prices, amounts, balances, methods,
 * and payment history recursively from every clinic/lab response.
 */
export function presentClinicalData(principal: AuthenticatedPrincipal, value: unknown) {
  if (!clinicalOnlyRoles.has(principal.role)) return value;
  return redact(value);
}
