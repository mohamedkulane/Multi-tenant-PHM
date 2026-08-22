import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusBadge,
  date,
} from "../../../components/ui";
import { Link } from "../../../lib/navigation";
import { clinicalApi } from "../api/clinical-api";
import { clinicalKeys } from "../api/clinical-queries";
import { clinicalRows, clinicalText, type ClinicalRow } from "../types/clinical-types";

function asObject(value: unknown): ClinicalRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ClinicalRow) : {};
}

function resultValue(test: ClinicalRow) {
  const value =
    clinicalText(test["resultValue"], "") ||
    clinicalText(test["numericValue"], "") ||
    clinicalText(test["resultStatus"], "PENDING");
  return `${value}${test["unit"] ? ` ${clinicalText(test["unit"])}` : ""}`;
}

export function VisitLabResultsPage({ visitId }: { visitId: string }) {
  const [search, setSearch] = useState("");
  const visit = useQuery({
    queryKey: clinicalKeys.visit(visitId),
    queryFn: () => clinicalApi.visit(visitId),
  });
  const orders = clinicalRows(visit.data?.["labVisits"]);
  const query = search.trim().toLowerCase();
  const filteredOrders = useMemo(
    () =>
      orders
        .map((order): ClinicalRow => ({
          ...order,
          tests: clinicalRows(order["tests"]).filter((test) =>
            query
              ? [
                  test["testName"],
                  test["categoryName"],
                  test["resultValue"],
                  test["resultStatus"],
                  test["interpretation"],
                ].some((value) => clinicalText(value, "").toLowerCase().includes(query))
              : true,
          ),
        }))
        .filter((order) => clinicalRows(order["tests"]).length > 0),
    [orders, query],
  );

  if (visit.isLoading) return <LoadingState label="Loading laboratory results" />;
  if (visit.error || !visit.data) return <ErrorState error={visit.error} />;

  const patient = asObject(visit.data["patient"]);
  const testCount = orders.reduce((total, order) => total + clinicalRows(order["tests"]).length, 0);
  const hasCompletedResult = orders.some((order) =>
    clinicalRows(order["tests"]).some(
      (test) => clinicalText(test["resultStatus"], "PENDING") !== "PENDING",
    ),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Link className="btn-secondary" to="/doctor/lab-results">
        <ArrowLeft size={16} /> Back to lab results
      </Link>
      <PageHeader
        eyebrow="Laboratory results"
        title={clinicalText(patient["name"])}
        description={`${clinicalText(patient["patientNumber"])} · Visit ${clinicalText(visit.data["visitNumber"])} · ${date(visit.data["createdAt"])}`}
        actions={
          hasCompletedResult ? (
            <Link className="btn-primary" to={`/clinic/visits/${visitId}/print/lab`}>
              <Printer size={17} /> Print this visit
            </Link>
          ) : null
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Visit date" value={date(visit.data["createdAt"])} />
        <Summary label="Lab orders" value={orders.length} />
        <Summary label="Tests" value={testCount} />
      </div>
      <Card>
        <div className="border-b border-slate-100 p-4">
          <label className="relative block max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              className="input pl-10"
              placeholder="Search a test or result in this visit"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="space-y-4 p-4">
          {filteredOrders.map((order) => (
            <section
              key={clinicalText(order["id"])}
              className="overflow-hidden rounded-xl border border-slate-200"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-mono text-xs font-bold text-slate-600">
                    {clinicalText(order["visitNumber"])}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Ordered {date(order["createdAt"])}</p>
                </div>
                <StatusBadge value={clinicalText(order["status"])} />
              </header>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Result</th>
                      <th>Interpretation</th>
                      <th>Reference range</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clinicalRows(order["tests"]).map((test) => (
                      <tr key={clinicalText(test["id"])}>
                        <td>
                          <strong>{clinicalText(test["testName"])}</strong>
                          <p className="text-xs text-slate-500">
                            {clinicalText(test["categoryName"])}
                          </p>
                        </td>
                        <td className="font-bold">{resultValue(test)}</td>
                        <td>{clinicalText(test["interpretation"], "Not specified")}</td>
                        <td>{clinicalText(test["referenceRange"], "Not configured")}</td>
                        <td>{clinicalText(test["resultNote"], "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
          {!filteredOrders.length ? (
            <EmptyState
              title={orders.length ? "No matching tests" : "No laboratory results for this visit"}
              description={
                orders.length
                  ? "Try another test or result search."
                  : "Results ordered for this visit will appear here."
              }
            />
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-slate-950">{value}</p>
    </div>
  );
}
