import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getData, sendData } from "../api/client";
import type * as ApiClient from "../api/client";
import { SubscriptionCollections } from "./subscription-collections";
import { PlatformSettingsPage } from "./platform-control-pages";

vi.mock("../api/client", async (original) => ({
  ...(await original<typeof ApiClient>()),
  getData: vi.fn(),
  sendData: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderPage(page: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {page}
    </QueryClientProvider>,
  );
}

const year = new Date().getUTCFullYear();
const group = (currencyCode: string, total: string) => ({
  currencyCode,
  total,
  paymentCount: 2,
  months: Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, "0")}`,
    amount: index === 7 ? total : "0",
    paymentCount: index === 7 ? 2 : 0,
  })),
});

it("shows every month and separates currency totals", async () => {
  vi.mocked(getData).mockResolvedValue({
    year,
    invalidPaymentCount: 0,
    currencies: [group("USD", "75.50"), group("UNSPECIFIED", "40")],
  });
  renderPage(<SubscriptionCollections />);
  expect(await screen.findByText(`August ${year}`)).toBeInTheDocument();
  expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(13);
  expect(screen.getAllByText("75.50 USD")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("Payment currency"), { target: { value: "UNSPECIFIED" } });
  expect(screen.queryByText("75.50 USD")).not.toBeInTheDocument();
  expect(screen.getAllByText("40.00")).toHaveLength(2);
  expect(screen.getByText(/Older payments without a recorded currency/)).toBeInTheDocument();
});

it("changes reporting year and shows an honest empty state", async () => {
  vi.mocked(getData).mockResolvedValue({ year, invalidPaymentCount: 0, currencies: [] });
  renderPage(<SubscriptionCollections />);
  expect(await screen.findByText("No payments recorded for this year")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reporting year"), { target: { value: "2024" } });
  fireEvent.click(screen.getByRole("button", { name: "Show year" }));
  await waitFor(() =>
    expect(getData).toHaveBeenCalledWith("/platform/subscription-collections?year=2024"),
  );
  expect(await screen.findByText("December 2024")).toBeInTheDocument();
});

it("shows a failed query rather than a misleading zero collection", async () => {
  vi.mocked(getData).mockRejectedValue(new Error("Unavailable"));
  renderPage(<SubscriptionCollections />);
  expect(await screen.findByText("Unable to load this page")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("removes the global fee field and submits only payment contact settings", async () => {
  vi.mocked(getData).mockResolvedValue({
    platform_profile: { displayName: "PHMS", primaryColor: "#123456", accentColor: "#654321" },
    billing: {
      monthlyFee: "999",
      currencyCode: "USD",
      paymentNumber: "TEST-PAYMENT",
      instructions: "Contact support",
    },
  });
  vi.mocked(sendData).mockResolvedValue({});
  renderPage(
    <PlatformSettingsPage
      principal={{
        userId: "platform-user",
        sessionId: "session",
        role: "SUPER_ADMIN",
        fullName: "Admin",
        email: "admin@example.test",
      }}
    />,
  );
  expect(await screen.findByLabelText("Payment number (Lambarka lacagta)")).toHaveValue(
    "TEST-PAYMENT",
  );
  expect(screen.queryByLabelText("Monthly fee (Qiimaha bishii)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save platform settings" }));
  await waitFor(() => expect(sendData).toHaveBeenCalled());
  expect(vi.mocked(sendData).mock.calls[0]?.[2]).not.toHaveProperty("monthlyFee");
});
