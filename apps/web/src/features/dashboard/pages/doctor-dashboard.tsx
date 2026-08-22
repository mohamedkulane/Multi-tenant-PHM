import {
  Activity,
  CalendarDays,
  CheckCircle2,
  FlaskConical,
  History,
  Search,
  Stethoscope,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, EmptyState, StatusBadge } from "../../../components/ui";
import { Link } from "../../../lib/navigation";
import type { TenantPrincipal } from "../../../types";
import {
  dashboardPatient,
  dashboardRows,
  dashboardText,
  elapsedMinutes,
  isToday,
  shortTime,
  type DashboardRow,
} from "./dashboard-utils";

const waitingStatuses = ["WAITING_FOR_DOCTOR"];
const activeStatuses = ["IN_EXAMINATION", "IN_CONSULTATION"];
const resultStatuses = ["LAB_RESULTS_READY", "RESULTS_READY", "DOCTOR_REVIEW"];
const status = (visit: DashboardRow) => dashboardText(visit["status"]);

export function DoctorDashboard({
  principal,
  visits,
}: {
  principal: TenantPrincipal;
  visits: DashboardRow[];
}) {
  const todayVisits = visits.filter((visit) => isToday(visit["createdAt"]));
  const waiting = visits.filter((visit) => waitingStatuses.includes(status(visit)));
  const active = visits.filter((visit) => activeStatuses.includes(status(visit)));
  const results = visits.filter((visit) => resultStatuses.includes(status(visit)));
  const completedToday = visits.filter(
    (visit) => status(visit) === "COMPLETED" && isToday(visit["completedAt"] ?? visit["updatedAt"]),
  );
  const queue = [...waiting, ...active, ...results]
    .sort(
      (a, b) =>
        new Date(String(a["createdAt"])).getTime() - new Date(String(b["createdAt"])).getTime(),
    )
    .slice(0, 6);
  const consultations = todayVisits.filter((visit) =>
    [...activeStatuses, ...resultStatuses, "COMPLETED"].includes(status(visit)),
  ).length;
  const labRequests = todayVisits.filter(
    (visit) => dashboardRows(visit["labVisits"]).length > 0,
  ).length;
  const completionRate = todayVisits.length
    ? Math.round((completedToday.length / todayVisits.length) * 100)
    : 0;
  return (
    <div className="doctor-dashboard">
      <DashboardGreeting
        name={principal.fullName}
        description="Here's your patient workload for today."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Waiting patients"
          value={waiting.length}
          detail="Ready for examination"
          icon={Users}
          tone="blue"
        />
        <Kpi
          label="In examination"
          value={active.length}
          detail="Active now"
          icon={Stethoscope}
          tone="amber"
        />
        <Kpi
          label="Lab results ready"
          value={results.length}
          detail="Awaiting your review"
          icon={FlaskConical}
          tone="violet"
        />
        <Kpi
          label="Completed today"
          value={completedToday.length}
          detail="Doctor reviews closed"
          icon={CheckCircle2}
          tone="emerald"
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,0.8fr)]">
        <div className="min-w-0 space-y-6">
          <DoctorQueue visits={queue} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Today's summary">
              <div className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
                <Summary
                  icon={Stethoscope}
                  label="Consultations"
                  value={consultations}
                  tone="blue"
                />
                <Summary
                  icon={FlaskConical}
                  label="Lab requests"
                  value={labRequests}
                  tone="violet"
                />
                <Summary icon={Users} label="Waiting" value={waiting.length} tone="amber" />
                <Summary
                  icon={CheckCircle2}
                  label="Completion"
                  value={`${completionRate}%`}
                  tone="emerald"
                />
              </div>
            </Card>
            <Card title="Quick actions">
              <div className="grid gap-3 p-5 sm:grid-cols-2">
                <QuickLink
                  to="/doctor/queue"
                  icon={Activity}
                  label="My queue"
                  detail="Open waiting patients"
                />
                <QuickLink
                  to="/doctor/lab-results"
                  icon={FlaskConical}
                  label="Lab results"
                  detail="Review returned tests"
                />
                <QuickLink
                  to="/doctor/patients"
                  icon={Search}
                  label="Patient search"
                  detail="Find a patient record"
                />
                <QuickLink
                  to="/doctor/history"
                  icon={History}
                  label="Clinical history"
                  detail="Review completed visits"
                />
              </div>
            </Card>
          </div>
          <Card title="Recent activity">
            <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
              {visits.slice(0, 4).map((visit) => (
                <ActivityCard key={dashboardText(visit["id"])} visit={visit} />
              ))}
              {!visits.length ? <p className="text-sm text-slate-500">No activity yet.</p> : null}
            </div>
          </Card>
        </div>
        <aside className="min-w-0 space-y-6">
          <Card title="Today's schedule">
            <div className="space-y-3 p-4">
              {todayVisits.slice(0, 4).map((visit) => (
                <ScheduleRow key={dashboardText(visit["id"])} visit={visit} />
              ))}
              {!todayVisits.length ? (
                <p className="p-3 text-sm text-slate-500">No visits scheduled today.</p>
              ) : null}
              <Link className="btn-secondary w-full" to="/doctor/calendar">
                View calendar
              </Link>
            </div>
          </Card>
          <Card title={`Lab results ready (${results.length})`}>
            <div className="divide-y divide-slate-100">
              {results.slice(0, 5).map((visit) => (
                <ResultRow key={dashboardText(visit["id"])} visit={visit} />
              ))}
              {!results.length ? (
                <p className="p-5 text-sm text-slate-500">No lab results awaiting review.</p>
              ) : null}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export function DashboardGreeting({ name, description }: { name: string; description: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">Welcome back,</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          {name}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="flex w-fit items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <p className="text-sm font-bold text-slate-900">
            {new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              day: "2-digit",
              month: "short",
              year: "numeric",
            }).format(new Date())}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Today</p>
        </div>
        <span className="grid size-10 place-items-center rounded-lg bg-slate-50 text-slate-600">
          <CalendarDays size={19} />
        </span>
      </div>
    </div>
  );
}

