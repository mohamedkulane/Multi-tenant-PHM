import { useQuery } from "@tanstack/react-query";
import { Boxes, ClipboardPlus, FlaskConical, ShoppingCart } from "lucide-react";
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

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const copy = {
  DOCTOR: {
    eyebrow: "Clinical care",
    title: "Doctor dashboard",
    description: "Your patient queue, returned laboratory results, and completed reviews.",
  },
  RECEPTIONIST: {
    eyebrow: "Front desk",
    title: "Reception dashboard",
    description: "Register patients, collect clinical fees, and track every hand-off.",
  },
  LAB_TECHNICIAN: {
    eyebrow: "Diagnostics",
    title: "Laboratory dashboard",
    description: "Paid orders, sample collection, results entry, and completed work.",
  },
  PHARMACIST: {
    eyebrow: "Dispensary",
    title: "Pharmacy dashboard",
    description:
      "Normal FEFO point of sale and medicine stock. Clinical medication orders are on physical paper.",
  },
} as const;

export function RoleDashboardPage({
  branch,
  principal,
}: {
  branch: Branch | undefined;
  principal: TenantPrincipal;
}) {
  const role = principal.role as keyof typeof copy;
  const content = copy[role] ?? copy.DOCTOR;
  const visits = useQuery({
    queryKey: ["clinic-visits", branch?.id],
    queryFn: () => getData<Row[]>(`/clinic/visits?branchId=${branch!.id}`),
    enabled: Boolean(branch) && role !== "PHARMACIST",
  });
  if (!branch)
    return (
      <EmptyState
        title="Choose a branch"
        description="Select the working location from the header."
      />
    );
  if (visits.isLoading) return <LoadingState label="Loading your work queue" />;
  if (visits.error) return <ErrorState error={visits.error} />;
  if (role === "PHARMACIST")
    return (
      <>
        <PageHeader {...content} />
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
  const all = visits.data ?? [];
  const waitingDoctor = all.filter((item) =>
    ["WAITING_FOR_DOCTOR", "DOCTOR_REVIEW", "LAB_RESULTS_READY", "RESULTS_READY"].includes(
      text(item["status"]),
    ),
  ).length;
  const payment = all.filter((item) =>
    ["AWAITING_CONSULTATION_PAYMENT", "AWAITING_LAB_PAYMENT"].includes(text(item["status"])),
  ).length;
  const laboratory = all.filter((item) =>
    ["WAITING_FOR_SAMPLE", "WAITING_FOR_LAB", "LAB_IN_PROGRESS"].includes(text(item["status"])),
  ).length;
  const visible =
    role === "DOCTOR"
      ? all.filter((item) =>
          [
            "WAITING_FOR_DOCTOR",
            "IN_EXAMINATION",
            "IN_CONSULTATION",
            "LAB_RESULTS_READY",
            "RESULTS_READY",
            "DOCTOR_REVIEW",
            "COMPLETED",
          ].includes(text(item["status"])),
        )
      : role === "LAB_TECHNICIAN"
        ? all.filter((item) =>
            [
              "WAITING_FOR_SAMPLE",
              "WAITING_FOR_LAB",
              "LAB_IN_PROGRESS",
              "LAB_RESULTS_READY",
            ].includes(text(item["status"])),
          )
        : all;
  return (
    <>
      <PageHeader
        {...content}
        actions={
          role === "RECEPTIONIST" ? (
            <Link className="btn-primary" to="/reception/visits">
              <ClipboardPlus size={17} /> Patient desk
            </Link>
          ) : role === "LAB_TECHNICIAN" ? (
            <Link className="btn-primary" to="/lab/orders">
              <FlaskConical size={17} /> Laboratory orders
            </Link>
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Doctor queue" value={waitingDoctor} tone="blue" />
        <Stat label="Payments required" value={payment} tone="amber" />
        <Stat label="Laboratory queue" value={laboratory} tone="emerald" />
      </div>
      <Card title="My work queue" description={`${visible.length} records relevant to your role`}>
        <div className="overflow-x-auto">
          {visible.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Patient</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={text(item["id"])}>
                    <td className="font-semibold">{text(item["visitNumber"])}</td>
                    <td>{text((item["patient"] as Row)?.["name"])}</td>
                    <td>
                      <StatusBadge value={text(item["status"])} />
                    </td>
                    <td>{date(item["createdAt"])}</td>
                    <td>
                      <Link className="btn-secondary" to={`/clinic/visits/${text(item["id"])}`}>
                        {role === "DOCTOR" ? "Open patient" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="Queue is clear"
              description="New work assigned to your role will appear here."
            />
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
