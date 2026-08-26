import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Grid2X2,
  List,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  ScanSearch,
  Settings2,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { showToast } from "../components/toast";
import { brandChartPalette } from "../lib/chart-colors";
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHOD_OPTIONS,
  formatPaymentMethod,
  toPaymentMethod,
} from "../lib/payment-methods";
import type { Branch, TenantPrincipal, Workspace } from "../types";
import { appendSaleCartLine, calculateSaleCartTotals, type SaleCartLine } from "./sales-cart";
import { StaffAccountPage } from "../features/account/staff-account-page";

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
    : "-";

const productPackagingConfigs: Record<
  string,
  { baseUnit: string; counts: Array<{ key: string; label: string; defaultValue: string }> }
> = {
  tablets_capsules: {
    baseUnit: "tablet",
    counts: [
      {
        key: "unitsPerStrip",
        label: "Kiniinno halkii strip (Units per strip)",
        defaultValue: "10",
      },
      {
        key: "stripsPerSmallBox",
        label: "Strip-yada sanduuqa yar (Strips per small box)",
        defaultValue: "10",
      },
      {
        key: "boxesPerCarton",
        label: "Sanduuqyada yaryar kartoonkii (Small boxes per carton)",
        defaultValue: "1",
      },
    ],
  },
  syrups_liquids: {
    baseUnit: "bottle",
    counts: [
      {
        key: "bottlesPerBox",
        label: "Dhalooyin kartoonkii (Bottles per carton)",
        defaultValue: "1",
      },
    ],
  },
  injections: {
    baseUnit: "vial",
    counts: [
      { key: "vialsPerBox", label: "Vials/ampoules kartoonkii (Per carton)", defaultValue: "10" },
    ],
  },
  iv_fluids: {
    baseUnit: "bag",
    counts: [
      {
        key: "bagsPerBox",
        label: "Bacaha/dhalooyinka kartoonkii (Per carton)",
        defaultValue: "10",
      },
    ],
  },
  creams_ointments_gels: {
    baseUnit: "tube",
    counts: [
      { key: "tubesPerBox", label: "Tuubooyinka/weelasha sanduuqii (Per box)", defaultValue: "10" },
    ],
  },
  drops: {
    baseUnit: "bottle",
    counts: [
      {
        key: "bottlesPerBox",
        label: "Dhalooyin kartoonkii (Bottles per carton)",
        defaultValue: "10",
      },
    ],
  },
  baby_products: {
    baseUnit: "piece",
    counts: [
      { key: "packsPerBox", label: "Baakado kartoonkii (Packs per carton)", defaultValue: "10" },
      { key: "piecesPerPack", label: "Xabbo baakadkii (Pieces per pack)", defaultValue: "10" },
    ],
  },
  womens_products: {
    baseUnit: "pad",
    counts: [
      { key: "packsPerBox", label: "Baakado kartoonkii (Packs per carton)", defaultValue: "10" },
      { key: "padsPerPack", label: "Pads baakadkii (Pads per pack)", defaultValue: "10" },
    ],
  },
  medical_supplies: {
    baseUnit: "piece",
    counts: [
      { key: "piecesPerBox", label: "Xabbo sanduuqii (Pieces per box)", defaultValue: "10" },
    ],
  },
  supplements_vitamins: {
    baseUnit: "bottle",
    counts: [{ key: "bottlesPerBox", label: "Bottles/jars per box", defaultValue: "10" }],
  },
  dental_products: {
    baseUnit: "piece",
    counts: [{ key: "piecesPerBox", label: "Pieces/tubes per pack", defaultValue: "10" }],
  },
  laboratory_items: {
    baseUnit: "piece",
    counts: [
      { key: "piecesPerBox", label: "Xabbo sanduuqii (Pieces per box)", defaultValue: "10" },
    ],
  },
};
const initialProductCounts = Object.fromEntries(
  productPackagingConfigs.tablets_capsules!.counts.map((field) => [field.key, field.defaultValue]),
);
const productPackageOptions: Record<string, Array<{ code: string; label: string }>> = {
  tablets_capsules: [
    { code: "large_carton", label: "Large carton" },
    { code: "small_box", label: "Small box" },
    { code: "strip", label: "Strip" },
    { code: "unit", label: "Tablet/Capsule" },
  ],
  syrups_liquids: [
    { code: "carton", label: "Carton" },
    { code: "bottle", label: "Bottle" },
  ],
  injections: [
    { code: "carton", label: "Carton" },
    { code: "vial", label: "Vial/Ampoule" },
  ],
  iv_fluids: [
    { code: "carton", label: "Carton" },
    { code: "bag", label: "Bag/Bottle" },
  ],
  creams_ointments_gels: [
    { code: "box", label: "Box" },
    { code: "tube", label: "Tube/Jar" },
  ],
  drops: [
    { code: "carton", label: "Carton" },
    { code: "bottle", label: "Bottle" },
  ],
  baby_products: [
    { code: "carton", label: "Carton" },
    { code: "pack", label: "Pack" },
    { code: "piece", label: "Piece" },
  ],
  womens_products: [
    { code: "carton", label: "Carton" },
    { code: "pack", label: "Pack" },
    { code: "pad", label: "Pad" },
  ],
  medical_supplies: [
    { code: "box", label: "Box" },
    { code: "piece", label: "Piece" },
  ],
  supplements_vitamins: [
    { code: "box", label: "Box" },
    { code: "bottle", label: "Bottle/Jar" },
  ],
  dental_products: [
    { code: "pack", label: "Pack" },
    { code: "piece", label: "Piece/Tube" },
  ],
  laboratory_items: [
    { code: "box", label: "Box" },
    { code: "piece", label: "Piece" },
  ],
};
const initialProductPrices = Object.fromEntries(
  productPackageOptions.tablets_capsules!.map(({ code }) => [code, ""]),
);
function productFormPackageUnits(
  category: string,
  counts: Record<string, string>,
  packageCode: string,
) {
  const count = (key: string) => Math.max(1, Number(counts[key]) || 1);
  if (category === "tablets_capsules") {
    if (packageCode === "large_carton")
      return count("boxesPerCarton") * count("stripsPerSmallBox") * count("unitsPerStrip");
    if (packageCode === "small_box") return count("stripsPerSmallBox") * count("unitsPerStrip");
    if (packageCode === "strip") return count("unitsPerStrip");
    return 1;
  }
  if (category === "baby_products") {
    if (packageCode === "carton") return count("packsPerBox") * count("piecesPerPack");
    if (packageCode === "pack") return count("piecesPerPack");
    return 1;
  }
  if (category === "womens_products") {
    if (packageCode === "carton") return count("packsPerBox") * count("padsPerPack");
    if (packageCode === "pack") return count("padsPerPack");
    return 1;
  }
  const outerCode = productPackageOptions[category]?.[0]?.code;
  const outerCountKey = productPackagingConfigs[category]?.counts[0]?.key;
  return packageCode === outerCode && outerCountKey ? count(outerCountKey) : 1;
}
function aggregateSalesTrend(
  daily: Array<{ label: string; value: number }>,
  cadence: "daily" | "weekly" | "monthly",
) {
  if (cadence === "daily") return daily;
  const grouped = new Map<string, number>();
  for (const item of daily) {
    const dateValue = new Date(item.label + "T00:00:00");
    let label: string;
    if (cadence === "weekly") {
      const day = (dateValue.getDay() + 6) % 7;
      dateValue.setDate(dateValue.getDate() - day);
      label = "Week " + dateValue.toISOString().slice(0, 10);
    } else {
      label = dateValue.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    }
    grouped.set(label, (grouped.get(label) ?? 0) + item.value);
  }
  return Array.from(grouped, ([label, value]) => ({ label, value }));
}
export function DashboardPage({
  branch,
  workspace,
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
}) {
  const [range, setRange] = useState({ from: monthStart, to: today });
  const [salesCadence, setSalesCadence] = useState<"daily" | "weekly" | "monthly">("daily");
  const query = useQuery({
    queryKey: ["dashboard", branch?.id, range],
    queryFn: () =>
      getData<Row>(`/reports/dashboard?branchId=${branch!.id}&from=${range.from}&to=${range.to}`),
    enabled: Boolean(branch),
  });
  const notifications = useQuery({
    queryKey: ["notifications", branch?.id, "dashboard"],
    queryFn: () => getData<Row>(`/notifications?branchId=${branch!.id}`),
    enabled: Boolean(branch),
    refetchInterval: 60_000,
  });
  if (!branch)
    return (
      <EmptyState
        title="No branch is available"
        description="Ask an administrator to assign or create a branch."
      />
    );
  const cards = (query.data?.["cards"] ?? {}) as Row;
  const charts = (query.data?.["charts"] ?? {}) as Row;
  const dailySales = rows(charts["dailyNetSales"]).map((row) => ({
    label: text(row["label"]),
    value: Number(row["value"] ?? 0),
  }));
  const salesTrend = aggregateSalesTrend(dailySales, salesCadence);
  const chartColors = brandChartPalette(
    workspace.branding?.primaryColor,
    workspace.branding?.accentColor,
  );

  const topProducts = rows(charts["topProducts"]).map((row) => ({
    label: text(row["label"]),
    units: Number(row["units"] ?? 0),
  }));
  const topLabTests = rows(charts["topLabTests"]);
  const topSoldMedicines = rows(charts["topSoldMedicines"]);
  const alertItems = rows(notifications.data?.["items"]).filter((item) => !item["readAt"]);
  return (
    <>
      <PageHeader
        eyebrow={`${workspace.tenant.status}  |  ${workspace.tenant.planCode} plan`}
        title={`Maalin wanaagsan, ${workspace.branding?.displayName ?? workspace.tenant.name}`}
        description={`Xaaladda shaqada ee ${branch.name}: iibka, stock-ga, deymaha iyo digniinaha.`}
        actions={
          <div className="flex gap-2">
            <input
              aria-label="Laga bilaabo (From date)"
              className="input max-w-40"
              type="date"
              value={range.from}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
            <input
              aria-label="Ilaa (To date)"
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
              label="Iibka saafiga ah (Net sales)"
              value={money(cards["netSales"], workspace.tenant.currencyCode)}
            />
            <Stat
              label="Lacagta la qabtay (Collections)"
              value={money(cards["collected"], workspace.tenant.currencyCode)}
              tone="blue"
            />
            <Stat
              label="Deynta harsan (Receivables)"
              value={money(cards["receivables"], workspace.tenant.currencyCode)}
              tone="amber"
            />
            <Stat
              label="Stock-ga yar (Low stock)"
              value={text(cards["lowStockProducts"] ?? 0)}
              tone="rose"
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Today's patients" value={text(cards["patientsToday"] ?? 0)} tone="blue" />
            <Stat
              label="Patients waiting"
              value={text(cards["patientsWaiting"] ?? 0)}
              tone="amber"
            />
            <Stat
              label="Consultation revenue"
              value={money(cards["consultationRevenue"], workspace.tenant.currencyCode)}
            />
            <Stat
              label="Laboratory revenue"
              value={money(cards["labRevenue"], workspace.tenant.currencyCode)}
              tone="blue"
            />
            <Stat
              label="Pharmacy clinical revenue"
              value={money(cards["pharmacyRevenue"], workspace.tenant.currencyCode)}
            />
            <Stat
              label="Total clinical revenue"
              value={money(cards["totalRevenue"], workspace.tenant.currencyCode)}
              tone="emerald"
            />
            <Stat label="Completed visits" value={text(cards["completedVisits"] ?? 0)} />
            <Stat label="Lab tests performed" value={text(cards["labTestsPerformed"] ?? 0)} />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card
              title="Socodka iibka (Sales trend)"
              description="Switch between daily, weekly and monthly net sales."
            >
              <div className="flex justify-end gap-2 px-4 pt-4">
                {(["daily", "weekly", "monthly"] as const).map((cadence) => (
                  <button
                    key={cadence}
                    type="button"
                    className={salesCadence === cadence ? "btn-primary" : "btn-secondary"}
                    onClick={() => setSalesCadence(cadence)}
                  >
                    {cadence}
                  </button>
                ))}
              </div>
              {salesTrend.length ? (
                <div className="h-80 p-4 pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesTrend} margin={{ left: 4, right: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={54} />
                      <Tooltip formatter={(value) => money(value, workspace.tenant.currencyCode)} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        name="Net sales"
                        stroke={chartColors[0]}
                        fill={chartColors[1]}
                        strokeWidth={3}
                        isAnimationActive
                        animationDuration={800}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="Iib lama helin"
                  description="No sales exist in this date range."
                />
              )}
            </Card>
            <Card title="Alaabta ugu iibka badan" description="Top products by base units sold.">
              {topProducts.length ? (
                <div className="h-80 p-4 pt-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={topProducts}
                        dataKey="units"
                        nameKey="label"
                        cx="50%"
                        cy="46%"
                        innerRadius={58}
                        outerRadius={102}
                        paddingAngle={3}
                        isAnimationActive
                        animationDuration={900}
                      >
                        {topProducts.map((item, index) => (
                          <Cell
                            key={item.label}
                            fill={chartColors[index % chartColors.length] ?? "#047857"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [Number(value).toLocaleString(), "Base units sold"]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        wrapperStyle={{ fontSize: 11 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="Alaab lama iibin"
                  description="No product movement exists in this period."
                />
              )}
            </Card>
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card
              title="Top laboratory tests"
              description="Most frequently ordered tests in this period."
            >
              {topLabTests.length ? (
                <ol className="divide-y divide-slate-100 p-4">
                  {topLabTests.map((item, index) => (
                    <li
                      key={`${text(item["label"])}-${index}`}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span>
                        <strong className="mr-3 text-slate-400">{index + 1}</strong>
                        {text(item["label"])}
                      </span>
                      <StatusBadge value={`${text(item["count"])} orders`} />
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title="No lab tests"
                  description="No laboratory orders exist in this period."
                />
              )}
            </Card>
            <Card
              title="Top sold medicines"
              description="Most frequently sold medicines in this period."
            >
              {topSoldMedicines.length ? (
                <ol className="divide-y divide-slate-100 p-4">
                  {topSoldMedicines.map((item, index) => (
                    <li
                      key={`${text(item["label"])}-${index}`}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span>
                        <strong className="mr-3 text-slate-400">{index + 1}</strong>
                        {text(item["label"])}
                      </span>
                      <StatusBadge value={`${text(item["count"])} sales`} />
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  title="No medicine sales"
                  description="No sold medicines exist in this period."
                />
              )}
            </Card>
          </div>
          <div className="mt-6">
            <Card
              title="Digniinaha u baahan tallaabo"
              description="Low stock, expiring batches, and overdue debts refresh automatically."
            >
              {notifications.error ? (
                <ErrorState error={notifications.error} />
              ) : alertItems.length ? (
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {alertItems.slice(0, 6).map((item) => (
                    <div
                      key={text(item["id"])}
                      className="rounded-xl border border-amber-200 bg-amber-50 p-4"
                    >
                      <div className="flex items-start gap-3">
                        <BellRing className="mt-0.5 text-amber-700" size={18} />
                        <div>
                          <StatusBadge value={text(item["type"])} />
                          <p className="mt-2 font-bold text-slate-900">{text(item["title"])}</p>
                          <p className="mt-1 text-sm text-slate-600">{text(item["message"])}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Digniin furan ma jirto"
                  description="Stock and expiry alerts will appear here automatically."
                />
              )}
            </Card>
          </div>
        </>
      ) : null}
    </>
  );
}

export function ProductsPage({
  principal,
  branch,
}: {
  principal: TenantPrincipal;
  branch?: Branch | undefined;
}) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [branchProduct, setBranchProduct] = useState<Row | null>(null);
  const [branchConfig, setBranchConfig] = useState({
    active: true,
    minimumStockBaseUnits: "",
    reason: "",
  });
  const [archiveProduct, setArchiveProduct] = useState<Row | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
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
    counts: initialProductCounts,
    prices: initialProductPrices,
    basePrice: "0",
    openingPackageCode: "large_carton",
    openingPackageQuantity: "0",
    openingBatchNumber: "",
    openingExpiryDate: "",
    openingUnitCost: "0",
    openingSupplier: "",
    minimumStockBaseUnits: "0",
  });
  const query = useQuery({
    queryKey: ["products", search],
    queryFn: () => getData<Row[]>(`/products?q=${encodeURIComponent(search)}`),
  });
  const create = useMutation({
    mutationFn: async () => {
      const openingQuantity = Number(form.openingPackageQuantity) || 0;
      const minimumStock = Number(form.minimumStockBaseUnits) || 0;
      if (minimumStock > 0 && !branch) {
        throw new Error("Choose an active branch before setting a minimum stock alert");
      }
      if (openingQuantity > 0) {
        if (!branch) throw new Error("Choose an active branch before adding opening stock");
        if (!form.openingBatchNumber.trim()) throw new Error("Opening stock needs a batch number");
        if (!form.openingExpiryDate) throw new Error("Opening stock needs an expiry date");
        if (form.openingExpiryDate < today)
          throw new Error("Opening stock expiry date cannot be in the past");
      }
      const product = await sendData<Row>("post", "/products", {
        name: form.name,
        category: form.category,
        baseUnit: form.baseUnit,
        ...(form.sku ? { sku: form.sku } : {}),
        counts: Object.fromEntries(
          Object.entries(form.counts).map(([key, value]) => [key, Number(value)]),
        ),
        basePriceMinor: Math.round(Number(form.basePrice) * 100),
        explicitPricesMinor: Object.fromEntries(
          Object.entries(form.prices)
            .filter(([, value]) => value !== "")
            .map(([code, value]) => [code, Math.round(Number(value) * 100)]),
        ),
      });

      let openingStockError: string | undefined;
      let minimumStockError: string | undefined;
      if (minimumStock > 0 && branch) {
        try {
          await sendData("put", `/products/${text(product["id"])}/branch-config`, {
            branchId: branch.id,
            reorderPointBaseUnits: String(Math.floor(minimumStock)),
            reason: "Minimum stock configured during product registration",
          });
        } catch (error) {
          minimumStockError = errorMessage(error);
        }
      }
      if (openingQuantity > 0 && branch) {
        try {
          await sendData("post", "/inventory/receipts", {
            branchId: branch.id,
            supplierName: form.openingSupplier || undefined,
            idempotencyKey: idempotency("opening-stock"),
            lines: [
              {
                productId: text(product["id"]),
                packageCode: form.openingPackageCode,
                packageQuantity: openingQuantity,
                batchNumber: form.openingBatchNumber,
                expiryDate: form.openingExpiryDate,
                unitCost: form.openingUnitCost,
              },
            ],
          });
        } catch (error) {
          openingStockError = errorMessage(error);
        }
      }
      return { product, openingStockError, minimumStockError, openingQuantity };
    },
    onSuccess: async ({ openingStockError, minimumStockError, openingQuantity }) => {
      setOpen(false);
      setForm((current) => ({
        ...current,
        name: "",
        sku: "",
        openingPackageQuantity: "0",
        openingBatchNumber: "",
        openingExpiryDate: "",
        openingUnitCost: "0",
        openingSupplier: "",
        minimumStockBaseUnits: "0",
      }));
      await Promise.all([
        client.invalidateQueries({ queryKey: ["products"] }),
        client.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      if (openingStockError || minimumStockError) {
        showToast({
          title: "Product saved, but branch setup needs attention",
          message: [minimumStockError, openingStockError].filter(Boolean).join(" "),
          tone: "error",
        });
      } else {
        showToast({
          title: "Product saved successfully",
          message:
            openingQuantity > 0
              ? "The opening stock receipt was also posted to the active branch."
              : "You can receive stock later from Inventory.",
        });
      }
    },
  });
  const update = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Choose a product");
      return sendData("patch", `/products/${text(editing["id"])}`, {
        name: editForm.name,
        sku: editForm.sku || null,
        genericName: editForm.genericName || null,
        ...(["OWNER", "ADMIN"].includes(principal.role) ? { active: editForm.active } : {}),
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
  const saveBranchConfig = useMutation({
    mutationFn: () => {
      if (!branchProduct || !branch) throw new Error("Choose a product and active branch");
      if (!branchConfig.reason.trim()) throw new Error("Sababta (Reason) waa qasab");
      return sendData("put", `/products/${text(branchProduct["id"])}/branch-config`, {
        branchId: branch.id,
        active: branchConfig.active,
        ...(branchConfig.minimumStockBaseUnits !== ""
          ? {
              reorderPointBaseUnits: String(
                Math.max(0, Math.floor(Number(branchConfig.minimumStockBaseUnits) || 0)),
              ),
            }
          : {}),
        reason: branchConfig.reason,
      });
    },
    onSuccess: async () => {
      setBranchProduct(null);
      setBranchConfig({ active: true, minimumStockBaseUnits: "", reason: "" });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["products"] }),
        client.invalidateQueries({ queryKey: ["notifications"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
      showToast({
        title: "Branch settings saved",
        message: "Product access and minimum stock were updated.",
      });
    },
  });
  const archive = useMutation({
    mutationFn: () => {
      if (!archiveProduct) throw new Error("Choose a product");
      if (!archiveReason.trim()) throw new Error("Sababta archive-ka (Reason) waa qasab");
      return sendData("patch", `/products/${text(archiveProduct["id"])}`, {
        active: false,
        deactivationReason: archiveReason,
        expectedVersion: Number(archiveProduct["version"]),
      });
    },
    onSuccess: async () => {
      setArchiveProduct(null);
      setArchiveReason("");
      await client.invalidateQueries({ queryKey: ["products"] });
      showToast({
        title: "Product archived",
        message: "The record and its reason remain in the audit trail.",
      });
    },
  });
  const canManage = ["OWNER", "ADMIN", "PHARMACIST"].includes(principal.role);
  const canConfigureBranch = ["OWNER", "ADMIN"].includes(principal.role);
  const canArchiveGlobally = ["OWNER", "ADMIN"].includes(principal.role);
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
            <Field label="Magaca alaabta (Product name)">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Qaybta (Category)">
              <select
                className="input"
                value={form.category}
                onChange={(e) => {
                  const category = e.target.value;
                  const config = productPackagingConfigs[category]!;
                  setForm({
                    ...form,
                    category,
                    baseUnit: config.baseUnit,
                    counts: Object.fromEntries(
                      config.counts.map((field) => [field.key, field.defaultValue]),
                    ),
                    prices: Object.fromEntries(
                      productPackageOptions[category]!.map(({ code }) => [code, ""]),
                    ),
                    openingPackageCode: productPackageOptions[category]![0]!.code,
                  });
                }}
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
            <Field label="Summada SKU (SKU)">
              <input
                className="input"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            </Field>
            <Field label="Halbeegga aasaasiga ah (Base unit)">
              <input
                className="input"
                value={form.baseUnit}
                onChange={(e) => setForm({ ...form, baseUnit: e.target.value })}
                required
              />
            </Field>
            {productPackagingConfigs[form.category]!.counts.map((count) => (
              <Field key={count.key} label={count.label}>
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  value={form.counts[count.key] ?? count.defaultValue}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      counts: { ...form.counts, [count.key]: event.target.value },
                    })
                  }
                  required
                />
              </Field>
            ))}
            <div className="md:col-span-2 xl:col-span-4">
              <p className="text-sm font-bold text-slate-900">
                Qiimaha iibka baakad kasta (Selling prices by package)
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Enter the exact selling price for every package you want to sell. Empty prices are
                derived from the base price where possible.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {productPackageOptions[form.category]!.map((item) => (
                  <Field key={item.code} label={`${item.label} price`}>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.prices[item.code] ?? ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          prices: { ...form.prices, [item.code]: event.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
            <Field label="Qiimaha halbeegga (Base-unit fallback price)">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.basePrice}
                onChange={(e) => setForm({ ...form, basePrice: e.target.value })}
              />
            </Field>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 md:col-span-2 xl:col-span-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-950">
                    Stock-ga bilowga ah (Opening stock - optional)
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Add the first batch to {branch?.name ?? "the active branch"}. Enter quantity as
                    packages, not base units.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-800">
                  {branch?.name ?? "No branch selected"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <Field label="Nooca baakadka (Receiving package)">
                  <select
                    className="input"
                    value={form.openingPackageCode}
                    onChange={(event) =>
                      setForm({ ...form, openingPackageCode: event.target.value })
                    }
                  >
                    {productPackageOptions[form.category]!.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tirada bilowga (Opening package quantity)">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={form.openingPackageQuantity}
                    onChange={(event) =>
                      setForm({ ...form, openingPackageQuantity: event.target.value })
                    }
                  />
                </Field>{" "}
                <Field label="Heerka digniinta stock-ga (Minimum stock - base units)">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="1"
                    value={form.minimumStockBaseUnits}
                    onChange={(event) =>
                      setForm({ ...form, minimumStockBaseUnits: event.target.value })
                    }
                  />
                </Field>
                <Field label="Lambarka batch-ka (Batch number)">
                  <input
                    className="input"
                    value={form.openingBatchNumber}
                    onChange={(event) =>
                      setForm({ ...form, openingBatchNumber: event.target.value })
                    }
                    required={Number(form.openingPackageQuantity) > 0}
                  />
                </Field>
                <Field label="Taariikhda dhicitaanka (Expiry date)">
                  <input
                    className="input"
                    type="date"
                    min={today}
                    value={form.openingExpiryDate}
                    onChange={(event) =>
                      setForm({ ...form, openingExpiryDate: event.target.value })
                    }
                    required={Number(form.openingPackageQuantity) > 0}
                  />
                </Field>
                <Field label="Qiimaha hal unit (Cost per base unit)">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={form.openingUnitCost}
                    onChange={(event) => setForm({ ...form, openingUnitCost: event.target.value })}
                    required={Number(form.openingPackageQuantity) > 0}
                  />
                </Field>
                <Field label="Alaab-qeybiyaha (Supplier)">
                  <input
                    className="input"
                    value={form.openingSupplier}
                    onChange={(event) => setForm({ ...form, openingSupplier: event.target.value })}
                  />
                </Field>
              </div>
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-emerald-900">
                1 {form.openingPackageCode.replaceAll("_", " ")} ={" "}
                {productFormPackageUnits(form.category, form.counts, form.openingPackageCode)} base
                units. This receipt will add{" "}
                {productFormPackageUnits(form.category, form.counts, form.openingPackageCode) *
                  (Number(form.openingPackageQuantity) || 0)}{" "}
                base units.
              </p>
            </div>
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
            placeholder="Raadi alaab, SKU, ama barcode (Search product)"
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
                label: "Packages and prices",
                render: (row) => (
                  <div className="flex max-w-xl flex-wrap gap-2">
                    {rows(row["packages"]).map((pack) => (
                      <span
                        key={text(pack["id"])}
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${pack["salePrice"] === null ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
                      >
                        {text(pack["label"] ?? pack["code"])}:{" "}
                        {pack["salePrice"] === null ? "Price required" : text(pack["salePrice"])}
                      </span>
                    ))}
                  </div>
                ),
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
                        <div className="flex flex-wrap gap-2">
                          <button className="btn-secondary" onClick={() => beginEdit(row)}>
                            <Pencil size={15} /> Wax ka beddel (Edit)
                          </button>
                          {canConfigureBranch ? (
                            <button
                              className="btn-secondary"
                              disabled={!branch}
                              onClick={() => {
                                setBranchProduct(row);
                                setBranchConfig({
                                  active: true,
                                  minimumStockBaseUnits: "",
                                  reason: "",
                                });
                              }}
                            >
                              <Settings2 size={15} /> Branch settings
                            </button>
                          ) : null}
                          {canArchiveGlobally && row["active"] !== false ? (
                            <button className="btn-danger" onClick={() => setArchiveProduct(row)}>
                              <Trash2 size={15} /> Archive
                            </button>
                          ) : null}
                        </div>
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
            <Field label="Magaca alaabta (Product name)">
              <input
                className="input"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Summada SKU (SKU)">
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
            {canArchiveGlobally ? (
              <Field label="Xaaladda guud (Global status)">
                <select
                  className="input"
                  value={editForm.active ? "ACTIVE" : "INACTIVE"}
                  onChange={(e) =>
                    setEditForm({ ...editForm, active: e.target.value === "ACTIVE" })
                  }
                >
                  <option>ACTIVE</option>
                  <option>INACTIVE</option>
                </select>
              </Field>
            ) : null}
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
      <Dialog
        open={Boolean(branchProduct)}
        title="Dejinta product-ka branch-ka (Branch product settings)"
        description={`Enable or disable this product at ${branch?.name ?? "the active branch"}, and set its low-stock threshold.`}
        onClose={() => setBranchProduct(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveBranchConfig.mutate();
          }}
        >
          <Field label="Xaaladda branch-ka (Branch status)">
            <select
              className="input"
              value={branchConfig.active ? "ACTIVE" : "INACTIVE"}
              onChange={(event) =>
                setBranchConfig({ ...branchConfig, active: event.target.value === "ACTIVE" })
              }
            >
              <option value="ACTIVE">Firfircoon (Active)</option>
              <option value="INACTIVE">La joojiyey (Inactive)</option>
            </select>
          </Field>
          <Field label="Heerka digniinta stock-ga (Minimum stock - base units)">
            <input
              className="input"
              type="number"
              min="0"
              step="1"
              placeholder="Tusaale: 20"
              value={branchConfig.minimumStockBaseUnits}
              onChange={(event) =>
                setBranchConfig({ ...branchConfig, minimumStockBaseUnits: event.target.value })
              }
            />
          </Field>
          <Field label="Sababta isbeddelka (Reason)">
            <textarea
              className="input min-h-24"
              value={branchConfig.reason}
              onChange={(event) => setBranchConfig({ ...branchConfig, reason: event.target.value })}
              required
            />
          </Field>
          {saveBranchConfig.error ? (
            <p className="text-sm text-rose-700">{errorMessage(saveBranchConfig.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setBranchProduct(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saveBranchConfig.isPending}>
              Save branch settings
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(archiveProduct)}
        title="Archive product"
        description="This safely removes the product from future use without deleting sales, stock, or audit history."
        onClose={() => setArchiveProduct(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            archive.mutate();
          }}
        >
          <Field label="Sababta archive-ka (Reason)">
            <textarea
              className="input min-h-24"
              value={archiveReason}
              onChange={(event) => setArchiveReason(event.target.value)}
              required
            />
          </Field>
          {archive.error ? (
            <p className="text-sm text-rose-700">{errorMessage(archive.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setArchiveProduct(null)}>
              Cancel
            </button>
            <button className="btn-danger" disabled={archive.isPending}>
              Archive product
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
    supplierId: "",
    referenceNumber: "",
    receiptBatchMode: "NEW",
    existingBatchId: "",
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
  const suppliers = useQuery({
    queryKey: ["suppliers", "inventory-form"],
    queryFn: () => getData<Row[]>("/suppliers"),
    enabled: principal.role !== "RECEPTIONIST",
  });
  const query = useQuery({
    queryKey: ["inventory", tab, branch?.id],
    queryFn: () => getData<Row[]>(`/inventory/${tab}?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const receiptStock = useQuery({
    queryKey: ["inventory", "receipt-batches", branch?.id],
    queryFn: () => getData<Row[]>(`/inventory/stock?branchId=${branch!.id}`),
    enabled: Boolean(branch) && action === "receipt",
  });
  const operation = useMutation({
    mutationFn: () => {
      if (action === "receipt")
        return sendData("post", "/inventory/receipts", {
          branchId: branch!.id,
          supplierId: form.supplierId || undefined,
          supplierName: form.supplierName || undefined,
          referenceNumber: form.referenceNumber || undefined,
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
      const completedAction = action;
      setAction(null);
      setSelectedBatch(null);
      setForm((current) =>
        completedAction === "receipt"
          ? {
              ...current,
              productId: "",
              packageCode: "",
              packageQuantity: "1",
              batchNumber: "",
              expiryDate: "",
              unitCost: "0",
              supplierName: "",
              referenceNumber: "",
              receiptBatchMode: "NEW",
              existingBatchId: "",
            }
          : { ...current, reason: "", notes: "", quantityBaseUnits: "1" },
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ["inventory"] }),
        client.invalidateQueries({ queryKey: ["products"] }),
      ]);
      showToast({
        title: completedAction === "receipt" ? "Stock received successfully" : "Inventory updated",
        ...(completedAction === "receipt"
          ? { message: "The batch and sellable branch stock are now available in Sales." }
          : {}),
      });
    },
  });
  const receiptProduct = (products.data ?? []).find(
    (product) => text(product["id"]) === form.productId,
  );
  const receiptPackages = rows(receiptProduct?.["packages"]);
  const receiptExistingBatches = (receiptStock.data ?? []).filter((batch) => {
    const product = batch["product"] as Row | undefined;
    return (
      text(product?.["id"] ?? batch["productId"]) === form.productId &&
      text(batch["expiryDate"]).slice(0, 10) >= today
    );
  });
  const receiptPackage = receiptPackages.find(
    (packaging) => text(packaging["code"]) === form.packageCode,
  );
  const receiptBaseUnits =
    Number(receiptPackage?.["unitsPerPackage"] ?? 0) * (Number(form.packageQuantity) || 0);
  const sellableStockBaseUnits = (query.data ?? []).reduce(
    (total, batch) =>
      text(batch["expiryDate"]).slice(0, 10) >= today
        ? total + Number(batch["quantityOnHand"] ?? 0)
        : total,
    0,
  );
  const expiredStockBaseUnits = (query.data ?? []).reduce(
    (total, batch) =>
      text(batch["expiryDate"]).slice(0, 10) < today
        ? total + Number(batch["quantityOnHand"] ?? 0)
        : total,
    0,
  );
  if (!branch) return <EmptyState title="Choose a branch" />;
  const canManage = ["OWNER", "ADMIN", "PHARMACIST"].includes(principal.role);

  const openBatchAction = (next: "adjust" | "expiry" | "transfer", row: Row) => {
    if (next === "transfer" && text(row["expiryDate"]).slice(0, 10) < today) {
      showToast({
        title: "Expired stock cannot be transferred",
        message: "Daawada dhacday waa in Write off lagu sameeyo; branch kale looma wareejin karo.",
        tone: "error",
      });
      return;
    }
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
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
              Sellable: {sellableStockBaseUnits.toLocaleString()} base units
            </span>
            {expiredStockBaseUnits > 0 ? (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                Expired: {expiredStockBaseUnits.toLocaleString()} base units
              </span>
            ) : null}
            <span className="text-slate-500">{branch.name}</span>
          </div>
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
                    {
                      label: "Expiry status",
                      render: (row) => {
                        const expired = text(row["expiryDate"]).slice(0, 10) < today;
                        return (
                          <div>
                            <p>{date(row["expiryDate"])}</p>
                            <div className="mt-1">
                              <StatusBadge value={expired ? "EXPIRED" : "SELLABLE"} />
                            </div>
                          </div>
                        );
                      },
                    },
                    { label: "Base units on hand", render: (row) => text(row["quantityOnHand"]) },
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
                                  disabled={text(row["expiryDate"]).slice(0, 10) < today}
                                  title={
                                    text(row["expiryDate"]).slice(0, 10) < today
                                      ? "Expired medicine cannot be transferred"
                                      : "Transfer to another branch"
                                  }
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
          <Field label="Alaabta (Product)">
            <select
              className="input"
              value={form.productId}
              onChange={(event) => {
                const product = (products.data ?? []).find(
                  (item) => text(item["id"]) === event.target.value,
                );
                const firstPackage = rows(product?.["packages"])[0];
                setForm((current) => ({
                  ...current,
                  productId: event.target.value,
                  packageCode: firstPackage ? text(firstPackage["code"]) : "",
                  receiptBatchMode: "NEW",
                  existingBatchId: "",
                  batchNumber: "",
                  expiryDate: "",
                }));
              }}
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
          <Field label="Nooca baakadka (Receiving package)">
            <select
              className="input"
              value={form.packageCode}
              onChange={(event) => setForm({ ...form, packageCode: event.target.value })}
              required
              disabled={!receiptPackages.length}
            >
              <option value="">Select package</option>
              {receiptPackages.map((packaging) => (
                <option key={text(packaging["code"])} value={text(packaging["code"])}>
                  {text(packaging["label"] ?? packaging["code"])} -{" "}
                  {text(packaging["unitsPerPackage"])} base units
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tirada baakadaha (Package quantity)">
            <input
              className="input"
              type="number"
              min="1"
              value={form.packageQuantity}
              onChange={(e) => setForm({ ...form, packageQuantity: e.target.value })}
              required
            />
          </Field>
          <Field label="Qiimaha hal unit (Cost per base unit)">
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
          <Field label="Doorashada batch-ka (Batch choice)">
            <select
              className="input"
              value={form.receiptBatchMode === "NEW" ? "NEW" : form.existingBatchId}
              onChange={(event) => {
                const batchId = event.target.value;
                if (batchId === "NEW") {
                  setForm((current) => ({
                    ...current,
                    receiptBatchMode: "NEW",
                    existingBatchId: "",
                    batchNumber: "",
                    expiryDate: "",
                  }));
                  return;
                }
                const batch = receiptExistingBatches.find((item) => text(item["id"]) === batchId);
                setForm((current) => ({
                  ...current,
                  receiptBatchMode: "EXISTING",
                  existingBatchId: batchId,
                  batchNumber: text(batch?.["batchNumber"]),
                  expiryDate: text(batch?.["expiryDate"]).slice(0, 10),
                  unitCost: batch?.["unitCost"] ? text(batch["unitCost"]) : current.unitCost,
                }));
              }}
              disabled={!form.productId || receiptStock.isLoading}
            >
              <option value="NEW">New batch</option>
              {receiptExistingBatches.map((batch) => (
                <option key={text(batch["id"])} value={text(batch["id"])}>
                  {text(batch["batchNumber"])} | expires {text(batch["expiryDate"]).slice(0, 10)} |{" "}
                  {text(batch["quantityOnHand"])} units on hand
                </option>
              ))}
            </select>
          </Field>
          <Field label="Lambarka batch-ka (Batch number)">
            <input
              className="input"
              value={form.batchNumber}
              onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
              readOnly={form.receiptBatchMode === "EXISTING"}
              required
            />
          </Field>
          <Field label="Taariikhda dhicitaanka (Expiry date)">
            <input
              className="input"
              type="date"
              min={today}
              value={form.expiryDate}
              onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
              readOnly={form.receiptBatchMode === "EXISTING"}
              required
            />
          </Field>
          <Field label="Alaab-qeybiyaha (Supplier)">
            <select
              className="input"
              value={form.supplierId}
              onChange={(event) => {
                const supplier = (suppliers.data ?? []).find(
                  (item) => text(item["id"]) === event.target.value,
                );
                setForm({
                  ...form,
                  supplierId: event.target.value,
                  supplierName: text(supplier?.["name"]),
                });
              }}
            >
              <option value="">No registered supplier</option>
              {(suppliers.data ?? [])
                .filter((item) => item["active"] !== false)
                .map((item) => (
                  <option key={text(item["id"])} value={text(item["id"])}>
                    {text(item["name"])}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Tixraaca supplier-ka (Supplier reference)">
            <input
              className="input"
              value={form.referenceNumber}
              onChange={(event) => setForm({ ...form, referenceNumber: event.target.value })}
            />
          </Field>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm md:col-span-2 xl:col-span-4">
            {receiptPackage ? (
              <p className="font-semibold text-emerald-950">
                1 {text(receiptPackage["label"])} = {text(receiptPackage["unitsPerPackage"])} base
                units. This receipt will add <strong>{receiptBaseUnits.toLocaleString()}</strong>{" "}
                base units to {branch.name}.
              </p>
            ) : (
              <p className="text-emerald-900">Choose a product and receiving package.</p>
            )}
          </div>
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
            ? `${text((selectedBatch["product"] as Row | undefined)?.["name"])}  |  batch ${text(selectedBatch["batchNumber"])}`
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
            <Field label="Jihada dhaqdhaqaaqa (Direction)">
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
            <Field label="Tirada halbeegga aasaasiga ah (Quantity in base units)">
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
            <Field label="Branch-ka loo wareejinayo (Destination branch)">
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
  const [salesSearch, setSalesSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productView, setProductView] = useState<"grid" | "list">("list");
  const [productPage, setProductPage] = useState(1);
  const [linkedClinicVisitId, setLinkedClinicVisitId] = useState("");
  const [saleAction, setSaleAction] = useState<"details" | "payment" | "return" | "void" | null>(
    null,
  );
  const [actionForm, setActionForm] = useState({
    amount: "",
    method: DEFAULT_PAYMENT_METHOD,
    transactionReference: "",
    reason: "",
    saleItemId: "",
    quantityBaseUnits: "1",
  });
  const [cart, setCart] = useState<SaleCartLine[]>([]);
  const [form, setForm] = useState({
    customerId: "",
    customerName: "Walk-in Customer",
    customerPhone: "",
    productId: "",
    packageCode: "unit",
    quantity: "1",
    amountPaid: "0",
    paymentMethod: DEFAULT_PAYMENT_METHOD,
    paymentReference: "",
    discount: "0",
  });
  const products = useQuery({
    queryKey: ["products", "checkout"],
    queryFn: () => getData<Row[]>("/products"),
  });
  const customers = useQuery({
    queryKey: ["customers", "checkout"],
    queryFn: () => getData<Row[]>("/customers"),
  });
  const inventoryStock = useQuery({
    queryKey: ["inventory", "sales-stock", branch?.id],
    queryFn: () => getData<Row[]>(`/inventory/stock?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const sales = useQuery({
    queryKey: ["sales", branch?.id, salesSearch],
    queryFn: () =>
      getData<Row[]>(`/sales?branchId=${branch!.id}&q=${encodeURIComponent(salesSearch)}`),
    enabled: Boolean(branch),
  });
  const clinicVisits = useQuery({
    queryKey: ["pharmacy-clinic-visits", branch?.id],
    queryFn: () => getData<Row[]>("/clinic/visits?branchId=" + branch!.id),
    enabled: Boolean(branch) && ["OWNER", "ADMIN", "PHARMACIST"].includes(principal.role),
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
          externalReference: actionForm.transactionReference.trim() || undefined,
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
        transactionReference: "",
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
      sendData<Row>("post", "/sales", {
        branchId: branch!.id,
        customerId: form.customerId || undefined,
        clinicVisitId: linkedClinicVisitId || undefined,
        customerName: form.customerName,
        customerPhone: form.customerPhone || undefined,
        discount: form.discount,
        amountPaid: form.amountPaid,
        ...(Number(form.amountPaid) > 0 ? { paymentMethod: form.paymentMethod } : {}),
        ...(Number(form.amountPaid) > 0 && form.paymentReference.trim()
          ? { paymentReference: form.paymentReference.trim() }
          : {}),
        idempotencyKey: idempotency("sale"),
        lines: cart.map(({ productId, packageCode, packageQuantity }) => ({
          productId,
          packageCode,
          packageQuantity,
        })),
      }),
    onSuccess: async (sale) => {
      setSelectedSale(sale);
      setSaleAction("details");
      setForm({
        ...form,
        customerId: "",
        customerName: "Walk-in Customer",
        customerPhone: "",
        amountPaid: "0",
        paymentReference: "",
        discount: "0",
      });
      setCart([]);
      setLinkedClinicVisitId("");
      showToast({
        title: "Sale completed successfully",
        message: "Stock and invoice records were updated.",
      });
      await client.invalidateQueries({ queryKey: ["sales"] });
    },
  });
  const selected = (products.data ?? []).find((item) => text(item["id"]) === form.productId);
  const packages = rows(selected?.["packages"]);
  const selectedPackage = packages.find((item) => text(item["code"]) === form.packageCode);
  const normalizedProductSearch = productSearch.trim().toLowerCase();
  const filteredProducts = (products.data ?? []).filter((item) =>
    [item["name"], item["sku"], item["barcode"], item["category"]].some((value) =>
      text(value).toLowerCase().includes(normalizedProductSearch),
    ),
  );
  const productsPerPage = productView === "grid" ? 6 : 5;
  const productPageCount = Math.max(1, Math.ceil(filteredProducts.length / productsPerPage));
  const visibleProducts = filteredProducts.slice(
    (productPage - 1) * productsPerPage,
    productPage * productsPerPage,
  );
  const stockSummaryForProduct = (productId: string) =>
    (inventoryStock.data ?? []).reduce<{ sellable: number; expired: number }>(
      (summary, batch) => {
        const batchProduct = batch["product"] as Row | undefined;
        const batchProductId = text(batch["productId"] ?? batchProduct?.["id"]);
        if (batchProductId !== productId) return summary;
        const quantity = Number(batch["quantityOnHand"] ?? 0);
        if (text(batch["expiryDate"]).slice(0, 10) < today) summary.expired += quantity;
        else summary.sellable += quantity;
        return summary;
      },
      { sellable: 0, expired: 0 },
    );
  const reservedBaseUnitsForProduct = (productId: string) =>
    cart.reduce(
      (total, line) =>
        line.productId === productId
          ? total + Number(line.unitsPerPackage) * line.packageQuantity
          : total,
      0,
    );
  const chooseProduct = (product: Row, packageCode?: string) => {
    const productPackages = rows(product["packages"]);
    const preferredPackage = packageCode
      ? productPackages.find((item) => text(item["code"]) === packageCode)
      : (productPackages.find((item) => text(item["unitsPerPackage"]) === "1") ??
        productPackages[0]);
    setForm((current) => ({
      ...current,
      productId: text(product["id"]),
      packageCode: preferredPackage ? text(preferredPackage["code"]) : "",
    }));
  };
  const {
    subtotal: cartTotal,
    grandTotal,
    balanceDue,
    changeDue,
  } = calculateSaleCartTotals(cart, form.discount, form.amountPaid);
  const debtCustomerMissing =
    balanceDue > 0 &&
    (!form.customerPhone.trim() ||
      !form.customerName.trim() ||
      form.customerName.trim().toLowerCase() === "walk-in customer");
  const selectedProductId = text(selected?.["id"]);
  const selectedStock = stockSummaryForProduct(selectedProductId);
  const selectedReserved = reservedBaseUnitsForProduct(selectedProductId);
  const selectedAvailableBaseUnits = Math.max(0, selectedStock.sellable - selectedReserved);
  const selectedRequiredBaseUnits =
    Number(selectedPackage?.["unitsPerPackage"] ?? 0) * (Number(form.quantity) || 0);
  const addCartItem = () => {
    if (!selected || !selectedPackage || Number(form.quantity) < 1) {
      showToast({ title: "Choose a product, package, and quantity", tone: "error" });
      return;
    }
    if (selectedPackage["salePrice"] === null || selectedPackage["salePrice"] === undefined) {
      showToast({
        title: "Package price is missing",
        message: "Set this package price on the Products page before selling it.",
        tone: "error",
      });
      return;
    }
    if (selectedRequiredBaseUnits > selectedAvailableBaseUnits) {
      showToast({
        title: "Not enough sellable stock",
        message: `This line needs ${selectedRequiredBaseUnits} base units, but only ${selectedAvailableBaseUnits} unexpired units remain after the cart.`,
        tone: "error",
      });
      return;
    }
    const productId = text(selected["id"]);

    setCart((current) =>
      appendSaleCartLine(current, {
        productId,
        productName: text(selected["name"]),
        packageCode: text(selectedPackage["code"]),
        packageLabel: text(selectedPackage["label"]),
        packageQuantity: Number(form.quantity),
        unitPrice: Number(selectedPackage["salePrice"]),
        unitsPerPackage: text(selectedPackage["unitsPerPackage"]),
      }),
    );
    setForm((current) => ({
      ...current,
      productId: "",
      packageCode: "",
      quantity: "1",
    }));
  };
  if (!branch) return <EmptyState title="Choose a branch" />;
  const invoicesOnly = window.location.pathname === "/invoices";
  return (
    <>
      <PageHeader
        eyebrow={invoicesOnly ? "Pharmacy records" : "Point of sale"}
        title={invoicesOnly ? "Invoices" : "Pharmacy sales"}
        description={
          invoicesOnly
            ? "Search, view, collect balances, and print pharmacy invoices."
            : "Select medicines, receive payment, and complete a pharmacy sale."
        }
      />
      <div className="space-y-6">
        {!invoicesOnly && principal.role !== "LAB_TECHNICIAN" ? (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (debtCustomerMissing) {
                showToast({
                  title: "Customer details required",
                  message:
                    "Sale aan si buuxda loo bixin wuxuu u baahan yahay magaca iyo telefoonka macmiilka.",
                  tone: "error",
                });
                return;
              }
              checkout.mutate();
            }}
          >
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="grid items-end gap-4 lg:grid-cols-[1fr_auto]">
                <Field
                  label="Link clinic visit (optional)"
                  hint="Use only for visit reporting. The pharmacist reads any medicines from the patient's physical paper."
                >
                  <select
                    className="input"
                    value={linkedClinicVisitId}
                    onChange={(event) => {
                      const visit = (clinicVisits.data ?? []).find(
                        (item) => text(item["id"]) === event.target.value,
                      );
                      const patient = (visit?.["patient"] ?? {}) as Row;
                      setLinkedClinicVisitId(event.target.value);
                      setForm((current) => ({
                        ...current,
                        customerName: visit ? text(patient["name"]) : "Walk-in Customer",
                        customerPhone: visit ? text(patient["phone"]) : "",
                      }));
                    }}
                  >
                    <option value="">Normal walk-in sale</option>
                    {(clinicVisits.data ?? []).map((visit) => {
                      const patient = (visit["patient"] ?? {}) as Row;
                      return (
                        <option key={text(visit["id"])} value={text(visit["id"])}>
                          {text(patient["patientNumber"])} · {text(patient["name"])} ·{" "}
                          {text(visit["visitNumber"])}
                        </option>
                      );
                    })}
                  </select>
                </Field>
                {linkedClinicVisitId ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setLinkedClinicVisitId("")}
                  >
                    Remove visit link
                  </button>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_0.8fr_0.8fr]">
                <Field label="Buugga macmiilka (Customer account)">
                  <select
                    className="input"
                    value={form.customerId}
                    onChange={(event) => {
                      const customer = (customers.data ?? []).find(
                        (item) => text(item["id"]) === event.target.value,
                      );
                      setForm((current) => ({
                        ...current,
                        customerId: event.target.value,
                        customerName: customer ? text(customer["name"]) : "Walk-in Customer",
                        customerPhone: customer ? text(customer["phone"]) : "",
                      }));
                    }}
                  >
                    <option value="">Walk-in / manual customer</option>
                    {(customers.data ?? [])
                      .filter((item) => item["active"] !== false)
                      .map((item) => (
                        <option key={text(item["id"])} value={text(item["id"])}>
                          {text(item["name"])} · {text(item["phone"])} · debt{" "}
                          {money(item["outstandingBalance"], workspace.tenant.currencyCode)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Magaca macmiilka (Customer name)">
                  <input
                    className="input"
                    value={form.customerName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, customerName: event.target.value }))
                    }
                    required
                  />
                </Field>
                <Field
                  label={
                    balanceDue > 0
                      ? "Telefoonka macmiilka (Required for debt)"
                      : "Telefoonka macmiilka (Customer phone)"
                  }
                >
                  <input
                    className="input"
                    placeholder={
                      balanceDue > 0
                        ? "Telefoonka waa qasab (Required)"
                        : "Telefoon ikhtiyaari ah (Optional phone)"
                    }
                    required={balanceDue > 0}
                    value={form.customerPhone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, customerPhone: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Taariikhda iyo waqtiga (Date and time)">
                  <div className="input flex min-h-[42px] items-center bg-slate-50 text-sm text-slate-600">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date())}
                  </div>
                </Field>
                <Field label="Lambarka qaansheegta (Invoice number)">
                  <div className="input flex min-h-[42px] items-center bg-slate-50 text-sm text-slate-500">
                    Generated at checkout
                  </div>
                </Field>
              </div>
            </section>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
                        Medicine browser
                      </p>
                      <h2 className="mt-1 text-xl font-extrabold text-slate-950">
                        Select products
                      </h2>
                    </div>
                    <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        aria-label="List view"
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 ${productView === "list" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-white"}`}
                        onClick={() => {
                          setProductView("list");
                          setProductPage(1);
                        }}
                      >
                        <List size={18} /> <span className="hidden sm:inline">List</span>
                      </button>
                      <button
                        type="button"
                        aria-label="Grid view"
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 ${productView === "grid" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:bg-white"}`}
                        onClick={() => {
                          setProductView("grid");
                          setProductPage(1);
                        }}
                      >
                        <Grid2X2 size={17} /> <span className="hidden sm:inline">Grid</span>
                      </button>
                    </div>
                  </div>
                  <label className="relative block">
                    <span className="sr-only">Search products</span>
                    <Search
                      size={18}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      className="input pl-10"
                      placeholder="Raadi daawo, SKU, barcode ama qayb (Search medicine)"
                      value={productSearch}
                      onChange={(event) => {
                        setProductSearch(event.target.value);
                        setProductPage(1);
                      }}
                    />
                  </label>
                </div>

                <div className="p-4 sm:p-5">
                  {products.isLoading ? (
                    <LoadingState />
                  ) : products.error ? (
                    <ErrorState error={products.error} />
                  ) : visibleProducts.length ? (
                    <div
                      className={
                        productView === "grid"
                          ? "grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
                          : "space-y-3"
                      }
                    >
                      {visibleProducts.map((product) => {
                        const productId = text(product["id"]);
                        const productPackages = rows(product["packages"]);
                        const productStock = stockSummaryForProduct(productId);
                        const productReserved = reservedBaseUnitsForProduct(productId);
                        const productAvailable = Math.max(
                          0,
                          productStock.sellable - productReserved,
                        );
                        const isSelected = form.productId === productId;
                        return (
                          <article
                            key={productId}
                            className={`rounded-2xl border p-4 transition ${isSelected ? "border-emerald-500 bg-emerald-50/70 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-emerald-300 hover:shadow-md"} ${productView === "list" ? "sm:flex sm:items-center sm:justify-between sm:gap-5" : ""}`}
                          >
                            <button
                              type="button"
                              className="block min-w-0 flex-1 text-left"
                              onClick={() => chooseProduct(product)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="truncate font-extrabold text-slate-950">
                                    {text(product["name"])}
                                  </h3>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {text(product["sku"])} | {productAvailable.toLocaleString()}{" "}
                                    sellable base units
                                    {productStock.expired > 0
                                      ? ` | ${productStock.expired.toLocaleString()} expired`
                                      : ""}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                                  {text(product["category"]).replaceAll("_", " ")}
                                </span>
                              </div>
                            </button>
                            <div
                              className={`mt-4 flex flex-wrap gap-2 ${productView === "list" ? "sm:mt-0 sm:max-w-[55%] sm:justify-end" : ""}`}
                            >
                              {productPackages.map((pack) => {
                                const packageCode = text(pack["code"]);
                                const priceMissing =
                                  pack["salePrice"] === null || pack["salePrice"] === undefined;
                                const packageUnits = Number(pack["unitsPerPackage"] ?? 0);
                                const availablePackages =
                                  packageUnits > 0
                                    ? Math.floor(productAvailable / packageUnits)
                                    : 0;
                                const outOfStock = availablePackages < 1;
                                return (
                                  <button
                                    key={packageCode}
                                    type="button"
                                    disabled={priceMissing || outOfStock}
                                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${isSelected && form.packageCode === packageCode ? "border-emerald-700 bg-emerald-700 text-white" : priceMissing ? "border-amber-200 bg-amber-50 text-amber-700" : outOfStock ? "border-slate-200 bg-slate-100 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-400 hover:bg-emerald-50"}`}
                                    onClick={() => chooseProduct(product, packageCode)}
                                  >
                                    {text(pack["label"] ?? pack["code"])}:{" "}
                                    {priceMissing
                                      ? "No price"
                                      : `${money(pack["salePrice"], workspace.tenant.currencyCode)} | ${availablePackages} available`}
                                  </button>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState title="No matching products" />
                  )}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <p className="text-sm text-slate-500">
                      Showing {visibleProducts.length} of {filteredProducts.length} products
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label="Previous product page"
                        disabled={productPage <= 1}
                        onClick={() => setProductPage((page) => Math.max(1, page - 1))}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <span className="min-w-24 text-center text-sm font-bold text-slate-700">
                        Page {productPage} of {productPageCount}
                      </span>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label="Next product page"
                        disabled={productPage >= productPageCount}
                        onClick={() =>
                          setProductPage((page) => Math.min(productPageCount, page + 1))
                        }
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-emerald-100 bg-emerald-50 p-4 sm:p-5">
                  {selected && selectedPackage ? (
                    <div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_120px_auto]">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                          Stock preview
                        </p>
                        <p className="mt-1 font-extrabold text-slate-950">
                          {selectedAvailableBaseUnits.toLocaleString()} sellable base units
                          {selectedStock.expired > 0 ? (
                            <span className="block text-xs font-semibold text-rose-700">
                              {selectedStock.expired.toLocaleString()} expired units are excluded
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                          Price preview
                        </p>
                        <p className="mt-1 font-extrabold text-slate-950">
                          {selectedPackage["salePrice"] === null
                            ? "Not configured"
                            : money(selectedPackage["salePrice"], workspace.tenant.currencyCode)}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          {selectedRequiredBaseUnits.toLocaleString()} base units required
                        </p>
                      </div>
                      <Field label="Tirada (Quantity)">
                        <input
                          className="input"
                          type="number"
                          min="1"
                          value={form.quantity}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, quantity: event.target.value }))
                          }
                        />
                      </Field>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={addCartItem}
                        disabled={
                          selectedRequiredBaseUnits < 1 ||
                          selectedRequiredBaseUnits > selectedAvailableBaseUnits
                        }
                        title={`${selectedRequiredBaseUnits} base units required`}
                      >
                        <Plus size={17} /> Add
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-emerald-900">
                      Choose a product or one of its package prices to prepare the sale line.
                    </p>
                  )}
                </div>
              </section>

              <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:sticky xl:top-6">
                <div className="flex items-center justify-between border-b border-slate-200 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white">
                      <ShoppingCart size={19} />
                    </span>
                    <div>
                      <h2 className="font-extrabold text-slate-950">Shopping cart</h2>
                      <p className="text-xs text-slate-500">
                        {cart.length} {cart.length === 1 ? "product" : "products"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label="Clear cart"
                    disabled={!cart.length}
                    onClick={() => setCart([])}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>

                <div className="max-h-[360px] space-y-3 overflow-y-auto p-4 sm:p-5">
                  {cart.length ? (
                    cart.map((item) => (
                      <div
                        key={`${item.productId}:${item.packageCode}`}
                        className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-950">{item.productName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.packageQuantity} x {item.packageLabel} |{" "}
                            {money(item.unitPrice, workspace.tenant.currencyCode)} each
                          </p>
                          <p className="mt-1 text-sm font-extrabold text-emerald-800">
                            {money(
                              item.unitPrice * item.packageQuantity,
                              workspace.tenant.currencyCode,
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-icon shrink-0"
                          aria-label={`Remove ${item.productName}`}
                          onClick={() =>
                            setCart((current) =>
                              current.filter(
                                (line) =>
                                  line.productId !== item.productId ||
                                  line.packageCode !== item.packageCode,
                              ),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
                      <ShoppingCart size={24} className="mx-auto text-slate-400" />
                      <p className="mt-3 font-bold text-slate-700">Your cart is empty</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Select a product and package, then press Add.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4 border-t border-slate-200 bg-slate-50 p-4 sm:p-5">
                  <div className="space-y-2 text-sm">
                    <p className="flex items-center justify-between text-slate-600">
                      <span>Subtotal</span>
                      <strong className="text-slate-950">
                        {money(cartTotal, workspace.tenant.currencyCode)}
                      </strong>
                    </p>
                    <Field label="Qiimo-dhimis (Discount)">
                      <input
                        className="input text-right"
                        type="number"
                        min="0"
                        max={cartTotal}
                        step="0.01"
                        value={form.discount}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, discount: event.target.value }))
                        }
                      />
                    </Field>
                    <p className="flex items-center justify-between border-t border-slate-200 pt-3 text-base">
                      <span className="font-bold text-slate-700">Grand total</span>
                      <strong className="text-xl text-emerald-800">
                        {money(grandTotal, workspace.tenant.currencyCode)}
                      </strong>
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Lacagta la bixiyey (Amount paid)">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.amountPaid}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, amountPaid: event.target.value }))
                        }
                      />
                    </Field>
                    <Field label="Habka lacag-bixinta (Payment method)">
                      <select
                        className="input"
                        value={form.paymentMethod}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            paymentMethod: toPaymentMethod(event.target.value),
                          }))
                        }
                      >
                        {PAYMENT_METHOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {Number(form.amountPaid) > 0 ? (
                    <Field
                      label="Transaction Reference"
                      hint={
                        form.paymentMethod === "SALAAM_BANK"
                          ? "Recommended for Salaam Bank"
                          : "Optional"
                      }
                    >
                      <input
                        className="input"
                        value={form.paymentReference}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            paymentReference: event.target.value,
                          }))
                        }
                        placeholder="Optional transaction reference"
                      />
                    </Field>
                  ) : null}

                  <div className="rounded-xl bg-slate-900 p-4 text-white">
                    <p className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">
                        {changeDue > 0 ? "Change due" : "Remaining balance"}
                      </span>
                      <strong className="text-lg">
                        {money(
                          changeDue > 0 ? changeDue : balanceDue,
                          workspace.tenant.currencyCode,
                        )}
                      </strong>
                    </p>
                  </div>

                  {debtCustomerMissing ? (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      Sale-kan balance ayaa ka haraya. Geli magaca saxda ah iyo telefoonka macmiilka
                      ama dooro customer hore.
                    </p>
                  ) : null}
                  {checkout.error ? (
                    <p className="text-sm text-rose-700">{errorMessage(checkout.error)}</p>
                  ) : null}
                  {checkout.isSuccess ? (
                    <SuccessMessage>Sale posted successfully.</SuccessMessage>
                  ) : null}

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      className="btn-primary w-full"
                      disabled={checkout.isPending || cart.length === 0 || debtCustomerMissing}
                    >
                      Complete sale
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={!cart.length}
                      onClick={() => setCart([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </form>
        ) : null}
      </div>
      {invoicesOnly ? (
        <div className="mt-6">
          <Card title="Pharmacy invoices">
            <div className="action-bar">
              <input
                className="input max-w-md"
                placeholder="Search invoice, customer, or phone"
                value={salesSearch}
                onChange={(event) => setSalesSearch(event.target.value)}
              />
              <span className="ml-auto text-sm font-semibold text-slate-500">
                {sales.data?.length ?? 0} sales
              </span>
            </div>
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
                    render: (row) => (
                      <span className="font-bold">{text(row["invoiceNumber"])}</span>
                    ),
                  },
                  { label: "Customer", render: (row) => text(row["customerName"]) },
                  { label: "Items", render: (row) => rows(row["items"]).length },
                  {
                    label: "Total",
                    render: (row) =>
                      money(row["grandTotal"] ?? row["total"], workspace.tenant.currencyCode),
                  },
                  {
                    label: "Paid",
                    render: (row) => money(row["amountPaid"], workspace.tenant.currencyCode),
                  },
                  {
                    label: "Balance",
                    render: (row) => money(row["remainingBalance"], workspace.tenant.currencyCode),
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
                        {principal.role !== "LAB_TECHNICIAN" &&
                        row["status"] !== "VOIDED" &&
                        Number(row["remainingBalance"]) > 0 ? (
                          <button
                            className="btn-secondary"
                            onClick={() => openSale(row, "payment")}
                          >
                            Payment
                          </button>
                        ) : null}
                        {principal.role !== "LAB_TECHNICIAN" && row["status"] !== "VOIDED" ? (
                          <button className="btn-secondary" onClick={() => openSale(row, "return")}>
                            Return
                          </button>
                        ) : null}
                        <button
                          className="btn-icon"
                          aria-label="Open printable invoice"
                          onClick={() => openSale(row, "details")}
                        >
                          <Printer size={15} />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </div>
      ) : null}
      <Dialog
        open={Boolean(selectedSale)}
        title={`Invoice ${text(selectedSale?.["invoiceNumber"])}`}
        description={
          selectedSale
            ? `${text(selectedSale["customerName"])}  |  ${money(selectedSale["grandTotal"], workspace.tenant.currencyCode)}`
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
            <div className="action-bar invoice-action-bar">
              <button
                className={saleAction === "details" ? "btn-primary" : "btn-secondary"}
                onClick={() => setSaleAction("details")}
              >
                Details
              </button>
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer size={16} /> Print invoice
              </button>
              {principal.role !== "LAB_TECHNICIAN" && saleDetail.data["status"] !== "VOIDED" ? (
                <>
                  {Number(saleDetail.data["remainingBalance"]) > 0 ? (
                    <button
                      className={saleAction === "payment" ? "btn-primary" : "btn-secondary"}
                      onClick={() => setSaleAction("payment")}
                    >
                      Add payment
                    </button>
                  ) : null}
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
              <section className="invoice-print-sheet m-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:m-5 sm:p-6">
                <header className="flex flex-col items-start justify-between gap-5 border-b-2 border-emerald-800 pb-5 sm:flex-row sm:gap-6">
                  <div className="flex items-center gap-4">
                    {workspace.branding?.logoUrl &&
                    workspace.branding?.invoiceShowLogo !== false ? (
                      <img
                        className="h-16 w-16 rounded-xl object-contain"
                        src={workspace.branding.logoUrl}
                        alt=""
                      />
                    ) : null}
                    <div>
                      <p className="text-2xl font-black text-emerald-900">
                        {workspace.branding?.displayName ?? workspace.tenant.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{branch.name}</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <h2 className="text-xl font-black tracking-wide text-slate-950">
                      {workspace.branding?.invoiceTitle ?? "SALES INVOICE"}
                    </h2>
                    <p className="mt-1 font-bold text-emerald-800">
                      {text(saleDetail.data["invoiceNumber"])}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {date(saleDetail.data["createdAt"])}
                    </p>
                  </div>
                </header>
                <div className="grid gap-4 border-b border-slate-200 py-5 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Customer
                    </p>
                    <p className="mt-1 font-bold">{text(saleDetail.data["customerName"])}</p>
                    <p className="text-sm text-slate-600">
                      {text(saleDetail.data["customerPhone"])}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Payment status
                    </p>
                    <p
                      className={
                        Number(saleDetail.data["remainingBalance"]) > 0
                          ? "mt-1 font-black text-rose-700"
                          : "mt-1 font-black text-emerald-700"
                      }
                    >
                      {Number(saleDetail.data["remainingBalance"]) > 0
                        ? "PAYMENT DUE"
                        : "PAID IN FULL"}
                    </p>
                  </div>
                </div>
                <table className="my-5 w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-3">Product</th>
                      <th>Package</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows(saleDetail.data["items"]).map((item) => (
                      <tr key={text(item["id"])} className="border-b border-slate-100">
                        <td className="py-3 font-semibold">{text(item["productName"])}</td>
                        <td>{text(item["packageLabel"] ?? item["packageCode"])}</td>
                        <td className="text-right">{text(item["packageQuantity"])}</td>
                        <td className="text-right">
                          {money(item["unitPrice"], workspace.tenant.currencyCode)}
                        </td>
                        <td className="text-right font-bold">
                          {money(
                            item["lineTotal"] ?? item["subtotal"],
                            workspace.tenant.currencyCode,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="ml-auto w-full max-w-sm space-y-2 text-sm">
                  <p className="flex justify-between">
                    <span>Subtotal</span>
                    <strong>
                      {money(saleDetail.data["subtotal"], workspace.tenant.currencyCode)}
                    </strong>
                  </p>
                  <p className="flex justify-between">
                    <span>Discount</span>
                    <strong>
                      {money(saleDetail.data["discount"], workspace.tenant.currencyCode)}
                    </strong>
                  </p>
                  <p className="flex justify-between border-t border-slate-300 pt-2 text-base">
                    <span>Grand total</span>
                    <strong>
                      {money(saleDetail.data["grandTotal"], workspace.tenant.currencyCode)}
                    </strong>
                  </p>
                  <p className="flex justify-between text-emerald-800">
                    <span>Paid</span>
                    <strong>
                      {money(saleDetail.data["amountPaid"], workspace.tenant.currencyCode)}
                    </strong>
                  </p>
                  <p className="flex justify-between text-rose-700">
                    <span>Balance</span>
                    <strong>
                      {money(saleDetail.data["remainingBalance"], workspace.tenant.currencyCode)}
                    </strong>
                  </p>
                </div>
                {workspace.branding?.invoiceFooter ? (
                  <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-xs text-slate-500">
                    {workspace.branding.invoiceFooter}
                  </footer>
                ) : null}
              </section>
            ) : null}
            {saleAction === "details" ? (
              <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-5 sm:grid-cols-4">
                <Stat
                  label="Subtotal"
                  value={money(saleDetail.data["subtotal"], workspace.tenant.currencyCode)}
                />
                <Stat
                  label="Discount"
                  value={money(saleDetail.data["discount"], workspace.tenant.currencyCode)}
                />
                <Stat
                  label="Paid"
                  value={money(saleDetail.data["amountPaid"], workspace.tenant.currencyCode)}
                />
                <Stat
                  label="Balance"
                  value={money(saleDetail.data["remainingBalance"], workspace.tenant.currencyCode)}
                />
              </div>
            ) : null}{" "}
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
                      { label: "Method", render: (row) => formatPaymentMethod(row["method"]) },
                      {
                        label: "Transaction reference",
                        render: (row) => text(row["externalReference"]) || "—",
                      },
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
                <Field label="Habka lacag-bixinta (Payment method)">
                  <select
                    className="input"
                    value={actionForm.method}
                    onChange={(e) =>
                      setActionForm({ ...actionForm, method: toPaymentMethod(e.target.value) })
                    }
                  >
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Transaction Reference"
                  hint={
                    actionForm.method === "SALAAM_BANK" ? "Recommended for Salaam Bank" : "Optional"
                  }
                >
                  <input
                    className="input"
                    value={actionForm.transactionReference}
                    onChange={(e) =>
                      setActionForm({ ...actionForm, transactionReference: e.target.value })
                    }
                    placeholder="Optional transaction reference"
                  />
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
                        {text(item["productName"])} | {text(item["baseUnitsSold"])} base units
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
                    onChange={(e) =>
                      setActionForm({ ...actionForm, method: toPaymentMethod(e.target.value) })
                    }
                  >
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
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
                    onChange={(e) =>
                      setActionForm({ ...actionForm, method: toPaymentMethod(e.target.value) })
                    }
                  >
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
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
  const [form, setForm] = useState({
    amount: "",
    method: DEFAULT_PAYMENT_METHOD,
    transactionReference: "",
  });
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
          externalReference: form.transactionReference.trim() || undefined,
          idempotencyKey: idempotency("debt-payment"),
        },
      ),
    onSuccess: async () => {
      setSelected(null);
      setForm({ ...form, amount: "", transactionReference: "" });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["debts"] }),
        client.invalidateQueries({ queryKey: ["sales"] }),
      ]);
    },
  });
  if (!branch) return <EmptyState title="Choose a branch" />;
  const canCollect = ["OWNER", "ADMIN"].includes(principal.role);
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
            ? `${text(selected["customerName"] ?? (selected["sale"] as Row | undefined)?.["customerName"])}  |  ${money(selected["remainingAmount"], workspace.tenant.currencyCode)} remaining`
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
          <Field label="Habka lacag-bixinta (Payment method)">
            <select
              className="input"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: toPaymentMethod(e.target.value) })}
            >
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Transaction Reference"
            hint={form.method === "SALAAM_BANK" ? "Recommended for Salaam Bank" : "Optional"}
          >
            <input
              className="input"
              value={form.transactionReference}
              onChange={(e) => setForm({ ...form, transactionReference: e.target.value })}
              placeholder="Optional transaction reference"
            />
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
  const canManage = ["OWNER", "ADMIN"].includes(principal.role);
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
              <Field label="Qaybta (Category)">
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
            ? `${text(voiding["title"])}  |  ${money(voiding["amount"], workspace.tenant.currencyCode)}`
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
      if (exportId === " | ") throw new Error("The export did not produce a downloadable file");
      await downloadFile(
        `/jobs/exports/${exportId}/download`,
        `${report}-${range.from}-${range.to}.xls`,
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
        title="Operational reports & Excel exports"
        description="Tenant-safe reports with searchable 10-row tables and Excel-compatible downloads."
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
              <Download size={16} /> {exportReport.isPending ? "Preparing | " : "Export Excel"}
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
          {["sales", "clinical", "inventory", "debts", "expenses", "margin"].map((item) => (
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
                    : key.toLowerCase().includes("amount") ||
                        key.toLowerCase().includes("sales") ||
                        key.toLowerCase().includes("revenue")
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
  const [registerOpen, setRegisterOpen] = useState(false);
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
    role: "RECEPTIONIST",
    status: "ACTIVE",
    allBranches: false,
    branchIds: workspace.branches[0]?.id ? [workspace.branches[0].id] : ([] as string[]),
  });
  const [form, setForm] = useState({
    email: "",
    username: "",
    role: "RECEPTIONIST",
    allBranches: false,
    branchIds: workspace.branches[0]?.id ? [workspace.branches[0].id] : ([] as string[]),
  });
  const [registerForm, setRegisterForm] = useState({
    fullName: "",
    email: "",
    username: "",
    password: "",
    role: "RECEPTIONIST",
    allBranches: false,
    branchIds: workspace.branches[0]?.id ? [workspace.branches[0].id] : [...principal.branchIds],
  });
  const staffRoles =
    principal.role === "OWNER"
      ? ["ADMIN", "DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECHNICIAN"]
      : ["DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECHNICIAN"];
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
  const register = useMutation({
    mutationFn: () =>
      sendData("post", "/tenant/members", {
        ...registerForm,
        email: registerForm.email || undefined,
        branchIds: registerForm.allBranches ? [] : registerForm.branchIds,
      }),
    onSuccess: async () => {
      setRegisterOpen(false);
      setRegisterForm({
        fullName: "",
        email: "",
        username: "",
        password: "",
        role: "RECEPTIONIST",
        allBranches: false,
        branchIds: workspace.branches[0]?.id
          ? [workspace.branches[0].id]
          : [...principal.branchIds],
      });
      showToast({
        title: "Staff registered successfully",
        message: "The staff account is active and can sign in now.",
      });
      await client.invalidateQueries({ queryKey: ["members"] });
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
  const archiveMember = useMutation({
    mutationFn: (membershipId: string) =>
      sendData("patch", "/tenant/members/" + membershipId + "/status", { status: "INACTIVE" }),
    onSuccess: async () => {
      showToast({
        title: "Staff member deleted",
        message: "Akoonka waa la xiray, sessions-kiisana waa laga saaray.",
      });
      await client.invalidateQueries({ queryKey: ["members"] });
    },
  });
  const archiveBranch = useMutation({
    mutationFn: (branchId: string) =>
      sendData("patch", "/tenant/branches/" + branchId, { active: false }),
    onSuccess: async () => {
      showToast({
        title: "Branch deleted",
        message:
          "Branch-ka waa la archive-gareeyey, records-kiisii taariikhiga ahaana waa la ilaaliyey.",
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
      phone: text(row["phone"]) === " | " ? "" : text(row["phone"]),
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
              <button className="btn-primary" onClick={() => setRegisterOpen(true)}>
                <Plus size={17} /> Register staff
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setInviteOpen(true);
                  setToken("");
                }}
              >
                <Plus size={17} /> Send invitation
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
              rows={(members.data ?? []).filter((member) => member["status"] !== "INACTIVE")}
              columns={[
                {
                  label: "Member",
                  render: (row) => (
                    <div>
                      <p className="font-bold text-slate-900">
                        {text((row["user"] as Row | undefined)?.["fullName"])}
                      </p>
                      <p className="text-xs text-slate-500">
                        {text(row["username"])} |{" "}
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
                            <div className="flex gap-2">
                              <button
                                className="btn-secondary"
                                onClick={() => beginMemberEdit(row)}
                              >
                                <Pencil size={15} /> Manage
                              </button>
                              <button
                                className="btn-danger"
                                disabled={archiveMember.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Delete this staff account? Historical audit records will remain.",
                                    )
                                  ) {
                                    archiveMember.mutate(text(row["id"]));
                                  }
                                }}
                              >
                                <Trash2 size={15} /> Delete
                              </button>
                            </div>
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
                        <div className="flex gap-2">
                          <button
                            className="btn-secondary"
                            onClick={() => beginBranchEdit(row as unknown as Branch)}
                          >
                            <Pencil size={15} /> Edit
                          </button>
                          <button
                            className="btn-danger"
                            disabled={archiveBranch.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Delete this branch? Historical records will remain available in audit and reports.",
                                )
                              ) {
                                archiveBranch.mutate(text(row["id"]));
                              }
                            }}
                          >
                            <Trash2 size={15} /> Delete
                          </button>
                        </div>
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
        open={registerOpen}
        title="Register staff member"
        description="Create an active account and assign a secure role and branch access."
        onClose={() => setRegisterOpen(false)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate();
          }}
        >
          <Field label="Full name">
            <input
              className="input"
              value={registerForm.fullName}
              onChange={(event) =>
                setRegisterForm({ ...registerForm, fullName: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Email (optional)">
            <input
              className="input"
              type="email"
              value={registerForm.email}
              onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })}
            />
          </Field>
          <Field label="Username">
            <input
              className="input"
              value={registerForm.username}
              onChange={(event) =>
                setRegisterForm({ ...registerForm, username: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Temporary password">
            <input
              className="input"
              type="password"
              minLength={12}
              value={registerForm.password}
              onChange={(event) =>
                setRegisterForm({ ...registerForm, password: event.target.value })
              }
              required
            />
          </Field>
          <Field label="Role">
            <select
              className="input"
              value={registerForm.role}
              onChange={(event) =>
                setRegisterForm({
                  ...registerForm,
                  role: event.target.value,
                  allBranches: event.target.value === "ADMIN" ? registerForm.allBranches : false,
                })
              }
            >
              {staffRoles.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </Field>
          {principal.allBranches && registerForm.role === "ADMIN" ? (
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={registerForm.allBranches}
                onChange={(event) =>
                  setRegisterForm({
                    ...registerForm,
                    allBranches: event.target.checked,
                    branchIds: event.target.checked ? [] : registerForm.branchIds,
                  })
                }
              />{" "}
              Access every branch
            </label>
          ) : null}
          {!registerForm.allBranches ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {workspace.branches.map((branch) => (
                <label
                  key={branch.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={registerForm.branchIds.includes(branch.id)}
                    onChange={(event) =>
                      setRegisterForm({
                        ...registerForm,
                        branchIds: event.target.checked
                          ? [...registerForm.branchIds, branch.id]
                          : registerForm.branchIds.filter((id) => id !== branch.id),
                      })
                    }
                  />
                  {branch.name}
                </label>
              ))}
            </div>
          ) : null}
          {register.error ? (
            <p className="text-sm text-rose-700">{errorMessage(register.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={register.isPending}>
            Create staff account
          </button>
        </form>
      </Dialog>
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
              onChange={(e) =>
                setForm({
                  ...form,
                  role: e.target.value,
                  allBranches: e.target.value === "ADMIN" ? form.allBranches : false,
                })
              }
            >
              {["ADMIN", "DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECHNICIAN"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          {form.role === "ADMIN" ? (
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
          ) : null}
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
              onChange={(e) =>
                setMemberForm({
                  ...memberForm,
                  role: e.target.value,
                  allBranches: e.target.value === "ADMIN" ? memberForm.allBranches : false,
                })
              }
            >
              {["ADMIN", "DOCTOR", "RECEPTIONIST", "PHARMACIST", "LAB_TECHNICIAN"].map((item) => (
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
          {memberForm.role === "ADMIN" ? (
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
          ) : null}
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
        eyebrow="Alerts center"
        title="Alerts and notifications"
        description="Expired medicines, near-expiry batches, low stock, overdue debts, and platform messages in one place."
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
      <Card
        title="All alerts"
        description="The newest alerts appear first; each page shows 10 entries."
      >
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
                  record(row["metadata"])["readOnly"] ? (
                    <StatusBadge value="ADMIN NOTICE" />
                  ) : !row["readAt"] ? (
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
                render: (row) => `${text(row["entityType"])}  |  ${text(row["entityId"])}`,
              },
              { label: "Request", render: (row) => text(row["requestId"]) },
            ]}
          />
        )}
      </Card>
    </>
  );
}

export function AccountPage(props: { principal: TenantPrincipal; workspace: Workspace }) {
  if (["DOCTOR", "LAB_TECHNICIAN", "RECEPTIONIST", "PHARMACIST"].includes(props.principal.role)) {
    return <StaffAccountPage {...props} />;
  }
  return (
    <div className="space-y-8">
      <WorkspaceAccountPage {...props} />
      <StaffAccountPage {...props} embedded />
    </div>
  );
}

function WorkspaceAccountPage({
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
    invoiceTitle: workspace.branding?.invoiceTitle ?? "SALES INVOICE",
    invoicePaperSize: workspace.branding?.invoicePaperSize ?? "A4",
    invoiceShowLogo: workspace.branding?.invoiceShowLogo ?? true,
    pharmacistDiscountPercent: Number(workspace.branding?.pharmacistDiscountPercent ?? 0),
    consultationFee: Number(workspace.branding?.consultationFee ?? 0),
    paymentMethods:
      workspace.branding?.paymentMethods ?? PAYMENT_METHOD_OPTIONS.map((option) => option.value),
  });
  const save = useMutation({
    mutationFn: () =>
      sendData("put", principal.role === "OWNER" ? "/tenant/settings" : "/tenant/branding", {
        ...form,
        logoUrl: form.logoUrl || undefined,
        invoiceFooter: form.invoiceFooter || undefined,
        supportContact: form.supportContact || undefined,
      }),
    onSuccess: async () => {
      setEdit(false);
      await client.invalidateQueries({ queryKey: ["tenant-workspace"] });
      showToast({
        title: "Branding updated",
        message: "The logo and workspace colors are now applied across the pharmacy.",
      });
    },
  });
  const canManageBranding = ["OWNER", "ADMIN"].includes(principal.role);
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Workspace settings"
        description="Identity, subscription, organization settings, and tenant branding."
        actions={
          canManageBranding ? (
            <button className="btn-primary" onClick={() => setEdit(!edit)}>
              <Pencil size={16} /> Edit branding
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
            <Field label="Cinwaanka invoice-ka (Invoice title)">
              <input
                className="input"
                value={form.invoiceTitle}
                onChange={(e) => setForm({ ...form, invoiceTitle: e.target.value })}
                required
              />
            </Field>
            <Field label="Cabbirka warqadda (Invoice paper size)">
              <select
                className="input"
                value={form.invoicePaperSize}
                onChange={(e) =>
                  setForm({
                    ...form,
                    invoicePaperSize: e.target.value as "A4" | "A5" | "THERMAL_80MM",
                  })
                }
              >
                <option value="A4">A4</option>
                <option value="A5">A5</option>
                <option value="THERMAL_80MM">Thermal 80mm</option>
              </select>
            </Field>
            <Field label="Discount-ka pharmacist-ka (%)">
              <input
                className="input"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.pharmacistDiscountPercent}
                onChange={(e) =>
                  setForm({ ...form, pharmacistDiscountPercent: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Default consultation fee">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.consultationFee}
                onChange={(e) => setForm({ ...form, consultationFee: Number(e.target.value) })}
              />
            </Field>
            <div className="rounded-xl border border-slate-200 p-4 md:col-span-2 xl:col-span-3">
              <p className="text-sm font-bold text-slate-900">Accepted payment methods</p>
              <p className="mt-1 text-xs text-slate-500">
                Add or remove the methods Reception and Pharmacy can select. At least one must
                remain active.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {PAYMENT_METHOD_OPTIONS.map((option) => {
                  const enabled = form.paymentMethods.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={enabled ? "btn-primary" : "btn-secondary"}
                      onClick={() =>
                        setForm({
                          ...form,
                          paymentMethods: enabled
                            ? form.paymentMethods.length > 1
                              ? form.paymentMethods.filter((method) => method !== option.value)
                              : form.paymentMethods
                            : [...form.paymentMethods, option.value],
                        })
                      }
                    >
                      {enabled ? "Remove" : "Add"} {option.label}
                    </button>
                  );
                })}
              </div>
            </div>{" "}
            <Field label="Logo-ga invoice-ka (Show logo)">
              <select
                className="input"
                value={form.invoiceShowLogo ? "YES" : "NO"}
                onChange={(e) => setForm({ ...form, invoiceShowLogo: e.target.value === "YES" })}
              >
                <option value="YES">YES</option>
                <option value="NO">NO</option>
              </select>
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
