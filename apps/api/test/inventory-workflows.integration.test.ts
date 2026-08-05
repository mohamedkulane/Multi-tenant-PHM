import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthenticatedPrincipal } from "../src/auth/auth.types.js";
import { catalogService } from "../src/inventory/catalog.service.js";
import { inventoryService } from "../src/inventory/inventory.service.js";
import { prisma } from "../src/database/prisma.js";

const migratorUrl = process.env.TEST_ADMIN_DATABASE_URL;
const appUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = migratorUrl && appUrl ? describe : describe.skip;

describeDatabase("M3 live inventory workflows", () => {
  const migrator = new pg.Pool({ connectionString: migratorUrl });
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const userId = randomUUID();
  const membershipId = randomUUID();
  const branchA = randomUUID();
  const branchB = randomUUID();
  const principal: AuthenticatedPrincipal = {
    sessionId: randomUUID(),
    tenantId,
    tenantName: "M3 Test Pharmacy",
    userId,
    fullName: "Inventory Owner",
    membershipId,
    username: "inventory-owner",
    role: "OWNER",
    allBranches: true,
    branchIds: [],
  };
  let productId = "";
  let sourceBatchId = "";
  let expiredBatchId = "";

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
         VALUES ($1, 'M3 Test Pharmacy', $2, 'ACTIVE', 'test', 'UTC', 'USD', '{}', now())`,
        [tenantId, `m3-${tenantId}`],
      );
      await client.query(
        `INSERT INTO public.users
          (id, full_name, password_hash, status, updated_at)
         VALUES ($1, 'Inventory Owner', 'not-used-by-service-test', 'ACTIVE', now())`,
        [userId],
      );
      await client.query(
        `INSERT INTO public.tenant_memberships
          (id, tenant_id, user_id, username, role, status, all_branches, updated_at)
         VALUES ($1, $2, $3, 'inventory-owner', 'OWNER', 'ACTIVE', true, now())`,
        [membershipId, tenantId, userId],
      );
      await client.query(
        `INSERT INTO public.branches
          (id, tenant_id, name, code, timezone, updated_at)
         VALUES
          ($1, $3, 'Source Branch', 'SOURCE', 'UTC', now()),
          ($2, $3, 'Destination Branch', 'DEST', 'UTC', now())`,
        [branchA, branchB, tenantId],
      );
    });
    const otherUser = randomUUID();
    const otherMembership = randomUUID();
    await adminTenant(otherTenantId, otherUser, otherMembership, async (client) => {
      await client.query(
        `INSERT INTO public.tenants
            (id, name, slug, status, plan_code, timezone, currency_code, settings, updated_at)
           VALUES ($1, 'Other M3 Tenant', $2, 'ACTIVE', 'test', 'UTC', 'USD', '{}', now())`,
        [otherTenantId, `m3-other-${otherTenantId}`],
      );
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await migrator.query(
      "TRUNCATE TABLE public.inventory_receipts, public.inventory_transfers, public.products CASCADE",
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

  it("creates an isolated tenant product with exact packaging levels", async () => {
    const product = (await catalogService.create(principal, {
      name: "Sterile Gauze",
      category: "medical_supplies",
      baseUnit: "piece",
      sku: `GAUZE-${tenantId}`,
      counts: { piecesPerBox: 10 },
      outerPriceMinor: 2_000,
    })) as unknown as {
      id: string;
      packages: Array<{ code: string; unitsPerPackage: string }>;
    };
    productId = product.id;

    expect(product.packages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "box", unitsPerPackage: "10" }),
        expect.objectContaining({ code: "piece", unitsPerPackage: "1" }),
      ]),
    );

    const otherPrincipal = { ...principal, tenantId: otherTenantId };
    await expect(catalogService.list(otherPrincipal)).resolves.toEqual([]);
  });

  it("receives stock once for an idempotency key", async () => {
    const receiptInput = {
      branchId: branchA,
      idempotencyKey: `receipt:${randomUUID()}`,
      lines: [
        {
          productId,
          packageCode: "box",
          packageQuantity: 2,
          batchNumber: "BATCH-FUTURE",
          expiryDate: new Date("2030-12-31T00:00:00.000Z"),
          unitCost: "1.250000",
        },
      ],
    };
    const first = (await inventoryService.receive(principal, receiptInput)) as {
      replayed: boolean;
    };
    const replay = (await inventoryService.receive(principal, receiptInput)) as {
      replayed: boolean;
    };
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);

    const stock = (await inventoryService.listStock(principal, branchA)) as Array<{
      id: string;
      batchNumber: string;
      quantityOnHand: string;
    }>;
    const batch = stock.find(({ batchNumber }) => batchNumber === "BATCH-FUTURE")!;
    sourceBatchId = batch.id;
    expect(batch.quantityOnHand).toBe("20");
  });

  it("adjusts stock atomically and rejects a negative balance", async () => {
    const movement = (await inventoryService.adjust(principal, {
      branchId: branchA,
      batchId: sourceBatchId,
      direction: "OUT",
      quantityBaseUnits: 3n,
      reason: "Damaged during count",
      idempotencyKey: `adjust:${randomUUID()}`,
    })) as { balanceAfter: string };
    expect(movement.balanceAfter).toBe("17");

    await expect(
      inventoryService.adjust(principal, {
        branchId: branchA,
        batchId: sourceBatchId,
        direction: "OUT",
        quantityBaseUnits: 100n,
        reason: "Impossible count",
        idempotencyKey: `adjust:${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("transfers stock between branches with paired movements", async () => {
    const result = (await inventoryService.transfer(principal, {
      sourceBranchId: branchA,
      destinationBranchId: branchB,
      idempotencyKey: `transfer:${randomUUID()}`,
      lines: [{ sourceBatchId, quantityBaseUnits: 5n }],
    })) as { status: string };
    expect(result.status).toBe("COMPLETED");

    const [source, destination] = await Promise.all([
      inventoryService.listStock(principal, branchA),
      inventoryService.listStock(principal, branchB),
    ]);
    expect((source as Array<{ quantityOnHand: string }>)[0]?.quantityOnHand).toBe("12");
    expect((destination as Array<{ quantityOnHand: string }>)[0]?.quantityOnHand).toBe("5");
  });

  it("enforces branch assignment before a transfer starts", async () => {
    const restricted = {
      ...principal,
      allBranches: false,
      branchIds: [branchA],
    };
    await expect(
      inventoryService.transfer(restricted, {
        sourceBranchId: branchA,
        destinationBranchId: branchB,
        idempotencyKey: `transfer:${randomUUID()}`,
        lines: [{ sourceBatchId, quantityBaseUnits: 1n }],
      }),
    ).rejects.toMatchObject({ code: "BRANCH_ACCESS_DENIED" });
  });

  it("rejects receipts whose expiry date is already in the past", async () => {
    await expect(
      inventoryService.receive(principal, {
        branchId: branchA,
        idempotencyKey: `receipt:${randomUUID()}`,
        lines: [
          {
            productId,
            packageCode: "box",
            packageQuantity: 1,
            batchNumber: "BATCH-EXPIRED-REJECTED",
            expiryDate: new Date("2020-01-01T00:00:00.000Z"),
            unitCost: "1.000000",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "EXPIRY_DATE_IN_PAST" });
  });

  it("writes legacy expired stock to zero through an immutable movement", async () => {
    expiredBatchId = randomUUID();
    await adminTenant(tenantId, userId, membershipId, async (client) => {
      await client.query(
        `INSERT INTO public.inventory_batches
          (id, tenant_id, branch_id, product_id, batch_number, expiry_date, unit_cost,
           quantity_on_hand, updated_at)
         VALUES ($1, $2, $3, $4, 'BATCH-EXPIRED', '2020-01-01', 1, 10, now())`,
        [expiredBatchId, tenantId, branchA, productId],
      );
    });
    const movement = (await inventoryService.writeOffExpired(principal, {
      branchId: branchA,
      batchId: expiredBatchId,
      reason: "Expired batch disposal",
      idempotencyKey: `expiry:${randomUUID()}`,
    })) as { balanceAfter: string; id: bigint };
    expect(movement.balanceAfter).toBe("0");

    const movements = (await inventoryService.listMovements(
      principal,
      branchA,
      productId,
    )) as Array<{ batchId: string; type: string }>;
    expect(
      movements.some((item) => item.batchId === expiredBatchId && item.type === "EXPIRED"),
    ).toBe(true);
  });

  it("blocks direct balance writes and ledger mutation", async () => {
    const app = new pg.Pool({ connectionString: appUrl });
    const client = await app.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await expect(
        client.query("UPDATE public.inventory_batches SET quantity_on_hand = 999 WHERE id = $1", [
          sourceBatchId,
        ]),
      ).rejects.toMatchObject({ code: "55000" });
      await client.query("ROLLBACK");

      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await expect(
        client.query("DELETE FROM public.stock_movements WHERE batch_id = $1", [sourceBatchId]),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("ROLLBACK");
    } finally {
      client.release();
      await app.end();
    }
  });
});