export function Kpi({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone: "blue" | "amber" | "violet" | "emerald";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-700">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">{value}</p>
        </div>
        <span className={`grid size-12 shrink-0 place-items-center rounded-full ${colors[tone]}`}>
          <Icon size={22} />
        </span>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-500">{detail}</p>
    </section>
  );
}

function DoctorQueue({ visits }: { visits: DashboardRow[] }) {
  return (
    <Card title="My patient queue" description={`${visits.length} patients need your attention`}>
      <div className="overflow-x-auto">
        {visits.length ? (
          <table className="data-table doctor-queue-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Age / sex</th>
                <th>Visit</th>
                <th>Arrival</th>
                <th>Waiting</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => {
                const patient = dashboardPatient(visit);
                const minutes = elapsedMinutes(visit["createdAt"]);
                const inExam = activeStatuses.includes(status(visit));
                return (
                  <tr key={dashboardText(visit["id"])}>
                    <td>
                      <p className="font-bold text-slate-900">{dashboardText(patient["name"])}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {dashboardText(patient["patientNumber"])}
                      </p>
                    </td>
                    <td>{`${dashboardText(patient["age"])} yrs, ${dashboardText(patient["sex"]) || "—"}`}</td>
                    <td className="font-mono text-xs">{dashboardText(visit["visitNumber"])}</td>
                    <td>{shortTime(visit["createdAt"])}</td>
                    <td
                      className={
                        !inExam && minutes >= 30 ? "font-bold text-rose-600" : "text-slate-500"
                      }
                    >
                      {inExam ? "—" : `${minutes} min`}
                    </td>
                    <td>
                      <StatusBadge value={status(visit)} />
                    </td>
                    <td>
                      <Link
                        className={inExam ? "btn-secondary" : "btn-primary"}
                        to={`/clinic/visits/${dashboardText(visit["id"])}`}
                      >
                        {inExam ? "Continue" : "Open patient"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState title="Queue is clear" description="New clinical work will appear here." />
        )}
      </div>
    </Card>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone: "blue" | "violet" | "amber" | "emerald";
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="text-center">
      <span className={`mx-auto grid size-9 place-items-center rounded-full ${colors[tone]}`}>
        <Icon size={16} />
      </span>
      <p className="mt-2 text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-extrabold text-slate-950">{value}</p>
    </div>
  );
}
function QuickLink({
  to,
  icon: Icon,
  label,
  detail,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  detail: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-slate-900">{label}</span>
        <span className="block truncate text-xs text-slate-500">{detail}</span>
      </span>
    </Link>
  );
}
function ActivityCard({ visit }: { visit: DashboardRow }) {
  return (
    <Link
      to={`/clinic/visits/${dashboardText(visit["id"])}`}
      className="rounded-xl border border-slate-100 bg-slate-50 p-4 hover:bg-emerald-50/40"
    >
      <p className="text-xs font-bold text-emerald-700">{shortTime(visit["updatedAt"])}</p>
      <p className="mt-2 text-sm font-bold text-slate-900">{status(visit).replaceAll("_", " ")}</p>
      <p className="mt-1 truncate text-xs text-slate-500">
        {dashboardText(dashboardPatient(visit)["name"])}
      </p>
    </Link>
  );
}
function ScheduleRow({ visit }: { visit: DashboardRow }) {
  return (
    <Link
      to={`/clinic/visits/${dashboardText(visit["id"])}`}
      className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
    >
      <span className="w-16 shrink-0 text-xs font-bold text-slate-600">
        {shortTime(visit["createdAt"])}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-slate-900">
          {dashboardText(dashboardPatient(visit)["name"])}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {status(visit).replaceAll("_", " ")}
        </span>
      </span>
    </Link>
  );
}
function ResultRow({ visit }: { visit: DashboardRow }) {
  return (
    <Link
      to={`/clinic/visits/${dashboardText(visit["id"])}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
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
      <span className="text-xs text-slate-400">{shortTime(visit["updatedAt"])}</span>
    </Link>
  );
}
