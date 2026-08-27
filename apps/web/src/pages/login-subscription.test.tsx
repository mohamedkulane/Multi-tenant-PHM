import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AxiosError } from "axios";
import { afterEach, expect, it, vi } from "vitest";
import { sendData } from "../api/client";
import type * as ApiClient from "../api/client";
import { TenantLoginPage } from "./login-pages";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof ApiClient>()),
  sendData: vi.fn(),
}));
afterEach(cleanup);

it.each([
  ["owner", "Subscription-ka system-ka wuu dhacay. Bixi 50 USD lambarka DEMO-061-000-0000."],
  [
    "receptionist",
    "System-ka organization-ka waa xiran yahay. Fadlan la xiriir Admin/Owner-ka organization-ka.",
  ],
])(
  "shows the server's subscription notice to %s without completing login",
  async (username, message) => {
    const failure = new AxiosError(message);
    failure.response = {
      status: 402,
      statusText: "Payment Required",
      headers: {},
      config: { headers: {} } as never,
      data: { error: { code: "TENANT_SUBSCRIPTION_EXPIRED", message } },
    };
    vi.mocked(sendData).mockRejectedValue(failure);
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <TenantLoginPage />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByPlaceholderText("your-organization"), {
      target: { value: "demo" },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your username"), {
      target: { value: username },
    });
    fireEvent.change(screen.getByPlaceholderText("Enter your password"), {
      target: { value: "synthetic-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(client.getQueryData(["tenant-principal"])).toBeUndefined();
    if (username !== "owner") expect(screen.queryByText(/DEMO-061|50 USD/)).not.toBeInTheDocument();
  },
);
