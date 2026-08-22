import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { getData } from "../api/client";
import { EmptyState, ErrorState, LoadingState, StatusBadge, date, money } from "../components/ui";
import { navigate } from "../lib/navigation";
import type { TenantPrincipal, Workspace } from "../types";

type Row = Record<string, unknown>;
export type ClinicalPrintKind = "prescription" | "lab" | "consultation-receipt" | "lab-receipt";

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};

function actorName(visit: Row, membershipId: unknown) {
  const actor = object(object(visit["actors"])[text(membershipId)]);
  return text(actor["name"]) || text(actor["username"]) || "—";
}

function PrintHeader({ workspace, title }: { workspace: Workspace; title: string }) {
  const displayName = workspace.branding?.displayName || workspace.tenant.name;
  return (
    <header className="clinical-print-header">
      <div className="clinical-print-brand">
        {workspace.branding?.invoiceShowLogo !== false && workspace.branding?.logoUrl ? (
          <img src={workspace.branding.logoUrl} alt="Clinic logo" />
        ) : (
          <span className="clinical-print-logo">+</span>
        )}
        <div>
          <h1>{displayName}</h1>
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

function PatientBlock({ visit }: { visit: Row }) {
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
        <span>Visit number</span>
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

function Signature({ label, name }: { label: string; name: string }) {
  return (
    <div className="clinical-print-signature">
      <i />
      <strong>{name}</strong>
      <span>{label}</span>
    </div>
  );
}

function PrescriptionDocument({ visit, workspace }: { visit: Row; workspace: Workspace }) {
  const prescription = rows(visit["prescriptions"])[0];
  if (!prescription) return <EmptyState title="Prescription not found" />;
  return (
    <article className="clinical-print-sheet clinical-a4-sheet">
      <PrintHeader workspace={workspace} title="PRESCRIPTION" />
      <PatientBlock visit={visit} />
      <section className="clinical-print-meta">
        <div>
          <span>Prescription</span>
          <strong>{text(prescription["prescriptionNumber"])}</strong>
        </div>
        <div>
          <span>Date</span>
          <strong>{date(prescription["createdAt"])}</strong>
        </div>
        <div>
          <span>Doctor</span>
          <strong>{actorName(visit, prescription["prescribedByMembershipId"])}</strong>
        </div>
        <div>
          <span>Status</span>
          <StatusBadge value={text(prescription["status"])} />
        </div>
      </section>
      {prescription["diagnosisSnapshot"] ? (
        <section className="clinical-print-note">
          <span>Diagnosis</span>
          <p>{text(prescription["diagnosisSnapshot"])}</p>
        </section>
      ) : null}
      <table className="clinical-print-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Medicine</th>
            <th>Dose / route</th>
            <th>Frequency</th>
            <th>Duration</th>
            <th>Instructions</th>
          </tr>
        </thead>
        <tbody>
          {rows(prescription["items"]).map((item, index) => (
            <tr key={text(item["id"])}>
              <td>{index + 1}</td>
              <td>
                <strong>{text(item["medicineName"])}</strong>
                {item["strength"] ? <small>{text(item["strength"])}</small> : null}
              </td>
              <td>
                {text(item["dosage"])}
                {item["route"] ? ` · ${text(item["route"])}` : ""}
              </td>
              <td>{text(item["frequency"])}</td>
              <td>{text(item["duration"])}</td>
              <td>{text(item["instructions"]) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {prescription["notes"] ? (
        <section className="clinical-print-note">
          <span>Notes</span>
          <p>{text(prescription["notes"])}</p>
        </section>
      ) : null}
      <div className="clinical-print-signatures">
        <Signature
          label="Doctor signature"
          name={actorName(visit, prescription["prescribedByMembershipId"])}
        />
      </div>
      <footer>
        {workspace.branding?.invoiceFooter ||
          "Take medicines only as directed by your clinician."}
      </footer>
    </article>
  );
}

function PanelResult({ value }: { value: unknown }) {
  const components = Array.isArray(value) ? (value as Row[]) : rows(object(value)["components"]);
  if (!components.length) return <span>{text(value) || "—"}</span>;
  return (
    <div className="clinical-panel-results">
      {components.map((component, index) => (
        <span key={text(component["name"]) || index}>
          <strong>{text(component["name"])}</strong>: {text(component["value"])}{" "}
          {text(component["unit"])}
          {component["referenceRange"] ? ` (${text(component["referenceRange"])})` : ""}
        </span>
      ))}
    </div>
  );
}

function LabDocument({ visit, workspace }: { visit: Row; workspace: Workspace }) {
  const lab = rows(visit["labVisits"])[0];
  if (!lab) return <EmptyState title="Laboratory order not found" />;
  const tests = rows(lab["tests"]);
  const technicianId = tests.find((test) => test["markedByMembershipId"])?.["markedByMembershipId"];
  return (
    <article className="clinical-print-sheet clinical-a4-sheet">
      <PrintHeader workspace={workspace} title="LABORATORY REPORT" />
      <PatientBlock visit={visit} />
      <section className="clinical-print-meta">
        <div>
          <span>Lab order</span>
          <strong>{text(lab["visitNumber"])}</strong>
        </div>
        <div>
          <span>Requested by</span>
          <strong>{actorName(visit, lab["requestedByMembershipId"])}</strong>
        </div>
        <div>
          <span>Sample</span>
          <strong>
            {text(lab["sampleType"]) || "—"} · {text(lab["sampleId"]) || "No ID"}
          </strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>{date(lab["completedAt"])}</strong>
        </div>
      </section>
      <table className="clinical-print-table">
        <thead>
          <tr>
            <th>Test</th>
            <th>Result</th>
            <th>Unit</th>
            <th>Reference range</th>
            <th>Interpretation</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => (
            <tr key={text(test["id"])}>
              <td>
                <strong>{text(test["testName"])}</strong>
                <small>{text(test["categoryName"])}</small>
              </td>
              <td>
                {test["resultType"] === "PANEL" ? (
                  <PanelResult value={test["resultData"]} />
                ) : (
                  text(test["numericValue"]) ||
                  text(test["resultValue"]) ||
                  text(test["resultStatus"])
                )}
              </td>
              <td>{text(test["unit"]) || "—"}</td>
              <td>{text(test["referenceRange"]) || "—"}</td>
              <td>{text(test["interpretation"]) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {lab["sampleNotes"] || lab["clinicalNotes"] ? (
        <section className="clinical-print-note">
          <span>Notes</span>
          <p>{text(lab["sampleNotes"]) || text(lab["clinicalNotes"])}</p>
        </section>
      ) : null}
      <div className="clinical-print-signatures">
        <Signature label="Lab technician" name={actorName(visit, technicianId)} />
        <Signature
          label="Requesting doctor"
          name={actorName(visit, lab["requestedByMembershipId"])}
        />
      </div>
      <footer>
        {workspace.branding?.invoiceFooter ||
          "Laboratory results must be interpreted in clinical context."}
      </footer>
    </article>
  );
}

function ReceiptDocument({
  visit,
  workspace,
  type,
}: {
  visit: Row;
  workspace: Workspace;
  type: "CONSULTATION" | "LAB";
}) {
  const payment = rows(visit["clinicalPayments"])
    .filter((item) => item["type"] === type)
    .at(-1);
  if (!payment)
    return (
      <EmptyState title={`${type === "LAB" ? "Laboratory" : "Consultation"} receipt not found`} />
    );
  const patient = object(visit["patient"]);
  return (
    <article className="clinical-print-sheet clinical-receipt-sheet">
      <PrintHeader
        workspace={workspace}
        title={`${type === "LAB" ? "LABORATORY" : "CONSULTATION"} RECEIPT`}
      />
      <div className="clinical-receipt-number">{text(payment["receiptNumber"])}</div>
      <dl className="clinical-receipt-lines">
        <div>
          <dt>Patient</dt>
          <dd>{text(patient["name"])}</dd>
        </div>
        <div>
          <dt>Patient number</dt>
          <dd>{text(patient["patientNumber"])}</dd>
        </div>
        <div>
          <dt>Visit</dt>
          <dd>{text(visit["visitNumber"])}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{type === "LAB" ? "Laboratory tests" : "Consultation fee"}</dd>
        </div>
        <div>
          <dt>Payment method</dt>
          <dd>{text(payment["method"]).replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Date/time</dt>
          <dd>{date(payment["paidAt"])}</dd>
        </div>
        <div>
          <dt>Collected by</dt>
          <dd>{actorName(visit, payment["collectedByMembershipId"])}</dd>
        </div>
      </dl>
      <div className="clinical-receipt-total">
        <span>Amount paid</span>
        <strong>{money(payment["amount"], workspace.tenant.currencyCode)}</strong>
      </div>
      <Signature
        label="Authorized cashier"
        name={actorName(visit, payment["collectedByMembershipId"])}
      />
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
  const receipt = kind.endsWith("receipt");
  const allowed = receipt
    ? ["OWNER", "ADMIN", "RECEPTIONIST"].includes(principal.role)
    : kind === "lab"
      ? ["OWNER", "ADMIN", "DOCTOR", "LAB_TECHNICIAN"].includes(principal.role)
      : ["OWNER", "ADMIN", "DOCTOR"].includes(principal.role);
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
        <button className="btn-secondary" onClick={() => navigate(`/clinic/visits/${visitId}`)}>
          <ArrowLeft size={16} /> Back
        </button>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Print
        </button>
      </div>
      {kind === "prescription" ? (
        <PrescriptionDocument visit={visit.data} workspace={workspace} />
      ) : null}
      {kind === "lab" ? <LabDocument visit={visit.data} workspace={workspace} /> : null}
      {kind === "consultation-receipt" ? (
        <ReceiptDocument visit={visit.data} workspace={workspace} type="CONSULTATION" />
      ) : null}
      {kind === "lab-receipt" ? (
        <ReceiptDocument visit={visit.data} workspace={workspace} type="LAB" />
      ) : null}
    </div>
  );
}
