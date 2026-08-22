import { Check, Circle } from "lucide-react";
import { date } from "../../../components/ui";
import { clinicalRows, type ClinicalRow } from "../types/clinical-types";

export function VisitTimeline({ visit }: { visit: ClinicalRow }) {
  const assessment = (visit["clinicalAssessment"] ?? {}) as ClinicalRow;
  const lab = clinicalRows(visit["labVisits"])[0];
  const events = [
    [visit["createdAt"], "Visit created"],
    [visit["consultationPaidAt"], "Consultation paid"],
    [assessment["startedAt"], "Examination started"],
    [lab?.["createdAt"], "Laboratory requested"],
    [clinicalRows(lab?.["payments"])[0]?.["createdAt"], "Laboratory paid"],
    [lab?.["sampleCollectedAt"], "Sample collected"],
    [lab?.["completedAt"], "Results completed"],
    [visit["completedAt"], "Doctor review completed"],
  ].filter(([timestamp]) => Boolean(timestamp));
  return (
    <ol className="clinical-timeline">
      {events.map(([timestamp, label], index) => (
        <li key={String(label)}>
          <span>{index === events.length - 1 ? <Circle size={14} /> : <Check size={14} />}</span>
          <time>{date(timestamp)}</time>
          <strong>{String(label)}</strong>
        </li>
      ))}
    </ol>
  );
}
