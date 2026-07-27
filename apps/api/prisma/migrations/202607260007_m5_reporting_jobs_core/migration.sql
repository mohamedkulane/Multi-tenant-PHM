-- CreateEnum
CREATE TYPE "AsyncJobType" AS ENUM ('REPORT_EXPORT', 'NOTIFICATION_SCAN');

-- CreateEnum
CREATE TYPE "AsyncJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LOW_STOCK', 'EXPIRING_BATCH', 'OVERDUE_DEBT', 'JOB_FAILED');
































-- CreateTable
CREATE TABLE "async_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "type" "AsyncJobType" NOT NULL,
    "status" "AsyncJobStatus" NOT NULL DEFAULT 'QUEUED',
    "deduplication_key" VARCHAR(160) NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "run_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "locked_by" VARCHAR(120),
    "last_error" VARCHAR(2000),
    "requested_by_membership_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "async_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_exports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "job_id" UUID NOT NULL,
    "filename" VARCHAR(240) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID,
    "type" "NotificationType" NOT NULL,
    "fingerprint" VARCHAR(200) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "entity_type" VARCHAR(80),
    "entity_id" VARCHAR(100),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(3),
    "read_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "async_jobs_status_run_at_created_at_idx" ON "async_jobs"("status", "run_at", "created_at");

-- CreateIndex
CREATE INDEX "async_jobs_tenant_id_branch_id_created_at_idx" ON "async_jobs"("tenant_id", "branch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "async_jobs_tenant_id_id_key" ON "async_jobs"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "async_jobs_tenant_id_deduplication_key_key" ON "async_jobs"("tenant_id", "deduplication_key");

-- CreateIndex
CREATE INDEX "report_exports_tenant_id_branch_id_expires_at_idx" ON "report_exports"("tenant_id", "branch_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_exports_tenant_id_id_key" ON "report_exports"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "report_exports_tenant_id_job_id_key" ON "report_exports"("tenant_id", "job_id");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_branch_id_read_at_created_at_idx" ON "notifications"("tenant_id", "branch_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_id_key" ON "notifications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_fingerprint_key" ON "notifications"("tenant_id", "fingerprint");
