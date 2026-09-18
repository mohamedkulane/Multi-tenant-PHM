import { BadgeDollarSign, Wallet, TrendingUp, Receipt, ClipboardList, Clock } from "lucide-react";
import { Card, money } from "./ui";

export function FinancialOverview({
  financial,
  currency,
}: {
  financial: Record<string, unknown>;
  currency: string;
}) {
  const metrics = [
    ["totalRevenue", "Total revenue", BadgeDollarSign, "blue", "Selected period · after returns"],
    ["costOfGoods", "Cost of goods sold", Wallet, "orange", "Cost of pharmacy goods sold"],
    ["grossProfit", "Gross profit", TrendingUp, "green", "Revenue minus cost of goods"],
    [
      "operatingExpenses",
      "Operating expenses",
      Receipt,
      "red",
      "Posted expenses · selected period",
    ],
    ["netIncome", "Net income", BadgeDollarSign, "green", "Gross profit minus operating expenses"],
    [
      "accountsReceivable",
      "Accounts receivable (AR)",
      ClipboardList,
      "orange",
      "Current outstanding · all dates",
    ],
    [
      "overduePharmacyReceivables",
      "Overdue pharmacy AR",
      Clock,
      "red",
      "Current debts past their due date",
    ],
  ] as const;
  return (
    <Card
      title="Financial overview"
      description="Revenue, profit and customer balances for the selected branch."
      className="mt-6"
    >
      <div className="p-5">
        <section className="dashboard-metrics" aria-label="Financial overview">
          {metrics.map(([key, label, Icon, tone, detail]) => (
            <article key={key} className="dashboard-metric">
              <span className="metric-icon" data-tone={tone}>
                <Icon size={19} />
              </span>
              <div>
                <p>{label}</p>
                <strong>{money(financial[key], currency)}</strong>
                <small>{detail}</small>
              </div>
            </article>
          ))}
        </section>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
          <span>Pharmacy: {money(financial["pharmacyRevenue"], currency)}</span>
          <span>Consultation: {money(financial["consultationRevenue"], currency)}</span>
          <span>Laboratory: {money(financial["laboratoryRevenue"], currency)}</span>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Revenue includes unpaid charges from registered, non-cancelled visits and pharmacy sales.
          AR includes pharmacy debts, unpaid consultations and lab balances; it is the balance now,
          not a historical balance at the selected end date. Lab and consultation balances have no
          due dates, so overdue AR covers pharmacy debts only.
        </p>
        {Number(financial["missingCostItems"]) > 0 ? (
          <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Cost information is missing for {Number(financial["missingCostItems"])} sale items.
            Gross profit and net income are incomplete until these costs are recorded.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          Profit reflects recorded costs and expenses. Include service costs, salaries, rent and
          other operating costs in Expenses.
        </p>
      </div>
    </Card>
  );
}
