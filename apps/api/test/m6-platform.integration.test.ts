import { randomUUID } from "node:crypto";
import { Prisma, TenantStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authService } from "../src/auth/auth.service.js";
import { hashPassword } from "../src/auth/password.js";
import { roleHasPermission } from "../src/auth/permissions.js";
import { prisma } from "../src/database/prisma.js";
import { platformAdminService } from "../src/platform/platform-admin.service.js";
import { platformAuthService } from "../src/platform/platform-auth.service.js";
import type { PlatformPrincipal } from "../src/platform/platform-auth.types.js";
import { supportAccessService } from "../src/platform/support-access.service.js";

const appUrl = process.env.TEST_DATABASE_URL;
const describeDatabase = appUrl ? describe : describe.skip;

const superId = "61000000-0000-4000-8000-000000000001";
const supportId = "61000000-0000-4000-8000-000000000002";
const superEmail = "m6-super-admin@phms.test";
const supportEmail = "m6-support@phms.test";
const ownerEmail = "m6-owner@phms.test";
const platformPassword = "M6-Platform-Password-123!";
const ownerPassword = "M6-Tenant-Owner-Password-123!";
const fixtureSlug = "m6-live-platform-fixture";

async function platformContext(
  transaction: Prisma.TransactionClient,
  userId: string,
  tenantId = "",
) {
  await transaction.$queryRaw(
    Prisma.sql`SELECT
      set_config('app.user_id', ${userId}, true),
      set_config('app.tenant_id', ${tenantId}, true),
      set_config('app.platform_admin', 'true', true)
    `,
  );
}

