import { date, EmptyState, StatusBadge } from "../../../components/ui";
import { clinicalRows, clinicalText, type ClinicalRow } from "../types/clinical-types";

export function PatientHistoryPanel({
  history,
  currentVisitId,
}: {
  history: ClinicalRow | undefined;
  currentVisitId: string;
}) {
  const visits = clinicalRows(history?.["visits"]).filter(
    (visit) => clinicalText(visit["id"], "") !== currentVisitId,
  );
  if (!visits.length)
    return (
      <EmptyState
        title="No previous clinical history"
        description="This is the patient's first recorded clinical visit."
      />
    );
  return (
    <div className="clinical-history-list">
      {visits.map((visit) => (
        <article key={clinicalText(visit["id"])}>
          <div>
            <strong>{date(visit["createdAt"])}</strong>
            <StatusBadge value={clinicalText(visit["status"])} />
          </div>
          <p>
            <b>Chief complaint:</b> {clinicalText(visit["chiefComplaint"], "Not recorded")}
          </p>
          <p>
            <b>Final diagnosis:</b>{" "}
            {clinicalRows(visit["diagnoses"])
              .filter((item) => item["type"] === "FINAL")
              .map((item) => clinicalText(item["description"]))
              .join(", ") || "Not recorded"}
          </p>
          <p>
            <b>Lab tests:</b>{" "}
            {clinicalRows(visit["labVisits"])
              .flatMap((order) =>
                clinicalRows(order["tests"]).map((test) => clinicalText(test["testName"])),
              )
              .join(", ") || "No tests"}
          </p>
        </article>
      ))}
    </div>
  );
}
