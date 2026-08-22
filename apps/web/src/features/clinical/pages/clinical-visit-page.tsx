import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical, Save, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "../../../api/client";
import { showToast } from "../../../components/toast";
import { Card, ErrorState, Field, LoadingState, StatusBadge } from "../../../components/ui";
import type { TenantPrincipal, Workspace } from "../../../types";
import { LabTestSelector } from "../../laboratory/components/lab-test-selector";
import { clinicalApi } from "../api/clinical-api";
import { clinicalKeys } from "../api/clinical-queries";
import { ClinicalNavigation, type ClinicalSection } from "../components/clinical-navigation";
import { PatientContextHeader } from "../components/patient-context-header";
import { PatientHistoryPanel } from "../components/patient-history-panel";
import { VisitTimeline } from "../components/visit-timeline";
import { clinicalRows, clinicalText, type ClinicalRow } from "../types/clinical-types";

const vitals = [
  ["temperature", "Temperature °C"],
  ["systolicBp", "Systolic BP"],
  ["diastolicBp", "Diastolic BP"],
  ["pulse", "Pulse /min"],
  ["respiratoryRate", "Respiratory rate"],
  ["oxygenSaturation", "Oxygen %"],
  ["weight", "Weight kg"],
  ["height", "Height cm"],
] as const;
const examinations = [
  ["generalAppearance", "General appearance"],
  ["chest", "Chest / respiratory"],
  ["cardiovascular", "Cardiovascular"],
  ["abdomen", "Abdomen"],
  ["skin", "Skin"],
  ["neurological", "Neurological"],
  ["other", "Other findings"],
] as const;
type Assessment = {
  chiefComplaint: string;
  historyPresentIllness: string;
  pastMedicalHistory: string;
  pastSurgicalHistory: string;
  currentMedicines: string;
  allergies: string;
  symptoms: string;
  examinationNotes: string;
  provisionalDiagnosis: string;
  vitalSigns: Record<string, string>;
  physicalExamination: Record<string, string>;
};
const blank: Assessment = {
  chiefComplaint: "",
  historyPresentIllness: "",
  pastMedicalHistory: "",
  pastSurgicalHistory: "",
  currentMedicines: "",
  allergies: "",
  symptoms: "",
  examinationNotes: "",
  provisionalDiagnosis: "",
  vitalSigns: {},
  physicalExamination: {},
};
const asObject = (value: unknown): ClinicalRow =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as ClinicalRow) : {};

