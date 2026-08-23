import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthenticatedPrincipal, AuthService } from "../src/auth/auth.types.js";
import { CustomerService } from "../src/crm/customer.service.js";
import { LabService } from "../src/lab/lab.service.js";
import { SupplierService } from "../src/partners/supplier.service.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";
const patientId = "10000000-0000-4000-8000-000000000003";
const testId = "10000000-0000-4000-8000-000000000004";

const principal: AuthenticatedPrincipal = {
  sessionId: "10000000-0000-4000-8000-000000000005",
  tenantId,
  tenantName: "M12 Pharmacy",
  userId: "10000000-0000-4000-8000-000000000006",
  fullName: "Tenant Owner",
  membershipId: "10000000-0000-4000-8000-000000000007",
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

function services() {
  const customers = new CustomerService();
  const suppliers = new SupplierService();
  const laboratory = new LabService();
  vi.spyOn(customers, "list").mockResolvedValue([
    { id: "customer-1", name: "Amina", phone: "0610000000", outstandingBalance: 15 },
  ] as never);
  vi.spyOn(customers, "get").mockResolvedValue({
    id: "customer-1",
    sales: [{ id: "sale-1", items: [{ id: "item-1", baseUnitsSold: 10n }] }],
  } as never);
  vi.spyOn(suppliers, "list").mockResolvedValue([
    { id: "supplier-1", name: "Trusted Supplier", active: true },
  ] as never);
  vi.spyOn(laboratory, "categories").mockResolvedValue([
    { id: "category-1", name: "Blood tests", tests: [] },
  ] as never);
  const createVisit = vi.spyOn(laboratory, "createVisit").mockResolvedValue({
    id: "visit-1",
    visitNumber: "LAB-20260801-TEST",
    status: "RESULTS_PENDING",
  } as never);
  const addPayment = vi.spyOn(laboratory, "addPayment").mockResolvedValue({
    id: "visit-1",
    total: "10.0000",
    amountPaid: "10.0000",
    payments: [{ amount: "10.0000", method: "CASH" }],
  } as never);
  return { customers, suppliers, laboratory, createVisit, addPayment };
}

describe("M12 customer, supplier and laboratory routes", () => {
  it("returns customer accounts and supplier records", async () => {
    const domain = services();
    const app = createApp({
      authentication,
      customers: domain.customers,
      suppliers: domain.suppliers,
      laboratory: domain.laboratory,
    });
    const [customers, suppliers] = await Promise.all([
      request(app).get("/api/v1/customers").set("Cookie", "phms_session=test"),
      request(app).get("/api/v1/suppliers").set("Cookie", "phms_session=test"),
    ]);
    expect(customers.status).toBe(200);
    expect(customers.body.data[0].outstandingBalance).toBe(15);
    expect(suppliers.status).toBe(200);
    expect(suppliers.body.data[0].name).toBe("Trusted Supplier");
  });

  it("serializes BigInt quantities in the customer ledger", async () => {
    const domain = services();
    const response = await request(createApp({ authentication, customers: domain.customers }))
      .get("/api/v1/customers/10000000-0000-4000-8000-000000000009")
      .set("Cookie", "phms_session=test");
    expect(response.status).toBe(200);
    expect(response.body.data.sales[0].items[0].baseUnitsSold).toBe("10");
  });
  it("validates and registers a priced laboratory visit", async () => {
    const domain = services();
    const response = await request(
      createApp({
        authentication,
        customers: domain.customers,
        suppliers: domain.suppliers,
        laboratory: domain.laboratory,
      }),
    )
      .post("/api/v1/lab/visits")
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        patientId,
        testIds: [testId],
        discount: "2.00",
        amountPaid: "8.00",
        paymentMethod: "EVC_PLUS",
        clinicalNotes: "Routine test",
      });
    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("RESULTS_PENDING");
    expect(domain.createVisit).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({ branchId, patientId, testIds: [testId] }),
      expect.any(String),
    );
  });

  it("allows a lab visit to be registered unpaid and collected when results are picked up", async () => {
    const domain = services();
    const app = createApp({
      authentication,
      customers: domain.customers,
      suppliers: domain.suppliers,
      laboratory: domain.laboratory,
    });
    const unpaid = await request(app)
      .post("/api/v1/lab/visits")
      .set("Cookie", "phms_session=test")
      .send({
        branchId,
        patientId,
        testIds: [testId],
        discount: "0",
        amountPaid: "0",
      });
    expect(unpaid.status).toBe(201);
    expect(domain.createVisit).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({ amountPaid: "0" }),
      expect.any(String),
    );
    expect(domain.createVisit.mock.calls[0]?.[1]).not.toHaveProperty("paymentMethod");

    const payment = await request(app)
      .post("/api/v1/lab/visits/" + patientId + "/payments")
      .set("Cookie", "phms_session=test")
      .send({
        amount: "10.00",
        method: "E_DAHAB",
        idempotencyKey: "lab-payment-route-test",
      });
    expect(payment.status).toBe(201);
    expect(payment.body.data.amountPaid).toBe("10.0000");
    expect(domain.addPayment).toHaveBeenCalledWith(
      principal,
      patientId,
      expect.objectContaining({ amount: "10.00", method: "E_DAHAB" }),
      expect.any(String),
    );
  });

  it("rejects a legacy laboratory payment method", async () => {
    const domain = services();
    const response = await request(
      createApp({
        authentication,
        customers: domain.customers,
        suppliers: domain.suppliers,
        laboratory: domain.laboratory,
      }),
    )
      .post("/api/v1/lab/visits/" + patientId + "/payments")
      .set("Cookie", "phms_session=test")
      .send({ amount: "10.00", method: "CARD", idempotencyKey: "lab-legacy-method" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UNSUPPORTED_PAYMENT_METHOD");
    expect(domain.addPayment).not.toHaveBeenCalled();
  });

  it("prevents reception staff from entering laboratory results", async () => {
    const receptionist: AuthenticatedPrincipal = { ...principal, role: "RECEPTIONIST" };
    const restrictedAuthentication: AuthService = {
      login: vi.fn(),
      authenticate: vi.fn().mockResolvedValue(receptionist),
      logout: vi.fn(),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
    };
    const laboratory = new LabService();
    const markResult = vi.spyOn(laboratory, "markResult");
    const response = await request(
      createApp({ authentication: restrictedAuthentication, laboratory }),
    )
      .patch(`/api/v1/lab/visits/${patientId}/tests/${testId}/result`)
      .set("Cookie", "phms_session=test")
      .send({ resultStatus: "POSITIVE" });

    expect(response.status).toBe(403);
    expect(markResult).not.toHaveBeenCalled();
  });

  it("accepts qualitative, numeric and panel result payloads from a lab technician", async () => {
    const technician: AuthenticatedPrincipal = { ...principal, role: "LAB_TECHNICIAN" };
    const labAuthentication: AuthService = {
      login: vi.fn(),
      authenticate: vi.fn().mockResolvedValue(technician),
      logout: vi.fn(),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
    };
    const laboratory = new LabService();
    const markResult = vi
      .spyOn(laboratory, "markResult")
      .mockResolvedValue({ id: patientId } as never);
    const app = createApp({ authentication: labAuthentication, laboratory });
    const endpoint = `/api/v1/lab/visits/${patientId}/tests/${testId}/result`;
    const qualitative = await request(app)
      .patch(endpoint)
      .set("Cookie", "phms_session=test")
      .send({ resultStatus: "POSITIVE", interpretation: "POSITIVE" });
    const numeric = await request(app)
      .patch(endpoint)
      .set("Cookie", "phms_session=test")
      .send({ resultStatus: "COMPLETED", numericValue: 145, interpretation: "HIGH" });
    const panel = await request(app)
      .patch(endpoint)
      .set("Cookie", "phms_session=test")
      .send({
        resultStatus: "COMPLETED",
        resultData: {
          components: [{ name: "WBC", value: "7.2", unit: "10^9/L", interpretation: "NORMAL" }],
        },
      });

    expect([qualitative.status, numeric.status, panel.status]).toEqual([200, 200, 200]);
    expect(markResult).toHaveBeenNthCalledWith(
      2,
      technician,
      patientId,
      testId,
      expect.objectContaining({ resultStatus: "COMPLETED", numericValue: 145 }),
    );
    expect(markResult).toHaveBeenNthCalledWith(
      3,
      technician,
      patientId,
      testId,
      expect.objectContaining({ resultData: expect.any(Object) }),
    );
  });
});
