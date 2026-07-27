import { describe, expect, it } from "vitest";
import {
  buildPackagingPlan,
  findPackagingLevel,
  productCategories,
  quantityToBaseUnits,
} from "../src/inventory/packaging.js";

describe("category packaging domain", () => {
  it("covers every legacy product category", () => {
    expect(productCategories).toHaveLength(12);
    expect(new Set(productCategories).size).toBe(productCategories.length);
  });

  it("builds exact tablet carton, box, strip and unit conversions", () => {
    const plan = buildPackagingPlan({
      category: "tablets_capsules",
      counts: {
        boxesPerCarton: 10,
        stripsPerSmallBox: 5,
        unitsPerStrip: 10,
      },
      outerPriceMinor: 10_000,
    });

    expect(
      plan.map(({ code, unitsPerLevel, salePriceMinor }) => ({
        code,
        unitsPerLevel,
        salePriceMinor,
      })),
    ).toEqual([
      {
        code: "large_carton",
        unitsPerLevel: 500n,
        salePriceMinor: 10_000,
      },
      { code: "small_box", unitsPerLevel: 50n, salePriceMinor: 1_000 },
      { code: "strip", unitsPerLevel: 10n, salePriceMinor: 200 },
      { code: "unit", unitsPerLevel: 1n, salePriceMinor: 20 },
    ]);
  });

  it("models baby cartons, packs and pieces without the legacy ambiguity", () => {
    const plan = buildPackagingPlan({
      category: "baby_products",
      counts: { packsPerBox: 8, piecesPerPack: 20 },
      outerPriceMinor: 8_000,
    });

    expect(findPackagingLevel(plan, "carton").unitsPerLevel).toBe(160n);
    expect(findPackagingLevel(plan, "pack").unitsPerLevel).toBe(20n);
    expect(findPackagingLevel(plan, "piece").unitsPerLevel).toBe(1n);
  });

  it("models women's cartons separately from packs", () => {
    const plan = buildPackagingPlan({
      category: "womens_products",
      counts: { packsPerBox: 12, padsPerPack: 10 },
      outerPriceMinor: 6_000,
    });

    expect(findPackagingLevel(plan, "carton").unitsPerLevel).toBe(120n);
    expect(findPackagingLevel(plan, "pack").unitsPerLevel).toBe(10n);
  });

  it("prefers an explicit base-unit price where legacy categories allow it", () => {
    const plan = buildPackagingPlan({
      category: "syrups_liquids",
      counts: { bottlesPerBox: 12 },
      outerPriceMinor: 12_000,
      basePriceMinor: 1_250,
    });

    expect(findPackagingLevel(plan, "bottle").salePriceMinor).toBe(1_250);
  });

  it("converts sale quantities to integer base units", () => {
    const plan = buildPackagingPlan({
      category: "tablets_capsules",
      counts: {
        boxesPerCarton: 10,
        stripsPerSmallBox: 5,
        unitsPerStrip: 10,
      },
    });

    expect(quantityToBaseUnits(findPackagingLevel(plan, "strip"), 3)).toBe(30n);
  });

  it.each([
    {},
    { boxesPerCarton: 0, stripsPerSmallBox: 2, unitsPerStrip: 10 },
    { boxesPerCarton: 1.5, stripsPerSmallBox: 2, unitsPerStrip: 10 },
  ])("rejects missing, zero or fractional package counts: %o", (counts) => {
    expect(() =>
      buildPackagingPlan({
        category: "tablets_capsules",
        counts,
      }),
    ).toThrow(/positive whole number/);
  });

  it("rejects floating-point money", () => {
    expect(() =>
      buildPackagingPlan({
        category: "medical_supplies",
        counts: { piecesPerBox: 10 },
        outerPriceMinor: 10.5,
      }),
    ).toThrow(/minor units/);
  });
});
