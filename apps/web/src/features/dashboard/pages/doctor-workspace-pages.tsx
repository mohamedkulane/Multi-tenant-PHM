import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarDays, CheckCircle2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { getData, sendData } from "../../../api/client";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
} from "../../../components/ui";
import { showToast } from "../../../components/toast";
import { Link } from "../../../lib/navigation";
import type { Branch } from "../../../types";
import {
  dashboardPatient,
  dashboardRows,
  dashboardText,
  shortTime,
  type DashboardRow,
} from "./dashboard-utils";

export type DoctorWorkspaceMode =
  "queue" | "active" | "results" | "completed" | "patients" | "history";
const modeInfo: Record<DoctorWorkspaceMode, { title: string; description: string }> = {
  queue: {
    title: "My patient queue",
    description: "Patients waiting for your examination and clinical review.",
  },
  active: {
    title: "Active visits",
    description: "Consultations currently in examination or review.",
  },
  results: {
    title: "Patient laboratory results",
    description: "Search by patient or visit, then review and print that visit's results.",
  },
  completed: { title: "Completed visits", description: "Doctor reviews completed and handed off." },
  patients: {
    title: "My patients",
    description: "Patients seen or assigned to you in this branch.",
  },
  history: {
    title: "Clinical history",
    description: "Search and review your previous clinical visits.",
  },
};

function useDoctorVisits(branch: Branch | undefined) {
  return useQuery({
    queryKey: ["clinic-visits", branch?.id],
    queryFn: () => getData<DashboardRow[]>(`/clinic/visits?branchId=${branch!.id}`),
    enabled: Boolean(branch),
    refetchInterval: 30_000,
  });
}

function resultTests(visit: DashboardRow) {
  return dashboardRows(visit["labVisits"]).flatMap((order) => dashboardRows(order["tests"]));
}

function hasLaboratoryResult(visit: DashboardRow) {
  return resultTests(visit).some(
    (test) => (dashboardText(test["resultStatus"]) || "PENDING") !== "PENDING",
  );
}

