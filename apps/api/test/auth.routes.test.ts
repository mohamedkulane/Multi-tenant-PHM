import type { TenantRole } from "@prisma/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { AuthenticatedPrincipal, AuthService } from "../src/auth/auth.types.js";

const principal: AuthenticatedPrincipal = {
  sessionId: "22222222-2222-4222-8222-222222222222",
  tenantId: "11111111-1111-4111-8111-111111111111",
  tenantName: "Acme Pharmacy",
  userId: "33333333-3333-4333-8333-333333333333",
  fullName: "Tenant Owner",
  membershipId: "44444444-4444-4444-8444-444444444444",
  username: "owner",
  role: "OWNER" satisfies TenantRole,
  allBranches: true,
  branchIds: [],
};

function fakeAuth(overrides: Partial<AuthService> = {}): AuthService {
  return {
    login: vi.fn().mockResolvedValue({
      sessionToken: `${principal.tenantId}.${"a".repeat(43)}`,
      expiresAt: new Date(Date.now() + 60_000),
      principal,
    }),
    authenticate: vi.fn().mockResolvedValue(principal),
    logout: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(principal),
    changePassword: vi.fn().mockResolvedValue({ changed: true }),
    ...overrides,
  };
}

describe("authentication routes", () => {
  it("logs in with tenant slug and sets an HttpOnly session cookie", async () => {
    const login = vi.fn<AuthService["login"]>().mockResolvedValue({
      sessionToken: `${principal.tenantId}.${"a".repeat(43)}`,
      expiresAt: new Date(Date.now() + 60_000),
      principal,
    });
    const app = createApp({ authentication: fakeAuth({ login }) });
    const response = await request(app).post("/api/v1/auth/login").send({
      tenantSlug: "acme-pharmacy",
      username: "owner",
      password: "correct horse battery staple",
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      tenantId: principal.tenantId,
      role: "OWNER",
    });
    expect(response.headers["set-cookie"]?.[0]).toContain("phms_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
    expect(login).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantSlug: "acme-pharmacy",
        username: "owner",
      }),
    );
  });

  it("returns the authenticated principal from /me", async () => {
    const app = createApp({ authentication: fakeAuth() });
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", `phms_session=${principal.tenantId}.${"a".repeat(43)}`);

    expect(response.status).toBe(200);
    expect(response.body.data.membershipId).toBe(principal.membershipId);
  });

  it("rejects /me when the session is not valid", async () => {
    const app = createApp({
      authentication: fakeAuth({
        authenticate: vi.fn().mockResolvedValue(null),
      }),
    });
    const response = await request(app).get("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("does not accept a platform cookie as a tenant session", async () => {
    const authenticate = vi.fn<AuthService["authenticate"]>().mockResolvedValue(null);
    const app = createApp({ authentication: fakeAuth({ authenticate }) });
    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", "phms_platform_session=platform.user.secret");

    expect(response.status).toBe(401);
    expect(authenticate).toHaveBeenCalledWith(undefined);
  });

  it("updates the signed-in staff profile", async () => {
    const updateProfile = vi.fn<AuthService["updateProfile"]>().mockResolvedValue({
      ...principal,
      fullName: "Dr. Amina Hassan",
      email: "amina@example.test",
    });
    const app = createApp({ authentication: fakeAuth({ updateProfile }) });
    const response = await request(app)
      .put("/api/v1/auth/profile")
      .set("Cookie", `phms_session=${principal.tenantId}.${"a".repeat(43)}`)
      .send({ fullName: "Dr. Amina Hassan", email: "amina@example.test" });

    expect(response.status).toBe(200);
    expect(response.body.data.fullName).toBe("Dr. Amina Hassan");
    expect(updateProfile).toHaveBeenCalledWith(
      principal,
      expect.objectContaining({ email: "amina@example.test" }),
    );
  });

  it("validates and changes the signed-in staff password", async () => {
    const changePassword = vi.fn<AuthService["changePassword"]>().mockResolvedValue({
      changed: true,
    });
    const app = createApp({ authentication: fakeAuth({ changePassword }) });
    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Cookie", `phms_session=${principal.tenantId}.${"a".repeat(43)}`)
      .send({
        currentPassword: "CurrentPassword123!",
        newPassword: "NewSecurePassword123!",
        confirmPassword: "NewSecurePassword123!",
      });

    expect(response.status).toBe(200);
    expect(changePassword).toHaveBeenCalledWith(principal, {
      currentPassword: "CurrentPassword123!",
      newPassword: "NewSecurePassword123!",
    });
  });

  it("rejects mismatched password confirmation", async () => {
    const changePassword = vi.fn<AuthService["changePassword"]>();
    const app = createApp({ authentication: fakeAuth({ changePassword }) });
    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Cookie", `phms_session=${principal.tenantId}.${"a".repeat(43)}`)
      .send({
        currentPassword: "CurrentPassword123!",
        newPassword: "NewSecurePassword123!",
        confirmPassword: "DifferentPassword123!",
      });

    expect(response.status).toBe(400);
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("revokes the server session and clears the cookie on logout", async () => {
    const logout = vi.fn<AuthService["logout"]>().mockResolvedValue(undefined);
    const app = createApp({ authentication: fakeAuth({ logout }) });
    const raw = `${principal.tenantId}.${"a".repeat(43)}`;
    const response = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", `phms_session=${raw}`);

    expect(response.status).toBe(204);
    expect(logout).toHaveBeenCalledWith(raw);
    expect(response.headers["set-cookie"]?.[0]).toContain("phms_session=;");
  });
});
