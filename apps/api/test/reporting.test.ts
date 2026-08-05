import { describe, expect, it } from "vitest";
import { recordsToCsv } from "../src/reporting/csv.js";
import { recordsToExcel } from "../src/reporting/excel.js";
import { buildTextPdf } from "../src/reporting/pdf.js";
import { validateReportRange } from "../src/reporting/report.service.js";

describe("M5 report artifacts", () => {
  it("escapes CSV formulas and quotes", () => {
    const csv = recordsToCsv([{ name: "=CMD()", note: 'a "quote"' }]);
    expect(csv).toContain(`"'=CMD()"`);
    expect(csv).toContain(`"a ""quote"""`);
  });

  it("creates a styled Excel workbook and neutralizes formulas", () => {
    const workbook = recordsToExcel([{ product: "=CMD()", total: 12.5 }], "Sales");
    expect(workbook).toContain("Excel.Sheet");
    expect(workbook).toContain('ss:StyleID="Header"');
    expect(workbook).toContain("&apos;=CMD()");
    expect(workbook).toContain('ss:Type="Number"');
  });
  it("creates a structurally complete PDF document", () => {
    const pdf = buildTextPdf(["PHMS Invoice", "Total: 10.00"]);
    expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(pdf.toString("ascii")).toContain("%%EOF");
  });

  it("supports A5 and thermal invoice paper dimensions", () => {
    const a5 = buildTextPdf(["Invoice"], { paperSize: "A5" }).toString("ascii");
    const thermal = buildTextPdf(["Receipt"], { paperSize: "THERMAL_80MM" }).toString("ascii");
    expect(a5).toContain("/MediaBox [0 0 420 595]");
    expect(thermal).toContain("/MediaBox [0 0 227 842]");
  });

  it("paginates long PDF content", () => {
    const pdf = buildTextPdf(Array.from({ length: 90 }, (_, index) => `Line ${index}`));
    expect(pdf.toString("ascii")).toContain("/Count 3");
  });

  it("accepts a bounded report range", () => {
    expect(() => validateReportRange(new Date("2026-01-01"), new Date("2026-12-31"))).not.toThrow();
  });

  it("rejects inverted and oversized report ranges", () => {
    expect(() => validateReportRange(new Date("2026-02-01"), new Date("2026-01-01"))).toThrow(
      "invalid",
    );
    expect(() => validateReportRange(new Date("2024-01-01"), new Date("2026-01-01"))).toThrow(
      "366",
    );
  });
});
