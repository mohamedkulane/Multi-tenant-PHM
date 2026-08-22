import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { getData } from "../api/client";
import { EmptyState, ErrorState, LoadingState, StatusBadge, date, money } from "../components/ui";
import { navigate } from "../lib/navigation";
import type { TenantPrincipal, Workspace } from "../types";

type Row = Record<string, unknown>;
export type ClinicalPrintKind = "lab" | "consultation-receipt" | "lab-receipt";
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};

function Header({ workspace, title }: { workspace: Workspace; title: string }) {
  return (
    <header className="clinical-print-header">
      <div className="clinical-print-brand">
        {workspace.branding?.logoUrl ? (
          <img src={workspace.branding.logoUrl} alt="Hospital logo" />
        ) : (
          <span className="clinical-print-logo">+</span>
        )}
        <div>
          <h1>{workspace.branding?.displayName || workspace.tenant.name}</h1>
          <p>{workspace.branding?.supportContact || "Clinic · Laboratory · Pharmacy"}</p>
        </div>
      </div>
      <div className="clinical-print-title">
        <strong>{title}</strong>
        <span>{new Date().toLocaleDateString()}</span>
      </div>
    </header>
  );
}

function Patient({ visit }: { visit: Row }) {
  const patient = object(visit["patient"]);
  return (
    <section className="clinical-print-patient">
      <div>
        <span>Patient</span>
        <strong>{text(patient["name"])}</strong>
      </div>
      <div>
        <span>Patient number</span>
        <strong>{text(patient["patientNumber"])}</strong>
      </div>
      <div>
        <span>Visit</span>
        <strong>{text(visit["visitNumber"])}</strong>
      </div>
      <div>
        <span>Age / sex</span>
        <strong>
          {text(patient["age"])} / {text(patient["sex"]) || "—"}
        </strong>
      </div>
    </section>
  );
}

function LabDocument({ visit, workspace }: { visit: Row; workspace: Workspace }) {
  const orders = rows(visit["labVisits"]);
  if (!orders.length) return <EmptyState title="Laboratory order not found" />;
  return (
    <article className="clinical-print-sheet clinical-a4-sheet">
      <Header workspace={workspace} title="LABORATORY RESULT" />
      <Patient visit={visit} />
      <section className="clinical-print-meta">
        <div>
          <span>Visit date</span>
          <strong>{date(visit["createdAt"])}</strong>
        </div>
        <div>
          <span>Lab orders</span>
          <strong>{orders.length}</strong>
        </div>
        <div>
          <span>Tests</span>
          <strong>{orders.reduce((total, order) => total + rows(order["tests"]).length, 0)}</strong>
        </div>
        <div>
          <span>Status</span>
          <StatusBadge value="COMPLETED" />
        </div>
      </section>
      {orders.map((order) => (
        <section key={text(order["id"])} className="patient-lab-print-order">
          <h2>
            {text(order["visitNumber"]) || text(order["id"])} · {date(order["createdAt"])}
          </h2>
          <table className="clinical-print-table">
            <thead>
              <tr>
                <th>Test</th>
                <th>Result</th>
                <th>Interpretation</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {rows(order["tests"]).map((test) => (
                <tr key={text(test["id"])}>
                  <td>{text(test["testName"])}</td>
                  <td>
                    {text(test["resultValue"]) ||
                      text(test["numericValue"]) ||
                      text(test["resultStatus"]) ||
                      "Pending"}
                    {test["unit"] ? ` ${text(test["unit"])}` : ""}
                  </td>
                  <td>{text(test["interpretation"]) || "—"}</td>
                  <td>{text(test["referenceRange"]) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <footer>
        {workspace.branding?.invoiceFooter ||
          "Results must be interpreted with the patient's clinical findings."}
      </footer>
    </article>
  );
}

function Receipt({
  visit,
  workspace,
  type,
}: {
  visit: Row;
  workspace: Workspace;
  type: "CONSULTATION" | "LAB";
}) {
  const payments = rows(visit["clinicalPayments"]).filter(
    (payment) => text(payment["type"]) === type,
  );
  const lab = rows(visit["labVisits"])[0];
  const amount = type === "CONSULTATION" ? visit["consultationFee"] : lab?.["total"];
  return (
    <article className="clinical-print-sheet clinical-receipt-sheet">
      <Header workspace={workspace} title={`${type} RECEIPT`} />
      <Patient visit={visit} />
      <section className="clinical-print-meta">
        <div>
          <span>Receipt #</span>
          <strong>{text(payments[0]?.["receiptNumber"]) || "—"}</strong>
        </div>
        <div>
          <span>Amount</span>
          <strong>{money(amount, workspace.tenant.currencyCode)}</strong>
        </div>
        <div>
          <span>Paid</span>
          <strong>{date(payments[0]?.["createdAt"])}</strong>
        </div>
        <div>
          <span>Method</span>
          <strong>{text(payments[0]?.["method"]) || "—"}</strong>
        </div>
        <div>
          <span>Status</span>
          <StatusBadge value={payments.length ? "PAID" : "PENDING"} />
        </div>
      </section>
      <footer>{workspace.branding?.invoiceFooter || "Thank you."}</footer>
    </article>
  );
}

export function ClinicalPrintPage({
  visitId,
  kind,
  workspace,
  principal,
}: {
  visitId: string;
  kind: ClinicalPrintKind;
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const visit = useQuery({
    queryKey: ["clinic-visit-print", visitId],
    queryFn: () => getData<Row>(`/clinic/visits/${visitId}`),
  });
  const allowed =
    kind === "lab"
      ? ["OWNER", "ADMIN", "DOCTOR", "LAB_TECHNICIAN"].includes(principal.role)
      : ["OWNER", "ADMIN", "RECEPTIONIST"].includes(principal.role);
  if (!allowed)
    return (
      <EmptyState
        title="Print access restricted"
        description="Your role cannot print this clinical document."
      />
    );
  if (visit.isLoading) return <LoadingState label="Preparing print document" />;
  if (visit.error) return <ErrorState error={visit.error} />;
  if (!visit.data) return <EmptyState title="Visit not found" />;
  return (
    <div className="clinical-print-page">
      <div className="clinical-print-actions print:hidden">
        <button
          className="btn-secondary"
          onClick={() =>
            navigate(
              kind === "lab"
                ? `/doctor/visits/${visitId}/lab-results`
                : `/clinic/visits/${visitId}`,
            )
          }
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </button>
      </div>
      {kind === "lab" ? (
        <LabDocument visit={visit.data} workspace={workspace} />
      ) : (
        <Receipt
          visit={visit.data}
          workspace={workspace}
          type={kind === "lab-receipt" ? "LAB" : "CONSULTATION"}
        />
      )}
    </div>
  );
}