describeDatabase("M6 live PostgreSQL platform administration", () => {
  let superPrincipal: PlatformPrincipal;
  let supportPrincipal: PlatformPrincipal;
  let tenantId: string;
  let ownerMembershipId: string;
  let ownerUserId: string;
  let ownerSessionToken: string | undefined;

  beforeAll(async () => {
    const passwordHash = await hashPassword(platformPassword);
    for (const account of [
      { id: superId, email: superEmail, name: "M6 Super Admin", role: "SUPER_ADMIN" as const },
      { id: supportId, email: supportEmail, name: "M6 Support", role: "SUPPORT" as const },
    ]) {
      await prisma.$transaction(async (transaction) => {
        await platformContext(transaction, account.id);
        await transaction.user.upsert({
          where: { id: account.id },
          create: {
            id: account.id,
            email: account.email,
            fullName: account.name,
            passwordHash,
          },
          update: {
            email: account.email,
            fullName: account.name,
            passwordHash,
            status: "ACTIVE",
          },
        });
        await transaction.platformUser.upsert({
          where: { userId: account.id },
          create: { userId: account.id, role: account.role },
          update: { role: account.role, active: true },
        });
      });
    }

    const superLogin = await platformAuthService.login({
      email: superEmail,
      password: platformPassword,
    });
    await expect(
      platformAuthService.login({
        email: supportEmail,
        password: platformPassword,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PLATFORM_CREDENTIALS" });
    superPrincipal = superLogin.principal;
    supportPrincipal = {
      sessionId: "61000000-0000-4000-8000-000000000099",
      userId: supportId,
      email: supportEmail,
      fullName: "M6 Support",
      role: "SUPPORT",
    };

    const existing = await prisma.tenantLoginDirectory.findUnique({
      where: { slug: fixtureSlug },
    });
    if (existing) {
      tenantId = existing.tenantId;
      const tenant = (await platformAdminService.getTenant(superPrincipal, tenantId)) as {
        memberships: Array<{ id: string }>;
      };
      const owner = await prisma.$transaction(async (transaction) => {
        await platformContext(transaction, superId, tenantId);
        return transaction.tenantMembership.findFirstOrThrow({
          where: { tenantId, username: "owner" },
          select: { id: true, userId: true },
        });
      });
      ownerMembershipId = owner.id;
      ownerUserId = owner.userId;
      void tenant;
      await platformAdminService.setStatus(
        superPrincipal,
        tenantId,
        TenantStatus.TRIAL,
        "Reset stable M6 test fixture",
      );
      await platformAdminService.setPlan(superPrincipal, tenantId, "starter", {});
    } else {
      const result = (await platformAdminService.onboard(superPrincipal, {
        name: "M6 Live Pharmacy",
        slug: fixtureSlug,
        timezone: "Africa/Nairobi",
        currencyCode: "KES",
        planCode: "starter",
        branchName: "Main Branch",
        branchCode: "MAIN",
        ownerFullName: "M6 Tenant Owner",
        ownerEmail,
        ownerUsername: "owner",
        ownerPassword,
      })) as {
        tenant: { id: string };
        owner: { membershipId: string; userId: string };
      };
      tenantId = result.tenant.id;
      ownerMembershipId = result.owner.membershipId;
      ownerUserId = result.owner.userId;
    }
  }, 60_000);

  afterAll(async () => {
    if (ownerSessionToken) await authService.logout(ownerSessionToken);
    await prisma.$disconnect();
  });

  it("allows admin platform login and rejects support password login", () => {
    expect(superPrincipal.role).toBe("SUPER_ADMIN");
    expect(supportPrincipal.role).toBe("SUPPORT");
    expect(superPrincipal.email).toBe(superEmail);
  });

  it("creates an immediately usable tenant owner account", async () => {
    const result = await authService.login({
      tenantSlug: fixtureSlug,
      username: "owner",
      password: ownerPassword,
    });
    ownerSessionToken = result.sessionToken;

    expect(result.principal.tenantId).toBe(tenantId);
    expect(result.principal.role).toBe("OWNER");
    expect(result.principal.membershipId).toBe(ownerMembershipId);
  });

  it("enforces the starter branch limit in PostgreSQL", async () => {
    await expect(
      prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(
          Prisma.sql`SELECT
            set_config('app.tenant_id', ${tenantId}, true),
            set_config('app.user_id', ${ownerUserId}, true),
            set_config('app.membership_id', ${ownerMembershipId}, true)
          `,
        );
        await transaction.branch.create({
          data: {
            id: randomUUID(),
            tenantId,
            name: "Limit Rejected",
            code: `LIMIT-${Date.now()}`,
            timezone: "Africa/Nairobi",
          },
        });
      }),
    ).rejects.toThrow(/PLAN_LIMIT_EXCEEDED:maxBranches/);
  });

  it("requires independent approval and creates revocable read-only support access", async () => {
    const accessRequest = (await supportAccessService.request(
      supportPrincipal,
      tenantId,
      "Investigate a reported dashboard discrepancy",
    )) as { id: string };

    await expect(
      supportAccessService.decide(supportPrincipal, accessRequest.id, {
        approve: true,
        reason: "Self approval must fail",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ code: "PLATFORM_PERMISSION_DENIED" });

    await expect(
      supportAccessService.decide({ ...superPrincipal, userId: supportId }, accessRequest.id, {
        approve: true,
        reason: "Identity separation must fail",
        durationMinutes: 30,
      }),
    ).rejects.toMatchObject({ code: "SUPPORT_SELF_APPROVAL_FORBIDDEN" });

    await supportAccessService.decide(superPrincipal, accessRequest.id, {
      approve: true,
      reason: "Approved for limited read-only diagnosis",
      durationMinutes: 30,
    });
    const activated = await supportAccessService.activate(supportPrincipal, accessRequest.id);
    const supportTenantPrincipal = await supportAccessService.authenticate(activated.sessionToken);

    await expect(
      supportAccessService.activate(supportPrincipal, accessRequest.id),
    ).rejects.toMatchObject({ code: "SUPPORT_SESSION_ALREADY_ACTIVATED" });

    expect(supportTenantPrincipal).toMatchObject({
      tenantId,
      role: "AUDITOR",
      allBranches: true,
      isSupportSession: true,
    });
    expect(roleHasPermission("AUDITOR", "report.read")).toBe(true);
    expect(roleHasPermission("AUDITOR", "sale.create")).toBe(false);

    await supportAccessService.revoke(superPrincipal, accessRequest.id, "Diagnostic window closed");
    await expect(supportAccessService.authenticate(activated.sessionToken)).resolves.toBeNull();
  });

  it("updates branding and subscription with an immutable platform audit trail", async () => {
    const branding = (await platformAdminService.setBranding(superPrincipal, tenantId, {
      displayName: "M6 Live Pharmacy",
      primaryColor: "#123456",
      accentColor: "#ABCDEF",
      supportContact: "support@phms.test",
    })) as { primaryColor: string; accentColor: string };
    const plan = (await platformAdminService.setPlan(superPrincipal, tenantId, "growth", {
      maxUsers: 25,
    })) as { subscription: { planCode: string } };

    expect(branding.primaryColor).toBe("#123456");
    expect(branding.accentColor).toBe("#ABCDEF");
    expect(plan.subscription.planCode).toBe("growth");

    await expect(
      prisma.$transaction(async (transaction) => {
        await platformContext(transaction, superId);
        const audit = await transaction.platformAuditLog.findFirstOrThrow({
          where: { targetTenantId: tenantId },
          orderBy: { createdAt: "desc" },
        });
        await transaction.$executeRaw(
          Prisma.sql`UPDATE public.platform_audit_logs
            SET action = 'TAMPERED'
            WHERE id = ${audit.id}`,
        );
      }),
    ).rejects.toThrow(/permission denied|append-only/);
  });

  it("suspends a tenant and revokes its active tenant sessions", async () => {
    expect(ownerSessionToken).toBeDefined();
    await platformAdminService.setStatus(
      superPrincipal,
      tenantId,
      TenantStatus.SUSPENDED,
      "M6 automated suspension test",
    );
    await expect(authService.authenticate(ownerSessionToken)).resolves.toBeNull();

    await platformAdminService.setStatus(
      superPrincipal,
      tenantId,
      TenantStatus.TRIAL,
      "Restore stable M6 test fixture",
    );
  });
});
