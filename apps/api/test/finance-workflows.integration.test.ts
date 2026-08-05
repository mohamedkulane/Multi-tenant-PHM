import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "../src/auth/auth.types.js";
import { expenseService } from "../src/finance/expense.service.js";
import { salesService } from "../src/finance/sales.service.js";
import { catalogService } from "../src/inventory/catalog.service.js";
import { inventoryService } from "../src/inventory/inventory.service.js";
import { prisma } from "../src/database/prisma.js";

const migratorUrl = process.env.TEST_ADMIN_DATABASE_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = migratorUrl && appUrl ? describe : describe.skip;

describeDatabase("M4 live finance workflows", () => {
  const migrator = new pg.Pool({ connectionString: migratorUrl });
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const branchId = randomUUID();
  const principal: AuthenticatedPrincipal = {
    sessionId: randomUUID(),
    tenantId,
    tenantName: "M4 Test Pharmacy",
    userId,
    fullName: "Finance Owner",
    membershipId,
    username: "finance-owner",
    role: "OWNER",
    allBranches: true,
    branchIds: [],
  };
  let productId = "";
  let saleId = "";
  let saleItemId = "";
  let expenseCategoryId = "";
  let expenseId = "";

  async function adminTenant(
    targetTenantId: string,
    targetUserId: string,
    targetMembershipId: string,
    operation: (client: pg.PoolClient) => Promise<void>,
  ) {
    const client = await migrator.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [targetTenantId]);
      await client.query("SELECT set_config('app.user_id', $1, true)", [targetUserId]);
      await client.query("SELECT set_config('app.membership_id', $1, true)", [targetMembershipId]);
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
         VALUES ($1, 'M4 Test Pharmacy', $2, 'ACTIVE', 'test', 'UTC', 'USD', '{}', now())`,
        [tenantId, `m4-${tenantId}`],
      );
      await client.query(
        `INSERT INTO public.users
          (id, full_name, password_hash, status, updated_at)
         VALUES ($1, 'Finance Owner', 'not-used-by-service-test', 'ACTIVE', now())`,
        [userId],
      );
      await client.query(
        `INSERT INTO public.tenant_memberships
          (id, tenant_id, user_id, username, role, status, all_branches, updated_at)
         VALUES ($1, $2, $3, 'finance-owner', 'OWNER', 'ACTIVE', true, now())`,
        [membershipId, tenantId, userId],
      );
      await client.query(
        `INSERT INTO public.branches
          (id, tenant_id, name, code, timezone, updated_at)
         VALUES ($1, $2, 'Main Branch', 'MAIN', 'UTC', now())`,
        [branchId, tenantId],
      );
    });
    await adminTenant(otherTenantId, randomUUID(), randomUUID(), async (client) => {
      await client.query(
        `INSERT INTO public.tenants
          (id, name, slug, status, plan_code, timezone, currency_code, settings, updated_at)
         VALUES ($1, 'Other M4 Tenant', $2, 'ACTIVE', 'test', 'UTC', 'USD', '{}', now())`,
        [otherTenantId, `m4-other-${otherTenantId}`],
      );
    });

    const product = (await catalogService.create(principal, {
      name: "M4 Test Gauze",
      category: "medical_supplies",
      baseUnit: "piece",
      sku: `M4-GAUZE-${tenantId}`,
      counts: { piecesPerBox: 10 },
      outerPriceMinor: 2_500,
    })) as unknown as { id: string };
    productId = product.id;
    await inventoryService.receive(principal, {
      branchId,
      idempotencyKey: `m4-receipt:${randomUUID()}`,
      lines: [
        {
          productId,
          packageCode: "box",
          packageQuantity: 10,
          batchNumber: "M4-BATCH",
          expiryDate: new Date("2030-12-31"),
          unitCost: "1.000000",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await migrator.query(
      "TRUNCATE TABLE public.invoice_sequences, public.sales, public.expense_categories, public.inventory_receipts, public.products CASCADE",
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

  it("commits checkout, stock, debt, payment, and audit atomically and idempotently", async () => {
    const input = {
      branchId,
      customerName: "Amina Hassan",
      customerPhone: "+252610000000",
      discount: "1.0000",
      amountPaid: "3.0000",
      paymentMethod: "CASH" as const,
      idempotencyKey: `checkout:${randomUUID()}`,
      lines: [{ productId, packageCode: "piece", packageQuantity: 4 }],
    };
    const sale = (await salesService.checkout(principal, input)) as unknown as {
      id: string;
      invoiceNumber: string;
      grandTotal: string;
      amountPaid: string;
      remainingBalance: string;
      items: Array<{ id: string }>;
      payments: unknown[];
      debt: { status: string; remainingAmount: string };
    };
    const replay = (await salesService.checkout(principal, input)) as unknown as {
      id: string;
    };
    saleId = sale.id;
    saleItemId = sale.items[0]!.id;

    expect(replay.id).toBe(sale.id);
    expect(sale.invoiceNumber).toMatch(/^INV-MAIN-\d{8}-000001$/);
    expect(sale.grandTotal).toBe("9");
    expect(sale.amountPaid).toBe("3");
    expect(sale.remainingBalance).toBe("6");
    expect(sale.payments).toHaveLength(1);
    expect(sale.debt).toMatchObject({ status: "OPEN", remainingAmount: "6" });

    const stock = (await inventoryService.listStock(principal, branchId)) as Array<{
      quantityOnHand: string;
    }>;
    expect(stock[0]!.quantityOnHand).toBe("96");
  });

  it("locks and settles debt with an idempotent append-only payment", async () => {
    const input = {
      branchId,
      saleId,
      amount: "6.0000",
      method: "MOBILE_MONEY" as const,
      externalReference: "M4-PAYMENT-1",
      idempotencyKey: `payment:${randomUUID()}`,
    };
    const payment = (await salesService.addPayment(principal, input)) as unknown as {
      id: string;
    };
    const replay = (await salesService.addPayment(principal, input)) as unknown as {
      id: string;
    };
    const sale = (await salesService.get(principal, saleId)) as unknown as {
      amountPaid: string;
      remainingBalance: string;
      debt: { status: string; remainingAmount: string };
    };

    expect(replay.id).toBe(payment.id);
    expect(sale.amountPaid).toBe("9");
    expect(sale.remainingBalance).toBe("0");
    expect(sale.debt).toMatchObject({ status: "PAID", remainingAmount: "0" });
  });

  it("returns allocated stock and records a linked refund", async () => {
    const sale = (await salesService.returnSale(principal, {
      branchId,
      saleId,
      reason: "Customer returned unopened items",
      refundMethod: "CASH",
      idempotencyKey: `return:${randomUUID()}`,
      lines: [{ saleItemId, quantityBaseUnits: 2n }],
    })) as unknown as {
      status: string;
      amountPaid: string;
      returnedTotal: string;
      payments: Array<{ type: string; amount: string }>;
    };

    expect(sale.status).toBe("PARTIALLY_RETURNED");
    expect(sale.amountPaid).toBe("4.5");
    expect(sale.returnedTotal).toBe("4.5");
    expect(sale.payments).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "REFUND", amount: "4.5" })]),
    );
    const stock = (await inventoryService.listStock(principal, branchId)) as Array<{
      quantityOnHand: string;
    }>;
    expect(stock[0]!.quantityOnHand).toBe("98");
  });

  it("voids the remaining sale through compensating stock and refund events", async () => {
    const sale = (await salesService.voidSale(principal, {
      branchId,
      saleId,
      reason: "Approved full invoice cancellation",
      refundMethod: "CASH",
      idempotencyKey: `void:${randomUUID()}`,
    })) as unknown as {
      status: string;
      amountPaid: string;
      returnedTotal: string;
      debt: { status: string };
    };

    expect(sale.status).toBe("VOIDED");
    expect(sale.amountPaid).toBe("0");
    expect(sale.returnedTotal).toBe("9");
    expect(sale.debt.status).toBe("VOIDED");
    const stock = (await inventoryService.listStock(principal, branchId)) as Array<{
      quantityOnHand: string;
    }>;
    expect(stock[0]!.quantityOnHand).toBe("100");
  });

  it("allocates the next branch invoice number transactionally", async () => {
    const sale = (await salesService.checkout(principal, {
      branchId,
      customerName: "Second Customer",
      discount: "0",
      amountPaid: "0",
      idempotencyKey: `checkout:${randomUUID()}`,
      lines: [{ productId, packageCode: "piece", packageQuantity: 1 }],
    })) as unknown as { id: string; invoiceNumber: string };

    expect(sale.invoiceNumber).toMatch(/^INV-MAIN-\d{8}-000002$/);
    await salesService.voidSale(principal, {
      branchId,
      saleId: sale.id,
      reason: "Test cleanup cancellation",
      idempotencyKey: `void:${randomUUID()}`,
    });
  });

  it("reserves shared batch stock across different packages of the same product", async () => {
    const sale = (await salesService.checkout(principal, {
      branchId,
      customerName: "Package Mix Customer",
      discount: "0",
      amountPaid: "0",
      idempotencyKey: `checkout:${randomUUID()}`,
      lines: [
        { productId, packageCode: "box", packageQuantity: 1 },
        { productId, packageCode: "piece", packageQuantity: 2 },
      ],
    })) as unknown as { id: string; items: unknown[] };

    expect(sale.items).toHaveLength(2);
    const stockAfterSale = (await inventoryService.listStock(principal, branchId)) as Array<{
      quantityOnHand: string;
    }>;
    expect(stockAfterSale[0]!.quantityOnHand).toBe("88");

    await salesService.voidSale(principal, {
      branchId,
      saleId: sale.id,
      reason: "Multi-package allocation test cleanup",
      idempotencyKey: `void:${randomUUID()}`,
    });
    const stockAfterVoid = (await inventoryService.listStock(principal, branchId)) as Array<{
      quantityOnHand: string;
    }>;
    expect(stockAfterVoid[0]!.quantityOnHand).toBe("100");
  });
  it("posts and voids an expense without deleting financial evidence", async () => {
    const category = (await expenseService.createCategory(principal, "Utilities")) as {
      id: string;
    };
    expenseCategoryId = category.id;
    const input = {
      branchId,
      categoryId: expenseCategoryId,
      title: "Electricity",
      amount: "50.2500",
      expenseDate: new Date("2026-07-26"),
      idempotencyKey: `expense:${randomUUID()}`,
    };
    const expense = (await expenseService.create(principal, input)) as {
      id: string;
      status: string;
    };
    const replay = (await expenseService.create(principal, input)) as { id: string };
    expenseId = expense.id;
    expect(replay.id).toBe(expense.id);

    const voided = (await expenseService.void(
      principal,
      branchId,
      expenseId,
      "Duplicate supplier bill",
    )) as { status: string; voidReason: string | null };
    expect(voided).toMatchObject({
      status: "VOIDED",
      voidReason: "Duplicate supplier bill",
    });
  });

  it("enforces tenant RLS and blocks direct finance mutations", async () => {
    const app = new pg.Pool({ connectionString: appUrl });
    const client = await app.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [otherTenantId]);
      const hidden = await client.query("SELECT id FROM public.sales WHERE id = $1", [saleId]);
      expect(hidden.rowCount).toBe(0);
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await expect(
        client.query("UPDATE public.sales SET customer_name = 'Tampered' WHERE id = $1", [saleId]),
      ).rejects.toMatchObject({ code: "55000" });
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await expect(
        client.query("DELETE FROM public.payments WHERE sale_id = $1", [saleId]),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await app.end();
    }
  });
});
