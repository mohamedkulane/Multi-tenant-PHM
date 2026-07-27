import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getData } from "./api/client";
import { Application } from "./application";

vi.mock("./api/client", () => ({
  getData: vi.fn(),
  sendData: vi.fn(),
  removeSession: vi.fn(),
  downloadFile: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

const mockedGetData = vi.mocked(getData);

function renderApplication() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Application />
    </QueryClientProvider>,
  );
}

describe("PHMS application entry points", () => {
  beforeEach(() => {
    mockedGetData.mockRejectedValue(new Error("No active session"));
  });

  it("renders the tenant sign-in when no pharmacy session exists", async () => {
    window.history.replaceState({}, "", "/login");
    renderApplication();
    expect(await screen.findByRole("heading", { name: "Pharmacy workspace" })).toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toBeInTheDocument();
  });

  it("keeps platform authentication separate", async () => {
    window.history.replaceState({}, "", "/platform/login");
    renderApplication();
    expect(await screen.findByRole("heading", { name: "Platform control" })).toBeInTheDocument();
    expect(screen.getByLabelText("Platform email")).toBeInTheDocument();
  });
});
