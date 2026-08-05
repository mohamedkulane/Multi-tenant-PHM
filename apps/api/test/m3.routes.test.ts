import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthenticatedPrincipal, AuthService } from "../src/auth/auth.types.js";
import type { CatalogService } from "../src/inventory/catalog.service.js";
import type { InventoryService } from "../src/inventory/inventory.service.js";

const principal: AuthenticatedPrincipal = {
  sessionId: "22222222-2222-4222-8222-222222222222",
  tenantId: "11111111-1111-4111-8111-111111111111",
  tenantName: "Acme Pharmacy",
  userId: "33333333-3333-4333-8333-333333333333",
  fullName: "Tenant Owner",
  membershipId: "44444444-4444-4444-8444-444444444444",
  username: "owner",
  role: "OWNER",
  allBranches: true,
  branchIds: [],
};

const authentication: AuthService = {
  login: vi.fn(),
  authenticate: vi.fn().mockResolvedValue(principal),
  logout: vi.fn(),
};

function fakeCatalog(): CatalogService {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: randomId }),
    create: vi.fn().mockResolvedValue({ id: randomId, name: "Gauze" }),
    update: vi.fn().mockResolvedValue({ id: randomId, version: 2 }),
    configureBranch: vi.fn().mockResolvedValue({ productId: randomId, active: true }),
  };
}

function fakeInventory(): InventoryService {
  return {
    listStock: vi.fn().mockResolvedValue([]),
    listMovements: vi.fn().mockResolvedValue([]),
    receive: vi.fn().mockResolvedValue({ id: randomId, replayed: false }),
    adjust: vi.fn().mockResolvedValue({ balanceAfter: "10" }),
    writeOffExpired: vi.fn().mockResolvedValue({ balanceAfter: "0" }),
    transfer: vi.fn().mockResolvedValue({ id: randomId, status: "COMPLETED" }),
  };
}

const randomId = "55555555-5555-4555-8555-555555555555";
const branchId = "66666666-6666-4666-8666-666666666666";

describe("M3 API routes", () => {
  it("creates a product with category packaging", async () => {
    const app = createApp({
      authentication,
      catalog: fakeCatalog(),
      inventory: fakeInventory(),
    });
    const response = await request(app)
      .post("/api/v1/products")
      .set("Cookie", "phms_session=test")
      .send({
        name: "Gauze",
        category: "medical_supplies",
        baseUnit: "piece",
        counts: { piecesPerBox: 10 },
        outerPriceMinor: 2000,
      });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe("Gauze");
  });

  it("validates receipt quantities before calling the workflow", async () => {
    const app = createApp({
      authentication,
      catalog: fakeCatalog(),
      inventory: fakeInventory(),
    });
    const response = await request(app)
      .post("/api/v1/inventory/receipts")
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        idempotencyKey: "receipt:test:1",
        lines: [
          {
            productId: randomId,
            packageCode: "box",
            packageQuantity: 0,
            batchNumber: "B1",
            expiryDate: "2030-01-01",
            unitCost: "1.25",
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("accepts bigint quantities as strings for stock adjustments", async () => {
    const inventory = fakeInventory();
    const app = createApp({
      authentication,
      catalog: fakeCatalog(),
      inventory,
    });
    const response = await request(app)
      .post("/api/v1/inventory/adjustments")
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        batchId: randomId,
        direction: "OUT",
        quantityBaseUnits: "4",
        reason: "Damaged units",
        idempotencyKey: "adjust:test:1",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.balanceAfter).toBe("10");
  });

  it("updates product metadata, lifecycle, and package prices", async () => {
    const catalog = fakeCatalog();
    const response = await request(
      createApp({ authentication, catalog, inventory: fakeInventory() }),
    )
      .patch(`/api/v1/products/${randomId}`)
      .set("Cookie", "phms_session=test")
      .send({
        name: "Sterile Gauze",
        active: true,
        packagePricesMinor: { unit: 250 },
        expectedVersion: 1,
      });

    expect(response.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(catalog.update).toHaveBeenCalledOnce();
  });
  it("configures a branch product with a minimum-stock threshold and reason", async () => {
    const catalog = fakeCatalog();
    const response = await request(
      createApp({ authentication, catalog, inventory: fakeInventory() }),
    )
      .put(`/api/v1/products/${randomId}/branch-config`)
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        active: true,
        reorderPointBaseUnits: "25",
        reason: "Set low-stock notification level",
      });

    expect(response.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(catalog.configureBranch).toHaveBeenCalledWith(
      principal,
      randomId,
      expect.objectContaining({
        branchId,
        reorderPointBaseUnits: 25n,
        reason: "Set low-stock notification level",
      }),
      expect.any(String),
    );
  });

  it("rejects product archiving without an audit reason", async () => {
    const catalog = fakeCatalog();
    const response = await request(
      createApp({ authentication, catalog, inventory: fakeInventory() }),
    )
      .patch(`/api/v1/products/${randomId}`)
      .set("Cookie", "phms_session=test")
      .send({ active: false, expectedVersion: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(catalog.update).not.toHaveBeenCalled();
  });
});
