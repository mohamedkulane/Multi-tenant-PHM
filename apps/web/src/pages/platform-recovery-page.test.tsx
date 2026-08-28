import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { sendData } from "../api/client";
import type * as ApiClient from "../api/client";
import { PlatformRecoveryPage } from "./platform-recovery-page";
vi.mock("../api/client", async (original) => ({
  ...(await original<typeof ApiClient>()),
  sendData: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});
function show(path: string, fragment = "") {
  window.history.replaceState(null, "", path + fragment);
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PlatformRecoveryPage pathname={path} />
    </QueryClientProvider>,
  );
}
it("requests verification without claiming an account exists", async () => {
  vi.mocked(sendData).mockResolvedValue({
    message: "If this is an active platform account, check your inbox.",
  });
  show("/platform/request-verification");
  fireEvent.change(screen.getByLabelText("Platform email"), {
    target: { value: "admin@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send email link" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "If this is an active platform account",
  );
  expect(sendData).toHaveBeenCalledWith("post", "/platform/auth/request-verification", {
    email: "admin@example.test",
  });
});
it("does not auto-consume verification links and removes tokens from the address bar", async () => {
  vi.mocked(sendData).mockResolvedValue({ message: "Email verified." });
  show("/platform/verify-email", "#token=one-time-test-token");
  expect(window.location.hash).toBe("");
  expect(sendData).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm email ownership" }));
  await waitFor(() =>
    expect(sendData).toHaveBeenCalledWith("post", "/platform/auth/verify-email", {
      token: "one-time-test-token",
    }),
  );
});
it("shows an actionable missing-link message", () => {
  show("/platform/reset-password");
  expect(screen.getByRole("alert")).toHaveTextContent("Open the full link from your email");
  expect(screen.queryByRole("button", { name: "Save new password" })).not.toBeInTheDocument();
});
it("submits password confirmation and the token without auto-login", async () => {
  vi.mocked(sendData).mockResolvedValue({
    message: "Password changed. Sign in with your new password.",
  });
  show("/platform/reset-password", "#token=reset-test-token");
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: "Long-test-passphrase-123" },
  });
  fireEvent.change(screen.getByLabelText("Confirm new password"), {
    target: { value: "Long-test-passphrase-123" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Password changed");
  expect(sendData).toHaveBeenCalledTimes(1);
  expect(sendData).toHaveBeenCalledWith("post", "/platform/auth/reset-password", {
    token: "reset-test-token",
    password: "Long-test-passphrase-123",
    confirmPassword: "Long-test-passphrase-123",
  });
});
