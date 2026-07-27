import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Copy, Download, Pencil, Plus, RefreshCw, ScanSearch } from "lucide-react";
import { useState } from "react";
import { downloadFile, errorMessage, getData, sendData } from "../api/client";
import {
  Card,
  date,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  money,
  PageHeader,
  SimpleTable,
  Stat,
  StatusBadge,
  SuccessMessage,
} from "../components/ui";
import type { Branch, TenantPrincipal, Workspace } from "../types";

type Row = Record<string, unknown>;

const today = new Date().toISOString().slice(0, 10);
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .slice(0, 10);
const idempotency = (prefix: string) => `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "—";

export function DashboardPage({
  branch,
  workspace,
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
}) {
  const [range, setRange] = useState({ from: monthStart, to: today });
  const query = useQuery({
    queryKey: ["dashboard", branch?.id, range],
    queryFn: () =>
      getData<Row>(`/reports/dashboard?branchId=${branch!.id}&from=${range.from}&to=${range.to}`),
    enabled: Boolean(branch),
  });
  if (!branch)
    return (
      <EmptyState
        title="No branch is available"
        description="Ask an administrator to assign or create a branch."
      />
    );
  const cards = (query.data?.["cards"] ?? {}) as Row;
  return (
    <>
      <PageHeader
        eyebrow={`${workspace.tenant.status} Â· ${workspace.tenant.planCode} plan`}
        title={`Good day, ${workspace.branding?.displayName ?? workspace.tenant.name}`}
        description={`Live operating view for ${branch.name}. All figures come from immutable PostgreSQL evidence.`}
        actions={
          <div className="flex gap-2">
            <input
              className="input max-w-40"
              type="date"
              value={range.from}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
            <input
              className="input max-w-40"
              type="date"
              value={range.to}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
            />
          </div>
        }
      />
      {query.isLoading ? <LoadingState /> : null}
      {query.error ? <ErrorState error={query.error} /> : null}
      {query.data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Net sales"
              value={money(cards["netSales"], workspace.tenant.currencyCode)}
            />
            <Stat
              label="Collections"
              value={money(cards["collections"], workspace.tenant.currencyCode)}
              tone="blue"
            />
            <Stat
              label="Receivables"
              value={money(cards["receivables"], workspace.tenant.currencyCode)}
              tone="amber"
            />
            <Stat
              label="Low stock items"
              value={text(cards["lowStockProducts"] ?? cards["lowStock"] ?? 0)}
              tone="rose"
            />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card title="Daily sales trend" description="Net sales by business day.">
              <SimpleTable
                rows={rows(query.data["dailySales"] ?? query.data["trend"])}
                columns={[
                  { label: "Date", render: (row) => text(row["date"] ?? row["businessDate"]) },
                  {
                    label: "Sales",
                    render: (row) =>
                      money(row["netSales"] ?? row["value"], workspace.tenant.currencyCode),
                  },
                ]}
              />
            </Card>
            <Card title="Top products" description="Highest moving products in this period.">
              <SimpleTable
                rows={rows(query.data["topProducts"])}
                columns={[
                  { label: "Product", render: (row) => text(row["name"] ?? row["productName"]) },
                  {
                    label: "Quantity",
                    render: (row) => text(row["quantity"] ?? row["quantityBaseUnits"]),
                  },
                  {
                    label: "Revenue",
                    render: (row) =>
                      money(row["revenue"] ?? row["netSales"], workspace.tenant.currencyCode),
                  },
                ]}
              />
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

export function ProductsPage({ principal }: { principal: TenantPrincipal }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    sku: string;
    genericName: string;
    active: boolean;
    prices: Record<string, string>;
  }>({
    name: "",
    sku: "",
    genericName: "",
    active: true,
    prices: {},
  });
  const [form, setForm] = useState({
    name: "",
    category: "tablets_capsules",
    baseUnit: "unit",
    sku: "",
    unitsPerStrip: "10",
    stripsPerSmallBox: "10",
    boxesPerCarton: "1",
    basePrice: "0",
  });
  const query = useQuery({
    queryKey: ["products", search],
    queryFn: () => getData<Row[]>(`/products?q=${encodeURIComponent(search)}`),
  });
  const create = useMutation({
    mutationFn: () =>
      sendData("post", "/products", {
        name: form.name,
        category: form.category,
        baseUnit: form.baseUnit,
        ...(form.sku ? { sku: form.sku } : {}),
        counts: {
          unitsPerStrip: Number(form.unitsPerStrip),
          stripsPerSmallBox: Number(form.stripsPerSmallBox),
          boxesPerCarton: Number(form.boxesPerCarton),
        },
        basePriceMinor: Math.round(Number(form.basePrice) * 100),
      }),
    onSuccess: async () => {
      setOpen(false);
      setForm({ ...form, name: "", sku: "" });
      await client.invalidateQueries({ queryKey: ["products"] });
    },
  });
  const update = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Choose a product");
      return sendData("patch", `/products/${text(editing["id"])}`, {
        name: editForm.name,
        sku: editForm.sku || null,
        genericName: editForm.genericName || null,
        active: editForm.active,
        packagePricesMinor: Object.fromEntries(
          Object.entries(editForm.prices).map(([code, value]) => [
            code,
            value === "" ? null : Math.round(Number(value) * 100),
          ]),
        ),
        expectedVersion: Number(editing["version"]),
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await client.invalidateQueries({ queryKey: ["products"] });
    },
  });
  const canManage = principal.role !== "AUDITOR";
  const beginEdit = (product: Row) => {
    setEditing(product);
    setEditForm({
      name: text(product["name"]),
      sku: product["sku"] ? text(product["sku"]) : "",
      genericName: product["genericName"] ? text(product["genericName"]) : "",
      active: product["active"] !== false,
      prices: Object.fromEntries(
        rows(product["packages"]).map((item) => [
          text(item["code"]),
          item["salePrice"] === null ? "" : text(item["salePrice"]),
        ]),
      ),
    });
  };
  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Products and packaging"
        description="Create products, maintain package prices, and safely deactivate items without deleting transaction history."
        actions={
          canManage ? (
            <button className="btn-primary" onClick={() => setOpen(!open)}>
              <Plus size={17} /> Add product
            </button>
          ) : undefined
        }
      />
      {open ? (
        <Card
          title="New product"
          description="Define packaging and the base selling price once."
          className="mb-6"
        >
          <form
            className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Product name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Category">
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {[
                  "tablets_capsules",
                  "syrups_liquids",
                  "injections",
                  "creams_ointments_gels",
                  "drops",
                  "iv_fluids",
                  "medical_supplies",
                  "baby_products",
                  "womens_products",
                  "dental_products",
                  "laboratory_items",
                  "supplements_vitamins",
                ].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="SKU">
              <input
                className="input"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </Field>
            <Field label="Base unit">
              <input
                className="input"
                value={form.baseUnit}
                onChange={(e) => setForm({ ...form, baseUnit: e.target.value })}
                required
              />
            </Field>
            <Field label="Units per strip">
              <input
                className="input"
                type="number"
                min="1"
                value={form.unitsPerStrip}
                onChange={(e) => setForm({ ...form, unitsPerStrip: e.target.value })}
              />
            </Field>
            <Field label="Strips per box">
              <input
                className="input"
                type="number"
                min="1"
                value={form.stripsPerSmallBox}
                onChange={(e) => setForm({ ...form, stripsPerSmallBox: e.target.value })}
              />
            </Field>
            <Field label="Boxes per carton">
              <input
                className="input"
                type="number"
                min="1"
                value={form.boxesPerCarton}
                onChange={(e) => setForm({ ...form, boxesPerCarton: e.target.value })}
              />
            </Field>
            <Field label="Base price">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.basePrice}
                onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
              />
            </Field>
            <div className="md:col-span-2 xl:col-span-4">
              {create.error ? (
                <p className="mb-3 text-sm text-rose-700">{errorMessage(create.error)}</p>
              ) : null}
              <div className="flex gap-2">
                <button className="btn-primary" disabled={create.isPending}>
                  Save product
                </button>
                <button className="btn-secondary" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </form>
        </Card>
      ) : null}
      <Card>
        <div className="action-bar">
          <input
            className="input max-w-md"
            placeholder="Search by product, SKU, or barcode"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="ml-auto text-sm font-semibold text-slate-500">
            {query.data?.length ?? 0} products
          </span>
        </div>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <SimpleTable
            rows={query.data ?? []}
            columns={[
              {
                label: "Product",
                render: (row) => (
                  <div>
                    <p className="font-bold text-slate-900">{text(row["name"])}</p>
                    <p className="text-xs text-slate-500">
                      {text(row["genericName"] ?? row["sku"])}
                    </p>
                  </div>
                ),
              },
              { label: "Category", render: (row) => text(row["category"]).replaceAll("_", " ") },
              { label: "Base unit", render: (row) => text(row["baseUnit"]) },
              {
                label: "Packages",
                render: (row) =>
                  rows(row["packages"])
                    .map(
                      (pack) => `${text(pack["code"])} · ${text(pack["salePrice"] ?? "No price")}`,
                    )
                    .join(", ") || "—",
              },
              {
                label: "Status",
                render: (row) => (
                  <StatusBadge value={row["active"] === false ? "INACTIVE" : "ACTIVE"} />
                ),
              },
              ...(canManage
                ? [
                    {
                      label: "Actions",
                      render: (row: Row) => (
                        <button className="btn-secondary" onClick={() => beginEdit(row)}>
                          <Pencil size={15} /> Edit
                        </button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Card>
      <Dialog
        open={Boolean(editing)}
        title="Edit product"
        description="Update product identity, package prices, or deactivate it safely."
        onClose={() => setEditing(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Product name">
              <input
                className="input"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </Field>
            <Field label="SKU">
              <input
                className="input"
                value={editForm.sku}
                onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
              />
            </Field>
            <Field label="Generic name">
              <input
                className="input"
                value={editForm.genericName}
                onChange={(e) => setEditForm({ ...editForm, genericName: e.target.value })}
              />
            </Field>
            <Field label="Status">
              <select
                className="input"
                value={editForm.active ? "ACTIVE" : "INACTIVE"}
                onChange={(e) => setEditForm({ ...editForm, active: e.target.value === "ACTIVE" })}
              >
                <option>ACTIVE</option>
                <option>INACTIVE</option>
              </select>
            </Field>
          </div>
          {Object.entries(editForm.prices).length ? (
            <div>
              <p className="mb-3 text-sm font-bold text-slate-800">Package sale prices</p>
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(editForm.prices).map(([code, value]) => (
                  <Field key={code} label={code}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={value}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          prices: { ...editForm.prices, [code]: e.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          ) : null}
          {update.error ? (
            <p className="text-sm text-rose-700">{errorMessage(update.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="btn-secondary" type="button" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={update.isPending}>
              Save changes
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
export function InventoryPage({
  branch,
  workspace,
  principal,
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const [tab, setTab] = useState<"stock" | "movements">("stock");
  const [action, setAction] = useState<"receipt" | "adjust" | "expiry" | "transfer" | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<Row | null>(null);
  const [form, setForm] = useState({
    productId: "",
    packageCode: "unit",
    packageQuantity: "1",
    batchNumber: "",
    expiryDate: "",
    unitCost: "0",
    supplierName: "",
    direction: "IN",
    quantityBaseUnits: "1",
    reason: "",
    destinationBranchId: "",
    notes: "",
  });
  const client = useQueryClient();
  const products = useQuery({
    queryKey: ["products", "inventory-form"],
    queryFn: () => getData<Row[]>("/products"),
  });
  const query = useQuery({
    queryKey: ["inventory", tab, branch?.id],
    queryFn: () => getData<Row[]>(`/inventory/${tab}?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const operation = useMutation({
    mutationFn: () => {
      if (action === "receipt")
        return sendData("post", "/inventory/receipts", {
          branchId: branch!.id,
          supplierName: form.supplierName || undefined,
          idempotencyKey: idempotency("receipt"),
          lines: [
            {
              productId: form.productId,
              packageCode: form.packageCode,
              packageQuantity: Number(form.packageQuantity),
              batchNumber: form.batchNumber,
              expiryDate: form.expiryDate,
              unitCost: form.unitCost,
            },
          ],
        });
      if (!selectedBatch) throw new Error("Choose a stock batch");
      if (action === "adjust")
        return sendData("post", "/inventory/adjustments", {
          branchId: branch!.id,
          batchId: text(selectedBatch["id"]),
          direction: form.direction,
          quantityBaseUnits: form.quantityBaseUnits,
          reason: form.reason,
          idempotencyKey: idempotency("adjustment"),
        });
      if (action === "expiry")
        return sendData("post", "/inventory/expiry-write-offs", {
          branchId: branch!.id,
          batchId: text(selectedBatch["id"]),
          reason: form.reason,
          idempotencyKey: idempotency("expiry"),
        });
      if (action === "transfer")
        return sendData("post", "/inventory/transfers", {
          sourceBranchId: branch!.id,
          destinationBranchId: form.destinationBranchId,
          notes: form.notes || undefined,
          idempotencyKey: idempotency("transfer"),
          lines: [
            { sourceBatchId: text(selectedBatch["id"]), quantityBaseUnits: form.quantityBaseUnits },
          ],
        });
      throw new Error("Choose an inventory action");
    },
    onSuccess: async () => {
      setAction(null);
      setSelectedBatch(null);
      setForm({ ...form, reason: "", notes: "", quantityBaseUnits: "1" });
      await client.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
  if (!branch) return <EmptyState title="Choose a branch" />;
  const canManage = principal.role !== "AUDITOR";
  const openBatchAction = (next: "adjust" | "expiry" | "transfer", row: Row) => {
    setSelectedBatch(row);
    setAction(next);
    operation.reset();
  };
  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Stock and movement ledger"
        description="Receive, correct, transfer, and write off batch stock with an immutable movement trail."
        actions={
          canManage ? (
            <button
              className="btn-primary"
              onClick={() => {
                setAction("receipt");
                operation.reset();
              }}
            >
              <Plus size={17} /> Receive stock
            </button>
          ) : undefined
        }
      />
      <Card>
        <div className="action-bar">
          {(["stock", "movements"] as const).map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              className={tab === item ? "btn-primary" : "btn-secondary"}
            >
              {item === "stock" ? "Current stock" : "Movement history"}
            </button>
          ))}
          <span className="ml-auto text-sm font-semibold text-slate-500">{branch.name}</span>
        </div>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <SimpleTable
            rows={query.data ?? []}
            columns={
              tab === "stock"
                ? [
                    {
                      label: "Product",
                      render: (row) => (
                        <div>
                          <p className="font-bold text-slate-900">
                            {text((row["product"] as Row | undefined)?.["name"])}
                          </p>
                          <p className="text-xs text-slate-500">
                            {text((row["product"] as Row | undefined)?.["sku"])}
                          </p>
                        </div>
                      ),
                    },
                    { label: "Batch", render: (row) => text(row["batchNumber"]) },
                    { label: "Expiry", render: (row) => date(row["expiryDate"]) },
                    { label: "On hand", render: (row) => text(row["quantityOnHand"]) },
                    ...(canManage
                      ? [
                          {
                            label: "Actions",
                            render: (row: Row) => (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  className="btn-secondary"
                                  onClick={() => openBatchAction("adjust", row)}
                                >
                                  Adjust
                                </button>
                                <button
                                  className="btn-secondary"
                                  onClick={() => openBatchAction("transfer", row)}
                                >
                                  Transfer
                                </button>
                                <button
                                  className="btn-danger"
                                  onClick={() => openBatchAction("expiry", row)}
                                >
                                  Write off
                                </button>
                              </div>
                            ),
                          },
                        ]
                      : []),
                  ]
                : [
                    { label: "Time", render: (row) => date(row["createdAt"]) },
                    {
                      label: "Type",
                      render: (row) => (
                        <StatusBadge value={text(row["type"] ?? row["movementType"])} />
                      ),
                    },
                    { label: "Quantity", render: (row) => text(row["quantityBaseUnits"]) },
                    {
                      label: "Reason",
                      render: (row) => text(row["reason"] ?? row["referenceType"]),
                    },
                  ]
            }
          />
        )}
      </Card>
      <Dialog
        open={action === "receipt"}
        title="Receive stock"
        description={`Post a supplier receipt into ${branch.name}.`}
        onClose={() => setAction(null)}
        wide
      >
        <form
          className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            operation.mutate();
          }}
        >
          <Field label="Product">
            <select
              className="input"
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
              required
            >
              <option value="">Select product</option>
              {(products.data ?? [])
                .filter((product) => product["active"] !== false)
                .map((product) => (
                  <option key={text(product["id"])} value={text(product["id"])}>
                    {text(product["name"])}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Package code">
            <input
              className="input"
              value={form.packageCode}
              onChange={(e) => setForm({ ...form, packageCode: e.target.value })}
              required
            />
          </Field>
          <Field label="Package quantity">
            <input
              className="input"
              type="number"
              min="1"
              value={form.packageQuantity}
              onChange={(e) => setForm({ ...form, packageQuantity: e.target.value })}
              required
            />
          </Field>
          <Field label="Unit cost">
            <input
              className="input"
              type="number"
              min="0"
              step="0.000001"
              value={form.unitCost}
              onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
              required
            />
          </Field>
          <Field label="Batch number">
            <input
              className="input"
              value={form.batchNumber}
              onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
              required
            />
          </Field>
          <Field label="Expiry date">
            <input
              className="input"
              type="date"
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              required
            />
          </Field>
          <Field label="Supplier">
            <input
              className="input"
              value={form.supplierName}
              onChange={(e) => setForm({ ...form, supplierName: e.target.value })}
            />
          </Field>
          <div className="flex items-end gap-2">
            <button className="btn-primary" disabled={operation.isPending}>
              Post receipt
            </button>
            <button className="btn-secondary" type="button" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
          {operation.error ? (
            <p className="text-sm text-rose-700 md:col-span-2 xl:col-span-4">
              {errorMessage(operation.error)}
            </p>
          ) : null}
        </form>
      </Dialog>
      <Dialog
        open={action !== null && action !== "receipt"}
        title={
          action === "adjust"
            ? "Adjust batch stock"
            : action === "transfer"
              ? "Transfer batch stock"
              : "Write off expired batch"
        }
        description={
          selectedBatch
            ? `${text((selectedBatch["product"] as Row | undefined)?.["name"])} · batch ${text(selectedBatch["batchNumber"])}`
            : undefined
        }
        onClose={() => {
          setAction(null);
          setSelectedBatch(null);
        }}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            operation.mutate();
          }}
        >
          {action === "adjust" ? (
            <Field label="Direction">
              <select
                className="input"
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value })}
              >
                <option value="IN">Increase</option>
                <option value="OUT">Decrease</option>
              </select>
            </Field>
          ) : null}
          {action === "adjust" || action === "transfer" ? (
            <Field label="Quantity in base units">
              <input
                className="input"
                type="number"
                min="1"
                value={form.quantityBaseUnits}
                onChange={(e) => setForm({ ...form, quantityBaseUnits: e.target.value })}
                required
              />
            </Field>
          ) : null}
          {action === "transfer" ? (
            <Field label="Destination branch">
              <select
                className="input"
                value={form.destinationBranchId}
                onChange={(e) => setForm({ ...form, destinationBranchId: e.target.value })}
                required
              >
                <option value="">Select destination</option>
                {workspace.branches
                  .filter((item) => item.id !== branch.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : null}
          <Field label={action === "transfer" ? "Notes" : "Reason"}>
            <textarea
              className="input min-h-24"
              value={action === "transfer" ? form.notes : form.reason}
              onChange={(e) =>
                action === "transfer"
                  ? setForm({ ...form, notes: e.target.value })
                  : setForm({ ...form, reason: e.target.value })
              }
              required={action !== "transfer"}
            />
          </Field>
          {operation.error ? (
            <p className="text-sm text-rose-700">{errorMessage(operation.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button className="btn-secondary" type="button" onClick={() => setAction(null)}>
              Cancel
            </button>
            <button
              className={action === "expiry" ? "btn-danger" : "btn-primary"}
              disabled={operation.isPending}
            >
              {action === "expiry" ? "Confirm write-off" : "Post operation"}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
export function SalesPage({
  branch,
  workspace,
  principal,
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const client = useQueryClient();
  const [selectedSale, setSelectedSale] = useState<Row | null>(null);
  const [saleAction, setSaleAction] = useState<"details" | "payment" | "return" | "void" | null>(
    null,
  );
  const [actionForm, setActionForm] = useState({
    amount: "",
    method: "CASH",
    reason: "",
    saleItemId: "",
    quantityBaseUnits: "1",
  });
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    productId: "",
    packageCode: "unit",
    quantity: "1",
    amountPaid: "0",
    paymentMethod: "CASH",
  });
  const products = useQuery({
    queryKey: ["products", "checkout"],
    queryFn: () => getData<Row[]>("/products"),
  });
  const sales = useQuery({
    queryKey: ["sales", branch?.id],
    queryFn: () => getData<Row[]>(`/sales?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const saleDetail = useQuery({
    queryKey: ["sale-detail", selectedSale?.["id"]],
    queryFn: () => getData<Row>(`/sales/${text(selectedSale?.["id"])}`),
    enabled: Boolean(selectedSale),
  });
  const saleOperation = useMutation({
    mutationFn: () => {
      if (!selectedSale || !saleAction) throw new Error("Choose a sale action");
      const saleId = text(selectedSale["id"]);
      if (saleAction === "payment")
        return sendData("post", `/sales/${saleId}/payments`, {
          branchId: branch!.id,
          amount: actionForm.amount,
          method: actionForm.method,
          idempotencyKey: idempotency("payment"),
        });
      if (saleAction === "return")
        return sendData("post", `/sales/${saleId}/returns`, {
          branchId: branch!.id,
          reason: actionForm.reason,
          refundMethod: actionForm.method,
          idempotencyKey: idempotency("return"),
          lines: [
            { saleItemId: actionForm.saleItemId, quantityBaseUnits: actionForm.quantityBaseUnits },
          ],
        });
      if (saleAction === "void")
        return sendData("post", `/sales/${saleId}/void`, {
          branchId: branch!.id,
          reason: actionForm.reason,
          refundMethod: actionForm.method,
          idempotencyKey: idempotency("void"),
        });
      throw new Error("This action does not submit data");
    },
    onSuccess: async () => {
      setSaleAction("details");
      setActionForm({
        ...actionForm,
        amount: "",
        reason: "",
        saleItemId: "",
        quantityBaseUnits: "1",
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["sales"] }),
        client.invalidateQueries({ queryKey: ["sale-detail"] }),
        client.invalidateQueries({ queryKey: ["debts"] }),
        client.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
    },
  });
  const openSale = (row: Row, action: "details" | "payment" | "return" | "void") => {
    setSelectedSale(row);
    setSaleAction(action);
    saleOperation.reset();
  };
  const checkout = useMutation({
    mutationFn: () =>
      sendData("post", "/sales", {
        branchId: branch!.id,
        customerName: form.customerName,
        customerPhone: form.customerPhone || undefined,
        discount: "0",
        amountPaid: form.amountPaid,
        ...(Number(form.amountPaid) > 0 ? { paymentMethod: form.paymentMethod } : {}),
        idempotencyKey: idempotency("sale"),
        lines: [
          {
            productId: form.productId,
            packageCode: form.packageCode,
            packageQuantity: Number(form.quantity),
          },
        ],
      }),
    onSuccess: async () => {
      setForm({ ...form, customerName: "", customerPhone: "", amountPaid: "0" });
      await client.invalidateQueries({ queryKey: ["sales"] });
    },
  });
  const selected = (products.data ?? []).find((item) => item["id"] === form.productId);
  const packages = rows(selected?.["packages"]);
  if (!branch) return <EmptyState title="Choose a branch" />;
  return (
    <>
      <PageHeader
        eyebrow="Point of sale"
        title="Sales and invoices"
        description="Atomic checkout with conditional stock decrement and immutable invoice evidence."
      />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        {principal.role !== "AUDITOR" ? (
          <Card title="New sale" description={`Checkout from ${branch.name}.`}>
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                checkout.mutate();
              }}
            >
              <Field label="Customer name">
                <input
                  className="input"
                  value={form.customerName}
                  onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                  required
                />
              </Field>
              <Field label="Customer phone">
                <input
                  className="input"
                  value={form.customerPhone}
                  onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                />
              </Field>
              <Field label="Product">
                <select
                  className="input"
                  value={form.productId}
                  onChange={(e) =>
                    setForm({ ...form, productId: e.target.value, packageCode: "unit" })
                  }
                  required
                >
                  <option value="">Select product</option>
                  {(products.data ?? []).map((item) => (
                    <option key={text(item["id"])} value={text(item["id"])}>
                      {text(item["name"])}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Package">
                  <select
                    className="input"
                    value={form.packageCode}
                    onChange={(e) => setForm({ ...form, packageCode: e.target.value })}
                  >
                    {packages.map((item) => (
                      <option key={text(item["code"])} value={text(item["code"])}>
                        {text(item["label"] ?? item["code"])}
                      </option>
                    ))}
                    {!packages.length ? <option value="unit">unit</option> : null}
                  </select>
                </Field>
                <Field label="Quantity">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount paid">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amountPaid}
                    onChange={(e) => setForm({ ...form, amountPaid: e.target.value })}
                  />
                </Field>
                <Field label="Method">
                  <select
                    className="input"
                    value={form.paymentMethod}
                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                  >
                    {["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {checkout.error ? (
                <p className="text-sm text-rose-700">{errorMessage(checkout.error)}</p>
              ) : null}
              {checkout.isSuccess ? (
                <SuccessMessage>Sale posted successfully.</SuccessMessage>
              ) : null}
              <button className="btn-primary w-full" disabled={checkout.isPending}>
                Complete sale
              </button>
            </form>
          </Card>
        ) : null}
        <Card title="Recent sales">
          {sales.isLoading ? (
            <LoadingState />
          ) : sales.error ? (
            <ErrorState error={sales.error} />
          ) : (
            <SimpleTable
              rows={sales.data ?? []}
              columns={[
                {
                  label: "Invoice",
                  render: (row) => <span className="font-bold">{text(row["invoiceNumber"])}</span>,
                },
                { label: "Customer", render: (row) => text(row["customerName"]) },
                {
                  label: "Total",
                  render: (row) =>
                    money(row["grandTotal"] ?? row["total"], workspace.tenant.currencyCode),
                },
                { label: "Status", render: (row) => <StatusBadge value={text(row["status"])} /> },
                { label: "Created", render: (row) => date(row["createdAt"]) },
                {
                  label: "Actions",
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      <button className="btn-secondary" onClick={() => openSale(row, "details")}>
                        View
                      </button>
                      {principal.role !== "AUDITOR" && row["status"] !== "VOIDED" ? (
                        <button className="btn-secondary" onClick={() => openSale(row, "payment")}>
                          Payment
                        </button>
                      ) : null}
                      {principal.role !== "AUDITOR" && row["status"] !== "VOIDED" ? (
                        <button className="btn-secondary" onClick={() => openSale(row, "return")}>
                          Return
                        </button>
                      ) : null}
                      <button
                        className="btn-icon"
                        aria-label="Download invoice"
                        onClick={() =>
                          void downloadFile(
                            `/reports/invoices/${text(row["id"])}.pdf`,
                            `${text(row["invoiceNumber"])}.pdf`,
                          )
                        }
                      >
                        <Download size={15} />
                      </button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </div>
      <Dialog
        open={Boolean(selectedSale)}
        title={`Invoice ${text(selectedSale?.["invoiceNumber"])}`}
        description={
          selectedSale
            ? `${text(selectedSale["customerName"])} · ${money(selectedSale["grandTotal"], workspace.tenant.currencyCode)}`
            : undefined
        }
        onClose={() => {
          setSelectedSale(null);
          setSaleAction(null);
        }}
        wide
      >
        {saleDetail.isLoading ? (
          <LoadingState />
        ) : saleDetail.error ? (
          <div className="p-5">
            <ErrorState error={saleDetail.error} />
          </div>
        ) : saleDetail.data ? (
          <div>
            <div className="action-bar">
              <button
                className={saleAction === "details" ? "btn-primary" : "btn-secondary"}
                onClick={() => setSaleAction("details")}
              >
                Details
              </button>
              {principal.role !== "AUDITOR" && saleDetail.data["status"] !== "VOIDED" ? (
                <>
                  <button
                    className={saleAction === "payment" ? "btn-primary" : "btn-secondary"}
                    onClick={() => setSaleAction("payment")}
                  >
                    Add payment
                  </button>
                  <button
                    className={saleAction === "return" ? "btn-primary" : "btn-secondary"}
                    onClick={() => setSaleAction("return")}
                  >
                    Return item
                  </button>
                  <button className="btn-danger" onClick={() => setSaleAction("void")}>
                    Void sale
                  </button>
                </>
              ) : null}
            </div>
            {saleAction === "details" ? (
              <div className="grid gap-5 p-5 lg:grid-cols-2">
                <Card title="Items">
                  <SimpleTable
                    rows={rows(saleDetail.data["items"])}
                    columns={[
                      { label: "Product", render: (row) => text(row["productName"]) },
                      {
                        label: "Package",
                        render: (row) => text(row["packageLabel"] ?? row["packageCode"]),
                      },
                      { label: "Quantity", render: (row) => text(row["packageQuantity"]) },
                      {
                        label: "Subtotal",
                        render: (row) => money(row["subtotal"], workspace.tenant.currencyCode),
                      },
                    ]}
                  />
                </Card>
                <Card title="Payments">
                  <SimpleTable
                    rows={rows(saleDetail.data["payments"])}
                    columns={[
                      { label: "Date", render: (row) => date(row["createdAt"]) },
                      { label: "Method", render: (row) => text(row["method"]) },
                      {
                        label: "Amount",
                        render: (row) => money(row["amount"], workspace.tenant.currencyCode),
                      },
                    ]}
                  />
                </Card>
              </div>
            ) : null}
            {saleAction === "payment" ? (
              <form
                className="space-y-4 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saleOperation.mutate();
                }}
              >
                <Field label="Amount">
                  <input
                    className="input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={actionForm.amount}
                    onChange={(e) => setActionForm({ ...actionForm, amount: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Payment method">
                  <select
                    className="input"
                    value={actionForm.method}
                    onChange={(e) => setActionForm({ ...actionForm, method: e.target.value })}
                  >
                    {["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                {saleOperation.error ? (
                  <p className="text-sm text-rose-700">{errorMessage(saleOperation.error)}</p>
                ) : null}
                <button className="btn-primary" disabled={saleOperation.isPending}>
                  Post payment
                </button>
              </form>
            ) : null}
            {saleAction === "return" ? (
              <form
                className="space-y-4 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saleOperation.mutate();
                }}
              >
                <Field label="Sale item">
                  <select
                    className="input"
                    value={actionForm.saleItemId}
                    onChange={(e) => setActionForm({ ...actionForm, saleItemId: e.target.value })}
                    required
                  >
                    <option value="">Select item</option>
                    {rows(saleDetail.data["items"]).map((item) => (
                      <option key={text(item["id"])} value={text(item["id"])}>
                        {text(item["productName"])} · {text(item["baseUnitsSold"])} base units
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Return quantity (base units)">
                  <input
                    className="input"
                    type="number"
                    min="1"
                    value={actionForm.quantityBaseUnits}
                    onChange={(e) =>
                      setActionForm({ ...actionForm, quantityBaseUnits: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field label="Reason">
                  <textarea
                    className="input min-h-24"
                    value={actionForm.reason}
                    onChange={(e) => setActionForm({ ...actionForm, reason: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Refund method">
                  <select
                    className="input"
                    value={actionForm.method}
                    onChange={(e) => setActionForm({ ...actionForm, method: e.target.value })}
                  >
                    {["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                {saleOperation.error ? (
                  <p className="text-sm text-rose-700">{errorMessage(saleOperation.error)}</p>
                ) : null}
                <button className="btn-primary" disabled={saleOperation.isPending}>
                  Process return
                </button>
              </form>
            ) : null}
            {saleAction === "void" ? (
              <form
                className="space-y-4 p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saleOperation.mutate();
                }}
              >
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  Voiding preserves the invoice and reverses stock/payment effects with audit
                  evidence.
                </div>
                <Field label="Reason">
                  <textarea
                    className="input min-h-24"
                    value={actionForm.reason}
                    onChange={(e) => setActionForm({ ...actionForm, reason: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Refund method">
                  <select
                    className="input"
                    value={actionForm.method}
                    onChange={(e) => setActionForm({ ...actionForm, method: e.target.value })}
                  >
                    {["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                {saleOperation.error ? (
                  <p className="text-sm text-rose-700">{errorMessage(saleOperation.error)}</p>
                ) : null}
                <button className="btn-danger" disabled={saleOperation.isPending}>
                  Confirm void
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </Dialog>{" "}
    </>
  );
}

export function DebtsPage({
  branch,
  workspace,
  principal,
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<Row | null>(null);
  const [form, setForm] = useState({ amount: "", method: "CASH" });
  const query = useQuery({
    queryKey: ["debts", branch?.id],
    queryFn: () => getData<Row[]>(`/debts?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const payment = useMutation({
    mutationFn: () =>
      sendData(
        "post",
        `/sales/${text(selected?.["saleId"] ?? (selected?.["sale"] as Row | undefined)?.["id"])}/payments`,
        {
          branchId: branch!.id,
          amount: form.amount,
          method: form.method,
          idempotencyKey: idempotency("debt-payment"),
        },
      ),
    onSuccess: async () => {
      setSelected(null);
      setForm({ ...form, amount: "" });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["debts"] }),
        client.invalidateQueries({ queryKey: ["sales"] }),
      ]);
    },
  });
  if (!branch) return <EmptyState title="Choose a branch" />;
  const canCollect = ["OWNER", "ADMIN", "MANAGER"].includes(principal.role);
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Customer debts"
        description="Track receivables, due dates, overdue balances, and post customer collections."
      />
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Stat
          label="Open accounts"
          value={(query.data ?? []).filter((row) => row["status"] !== "PAID").length}
          tone="amber"
        />
        <Stat
          label="Total outstanding"
          value={money(
            (query.data ?? []).reduce((sum, row) => sum + Number(row["remainingAmount"] ?? 0), 0),
            workspace.tenant.currencyCode,
          )}
          tone="rose"
        />
        <Stat
          label="Overdue"
          value={(query.data ?? []).filter((row) => row["status"] === "OVERDUE").length}
          tone="rose"
        />
      </div>
      <Card>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <SimpleTable
            rows={query.data ?? []}
            columns={[
              {
                label: "Customer",
                render: (row) => (
                  <div>
                    <p className="font-bold text-slate-900">
                      {text(
                        row["customerName"] ?? (row["sale"] as Row | undefined)?.["customerName"],
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {text((row["sale"] as Row | undefined)?.["invoiceNumber"])}
                    </p>
                  </div>
                ),
              },
              {
                label: "Original",
                render: (row) =>
                  money(row["totalAmount"] ?? row["originalAmount"], workspace.tenant.currencyCode),
              },
              {
                label: "Paid",
                render: (row) => money(row["paidAmount"], workspace.tenant.currencyCode),
              },
              {
                label: "Remaining",
                render: (row) => (
                  <strong>{money(row["remainingAmount"], workspace.tenant.currencyCode)}</strong>
                ),
              },
              { label: "Due", render: (row) => date(row["dueDate"]) },
              { label: "Status", render: (row) => <StatusBadge value={text(row["status"])} /> },
              ...(canCollect
                ? [
                    {
                      label: "Actions",
                      render: (row: Row) =>
                        row["status"] !== "PAID" && row["status"] !== "VOIDED" ? (
                          <button
                            className="btn-primary"
                            onClick={() => {
                              setSelected(row);
                              setForm({ ...form, amount: text(row["remainingAmount"]) });
                            }}
                          >
                            Collect payment
                          </button>
                        ) : null,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </Card>
      <Dialog
        open={Boolean(selected)}
        title="Collect debt payment"
        description={
          selected
            ? `${text(selected["customerName"] ?? (selected["sale"] as Row | undefined)?.["customerName"])} · ${money(selected["remainingAmount"], workspace.tenant.currencyCode)} remaining`
            : undefined
        }
        onClose={() => setSelected(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            payment.mutate();
          }}
        >
          <Field label="Amount">
            <input
              className="input"
              type="number"
              min="0.01"
              step="0.01"
              max={text(selected?.["remainingAmount"])}
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </Field>
          <Field label="Payment method">
            <select
              className="input"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            >
              {["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          {payment.error ? (
            <p className="text-sm text-rose-700">{errorMessage(payment.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" type="button" onClick={() => setSelected(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={payment.isPending}>
              Post collection
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
export function ExpensesPage({
  branch,
  workspace,
  principal,
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const client = useQueryClient();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Row | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", active: true });
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [form, setForm] = useState({
    categoryId: "",
    title: "",
    amount: "",
    expenseDate: today,
    note: "",
  });
  const canManage = ["OWNER", "ADMIN", "MANAGER"].includes(principal.role);
  const canVoid = ["OWNER", "ADMIN"].includes(principal.role);
  const categories = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () =>
      getData<Row[]>(`/expenses/categories${canManage ? "?includeInactive=true" : ""}`),
  });
  const query = useQuery({
    queryKey: ["expenses", branch?.id],
    queryFn: () => getData<Row[]>(`/expenses?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const create = useMutation({
    mutationFn: () =>
      sendData("post", "/expenses", {
        ...form,
        branchId: branch!.id,
        idempotencyKey: idempotency("expense"),
      }),
    onSuccess: async () => {
      setForm({ ...form, title: "", amount: "", note: "" });
      await client.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
  const saveCategory = useMutation({
    mutationFn: () =>
      editingCategory
        ? sendData("patch", `/expenses/categories/${text(editingCategory["id"])}`, categoryForm)
        : sendData("post", "/expenses/categories", { name: categoryForm.name }),
    onSuccess: async () => {
      setEditingCategory(null);
      setCategoryForm({ name: "", active: true });
      await client.invalidateQueries({ queryKey: ["expense-categories"] });
    },
  });
  const voidExpense = useMutation({
    mutationFn: () =>
      sendData("post", `/expenses/${text(voiding?.["id"])}/void`, {
        branchId: branch!.id,
        reason: voidReason,
      }),
    onSuccess: async () => {
      setVoiding(null);
      setVoidReason("");
      await client.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
  if (!branch) return <EmptyState title="Choose a branch" />;
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="Post operating expenses, maintain categories, and void mistakes without deleting financial evidence."
        actions={
          canManage ? (
            <button className="btn-secondary" onClick={() => setCategoryOpen(!categoryOpen)}>
              Manage categories
            </button>
          ) : undefined
        }
      />
      {categoryOpen ? (
        <Card
          title="Expense categories"
          description="Inactive categories remain visible in historical records."
          className="mb-6"
        >
          <div className="grid gap-5 p-5 lg:grid-cols-[0.7fr_1.3fr]">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveCategory.mutate();
              }}
            >
              <Field label="Category name">
                <input
                  className="input"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  required
                />
              </Field>
              {editingCategory ? (
                <Field label="Status">
                  <select
                    className="input"
                    value={categoryForm.active ? "ACTIVE" : "INACTIVE"}
                    onChange={(e) =>
                      setCategoryForm({ ...categoryForm, active: e.target.value === "ACTIVE" })
                    }
                  >
                    <option>ACTIVE</option>
                    <option>INACTIVE</option>
                  </select>
                </Field>
              ) : null}
              {saveCategory.error ? (
                <p className="text-sm text-rose-700">{errorMessage(saveCategory.error)}</p>
              ) : null}
              <div className="flex gap-2">
                <button className="btn-primary" disabled={saveCategory.isPending}>
                  {editingCategory ? "Save category" : "Add category"}
                </button>
                {editingCategory ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryForm({ name: "", active: true });
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
            <SimpleTable
              rows={categories.data ?? []}
              columns={[
                { label: "Category", render: (row) => text(row["name"]) },
                {
                  label: "Status",
                  render: (row) => (
                    <StatusBadge value={row["active"] === false ? "INACTIVE" : "ACTIVE"} />
                  ),
                },
                {
                  label: "Actions",
                  render: (row) => (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setEditingCategory(row);
                        setCategoryForm({
                          name: text(row["name"]),
                          active: row["active"] !== false,
                        });
                      }}
                    >
                      <Pencil size={15} /> Edit
                    </button>
                  ),
                },
              ]}
            />
          </div>
        </Card>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        {canManage ? (
          <Card title="Post expense" description={`Record an expense for ${branch.name}.`}>
            <form
              className="space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Field label="Category">
                <select
                  className="input"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  required
                >
                  <option value="">Select category</option>
                  {(categories.data ?? [])
                    .filter((item) => item["active"] !== false)
                    .map((item) => (
                      <option key={text(item["id"])} value={text(item["id"])}>
                        {text(item["name"])}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Title">
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </Field>
              <Field label="Amount">
                <input
                  className="input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </Field>
              <Field label="Date">
                <input
                  className="input"
                  type="date"
                  value={form.expenseDate}
                  onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                  required
                />
              </Field>
              <Field label="Note">
                <textarea
                  className="input min-h-20"
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </Field>
              {create.error ? (
                <p className="text-sm text-rose-700">{errorMessage(create.error)}</p>
              ) : null}
              <button className="btn-primary" disabled={create.isPending}>
                Post expense
              </button>
            </form>
          </Card>
        ) : null}
        <Card title="Expense ledger">
          <SimpleTable
            rows={query.data ?? []}
            columns={[
              {
                label: "Title",
                render: (row) => (
                  <div>
                    <p className="font-bold text-slate-900">{text(row["title"])}</p>
                    <p className="text-xs text-slate-500">{text(row["note"])}</p>
                  </div>
                ),
              },
              {
                label: "Category",
                render: (row) => text((row["category"] as Row | undefined)?.["name"]),
              },
              {
                label: "Amount",
                render: (row) => money(row["amount"], workspace.tenant.currencyCode),
              },
              { label: "Date", render: (row) => date(row["expenseDate"]) },
              {
                label: "Status",
                render: (row) => <StatusBadge value={row["voidedAt"] ? "VOIDED" : "POSTED"} />,
              },
              ...(canVoid
                ? [
                    {
                      label: "Actions",
                      render: (row: Row) =>
                        row["status"] !== "VOIDED" && !row["voidedAt"] ? (
                          <button className="btn-danger" onClick={() => setVoiding(row)}>
                            Void
                          </button>
                        ) : null,
                    },
                  ]
                : []),
            ]}
          />
        </Card>
      </div>
      <Dialog
        open={Boolean(voiding)}
        title="Void expense"
        description={
          voiding
            ? `${text(voiding["title"])} · ${money(voiding["amount"], workspace.tenant.currencyCode)}`
            : undefined
        }
        onClose={() => setVoiding(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            voidExpense.mutate();
          }}
        >
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            The record will remain in reports and audit history as voided.
          </div>
          <Field label="Reason">
            <textarea
              className="input min-h-24"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              required
            />
          </Field>
          {voidExpense.error ? (
            <p className="text-sm text-rose-700">{errorMessage(voidExpense.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setVoiding(null)}>
              Cancel
            </button>
            <button className="btn-danger" disabled={voidExpense.isPending}>
              Confirm void
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
export function ReportsPage({
  branch,
  workspace,
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
}) {
  const [report, setReport] = useState("sales");
  const [range, setRange] = useState({ from: monthStart, to: today });
  const exportReport = useMutation({
    mutationFn: async () => {
      if (!branch) throw new Error("Choose a branch");
      const job = await sendData<Row>("post", "/jobs/exports", {
        reportType: report,
        branchId: branch.id,
        ...(report === "inventory" || report === "debts" ? {} : { from: range.from, to: range.to }),
        idempotencyKey: idempotency("export"),
      });
      const completed = await sendData<Row>("post", `/jobs/${text(job["id"])}/process`);
      const result = (completed["result"] ?? {}) as Row;
      const exportId = text(result["exportId"]);
      if (exportId === "—") throw new Error("The export did not produce a downloadable file");
      await downloadFile(
        `/jobs/exports/${exportId}/download`,
        `${report}-${range.from}-${range.to}.csv`,
      );
    },
  });
  const query = useQuery({
    queryKey: ["report", report, branch?.id, range],
    queryFn: () =>
      getData<unknown>(
        `/reports/${report}?branchId=${branch!.id}${report === "inventory" || report === "debts" ? "" : `&from=${range.from}&to=${range.to}`}`,
      ),
    enabled: Boolean(branch),
  });
  const reportRows = rows((query.data as Row | undefined)?.["rows"] ?? query.data);
  return (
    <>
      <PageHeader
        eyebrow="Reporting"
        title="Operational reports"
        description="Bounded tenant-safe reports and export jobs."
        actions={
          <>
            <input
              className="input max-w-40"
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
            />
            <input
              className="input max-w-40"
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
            <button
              className="btn-primary"
              disabled={!branch || exportReport.isPending}
              onClick={() => exportReport.mutate()}
            >
              <Download size={16} /> {exportReport.isPending ? "Preparing…" : "Export CSV"}
            </button>
          </>
        }
      />
      {exportReport.error ? (
        <div className="mb-5">
          <ErrorState error={exportReport.error} />
        </div>
      ) : null}
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
          {["sales", "inventory", "debts", "expenses", "margin"].map((item) => (
            <button
              key={item}
              className={report === item ? "btn-primary" : "btn-secondary"}
              onClick={() => setReport(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : reportRows.length ? (
          <SimpleTable
            rows={reportRows}
            columns={Object.keys(reportRows[0] ?? {})
              .slice(0, 6)
              .map((key) => ({
                label: key.replaceAll(/([A-Z])/g, " $1"),
                render: (row: Row) =>
                  typeof row[key] === "object"
                    ? JSON.stringify(row[key])
                    : key.toLowerCase().includes("amount") || key.toLowerCase().includes("sales")
                      ? money(row[key], workspace.tenant.currencyCode)
                      : text(row[key]),
              }))}
          />
        ) : (
          <EmptyState />
        )}
      </Card>
    </>
  );
}

export function StaffPage({
  workspace,
  principal,
}: {
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const client = useQueryClient();
  const [section, setSection] = useState<"members" | "branches" | "invitations">("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [token, setToken] = useState("");
  const [editingMember, setEditingMember] = useState<Row | null>(null);
  const [editingBranch, setEditingBranch] = useState<Row | null>(null);
  const [branchOpen, setBranchOpen] = useState(false);
  const [branchForm, setBranchForm] = useState({
    name: "",
    code: "",
    timezone: workspace.tenant.timezone,
    phone: "",
    active: true,
  });
  const [memberForm, setMemberForm] = useState({
    role: "CASHIER",
    status: "ACTIVE",
    allBranches: true,
    branchIds: [] as string[],
  });
  const [form, setForm] = useState({
    email: "",
    username: "",
    role: "CASHIER",
    allBranches: true,
    branchIds: [] as string[],
  });
  const canManage = ["OWNER", "ADMIN"].includes(principal.role);
  const members = useQuery({
    queryKey: ["members"],
    queryFn: () => getData<Row[]>("/tenant/members"),
  });
  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: () => getData<Row[]>("/tenant/invitations"),
  });
  const invite = useMutation({
    mutationFn: () => sendData<{ acceptanceToken: string }>("post", "/tenant/invitations", form),
    onSuccess: async (result) => {
      setToken(result.acceptanceToken);
      await client.invalidateQueries({ queryKey: ["invitations"] });
    },
  });
  const revokeInvitation = useMutation({
    mutationFn: (id: string) => sendData("post", `/tenant/invitations/${id}/revoke`),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["invitations"] }),
  });
  const saveMember = useMutation({
    mutationFn: async () => {
      if (!editingMember) throw new Error("Choose a member");
      const id = text(editingMember["id"]);
      await sendData("patch", `/tenant/members/${id}`, {
        role: memberForm.role,
        allBranches: memberForm.allBranches,
        branchIds: memberForm.allBranches ? [] : memberForm.branchIds,
      });
      if (memberForm.status !== text(editingMember["status"]))
        await sendData("patch", `/tenant/members/${id}/status`, { status: memberForm.status });
    },
    onSuccess: async () => {
      setEditingMember(null);
      await client.invalidateQueries({ queryKey: ["members"] });
    },
  });
  const saveBranch = useMutation({
    mutationFn: () =>
      editingBranch
        ? sendData("patch", `/tenant/branches/${text(editingBranch["id"])}`, branchForm)
        : sendData("post", "/tenant/branches", {
            name: branchForm.name,
            code: branchForm.code,
            timezone: branchForm.timezone,
          }),
    onSuccess: async () => {
      setEditingBranch(null);
      setBranchOpen(false);
      setBranchForm({
        name: "",
        code: "",
        timezone: workspace.tenant.timezone,
        phone: "",
        active: true,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["tenant-workspace"] }),
        client.invalidateQueries({ queryKey: ["members"] }),
      ]);
    },
  });
  const beginMemberEdit = (row: Row) => {
    setEditingMember(row);
    setMemberForm({
      role: text(row["role"]),
      status: text(row["status"]),
      allBranches: row["allBranches"] === true,
      branchIds: rows(row["branches"]).map((item) => text(item["branchId"])),
    });
  };
  const beginBranchEdit = (branch: Branch) => {
    const row = branch as unknown as Row;
    setEditingBranch(row);
    setBranchOpen(true);
    setBranchForm({
      name: branch.name,
      code: branch.code,
      timezone: branch.timezone,
      phone: text(row["phone"]) === "—" ? "" : text(row["phone"]),
      active: row["active"] !== false,
    });
  };
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Staff and branches"
        description="Manage invitations, roles, branch-scoped access, and operating locations from one controlled workspace."
        actions={
          canManage ? (
            <>
              <button
                className="btn-secondary"
                onClick={() => {
                  setEditingBranch(null);
                  setBranchOpen(true);
                  setBranchForm({
                    name: "",
                    code: "",
                    timezone: workspace.tenant.timezone,
                    phone: "",
                    active: true,
                  });
                }}
              >
                <Plus size={17} /> Add branch
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  setInviteOpen(true);
                  setToken("");
                }}
              >
                <Plus size={17} /> Invite staff
              </button>
            </>
          ) : undefined
        }
      />
      <Card>
        <div className="action-bar">
          {(["members", "branches", "invitations"] as const).map((item) => (
            <button
              key={item}
              className={section === item ? "btn-primary" : "btn-secondary"}
              onClick={() => setSection(item)}
            >
              {item === "members"
                ? "Staff members"
                : item === "branches"
                  ? "Branches"
                  : "Invitations"}
            </button>
          ))}
        </div>
        {section === "members" ? (
          members.isLoading ? (
            <LoadingState />
          ) : members.error ? (
            <ErrorState error={members.error} />
          ) : (
            <SimpleTable
              rows={members.data ?? []}
              columns={[
                {
                  label: "Member",
                  render: (row) => (
                    <div>
                      <p className="font-bold text-slate-900">
                        {text((row["user"] as Row | undefined)?.["fullName"])}
                      </p>
                      <p className="text-xs text-slate-500">
                        {text(row["username"])} ·{" "}
                        {text((row["user"] as Row | undefined)?.["email"])}
                      </p>
                    </div>
                  ),
                },
                { label: "Role", render: (row) => <StatusBadge value={text(row["role"])} /> },
                {
                  label: "Branch access",
                  render: (row) =>
                    row["allBranches"]
                      ? "All branches"
                      : `${rows(row["branches"]).length} selected`,
                },
                { label: "Status", render: (row) => <StatusBadge value={text(row["status"])} /> },
                ...(canManage
                  ? [
                      {
                        label: "Actions",
                        render: (row: Row) =>
                          row["role"] !== "OWNER" && text(row["id"]) !== principal.membershipId ? (
                            <button className="btn-secondary" onClick={() => beginMemberEdit(row)}>
                              <Pencil size={15} /> Manage
                            </button>
                          ) : null,
                      },
                    ]
                  : []),
              ]}
            />
          )
        ) : null}
        {section === "branches" ? (
          <SimpleTable
            rows={workspace.branches as unknown as Row[]}
            columns={[
              {
                label: "Branch",
                render: (row) => (
                  <div>
                    <p className="font-bold text-slate-900">{text(row["name"])}</p>
                    <p className="text-xs text-slate-500">{text(row["code"])}</p>
                  </div>
                ),
              },
              { label: "Timezone", render: (row) => text(row["timezone"]) },
              { label: "Phone", render: (row) => text(row["phone"]) },
              {
                label: "Status",
                render: (row) => (
                  <StatusBadge value={row["active"] === false ? "INACTIVE" : "ACTIVE"} />
                ),
              },
              ...(canManage
                ? [
                    {
                      label: "Actions",
                      render: (row: Row) => (
                        <button
                          className="btn-secondary"
                          onClick={() => beginBranchEdit(row as unknown as Branch)}
                        >
                          <Pencil size={15} /> Edit
                        </button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        ) : null}
        {section === "invitations" ? (
          invitations.isLoading ? (
            <LoadingState />
          ) : (
            <SimpleTable
              rows={invitations.data ?? []}
              columns={[
                {
                  label: "Invitee",
                  render: (row) => (
                    <div>
                      <p className="font-bold">{text(row["username"])}</p>
                      <p className="text-xs text-slate-500">{text(row["email"])}</p>
                    </div>
                  ),
                },
                { label: "Role", render: (row) => text(row["role"]) },
                { label: "Expires", render: (row) => date(row["expiresAt"]) },
                {
                  label: "Status",
                  render: (row) => (
                    <StatusBadge
                      value={
                        row["acceptedAt"]
                          ? "ACCEPTED"
                          : row["revokedAt"]
                            ? "REVOKED"
                            : new Date(text(row["expiresAt"])) < new Date()
                              ? "EXPIRED"
                              : "PENDING"
                      }
                    />
                  ),
                },
                ...(canManage
                  ? [
                      {
                        label: "Actions",
                        render: (row: Row) =>
                          !row["acceptedAt"] && !row["revokedAt"] ? (
                            <button
                              className="btn-danger"
                              onClick={() => revokeInvitation.mutate(text(row["id"]))}
                            >
                              Revoke
                            </button>
                          ) : null,
                      },
                    ]
                  : []),
              ]}
            />
          )
        ) : null}
      </Card>
      <Dialog
        open={inviteOpen}
        title="Invite staff member"
        description="The acceptance token is shown once and expires after 72 hours."
        onClose={() => setInviteOpen(false)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Username">
            <input
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
            />
          </Field>
          <Field label="Role">
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {["ADMIN", "MANAGER", "PHARMACIST", "CASHIER", "AUDITOR"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.allBranches}
              onChange={(e) =>
                setForm({
                  ...form,
                  allBranches: e.target.checked,
                  branchIds: e.target.checked ? [] : form.branchIds,
                })
              }
            />{" "}
            Access every branch
          </label>
          {!form.allBranches ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {workspace.branches.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={form.branchIds.includes(item.id)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        branchIds: e.target.checked
                          ? [...form.branchIds, item.id]
                          : form.branchIds.filter((id) => id !== item.id),
                      })
                    }
                  />
                  {item.name}
                </label>
              ))}
            </div>
          ) : null}
          {token ? (
            <div>
              <SuccessMessage>
                <span>Invitation created. Copy the token now.</span>
                <button
                  className="ml-auto"
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(token)}
                >
                  <Copy size={16} />
                </button>
              </SuccessMessage>
              <textarea className="input mt-2 min-h-20" readOnly value={token} />
            </div>
          ) : null}
          {invite.error ? (
            <p className="text-sm text-rose-700">{errorMessage(invite.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={invite.isPending}>
            Create invitation
          </button>
        </form>
      </Dialog>
      <Dialog
        open={branchOpen}
        title={editingBranch ? "Edit branch" : "Add branch"}
        onClose={() => {
          setEditingBranch(null);
          setBranchOpen(false);
        }}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveBranch.mutate();
          }}
        >
          <Field label="Branch name">
            <input
              className="input"
              value={branchForm.name}
              onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Code">
            <input
              className="input"
              value={branchForm.code}
              onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
              required
            />
          </Field>
          <Field label="Timezone">
            <input
              className="input"
              value={branchForm.timezone}
              onChange={(e) => setBranchForm({ ...branchForm, timezone: e.target.value })}
              required
            />
          </Field>
          {editingBranch ? (
            <>
              <Field label="Phone">
                <input
                  className="input"
                  value={branchForm.phone}
                  onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                />
              </Field>
              <Field label="Status">
                <select
                  className="input"
                  value={branchForm.active ? "ACTIVE" : "INACTIVE"}
                  onChange={(e) =>
                    setBranchForm({ ...branchForm, active: e.target.value === "ACTIVE" })
                  }
                >
                  <option>ACTIVE</option>
                  <option>INACTIVE</option>
                </select>
              </Field>
            </>
          ) : null}
          {saveBranch.error ? (
            <p className="text-sm text-rose-700">{errorMessage(saveBranch.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={saveBranch.isPending}>
            Save branch
          </button>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(editingMember)}
        title="Manage staff access"
        description={
          editingMember ? text((editingMember["user"] as Row | undefined)?.["fullName"]) : undefined
        }
        onClose={() => setEditingMember(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveMember.mutate();
          }}
        >
          <Field label="Role">
            <select
              className="input"
              value={memberForm.role}
              onChange={(e) => setMemberForm({ ...memberForm, role: e.target.value })}
            >
              {["ADMIN", "MANAGER", "PHARMACIST", "CASHIER", "AUDITOR"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Membership status">
            <select
              className="input"
              value={memberForm.status}
              onChange={(e) => setMemberForm({ ...memberForm, status: e.target.value })}
            >
              {["ACTIVE", "SUSPENDED", "REVOKED"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={memberForm.allBranches}
              onChange={(e) =>
                setMemberForm({
                  ...memberForm,
                  allBranches: e.target.checked,
                  branchIds: e.target.checked ? [] : memberForm.branchIds,
                })
              }
            />{" "}
            Access every branch
          </label>
          {!memberForm.allBranches ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {workspace.branches.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={memberForm.branchIds.includes(item.id)}
                    onChange={(e) =>
                      setMemberForm({
                        ...memberForm,
                        branchIds: e.target.checked
                          ? [...memberForm.branchIds, item.id]
                          : memberForm.branchIds.filter((id) => id !== item.id),
                      })
                    }
                  />
                  {item.name}
                </label>
              ))}
            </div>
          ) : null}
          {saveMember.error ? (
            <p className="text-sm text-rose-700">{errorMessage(saveMember.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={saveMember.isPending}>
            Save access
          </button>
        </form>
      </Dialog>
    </>
  );
}
export function OperationsPage({ branch }: { branch?: Branch | undefined }) {
  const client = useQueryClient();
  const [jobId, setJobId] = useState("");
  const notifications = useQuery({
    queryKey: ["notifications", branch?.id],
    queryFn: () => getData<Row>(`/notifications?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const markRead = useMutation({
    mutationFn: (notificationId: string) =>
      sendData("post", `/notifications/${notificationId}/read`),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const scan = useMutation({
    mutationFn: () =>
      sendData<Row>("post", "/jobs/notification-scans", {
        branchId: branch!.id,
        expiryDays: 30,
        idempotencyKey: idempotency("scan"),
      }),
    onSuccess: (job) => setJobId(text(job["id"])),
  });
  const process = useMutation({
    mutationFn: () => sendData("post", `/jobs/${jobId}/process`),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Jobs and notifications"
        description="Durable local PostgreSQL jobs, expiry scans, low-stock alerts, and export artifacts."
        actions={
          <button
            className="btn-primary"
            disabled={!branch || scan.isPending}
            onClick={() => scan.mutate()}
          >
            <ScanSearch size={17} /> Queue alert scan
          </button>
        }
      />
      {jobId ? (
        <div className="mb-5 flex items-center gap-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
          <BellRing size={18} />
          Job {jobId} queued.
          <button className="btn-secondary ml-auto" onClick={() => process.mutate()}>
            <RefreshCw size={15} /> Process locally
          </button>
        </div>
      ) : null}
      {scan.error || process.error || markRead.error ? (
        <div className="mb-5">
          <ErrorState error={scan.error ?? process.error ?? markRead.error} />
        </div>
      ) : null}
      <Card title="Notifications">
        {notifications.isLoading ? (
          <LoadingState />
        ) : notifications.error ? (
          <ErrorState error={notifications.error} />
        ) : (
          <SimpleTable
            rows={rows(notifications.data?.["items"])}
            columns={[
              { label: "Type", render: (row) => <StatusBadge value={text(row["type"])} /> },
              { label: "Title", render: (row) => text(row["title"]) },
              { label: "Message", render: (row) => text(row["message"]) },
              { label: "Created", render: (row) => date(row["createdAt"]) },
              {
                label: "Status",
                render: (row) => <StatusBadge value={row["readAt"] ? "READ" : "UNREAD"} />,
              },
              {
                label: "Actions",
                render: (row) =>
                  !row["readAt"] ? (
                    <button
                      className="btn-secondary"
                      onClick={() => markRead.mutate(text(row["id"]))}
                    >
                      Mark read
                    </button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}

export function TenantAuditPage() {
  const query = useQuery({
    queryKey: ["tenant-audit"],
    queryFn: () => getData<Row[]>("/tenant/audit?take=200"),
  });
  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Tenant audit trail"
        description="Append-only evidence for authentication, stock, sales, finance, staff, and branch actions."
      />
      <Card>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <SimpleTable
            rows={query.data ?? []}
            columns={[
              { label: "Time", render: (row) => date(row["createdAt"]) },
              {
                label: "Action",
                render: (row) => <span className="font-bold">{text(row["action"])}</span>,
              },
              {
                label: "Entity",
                render: (row) => `${text(row["entityType"])} Â· ${text(row["entityId"])}`,
              },
              { label: "Request", render: (row) => text(row["requestId"]) },
            ]}
          />
        )}
      </Card>
    </>
  );
}

export function AccountPage({
  principal,
  workspace,
}: {
  principal: TenantPrincipal;
  workspace: Workspace;
}) {
  const client = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    name: workspace.tenant.name,
    timezone: workspace.tenant.timezone,
    currencyCode: workspace.tenant.currencyCode,
    displayName: workspace.branding?.displayName ?? workspace.tenant.name,
    logoUrl: workspace.branding?.logoUrl ?? "",
    primaryColor: workspace.branding?.primaryColor ?? "#174C3F",
    accentColor: workspace.branding?.accentColor ?? "#B8F39A",
    invoiceFooter: workspace.branding?.invoiceFooter ?? "",
    supportContact: workspace.branding?.supportContact ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      sendData("put", "/tenant/settings", {
        ...form,
        logoUrl: form.logoUrl || undefined,
        invoiceFooter: form.invoiceFooter || undefined,
        supportContact: form.supportContact || undefined,
      }),
    onSuccess: async () => {
      setEdit(false);
      await client.invalidateQueries({ queryKey: ["tenant-workspace"] });
    },
  });
  const owner = principal.role === "OWNER";
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Workspace settings"
        description="Identity, subscription, organization settings, and tenant branding."
        actions={
          owner ? (
            <button className="btn-primary" onClick={() => setEdit(!edit)}>
              <Pencil size={16} /> Edit workspace
            </button>
          ) : undefined
        }
      />
      {edit ? (
        <Card
          title="Organization and branding"
          description="Changes apply to the tenant workspace and invoice identity."
          className="mb-6"
        >
          <form
            className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Organization name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Display name">
              <input
                className="input"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
              />
            </Field>
            <Field label="Timezone">
              <input
                className="input"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                required
              />
            </Field>
            <Field label="Currency code">
              <input
                className="input"
                maxLength={3}
                value={form.currencyCode}
                onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toUpperCase() })}
                required
              />
            </Field>
            <Field label="Primary color">
              <input
                className="input h-11"
                type="color"
                value={form.primaryColor}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
              />
            </Field>
            <Field label="Accent color">
              <input
                className="input h-11"
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
              />
            </Field>
            <Field label="Logo URL">
              <input
                className="input"
                type="url"
                value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
              />
            </Field>
            <Field label="Support contact">
              <input
                className="input"
                value={form.supportContact}
                onChange={(e) => setForm({ ...form, supportContact: e.target.value })}
              />
            </Field>
            <Field label="Invoice footer">
              <textarea
                className="input min-h-20"
                value={form.invoiceFooter}
                onChange={(e) => setForm({ ...form, invoiceFooter: e.target.value })}
              />
            </Field>
            {save.error ? (
              <p className="text-sm text-rose-700 md:col-span-2 xl:col-span-3">
                {errorMessage(save.error)}
              </p>
            ) : null}
            <div className="flex gap-2 md:col-span-2 xl:col-span-3">
              <button className="btn-primary" disabled={save.isPending}>
                Save workspace
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEdit(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Card>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Signed-in identity">
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
            <dt className="text-slate-500">Name</dt>
            <dd className="font-bold">{principal.fullName}</dd>
            <dt className="text-slate-500">Username</dt>
            <dd>{principal.username}</dd>
            <dt className="text-slate-500">Role</dt>
            <dd>
              <StatusBadge value={principal.role} />
            </dd>
            <dt className="text-slate-500">Access</dt>
            <dd>
              {principal.allBranches ? "All branches" : `${principal.branchIds.length} branches`}
            </dd>
          </dl>
        </Card>
        <Card title="Tenant subscription">
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
            <dt className="text-slate-500">Organization</dt>
            <dd className="font-bold">{workspace.tenant.name}</dd>
            <dt className="text-slate-500">Slug</dt>
            <dd>{workspace.tenant.slug}</dd>
            <dt className="text-slate-500">Status</dt>
            <dd>
              <StatusBadge value={workspace.tenant.status} />
            </dd>
            <dt className="text-slate-500">Plan</dt>
            <dd>{workspace.subscription?.planCode ?? workspace.tenant.planCode}</dd>
            <dt className="text-slate-500">Timezone</dt>
            <dd>{workspace.tenant.timezone}</dd>
            <dt className="text-slate-500">Currency</dt>
            <dd>{workspace.tenant.currencyCode}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
