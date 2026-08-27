import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FlaskConical, Printer, Save, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "../../../api/client";
import { showToast } from "../../../components/toast";
import { Card, ErrorState, Field, LoadingState, StatusBadge } from "../../../components/ui";
import type { TenantPrincipal, Workspace } from "../../../types";
import { Link, navigate } from "../../../lib/navigation";
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
  medicationStatus: string;
  allergies: string;
  allergyStatus: string;
  noSignificantMedicalHistory: boolean;
  noPastSurgery: boolean;
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
  medicationStatus: "UNKNOWN",
  allergies: "",
  allergyStatus: "UNKNOWN",
  noSignificantMedicalHistory: false,
  noPastSurgery: false,
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
  const [disposition, setDisposition] = useState("DISCHARGED");
  const [diagnosticOutcome, setDiagnosticOutcome] = useState("FINAL_DIAGNOSIS");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpInstructions, setFollowUpInstructions] = useState("");
  const [referralDestination, setReferralDestination] = useState("");
  const [referralReason, setReferralReason] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [dispositionNotes, setDispositionNotes] = useState("");
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
      medicationStatus: clinicalText(saved["medicationStatus"], "UNKNOWN"),
      allergies: clinicalText(saved["allergies"], ""),
      allergyStatus: clinicalText(saved["allergyStatus"], "UNKNOWN"),
      noSignificantMedicalHistory: saved["noSignificantMedicalHistory"] === true,
      noPastSurgery: saved["noPastSurgery"] === true,
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
    mutationFn: () =>
      clinicalApi.completeDoctorReview(visitId, {
        disposition,
        diagnosticOutcome,
        followUpDate: followUpDate || undefined,
        followUpInstructions: followUpInstructions || undefined,
        referralDestination: referralDestination || undefined,
        referralReason: referralReason || undefined,
        transferReason: transferReason || undefined,
        dispositionNotes: dispositionNotes || undefined,
      }),
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
      <ClinicalNavigation
        value={section}
        onChange={(nextSection) => {
          if (nextSection === "results") {
            navigate(`/doctor/visits/${visitId}/lab-results`);
            return;
          }
          setSection(nextSection);
        }}
      />
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
              label="Chief complaint (optional)"
              value={assessment.chiefComplaint}
              onChange={(value) => setAssessment({ ...assessment, chiefComplaint: value })}
            />
            <TextArea
              label="Symptoms: onset, duration, severity (optional)"
              value={assessment.symptoms}
              onChange={(value) => setAssessment({ ...assessment, symptoms: value })}
            />
            <TextArea
              label="History of present illness (optional)"
              value={assessment.historyPresentIllness}
              onChange={(value) => setAssessment({ ...assessment, historyPresentIllness: value })}
            />
            <TextArea
              label="Medical history (optional)"
              value={assessment.pastMedicalHistory}
              onChange={(value) => setAssessment({ ...assessment, pastMedicalHistory: value })}
            />
            <TextArea
              label="Surgical history (optional)"
              value={assessment.pastSurgicalHistory}
              onChange={(value) => setAssessment({ ...assessment, pastSurgicalHistory: value })}
            />
            <Field label="Medication status (optional)">
              <select
                value={assessment.medicationStatus}
                onChange={(event) =>
                  setAssessment({
                    ...assessment,
                    medicationStatus: event.target.value,
                    currentMedicines:
                      event.target.value === "TAKING_MEDICATION" ? assessment.currentMedicines : "",
                  })
                }
              >
                <option value="UNKNOWN">Unknown</option>
                <option value="NONE">No current medicines</option>
                <option value="TAKING_MEDICATION">Taking medication</option>
              </select>
            </Field>
            {assessment.medicationStatus === "TAKING_MEDICATION" ? (
              <TextArea
                label="Current medicines *"
                value={assessment.currentMedicines}
                onChange={(value) => setAssessment({ ...assessment, currentMedicines: value })}
              />
            ) : null}
            <Field label="Allergy status (optional)">
              <select
                value={assessment.allergyStatus}
                onChange={(event) =>
                  setAssessment({
                    ...assessment,
                    allergyStatus: event.target.value,
                    allergies: event.target.value === "HAS_ALLERGIES" ? assessment.allergies : "",
                  })
                }
              >
                <option value="UNKNOWN">Unknown</option>
                <option value="NO_KNOWN_ALLERGIES">No known allergies</option>
                <option value="HAS_ALLERGIES">Has allergies</option>
              </select>
            </Field>
            {assessment.allergyStatus === "HAS_ALLERGIES" ? (
              <TextArea
                label="Allergy details *"
                value={assessment.allergies}
                onChange={(value) => setAssessment({ ...assessment, allergies: value })}
              />
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assessment.noSignificantMedicalHistory}
                onChange={(event) =>
                  setAssessment({
                    ...assessment,
                    noSignificantMedicalHistory: event.target.checked,
                    pastMedicalHistory: event.target.checked ? "" : assessment.pastMedicalHistory,
                  })
                }
              />{" "}
              No significant medical history
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assessment.noPastSurgery}
                onChange={(event) =>
                  setAssessment({
                    ...assessment,
                    noPastSurgery: event.target.checked,
                    pastSurgicalHistory: event.target.checked ? "" : assessment.pastSurgicalHistory,
                  })
                }
              />{" "}
              No past surgery
            </label>{" "}
          </div>
          <Action mutation={save} disabled={!canEdit} label="Save assessment" />
        </Card>
      ) : null}
      {section === "examination" ? (
        <div className="space-y-5">
          <section className="clinical-vitals" aria-labelledby="vital-signs-title">
            <h2 id="vital-signs-title" className="mb-2 text-lg font-bold">
              Vital signs
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              Record only the measurements taken. All vital signs are optional.
            </p>
            <div className="clinical-vitals-grid">
              {vitals.map(([key, label]) => (
                <Field key={key} label={label + " (optional)"}>
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
          </section>
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
            <Action mutation={save} disabled={!canEdit} label="Save examination" />
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
                    <span className="flex flex-wrap items-center gap-2">
                      {clinicalText(order["paymentStatus"], "") === "PAID" ? (
                        <StatusBadge value="PAID" />
                      ) : null}
                      <StatusBadge value={clinicalText(order["status"])} />
                    </span>
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
      {section === "results" ? (
        <Card
          title="Laboratory results"
          description="Review the completed laboratory findings before recording the final diagnosis."
        >
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {labOrders.length
                    ? `${labOrders.length} laboratory order${labOrders.length === 1 ? "" : "s"}`
                    : "No laboratory order"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Results are read-only for the Doctor and contain no financial information.
                </p>
              </div>
              {labOrders.some((order) => clinicalText(order["status"]) === "COMPLETED") ? (
                <Link className="btn-secondary" to={`/clinic/visits/${visitId}/print/lab`}>
                  <Printer size={16} /> Print lab report
                </Link>
              ) : null}
            </div>
            {labOrders.map((order) => {
              const orderTests = clinicalRows(order["tests"]);
              return (
                <section
                  key={clinicalText(order["id"])}
                  className="overflow-hidden rounded-2xl border border-slate-200"
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="font-mono text-xs font-bold text-slate-500">
                        {clinicalText(order["visitNumber"])}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {orderTests.length} test{orderTests.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {clinicalText(order["paymentStatus"], "") === "PAID" ? (
                        <StatusBadge value="PAID" />
                      ) : null}
                      <StatusBadge value={clinicalText(order["status"])} />
                    </div>
                  </header>
                  <div className="grid gap-3 p-4 lg:grid-cols-2">
                    {orderTests.map((test) => {
                      const resultData = asObject(test["resultData"]);
                      const result =
                        clinicalText(test["resultValue"], "") ||
                        clinicalText(test["numericValue"], "") ||
                        clinicalText(test["resultStatus"], "PENDING");
                      return (
                        <article
                          key={clinicalText(test["id"])}
                          className="rounded-xl border border-slate-200 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                {clinicalText(test["categoryName"], "Laboratory")}
                              </p>
                              <h3 className="mt-1 font-bold text-slate-950">
                                {clinicalText(test["testName"])}
                              </h3>
                            </div>
                            <StatusBadge value={clinicalText(test["resultStatus"])} />
                          </div>
                          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                            <ResultDetail
                              label="Result"
                              value={`${result}${test["unit"] ? ` ${clinicalText(test["unit"])}` : ""}`}
                            />
                            <ResultDetail
                              label="Interpretation"
                              value={clinicalText(test["interpretation"], "Not specified")}
                            />
                            <ResultDetail
                              label="Reference range"
                              value={clinicalText(test["referenceRange"], "Not configured")}
                            />
                            <ResultDetail
                              label="Laboratory notes"
                              value={clinicalText(test["resultNote"], "No notes")}
                            />
                          </dl>
                          {Object.keys(resultData).length ? (
                            <div className="mt-4 rounded-lg bg-slate-50 p-3">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                Panel components
                              </p>
                              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                                {Object.entries(resultData).map(([name, value]) => (
                                  <ResultDetail
                                    key={name}
                                    label={name}
                                    value={clinicalText(value)}
                                  />
                                ))}
                              </dl>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {!labOrders.length ? (
              <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                No laboratory tests have been requested for this visit.
              </p>
            ) : null}
          </div>
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
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Diagnostic outcome *">
                  <select
                    value={diagnosticOutcome}
                    onChange={(event) => setDiagnosticOutcome(event.target.value)}
                  >
                    <option value="FINAL_DIAGNOSIS">Final diagnosis established</option>
                    <option value="NO_DEFINITIVE_DIAGNOSIS">No definitive diagnosis</option>
                    <option value="OBSERVATION">Observation required</option>
                    <option value="REFERRAL">Diagnosis deferred to referral</option>
                  </select>
                </Field>
                <Field label="Disposition *">
                  <select
                    value={disposition}
                    onChange={(event) => setDisposition(event.target.value)}
                  >
                    <option value="DISCHARGED">Discharged</option>
                    <option value="FOLLOW_UP">Follow-up</option>
                    <option value="REFERRED">Referred</option>
                    <option value="ADMITTED">Admitted</option>
                    <option value="OBSERVATION">Observation</option>
                    <option value="EMERGENCY_TRANSFER">Emergency transfer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
                {disposition === "FOLLOW_UP" ? (
                  <>
                    <Field label="Follow-up date *">
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(event) => setFollowUpDate(event.target.value)}
                      />
                    </Field>
                    <TextArea
                      label="Follow-up instructions *"
                      value={followUpInstructions}
                      onChange={setFollowUpInstructions}
                    />
                  </>
                ) : null}
                {disposition === "REFERRED" ? (
                  <>
                    <Field label="Referral destination *">
                      <input
                        value={referralDestination}
                        onChange={(event) => setReferralDestination(event.target.value)}
                      />
                    </Field>
                    <TextArea
                      label="Referral reason *"
                      value={referralReason}
                      onChange={setReferralReason}
                    />
                  </>
                ) : null}
                {disposition === "EMERGENCY_TRANSFER" ? (
                  <TextArea
                    label="Transfer reason *"
                    value={transferReason}
                    onChange={setTransferReason}
                  />
                ) : null}
                <TextArea
                  label="Disposition notes"
                  value={dispositionNotes}
                  onChange={setDispositionNotes}
                />
              </div>
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
              disabled={
                !canEdit ||
                complete.isPending ||
                visit.data["status"] === "COMPLETED" ||
                (diagnosticOutcome === "FINAL_DIAGNOSIS" &&
                  !diagnoses.some((item) => item["type"] === "FINAL")) ||
                (disposition === "FOLLOW_UP" && (!followUpDate || !followUpInstructions.trim())) ||
                (disposition === "REFERRED" &&
                  (!referralDestination.trim() || !referralReason.trim())) ||
                (disposition === "EMERGENCY_TRANSFER" && !transferReason.trim())
              }
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
function ResultDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-900">{value || "—"}</dd>
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
