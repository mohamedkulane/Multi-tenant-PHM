import { Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { canAccessBranch } from "../middleware/authorization.js";

export interface ReportRange {
  branchId: string;
  from: Date;
  to: Date;
}

export interface ReportService {
  dashboard(principal: AuthenticatedPrincipal, range: ReportRange): Promise<unknown>;
  sales(principal: AuthenticatedPrincipal, range: ReportRange): Promise<unknown>;
  inventory(principal: AuthenticatedPrincipal, branchId: string): Promise<unknown>;
  debts(principal: AuthenticatedPrincipal, branchId: string): Promise<unknown>;
  expenses(principal: AuthenticatedPrincipal, range: ReportRange): Promise<unknown>;
  margin(principal: AuthenticatedPrincipal, range: ReportRange): Promise<unknown>;
  customerHistory(principal: AuthenticatedPrincipal, phone: string): Promise<unknown>;
}

function requireBranch(principal: AuthenticatedPrincipal, branchId: string) {
  if (!canAccessBranch(principal, branchId)) {
    throw new AppError({
      statusCode: 403,
      code: "BRANCH_ACCESS_DENIED",
      message: "You do not have access to this branch",
    });
  }
}

export function validateReportRange(from: Date, to: Date) {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() > to.getTime()) {
    throw new AppError({
      statusCode: 400,
      code: "INVALID_REPORT_RANGE",
      message: "Report date range is invalid",
    });
  }
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  if (days > 366) {
    throw new AppError({
      statusCode: 400,
      code: "REPORT_RANGE_TOO_LARGE",
      message: "Synchronous reports are limited to 366 days",
    });
  }
}

function reportContext<T>(
  principal: AuthenticatedPrincipal,
  branchId: string | undefined,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  return withTenantContext(
    prisma,
    {
      tenantId: principal.tenantId,
      userId: principal.userId,
      membershipId: principal.membershipId,
      ...(branchId ? { branchId } : {}),
    },
    operation,
  );
}

