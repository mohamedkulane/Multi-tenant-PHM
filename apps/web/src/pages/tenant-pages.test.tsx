import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getData, sendData } from "../api/client";
import type { Branch, TenantPrincipal, Workspace } from "../types";
import { ProductsPage, SalesPage } from "./tenant-pages";

vi.mock("../api/client", () => ({
  getData: vi.fn(),
  sendData: vi.fn(),
  downloadFile: vi.fn(),
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong",
}));

const mockedGetData = vi.mocked(getData);
const mockedSendData = vi.mocked(sendData);

const principal: TenantPrincipal = {
  sessionId: "session",
  tenantId: "10000000-0000-4000-8000-000000000001",
  tenantName: "Test Pharmacy",
  userId: "10000000-0000-4000-8000-000000000002",
  fullName: "Owner",
  membershipId: "10000000-0000-4000-8000-000000000003",
  username: "owner",
  role: "OWNER",
  allBranches: true,
  branchIds: [],
};

const branch: Branch = {
  id: "10000000-0000-4000-8000-000000000004",
  name: "Main Branch",
  code: "MAIN",
  timezone: "Africa/Nairobi",
  active: true,
};

const workspace: Workspace = {
  tenant: {
    id: principal.tenantId,
    name: "Test Pharmacy",
    slug: "test-pharmacy",
    status: "ACTIVE",
    planCode: "starter",
    timezone: "Africa/Nairobi",
    currencyCode: "USD",
  },
  branches: [branch],
  branding: null,
  subscription: null,
};

function renderPage(page: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
}

describe("tenant product and sales workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSendData.mockResolvedValue({});
  });

  afterEach(cleanup);

  it("keeps invoice records separate from the pharmacy checkout", async () => {
    mockedGetData.mockResolvedValue([]);
    const view = renderPage(
      <SalesPage branch={branch} workspace={workspace} principal={principal} mode="invoices" />,
    );
    expect(screen.getByRole("heading", { name: "Invoices" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Select products" })).not.toBeInTheDocument();
    await screen.findByPlaceholderText("Search invoice, customer, or phone");
    view.unmount();
    renderPage(
      <SalesPage branch={branch} workspace={workspace} principal={principal} mode="sales" />,
    );
    expect(screen.getByRole("heading", { name: "Pharmacy sales" })).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search invoice, customer, or phone"),
    ).not.toBeInTheDocument();
  });

  it("shows category-specific package price inputs when creating a product", () => {
    mockedGetData.mockResolvedValue([]);
    renderPage(<ProductsPage principal={principal} branch={branch} />);

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    fireEvent.change(screen.getByLabelText(/Category/), {
      target: { value: "syrups_liquids" },
    });

    expect(screen.getByLabelText(/Bottles per carton/)).toBeInTheDocument();
    expect(screen.getByLabelText("Carton price")).toBeInTheDocument();
    expect(screen.getByLabelText("Bottle price")).toBeInTheDocument();
  });

  it("creates a product and posts its opening stock to the active branch", async () => {
    mockedGetData.mockResolvedValue([]);
    mockedSendData
      .mockResolvedValueOnce({ id: "new-product" })
      .mockResolvedValueOnce({ id: "opening-receipt" });
    renderPage(<ProductsPage principal={principal} branch={branch} />);

    fireEvent.click(screen.getByRole("button", { name: "Add product" }));
    fireEvent.change(screen.getByLabelText(/Product name/), {
      target: { value: "Opening Stock Product" },
    });
    fireEvent.change(screen.getByLabelText(/Opening package quantity/), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText(/Batch number/), {
      target: { value: "OPEN-001" },
    });
    fireEvent.change(screen.getByLabelText(/Expiry date/), {
      target: { value: "2030-12-31" },
    });
    fireEvent.change(screen.getByLabelText(/Cost per base unit/), {
      target: { value: "0.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));

    await waitFor(() => expect(mockedSendData).toHaveBeenCalledTimes(2));
    expect(mockedSendData).toHaveBeenNthCalledWith(
      2,
      "post",
      "/inventory/receipts",
      expect.objectContaining({
        branchId: branch.id,
        lines: [
          expect.objectContaining({
            productId: "new-product",
            packageCode: "large_carton",
            packageQuantity: 2,
            batchNumber: "OPEN-001",
            expiryDate: "2030-12-31",
            unitCost: "0.25",
          }),
        ],
      }),
    );
  });
  it("shows package-aware multi-product sales controls", async () => {
    mockedGetData.mockImplementation(async (url: string) => {
      await Promise.resolve();
      if (url === "/products") {
        return [
          {
            id: "product-one",
            name: "Gloves",
            packages: [
              {
                id: "package-one",
                code: "piece",
                label: "Piece",
                unitsPerPackage: "1",
                salePrice: "1.0000",
              },
            ],
          },
          {
            id: "product-two",
            name: "Syrup",
            packages: [
              {
                id: "package-two",
                code: "bottle",
                label: "Bottle",
                unitsPerPackage: "1",
                salePrice: "3.5000",
              },
            ],
          },
        ];
      }
      if (url.startsWith("/inventory/stock")) {
        return [
          {
            product: { id: "product-one" },
            expiryDate: "2030-12-31",
            quantityOnHand: "100",
          },
          {
            product: { id: "product-two" },
            expiryDate: "2030-12-31",
            quantityOnHand: "100",
          },
        ];
      }
      return [];
    });

    renderPage(<SalesPage branch={branch} workspace={workspace} principal={principal} />);

    await screen.findByRole("heading", { name: "Gloves" });
    expect(screen.getByRole("textbox", { name: "Search products" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grid view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List view" })).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Piece" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("1 product")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Bottle" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("2 products")).toBeInTheDocument();
    expect(screen.getByLabelText(/Discount/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Customer name/), {
      target: { value: "Amina Hassan" },
    });
    fireEvent.change(screen.getByLabelText(/Required for debt/), {
      target: { value: "0612345678" },
    });
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled();
  });
});
