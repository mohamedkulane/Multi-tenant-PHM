import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthService, AuthenticatedPrincipal } from "../src/auth/auth.types.js";
import { TenantWorkspaceService } from "../src/tenant/tenant-workspace.service.js";

const principal: AuthenticatedPrincipal = {
  sessionId: "10000000-0000-4000-8000-000000000001",
  tenantId: "10000000-0000-4000-8000-000000000002",
  tenantName: "Route Pharmacy",
  userId: "10000000-0000-4000-8000-000000000003",
  fullName: "Tenant Owner",
  membershipId: "10000000-0000-4000-8000-000000000004",
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

function service() {
  const workspace = new TenantWorkspaceService();
  vi.spyOn(workspace, "workspace").mockResolvedValue({
    tenant: {
      id: principal.tenantId,
      name: principal.tenantName,
      slug: "route-pharmacy",
      status: "ACTIVE",
      planCode: "starter",
      timezone: "Africa/Nairobi",
      currencyCode: "KES",
    },
    branches: [
      {
        id: "10000000-0000-4000-8000-000000000005",
        tenantId: principal.tenantId,
        name: "Main",
        code: "MAIN",
        timezone: "Africa/Nairobi",
        active: true,
        phone: null,
        address: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    branding: null,
    subscription: null,
  });
  vi.spyOn(workspace, "invite").mockResolvedValue({
    invitation: {
      id: "10000000-0000-4000-8000-000000000006",
      tenantId: principal.tenantId,
      email: "cashier@example.test",
      username: "cashier",
      role: "RECEPTIONIST",
      allBranches: true,
      tokenHash: "a".repeat(64),
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      acceptedAt: null,
      revokedAt: null,
      invitedByMembershipId: principal.membershipId,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      branches: [],
    },
    acceptanceToken: `${principal.tenantId}.test-token`,
  });
  vi.spyOn(workspace, "updateBranch").mockResolvedValue({
    id: "10000000-0000-4000-8000-000000000005",
    name: "Central",
    code: "CENTRAL",
    active: true,
  } as never);
  vi.spyOn(workspace, "updateMember").mockResolvedValue({
    id: "10000000-0000-4000-8000-000000000007",
    role: "DOCTOR",
    allBranches: false,
  } as never);
  vi.spyOn(workspace, "updateTenantSettings").mockResolvedValue({
    tenant: { id: principal.tenantId, name: "Route Health" },
    branding: { tenantId: principal.tenantId, displayName: "Route Health" },
  } as never);
  vi.spyOn(workspace, "accept").mockResolvedValue({
    tenantId: principal.tenantId,
    username: "cashier",
    membershipId: "10000000-0000-4000-8000-000000000007",
  });
  return workspace;
}

describe("tenant workspace routes", () => {
  it("returns branch and tenant context for the frontend", async () => {
    const response = await request(createApp({ authentication, tenantWorkspace: service() }))
      .get("/api/v1/tenant/workspace")
      .set("Cookie", "phms_session=test");

    expect(response.status).toBe(200);
    expect(response.body.data.tenant.slug).toBe("route-pharmacy");
    expect(response.body.data.branches[0].code).toBe("MAIN");
  });

  it("creates a branch-scoped one-time invitation", async () => {
    const response = await request(createApp({ authentication, tenantWorkspace: service() }))
      .post("/api/v1/tenant/invitations")
      .set("Cookie", "phms_session=test")
      .send({
        email: "cashier@example.test",
        username: "cashier",
        role: "RECEPTIONIST",
        allBranches: false,
        branchIds: ["10000000-0000-4000-8000-000000000005"],
      });

    expect(response.status).toBe(201);
    expect(response.body.data.acceptanceToken).toContain(principal.tenantId);
  });

  it("accepts an invitation before authentication middleware", async () => {
    const response = await request(createApp({ authentication, tenantWorkspace: service() }))
      .post("/api/v1/tenant/invitations/accept")
      .send({
        token: `${principal.tenantId}.${"a".repeat(43)}`,
        fullName: "New Cashier",
        password: "StrongPassword123!",
      });

    expect(response.status).toBe(201);
    expect(response.body.data.username).toBe("cashier");
  });

  it("updates a branch through a tenant-scoped route", async () => {
    const response = await request(createApp({ authentication, tenantWorkspace: service() }))
      .patch("/api/v1/tenant/branches/10000000-0000-4000-8000-000000000005")
      .set("Cookie", "phms_session=test")
      .send({ name: "Central", code: "central", active: true });

    expect(response.status).toBe(200);
    expect(response.body.data.code).toBe("CENTRAL");
  });

  it("updates member role and branch access", async () => {
    const response = await request(createApp({ authentication, tenantWorkspace: service() }))
      .patch("/api/v1/tenant/members/10000000-0000-4000-8000-000000000007")
      .set("Cookie", "phms_session=test")
      .send({
        role: "DOCTOR",
        allBranches: false,
        branchIds: ["10000000-0000-4000-8000-000000000005"],
      });

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe("DOCTOR");
  });

  it("updates owner-controlled tenant and branding settings", async () => {
    const response = await request(createApp({ authentication, tenantWorkspace: service() }))
      .put("/api/v1/tenant/settings")
      .set("Cookie", "phms_session=test")
      .send({
        name: "Route Health",
        timezone: "Africa/Nairobi",
        currencyCode: "KES",
        displayName: "Route Health",
        primaryColor: "#174C3F",
        accentColor: "#B8F39A",
      });

    expect(response.status).toBe(200);
    expect(response.body.data.tenant.name).toBe("Route Health");
  });
});