export class PrismaReportService implements ReportService {
  async dashboard(principal: AuthenticatedPrincipal, range: ReportRange) {
    requireBranch(principal, range.branchId);
    validateReportRange(range.from, range.to);
    return reportContext(principal, range.branchId, async (transaction) => {
      const [cards] = await transaction.$queryRaw<
        Array<{
          sales_count: number;
          gross_sales: string;
          returned_total: string;
          net_sales: string;
          collected: string;
          receivables: string;
          overdue_debts: number;
          expenses: string;
          low_stock_products: number;
        }>
      >(Prisma.sql`
        SELECT
          (SELECT count(*)::int FROM public.sales s
            WHERE s.tenant_id = ${principal.tenantId}::uuid
              AND s.branch_id = ${range.branchId}::uuid
              AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
              AND s.status <> 'VOIDED') AS sales_count,
          COALESCE((SELECT sum(s.grand_total) FROM public.sales s
            WHERE s.tenant_id = ${principal.tenantId}::uuid
              AND s.branch_id = ${range.branchId}::uuid
              AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
              AND s.status <> 'VOIDED'), 0)::text AS gross_sales,
          COALESCE((SELECT sum(s.returned_total) FROM public.sales s
            WHERE s.tenant_id = ${principal.tenantId}::uuid
              AND s.branch_id = ${range.branchId}::uuid
              AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
              AND s.status <> 'VOIDED'), 0)::text AS returned_total,
          COALESCE((SELECT sum(s.grand_total - s.returned_total) FROM public.sales s
            WHERE s.tenant_id = ${principal.tenantId}::uuid
              AND s.branch_id = ${range.branchId}::uuid
              AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
              AND s.status <> 'VOIDED'), 0)::text AS net_sales,
          COALESCE((SELECT sum(CASE WHEN p.type = 'PAYMENT' THEN p.amount ELSE -p.amount END)
            FROM public.payments p
            WHERE p.tenant_id = ${principal.tenantId}::uuid
              AND p.branch_id = ${range.branchId}::uuid
              AND p.created_at >= ${range.from}::date
              AND p.created_at < (${range.to}::date + interval '1 day')), 0)::text AS collected,
          COALESCE((SELECT sum(d.remaining_amount) FROM public.debts d
            WHERE d.tenant_id = ${principal.tenantId}::uuid
              AND d.branch_id = ${range.branchId}::uuid
              AND d.status <> 'VOIDED'), 0)::text AS receivables,
          (SELECT count(*)::int FROM public.debts d
            WHERE d.tenant_id = ${principal.tenantId}::uuid
              AND d.branch_id = ${range.branchId}::uuid
              AND d.remaining_amount > 0 AND d.due_date < CURRENT_DATE
              AND d.status <> 'VOIDED') AS overdue_debts,
          COALESCE((SELECT sum(e.amount) FROM public.expenses e
            WHERE e.tenant_id = ${principal.tenantId}::uuid
              AND e.branch_id = ${range.branchId}::uuid
              AND e.expense_date BETWEEN ${range.from}::date AND ${range.to}::date
              AND e.status = 'POSTED'), 0)::text AS expenses,
          (SELECT count(*)::int
            FROM public.branch_products bp
            LEFT JOIN (
              SELECT tenant_id, branch_id, product_id, sum(quantity_on_hand) quantity
              FROM public.inventory_batches
              GROUP BY tenant_id, branch_id, product_id
            ) stock ON stock.tenant_id = bp.tenant_id
              AND stock.branch_id = bp.branch_id AND stock.product_id = bp.product_id
            WHERE bp.tenant_id = ${principal.tenantId}::uuid
              AND bp.branch_id = ${range.branchId}::uuid AND bp.active
              AND COALESCE(stock.quantity, 0) <= bp.reorder_point_base_units
          ) AS low_stock_products
      `);
      const trends = await transaction.$queryRaw<
        Array<{ label: string; value: string }>
      >(Prisma.sql`
        SELECT s.business_date::text AS label,
          sum(s.grand_total - s.returned_total)::text AS value
        FROM public.sales s
        WHERE s.tenant_id = ${principal.tenantId}::uuid
          AND s.branch_id = ${range.branchId}::uuid
          AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
          AND s.status <> 'VOIDED'
        GROUP BY s.business_date
        ORDER BY s.business_date
      `);
      const topProducts = await transaction.$queryRaw<
        Array<{ productId: string; label: string; units: string; value: string }>
      >(Prisma.sql`
        SELECT si.product_id AS "productId", si.product_name AS label,
          sum(si.base_units_sold - si.base_units_returned)::text AS units,
          sum(si.line_total - COALESCE(returned.value, 0))::text AS value
        FROM public.sale_items si
        JOIN public.sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
        LEFT JOIN (
          SELECT tenant_id, sale_item_id, sum(refund_amount) value
          FROM public.sale_return_items GROUP BY tenant_id, sale_item_id
        ) returned ON returned.tenant_id = si.tenant_id
          AND returned.sale_item_id = si.id
        WHERE s.tenant_id = ${principal.tenantId}::uuid
          AND s.branch_id = ${range.branchId}::uuid
          AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
          AND s.status <> 'VOIDED'
        GROUP BY si.product_id, si.product_name
        ORDER BY sum(si.base_units_sold - si.base_units_returned) DESC
        LIMIT 10
      `);
      return {
        cards: {
          salesCount: cards?.sales_count ?? 0,
          grossSales: cards?.gross_sales ?? "0",
          returnedTotal: cards?.returned_total ?? "0",
          netSales: cards?.net_sales ?? "0",
          collected: cards?.collected ?? "0",
          receivables: cards?.receivables ?? "0",
          overdueDebts: cards?.overdue_debts ?? 0,
          expenses: cards?.expenses ?? "0",
          lowStockProducts: cards?.low_stock_products ?? 0,
        },
        charts: { dailyNetSales: trends, topProducts },
      };
    });
  }

