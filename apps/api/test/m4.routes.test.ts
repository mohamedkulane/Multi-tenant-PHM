import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthenticatedPrincipal, AuthService } from "../src/auth/auth.types.js";
import type { ExpenseService } from "../src/finance/expense.service.js";
import type { SalesService } from "../src/finance/sales.service.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const branchId = "22222222-2222-4222-8222-222222222222";
const saleId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const categoryId = "55555555-5555-4555-8555-555555555555";

const principal: AuthenticatedPrincipal = {
  sessionId: "66666666-6666-4666-8666-666666666666",
  tenantId,
  tenantName: "Acme Pharmacy",
  userId: "77777777-7777-4777-8777-777777777777",
  fullName: "Tenant Owner",
  membershipId: "88888888-8888-4888-8888-888888888888",
  username: "owner",
  role: "OWNER",
  allBranches: true,
  branchIds: [],
};

const authentication: AuthService = {
  login: vi.fn(),
  authenticate: vi.fn().mockResolvedValue(principal),
  logout: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
};

function fakeSales(): SalesService {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: saleId }),
    checkout: vi.fn().mockResolvedValue({ id: saleId, invoiceNumber: "INV-B1-20260726-000001" }),
    addPayment: vi.fn().mockResolvedValue({ id: productId, amount: "1.0000" }),
    returnSale: vi.fn().mockResolvedValue({ id: saleId, status: "PARTIALLY_RETURNED" }),
    voidSale: vi.fn().mockResolvedValue({ id: saleId, status: "VOIDED" }),
  };
}

function fakeExpenses(): ExpenseService {
  return {
    listCategories: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockResolvedValue({ id: categoryId, name: "Utilities" }),
    updateCategory: vi.fn().mockResolvedValue({ id: categoryId, name: "Utilities", active: true }),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: saleId, amount: "10.0000" }),
    void: vi.fn().mockResolvedValue({ id: saleId, status: "VOIDED" }),
  };
}

describe("M4 API routes", () => {
  it("accepts an exact-string checkout command", async () => {
    const sales = fakeSales();
    const response = await request(createApp({ authentication, sales, expenses: fakeExpenses() }))
      .post("/api/v1/sales")
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        customerName: "Amina",
        discount: "0.2500",
        amountPaid: "1.0000",
        paymentMethod: "EVC_PLUS",
        idempotencyKey: "checkout:test:1",
        lines: [{ productId, packageCode: "unit", packageQuantity: 2 }],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.invoiceNumber).toBe("INV-B1-20260726-000001");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sales.checkout).toHaveBeenCalledOnce();
  });

  it("rejects floating-point-shaped numeric checkout money", async () => {
    const sales = fakeSales();
    const response = await request(createApp({ authentication, sales, expenses: fakeExpenses() }))
      .post("/api/v1/sales")
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        customerName: "Amina",
        discount: 0.25,
        amountPaid: "0",
        idempotencyKey: "checkout:test:2",
        lines: [{ productId, packageCode: "unit", packageQuantity: 2 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sales.checkout).not.toHaveBeenCalled();
  });

  it("optionally links a completed clinic visit to the existing atomic checkout", async () => {
    const sales = fakeSales();
    const response = await request(createApp({ authentication, sales, expenses: fakeExpenses() }))
      .post("/api/v1/sales")
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        customerName: "Clinical patient",
        clinicVisitId: saleId,
        amountPaid: "5.0000",
        paymentMethod: "E_DAHAB",
        idempotencyKey: "checkout:clinic-visit:1",
        lines: [
          {
            productId,
            packageCode: "unit",
            packageQuantity: 2,
          },
        ],
      });

    expect(response.status).toBe(201);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sales.checkout).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({
        clinicVisitId: saleId,
        lines: [expect.objectContaining({ productId })],
      }),
      expect.any(String),
    );
  });

  it("records a validated debt payment command", async () => {
    const sales = fakeSales();
    const response = await request(createApp({ authentication, sales, expenses: fakeExpenses() }))
      .post(`/api/v1/sales/${saleId}/payments`)
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        amount: "1.0000",
        method: "SALAAM_BANK",
        idempotencyKey: "payment:test:1",
      });

    expect(response.status).toBe(201);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sales.addPayment).toHaveBeenCalledOnce();
  });

  it.each(["CASH", "CARD", "OTHER", "BANK"])(
    "rejects unsupported new sale payment method %s",
    async (method) => {
      const sales = fakeSales();
      const response = await request(createApp({ authentication, sales, expenses: fakeExpenses() }))
        .post(`/api/v1/sales/${saleId}/payments`)
        .set("Cookie", "phms_session=test")
        .send({ branchId, amount: "1.00", method, idempotencyKey: `reject:${method}` });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: "UNSUPPORTED_PAYMENT_METHOD",
        message: "Unsupported payment method. Choose EVC-Plus, E-Dahab, or Salaam Bank.",
      });
      expect(sales.addPayment.mock.calls).toHaveLength(0);
    },
  );

  it("posts a branch expense with a tenant category", async () => {
    const expenses = fakeExpenses();
    const response = await request(createApp({ authentication, sales: fakeSales(), expenses }))
      .post("/api/v1/expenses")
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        categoryId,
        title: "Electricity",
        amount: "25.5000",
        expenseDate: "2026-07-26",
        idempotencyKey: "expense:test:1",
      });

    expect(response.status).toBe(201);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(expenses.create).toHaveBeenCalledOnce();
  });

  it("updates and deactivates an expense category", async () => {
    const expenses = fakeExpenses();
    const response = await request(createApp({ authentication, sales: fakeSales(), expenses }))
      .patch(`/api/v1/expenses/categories/${categoryId}`)
      .set("Cookie", "phms_session=test")
      .send({ name: "Branch utilities", active: false });

    expect(response.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(expenses.updateCategory).toHaveBeenCalledOnce();
  });
});
