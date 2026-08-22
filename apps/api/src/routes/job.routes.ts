import { Router } from "express";
import { z } from "zod";
import type { AuthService } from "../auth/auth.types.js";
import { jobService, type JobService } from "../reporting/job.service.js";
import { requireAuthentication } from "../middleware/authentication.js";
import { requirePermission } from "../middleware/authorization.js";

const uuid = z.uuid();
const idempotencyKey = z
  .string()
  .trim()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const exportSchema = z
  .object({
    reportType: z.enum(["sales", "inventory", "debts", "expenses", "margin", "clinical"]),
    branchId: uuid,
    from: date.optional(),
    to: date.optional(),
    idempotencyKey,
  })
  .refine((body) => (body.from && body.to) || (!body.from && !body.to), {
    message: "from and to must be provided together",
  });

export function createJobRouter(authentication: AuthService, service: JobService = jobService) {
  const router = Router();
  router.use(requireAuthentication(authentication), requirePermission("report.read"));

  router.post("/exports", async (request, response) => {
    const body = exportSchema.parse(request.body);
    const job = await service.enqueueExport(
      request.auth!,
      {
        reportType: body.reportType,
        branchId: body.branchId,
        ...(body.from ? { from: body.from } : {}),
        ...(body.to ? { to: body.to } : {}),
      },
      body.idempotencyKey,
    );
    response.status(202).json({ data: job });
  });

  router.post("/notification-scans", async (request, response) => {
    const body = z
      .object({
        branchId: uuid,
        expiryDays: z.number().int().min(1).max(365).default(30),
        idempotencyKey,
      })
      .parse(request.body);
    const job = await service.enqueueNotificationScan(
      request.auth!,
      body.branchId,
      body.expiryDays,
      body.idempotencyKey,
    );
    response.status(202).json({ data: job });
  });

  router.get("/:jobId", async (request, response) => {
    response.json({
      data: await service.get(request.auth!, uuid.parse(request.params.jobId)),
    });
  });

  router.post("/:jobId/process", async (request, response) => {
    response.json({
      data: await service.process(
        request.auth!,
        uuid.parse(request.params.jobId),
        "local-api-worker",
      ),
    });
  });

  router.get("/exports/:exportId/download", async (request, response) => {
    const artifact = await service.download(request.auth!, uuid.parse(request.params.exportId));
    response.setHeader("Content-Type", artifact.mimeType);
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${artifact.filename.replaceAll('"', "")}"`,
    );
    response.send(artifact.content);
  });

  return router;
}
