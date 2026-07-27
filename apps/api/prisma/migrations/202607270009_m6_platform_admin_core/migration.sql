-- CreateEnum
CREATE TYPE "SupportRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'EXPIRED');







































-- DropIndex
DROP INDEX "expenses_reporting_idx";

-- DropIndex
DROP INDEX "payments_reporting_idx";

-- DropIndex
DROP INDEX "sales_reporting_idx";

-- CreateTable
CREATE TABLE "platform_login_directory" (
    "user_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_login_directory_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(100),
    "target_tenant_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "limits" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "tenant_subscriptions" (
    "tenant_id" UUID NOT NULL,
    "plan_code" VARCHAR(50) NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(3),
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "tenant_branding" (
    "tenant_id" UUID NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "logo_url" VARCHAR(1000),
    "primary_color" CHAR(7) NOT NULL DEFAULT '#174C3F',
    "accent_color" CHAR(7) NOT NULL DEFAULT '#B8F39A',
    "invoice_footer" VARCHAR(500),
    "support_contact" VARCHAR(180),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_branding_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "support_access_requests" (
    "id" UUID NOT NULL,
    "target_tenant_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "status" "SupportRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "decision_reason" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_sessions" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "platform_user_id" UUID NOT NULL,
    "target_tenant_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_login_directory_email_key" ON "platform_login_directory"("email");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_token_hash_key" ON "platform_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "platform_sessions_user_id_expires_at_idx" ON "platform_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_sessions_user_id_id_key" ON "platform_sessions"("user_id", "id");

-- CreateIndex
CREATE INDEX "platform_audit_logs_actor_user_id_created_at_idx" ON "platform_audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_audit_logs_target_tenant_id_created_at_idx" ON "platform_audit_logs"("target_tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_subscriptions_plan_code_idx" ON "tenant_subscriptions"("plan_code");

-- CreateIndex
CREATE INDEX "support_access_requests_requested_by_user_id_status_created_idx" ON "support_access_requests"("requested_by_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "support_access_requests_target_tenant_id_status_created_at_idx" ON "support_access_requests"("target_tenant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_sessions_token_hash_key" ON "support_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "support_sessions_target_tenant_id_expires_at_idx" ON "support_sessions"("target_tenant_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_sessions_platform_user_id_id_key" ON "support_sessions"("platform_user_id", "id");

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "support_access_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
