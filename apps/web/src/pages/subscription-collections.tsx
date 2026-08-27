import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getData } from "../api/client";
import { Card, ErrorState, Field, LoadingState, SimpleTable, Stat } from "../components/ui";

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
  const currencyLabel = (code: string) => code === "UNSPECIFIED" ? "Currency not recorded (legacy)" : code;
  const amount = (value: string) => `${Number(value).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}${selected && selected.currencyCode !== "UNSPECIFIED" ? ` ${selected.currencyCode}` : ""}`;
  const months = selected?.months ?? Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, "0")}`, amount: "0", paymentCount: 0,
  }));
  return (
    <Card title="Monthly subscription collections" className="mt-6"
      description="Actual payments recorded through Renew subscription, grouped by receipt month (UTC). Agreed fees are not counted as payments.">
      <div className="p-5">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          setYear(Number(yearInput));
        }}>
          <Field label="Reporting year">
            <input className="input w-full sm:w-36" type="number" min="2000" max="9998" required
              value={yearInput} onChange={(event) => setYearInput(event.target.value)} />
          </Field>
          <button className="btn-secondary" type="submit">Show year</button>
          {groups.length > 0 && <Field label="Payment currency">
            <select className="input" value={selected?.currencyCode ?? ""} onChange={(event) => setCurrency(event.target.value)}>
              {groups.map((group) => <option key={group.currencyCode} value={group.currencyCode}>{currencyLabel(group.currencyCode)}</option>)}
            </select>
          </Field>}
        </form>
        {query.isLoading ? <LoadingState label="Loading subscription payments" /> : query.error ? <ErrorState error={query.error} /> : <>
          <div className="my-5 grid gap-4 sm:grid-cols-2">
            <Stat label={`Collected in ${year}`} value={amount(selected?.total ?? "0")} tone="emerald"
              detail={selected ? currencyLabel(selected.currencyCode) : "No payments recorded for this year"} />
            <Stat label="Payments recorded" value={selected?.paymentCount ?? 0} tone="blue" detail="All recorded payments, including multiple payments by the same tenant" />
          </div>
          {groups.some((group) => group.currencyCode === "UNSPECIFIED") && <p className="mb-4 text-sm text-amber-800">
            Older payments without a recorded currency are shown separately under Currency not recorded (legacy). They are not combined with known currencies.
          </p>}
          {Boolean(query.data?.invalidPaymentCount) && <p role="alert" className="mb-4 text-sm text-rose-700">
            {query.data?.invalidPaymentCount} historical records have no valid payment amount and are excluded. These totals may be incomplete.
          </p>}
          <SimpleTable pageSize={false} rows={months.map((month) => ({ ...month }))} columns={[
            { label: "Month", render: (row) => new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" }) },
            { label: "Payments", render: (row) => Number(row.paymentCount) },
            { label: "Collected", render: (row) => amount(String(row.amount)) },
          ]} />
        </>}
      </div>
    </Card>
  );
}
