import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "../src/auth/auth.types.js";
import { prisma } from "../src/database/prisma.js";
import { expenseService } from "../src/finance/expense.service.js";
import { salesService } from "../src/finance/sales.service.js";
import { catalogService } from "../src/inventory/catalog.service.js";
import { inventoryService } from "../src/inventory/inventory.service.js";
import { invoiceDocumentService } from "../src/reporting/invoice-document.service.js";
import { jobService } from "../src/reporting/job.service.js";
import { notificationService } from "../src/reporting/notification.service.js";
import { reportService } from "../src/reporting/report.service.js";

const migratorUrl = process.env.TEST_ADMIN_DATABASE_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = migratorUrl && appUrl ? describe : describe.skip;

describeDatabase("M5 live reporting and job workflows", () => {
  const migrator = new pg.Pool({ connectionString: migratorUrl });
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const branchId = randomUUID();
  const principal: AuthenticatedPrincipal = {
    sessionId: randomUUID(),
    tenantId,
    tenantName: "M5 Test Pharmacy",
    userId,
    fullName: "Report Owner",
    membershipId,
    username: "report-owner",
    role: "OWNER",
    allBranches: true,
    branchIds: [],
  };
  let productId = "";
  let saleId = "";
  let exportId = "";
  let jobId = "";

  async function adminTenant(
    targetTenant: string,
    targetUser: string,
    targetMembership: string,
    operation: (client: pg.PoolClient) => Promise<void>,
  ) {
    const client = await migrator.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [targetTenant]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [targetUser]);
      await client.query("SELECT set_config('app.membership_id', $1, true)", [targetMembership]);
      await operation(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    await adminTenant(tenantId, userId, membershipId, async (client) => {
      await client.query(
        `INSERT INTO public.tenants
          (id, name, slug, status, plan_code, timezone, currency_code, settings, updated_at)
         VALUES ($1, 'M5 Test Pharmacy', $2, 'ACTIVE', 'test', 'UTC', 'USD', '{}', now())`,
        [tenantId, `m5-${tenantId}`],
      );
      await client.query(
        `INSERT INTO public.users
          (id, full_name, password_hash, status, updated_at)
         VALUES ($1, 'Report Owner', 'not-used', 'ACTIVE', now())`,
        [userId],
      );
      await client.query(
        `INSERT INTO public.tenant_memberships
          (id, tenant_id, user_id, username, role, status, all_branches, updated_at)
         VALUES ($1, $2, $3, 'report-owner', 'OWNER', 'ACTIVE', true, now())`,
        [membershipId, tenantId, userId],
      );
      await client.query(
        `INSERT INTO public.branches
          (id, tenant_id, name, code, timezone, updated_at)
         VALUES ($1, $2, 'Report Branch', 'RPT', 'UTC', now())`,
        [branchId, tenantId],
      );
    });
    await adminTenant(otherTenantId, randomUUID(), randomUUID(), async (client) => {
      await client.query(
        `INSERT INTO public.tenants
          (id, name, slug, status, plan_code, timezone, currency_code, settings, updated_at)
         VALUES ($1, 'Other M5 Tenant', $2, 'ACTIVE', 'test', 'UTC', 'USD', '{}', now())`,
        [otherTenantId, `m5-other-${otherTenantId}`],
      );
    });
    const product = (await catalogService.create(principal, {
      name: "M5 Report Gauze",
      category: "medical_supplies",
      baseUnit: "piece",
      sku: `M5-${tenantId}`,
      counts: { piecesPerBox: 10 },
      outerPriceMinor: 2_500,
    })) as unknown as { id: string };
    productId = product.id;
    await inventoryService.receive(principal, {
      branchId,
      idempotencyKey: `receipt:${randomUUID()}`,
      lines: [
        {
          productId,
          packageCode: "box",
          packageQuantity: 10,
          batchNumber: "M5-EXPIRING",
          expiryDate: new Date("2026-08-10"),
          unitCost: "1.000000",
        },
      ],
    });
    await adminTenant(tenantId, userId, membershipId, async (client) => {
      await client.query(
        `INSERT INTO public.branch_products
          (tenant_id, branch_id, product_id, reorder_point_base_units, updated_at)
         VALUES ($1, $2, $3, 200, now())
         ON CONFLICT (tenant_id, branch_id, product_id)
         DO UPDATE SET reorder_point_base_units = 200, updated_at = now()`,
        [tenantId, branchId, productId],
      );
    });
    const sale = (await salesService.checkout(principal, {
      branchId,
      customerName: "M5 Customer",
      customerPhone: "+252611111111",
      discount: "0",
      amountPaid: "10.0000",
      paymentMethod: "CASH",
      idempotencyKey: `checkout:${randomUUID()}`,
      lines: [{ productId, packageCode: "piece", packageQuantity: 4 }],
    })) as unknown as { id: string; items: Array<{ id: string }> };
    saleId = sale.id;
    await salesService.returnSale(principal, {
      branchId,
      saleId,
      reason: "M5 return evidence",
      refundMethod: "CASH",
      idempotencyKey: `return:${randomUUID()}`,
      lines: [{ saleItemId: sale.items[0]!.id, quantityBaseUnits: 2n }],
    });
    await salesService.checkout(principal, {
      branchId,
      customerName: "Overdue Customer",
      discount: "0",
      amountPaid: "0",
      dueDate: new Date("2020-01-01"),
      idempotencyKey: `checkout:${randomUUID()}`,
      lines: [{ productId, packageCode: "piece", packageQuantity: 1 }],
    });
    const category = (await expenseService.createCategory(principal, "Utilities")) as {
      id: string;
    };
    await expenseService.create(principal, {
      branchId,
      categoryId: category.id,
      title: "Internet",
      amount: "2.0000",
      expenseDate: new Date(),
      idempotencyKey: `expense:${randomUUID()}`,
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await migrator.query(
      "TRUNCATE TABLE public.report_exports, public.async_jobs, public.notifications, public.invoice_sequences, public.sales, public.expense_categories, public.inventory_receipts, public.products CASCADE",
    );
    await migrator.query("TRUNCATE TABLE public.audit_logs RESTART IDENTITY");
    await adminTenant(tenantId, userId, membershipId, async (client) => {
      await client.query("DELETE FROM public.membership_branches WHERE tenant_id = $1", [tenantId]);
      await client.query("DELETE FROM public.tenant_memberships WHERE tenant_id = $1", [tenantId]);
      await client.query("DELETE FROM public.branches WHERE tenant_id = $1", [tenantId]);
      await client.query("DELETE FROM public.tenants WHERE id = $1", [tenantId]);
      await client.query("DELETE FROM public.users WHERE id = $1", [userId]);
    });
    await adminTenant(otherTenantId, randomUUID(), randomUUID(), async (client) => {
      await client.query("DELETE FROM public.tenants WHERE id = $1", [otherTenantId]);
    });
    await migrator.end();
  });

  const range = () => ({
    branchId,
    from: new Date("2026-01-01"),
    to: new Date("2026-12-31"),
  });

  it("reports net sales, collections, debt, expenses, stock, and exact margin", async () => {
    const dashboard = (await reportService.dashboard(principal, range())) as {
      cards: Record<string, string | number>;
    };
    const margin = (await reportService.margin(principal, range())) as {
      totals: { netSales: string; costOfGoods: string; margin: string };
    };
    const inventory = (await reportService.inventory(principal, branchId)) as Array<{
      quantityOnHand: string;
    }>;

    expect(dashboard.cards).toMatchObject({
      salesCount: 2,
      grossSales: "12.5000",
      returnedTotal: "5.0000",
      netSales: "7.5000",
      collected: "5.0000",
      receivables: "2.5000",
      overdueDebts: 1,
      expenses: "2.0000",
      lowStockProducts: 1,
    });
    expect(margin.totals).toMatchObject({
      netSales: "7.5000",
      costOfGoods: "3.000000",
      margin: "4.5000",
    });
    expect(inventory[0]!.quantityOnHand).toBe("97");
  });

  it("generates an immutable invoice PDF", async () => {
    const document = await invoiceDocumentService.pdf(principal, saleId);
    expect(document.filename).toMatch(/^INV-RPT-/);
    expect(document.content.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(document.content.toString("ascii")).toContain("M5 Customer");
  });

  it("runs a deduplicated durable CSV export job", async () => {
    const key = `export:${randomUUID()}`;
    const job = (await jobService.enqueueExport(
      principal,
      {
        reportType: "sales",
        branchId,
        from: "2026-01-01",
        to: "2026-12-31",
      },
      key,
    )) as { id: string };
    const replay = (await jobService.enqueueExport(
      principal,
      {
        reportType: "sales",
        branchId,
        from: "2026-01-01",
        to: "2026-12-31",
      },
      key,
    )) as { id: string };
    jobId = job.id;
    expect(replay.id).toBe(job.id);

    const completed = (await jobService.process(
      principal,
      job.id,
      "m5-test-worker",
    )) as unknown as { status: string; result: { exportId: string } };
    expect(completed.status).toBe("SUCCEEDED");
    exportId = completed.result.exportId;
    const artifact = await jobService.download(principal, exportId);
    expect(artifact.content.toString("utf8")).toContain("invoiceNumber");
  });

  it("deduplicates low-stock, expiry, and overdue notifications", async () => {
    const first = await notificationService.scan(principal, branchId, 30);
    const second = await notificationService.scan(principal, branchId, 30);
    const notifications = (await notificationService.list(principal, branchId)) as {
      unread: number;
      items: Array<{ id: string; type: string }>;
    };
    expect(first.created).toBe(3);
    expect(second.created).toBe(0);
    expect(notifications.items.map((item) => item.type).sort()).toEqual([
      "EXPIRING_BATCH",
      "LOW_STOCK",
      "OVERDUE_DEBT",
    ]);
    await notificationService.markRead(principal, notifications.items[0]!.id);
    const updated = (await notificationService.list(principal, branchId)) as {
      unread: number;
    };
    expect(updated.unread).toBe(2);
  });

  it("enforces report RLS and guarded job state", async () => {
    const other = { ...principal, tenantId: otherTenantId };
    const hidden = (await reportService.sales(other, range())) as { rows: unknown[] };
    expect(hidden.rows).toEqual([]);

    const app = new pg.Pool({ connectionString: appUrl });
    const client = await app.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await expect(
        client.query("UPDATE public.async_jobs SET status = 'DEAD' WHERE id = $1", [jobId]),
      ).rejects.toMatchObject({ code: "55000" });
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [otherTenantId]);
      const exports = await client.query("SELECT id FROM public.report_exports WHERE id = $1", [
        exportId,
      ]);
      expect(exports.rowCount).toBe(0);
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await app.end();
    }
  });
});
