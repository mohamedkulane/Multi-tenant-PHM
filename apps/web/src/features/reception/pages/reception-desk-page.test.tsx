import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getData } from "../../../api/client";
import { ReceptionDeskPage } from "./reception-desk-page";
import { ClinicalPrintPage } from "../../../pages/clinical-print-page";
import type { Branch, TenantPrincipal, Workspace } from "../../../types";
vi.mock("../../../api/client", () => ({
  getData: vi.fn(),
  sendData: vi.fn(),
  errorMessage: () => "Error",
}));
afterEach(cleanup);
const branch: Branch = {
  id: "branch",
  name: "Main",
  code: "MAIN",
  timezone: "Africa/Nairobi",
  active: true,
};
const workspace: Workspace = {
  tenant: {
    id: "tenant",
    name: "Test Clinic",
    slug: "test",
    status: "ACTIVE",
    planCode: "starter",
    currencyCode: "USD",
    timezone: "Africa/Nairobi",
  },
  branches: [branch],
  branding: null,
  subscription: null,
};
const visit = {
  id: "visit",
  visitNumber: "VIS/V001",
  status: "LAB_RESULTS_READY",
  consultationPaymentStatus: "PAID",
  createdAt: "2026-01-01",
  patient: { name: "Example Patient", patientNumber: "PT/P001", age: 23, sex: "FEMALE" },
  labVisits: [
    {
      id: "lab",
      visitNumber: "LAB/L001",
      total: "10",
      amountPaid: "10",
      tests: [{ id: "test", testName: "CBC", sampleType: "Blood", resultValue: "DO NOT SHOW" }],
    },
  ],
};
function renderWithQueries(ui: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );
}
it("opens old visits and reprints paid receipts without showing lab results", async () => {
  window.history.replaceState({}, "", "/reception/visits");
  vi.mocked(getData).mockImplementation((url) =>
    Promise.resolve(url.startsWith("/clinic/visits") ? [visit] : []),
  );
  renderWithQueries(<ReceptionDeskPage branch={branch} workspace={workspace} />);
  await screen.findByText("Example Patient");
  expect(screen.getByText("LAB PAYMENT CLEARED")).toBeInTheDocument();
  expect(screen.queryByText("LAB RESULTS READY")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Lab authorization" })).toHaveAttribute(
    "href",
    "/clinic/visits/visit/print/lab-receipt",
  );
  fireEvent.click(screen.getByRole("button", { name: "View" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByText("CBC")).toBeInTheDocument();
  expect(screen.queryByText("DO NOT SHOW")).not.toBeInTheDocument();
});
it("prints each paid order and never prints its financial amounts or results", async () => {
  vi.mocked(getData).mockResolvedValue({
    ...visit,
    labVisits: [
      ...visit.labVisits,
      { ...visit.labVisits[0], id: "lab2", visitNumber: "LAB/L002", total: "500", amountPaid: "0" },
    ],
  });
  const principal = { role: "RECEPTIONIST" } as TenantPrincipal;
  renderWithQueries(
    <ClinicalPrintPage
      visitId="visit"
      kind="lab-receipt"
      workspace={workspace}
      principal={principal}
    />,
  );
  await screen.findByText("LAB/L001");
  expect(screen.queryByText("LAB/L002")).not.toBeInTheDocument();
  expect(screen.getByText("CBC")).toBeInTheDocument();
  expect(screen.queryByText("DO NOT SHOW")).not.toBeInTheDocument();
  expect(screen.queryByText("$10.00")).not.toBeInTheDocument();
});
