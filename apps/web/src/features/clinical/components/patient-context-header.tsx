import { ArrowLeft, Clock3, History, Phone, ShieldAlert } from "lucide-react";
import { navigate } from "../../../lib/navigation";
import { StatusBadge } from "../../../components/ui";
import { clinicalRows, clinicalText, type ClinicalRow } from "../types/clinical-types";

export function PatientContextHeader({
  visit,
  history,
}: {
  visit: ClinicalRow;
  history: ClinicalRow | undefined;
}) {
  const patient = (visit["patient"] ?? {}) as ClinicalRow;
  const previousVisits = clinicalRows(history?.["visits"]).filter(
    (item) => clinicalText(item["id"], "") !== clinicalText(visit["id"], ""),
  );
  return (
    <header className="clinical-patient-header">
      <button className="clinical-back-link" onClick={() => navigate("/doctor/queue")}>
        <ArrowLeft size={17} /> My Queue
      </button>
      <div className="clinical-patient-heading">
        <div>
          <p className="clinical-kicker">Doctor patient workspace</p>
          <h1>{clinicalText(patient["name"])}</h1>
          <p>
            {clinicalText(patient["patientNumber"])} · {clinicalText(patient["age"])} years ·{" "}
            {clinicalText(patient["sex"])}
          </p>
        </div>
        <div className="clinical-visit-identity">
          <strong>{clinicalText(visit["visitNumber"])}</strong>
          <StatusBadge value={clinicalText(visit["status"])} />
        </div>
      </div>
      <dl className="clinical-context-strip">
        <div>
          <Phone size={16} />
          <dt>Phone</dt>
          <dd>{clinicalText(patient["phone"], "Not recorded")}</dd>
        </div>
        <div>
          <ShieldAlert size={16} />
          <dt>Allergies</dt>
          <dd>{clinicalText(patient["allergies"], "None recorded")}</dd>
        </div>
        <div>
          <History size={16} />
          <dt>Previous visits</dt>
          <dd>{previousVisits.length}</dd>
        </div>
        <div>
          <Clock3 size={16} />
          <dt>Current stage</dt>
          <dd>{clinicalText(visit["status"]).replaceAll("_", " ")}</dd>
        </div>
      </dl>
    </header>
  );
}
