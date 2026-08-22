import { createHash } from "node:crypto";
import { AsyncJobStatus, AsyncJobType, Prisma } from "@prisma/client";
import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import { prisma } from "../database/prisma.js";
import { setTransactionContext, withTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { canAccessBranch } from "../middleware/authorization.js";
import { recordsToExcel } from "./excel.js";
import { notificationService } from "./notification.service.js";
import { reportService } from "./report.service.js";

export type ExportReportType = "sales" | "inventory" | "debts" | "expenses" | "margin" | "clinical";

interface ExportPayload {
  reportType: ExportReportType;
  branchId: string;
  from?: string;
  to?: string;
}

export interface JobService {
  enqueueExport(
    principal: AuthenticatedPrincipal,
    payload: ExportPayload,
    deduplicationKey: string,
  ): Promise<unknown>;
  enqueueNotificationScan(
    principal: AuthenticatedPrincipal,
    branchId: string,
    expiryDays: number,
    deduplicationKey: string,
  ): Promise<unknown>;
  get(principal: AuthenticatedPrincipal, jobId: string): Promise<unknown>;
  process(principal: AuthenticatedPrincipal, jobId: string, workerId: string): Promise<unknown>;
  download(
    principal: AuthenticatedPrincipal,
    exportId: string,
  ): Promise<{ filename: string; mimeType: string; content: Buffer }>;
}

function assertBranch(principal: AuthenticatedPrincipal, branchId: string) {
  if (!canAccessBranch(principal, branchId)) {
    throw new AppError({
      statusCode: 403,
      code: "BRANCH_ACCESS_DENIED",
      message: "You do not have access to this branch",
    });
  }
}

function parsePayload(payload: Prisma.JsonValue): ExportPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid job payload");
  }
  const candidate = payload as Record<string, Prisma.JsonValue>;
  if (typeof candidate.reportType !== "string" || typeof candidate.branchId !== "string") {
    throw new Error("Invalid export payload");
  }
  return {
    reportType: candidate.reportType as ExportReportType,
    branchId: candidate.branchId,
    ...(typeof candidate.from === "string" ? { from: candidate.from } : {}),
    ...(typeof candidate.to === "string" ? { to: candidate.to } : {}),
  };
}

function rowsFromReport(report: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(report)) return report as Array<Record<string, unknown>>;
  if (report && typeof report === "object" && "rows" in report) {
    const rows = report.rows;
    if (Array.isArray(rows)) return rows as Array<Record<string, unknown>>;
  }
  return [];
}