export function DoctorWorkspacePage({
  branch,
  mode,
}: {
  branch: Branch | undefined;
  mode: DoctorWorkspaceMode;
}) {
  const [search, setSearch] = useState("");
  const query = useDoctorVisits(branch);
  if (!branch) return <EmptyState title="Choose a branch" />;
  if (query.isLoading) return <LoadingState label="Loading clinical records" />;
  if (query.error) return <ErrorState error={query.error} />;
  const searchText = search.trim().toLowerCase();
  const selected = (query.data ?? []).filter((visit) => {
    const status = dashboardText(visit["status"]);
    if (
      mode === "queue" &&
      !["WAITING_FOR_DOCTOR", "DOCTOR_REVIEW", "LAB_RESULTS_READY", "RESULTS_READY"].includes(
        status,
      )
    )
      return false;
    if (mode === "active" && !["IN_EXAMINATION", "IN_CONSULTATION"].includes(status)) return false;
    if (mode === "results" && !hasLaboratoryResult(visit)) return false;
    if ((mode === "completed" || mode === "history") && status !== "COMPLETED") return false;
    const patient = dashboardPatient(visit);
    return (
      !searchText ||
      [
        patient["name"],
        patient["patientNumber"],
        patient["phone"],
        visit["visitNumber"],
        status,
        ...dashboardRows(visit["labVisits"]).flatMap((order) => [
          order["visitNumber"],
          ...dashboardRows(order["tests"]).flatMap((test) => [
            test["testName"],
            test["resultValue"],
            test["resultStatus"],
          ]),
        ]),
      ].some((value) => dashboardText(value).toLowerCase().includes(searchText))
    );
  });
  const records =
    mode === "patients"
      ? [
          ...new Map(
            selected.map((visit) => [dashboardText(dashboardPatient(visit)["id"]), visit]),
          ).values(),
        ]
      : selected;
  return (
    <>
      <PageHeader eyebrow="Clinical care" {...modeInfo[mode]} />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <label className="relative block max-w-xl">
            <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="input pl-10"
              placeholder={
                mode === "results"
                  ? "Search patient, visit, lab order, test or result"
                  : "Search patient, visit number or status"
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          {records.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Visit</th>
                  <th>Status</th>
                  <th>Arrival</th>
                  {mode === "results" ? <th>Tests</th> : null}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {records.map((visit) => {
                  const patient = dashboardPatient(visit);
                  return (
                    <tr key={dashboardText(visit["id"])}>
                      <td>
                        <p className="font-bold text-slate-900">{dashboardText(patient["name"])}</p>
                        <p className="text-xs text-slate-500">
                          {dashboardText(patient["patientNumber"])} ·{" "}
                          {dashboardText(patient["age"])} yrs ·{" "}
                          {dashboardText(patient["sex"]) || "—"}
                        </p>
                      </td>
                      <td className="font-mono text-xs">{dashboardText(visit["visitNumber"])}</td>
                      <td>
                        <StatusBadge value={dashboardText(visit["status"])} />
                      </td>
                      <td>{shortTime(visit["createdAt"])}</td>
                      {mode === "results" ? <td>{resultTests(visit).length}</td> : null}
                      <td>
                        <Link
                          className="btn-primary"
                          to={
                            mode === "results"
                              ? `/doctor/visits/${dashboardText(visit["id"])}/lab-results`
                              : `/clinic/visits/${dashboardText(visit["id"])}`
                          }
                        >
                          {mode === "results" ? "View" : "Open patient"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="No matching records"
              description="Records assigned to you will appear here."
            />
          )}
        </div>
      </Card>
    </>
  );
}

export function DoctorCalendarPage({ branch }: { branch: Branch | undefined }) {
  const query = useDoctorVisits(branch);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index);
        return date;
      }),
    [],
  );
  if (!branch) return <EmptyState title="Choose a branch" />;
  if (query.isLoading) return <LoadingState label="Loading doctor calendar" />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Clinical care"
        title="Calendar"
        description="Your seven-day clinical workload based on assigned patient visits."
      />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {days.map((day) => {
          const items = (query.data ?? []).filter((visit) => {
            const created = new Date(String(visit["createdAt"]));
            return created.toDateString() === day.toDateString();
          });
          return (
            <Card
              key={day.toISOString()}
              title={new Intl.DateTimeFormat(undefined, {
                weekday: "long",
                day: "2-digit",
                month: "short",
              }).format(day)}
              description={`${items.length} visits`}
            >
              <div className="divide-y divide-slate-100">
                {items.map((visit) => (
                  <Link
                    key={dashboardText(visit["id"])}
                    to={`/clinic/visits/${dashboardText(visit["id"])}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                      <CalendarDays size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900">
                        {dashboardText(dashboardPatient(visit)["name"])}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {shortTime(visit["createdAt"])}
                      </span>
                    </span>
                    <StatusBadge value={dashboardText(visit["status"])} />
                  </Link>
                ))}
                {!items.length ? (
                  <p className="p-5 text-sm text-slate-500">No assigned visits.</p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}

interface MessageEnvelope {
  unread: number;
  items: DashboardRow[];
}
export function DoctorMessagesPage({ branch }: { branch: Branch | undefined }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", branch?.id, "messages"],
    queryFn: () => getData<MessageEnvelope>(`/notifications?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const markRead = useMutation({
    mutationFn: (id: string) => sendData("post", `/notifications/${id}/read`),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["notifications", branch?.id] });
      showToast({ title: "Message marked as read" });
    },
  });
  if (!branch) return <EmptyState title="Choose a branch" />;
  if (query.isLoading) return <LoadingState label="Loading messages" />;
  if (query.error) return <ErrorState error={query.error} />;
  const messages = query.data?.items ?? [];
  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Messages"
        description="Organization notices and clinical workspace messages sent to your account."
        actions={
          <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
            {query.data?.unread ?? 0} unread
          </span>
        }
      />
      <Card>
        {messages.length ? (
          <div className="divide-y divide-slate-100">
            {messages.map((message) => (
              <article
                key={dashboardText(message["id"])}
                className={`flex gap-4 p-5 ${message["readAt"] ? "bg-white" : "bg-blue-50/40"}`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                  <Bell size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">{dashboardText(message["title"])}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(String(message["createdAt"])).toLocaleString()}
                      </p>
                    </div>
                    {message["readAt"] ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 size={14} /> Read
                      </span>
                    ) : (
                      <button
                        className="btn-secondary"
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(dashboardText(message["id"]))}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {dashboardText(message["message"])}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No messages"
            description="New organization messages will appear here."
          />
        )}
      </Card>
    </>
  );
}