export function ClinicalVisitPage({
  visitId,
  principal,
}: {
  visitId: string;
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const client = useQueryClient();
  const [section, setSection] = useState<ClinicalSection>("overview");
  const [assessment, setAssessment] = useState<Assessment>(blank);
  const [loaded, setLoaded] = useState(false);
  const [tests, setTests] = useState<string[]>([]);
  const [priority, setPriority] = useState("ROUTINE");
  const [labNotes, setLabNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const visit = useQuery({
    queryKey: clinicalKeys.visit(visitId),
    queryFn: () => clinicalApi.visit(visitId),
  });
  const catalog = useQuery({ queryKey: clinicalKeys.labCatalog, queryFn: clinicalApi.labCatalog });
  const patientId = clinicalText(asObject(visit.data?.["patient"])["id"], "");
  const history = useQuery({
    queryKey: clinicalKeys.history(patientId),
    queryFn: () => clinicalApi.patientHistory(patientId),
    enabled: Boolean(patientId),
  });
  const canEdit = ["OWNER", "ADMIN", "DOCTOR"].includes(principal.role);
  const refresh = () => client.invalidateQueries({ queryKey: clinicalKeys.visit(visitId) });

  useEffect(() => {
    if (!visit.data || loaded) return;
    const saved = asObject(visit.data["clinicalAssessment"]);
    setAssessment({
      ...blank,
      chiefComplaint: clinicalText(saved["chiefComplaint"], ""),
      historyPresentIllness: clinicalText(saved["historyPresentIllness"], ""),
      pastMedicalHistory: clinicalText(saved["pastMedicalHistory"], ""),
      pastSurgicalHistory: clinicalText(saved["pastSurgicalHistory"], ""),
      currentMedicines: clinicalText(saved["currentMedicines"], ""),
      allergies: clinicalText(saved["allergies"], ""),
      symptoms: clinicalRows(saved["symptoms"]).map(String).join(", "),
      examinationNotes: clinicalText(saved["examinationNotes"], ""),
      provisionalDiagnosis: clinicalText(saved["provisionalDiagnosis"], ""),
      vitalSigns: Object.fromEntries(
        vitals.map(([key]) => [key, clinicalText(asObject(saved["vitalSigns"])[key], "")]),
      ),
      physicalExamination: Object.fromEntries(
        examinations.map(([key]) => [
          key,
          clinicalText(asObject(saved["physicalExamination"])[key], ""),
        ]),
      ),
    });
    setLoaded(true);
  }, [visit.data, loaded]);

  const save = useMutation({
    mutationFn: () =>
      clinicalApi.saveAssessment(visitId, {
        ...assessment,
        chiefComplaint: assessment.chiefComplaint.trim(),
        symptoms: assessment.symptoms
          .split(/[,\n]/)
          .map((item) => item.trim())
          .filter(Boolean),
        vitalSigns: Object.fromEntries(
          Object.entries(assessment.vitalSigns)
            .filter(([, value]) => value !== "")
            .map(([key, value]) => [key, Number(value)]),
        ),
      }),
    onSuccess: async () => {
      showToast({ title: "Clinical record saved" });
      await refresh();
    },
    onError: (error) =>
      showToast({
        title: "Clinical record not saved",
        message: errorMessage(error),
        tone: "error",
      }),
  });
  const orderLab = useMutation({
    mutationFn: () =>
      clinicalApi.requestLaboratory(visitId, {
        testIds: tests,
        priority,
        clinicalNotes: labNotes || undefined,
      }),
    onSuccess: async () => {
      setTests([]);
      showToast({
        title: "Laboratory request sent",
        message: "Patient returns to Reception for laboratory payment.",
      });
      await refresh();
    },
    onError: (error) =>
      showToast({
        title: "Laboratory request not sent",
        message: errorMessage(error),
        tone: "error",
      }),
  });
  const saveDiagnosis = useMutation({
    mutationFn: () =>
      clinicalApi.saveFinalDiagnoses(
        visitId,
        diagnosis
          .split(/\n/)
          .map((description) => ({ description: description.trim() }))
          .filter((item) => item.description),
      ),
    onSuccess: async () => {
      showToast({ title: "Final diagnosis saved" });
      await refresh();
    },
    onError: (error) =>
      showToast({ title: "Diagnosis not saved", message: errorMessage(error), tone: "error" }),
  });
  const complete = useMutation({
    mutationFn: () => clinicalApi.completeDoctorReview(visitId),
    onSuccess: async () => {
      showToast({
        title: "Doctor review completed",
        message:
          "Write medication on the hospital's physical paper. PHMS stores no digital medication order.",
      });
      await refresh();
    },
    onError: (error) =>
      showToast({
        title: "Review cannot be completed",
        message: errorMessage(error),
        tone: "error",
      }),
  });

  if (visit.isLoading) return <LoadingState label="Loading clinical patient record" />;
  if (visit.error || !visit.data) return <ErrorState error={visit.error} />;
  const labOrders = clinicalRows(visit.data["labVisits"]);
  const diagnoses = clinicalRows(visit.data["diagnoses"]);
  return (
    <div className="clinical-visit-page mx-auto max-w-7xl space-y-5">
      <PatientContextHeader visit={visit.data} history={history.data} />
      <ClinicalNavigation value={section} onChange={setSection} />
      {section === "overview" ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Card title="Current clinical overview">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Summary label="Chief complaint" value={assessment.chiefComplaint} />
              <Summary label="Symptoms" value={assessment.symptoms} />
              <Summary label="Provisional diagnosis" value={assessment.provisionalDiagnosis} />
              <Summary label="Laboratory orders" value={String(labOrders.length)} />
            </div>
          </Card>
          <Card title="Visit timeline">
            <div className="p-5">
              <VisitTimeline visit={visit.data} />
            </div>
          </Card>
        </div>
      ) : null}
      {section === "assessment" ? (
        <Card
          title="Patient assessment"
          description="Record the patient's own account manually. PHMS does not infer symptoms or diagnoses."
        >
          <div className="grid gap-5 p-5 md:grid-cols-2">
            <TextArea
              label="Chief complaint *"
              value={assessment.chiefComplaint}
              onChange={(value) => setAssessment({ ...assessment, chiefComplaint: value })}
            />
            <TextArea
              label="Symptoms: onset, duration, severity"
              value={assessment.symptoms}
              onChange={(value) => setAssessment({ ...assessment, symptoms: value })}
            />
            <TextArea
              label="History of present illness"
              value={assessment.historyPresentIllness}
              onChange={(value) => setAssessment({ ...assessment, historyPresentIllness: value })}
            />
            <TextArea
              label="Medical history"
              value={assessment.pastMedicalHistory}
              onChange={(value) => setAssessment({ ...assessment, pastMedicalHistory: value })}
            />
            <TextArea
              label="Surgical history"
              value={assessment.pastSurgicalHistory}
              onChange={(value) => setAssessment({ ...assessment, pastSurgicalHistory: value })}
            />
            <TextArea
              label="Current medicines"
              value={assessment.currentMedicines}
              onChange={(value) => setAssessment({ ...assessment, currentMedicines: value })}
            />
            <TextArea
              label="Allergies"
              value={assessment.allergies}
              onChange={(value) => setAssessment({ ...assessment, allergies: value })}
            />
          </div>
          <Action
            mutation={save}
            disabled={!canEdit || !assessment.chiefComplaint.trim()}
            label="Save assessment"
          />
        </Card>
      ) : null}
      {section === "examination" ? (
        <div className="space-y-5">
          <Card title="Vital signs">
            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              {vitals.map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    inputMode="decimal"
                    value={assessment.vitalSigns[key] ?? ""}
                    onChange={(event) =>
                      setAssessment({
                        ...assessment,
                        vitalSigns: { ...assessment.vitalSigns, [key]: event.target.value },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          </Card>
          <Card
            title="Physical examination"
            description="Expand and record only the systems examined."
          >
            <div className="divide-y divide-slate-100 p-5">
              {examinations.map(([key, label]) => (
                <details key={key} className="py-3">
                  <summary className="cursor-pointer font-semibold text-slate-800">{label}</summary>
                  <textarea
                    className="mt-3"
                    value={assessment.physicalExamination[key] ?? ""}
                    onChange={(event) =>
                      setAssessment({
                        ...assessment,
                        physicalExamination: {
                          ...assessment.physicalExamination,
                          [key]: event.target.value,
                        },
                      })
                    }
                  />
                </details>
              ))}
              <TextArea
                label="Examination notes"
                value={assessment.examinationNotes}
                onChange={(value) => setAssessment({ ...assessment, examinationNotes: value })}
              />
              <div className="mt-4">
                <TextArea
                  label="Provisional / differential diagnosis"
                  value={assessment.provisionalDiagnosis}
                  onChange={(value) =>
                    setAssessment({ ...assessment, provisionalDiagnosis: value })
                  }
                />
              </div>
            </div>
            <Action
              mutation={save}
              disabled={!canEdit || !assessment.chiefComplaint.trim()}
              label="Save examination"
            />
          </Card>
        </div>
      ) : null}
      {section === "laboratory" ? (
        <Card
          title="Request laboratory tests"
          description="Choose the tests supported by the patient's symptoms and clinical findings."
        >
          <div className="space-y-5 p-5">
            <LabTestSelector categories={catalog.data ?? []} selected={tests} onChange={setTests} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Priority">
                <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                  <option value="ROUTINE">Routine</option>
                  <option value="URGENT">Urgent</option>
                  <option value="STAT">Stat</option>
                </select>
              </Field>
              <TextArea
                label="Clinical notes for laboratory"
                value={labNotes}
                onChange={setLabNotes}
              />
            </div>
            {labOrders.length ? (
              <div className="space-y-2">
                <h3 className="font-bold">Existing orders</h3>
                {labOrders.map((order) => (
                  <div
                    key={clinicalText(order["id"])}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"
                  >
                    <span>
                      {clinicalRows(order["tests"])
                        .map((test) => clinicalText(test["testName"]))
                        .join(", ")}
                    </span>
                    <StatusBadge value={clinicalText(order["status"])} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <Action
            mutation={orderLab}
            disabled={!canEdit || tests.length === 0}
            label="Send request — patient returns to Reception"
            icon="lab"
          />
        </Card>
      ) : null}
      {section === "diagnosis" ? (
        <Card
          title="Final diagnosis"
          description="Enter one diagnosis per line after reviewing the patient and all requested laboratory results."
        >
          <div className="p-5">
            <TextArea label="Final diagnoses *" value={diagnosis} onChange={setDiagnosis} />
            {diagnoses.length ? (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                <strong>Recorded:</strong>{" "}
                {diagnoses
                  .filter((item) => item["type"] === "FINAL")
                  .map((item) => clinicalText(item["description"]))
                  .join(", ") || "No final diagnosis"}
              </div>
            ) : null}
          </div>
          <Action
            mutation={saveDiagnosis}
            disabled={!canEdit || !diagnosis.trim()}
            label="Save final diagnosis"
          />
        </Card>
      ) : null}
      {section === "summary" ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Card title="Clinical summary">
            <div className="space-y-4 p-5">
              <Summary label="Chief complaint" value={assessment.chiefComplaint} />
              <Summary label="Symptoms" value={assessment.symptoms} />
              <Summary label="Examination" value={assessment.examinationNotes} />
              <Summary
                label="Final diagnosis"
                value={diagnoses
                  .filter((item) => item["type"] === "FINAL")
                  .map((item) => clinicalText(item["description"]))
                  .join(", ")}
              />
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <strong>Medication is written outside PHMS.</strong>
                <p className="mt-1">
                  Complete the review, then write medication manually on the hospital's physical
                  paper.
                </p>
              </div>
            </div>
            <Action
              mutation={complete}
              disabled={!canEdit || complete.isPending || visit.data["status"] === "COMPLETED"}
              label={
                visit.data["status"] === "COMPLETED"
                  ? "Doctor review completed"
                  : "Complete doctor review"
              }
            />
          </Card>
          <Card title="Patient history">
            <div className="p-4">
              <PatientHistoryPanel history={history.data} currentVisitId={visitId} />
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{value || "Not recorded"}</p>
    </div>
  );
}
function Action({
  mutation,
  disabled,
  label,
  icon,
}: {
  mutation: { mutate: () => void; isPending: boolean };
  disabled: boolean;
  label: string;
  icon?: "lab";
}) {
  return (
    <div className="border-t border-slate-100 p-5">
      <button
        className="btn-primary inline-flex items-center justify-center gap-2"
        disabled={disabled || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {icon ? (
          <FlaskConical size={17} />
        ) : label.includes("Complete") ? (
          <CheckCircle2 size={17} />
        ) : label.includes("assessment") ? (
          <Stethoscope size={17} />
        ) : (
          <Save size={17} />
        )}
        {mutation.isPending ? "Saving…" : label}
      </button>
    </div>
  );
}
