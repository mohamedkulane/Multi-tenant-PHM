import {
  BadgeDollarSign,
  Wallet,
  ClipboardList,
  Package,
  Users,
  Clock,
  Stethoscope,
  FlaskConical,
  Pill,
  CheckCircle2,
  TestTube,
  type LucideIcon,
} from "lucide-react";
import { money } from "./ui";

const metrics: [string, string, LucideIcon, string, boolean, string][] = [
  ["netSales", "Iibka saafiga ah (Net sales)", BadgeDollarSign, "green", true, "Selected period"],
  ["collected", "Lacagta la qabtay (Collections)", Wallet, "blue", true, "Selected period"],
  [
    "receivables",
    "Deynta harsan (Receivables)",
    ClipboardList,
    "orange",
    true,
    "Outstanding balance",
  ],
  ["lowStockProducts", "Stock-ga yar (Low stock)", Package, "red", false, "Current stock"],
  ["patientsToday", "Today's patients", Users, "blue", false, "Today"],
  ["patientsWaiting", "Patients waiting", Clock, "amber", false, "Current queue"],
  ["consultationRevenue", "Consultation revenue", Stethoscope, "green", true, "Selected period"],
  ["labRevenue", "Laboratory revenue", FlaskConical, "purple", true, "Selected period"],
  ["pharmacyRevenue", "Pharmacy clinical revenue", Pill, "cyan", true, "Selected period"],
  ["totalRevenue", "Total clinical revenue", ClipboardList, "blue", true, "Selected period"],
  ["completedVisits", "Completed visits", CheckCircle2, "green", false, "Selected period"],
  ["labTestsPerformed", "Lab tests performed", TestTube, "purple", false, "Selected period"],
];
export function DashboardMetrics({
  cards,
  currency,
}: {
  cards: Record<string, unknown>;
  currency: string;
}) {
  return (
    <section className="dashboard-metrics" aria-label="Branch performance">
      {metrics.map(([key, label, Icon, tone, financial, detail]) => (
        <article key={key} className="dashboard-metric">
          <span className="metric-icon" data-tone={tone}>
            <Icon size={19} />
          </span>
          <div>
            <p>{label}</p>
            <strong>
              {financial
                ? money(cards[key] ?? 0, currency)
                : Number(cards[key] ?? 0).toLocaleString()}
            </strong>
            <small>{detail}</small>
          </div>
        </article>
      ))}
    </section>
  );
}
