import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getData, sendData } from "./api/client";
import { Application } from "./application";
import { ToastViewport } from "./components/toast";

vi.mock("./api/client", () => ({
  getData: vi.fn(),
  sendData: vi.fn(),
  removeSession: vi.fn(),
  downloadFile: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

const mockedGetData = vi.mocked(getData);
const mockedSendData = vi.mocked(sendData);

function renderApplication() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastViewport />
      <Application />
    </QueryClientProvider>,
  );
}

describe("PHMS application entry points", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetData.mockRejectedValue(new Error("No active session"));
  });

  it("renders the tenant sign-in when no pharmacy session exists", async () => {
    window.history.replaceState({}, "", "/login");
    renderApplication();
    expect(await screen.findByRole("heading", { name: "Log In" })).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
  });

  it("keeps platform authentication separate", async () => {
    window.history.replaceState({}, "", "/platform/login");
    renderApplication();
    expect(await screen.findByRole("heading", { name: "Platform Log In" })).toBeInTheDocument();
    expect(screen.getByLabelText("Platform Email")).toBeInTheDocument();
  });

  it("redirects a tenant login immediately and shows a success toast", async () => {
    window.history.replaceState({}, "", "/login");
    mockedGetData.mockImplementation(async (url: string) => {
      await Promise.resolve();
      if (url === "/auth/me") throw new Error("No active session");
      if (url === "/tenant/workspace") {
        return {
          tenant: {
            id: "10000000-0000-4000-8000-000000000001",
            name: "Route Pharmacy",
            slug: "route-pharmacy",
            status: "ACTIVE",
            planCode: "starter",
            timezone: "Africa/Nairobi",
            currencyCode: "KES",
          },
          branches: [
            {
              id: "10000000-0000-4000-8000-000000000002",
              name: "Main",
              code: "MAIN",
              timezone: "Africa/Nairobi",
              active: true,
            },
          ],
          branding: null,
          subscription: null,
        };
      }
      if (url.startsWith("/reports/dashboard")) return { cards: {} };
      return [];
    });
    mockedSendData.mockResolvedValue({
      sessionId: "10000000-0000-4000-8000-000000000003",
      tenantId: "10000000-0000-4000-8000-000000000001",
      tenantName: "Route Pharmacy",
      userId: "10000000-0000-4000-8000-000000000004",
      fullName: "Tenant Owner",
      membershipId: "10000000-0000-4000-8000-000000000005",
      username: "owner",
      role: "OWNER",
      allBranches: true,
      branchIds: [],
    });
    renderApplication();

    fireEvent.change(await screen.findByLabelText("Organization"), {
      target: { value: "route-pharmacy" },
    });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "owner" } });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "StrongPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Login successful")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Maalin wanaagsan, Route Pharmacy" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
  });

  it("redirects a platform login immediately and shows a success toast", async () => {
    window.history.replaceState({}, "", "/platform/login");
    mockedGetData.mockImplementation(async (url: string) => {
      await Promise.resolve();
      if (url === "/platform/auth/me") throw new Error("No active session");
      return [];
    });
    mockedSendData.mockResolvedValue({
      sessionId: "20000000-0000-4000-8000-000000000001",
      userId: "20000000-0000-4000-8000-000000000002",
      email: "admin@example.test",
      fullName: "Platform Owner",
      role: "SUPER_ADMIN",
    });
    renderApplication();

    fireEvent.change(await screen.findByLabelText("Platform Email"), {
      target: { value: "admin@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "StrongPassword123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in securely" }));

    expect(await screen.findByText("Login successful")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Platform overview" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/platform/dashboard"));
  });
});
