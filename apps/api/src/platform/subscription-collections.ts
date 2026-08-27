import { Prisma } from "@prisma/client";

interface PaymentEvent {
  createdAt: Date;
  after: unknown;
}

// Renewal audit entries are immutable and written in the same transaction as payment recording.
// Do not use lastPaymentAmount: it discards earlier payments, including repeats in one month.
export function summarizeSubscriptionCollections(year: number, events: PaymentEvent[]) {
  const currencies = new Map<string, { amount: Prisma.Decimal; count: number }[]>();
  let invalidPaymentCount = 0;
  for (const event of events) {
    if (event.createdAt.getUTCFullYear() !== year) continue;
    const data =
      event.after && typeof event.after === "object" && !Array.isArray(event.after)
        ? (event.after as Record<string, unknown>)
        : {};
    const raw = data["paymentAmount"];
    if (
      (typeof raw !== "string" && typeof raw !== "number") ||
      !/^\d+(\.\d{1,4})?$/.test(String(raw))
    ) {
      invalidPaymentCount++;
      continue;
    }
    const amount = new Prisma.Decimal(raw);
    if (amount.isZero()) continue;
    const currency = data["currencyCode"];
    // Older audit entries did not snapshot a currency. Never assume today's settings applied.
    const currencyCode =
      typeof currency === "string" && /^[A-Z]{3}$/.test(currency) ? currency : "UNSPECIFIED";
    const months = currencies.get(currencyCode) ??
      Array.from({ length: 12 }, () => ({ amount: new Prisma.Decimal(0), count: 0 }));
    const month = months[event.createdAt.getUTCMonth()]!;
    month.amount = month.amount.plus(amount);
    month.count++;
    currencies.set(currencyCode, months);
  }
  return {
    year,
    timeZone: "UTC",
    invalidPaymentCount,
    currencies: [...currencies].sort(([a], [b]) => a.localeCompare(b)).map(([currencyCode, months]) => ({
      currencyCode,
      total: months.reduce((total, month) => total.plus(month.amount), new Prisma.Decimal(0)).toFixed(4),
      paymentCount: months.reduce((total, month) => total + month.count, 0),
      months: months.map((month, index) => ({
        month: `${year}-${String(index + 1).padStart(2, "0")}`,
        amount: month.amount.toFixed(4),
        paymentCount: month.count,
      })),
    })),
  };
}
