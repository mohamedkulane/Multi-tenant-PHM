import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ChevronDown, ChevronUp, Wallet } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getData } from "../api/client";
import { ErrorState, Field, LoadingState, SimpleTable } from "../components/ui";

interface MonthCollection {
  month: string;
  amount: string;
  paymentCount: number;
}
interface CollectionsReport {
  year: number;
  timeZone: string;
  invalidPaymentCount: number;
  currencies: {
    currencyCode: string;
    total: string;
    paymentCount: number;
    months: MonthCollection[];
  }[];
}

export function SubscriptionCollections() {
  const reducedMotion = useReducedMotion();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chartType, setChartType] = useState<"bar" | "area">("bar");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getUTCMonth());
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [yearInput, setYearInput] = useState(String(year));
  const [currency, setCurrency] = useState("");
  const query = useQuery({
    queryKey: ["subscription-collections", year],
    queryFn: () => getData<CollectionsReport>(`/platform/subscription-collections?year=${year}`),
    refetchInterval: 60_000,
  });
  const groups = query.data?.currencies ?? [];
  const selected = groups.find((group) => group.currencyCode === currency) ?? groups[0];
  const currencyLabel = (code: string) =>
    code === "UNSPECIFIED" ? "Currency not recorded (legacy)" : code;
  const amount = (value: string) =>
    `${Number(value).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}${selected && selected.currencyCode !== "UNSPECIFIED" ? ` ${selected.currencyCode}` : ""}`;
  const months =
    selected?.months ??
    Array.from({ length: 12 }, (_, index) => ({
      month: `${year}-${String(index + 1).padStart(2, "0")}`,
      amount: "0",
      paymentCount: 0,
    }));
  const chartData = months.map((month) => ({
    ...month,
    collected: Number(month.amount),
    label: new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString("en", {
      month: "short",
      timeZone: "UTC",
    }),
  }));
  const activeMonth = months[selectedMonth];
  const previousAmount = Number(months[selectedMonth - 1]?.amount ?? 0);
  const difference = Number(activeMonth?.amount ?? 0) - previousAmount;
  const monthName = (month: string) =>
    new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const chartAxes = (
    <>
      <CartesianGrid vertical={false} stroke="#eef2f6" />
      <XAxis
        dataKey="label"
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 11, fill: "#64748b" }}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={{ fontSize: 11, fill: "#64748b" }}
        tickFormatter={(value: number) =>
          Intl.NumberFormat("en", { notation: "compact" }).format(value)
        }
      />
      <Tooltip
        cursor={{ fill: "#eff6" }}
        contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }}
        formatter={(value) => [amount(String(value)), "Collected"]}
      />
    </>
  );
  return (
    <section
      aria-labelledby="collections-heading"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-slate-100 p-5 sm:p-6">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600">
            <Wallet size={15} /> Subscription revenue
          </p>
          <h2 id="collections-heading" className="text-xl font-bold text-slate-950">
            Monthly subscription collections
          </h2>
          <p className="mt-2 max-w-lg text-xs leading-5 text-slate-500">
            Actual payments recorded through Renew subscription, grouped by receipt month (UTC).
            Agreed fees are not counted as payments.
          </p>
        </div>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setYear(Number(yearInput));
          }}
        >
          <Field label="Reporting year">
            <input
              className="input w-full sm:w-28"
              type="number"
              min="2000"
              max="9998"
              required
              value={yearInput}
              onChange={(event) => setYearInput(event.target.value)}
            />
          </Field>
          <button className="btn-secondary" type="submit">
            Show year
          </button>
          {groups.length > 0 && (
            <Field label="Payment currency">
              <select
                className="input"
                value={selected?.currencyCode ?? ""}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {groups.map((group) => (
                  <option key={group.currencyCode} value={group.currencyCode}>
                    {currencyLabel(group.currencyCode)}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </form>
      </div>
      <div className="p-5 sm:p-6">
        {query.isLoading ? (
          <LoadingState label="Loading subscription payments" />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_270px]">
              <div className="min-w-0">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Collected in {year}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
                      {amount(selected?.total ?? "0")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {selected
                        ? currencyLabel(selected.currencyCode)
                        : "No payments recorded for this year"}
                    </p>
                  </div>
                  <div
                    className="inline-flex gap-1 rounded-lg bg-slate-100 p-1"
                    aria-label="Chart style"
                  >
                    {(["bar", "area"] as const).map((style) => (
                      <button
                        key={style}
                        type="button"
                        aria-pressed={chartType === style}
                        onClick={() => setChartType(style)}
                        className={`rounded-md px-3 py-2 text-xs font-bold capitalize ${chartType === style ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                      >
                        {style === "bar" ? "Bars" : "Trend"}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className="h-64 sm:h-72"
                  role="img"
                  aria-label={`Monthly collections in ${year}, ${selected?.currencyCode ?? "no recorded currency"}. Total ${selected?.total ?? 0}. Use monthly details for exact amounts.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    {chartType === "bar" ? (
                      <BarChart data={chartData} margin={{ left: -20, top: 10, right: 4 }}>
                        {chartAxes}
                        <Bar
                          dataKey="collected"
                          fill="#2563eb"
                          radius={[5, 5, 0, 0]}
                          maxBarSize={32}
                          isAnimationActive={!reducedMotion}
                          animationDuration={1100}
                        />
                      </BarChart>
                    ) : (
                      <AreaChart data={chartData} margin={{ left: -20, top: 10, right: 4 }}>
                        {chartAxes}
                        <defs>
                          <linearGradient id="collectionsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2563eb" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          dataKey="collected"
                          type="monotone"
                          stroke="#2563eb"
                          strokeWidth={3}
                          fill="url(#collectionsFill)"
                          isAnimationActive={!reducedMotion}
                          animationDuration={1100}
                        />
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
              <aside className="rounded-2xl bg-slate-950 p-5 text-white">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
                  Month in focus
                </p>
                <label className="mt-4 block text-xs text-slate-300" htmlFor="collection-month">
                  Choose month
                </label>
                <select
                  id="collection-month"
                  className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-900 p-2 text-sm text-white"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(Number(event.target.value))}
                >
                  {months.map((month, index) => (
                    <option key={month.month} value={index}>
                      {monthName(month.month)}
                    </option>
                  ))}
                </select>
                <p className="mt-6 text-2xl font-bold tracking-tight">
                  {amount(activeMonth?.amount ?? "0")}
                </p>
                <p className="mt-1 text-xs text-slate-400">received in this month</p>
                <div className="mt-4 flex items-center gap-1 text-xs text-slate-300">
                  {difference >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {selectedMonth > 0
                    ? `${amount(String(Math.abs(difference)))} ${difference >= 0 ? "more" : "less"} than previous month`
                    : "First month of reporting year"}
                </div>
                <dl className="mt-6 space-y-3 border-t border-slate-700 pt-5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Payments this month</dt>
                    <dd className="font-bold">{activeMonth?.paymentCount ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-400">Payments recorded · year</dt>
                    <dd className="font-bold">{selected?.paymentCount ?? 0}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-[11px] leading-5 text-slate-400">
                  Recorded receipts only. This is not projected revenue or the total amount owed.
                </p>
              </aside>
            </div>
            {groups.some((group) => group.currencyCode === "UNSPECIFIED") && (
              <p className="mb-4 text-sm text-amber-800">
                Older payments without a recorded currency are shown separately under Currency not
                recorded (legacy). They are not combined with known currencies.
              </p>
            )}
            {Boolean(query.data?.invalidPaymentCount) && (
              <p role="alert" className="mb-4 text-sm text-rose-700">
                {query.data?.invalidPaymentCount} historical records have no valid payment amount
                and are excluded. These totals may be incomplete.
              </p>
            )}
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls="collection-details"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="mt-5 flex w-full items-center justify-between gap-2 border-t border-slate-100 pt-4 text-sm font-semibold text-blue-700"
            >
              {detailsOpen ? "Hide monthly details" : "View monthly details"}
              {detailsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {detailsOpen && (
              <div id="collection-details" className="mt-4">
                <SimpleTable
                  pageSize={false}
                  rows={months.map((month) => ({ ...month }))}
                  columns={[
                    {
                      label: "Month",
                      render: (row) =>
                        new Date(`${String(row.month)}-01T00:00:00Z`).toLocaleDateString("en", {
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        }),
                    },
                    { label: "Payments", render: (row) => Number(row.paymentCount) },
                    { label: "Collected", render: (row) => amount(String(row.amount)) },
                  ]}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
