import { Prisma } from "@prisma/client";

export async function loadFinancialSummary(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  range: { branchId: string; from: Date; to: Date },
  pharmacyRevenue: string,
  operatingExpenses: string,
  pharmacyReceivables: string,
) {
  const [values] = await transaction.$queryRaw<
    Array<{
      consultationRevenue: string;
      laboratoryRevenue: string;
      costOfGoods: string;
      consultationReceivables: string;
      laboratoryReceivables: string;
      overduePharmacyReceivables: string;
      missingCostItems: number;
    }>
  >(Prisma.sql`
    WITH allocations AS (
      SELECT tenant_id, sale_item_id, sum(quantity_base_units * unit_cost) AS cost
      FROM public.sale_item_allocations WHERE tenant_id = ${tenantId}::uuid
      GROUP BY tenant_id, sale_item_id
    ), sold AS (
      SELECT si.base_units_sold, si.base_units_returned, a.cost
      FROM public.sale_items si
      JOIN public.sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
      LEFT JOIN allocations a ON a.tenant_id = si.tenant_id AND a.sale_item_id = si.id
      WHERE s.tenant_id = ${tenantId}::uuid AND s.branch_id = ${range.branchId}::uuid
        AND s.status <> 'VOIDED'
        AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
    )
    SELECT
      COALESCE((SELECT sum(cv.consultation_fee) FROM public.clinic_visits cv
        WHERE cv.tenant_id = ${tenantId}::uuid AND cv.branch_id = ${range.branchId}::uuid
          AND cv.status <> 'CANCELLED' AND cv.created_at >= ${range.from}::date
          AND cv.created_at < (${range.to}::date + interval '1 day')), 0)::text AS "consultationRevenue",
      COALESCE((SELECT sum(lv.total) FROM public.lab_visits lv
        WHERE lv.tenant_id = ${tenantId}::uuid AND lv.branch_id = ${range.branchId}::uuid
          AND lv.status <> 'CANCELLED' AND lv.created_at >= ${range.from}::date
          AND lv.created_at < (${range.to}::date + interval '1 day')), 0)::text AS "laboratoryRevenue",
      COALESCE((SELECT sum(cost * (base_units_sold - base_units_returned)
        / NULLIF(base_units_sold, 0)) FROM sold), 0)::text AS "costOfGoods",
      (SELECT count(*)::int FROM sold WHERE cost IS NULL
        AND base_units_sold > base_units_returned) AS "missingCostItems",
      COALESCE((SELECT sum(cv.consultation_fee) FROM public.clinic_visits cv
        WHERE cv.tenant_id = ${tenantId}::uuid AND cv.branch_id = ${range.branchId}::uuid
          AND cv.status <> 'CANCELLED' AND cv.consultation_payment_status = 'UNPAID'), 0)::text AS "consultationReceivables",
      COALESCE((SELECT sum(GREATEST(lv.total - lv.amount_paid, 0)) FROM public.lab_visits lv
        WHERE lv.tenant_id = ${tenantId}::uuid AND lv.branch_id = ${range.branchId}::uuid
          AND lv.status <> 'CANCELLED'), 0)::text AS "laboratoryReceivables",
      COALESCE((SELECT sum(d.remaining_amount) FROM public.debts d
        WHERE d.tenant_id = ${tenantId}::uuid AND d.branch_id = ${range.branchId}::uuid
          AND d.status <> 'VOIDED' AND d.remaining_amount > 0
          AND d.due_date < CURRENT_DATE), 0)::text AS "overduePharmacyReceivables"
  `);
  return financialSummary({
    pharmacyRevenue,
    operatingExpenses,
    pharmacyReceivables,
    consultationRevenue: values?.consultationRevenue ?? "0",
    laboratoryRevenue: values?.laboratoryRevenue ?? "0",
    costOfGoods: values?.costOfGoods ?? "0",
    consultationReceivables: values?.consultationReceivables ?? "0",
    laboratoryReceivables: values?.laboratoryReceivables ?? "0",
    overduePharmacyReceivables: values?.overduePharmacyReceivables ?? "0",
    missingCostItems: values?.missingCostItems ?? 0,
  });
}

export function financialSummary(input: {
  pharmacyRevenue: string;
  consultationRevenue: string;
  laboratoryRevenue: string;
  costOfGoods: string;
  operatingExpenses: string;
  pharmacyReceivables: string;
  consultationReceivables: string;
  laboratoryReceivables: string;
  overduePharmacyReceivables: string;
  missingCostItems: number;
}) {
  const revenue = new Prisma.Decimal(input.pharmacyRevenue)
    .plus(input.consultationRevenue)
    .plus(input.laboratoryRevenue);
  const grossProfit = revenue.minus(input.costOfGoods);
  return {
    ...input,
    totalRevenue: revenue.toFixed(4),
    grossProfit: grossProfit.toFixed(4),
    netIncome: grossProfit.minus(input.operatingExpenses).toFixed(4),
    accountsReceivable: new Prisma.Decimal(input.pharmacyReceivables)
      .plus(input.consultationReceivables)
      .plus(input.laboratoryReceivables)
      .toFixed(4),
    receivablesBasis: "current" as const,
    revenueBasis: "registered_charges" as const,
  };
}
