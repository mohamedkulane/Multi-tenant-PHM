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

function normalizePatientDemographics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizePatientDemographics);
  if (!isPlainObject(value)) return value;

  const output = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, normalizePatientDemographics(child)]),
  ) as Record<string, unknown>;
  if (typeof output["patientNumber"] !== "string") return output;

  const dateOfBirth = output["dateOfBirth"];
  const parsedDob =
    dateOfBirth instanceof Date
      ? dateOfBirth
      : typeof dateOfBirth === "string"
        ? new Date(dateOfBirth)
        : null;
  if (parsedDob && Number.isFinite(parsedDob.getTime())) {
    const today = new Date();
    let years = today.getUTCFullYear() - parsedDob.getUTCFullYear();
    const birthdayPassed =
      today.getUTCMonth() > parsedDob.getUTCMonth() ||
      (today.getUTCMonth() === parsedDob.getUTCMonth() &&
        today.getUTCDate() >= parsedDob.getUTCDate());
    if (!birthdayPassed) years -= 1;
    output["age"] = Math.max(0, years);
    output["ageDisplay"] = `${Math.max(0, years)} years`;
    return output;
  }

  const estimated = Number(output["estimatedAgeValue"]);
  const unit = output["estimatedAgeUnit"];
  if (Number.isInteger(estimated) && estimated >= 0 && typeof unit === "string") {
    output["age"] =
      unit === "YEARS" ? estimated : unit === "MONTHS" ? Math.floor(estimated / 12) : 0;
    output["ageDisplay"] = `${estimated} ${unit.toLowerCase()}`;
  }
  return output;
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
  const normalized = normalizePatientDemographics(value);
  if (!clinicalOnlyRoles.has(principal.role)) return normalized;
  return redact(normalized);
}
