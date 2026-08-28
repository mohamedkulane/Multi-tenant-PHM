import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaAuthService } from "../src/auth/auth.service.js";
import { PrismaPlatformAdminService } from "../src/platform/platform-admin.service.js";
import type { PlatformPrincipal } from "../src/platform/platform-auth.types.js";

const mocks = vi.hoisted(() => ({
  db: { tenantLoginDirectory: { findUnique: vi.fn() }, $transaction: vi.fn() },
  verifyPassword: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    tenantMembership: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    tenantSubscription: { findUnique: vi.fn(), update: vi.fn() },
    platformSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    platformAuditLog: { create: vi.fn(), findMany: vi.fn() },
    session: { create: vi.fn() },
  },
}));
vi.mock("../src/database/prisma.js", () => ({ prisma: mocks.db }));
vi.mock("../src/auth/password.js", () => ({
  verifyPassword: mocks.verifyPassword,
  hashPassword: vi.fn(),
}));

const principal: PlatformPrincipal = {
  userId: "platform-user",
  sessionId: "session",
  email: "admin@example.test",
  fullName: "Admin",
  role: "SUPER_ADMIN",
};
const login = { tenantSlug: "clinic-a", username: "owner", password: "test-password" };
const membership = {
  id: "member",
  userId: "user",
  tenantId: "tenant-a",
  status: "ACTIVE",
  role: "OWNER",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.db.$transaction.mockImplementation((operation: (tx: typeof mocks.tx) => Promise<unknown>) =>
    operation(mocks.tx),
  );
  mocks.db.tenantLoginDirectory.findUnique.mockResolvedValue({
    tenantId: "tenant-a",
    status: "ACTIVE",
  });
  mocks.tx.tenantMembership.findUnique.mockResolvedValue(membership);
  mocks.tx.user.findUnique.mockResolvedValue({
    id: "user",
    status: "ACTIVE",
    passwordHash: "hash",
  });
  mocks.tx.tenant.findUnique.mockResolvedValue({ id: "tenant-a", name: "Clinic A" });
  mocks.tx.tenantSubscription.findUnique.mockResolvedValue({
    endsAt: new Date("2001-01-01"),
    monthlyFee: new Prisma.Decimal("35.50"),
  });
  mocks.tx.platformSetting.findUnique.mockResolvedValue({
    value: {
      monthlyFee: "999",
      currencyCode: "USD",
      paymentNumber: "TEST-NUMBER",
      instructions: "Contact support",
    },
  });
  mocks.verifyPassword.mockResolvedValue(true);
});

describe("tenant-specific expiry billing", () => {
  it.each(["OWNER", "ADMIN"])("shows the agreed fee, not the global fee, to %s", async (role) => {
    mocks.tx.tenantMembership.findUnique.mockResolvedValue({ ...membership, role });
    await expect(new PrismaAuthService().login(login)).rejects.toMatchObject({
      code: "TENANT_SUBSCRIPTION_EXPIRED",
      message:
        "Subscription-ka system-ka wuu dhacay. Bixi 35.5 USD lambarka TEST-NUMBER. Contact support",
    });
    expect(mocks.tx.tenantSubscription.findUnique).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a" },
      select: { endsAt: true, monthlyFee: true },
    });
    expect(mocks.tx.session.create).not.toHaveBeenCalled();
  });
  it("uses another tenant's own fee and keeps a zero agreed fee", async () => {
    mocks.db.tenantLoginDirectory.findUnique.mockResolvedValue({
      tenantId: "tenant-b",
      status: "ACTIVE",
    });
    mocks.tx.tenantSubscription.findUnique.mockResolvedValue({
      endsAt: new Date("2001-01-01"),
      monthlyFee: new Prisma.Decimal(0),
    });
    await expect(
      new PrismaAuthService().login({ ...login, tenantSlug: "clinic-b" }),
    ).rejects.toMatchObject({ message: expect.stringContaining("Bixi 0 USD") });
    expect(mocks.tx.tenantSubscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-b" } }),
    );
  });
  it.each(["DOCTOR", "RECEPTIONIST", "LAB_TECHNICIAN", "PHARMACIST"])(
    "never reveals billing to %s",
    async (role) => {
      mocks.tx.tenantMembership.findUnique.mockResolvedValue({ ...membership, role });
      await expect(new PrismaAuthService().login(login)).rejects.toMatchObject({
        message:
          "System-ka organization-ka waa xiran yahay. Fadlan la xiriir Admin/Owner-ka organization-ka.",
      });
    },
  );
  it("does not disclose subscription information before verifying the password", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    await expect(new PrismaAuthService().login(login)).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(mocks.tx.tenantSubscription.findUnique).not.toHaveBeenCalled();
  });
});

describe("platform subscription reporting", () => {
  it("saves payment instructions without a global monthly fee", async () => {
    const result = await new PrismaPlatformAdminService().updateSettings(principal, {
      displayName: "PHMS",
      primaryColor: "#123456",
      accentColor: "#654321",
      paymentNumber: "TEST-NUMBER",
      currencyCode: "USD",
      billingInstructions: "Contact support",
    });
    expect(result.billing).not.toHaveProperty("monthlyFee");
    expect(mocks.tx.platformSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "billing" }, update: { value: result.billing } }),
    );
  });
  it("snapshots the collection currency when recording a renewal", async () => {
    await new PrismaPlatformAdminService().renewSubscription(
      principal,
      "tenant-a",
      1,
      "35.50",
      "REF-1",
      undefined,
    );
    expect(mocks.tx.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "TENANT_SUBSCRIPTION_RENEWED",
          after: expect.objectContaining({ paymentAmount: "35.50", currencyCode: "USD" }),
        }),
      }),
    );
  });
  it("reads all renewal payments within the selected year, not only the last payment", async () => {
    mocks.tx.platformAuditLog.findMany.mockResolvedValue([]);
    await new PrismaPlatformAdminService().subscriptionCollections(principal, 2026);
    expect(mocks.tx.platformAuditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: "TENANT_SUBSCRIPTION_RENEWED",
        entityType: "tenant_subscription",
        createdAt: { gte: new Date("2026-01-01T00:00:00Z"), lt: new Date("2027-01-01T00:00:00Z") },
      },
      select: { createdAt: true, after: true },
    });
  });
  it("blocks reporting for non-super-admin principals", async () => {
    await expect(
      new PrismaPlatformAdminService().subscriptionCollections(
        { ...principal, role: "ADMIN" },
        2026,
      ),
    ).rejects.toMatchObject({ code: "PLATFORM_PERMISSION_DENIED" });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
});
