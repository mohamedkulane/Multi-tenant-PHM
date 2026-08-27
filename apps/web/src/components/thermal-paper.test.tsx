import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { receiptHeightMm, ThermalPaper } from "./thermal-paper";

afterEach(cleanup);
it("converts rendered CSS pixels to roll length with a small cut allowance", () => {
  expect(receiptHeightMm(960)).toBe(256);
  expect(receiptHeightMm(0)).toBe(50);
});
it("uses real millimetres and separate named pages for separate orders", () => {
  const { container, rerender } = render(
    <>
      <ThermalPaper width={80}>Order one</ThermalPaper>
      <ThermalPaper width={80}>Order two</ThermalPaper>
    </>,
  );
  const papers = container.querySelectorAll("article");
  expect(papers[0]).toHaveStyle({ width: "80mm" });
  expect(papers[0]?.style.page).not.toBe(papers[1]?.style.page);
  expect(container.querySelector("style")?.textContent).toContain("size: 80mm 50mm");
  rerender(<ThermalPaper width={58}>Order one</ThermalPaper>);
  expect(container.querySelector("article")).toHaveStyle({ width: "58mm" });
  expect(container.querySelector("style")?.textContent).toContain("size: 58mm 50mm");
});
