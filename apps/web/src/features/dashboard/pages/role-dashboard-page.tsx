import { useQuery } from "@tanstack/react-query";
import { Boxes, ClipboardPlus, ShoppingCart } from "lucide-react";
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
  if (principal.role === "PHARMACIST")
    return (
      <>
        <PageHeader {...roleCopy.PHARMACIST} />
        <div className="grid gap-4 sm:grid-cols-2">
          <WorkspaceLink
            to="/sales"
            icon={ShoppingCart}
            title="Open pharmacy POS"
            detail="Sell medicine using FEFO batches and take payment here."
          />
          <WorkspaceLink
            to="/inventory"
            icon={Boxes}
            title="Review inventory"
            detail="Stock levels, batches, expiries, and replenishment."
          />
        </div>
      </>
    );
  if (clinicVisits.isLoading) return <LoadingState label="Loading reception dashboard" />;
  if (clinicVisits.error) return <ErrorState error={clinicVisits.error} />;
  const visits = clinicVisits.data ?? [];
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
                      <StatusBadge value={dashboardText(visit["status"])} />
                    </td>
                    <td>{date(visit["createdAt"])}</td>
                    <td>
                      <Link
                        className="btn-secondary"
                        to={`/clinic/visits/${dashboardText(visit["id"])}`}
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
