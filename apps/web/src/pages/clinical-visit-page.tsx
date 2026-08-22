import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical, Plus, Printer, Save, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { errorMessage, getData, sendData } from "../api/client";
import { showToast } from "../components/toast";
import {
  Card,
  date,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  money,
  PageHeader,
  StatusBadge,
} from "../components/ui";
import { navigate } from "../lib/navigation";
import type { TenantPrincipal, Workspace } from "../types";

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};

const tabs = [
  ["assessment", "Clinical assessment"],
  ["laboratory", "Laboratory"],
  ["diagnosis", "Diagnosis"],
  ["prescription", "Prescription"],
] as const;
const vitalFields = [
  ["temperature", "Temperature (°C)"],
  ["systolicBp", "Systolic BP (mmHg)"],
  ["diastolicBp", "Diastolic BP (mmHg)"],
  ["pulse", "Pulse (bpm)"],
  ["respiratoryRate", "Respiratory rate (/min)"],
  ["oxygenSaturation", "SpO₂ (%)"],
  ["weight", "Weight (kg)"],
  ["height", "Height (cm)"],
] as const;
const physicalFields = [
  ["generalAppearance", "General appearance"],
  ["chest", "Chest / respiratory"],
  ["cardiovascular", "Cardiovascular"],
  ["abdomen", "Abdomen"],
  ["skin", "Skin"],
  ["neurological", "Neurological"],
  ["other", "Other findings"],
] as const;

const emptyAssessment = {
  chiefComplaint: "",
  historyPresentIllness: "",
  pastMedicalHistory: "",
  pastSurgicalHistory: "",
  currentMedicines: "",
  allergies: "",
  symptoms: "",
  vitalSigns: {
    temperature: "",
    systolicBp: "",
    diastolicBp: "",
    pulse: "",
    respiratoryRate: "",
    oxygenSaturation: "",
    weight: "",
    height: "",
  },
  physicalExamination: {
    generalAppearance: "",
    chest: "",
    cardiovascular: "",
    abdomen: "",
    skin: "",
    neurological: "",
    other: "",
  },
  examinationNotes: "",
  provisionalDiagnosis: "",
};

function optionalNumbers(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => [key, Number(value)]),
  );
}

