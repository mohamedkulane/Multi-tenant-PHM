import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeSession } from "../api/client";
import { PlatformShell, TenantShell } from "./shell";

vi.mock("../api/client", () => ({
  getData: vi.fn(),
  removeSession: vi.fn(),
}));

const mockedRemoveSession = vi.mocked(removeSession);

describe("authenticated shells", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedRemoveSession.mockResolvedValue(undefined);
  });

  it("clears the tenant session cache and navigates immediately on sign out", async () => {
    window.history.replaceState({}, "", "/sales");
    window.localStorage.setItem("phms.branch", "branch-1");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["tenant-principal"], { role: "CASHIER" });
    client.setQueryData(["tenant-workspace"], { tenant: { id: "tenant-1" } });

    render(
      <QueryClientProvider client={client}>
        <TenantShell
          principal={{
            sessionId: "session-1",
            tenantId: "tenant-1",
            tenantName: "Test Pharmacy",
            userId: "user-1",
            fullName: "Cashier User",
            membershipId: "membership-1",
            username: "cashier",
            role: "CASHIER",
            allBranches: true,
            branchIds: [],
          }}
          workspace={{
            tenant: {
              id: "tenant-1",
              name: "Test Pharmacy",
              slug: "test-pharmacy",
              status: "ACTIVE",
              planCode: "starter",
              timezone: "Africa/Nairobi",
              currencyCode: "USD",
            },
            branches: [],
            branding: null,
            subscription: null,
          }}
          onBranchChange={vi.fn()}
          currentPath="/sales"
        >
          <p>Cashier workspace</p>
        </TenantShell>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(window.location.pathname).toBe("/login"));
    expect(mockedRemoveSession).toHaveBeenCalledWith("/auth/logout");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(window.localStorage.getItem("phms.branch")).toBeNull();
  });

  it("clears the platform session cache and navigates immediately on sign out", async () => {
    window.history.replaceState({}, "", "/platform/dashboard");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["platform-principal"], { role: "SUPER_ADMIN" });

    render(
      <QueryClientProvider client={client}>
        <PlatformShell
          principal={{
            sessionId: "session-1",
            userId: "user-1",
            email: "admin@example.test",
            fullName: "Platform Admin",
            role: "SUPER_ADMIN",
          }}
          currentPath="/platform/dashboard"
        >
          <p>Platform workspace</p>
        </PlatformShell>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(window.location.pathname).toBe("/platform/login"));
    expect(mockedRemoveSession).toHaveBeenCalledWith("/platform/auth/logout");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
