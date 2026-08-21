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
    overview: vi.fn().mockResolvedValue({ cards: {}, charts: {}, alerts: [], recentAudit: [] }),
    listPlatformUsers: vi.fn().mockResolvedValue([]),
    createPlatformUser: vi.fn().mockResolvedValue({}),
    updatePlatformUser: vi.fn().mockResolvedValue({}),
    revokePlatformSessions: vi.fn().mockResolvedValue({ revoked: 0 }),
    listTenantUsers: vi.fn().mockResolvedValue([]),
    setTenantUserActive: vi.fn().mockResolvedValue({}),
    listBroadcasts: vi.fn().mockResolvedValue([]),
    sendBroadcast: vi.fn().mockResolvedValue({}),
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
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({}),
    renewSubscription: vi.fn().mockResolvedValue({}),
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

  it("rejects support and auditor accounts at the platform password login boundary", async () => {
    const response = await request(createApp({ platformAuthentication: platformAuth("SUPPORT") }))
      .post("/api/v1/platform/auth/login")
      .send({ email: "support@example.test", password: "password1234" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_PLATFORM_CREDENTIALS");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("does not accept a tenant cookie as a platform session", async () => {
    const service = platformAuth();
    const authenticate = vi.fn<PlatformAuthService["authenticate"]>().mockResolvedValue(null);
    service.authenticate = authenticate;
    const response = await request(createApp({ platformAuthentication: service }))
      .get("/api/v1/platform/auth/me")
      .set("Cookie", "phms_session=tenant.secret");

    expect(response.status).toBe(401);
    expect(authenticate).toHaveBeenCalledWith(undefined);
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

  it("returns the platform overview to an authenticated Platform Admin", async () => {
    const admin = administration();
    const overview = vi.fn().mockResolvedValue({ cards: {} });
    admin.overview = overview;
    const response = await request(
      createApp({
        platformAuthentication: platformAuth("ADMIN"),
        platformAdministration: admin,
        supportAccess: support(),
      }),
    )
      .get("/api/v1/platform/overview")
      .set("Cookie", "phms_platform_session=test");

    expect(response.status).toBe(200);
    expect(overview).toHaveBeenCalledOnce();
  });

  it("allows only a Super Admin to create platform administrators", async () => {
    const body = {
      fullName: "Operations Administrator",
      email: "operations@example.test",
      password: "StrongPlatformPassword123!",
      role: "ADMIN",
    };
    const denied = await request(
      createApp({
        platformAuthentication: platformAuth("ADMIN"),
        platformAdministration: administration(),
        supportAccess: support(),
      }),
    )
      .post("/api/v1/platform/users")
      .set("Cookie", "phms_platform_session=test")
      .send(body);
    expect(denied.status).toBe(403);

    const admin = administration();
    const createPlatformUser = vi.fn().mockResolvedValue({});
    admin.createPlatformUser = createPlatformUser;
    const created = await request(
      createApp({
        platformAuthentication: platformAuth(),
        platformAdministration: admin,
        supportAccess: support(),
      }),
    )
      .post("/api/v1/platform/users")
      .set("Cookie", "phms_platform_session=test")
      .send(body);
    expect(created.status).toBe(201);
    expect(createPlatformUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: body.email, role: "ADMIN" }),
      expect.any(String),
    );
  });

  it("validates and sends a tenant-role notification through the Super Admin route", async () => {
    const admin = administration();
    const sendBroadcast = vi.fn().mockResolvedValue({});
    admin.sendBroadcast = sendBroadcast;
    const response = await request(
      createApp({
        platformAuthentication: platformAuth(),
        platformAdministration: admin,
        supportAccess: support(),
      }),
    )
      .post("/api/v1/platform/broadcasts")
      .set("Cookie", "phms_platform_session=test")
      .send({
        targetType: "ROLE",
        tenantId,
        role: "DOCTOR",
        title: "Scheduled maintenance",
        message: "The platform will be maintained tonight.",
      });

    expect(response.status).toBe(201);
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetType: "ROLE", tenantId, role: "DOCTOR" }),
      expect.any(String),
    );
  });

  it("requires an audit reason when changing a tenant user's access", async () => {
    const membershipId = "55555555-5555-4555-8555-555555555555";
    const admin = administration();
    const setTenantUserActive = vi.fn().mockResolvedValue({});
    admin.setTenantUserActive = setTenantUserActive;
    const invalid = await request(
      createApp({
        platformAuthentication: platformAuth(),
        platformAdministration: admin,
        supportAccess: support(),
      }),
    )
      .patch(`/api/v1/platform/tenants/${tenantId}/users/${membershipId}/status`)
      .set("Cookie", "phms_platform_session=test")
      .send({ active: false, reason: "x" });
    expect(invalid.status).toBe(400);

    const valid = await request(
      createApp({
        platformAuthentication: platformAuth(),
        platformAdministration: admin,
        supportAccess: support(),
      }),
    )
      .patch(`/api/v1/platform/tenants/${tenantId}/users/${membershipId}/status`)
      .set("Cookie", "phms_platform_session=test")
      .send({ active: false, reason: "Requested by tenant owner" });
    expect(valid.status).toBe(200);
    expect(setTenantUserActive).toHaveBeenCalledWith(
      expect.anything(),
      tenantId,
      membershipId,
      false,
      "Requested by tenant owner",
      expect.any(String),
    );
  });
});
