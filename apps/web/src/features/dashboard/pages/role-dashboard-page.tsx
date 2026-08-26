import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  ClipboardPlus,
  DollarSign,
  ReceiptText,
  ShoppingCart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getData } from "../../../api/client";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Stat,
  StatusBadge,
  date,
  money,
} from "../../../components/ui";
import { Link } from "../../../lib/navigation";
import type { Branch, TenantPrincipal } from "../../../types";
import { DoctorDashboard } from "./doctor-dashboard";
import { LabTechnicianDashboard } from "./lab-technician-dashboard";
import { dashboardText, type DashboardRow } from "./dashboard-utils";

const roleCopy = {
  RECEPTIONIST: {
    eyebrow: "Front desk",
    title: "Reception dashboard",
    description: "Register patients, collect clinical fees, and track every hand-off.",
  },
  PHARMACIST: {
    eyebrow: "Dispensary",
    title: "Pharmacy dashboard",
    description: "Open the pharmacy point of sale and manage medicine stock.",
  },
} as const;

export function RoleDashboardPage({
  branch,
  principal,
}: {
  branch: Branch | undefined;
  principal: TenantPrincipal;
}) {
  const clinicVisits = useQuery({
    queryKey: ["clinic-visits", branch?.id, principal.role],
    queryFn: () =>
      getData<DashboardRow[]>(
        `/clinic/visits?branchId=${branch!.id}${principal.role === "RECEPTIONIST" ? "&view=summary" : ""}`,
      ),
    enabled: Boolean(branch) && ["DOCTOR", "RECEPTIONIST"].includes(principal.role),
    refetchInterval: 30_000,
  });
  const pharmacySales = useQuery({
    queryKey: ["pharmacy-dashboard-sales", branch?.id],
    queryFn: () => getData<DashboardRow[]>(`/sales?branchId=${branch!.id}`),
    enabled: Boolean(branch) && principal.role === "PHARMACIST",
    refetchInterval: 30_000,
  });
  const pharmacyStock = useQuery({
    queryKey: ["pharmacy-dashboard-stock", branch?.id],
    queryFn: () => getData<DashboardRow[]>(`/inventory/stock?branchId=${branch!.id}`),
    enabled: Boolean(branch) && principal.role === "PHARMACIST",
    refetchInterval: 30_000,
  });
  if (!branch)
    return (
      <EmptyState
        title="Choose a branch"
        description="Select the working location from the header."
      />
    );
  if (principal.role === "DOCTOR") {
    if (clinicVisits.isLoading) return <LoadingState label="Loading your clinical dashboard" />;
    if (clinicVisits.error) return <ErrorState error={clinicVisits.error} />;
    return <DoctorDashboard principal={principal} visits={clinicVisits.data ?? []} />;
  }
  if (principal.role === "LAB_TECHNICIAN")
    return <LabTechnicianDashboard branch={branch} principal={principal} />;
  if (principal.role === "PHARMACIST") {
    if (pharmacySales.isLoading || pharmacyStock.isLoading)
      return <LoadingState label="Loading pharmacy dashboard" />;
    if (pharmacySales.error) return <ErrorState error={pharmacySales.error} />;
    if (pharmacyStock.error) return <ErrorState error={pharmacyStock.error} />;
    const sales = pharmacySales.data ?? [];
    const stock = pharmacyStock.data ?? [];
    const todaySales = sales.filter((sale) => {
      const created = new Date(String(sale["createdAt"]));
      const today = new Date();
      return created.toDateString() === today.toDateString();
    });
    const revenue = todaySales.reduce(
      (total, sale) => total + Number(sale["grandTotal"] ?? sale["total"] ?? 0),
      0,
    );
    const outstanding = sales.reduce(
      (total, sale) => total + Number(sale["remainingBalance"] ?? 0),
      0,
    );
    const lowStock = stock.filter((batch) => Number(batch["quantityOnHand"] ?? 0) <= 10).length;
    return (
      <>
        <PageHeader
          {...roleCopy.PHARMACIST}
          actions={
            <Link className="btn-primary" to="/sales">
              <ShoppingCart size={17} /> New pharmacy sale
            </Link>
          }
        />
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <PharmacyStat
            icon={DollarSign}
            label="Today's sales"
            value={money(revenue)}
            tone="emerald"
          />
          <PharmacyStat
            icon={ReceiptText}
            label="Transactions today"
            value={String(todaySales.length)}
            tone="blue"
          />
          <PharmacyStat
            icon={AlertTriangle}
            label="Low-stock batches"
            value={String(lowStock)}
            tone="amber"
          />
          <PharmacyStat
            icon={DollarSign}
            label="Outstanding balance"
            value={money(outstanding)}
            tone="violet"
          />
        </div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(19rem,0.7fr)]">
          <Card
            title="Recent pharmacy sales"
            description="Latest invoices recorded at this branch."
          >
            <div className="overflow-x-auto">
              {sales.length ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.slice(0, 6).map((sale) => (
                      <tr key={dashboardText(sale["id"])}>
                        <td className="font-semibold">{dashboardText(sale["invoiceNumber"])}</td>
                        <td>{dashboardText(sale["customerName"]) || "Walk-in Customer"}</td>
                        <td>{money(Number(sale["grandTotal"] ?? sale["total"] ?? 0))}</td>
                        <td>
                          <StatusBadge value={dashboardText(sale["status"])} />
                        </td>
                        <td>
                          <Link className="btn-secondary" to="/invoices">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState title="No pharmacy sales yet" />
              )}
            </div>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <WorkspaceLink
              to="/sales"
              icon={ShoppingCart}
              title="Pharmacy sales"
              detail="Start a new medicine sale and receive payment."
            />
            <WorkspaceLink
              to="/invoices"
              icon={ReceiptText}
              title="Invoices"
              detail="Search, view, print, and manage sale invoices."
            />
            <WorkspaceLink
              to="/inventory"
              icon={Boxes}
              title="Inventory"
              detail="Review batches, expiries, and available stock."
            />
          </div>
        </div>
      </>
    );
  }
  if (clinicVisits.isLoading) return <LoadingState label="Loading reception dashboard" />;
  if (clinicVisits.error) return <ErrorState error={clinicVisits.error} />;
  const visits = (clinicVisits.data ?? []).filter(
    (visit) =>
      ![
        "WAITING_FOR_SAMPLE",
        "WAITING_FOR_LAB",
        "LAB_IN_PROGRESS",
        "LAB_RESULTS_READY",
        "RESULTS_READY",
        "DOCTOR_REVIEW",
        "AT_PHARMACY",
        "COMPLETED",
      ].includes(dashboardText(visit["status"])),
  );
  const doctorQueue = visits.filter((visit) =>
    ["WAITING_FOR_DOCTOR", "DOCTOR_REVIEW", "LAB_RESULTS_READY"].includes(
      dashboardText(visit["status"]),
    ),
  ).length;
  const payments = visits.filter((visit) =>
    ["AWAITING_CONSULTATION_PAYMENT", "AWAITING_LAB_PAYMENT"].includes(
      dashboardText(visit["status"]),
    ),
  ).length;
  const laboratory = visits.filter((visit) =>
    ["WAITING_FOR_SAMPLE", "WAITING_FOR_LAB", "LAB_IN_PROGRESS"].includes(
      dashboardText(visit["status"]),
    ),
  ).length;
  return (
    <>
      <PageHeader
        {...roleCopy.RECEPTIONIST}
        actions={
          <Link className="btn-primary" to="/reception/visits">
            <ClipboardPlus size={17} /> Patient desk
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Doctor queue" value={doctorQueue} tone="blue" />
        <Stat label="Payments required" value={payments} tone="amber" />
        <Stat label="Laboratory queue" value={laboratory} tone="emerald" />
      </div>
      <Card title="My work queue" description={`${visits.length} patient visits`}>
        <div className="overflow-x-auto">
          {visits.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={dashboardText(visit["id"])}>
                    <td className="font-semibold">{dashboardText(visit["visitNumber"])}</td>
                    <td>{dashboardText((visit["patient"] as DashboardRow)?.["name"])}</td>
                    <td>
                      <StatusBadge
                        value={
                          ["LAB_RESULTS_READY", "DOCTOR_REVIEW", "RESULTS_READY"].includes(
                            dashboardText(visit["status"]),
                          )
                            ? "WITH DOCTOR"
                            : dashboardText(visit["status"])
                        }
                      />
                    </td>
                    <td>{date(visit["createdAt"])}</td>
                    <td>
                      <Link
                        className="btn-secondary"
                        to={`/reception/visits?visit=${dashboardText(visit["id"])}`}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="Queue is clear" />
          )}
        </div>
      </Card>
    </>
  );
}

function WorkspaceLink({
  to,
  icon: Icon,
  title,
  detail,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <Icon className="text-emerald-700" size={25} />
      <h2 className="mt-5 text-lg font-bold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </Link>
  );
}
function PharmacyStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "emerald" | "blue" | "amber" | "violet";
}) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-extrabold text-slate-950">{value}</p>
        </div>
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${colors[tone]}`}>
          <Icon size={20} />
        </span>
      </div>
    </section>
  );
}
