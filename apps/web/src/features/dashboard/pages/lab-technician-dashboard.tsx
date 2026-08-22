import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Droplets, FlaskConical, Microscope, TestTubes } from "lucide-react";
import { getData } from "../../../api/client";
import { Card, EmptyState, ErrorState, LoadingState } from "../../../components/ui";
import { Link } from "../../../lib/navigation";
import type { Branch, TenantPrincipal } from "../../../types";
import { DashboardGreeting, Kpi } from "./doctor-dashboard";
import {
  dashboardPatient,
  dashboardRows,
  dashboardText,
  elapsedMinutes,
  isToday,
  latestDashboardRowPerPatient,
  shortTime,
  type DashboardRow,
} from "./dashboard-utils";

type QueueTab = "ALL" | "SAMPLE" | "PROGRESS" | "RESULTS" | "COMPLETED";
const completed = (visit: DashboardRow) => dashboardText(visit["status"]) === "COMPLETED";
const collected = (visit: DashboardRow) => dashboardText(visit["sampleStatus"]) === "COLLECTED";
const pendingTests = (visit: DashboardRow) =>
  dashboardRows(visit["tests"]).filter((test) => dashboardText(test["resultStatus"]) === "PENDING")
    .length;

export function LabTechnicianDashboard({
  branch,
  principal,
}: {
  branch: Branch;
  principal: TenantPrincipal;
}) {
  const [tab, setTab] = useState<QueueTab>("ALL");
  const visits = useQuery({
    queryKey: ["lab-visits", branch.id],
    queryFn: () => getData<DashboardRow[]>(`/lab/visits?branchId=${branch.id}`),
    refetchInterval: 30_000,
  });
  const all = visits.data ?? [];
  const today = all.filter((visit) => isToday(visit["createdAt"]));
  const samples = all.filter((visit) => !collected(visit) && !completed(visit));
  const inProgress = all.filter((visit) => collected(visit) && !completed(visit));
  const urgent = all.filter(
    (visit) => ["URGENT", "STAT"].includes(dashboardText(visit["priority"])) && !completed(visit),
  );
  const completedToday = all.filter((visit) => completed(visit) && isToday(visit["completedAt"]));
  const dashboardVisits = useMemo(() => latestDashboardRowPerPatient(all), [all]);
  const filtered = useMemo(
    () =>
      dashboardVisits
        .filter((visit) => {
          if (tab === "SAMPLE") return !collected(visit) && !completed(visit);
          if (tab === "PROGRESS")
            return collected(visit) && !completed(visit) && pendingTests(visit) > 0;
          if (tab === "RESULTS") return collected(visit) && !completed(visit);
          if (tab === "COMPLETED") return completed(visit);
          return true;
        })
        .slice(0, 8),
    [dashboardVisits, tab],
  );
  if (visits.isLoading) return <LoadingState label="Loading laboratory dashboard" />;
  if (visits.error) return <ErrorState error={visits.error} />;
  const averageTat = completedToday.length
    ? Math.round(
        completedToday.reduce(
          (sum, visit) =>
            sum +
            (new Date(String(visit["completedAt"])).getTime() -
              new Date(String(visit["createdAt"])).getTime()),
          0,
        ) /
          completedToday.length /
          60_000,
      )
    : 0;
  const specimenCounts = all
    .flatMap((visit) => dashboardRows(visit["tests"]))
    .reduce<Record<string, number>>((counts, test) => {
      const labTest = (test["labTest"] as DashboardRow | undefined) ?? {};
      const type = dashboardText(labTest["sampleType"] ?? "Other") || "Other";
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {});
  return (
    <div className="lab-dashboard">
      <DashboardGreeting
        name={principal.fullName}
        description="Here's your laboratory workload for today."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Total orders"
          value={today.length}
          detail="Registered today"
          icon={FlaskConical}
          tone="blue"
        />
        <Kpi
          label="Samples to collect"
          value={samples.length}
          detail="Ready for collection"
          icon={TestTubes}
          tone="violet"
        />
        <Kpi
          label="Results to enter"
          value={inProgress.length}
          detail="Samples collected"
          icon={Microscope}
          tone="blue"
        />
        <Kpi
          label="Urgent orders"
          value={urgent.length}
          detail="Urgent and STAT"
          icon={Clock3}
          tone="amber"
        />
        <Kpi
          label="Completed today"
          value={completedToday.length}
          detail="Results finalized"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2.4fr)_minmax(18rem,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <Card title="Laboratory work queue">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-3">
              {(["ALL", "SAMPLE", "PROGRESS", "RESULTS", "COMPLETED"] as QueueTab[]).map(
                (value) => (
                  <button
                    key={value}
                    onClick={() => setTab(value)}
                    className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold ${tab === value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                  >
                    {value === "ALL"
                      ? "All"
                      : value === "SAMPLE"
                        ? "Sample collection"
                        : value === "PROGRESS"
                          ? "In progress"
                          : value === "RESULTS"
                            ? "Results entry"
                            : "Completed"}
                  </button>
                ),
              )}
            </div>
            <div className="overflow-x-auto">
              {filtered.length ? (
                <table className="data-table lab-queue-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Patient</th>
                      <th>Tests</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Waiting</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((visit) => {
                      const patient = dashboardPatient(visit);
                      const minutes = elapsedMinutes(visit["createdAt"]);
                      const stage = completed(visit)
                        ? "COMPLETED"
                        : !collected(visit)
                          ? "SAMPLE COLLECTION"
                          : pendingTests(visit)
                            ? "RESULTS ENTRY"
                            : dashboardText(visit["status"]);
                      return (
                        <tr key={dashboardText(visit["id"])}>
                          <td>
                            <p className="font-bold text-slate-900">
                              {dashboardText(visit["visitNumber"])}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {shortTime(visit["createdAt"])}
                            </p>
                          </td>
                          <td>
                            <p className="font-semibold text-slate-900">
                              {dashboardText(patient["name"])}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {dashboardText(patient["age"])} yrs ·{" "}
                              {dashboardText(patient["sex"]) || "—"}
                            </p>
                          </td>
                          <td>{dashboardRows(visit["tests"]).length}</td>
                          <td>
                            <LabPriorityChip
                              value={dashboardText(visit["priority"] ?? "ROUTINE")}
                            />
                          </td>
                          <td>
                            <LabStageChip value={stage} />
                          </td>
                          <td
                            className={
                              minutes >= 30 && !completed(visit)
                                ? "font-bold text-rose-600"
                                : "text-slate-500"
                            }
                          >
                            {completed(visit) ? "—" : `${minutes} min`}
                          </td>
                          <td>
                            <Link
                              className={!completed(visit) ? "btn-primary" : "btn-secondary"}
                              to="/lab/orders"
                            >
                              {completed(visit)
                                ? "View"
                                : !collected(visit)
                                  ? "Collect sample"
                                  : collected(visit)
                                    ? "Enter results"
                                    : "View"}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <EmptyState
                  title="Queue is clear"
                  description="No laboratory orders match this stage."
                />
              )}
            </div>
            <div className="border-t border-slate-100 p-4 text-center">
              <Link className="text-sm font-bold text-blue-700" to="/lab/orders">
                View all laboratory orders →
              </Link>
            </div>
          </Card>
          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Specimen summary">
              <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
                {Object.entries(specimenCounts)
                  .slice(0, 4)
                  .map(([type, count]) => (
                    <div key={type} className="text-center">
                      <span className="mx-auto grid size-10 place-items-center rounded-full bg-blue-50 text-blue-600">
                        <Droplets size={17} />
                      </span>
                      <p className="mt-2 truncate text-xs text-slate-500">{type}</p>
                      <p className="mt-1 text-xl font-extrabold text-slate-950">{count}</p>
                    </div>
                  ))}
                {!Object.keys(specimenCounts).length ? (
                  <p className="col-span-full text-sm text-slate-500">No specimens yet.</p>
                ) : null}
              </div>
            </Card>
            <Card title="Turnaround time (TAT)">
              <div className="p-5">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">Average TAT today</p>
                    <p className="mt-1 text-2xl font-extrabold text-slate-950">
                      {formatMinutes(averageTat)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Target</p>
                    <p className="mt-1 text-xl font-bold text-slate-800">4h 00m</p>
                  </div>
                </div>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-emerald-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{
                      width: `${Math.min(100, averageTat ? (averageTat / 240) * 100 : 0)}%`,
                    }}
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
        <aside className="min-w-0 space-y-6">
          <Card title="Today's workload">
            <div className="space-y-3 p-4">
              <WorkloadRow time="Now" label={`${samples.length} samples awaiting collection`} />
              <WorkloadRow time="Next" label={`${inProgress.length} orders under testing`} />
              <WorkloadRow
                time="Review"
                label={`${inProgress.filter((visit) => pendingTests(visit) === 0).length} results ready to finalize`}
              />
              <Link className="btn-secondary w-full" to="/lab/orders">
                Open laboratory
              </Link>
            </div>
          </Card>
          <Card title="Recent completed">
            <div className="divide-y divide-slate-100">
              {latestDashboardRowPerPatient(all.filter(completed))
                .slice(0, 5)
                .map((visit) => (
                  <div
                    key={dashboardText(visit["id"])}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-50 text-violet-600">
                      <FlaskConical size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900">
                        {dashboardText(dashboardPatient(visit)["name"])}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {dashboardText(visit["visitNumber"])}
                      </span>
                    </span>
                    <span className="text-xs text-slate-400">
                      {shortTime(visit["completedAt"])}
                    </span>
                  </div>
                ))}
              {!all.some(completed) ? (
                <p className="p-5 text-sm text-slate-500">No completed results yet.</p>
              ) : null}
            </div>
          </Card>
          <Card title="Alerts & notifications">
            <div className="space-y-3 p-4">
              {samples.filter((visit) => elapsedMinutes(visit["createdAt"]) >= 30).length ? (
                <Alert icon={Clock3} text="Samples have been waiting over 30 minutes" />
              ) : null}
              {urgent.length ? (
                <Alert icon={Clock3} text={`${urgent.length} urgent orders`} />
              ) : null}
              {!urgent.length && !samples.length ? (
                <p className="text-sm text-slate-500">No laboratory alerts.</p>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function formatMinutes(minutes: number) {
  if (!minutes) return "—";
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
function WorkloadRow({ time, label }: { time: string; label: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-100 p-3">
      <span className="w-12 shrink-0 text-xs font-bold text-blue-700">{time}</span>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </div>
  );
}
function Alert({ icon: Icon, text }: { icon: typeof Clock3; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-amber-600">
        <Icon size={16} />
      </span>
      <p className="text-sm font-bold text-slate-800">{text}</p>
    </div>
  );
}

function LabPriorityChip({ value }: { value: string }) {
  const urgent = value === "URGENT" || value === "STAT";
  return (
    <span
      className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${
        urgent ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"
      }`}
    >
      {value}
    </span>
  );
}

function LabStageChip({ value }: { value: string }) {
  const tone =
    value === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700"
      : value === "RESULTS ENTRY"
        ? "bg-violet-50 text-violet-700"
        : "bg-blue-50 text-blue-700";
  return (
    <span className={`inline-flex rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${tone}`}>
      {value}
    </span>
  );
}
