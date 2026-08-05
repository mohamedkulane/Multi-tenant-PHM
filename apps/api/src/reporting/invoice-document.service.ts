import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { canAccessBranch } from "../middleware/authorization.js";
import { buildTextPdf } from "./pdf.js";

export interface InvoiceDocumentService {
  pdf(
    principal: AuthenticatedPrincipal,
    saleId: string,
  ): Promise<{ filename: string; content: Buffer }>;
}

function money(value: { toFixed(decimalPlaces: number): string }) {
  return value.toFixed(2);
}

export class PrismaInvoiceDocumentService implements InvoiceDocumentService {
  async pdf(principal: AuthenticatedPrincipal, saleId: string) {
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const sale = await transaction.sale.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: saleId } },
          include: {
            items: { orderBy: { createdAt: "asc" } },
            payments: { orderBy: { createdAt: "asc" } },
          },
        });
        if (!sale || !canAccessBranch(principal, sale.branchId)) {
          throw new AppError({
            statusCode: 404,
            code: "SALE_NOT_FOUND",
            message: "Sale not found",
          });
        }
        const [tenant, branch, branding] = await Promise.all([
          transaction.tenant.findUnique({
            where: { id: principal.tenantId },
            select: { name: true, currencyCode: true },
          }),
          transaction.branch.findUnique({
            where: {
              tenantId_id: { tenantId: principal.tenantId, id: sale.branchId },
            },
            select: { name: true, code: true, phone: true },
          }),
          transaction.tenantBranding.findUnique({
            where: { tenantId: principal.tenantId },
          }),
        ]);
        const lines = [
          branding?.displayName ?? tenant?.name ?? principal.tenantName,
          `Branch: ${branch?.name ?? sale.branchId} (${branch?.code ?? "-"})`,
          branch?.phone ? `Phone: ${branch.phone}` : "",
          "",
          `${branding?.invoiceTitle ?? "SALES INVOICE"} ${sale.invoiceNumber}`,
          `Date: ${sale.businessDate.toISOString().slice(0, 10)}  Status: ${sale.status}`,
          `Customer: ${sale.customerName}`,
          `Phone: ${sale.customerPhone ?? "-"}`,
          `Served by: ${principal.fullName}`,
          "",
          "ITEMS",
          ...sale.items.map(
            (item) =>
              `${item.productName} | ${item.packageQuantity} ${item.packageLabel} x ` +
              `${money(item.unitPrice)} = ${money(item.lineTotal)}`,
          ),
          "",
          `Subtotal: ${money(sale.subtotal)} ${tenant?.currencyCode ?? ""}`,
          `Discount: ${money(sale.discount)}`,
          `Tax: ${money(sale.taxTotal)}`,
          `Grand total: ${money(sale.grandTotal)}`,
          `Returned value: ${money(sale.returnedTotal)}`,
          `Paid: ${money(sale.amountPaid)}`,
          `Balance: ${money(sale.remainingBalance)}`,
          "",
          "PAYMENTS / REFUNDS",
          ...sale.payments.map(
            (payment) =>
              `${payment.createdAt.toISOString()} | ${payment.type} | ${payment.method} | ` +
              money(payment.amount),
          ),
          "",
          `Trace ID: ${sale.id}`,
          branding?.invoiceFooter ?? "",
          "Generated from immutable PHMS transaction snapshots.",
        ].filter((line) => line !== "");
        return {
          filename: `${sale.invoiceNumber}.pdf`,
          content: buildTextPdf(lines, {
            paperSize:
              branding?.invoicePaperSize === "A5" || branding?.invoicePaperSize === "THERMAL_80MM"
                ? branding.invoicePaperSize
                : "A4",
          }),
        };
      },
    );
  }
}

export const invoiceDocumentService = new PrismaInvoiceDocumentService();
