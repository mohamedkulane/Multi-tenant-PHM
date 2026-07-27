import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthenticatedPrincipal, AuthService } from "../src/auth/auth.types.js";
import type { InvoiceDocumentService } from "../src/reporting/invoice-document.service.js";
import type { JobService } from "../src/reporting/job.service.js";
import type { NotificationService } from "../src/reporting/notification.service.js";
import type { ReportService } from "../src/reporting/report.service.js";

const branchId = "11111111-1111-4111-8111-111111111111";
const saleId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";

const principal: AuthenticatedPrincipal = {
  sessionId: "44444444-4444-4444-8444-444444444444",
  tenantId: "55555555-5555-4555-8555-555555555555",
  tenantName: "Acme Pharmacy",
  userId: "66666666-6666-4666-8666-666666666666",
  fullName: "Report Owner",
  membershipId: "77777777-7777-4777-8777-777777777777",
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

function reports(): ReportService {
  return {
    dashboard: vi.fn().mockResolvedValue({ cards: { netSales: "10.0000" } }),
    sales: vi.fn().mockResolvedValue({ rows: [], totals: {} }),
    inventory: vi.fn().mockResolvedValue([]),
    debts: vi.fn().mockResolvedValue([]),
    expenses: vi.fn().mockResolvedValue({ rows: [], totals: [] }),
    margin: vi.fn().mockResolvedValue({ rows: [], totals: {} }),
    customerHistory: vi.fn().mockResolvedValue({ sales: [] }),
  };
}

function jobs(): JobService {
  return {
    enqueueExport: vi.fn().mockResolvedValue({ id: jobId, status: "QUEUED" }),
    enqueueNotificationScan: vi.fn().mockResolvedValue({ id: jobId, status: "QUEUED" }),
    get: vi.fn().mockResolvedValue({ id: jobId, status: "SUCCEEDED" }),
    process: vi.fn().mockResolvedValue({ id: jobId, status: "SUCCEEDED" }),
    download: vi.fn().mockResolvedValue({
      filename: "sales.csv",
      mimeType: "text/csv",
      content: Buffer.from("invoice,total"),
    }),
  };
}

function notifications(): NotificationService {
  return {
    list: vi.fn().mockResolvedValue({ unread: 0, items: [] }),
    scan: vi.fn().mockResolvedValue({ created: 0 }),
    markRead: vi.fn().mockResolvedValue({ id: jobId, readAt: new Date() }),
  };
}

const documents: InvoiceDocumentService = {
  pdf: vi.fn().mockResolvedValue({
    filename: "INV-1.pdf",
    content: Buffer.from("%PDF-1.4\n%%EOF"),
  }),
};

describe("M5 API routes", () => {
  it("returns a bounded dashboard report", async () => {
    const response = await request(
      createApp({
        authentication,
        reports: reports(),
        jobs: jobs(),
        notifications: notifications(),
        invoiceDocuments: documents,
      }),
    )
      .get(`/api/v1/reports/dashboard?branchId=${branchId}&from=2026-01-01&to=2026-01-31`)
      .set("Cookie", "phms_session=test");

    expect(response.status).toBe(200);
    expect(response.body.data.cards.netSales).toBe("10.0000");
  });

  it("rejects an invalid report date", async () => {
    const response = await request(createApp({ authentication, reports: reports() }))
      .get(`/api/v1/reports/sales?branchId=${branchId}&from=bad&to=2026-01-31`)
      .set("Cookie", "phms_session=test");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("returns a server-generated invoice PDF", async () => {
    const response = await request(
      createApp({ authentication, reports: reports(), invoiceDocuments: documents }),
    )
      .get(`/api/v1/reports/invoices/${saleId}.pdf`)
      .set("Cookie", "phms_session=test");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.body.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  it("queues an idempotent export", async () => {
    const response = await request(createApp({ authentication, jobs: jobs() }))
      .post("/api/v1/jobs/exports")
      .set("Cookie", "phms_session=test")
      .send({
        reportType: "sales",
        branchId,
        from: "2026-01-01",
        to: "2026-01-31",
        idempotencyKey: "export:test:1",
      });

    expect(response.status).toBe(202);
    expect(response.body.data.status).toBe("QUEUED");
  });
});