export class PrismaJobService implements JobService {
  async enqueueExport(
    principal: AuthenticatedPrincipal,
    payload: ExportPayload,
    deduplicationKey: string,
  ) {
    assertBranch(principal, payload.branchId);
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId: payload.branchId,
      },
      (transaction) =>
        transaction.asyncJob.upsert({
          where: {
            tenantId_deduplicationKey: {
              tenantId: principal.tenantId,
              deduplicationKey,
            },
          },
          create: {
            tenantId: principal.tenantId,
            branchId: payload.branchId,
            type: AsyncJobType.REPORT_EXPORT,
            deduplicationKey,
            payload: { ...payload },
            requestedByMembershipId: principal.membershipId,
            requestedByUserId: principal.userId,
          },
          update: {},
        }),
    );
  }

  async enqueueNotificationScan(
    principal: AuthenticatedPrincipal,
    branchId: string,
    expiryDays: number,
    deduplicationKey: string,
  ) {
    assertBranch(principal, branchId);
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
        branchId,
      },
      (transaction) =>
        transaction.asyncJob.upsert({
          where: {
            tenantId_deduplicationKey: {
              tenantId: principal.tenantId,
              deduplicationKey,
            },
          },
          create: {
            tenantId: principal.tenantId,
            branchId,
            type: AsyncJobType.NOTIFICATION_SCAN,
            deduplicationKey,
            payload: { branchId, expiryDays },
            requestedByMembershipId: principal.membershipId,
            requestedByUserId: principal.userId,
          },
          update: {},
        }),
    );
  }

  async get(principal: AuthenticatedPrincipal, jobId: string) {
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const job = await transaction.asyncJob.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: jobId } },
        });
        if (!job || (job.branchId && !canAccessBranch(principal, job.branchId))) {
          throw new AppError({
            statusCode: 404,
            code: "JOB_NOT_FOUND",
            message: "Job not found",
          });
        }
        return job;
      },
    );
  }

  async process(principal: AuthenticatedPrincipal, jobId: string, workerId: string) {
    const job = await prisma.$transaction(async (transaction) => {
      await setTransactionContext(transaction, {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      });
      await transaction.$queryRaw(Prisma.sql`SELECT set_config('app.job_worker', 'true', true)`);
      const rows = await transaction.$queryRaw<
        Array<{
          id: string;
          branch_id: string | null;
          type: AsyncJobType;
          status: AsyncJobStatus;
          payload: Prisma.JsonValue;
          attempts: number;
          max_attempts: number;
        }>
      >(Prisma.sql`
        SELECT id, branch_id, type, status, payload, attempts, max_attempts
        FROM public.async_jobs
        WHERE tenant_id = ${principal.tenantId}::uuid AND id = ${jobId}::uuid
          AND status IN ('QUEUED', 'FAILED') AND run_at <= now()
        FOR UPDATE SKIP LOCKED
      `);
      const claimed = rows[0];
      if (!claimed) {
        return null;
      }
      if (claimed.branch_id) assertBranch(principal, claimed.branch_id);
      await transaction.asyncJob.update({
        where: { tenantId_id: { tenantId: principal.tenantId, id: jobId } },
        data: {
          status: AsyncJobStatus.RUNNING,
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lockedBy: workerId,
          lastError: null,
        },
      });
      return claimed;
    });
    if (!job) return this.get(principal, jobId);

    try {
      let result: Prisma.InputJsonValue;
      if (job.type === AsyncJobType.NOTIFICATION_SCAN) {
        const payload = job.payload as { branchId?: unknown; expiryDays?: unknown };
        if (typeof payload.branchId !== "string" || typeof payload.expiryDays !== "number") {
          throw new Error("Invalid notification job payload");
        }
        result = await notificationService.scan(principal, payload.branchId, payload.expiryDays);
      } else {
        const payload = parsePayload(job.payload);
        const range =
          payload.from && payload.to
            ? {
                branchId: payload.branchId,
                from: new Date(payload.from),
                to: new Date(payload.to),
              }
            : undefined;
        const report =
          payload.reportType === "sales"
            ? await reportService.sales(principal, range!)
            : payload.reportType === "inventory"
              ? await reportService.inventory(principal, payload.branchId)
              : payload.reportType === "debts"
                ? await reportService.debts(principal, payload.branchId)
                : payload.reportType === "expenses"
                  ? await reportService.expenses(principal, range!)
                  : payload.reportType === "margin"
                    ? await reportService.margin(principal, range!)
                    : await reportService.clinical(principal, range!);
        const workbook = recordsToExcel(rowsFromReport(report), payload.reportType);
        const content = Buffer.from(workbook, "utf8");
        const checksum = createHash("sha256").update(content).digest("hex");
        const artifact = await prisma.$transaction(async (transaction) => {
          await setTransactionContext(transaction, {
            tenantId: principal.tenantId,
            userId: principal.userId,
            membershipId: principal.membershipId,
            branchId: payload.branchId,
          });
          return transaction.reportExport.create({
            data: {
              tenantId: principal.tenantId,
              branchId: payload.branchId,
              jobId,
              filename: `${payload.reportType}-${payload.from ?? "current"}-${payload.to ?? "current"}.xls`,
              mimeType: "application/vnd.ms-excel; charset=utf-8",
              checksum,
              content,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });
        });
        result = { exportId: artifact.id, checksum, bytes: content.length };
      }
      return prisma.$transaction(async (transaction) => {
        await setTransactionContext(transaction, {
          tenantId: principal.tenantId,
          userId: principal.userId,
          membershipId: principal.membershipId,
        });
        await transaction.$queryRaw(Prisma.sql`SELECT set_config('app.job_worker', 'true', true)`);
        return transaction.asyncJob.update({
          where: { tenantId_id: { tenantId: principal.tenantId, id: jobId } },
          data: {
            status: AsyncJobStatus.SUCCEEDED,
            result,
            lockedAt: null,
            lockedBy: null,
          },
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "Unknown job error";
      await prisma.$transaction(async (transaction) => {
        await setTransactionContext(transaction, {
          tenantId: principal.tenantId,
          userId: principal.userId,
          membershipId: principal.membershipId,
        });
        await transaction.$queryRaw(Prisma.sql`SELECT set_config('app.job_worker', 'true', true)`);
        const dead = job.attempts + 1 >= job.max_attempts;
        await transaction.asyncJob.update({
          where: { tenantId_id: { tenantId: principal.tenantId, id: jobId } },
          data: {
            status: dead ? AsyncJobStatus.DEAD : AsyncJobStatus.FAILED,
            lastError: message,
            lockedAt: null,
            lockedBy: null,
            runAt: new Date(Date.now() + 2 ** job.attempts * 1000),
          },
        });
      });
      throw error;
    }
  }

  async download(principal: AuthenticatedPrincipal, exportId: string) {
    return withTenantContext(
      prisma,
      {
        tenantId: principal.tenantId,
        userId: principal.userId,
        membershipId: principal.membershipId,
      },
      async (transaction) => {
        const artifact = await transaction.reportExport.findUnique({
          where: { tenantId_id: { tenantId: principal.tenantId, id: exportId } },
        });
        if (
          !artifact ||
          artifact.expiresAt <= new Date() ||
          (artifact.branchId && !canAccessBranch(principal, artifact.branchId))
        ) {
          throw new AppError({
            statusCode: 404,
            code: "EXPORT_NOT_FOUND",
            message: "Export not found or expired",
          });
        }
        return {
          filename: artifact.filename,
          mimeType: artifact.mimeType,
          content: Buffer.from(artifact.content),
        };
      },
    );
  }
}

export const jobService = new PrismaJobService();