  async sales(principal: AuthenticatedPrincipal, range: ReportRange) {
    requireBranch(principal, range.branchId);
    validateReportRange(range.from, range.to);
    return reportContext(principal, range.branchId, async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<Record<string, string | number | null>>
      >(Prisma.sql`
        SELECT s.id, s.invoice_number AS "invoiceNumber",
          s.business_date::text AS "businessDate", s.status::text,
          s.customer_name AS "customerName", s.customer_phone AS "customerPhone",
          s.grand_total::text AS "grandTotal",
          s.returned_total::text AS "returnedTotal",
          (s.grand_total - s.returned_total)::text AS "netTotal",
          s.amount_paid::text AS "amountPaid",
          s.remaining_balance::text AS "remainingBalance"
        FROM public.sales s
        WHERE s.tenant_id = ${principal.tenantId}::uuid
          AND s.branch_id = ${range.branchId}::uuid
          AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
        ORDER BY s.business_date DESC, s.invoice_number DESC
        LIMIT 5000
      `);
      const [totals] = await transaction.$queryRaw<
        Array<{
          count: number;
          grossTotal: string;
          returnedTotal: string;
          netTotal: string;
          paidTotal: string;
          balanceTotal: string;
        }>
      >(Prisma.sql`
        SELECT count(*)::int AS count,
          COALESCE(sum(CASE WHEN status <> 'VOIDED' THEN grand_total ELSE 0 END), 0)::text AS "grossTotal",
          COALESCE(sum(CASE WHEN status <> 'VOIDED' THEN returned_total ELSE 0 END), 0)::text AS "returnedTotal",
          COALESCE(sum(CASE WHEN status <> 'VOIDED' THEN grand_total - returned_total ELSE 0 END), 0)::text AS "netTotal",
          COALESCE(sum(CASE WHEN status <> 'VOIDED' THEN amount_paid ELSE 0 END), 0)::text AS "paidTotal",
          COALESCE(sum(CASE WHEN status <> 'VOIDED' THEN remaining_balance ELSE 0 END), 0)::text AS "balanceTotal"
        FROM public.sales
        WHERE tenant_id = ${principal.tenantId}::uuid
          AND branch_id = ${range.branchId}::uuid
          AND business_date BETWEEN ${range.from}::date AND ${range.to}::date
      `);
      return { rows, totals };
    });
  }

  async inventory(principal: AuthenticatedPrincipal, branchId: string) {
    requireBranch(principal, branchId);
    return reportContext(principal, branchId, (transaction) =>
      transaction.$queryRaw(Prisma.sql`
        SELECT p.id AS "productId", p.name, p.category,
          COALESCE(sum(b.quantity_on_hand), 0)::text AS "quantityOnHand",
          COALESCE(bp.reorder_point_base_units, 0)::text AS "reorderPoint",
          min(b.expiry_date)::text AS "nearestExpiry",
          count(b.id) FILTER (WHERE b.quantity_on_hand > 0)::int AS "activeBatches"
        FROM public.products p
        LEFT JOIN public.inventory_batches b ON b.tenant_id = p.tenant_id
          AND b.product_id = p.id AND b.branch_id = ${branchId}::uuid
        LEFT JOIN public.branch_products bp ON bp.tenant_id = p.tenant_id
          AND bp.product_id = p.id AND bp.branch_id = ${branchId}::uuid
        WHERE p.tenant_id = ${principal.tenantId}::uuid AND p.active
        GROUP BY p.id, p.name, p.category, bp.reorder_point_base_units
        ORDER BY p.name
        LIMIT 5000
      `),
    );
  }

  async debts(principal: AuthenticatedPrincipal, branchId: string) {
    requireBranch(principal, branchId);
    return reportContext(principal, branchId, (transaction) =>
      transaction.$queryRaw(Prisma.sql`
        SELECT d.id, s.invoice_number AS "invoiceNumber",
          s.customer_name AS "customerName", s.customer_phone AS "customerPhone",
          d.total_amount::text AS "totalAmount", d.paid_amount::text AS "paidAmount",
          d.remaining_amount::text AS "remainingAmount", d.due_date::text AS "dueDate",
          CASE
            WHEN d.status = 'VOIDED' THEN 'VOIDED'
            WHEN d.remaining_amount = 0 THEN 'PAID'
            WHEN d.due_date < CURRENT_DATE THEN 'OVERDUE'
            ELSE 'OPEN'
          END AS status
        FROM public.debts d
        JOIN public.sales s ON s.tenant_id = d.tenant_id AND s.id = d.sale_id
        WHERE d.tenant_id = ${principal.tenantId}::uuid
          AND d.branch_id = ${branchId}::uuid
        ORDER BY d.due_date, s.invoice_number
        LIMIT 5000
      `),
    );
  }

  async expenses(principal: AuthenticatedPrincipal, range: ReportRange) {
    requireBranch(principal, range.branchId);
    validateReportRange(range.from, range.to);
    return reportContext(principal, range.branchId, async (transaction) => {
      const rows = await transaction.$queryRaw(Prisma.sql`
        SELECT e.id, e.expense_date::text AS "expenseDate", e.title,
          c.name AS category, e.amount::text, e.status::text, e.note
        FROM public.expenses e
        JOIN public.expense_categories c ON c.tenant_id = e.tenant_id
          AND c.id = e.category_id
        WHERE e.tenant_id = ${principal.tenantId}::uuid
          AND e.branch_id = ${range.branchId}::uuid
          AND e.expense_date BETWEEN ${range.from}::date AND ${range.to}::date
        ORDER BY e.expense_date DESC, e.created_at DESC
        LIMIT 5000
      `);
      const totals = await transaction.$queryRaw<
        Array<{ category: string; total: string }>
      >(Prisma.sql`
        SELECT c.name AS category, sum(e.amount)::text AS total
        FROM public.expenses e
        JOIN public.expense_categories c ON c.tenant_id = e.tenant_id
          AND c.id = e.category_id
        WHERE e.tenant_id = ${principal.tenantId}::uuid
          AND e.branch_id = ${range.branchId}::uuid
          AND e.expense_date BETWEEN ${range.from}::date AND ${range.to}::date
          AND e.status = 'POSTED'
        GROUP BY c.name ORDER BY c.name
      `);
      return { rows, totals };
    });
  }

  async margin(principal: AuthenticatedPrincipal, range: ReportRange) {
    requireBranch(principal, range.branchId);
    validateReportRange(range.from, range.to);
    return reportContext(principal, range.branchId, async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{
          productId: string;
          productName: string;
          netSales: string;
          costOfGoods: string;
          margin: string;
        }>
      >(Prisma.sql`
        SELECT si.product_id AS "productId", si.product_name AS "productName",
          sum(si.line_total - COALESCE(ret.refund, 0))::text AS "netSales",
          sum(
            alloc.cost * (si.base_units_sold - si.base_units_returned)
              / si.base_units_sold
          )::text AS "costOfGoods",
          (
            sum(si.line_total - COALESCE(ret.refund, 0))
            - sum(
              alloc.cost * (si.base_units_sold - si.base_units_returned)
                / si.base_units_sold
            )
          )::text AS margin
        FROM public.sale_items si
        JOIN public.sales s ON s.tenant_id = si.tenant_id AND s.id = si.sale_id
        JOIN (
          SELECT tenant_id, sale_item_id,
            sum(quantity_base_units * unit_cost) AS cost
          FROM public.sale_item_allocations
          GROUP BY tenant_id, sale_item_id
        ) alloc ON alloc.tenant_id = si.tenant_id AND alloc.sale_item_id = si.id
        LEFT JOIN (
          SELECT tenant_id, sale_item_id, sum(refund_amount) refund
          FROM public.sale_return_items GROUP BY tenant_id, sale_item_id
        ) ret ON ret.tenant_id = si.tenant_id AND ret.sale_item_id = si.id
        WHERE s.tenant_id = ${principal.tenantId}::uuid
          AND s.branch_id = ${range.branchId}::uuid
          AND s.business_date BETWEEN ${range.from}::date AND ${range.to}::date
          AND s.status <> 'VOIDED'
        GROUP BY si.product_id, si.product_name
        ORDER BY sum(si.line_total - COALESCE(ret.refund, 0)) DESC
      `);
      const totals = rows.reduce(
        (total, row) => ({
          netSales: total.netSales.plus(row.netSales),
          costOfGoods: total.costOfGoods.plus(row.costOfGoods),
          margin: total.margin.plus(row.margin),
        }),
        {
          netSales: new Prisma.Decimal(0),
          costOfGoods: new Prisma.Decimal(0),
          margin: new Prisma.Decimal(0),
        },
      );
      return {
        rows,
        totals: {
          netSales: totals.netSales.toFixed(4),
          costOfGoods: totals.costOfGoods.toFixed(6),
          margin: totals.margin.toFixed(4),
        },
      };
    });
  }

  async customerHistory(principal: AuthenticatedPrincipal, phone: string) {
    return reportContext(principal, undefined, async (transaction) => {
      const sales = await transaction.sale.findMany({
        where: { tenantId: principal.tenantId, customerPhone: phone },
        select: {
          id: true,
          branchId: true,
          invoiceNumber: true,
          businessDate: true,
          status: true,
          grandTotal: true,
          returnedTotal: true,
          amountPaid: true,
          remainingBalance: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      });
      return {
        sales: sales.filter((sale) => canAccessBranch(principal, sale.branchId)),
      };
    });
  }
}

export const reportService = new PrismaReportService();
