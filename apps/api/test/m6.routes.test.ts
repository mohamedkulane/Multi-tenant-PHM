import type { TenantStatus } from "@prisma/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type {
  BrandingInput,
  OnboardTenantInput,
  PlatformAdminService,
} from "../src/platform/platform-admin.service.js";
import type {
  PlatformAuthService,
  PlatformPrincipal,
} from "../src/platform/platform-auth.types.js";
import type { SupportAccessService } from "../src/platform/support-access.service.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const platformUserId = "33333333-3333-4333-8333-333333333333";

function principal(role: PlatformPrincipal["role"] = "SUPER_ADMIN"): PlatformPrincipal {
  return {
    sessionId: "44444444-4444-4444-8444-444444444444",
    userId: platformUserId,
    email: "admin@example.test",
    fullName: "Platform Admin",
    role,
  };
}

function platformAuth(role: PlatformPrincipal["role"] = "SUPER_ADMIN"): PlatformAuthService {
  return {
    login: vi.fn().mockResolvedValue({
      sessionToken: `platform.${platformUserId}.secret`,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      principal: principal(role),
    }),
    authenticate: vi.fn().mockResolvedValue(principal(role)),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

function administration(): PlatformAdminService {
  return {
    listPlans: vi.fn().mockResolvedValue([{ code: "starter" }]),
    upsertPlan: vi.fn().mockResolvedValue({ code: "starter" }),
    listTenants: vi.fn().mockResolvedValue([{ id: tenantId }]),
    getTenant: vi.fn().mockResolvedValue({ id: tenantId }),
    onboard: vi.fn((_principal: PlatformPrincipal, input: OnboardTenantInput): Promise<unknown> =>
      Promise.resolve({ tenant: { id: tenantId, name: input.name } }),
    ),
    setStatus: vi.fn(
      (_principal: PlatformPrincipal, _tenantId: string, status: TenantStatus): Promise<unknown> =>
        Promise.resolve({ id: tenantId, status }),
    ),
    setPlan: vi.fn().mockResolvedValue({ tenant: { id: tenantId } }),
    setBranding: vi.fn(
      (_principal: PlatformPrincipal, _tenantId: string, input: BrandingInput): Promise<unknown> =>
        Promise.resolve({ tenantId, ...input }),
    ),
    audit: vi.fn().mockResolvedValue([{ id: 1n, action: "TENANT_ONBOARDED" }]),
  };
}

function support(): SupportAccessService {
  return {
    list: vi.fn().mockResolvedValue([]),
    request: vi.fn().mockResolvedValue({ id: requestId, status: "PENDING" }),
    decide: vi.fn().mockResolvedValue({ id: requestId, status: "APPROVED" }),
    activate: vi.fn().mockResolvedValue({
      sessionToken: `support.${platformUserId}.${tenantId}.secret`,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    }),
    revoke: vi.fn().mockResolvedValue(undefined),
    authenticate: vi.fn().mockResolvedValue(null),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

describe("M6 platform API routes", () => {
  it("uses a separate hardened cookie for platform login", async () => {
    const response = await request(createApp({ platformAuthentication: platformAuth() }))
      .post("/api/v1/platform/auth/login")
      .send({ email: "admin@example.test", password: "password1234" });

    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]?.[0]).toContain("phms_platform_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Strict");
    expect(response.headers["set-cookie"]?.[0]).toContain("Path=/api/v1/platform");
  });

  it("onboards a tenant only through a super-admin platform route", async () => {
    const response = await request(
      createApp({
        platformAuthentication: platformAuth(),
        platformAdministration: administration(),
        supportAccess: support(),
      }),
    )
      .post("/api/v1/platform/tenants")
      .set("Cookie", "phms_platform_session=test")
      .send({
        name: "North Pharmacy",
        slug: "north-pharmacy",
        timezone: "Africa/Nairobi",
        currencyCode: "KES",
        planCode: "starter",
        branchName: "Main Branch",
        branchCode: "MAIN",
        ownerFullName: "Tenant Owner",
        ownerEmail: "owner@example.test",
        ownerUsername: "owner",
        ownerPassword: "StrongPassword123!",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.tenant.id).toBe(tenantId);
  });

  it("blocks a support employee from super-admin tenant changes", async () => {
    const response = await request(
      createApp({
        platformAuthentication: platformAuth("SUPPORT"),
        platformAdministration: administration(),
        supportAccess: support(),
      }),
    )
      .patch(`/api/v1/platform/tenants/${tenantId}/status`)
      .set("Cookie", "phms_platform_session=test")
      .send({ status: "SUSPENDED", reason: "Security review" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PLATFORM_PERMISSION_DENIED");
  });

  it("activates approved support access with the tenant cookie namespace", async () => {
    const response = await request(
      createApp({
        platformAuthentication: platformAuth("SUPPORT"),
        platformAdministration: administration(),
        supportAccess: support(),
      }),
    )
      .post(`/api/v1/platform/support-requests/${requestId}/activate`)
      .set("Cookie", "phms_platform_session=test");

    expect(response.status).toBe(200);
    expect(response.body.data.readOnly).toBe(true);
    expect(response.headers["set-cookie"]?.[0]).toContain("phms_session=support.");
    expect(response.headers["set-cookie"]?.[0]).toContain("Path=/api/v1");
  });

  it("returns a plan-limit conflict without leaking a database error", async () => {
    const admin = administration();
    admin.onboard = vi
      .fn()
      .mockRejectedValue(new Error("Raw query failed: PLAN_LIMIT_EXCEEDED:maxBranches"));
    const response = await request(
      createApp({
        platformAuthentication: platformAuth(),
        platformAdministration: admin,
        supportAccess: support(),
      }),
    )
      .post("/api/v1/platform/tenants")
      .set("Cookie", "phms_platform_session=test")
      .send({
        name: "North Pharmacy",
        slug: "north-pharmacy",
        timezone: "Africa/Nairobi",
        currencyCode: "KES",
        planCode: "starter",
        branchName: "Main Branch",
        branchCode: "MAIN",
        ownerFullName: "Tenant Owner",
        ownerEmail: "owner@example.test",
        ownerUsername: "owner",
        ownerPassword: "StrongPassword123!",
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: "PLAN_LIMIT_EXCEEDED",
      message: "The tenant plan limit has been reached",
      details: { limit: "maxBranches" },
    });
  });
  it("serializes platform audit identifiers safely", async () => {
    const response = await request(
      createApp({
        platformAuthentication: platformAuth(),
        platformAdministration: administration(),
        supportAccess: support(),
      }),
    )
      .get("/api/v1/platform/audit")
      .set("Cookie", "phms_platform_session=test");

    expect(response.status).toBe(200);
    expect(response.body.data[0].id).toBe("1");
  });
});