export function ClinicalVisitPage({
  visitId,
  workspace,
  principal,
}: {
  visitId: string;
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const client = useQueryClient();
  const canDoctor = ["OWNER", "ADMIN", "DOCTOR"].includes(principal.role);
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("assessment");
  const [assessment, setAssessment] = useState(emptyAssessment);
  const [assessmentLoaded, setAssessmentLoaded] = useState(false);
  const [testSearch, setTestSearch] = useState("");
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [labPriority, setLabPriority] = useState("ROUTINE");
  const [labNotes, setLabNotes] = useState("");
  const [finalDiagnoses, setFinalDiagnoses] = useState("");
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [prescriptionItems, setPrescriptionItems] = useState([
    {
      medicineName: "",
      strength: "",
      dosage: "",
      frequency: "",
      duration: "",
      route: "",
      quantity: "",
      instructions: "",
    },
  ]);

  const visit = useQuery({
    queryKey: ["clinic-visit", visitId],
    queryFn: () => getData<Row>("/clinic/visits/" + visitId),
  });
  const categories = useQuery({
    queryKey: ["lab-categories"],
    queryFn: () => getData<Row[]>("/lab/categories"),
  });
  const history = useQuery({
    queryKey: ["patient-history", text((visit.data?.["patient"] as Row)?.["id"])],
    queryFn: () =>
      getData<Row>(
        "/clinic/patients/" + text((visit.data?.["patient"] as Row)?.["id"]) + "/history",
      ),
    enabled: Boolean((visit.data?.["patient"] as Row)?.["id"]),
  });

  const activeTests = useMemo(
    () =>
      (categories.data ?? []).flatMap((category) =>
        rows(category["tests"])
          .filter((test) => test["active"] !== false)
          .filter((test) => {
            const q = testSearch.trim().toLowerCase();
            return (
              !q ||
              [test["code"], test["name"], category["name"], test["sampleType"]].some((value) =>
                text(value).toLowerCase().includes(q),
              )
            );
          }),
      ),
    [categories.data, testSearch],
  );

  useEffect(() => {
    if (!visit.data || assessmentLoaded) return;
    const saved = object(visit.data["clinicalAssessment"]);
    if (!Object.keys(saved).length) return;
    const vitals = object(saved["vitalSigns"]);
    const physical = object(saved["physicalExamination"]);
    setAssessment({
      chiefComplaint: text(saved["chiefComplaint"]),
      historyPresentIllness: text(saved["historyPresentIllness"]),
      pastMedicalHistory: text(saved["pastMedicalHistory"]),
      pastSurgicalHistory: text(saved["pastSurgicalHistory"]),
      currentMedicines: text(saved["currentMedicines"]),
      allergies: text(saved["allergies"]),
      symptoms: rows(saved["symptoms"])
        .map((item) => text(item))
        .filter(Boolean)
        .join(", "),
      vitalSigns: Object.fromEntries(
        Object.keys(emptyAssessment.vitalSigns).map((key) => [key, text(vitals[key])]),
      ) as typeof emptyAssessment.vitalSigns,
      physicalExamination: Object.fromEntries(
        Object.keys(emptyAssessment.physicalExamination).map((key) => [key, text(physical[key])]),
      ) as typeof emptyAssessment.physicalExamination,
      examinationNotes: text(saved["examinationNotes"]),
      provisionalDiagnosis: text(saved["provisionalDiagnosis"]),
    });
    setAssessmentLoaded(true);
  }, [visit.data, assessmentLoaded]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["clinic-visit", visitId] }),
      client.invalidateQueries({ queryKey: ["clinic-visits"] }),
      client.invalidateQueries({ queryKey: ["patient-history"] }),
    ]);
  };

  const saveAssessment = useMutation({
    mutationFn: () =>
      sendData<Row>("put", "/clinic/visits/" + visitId + "/assessment", {
        ...assessment,
        symptoms: assessment.symptoms
          .split(/[,\n]/)
          .map((item) => item.trim())
          .filter(Boolean),
        vitalSigns: optionalNumbers(assessment.vitalSigns),
        physicalExamination: assessment.physicalExamination,
      }),
    onSuccess: async () => {
      showToast({ title: "Clinical assessment saved" });
      await refresh();
    },
  });
  const requestLab = useMutation({
    mutationFn: () =>
      sendData<Row>("post", "/clinic/visits/" + visitId + "/lab-orders", {
        testIds: selectedTests,
        priority: labPriority,
        clinicalNotes: labNotes || undefined,
      }),
    onSuccess: async () => {
      setSelectedTests([]);
      showToast({
        title: "Lab request sent",
        message: "Patient-ka reception-ka ha ugu noqdo lab payment.",
      });
      await refresh();
    },
  });
  const saveDiagnosis = useMutation({
    mutationFn: () =>
      sendData<Row>("put", "/clinic/visits/" + visitId + "/diagnoses/FINAL", {
        diagnoses: finalDiagnoses
          .split("\n")
          .map((description) => description.trim())
          .filter(Boolean)
          .map((description) => ({ description })),
      }),
    onSuccess: async () => {
      showToast({ title: "Final diagnosis saved" });
      await refresh();
    },
  });
  const savePrescription = useMutation({
    mutationFn: () =>
      sendData<Row>("put", "/clinic/visits/" + visitId + "/prescription", {
        notes: prescriptionNotes || undefined,
        items: prescriptionItems.map((item) => ({
          ...item,
          strength: item.strength || undefined,
          route: item.route || undefined,
          quantity: item.quantity ? Number(item.quantity) : undefined,
          instructions: item.instructions || undefined,
        })),
      }),
    onSuccess: async () => {
      showToast({ title: "Prescription created", message: "Pharmacy queue-ga ayaa loo diray." });
      await refresh();
    },
  });

  if (!canDoctor)
    return (
      <EmptyState
        title="Clinical workspace restricted"
        description="Boggan waxaa loogu talagalay doctor-ka baaraya bukaanka."
      />
    );
  if (visit.isLoading) return <LoadingState label="Loading clinical visit" />;
  if (visit.error) return <ErrorState error={visit.error} />;
  if (!visit.data)
    return <EmptyState title="Visit not found" description="Booqashadan lama helin." />;
  const patient = object(visit.data["patient"]);
  const labOrders = rows(visit.data["labVisits"]);
  const diagnoses = rows(visit.data["diagnoses"]);
  const prescriptions = rows(visit.data["prescriptions"]);

  return (
    <div className="clinical-visit-page">
      <PageHeader
        eyebrow="Clinical patient workflow"
        title={text(patient["name"]) || "Patient examination"}
        description={
          text(patient["patientNumber"]) +
          " · Visit " +
          text(visit.data["visitNumber"]) +
          " · " +
          text(patient["age"]) +
          " years · " +
          (text(patient["sex"]) || "Sex not recorded")
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => navigate("/clinic")}>
              <ArrowLeft size={16} /> Patient queue
            </button>
            {labOrders.length ? (
              <button
                className="btn-secondary"
                onClick={() => navigate(`/clinic/visits/${visitId}/print/lab`)}
              >
                <Printer size={16} /> Print lab report
              </button>
            ) : null}
            {prescriptions.length ? (
              <button
                className="btn-secondary"
                onClick={() => navigate(`/clinic/visits/${visitId}/print/prescription`)}
              >
                <Printer size={16} /> Print prescription
              </button>
            ) : null}
          </div>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title="Visit status">
          <div className="p-4">
            <StatusBadge value={text(visit.data["status"])} />
          </div>
        </Card>
        <Card title="Phone">
          <p className="p-4 font-semibold">{text(patient["phone"]) || "Not recorded"}</p>
        </Card>
        <Card title="Allergies">
          <p className="p-4 font-semibold text-rose-700">
            {text(patient["allergies"]) || "No allergy recorded"}
          </p>
        </Card>
        <Card title="Previous visits">
          <p className="p-4 text-2xl font-bold">{rows(history.data?.["visits"]).length}</p>
        </Card>
      </div>

      <details className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-4 font-bold text-slate-900">
          Patient clinical history · last {Math.min(rows(history.data?.["visits"]).length, 20)}{" "}
          visits
        </summary>
        <div className="grid gap-3 border-t border-slate-100 p-4 lg:grid-cols-2">
          {rows(history.data?.["visits"])
            .filter((previous) => text(previous["id"]) !== visitId)
            .slice(0, 6)
            .map((previous) => (
              <article
                className="rounded-xl border border-slate-200 p-4"
                key={text(previous["id"])}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{text(previous["visitNumber"])}</strong>
                  <StatusBadge value={text(previous["status"])} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{date(previous["createdAt"])}</p>
                <p className="mt-3 text-sm">
                  <strong>Diagnoses:</strong>{" "}
                  {rows(previous["diagnoses"])
                    .map((item) => text(item["description"]))
                    .join(", ") || "None recorded"}
                </p>
                <p className="mt-1 text-sm">
                  <strong>Laboratory:</strong>{" "}
                  {rows(previous["labVisits"])
                    .flatMap((order) => rows(order["tests"]).map((item) => text(item["testName"])))
                    .join(", ") || "No tests"}
                </p>
                <p className="mt-1 text-sm">
                  <strong>Prescriptions:</strong>{" "}
                  {rows(previous["prescriptions"])
                    .flatMap((rx) => rows(rx["items"]).map((item) => text(item["medicineName"])))
                    .join(", ") || "None"}
                </p>
              </article>
            ))}
          {rows(history.data?.["visits"]).filter((previous) => text(previous["id"]) !== visitId)
            .length === 0 ? (
            <EmptyState
              title="No previous clinical history"
              description="This is the patient's first recorded clinic visit."
            />
          ) : null}
        </div>
      </details>

      <nav className="clinical-tabs mb-5" aria-label="Clinical visit sections">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "assessment" ? (
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveAssessment.mutate();
          }}
        >
          <Card
            title="Patient interview"
            description="Record everything manually from the patient interview."
          >
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <Field label="Chief complaint">
                <textarea
                  required
                  value={assessment.chiefComplaint}
                  onChange={(event) =>
                    setAssessment({ ...assessment, chiefComplaint: event.target.value })
                  }
                />
              </Field>
              <Field
                label="History of present illness"
                hint="Onset, duration, progression, severity and associated symptoms."
              >
                <textarea
                  value={assessment.historyPresentIllness}
                  onChange={(event) =>
                    setAssessment({ ...assessment, historyPresentIllness: event.target.value })
                  }
                />
              </Field>
              <Field label="Symptoms" hint="Type symptoms separated by commas or new lines.">
                <textarea
                  value={assessment.symptoms}
                  onChange={(event) =>
                    setAssessment({ ...assessment, symptoms: event.target.value })
                  }
                />
              </Field>
              <Field label="Past medical history">
                <textarea
                  value={assessment.pastMedicalHistory}
                  onChange={(event) =>
                    setAssessment({ ...assessment, pastMedicalHistory: event.target.value })
                  }
                />
              </Field>
              <Field label="Past surgical history">
                <textarea
                  value={assessment.pastSurgicalHistory}
                  onChange={(event) =>
                    setAssessment({ ...assessment, pastSurgicalHistory: event.target.value })
                  }
                />
              </Field>
              <Field label="Current medicines">
                <textarea
                  value={assessment.currentMedicines}
                  onChange={(event) =>
                    setAssessment({ ...assessment, currentMedicines: event.target.value })
                  }
                />
              </Field>
              <Field label="Medicine and other allergies">
                <textarea
                  value={assessment.allergies}
                  onChange={(event) =>
                    setAssessment({ ...assessment, allergies: event.target.value })
                  }
                />
              </Field>
            </div>
          </Card>

          <Card
            title="Vital signs"
            description="Enter measured values manually using the displayed units."
          >
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {vitalFields.map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type="number"
                    step="0.1"
                    value={assessment.vitalSigns[key]}
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

          <Card title="Physical examination">
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {physicalFields.map(([key, label]) => (
                <Field key={key} label={label}>
                  <textarea
                    value={assessment.physicalExamination[key]}
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
                </Field>
              ))}
              <Field label="Doctor examination notes">
                <textarea
                  value={assessment.examinationNotes}
                  onChange={(event) =>
                    setAssessment({ ...assessment, examinationNotes: event.target.value })
                  }
                />
              </Field>
              <Field
                label="Provisional diagnosis"
                hint="Optional; this does not replace the final diagnosis."
              >
                <textarea
                  value={assessment.provisionalDiagnosis}
                  onChange={(event) =>
                    setAssessment({ ...assessment, provisionalDiagnosis: event.target.value })
                  }
                />
              </Field>
            </div>
          </Card>
          {saveAssessment.error ? (
            <p className="text-sm text-rose-700">{errorMessage(saveAssessment.error)}</p>
          ) : null}
          {canDoctor ? (
            <button className="btn-primary" disabled={saveAssessment.isPending}>
              <Save size={17} /> Save clinical assessment
            </button>
          ) : null}
        </form>
      ) : null}

      {tab === "laboratory" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
          <Card
            title="Request laboratory tests"
            description="Search and select tests from the tenant catalog."
          >
            <div className="space-y-4 p-4">
              <input
                className="input"
                placeholder="Search test name, code, category or sample type"
                value={testSearch}
                onChange={(event) => setTestSearch(event.target.value)}
              />
              <div className="grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2">
                {activeTests.map((test) => {
                  const id = text(test["id"]);
                  return (
                    <label
                      className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"
                      key={id}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTests.includes(id)}
                        onChange={(event) =>
                          setSelectedTests(
                            event.target.checked
                              ? [...selectedTests, id]
                              : selectedTests.filter((item) => item !== id),
                          )
                        }
                      />
                      <span className="min-w-0">
                        <strong className="block">{text(test["name"])}</strong>
                        <span className="text-xs text-slate-500">
                          {text(test["code"])} ·{" "}
                          {text(test["sampleType"]) || "Sample not specified"} ·{" "}
                          {money(test["price"], workspace.tenant.currencyCode)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Priority">
                  <select
                    value={labPriority}
                    onChange={(event) => setLabPriority(event.target.value)}
                  >
                    <option value="ROUTINE">Routine</option>
                    <option value="URGENT">Urgent</option>
                    <option value="STAT">STAT</option>
                  </select>
                </Field>
                <Field label="Clinical notes for laboratory">
                  <textarea
                    value={labNotes}
                    onChange={(event) => setLabNotes(event.target.value)}
                  />
                </Field>
              </div>
              {requestLab.error ? (
                <p className="text-sm text-rose-700">{errorMessage(requestLab.error)}</p>
              ) : null}
              {canDoctor ? (
                <button
                  className="btn-primary"
                  disabled={!selectedTests.length || requestLab.isPending}
                  onClick={() => requestLab.mutate()}
                >
                  <FlaskConical size={17} /> Send lab request ({selectedTests.length})
                </button>
              ) : null}
            </div>
          </Card>
          <Card
            title="Laboratory orders"
            description={String(labOrders.length) + " order(s) for this visit"}
          >
            <div className="divide-y divide-slate-100">
              {labOrders.length ? (
                labOrders.map((order) => (
                  <div className="space-y-3 p-4" key={text(order["id"])}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong>{text(order["visitNumber"])}</strong>
                      <StatusBadge value={text(order["status"])} />
                    </div>
                    <p className="text-sm text-slate-600">
                      Priority: {text(order["priority"])} · Sample: {text(order["sampleStatus"])}
                    </p>
                    {rows(order["tests"]).map((test) => (
                      <div className="rounded-lg bg-slate-50 p-3 text-sm" key={text(test["id"])}>
                        <strong>{text(test["testName"])}</strong>
                        <p className="mt-1">
                          Result:{" "}
                          {text(test["numericValue"]) ||
                            text(test["resultValue"]) ||
                            text(test["resultStatus"])}
                          {test["unit"] ? " " + text(test["unit"]) : ""}
                        </p>
                        <p className="text-xs text-slate-500">
                          Reference: {text(test["referenceRange"]) || "Not configured"} ·
                          Interpretation: {text(test["interpretation"]) || "Pending"}
                        </p>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No lab orders"
                  description="This visit has no laboratory request yet."
                />
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "diagnosis" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Recorded diagnoses">
            <div className="space-y-3 p-4">
              {diagnoses.length ? (
                diagnoses.map((diagnosis) => (
                  <div
                    className="rounded-xl border border-slate-200 p-3"
                    key={text(diagnosis["id"])}
                  >
                    <StatusBadge value={text(diagnosis["type"])} />
                    <p className="mt-2 font-semibold">{text(diagnosis["description"])}</p>
                    <p className="text-xs text-slate-500">{date(diagnosis["recordedAt"])}</p>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No diagnosis recorded"
                  description="Add the final diagnosis after assessment and any requested lab results."
                />
              )}
            </div>
          </Card>
          <Card
            title="Final diagnosis"
            description="Enter one diagnosis per line. This is always manual."
          >
            <form
              className="space-y-4 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveDiagnosis.mutate();
              }}
            >
              <textarea
                required
                className="input min-h-40"
                placeholder={"Malaria\nMild dehydration"}
                value={finalDiagnoses}
                onChange={(event) => setFinalDiagnoses(event.target.value)}
              />
              {saveDiagnosis.error ? (
                <p className="text-sm text-rose-700">{errorMessage(saveDiagnosis.error)}</p>
              ) : null}
              {canDoctor ? (
                <button className="btn-primary">
                  <Stethoscope size={17} /> Save final diagnosis
                </button>
              ) : null}
            </form>
          </Card>
        </div>
      ) : null}

      {tab === "prescription" ? (
        <div className="space-y-5">
          {prescriptions.length ? (
            <Card title={"Prescription " + text(prescriptions[0]?.["prescriptionNumber"])}>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Strength</th>
                      <th>Dose</th>
                      <th>Frequency</th>
                      <th>Duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows(prescriptions[0]?.["items"]).map((item) => (
                      <tr key={text(item["id"])}>
                        <td>{text(item["medicineName"])}</td>
                        <td>{text(item["strength"]) || "—"}</td>
                        <td>{text(item["dosage"])}</td>
                        <td>{text(item["frequency"])}</td>
                        <td>{text(item["duration"])}</td>
                        <td>
                          <StatusBadge value={text(item["status"])} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <Card
            title="Manual prescription"
            description="Clinical medicine names are independent from pharmacy inventory products."
          >
            <form
              className="space-y-4 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                savePrescription.mutate();
              }}
            >
              {prescriptionItems.map((item, index) => (
                <div
                  className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-4"
                  key={index}
                >
                  {[
                    ["medicineName", "Medicine name", true],
                    ["strength", "Strength", false],
                    ["dosage", "Dose", true],
                    ["frequency", "Frequency", true],
                    ["duration", "Duration", true],
                    ["route", "Route", false],
                    ["quantity", "Quantity", false],
                    ["instructions", "Instructions", false],
                  ].map(([key, label, required]) => (
                    <Field key={String(key)} label={String(label)}>
                      <input
                        required={Boolean(required)}
                        type={key === "quantity" ? "number" : "text"}
                        min={key === "quantity" ? "0.01" : undefined}
                        step={key === "quantity" ? "0.01" : undefined}
                        value={item[key as keyof typeof item]}
                        onChange={(event) =>
                          setPrescriptionItems(
                            prescriptionItems.map((current, itemIndex) =>
                              itemIndex === index
                                ? { ...current, [String(key)]: event.target.value }
                                : current,
                            ),
                          )
                        }
                      />
                    </Field>
                  ))}
                </div>
              ))}
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setPrescriptionItems([
                    ...prescriptionItems,
                    {
                      medicineName: "",
                      strength: "",
                      dosage: "",
                      frequency: "",
                      duration: "",
                      route: "",
                      quantity: "",
                      instructions: "",
                    },
                  ])
                }
              >
                <Plus size={16} /> Add medicine
              </button>
              <Field label="Prescription notes">
                <textarea
                  value={prescriptionNotes}
                  onChange={(event) => setPrescriptionNotes(event.target.value)}
                />
              </Field>
              {savePrescription.error ? (
                <p className="text-sm text-rose-700">{errorMessage(savePrescription.error)}</p>
              ) : null}
              {canDoctor ? (
                <button className="btn-primary">
                  <Save size={17} /> Save prescription
                </button>
              ) : null}
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
