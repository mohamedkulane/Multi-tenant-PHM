import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const file = process.argv[2];
if (!file) {
  throw new Error("Usage: node scripts/m7/validate-legacy-export.mjs <legacy-export.json>");
}

const source = await readFile(file);
const payload = JSON.parse(source.toString("utf8"));
const collections = ["users", "medicines", "sales", "debts", "expenses"];
const issues = [];

for (const name of collections) {
  if (!Array.isArray(payload[name])) {
    issues.push({ severity: "ERROR", collection: name, message: "Collection must be an array" });
    payload[name] = [];
  }
}

function duplicateIds(name) {
  const seen = new Set();
  for (const record of payload[name]) {
    const id = String(record._id ?? "");
    if (!id) issues.push({ severity: "ERROR", collection: name, message: "Missing _id" });
    else if (seen.has(id))
      issues.push({ severity: "ERROR", collection: name, sourceId: id, message: "Duplicate _id" });
    seen.add(id);
  }
  return seen;
}

const userIds = duplicateIds("users");
const medicineIds = duplicateIds("medicines");
const saleIds = duplicateIds("sales");
duplicateIds("debts");
duplicateIds("expenses");

const invoiceNumbers = new Set();
let legacySalesTotal = 0;
let legacyCollectionsTotal = 0;
for (const sale of payload.sales) {
  const sourceId = String(sale._id ?? "");
  if (invoiceNumbers.has(sale.invoiceNumber))
    issues.push({
      severity: "ERROR",
      collection: "sales",
      sourceId,
      message: "Duplicate invoice number",
    });
  invoiceNumbers.add(sale.invoiceNumber);
  if (!userIds.has(String(sale.soldBy)))
    issues.push({
      severity: "ERROR",
      collection: "sales",
      sourceId,
      message: "soldBy user is missing",
    });
  for (const item of sale.items ?? []) {
    if (!medicineIds.has(String(item.medicineId)))
      issues.push({
        severity: "ERROR",
        collection: "sales",
        sourceId,
        message: `Medicine ${item.medicineId} is missing`,
      });
    const expected = Number(item.quantity) * Number(item.unitPrice);
    if (Math.abs(expected - Number(item.subtotal)) > 0.01)
      issues.push({
        severity: "ERROR",
        collection: "sales",
        sourceId,
        message: "Item subtotal does not reconcile",
      });
  }
  const expectedTotal = Number(sale.subtotal) - Number(sale.discount ?? 0);
  if (Math.abs(expectedTotal - Number(sale.grandTotal)) > 0.01)
    issues.push({
      severity: "ERROR",
      collection: "sales",
      sourceId,
      message: "Sale total does not reconcile",
    });
  legacySalesTotal += Number(sale.grandTotal ?? 0);
  legacyCollectionsTotal += Number(sale.amountPaid ?? 0);
}

for (const debt of payload.debts) {
  const sourceId = String(debt._id ?? "");
  if (debt.sale && !saleIds.has(String(debt.sale)))
    issues.push({
      severity: "ERROR",
      collection: "debts",
      sourceId,
      message: "Referenced sale is missing",
    });
  const expected = Number(debt.paidAmount ?? 0) + Number(debt.remainingAmount ?? 0);
  if (Math.abs(expected - Number(debt.totalAmount ?? 0)) > 0.01)
    issues.push({
      severity: "ERROR",
      collection: "debts",
      sourceId,
      message: "Debt balance does not reconcile",
    });
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  counts: Object.fromEntries(collections.map((name) => [name, payload[name].length])),
  financialControlTotals: {
    grossSales: legacySalesTotal.toFixed(2),
    collections: legacyCollectionsTotal.toFixed(2),
    receivables: (legacySalesTotal - legacyCollectionsTotal).toFixed(2),
    expenses: payload.expenses
      .reduce((total, expense) => total + Number(expense.amount ?? 0), 0)
      .toFixed(2),
  },
  issues,
  valid: !issues.some((issue) => issue.severity === "ERROR"),
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.valid) process.exitCode = 2;
