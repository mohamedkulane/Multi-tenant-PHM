import { describe, expect, it } from "vitest";
import { appendSaleCartLine, calculateSaleCartTotals, type SaleCartLine } from "./sales-cart";

const gloves: SaleCartLine = {
  productId: "gloves",
  productName: "Gloves",
  packageCode: "piece",
  packageLabel: "Piece",
  packageQuantity: 2,
  unitPrice: 1,
  unitsPerPackage: "1",
};

const syrup: SaleCartLine = {
  productId: "syrup",
  productName: "Syrup",
  packageCode: "bottle",
  packageLabel: "Bottle",
  packageQuantity: 3,
  unitPrice: 3.5,
  unitsPerPackage: "1",
};

describe("sales cart", () => {
  it("keeps multiple products and calculates all sale totals", () => {
    const cart = appendSaleCartLine(appendSaleCartLine([], gloves), syrup);
    const totals = calculateSaleCartTotals(cart, "1.50", "5");

    expect(cart).toHaveLength(2);
    expect(cart.map((line) => line.productId)).toEqual(["gloves", "syrup"]);
    expect(totals).toEqual({
      subtotal: 12.5,
      discount: 1.5,
      grandTotal: 11,
      balanceDue: 6,
      changeDue: 0,
    });
  });

  it("merges repeated package quantities and keeps other packages separate", () => {
    const repeated = appendSaleCartLine([gloves], { ...gloves, packageQuantity: 3 });
    const otherPackage = appendSaleCartLine(repeated, {
      ...gloves,
      packageCode: "box",
      packageLabel: "Box",
      packageQuantity: 1,
      unitPrice: 10,
    });

    expect(otherPackage).toHaveLength(2);
    expect(otherPackage[0]?.packageQuantity).toBe(5);
    expect(otherPackage[1]?.packageCode).toBe("box");
  });
  it("caps discount at subtotal and reports customer change", () => {
    const totals = calculateSaleCartTotals([gloves], "10", "5");

    expect(totals.grandTotal).toBe(0);
    expect(totals.balanceDue).toBe(0);
    expect(totals.changeDue).toBe(5);
  });
});
