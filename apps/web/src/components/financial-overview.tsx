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
    ["totalRevenue", "Dakhliga guud (Total revenue)", BadgeDollarSign, "blue", "Muddada la doortay"],
    ["costOfGoods", "Qiimaha alaabta la iibiyey (COGS)", Wallet, "orange", "Muddada la doortay"],
    ["grossProfit", "Faa'iidada guud (Gross profit)", TrendingUp, "green", "Dakhliga guud marka laga jaro COGS"],
    [
      "operatingExpenses",
      "Kharashaadka hawlgalka (Operating expenses)",
      Receipt,
      "red",
      "Kharashaad la diiwaangeliyey · muddada la doortay",
    ],
    ["netIncome", "Dakhliga saafiga ah (Net income)", BadgeDollarSign, "green", "Faa'iidada guud marka laga jaro kharashaadka"],
    [
      "accountsReceivable",
      "Deymaha macaamiisha (AR)",
      ClipboardList,
      "orange",
      "Deynta hadda taagan",
    ],
    [
      "overduePharmacyReceivables",
      "Deymaha waqtigoodu dhaafay",
      Clock,
      "red",
      "Deymaha pharmacy-ga ee waqtigoodu dhaafay",
    ],
  ] as const;
  return (
    <Card
      title="Dulmarka maaliyadeed"
      description="Dakhliga, faa'iidada iyo deymaha laanta la doortay."
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
          <span>La-tashi: {money(financial["consultationRevenue"], currency)}</span>
          <span>Shaybaar: {money(financial["laboratoryRevenue"], currency)}</span>
        </div>
        {Number(financial["missingCostItems"]) > 0 ? (
          <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Qiimaha {Number(financial["missingCostItems"])} alaabood oo la iibiyey ayaa maqan.
            Faa'iidada guud iyo dakhliga saafiga ah ma dhammaystirna ilaa kharashaadkaas la diiwaangeliyo.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
