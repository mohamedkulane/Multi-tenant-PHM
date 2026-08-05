import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedPrincipal } from "../src/auth/auth.types.js";
import { TenantWorkspaceService } from "../src/tenant/tenant-workspace.service.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const branchId = "10000000-0000-4000-8000-000000000002";

const principal: AuthenticatedPrincipal = {
  sessionId: "10000000-0000-4000-8000-000000000003",
  tenantId,
  tenantName: "Test Pharmacy",
  userId: "10000000-0000-4000-8000-000000000004",
  fullName: "Owner",
  membershipId: "10000000-0000-4000-8000-000000000005",
  username: "owner",
  role: "OWNER",
  allBranches: true,
  branchIds: [],
};

interface MembershipCreateArgs {
  data: {
    branches: { create: Array<{ branchId: string }> };
    [key: string]: unknown;
  };
}

describe("tenant workspace nested branch assignments", () => {
  it("lets Prisma inherit tenantId when a branch-scoped member is created", async () => {
    const membershipCreate = vi.fn(({ data }: MembershipCreateArgs) =>
      Promise.resolve({
        ...data,
        branches: [{ branchId }],
      }),
    );
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      branch: { count: vi.fn().mockResolvedValue(1) },
      user: { create: vi.fn().mockResolvedValue({}) },
      tenantMembership: { create: membershipCreate },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const client = {
      $transaction: vi.fn((operation: (value: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
      ),
    } as unknown as PrismaClient;

    await new TenantWorkspaceService(client).createMember(principal, {
      fullName: "Xasan Ali",
      username: "xasan",
      password: "StrongPassword123!",
      role: "PHARMACIST",
      allBranches: false,
      branchIds: [branchId],
    });

    const args = membershipCreate.mock.calls[0]![0];
    expect(args.data.branches.create).toEqual([{ branchId }]);
    expect(args.data.branches.create[0]).not.toHaveProperty("tenantId");
  });
});
