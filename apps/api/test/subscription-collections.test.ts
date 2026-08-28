import { describe, expect, it } from "vitest";
import { summarizeSubscriptionCollections } from "../src/platform/subscription-collections.js";

const payment = (at: string, paymentAmount: unknown, currencyCode?: string) => ({
  createdAt: new Date(at),
  after: { paymentAmount, currencyCode },
});

describe("subscription collections", () => {
  it("counts every payment, adds decimals exactly, and keeps zero-payment months", () => {
    const report = summarizeSubscriptionCollections(2026, [
      payment("2026-08-01T00:00:00Z", "0.1", "USD"),
      payment("2026-08-20T00:00:00Z", "0.2", "USD"),
      payment("2026-09-01T00:00:00Z", "60", "USD"),
      payment("2026-09-02T00:00:00Z", "0", "USD"),
    ]);
    expect(report.currencies[0]).toMatchObject({ total: "60.3000", paymentCount: 3 });
    expect(report.currencies[0]?.months).toHaveLength(12);
    expect(report.currencies[0]?.months[7]).toEqual({
      month: "2026-08",
      amount: "0.3000",
      paymentCount: 2,
    });
    expect(report.currencies[0]?.months[0]).toMatchObject({ amount: "0.0000", paymentCount: 0 });
  });
  it("separates currencies and does not relabel legacy payments using current settings", () => {
    const report = summarizeSubscriptionCollections(2026, [
      payment("2026-01-01", "50", "USD"),
      payment("2026-01-01", "5000", "KES"),
      payment("2026-01-01", "30"),
    ]);
    expect(report.currencies.map(({ currencyCode, total }) => ({ currencyCode, total }))).toEqual([
      { currencyCode: "KES", total: "5000.0000" },
      { currencyCode: "UNSPECIFIED", total: "30.0000" },
      { currencyCode: "USD", total: "50.0000" },
    ]);
  });
  it("uses UTC year boundaries and flags malformed historic amounts", () => {
    const report = summarizeSubscriptionCollections(2026, [
      payment("2025-12-31T23:59:59Z", "10", "USD"),
      payment("2026-12-31T23:59:59Z", "20", "USD"),
      payment("2027-01-01T00:00:00Z", "30", "USD"),
      payment("2026-01-01", "bad", "USD"),
      payment("2026-01-01", "-5", "USD"),
    ]);
    expect(report.currencies[0]).toMatchObject({ total: "20.0000", paymentCount: 1 });
    expect(report.invalidPaymentCount).toBe(2);
  });
  it("returns no invented payments for an empty year", () => {
    expect(summarizeSubscriptionCollections(2026, []).currencies).toEqual([]);
  });
});
