import { describe, expect, it } from "vitest";
import { formatMoney, formatUnitCost, parseMoney, parseUnitCost } from "../src/finance/money.js";

describe("M4 exact financial arithmetic", () => {
  it("parses and formats four-decimal money without floating point", () => {
    expect(parseMoney("12.34")).toBe(123400n);
    expect(formatMoney(123400n)).toBe("12.3400");
  });

  it("retains six decimals for inventory unit-cost snapshots", () => {
    expect(parseUnitCost("0.123456")).toBe(123456n);
    expect(formatUnitCost(123456n)).toBe("0.123456");
  });

  it.each(["-1", "1.00001", "1e3", "NaN", ""])("rejects unsafe money input %s", (value) => {
    expect(() => parseMoney(value)).toThrow();
  });

  it("multiplies price and quantity exactly in minor units", () => {
    expect(formatMoney(parseMoney("0.10") * 3n)).toBe("0.3000");
  });
});
