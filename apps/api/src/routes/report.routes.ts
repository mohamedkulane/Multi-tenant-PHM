import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import {
  invoiceDocumentService,
  type InvoiceDocumentService,
} from "../reporting/invoice-document.service.js";
import { reportService, type ReportService } from "../reporting/report.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

function range(query: Record<string, unknown>) {
  return z.object({ branchId: uuid, from: date, to: date }).parse(query);
}

export function createReportRouter(
  authentication: AuthService,
  service: ReportService = reportService,
  documents: InvoiceDocumentService = invoiceDocumentService,
) {
  const router = Router();
  router.use(requireAuthentication(authentication), requirePermission("report.read"));

  router.get("/dashboard", async (request, response) => {
    response.json({ data: await service.dashboard(request.auth!, range(request.query)) });
  });

  router.get("/sales", async (request, response) => {
    response.json({ data: await service.sales(request.auth!, range(request.query)) });
  });

  router.get("/inventory", async (request, response) => {
    response.json({
      data: await service.inventory(request.auth!, uuid.parse(request.query.branchId)),
    });
  });

  router.get("/debts", async (request, response) => {
    response.json({
      data: await service.debts(request.auth!, uuid.parse(request.query.branchId)),
    });
  });

  router.get("/expenses", async (request, response) => {
    response.json({ data: await service.expenses(request.auth!, range(request.query)) });
  });

  router.get("/margin", async (request, response) => {
    response.json({ data: await service.margin(request.auth!, range(request.query)) });
  });

  router.get("/clinical", async (request, response) => {
    response.json({ data: await service.clinical(request.auth!, range(request.query)) });
  });

  router.get("/customer-history", async (request, response) => {
    const phone = z.string().trim().min(3).max(40).parse(request.query.phone);
    response.json({ data: await service.customerHistory(request.auth!, phone) });
  });

  router.get("/invoices/:saleId.pdf", async (request, response) => {
    const document = await documents.pdf(request.auth!, uuid.parse(request.params.saleId));
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${document.filename.replaceAll('"', "")}"`,
    );
    response.send(document.content);
  });

  return router;
}
