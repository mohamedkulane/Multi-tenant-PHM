import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MedicineBrowser, ProductCatalog, sellableUnits } from "./medicine-browser";
const product = {
  id: "one",
  name: "Test medicine",
  sku: "SKU001",
  barcode: "12345",
  category: "tablets_capsules",
  baseUnit: "tablet",
  active: true,
  packages: [{ code: "strip", label: "Strip", salePrice: 5, unitsPerPackage: 10 }],
};
afterEach(cleanup);
describe("medicine catalog", () => {
  it("defaults to list, toggles grid and adds a package", () => {
    const add = vi.fn();
    render(
      <MedicineBrowser
        products={[product]}
        currency="USD"
        available={() => 25}
        onChoose={vi.fn()}
        onAdd={add}
      />,
    );
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Test medicine Strip" }));
    expect(add).toHaveBeenCalledWith(product, product.packages[0]);
  });
  it("filters by barcode and category and focuses scanner search", () => {
    render(
      <ProductCatalog
        products={[
          product,
          { ...product, id: "two", name: "Injection", category: "injections", barcode: "6789" },
        ]}
        currency="USD"
        available={() => 25}
        actions={() => null}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Search products" }), {
      target: { value: "12345" },
    });
    expect(screen.queryByText("Injection")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(screen.getByRole("textbox", { name: "Search products" })).toHaveFocus();
    fireEvent.change(screen.getByRole("textbox", { name: "Search products" }), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "injections" } });
    expect(screen.queryByText("Test medicine")).not.toBeInTheDocument();
  });
  it("prevents adding unavailable or unpriced packs", () => {
    render(
      <MedicineBrowser
        products={[{ ...product, packages: [{ ...product.packages[0], salePrice: null }] }]}
        currency="USD"
        available={() => 25}
        onChoose={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Add Test medicine Strip" })).toBeDisabled();
  });
  it("excludes expired stock without discarding batches with no expiry", () =>
    expect(
      sellableUnits(
        [
          { productId: "one", quantityOnHand: 20, expiryDate: "2020-01-01" },
          { productId: "one", quantityOnHand: 10 },
          { productId: "two", quantityOnHand: 99 },
        ],
        "one",
        "2026-08-27",
      ),
    ).toBe(10));
});
