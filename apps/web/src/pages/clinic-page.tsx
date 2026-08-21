import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPlus, FlaskConical, Printer, Stethoscope, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { errorMessage, getData, sendData } from "../api/client";
import { showToast } from "../components/toast";
import {
  Card,
  date,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  money,
  PageHeader,
  Stat,
  StatusBadge,
} from "../components/ui";
import { navigate } from "../lib/navigation";
import type { Branch, TenantPrincipal, Workspace } from "../types";

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const paymentMethods = ["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"];

const statusLabels: Record<string, string> = {
  AWAITING_CONSULTATION_PAYMENT: "Awaiting visit payment",
  WAITING_FOR_DOCTOR: "Ready for doctor",
  IN_EXAMINATION: "Clinical examination",
  IN_CONSULTATION: "Clinical examination",
  AWAITING_LAB_PAYMENT: "Awaiting lab payment",
  WAITING_FOR_SAMPLE: "Waiting for sample",
  WAITING_FOR_LAB: "Ready for laboratory",
  LAB_IN_PROGRESS: "Tests in progress",
  LAB_RESULTS_READY: "Lab results ready",
  RESULTS_READY: "Results ready",
  DOCTOR_REVIEW: "Doctor review",
  PRESCRIPTION_CREATED: "Prescription created",
  AT_PHARMACY: "At pharmacy",
  PRESCRIPTION_READY: "Prescription ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NOT_COLLECTED: "Sample not collected",
  COLLECTED: "Sample collected",
  PENDING: "Pending",
  NEGATIVE: "Negative",
  POSITIVE: "Positive",
  INCONCLUSIVE: "Inconclusive",
  UNPAID: "Not paid",
  PAID: "Paid",
};

const statusLabel = (value: unknown) => {
  const raw = text(value);
  return statusLabels[raw] ?? raw.replaceAll("_", " ");
};

const statusHelp: Record<string, string> = {
  AWAITING_CONSULTATION_PAYMENT: "Reception: qaado lacagta booqashada",
  WAITING_FOR_DOCTOR: "Doctor: bukaanku diyaar ayuu yahay",
  IN_EXAMINATION: "Doctor: dhammee clinical assessment-ka",
  IN_CONSULTATION: "Doctor: dhammee clinical assessment-ka",
  AWAITING_LAB_PAYMENT: "Reception: qaado lacagta baaritaanka lab-ka",
  WAITING_FOR_SAMPLE: "Laboratory: muunadda bukaanka qaad",
  WAITING_FOR_LAB: "Laboratory: muunadda bukaanka qaad",
  LAB_IN_PROGRESS: "Laboratory: geli dhammaan natiijooyinka",
  LAB_RESULTS_READY: "Doctor: eeg natiijooyinka, xaqiiji diagnosis-ka",
  RESULTS_READY: "Doctor: eeg natiijooyinka, xaqiiji diagnosis-ka",
  DOCTOR_REVIEW: "Doctor: xaqiiji diagnosis-ka oo qor daawada",
  PRESCRIPTION_CREATED: "Pharmacy: diyaari daawada prescription-ka",
  AT_PHARMACY: "Pharmacy: dhammee bixinta daawada iyo lacagta",
  PRESCRIPTION_READY: "Pharmacy: bixi daawada oo qaado lacagta",
  COMPLETED: "Booqashada waa dhammaatay",
};

export function ClinicPage({
  branch,
  workspace,
  principal,
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const client = useQueryClient();
  const [selected, setSelected] = useState<Row | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [consultOpen, setConsultOpen] = useState(false);
  const [prescriptionOpen, setPrescriptionOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [visitForm, setVisitForm] = useState({
    patientId: "",
    consultationFee: "0",
    doctorMembershipId: "",
  });
  const [patientForm, setPatientForm] = useState({
    name: "",
    age: "",
    sex: "",
    phone: "",
    notes: "",
  });
  const [consultForm, setConsultForm] = useState({
    chiefComplaint: "",
    history: "",
    examination: "",
    diagnosis: "",
    doctorNotes: "",
    testIds: [] as string[],
  });
  const [prescriptionNotes, setPrescriptionNotes] = useState("");
  const [prescriptionItems, setPrescriptionItems] = useState([
    { medicineName: "", dosage: "", frequency: "", duration: "", instructions: "" },
  ]);
  const canRegister = ["OWNER", "ADMIN", "RECEPTIONIST"].includes(principal.role);
  const canPay = canRegister;
  const canConsult = ["OWNER", "ADMIN", "DOCTOR"].includes(principal.role);
  const canSample = ["OWNER", "ADMIN", "LAB_TECHNICIAN"].includes(principal.role);
  const canPrescribe = canConsult;

  const visits = useQuery({
    queryKey: ["clinic-visits", branch?.id],
    queryFn: () => getData<Row[]>(`/clinic/visits?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const doctors = useQuery({
    queryKey: ["clinic-doctors", branch?.id],
    queryFn: () => getData<Row[]>(`/clinic/doctors?branchId=${branch!.id}`),
    enabled: Boolean(branch) && canRegister,
  });
  const patients = useQuery({
    queryKey: ["lab-patients"],
    queryFn: () => getData<Row[]>("/lab/patients"),
    enabled: canRegister,
  });
  const categories = useQuery({
    queryKey: ["lab-categories"],
    queryFn: () => getData<Row[]>("/lab/categories"),
    enabled: canConsult,
  });
  const activeTests = useMemo<Row[]>(
    () =>
      (categories.data ?? []).flatMap((category) =>
        rows(category["tests"])
          .filter((test) => test["active"] !== false)
          .map((test): Row => ({ ...test, categoryName: category["name"] })),
      ),
    [categories.data],
  );
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["clinic-visits"] }),
      client.invalidateQueries({ queryKey: ["lab-visits"] }),
    ]);
  };

  const register = useMutation({
    mutationFn: () =>
      sendData<Row>("post", "/clinic/visits", {
        branchId: branch!.id,
        ...visitForm,
        doctorMembershipId: visitForm.doctorMembershipId || undefined,
      }),
    onSuccess: async (visit) => {
      setRegisterOpen(false);
      setVisitForm({ patientId: "", consultationFee: "0", doctorMembershipId: "" });
      setSelected(visit);
      showToast({
        title: "Patient visit registered",
        message: "Reception queue-ga ayaa lagu daray.",
      });
      await refresh();
    },
  });
  const createPatient = useMutation({
    mutationFn: () =>
      sendData<Row>("post", "/lab/patients", {
        ...patientForm,
        age: Number(patientForm.age),
        sex: patientForm.sex || undefined,
        phone: patientForm.phone || undefined,
        notes: patientForm.notes || undefined,
      }),
    onSuccess: async (patient) => {
      setPatientOpen(false);
      setPatientForm({ name: "", age: "", sex: "", phone: "", notes: "" });
      setVisitForm((current) => ({ ...current, patientId: text(patient["id"]) }));
      setRegisterOpen(true);
      await client.invalidateQueries({ queryKey: ["lab-patients"] });
    },
  });
  const payConsultation = useMutation({
    mutationFn: () =>
      sendData<Row>("post", `/clinic/visits/${text(selected?.["id"])}/consultation-payment`, {
        method: paymentMethod,
        idempotencyKey:
          "consultation:" + text(selected?.["id"]) + ":" + crypto.randomUUID(),
      }),
    onSuccess: async (visit) => {
      setSelected(visit);
      showToast({ title: "Consultation fee received" });
      await refresh();
    },
  });
  const saveConsultation = useMutation({
    mutationFn: () =>
      sendData<Row>("put", `/clinic/visits/${text(selected?.["id"])}/consultation`, {
        ...consultForm,
        history: consultForm.history || undefined,
        examination: consultForm.examination || undefined,
        diagnosis: consultForm.diagnosis || undefined,
        doctorNotes: consultForm.doctorNotes || undefined,
      }),
    onSuccess: async (visit) => {
      setSelected(visit);
      setConsultOpen(false);
      showToast({
        title: "Consultation saved",
        message:
          visit["status"] === "AWAITING_LAB_PAYMENT"
            ? "Patient-ka reception-ka ha ugu noqdo lacagta lab-ka."
            : "Doctor-ku prescription ayuu hadda qori karaa.",
      });
      await refresh();
    },
  });
  const payLab = useMutation({
    mutationFn: () => {
      const lab = rows(selected?.["labVisits"])[0];
      const balance = Number(text(lab?.["total"])) - Number(text(lab?.["amountPaid"]));
      return sendData<Row>("post", `/lab/visits/${text(lab?.["id"])}/payments`, {
        amount: balance.toFixed(2),
        method: paymentMethod,
        idempotencyKey: `clinic-lab:${text(lab?.["id"])}:${crypto.randomUUID()}`,
      });
    },
    onSuccess: async () => {
      showToast({
        title: "Lab fee received",
        message: "Patient-ka waxaa loo diray laboratory-ga.",
      });
      const updated = await getData<Row>(`/clinic/visits/${text(selected?.["id"])}`);
      setSelected(updated);
      await refresh();
    },
  });
  const collectSample = useMutation({
    mutationFn: () => {
      const lab = rows(selected?.["labVisits"])[0];
      return sendData<Row>(
        "post",
        `/clinic/visits/${text(selected?.["id"])}/lab/${text(lab?.["id"])}/sample`,
      );
    },
    onSuccess: async (visit) => {
      setSelected(visit);
      showToast({ title: "Sample collected", message: "Natiijooyinka hadda waa la geli karaa." });
      await refresh();
    },
  });
  const savePrescription = useMutation({
    mutationFn: () =>
      sendData<Row>("put", `/clinic/visits/${text(selected?.["id"])}/prescription`, {
        notes: prescriptionNotes || undefined,
        items: prescriptionItems,
      }),
    onSuccess: async () => {
      setPrescriptionOpen(false);
      showToast({
        title: "Prescription ready",
        message: "Patient-ka wuxuu u gudbi karaa pharmacy-ga.",
      });
      const updated = await getData<Row>(`/clinic/visits/${text(selected?.["id"])}`);
      setSelected(updated);
      await refresh();
    },
  });

  if (!branch)
    return <EmptyState title="Choose a branch" description="Dooro branch-ka aad ka shaqeynayso." />;
  if (visits.isLoading) return <LoadingState label="Loading patient workflow" />;
  if (visits.error) return <ErrorState error={visits.error} />;
  const clinicVisits = visits.data ?? [];
  const waitingDoctor = clinicVisits.filter(
    (visit) => visit["status"] === "WAITING_FOR_DOCTOR",
  ).length;
  const waitingPayment = clinicVisits.filter((visit) =>
    ["AWAITING_CONSULTATION_PAYMENT", "AWAITING_LAB_PAYMENT"].includes(text(visit["status"])),
  ).length;
  const waitingLab = clinicVisits.filter((visit) =>
    ["WAITING_FOR_SAMPLE", "WAITING_FOR_LAB", "LAB_IN_PROGRESS"].includes(text(visit["status"])),
  ).length;
  const currentLab = rows(selected?.["labVisits"])[0];
  const currentPrescription = rows(selected?.["prescriptions"])[0];

  return (
    <>
      <PageHeader
        eyebrow="Outpatient care"
        title="Patient workflow"
        description="Reception → doctor → lab payment → laboratory → prescription → pharmacy."
        actions={
          canRegister ? (
            <button className="btn-primary" onClick={() => setRegisterOpen(true)}>
              <ClipboardPlus size={17} /> Register visit
            </button>
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Waiting for doctor" value={waitingDoctor} tone="blue" />
        <Stat label="Payments required" value={waitingPayment} tone="amber" />
        <Stat label="Laboratory queue" value={waitingLab} tone="emerald" />
      </div>
      <Card
        title="Today's patient queue"
        description={`Your role: ${principal.role.replaceAll("_", " ")}`}
      >
        {clinicVisits.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Visit number</th>
                  <th>Patient</th>
                  <th>Current status</th>
                  <th>Required action</th>
                  <th>Registered</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {clinicVisits.map((visit) => (
                  <tr key={text(visit["id"])}>
                    <td className="font-semibold">{text(visit["visitNumber"])}</td>
                    <td>{text((visit["patient"] as Row)?.["name"])}</td>
                    <td>
                      <StatusBadge value={statusLabel(visit["status"])} />
                    </td>
                    <td>{statusHelp[text(visit["status"])] ?? "Review visit"}</td>
                    <td>{date(visit["createdAt"])}</td>
                    <td>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          principal.role === "DOCTOR"
                            ? navigate("/clinic/visits/" + text(visit["id"]))
                            : setSelected(visit)
                        }
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No patient visits yet"
            description="Reception can register the first visit."
          />
        )}
      </Card>

      <Dialog
        open={Boolean(selected)}
        title={`${text(selected?.["visitNumber"])} · ${text((selected?.["patient"] as Row)?.["name"])}`}
        description={statusHelp[text(selected?.["status"])]}
        onClose={() => setSelected(null)}
        wide
      >
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="text-xs text-slate-500">Status</span>
              <div className="mt-1">
                <StatusBadge value={statusLabel(selected?.["status"])} />
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="text-xs text-slate-500">Consultation fee</span>
              <p className="mt-1 font-bold">
                {money(selected?.["consultationFee"], workspace.tenant.currencyCode)}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <span className="text-xs text-slate-500">Payment</span>
              <p className="mt-1 font-bold">{statusLabel(selected?.["consultationPaymentStatus"])}</p>
            </div>
          </div>
          {canPay && selected?.["status"] === "AWAITING_CONSULTATION_PAYMENT" ? (
            <Card title="Reception: consultation payment">
              <div className="flex flex-wrap items-end gap-3 p-4">
                <Field label="Payment method">
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    {paymentMethods.map((method) => (
                      <option key={method}>{method}</option>
                    ))}
                  </select>
                </Field>
                <button
                  className="btn-primary"
                  disabled={payConsultation.isPending}
                  onClick={() => payConsultation.mutate()}
                >
                  <WalletCards size={17} /> Receive{" "}
                  {money(selected?.["consultationFee"], workspace.tenant.currencyCode)}
                </button>
              </div>
              {payConsultation.error ? (
                <p className="px-4 pb-4 text-sm text-rose-700">
                  {errorMessage(payConsultation.error)}
                </p>
              ) : null}
            </Card>
          ) : null}
          {canConsult && selected?.["status"] === "WAITING_FOR_DOCTOR" ? (
            <button
              className="btn-primary"
              onClick={() => navigate("/clinic/visits/" + text(selected?.["id"]))}
            >
              <Stethoscope size={17} /> Open patient examination
            </button>
          ) : null}
          {selected?.["chiefComplaint"] ? (
            <Card title="Doctor consultation">
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-bold text-slate-500">Chief complaint</span>
                  <p>{text(selected?.["chiefComplaint"])}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500">Diagnosis</span>
                  <p>{text(selected?.["diagnosis"]) || "Pending"}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500">History</span>
                  <p>{text(selected?.["history"]) || "—"}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500">Examination</span>
                  <p>{text(selected?.["examination"]) || "—"}</p>
                </div>
              </div>
            </Card>
          ) : null}
          {currentLab ? (
            <Card
              title={`Laboratory order · ${text(currentLab["visitNumber"])}`}
              description={`${rows(currentLab["tests"]).length} test(s)`}
            >
              <div className="p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge value={statusLabel(currentLab["sampleStatus"])} />
                  <strong>
                    {money(currentLab["total"], workspace.tenant.currencyCode)} · paid{" "}
                    {money(currentLab["amountPaid"], workspace.tenant.currencyCode)}
                  </strong>
                </div>
                <ul className="divide-y divide-slate-100">
                  {rows(currentLab["tests"]).map((test) => (
                    <li className="flex justify-between gap-3 py-2" key={text(test["id"])}>
                      <span>{text(test["testName"])}</span>
                      <span>
                        <StatusBadge value={statusLabel(test["resultStatus"])} />{" "}
                        {text(test["resultNote"])}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canPay && selected?.["status"] === "AWAITING_LAB_PAYMENT" ? (
                    <button
                      className="btn-primary"
                      disabled={payLab.isPending}
                      onClick={() => payLab.mutate()}
                    >
                      <WalletCards size={17} /> Receive full lab payment
                    </button>
                  ) : null}
                  {canSample &&
                  ["WAITING_FOR_SAMPLE", "WAITING_FOR_LAB"].includes(text(selected?.["status"])) ? (
                    <button
                      className="btn-primary"
                      disabled={collectSample.isPending}
                      onClick={() => collectSample.mutate()}
                    >
                      <FlaskConical size={17} /> Collect sample
                    </button>
                  ) : null}
                  {canSample &&
                  ["LAB_IN_PROGRESS", "WAITING_FOR_SAMPLE", "WAITING_FOR_LAB"].includes(
                    text(selected?.["status"]),
                  ) ? (
                    <button className="btn-secondary" onClick={() => navigate("/lab")}>
                      Open result entry
                    </button>
                  ) : null}
                  <button className="btn-secondary" onClick={() => window.print()}>
                    <Printer size={16} /> Print lab result
                  </button>
                </div>
              </div>
            </Card>
          ) : null}
          {canPrescribe &&
          ["IN_CONSULTATION", "RESULTS_READY", "PRESCRIPTION_READY"].includes(
            text(selected?.["status"]),
          ) ? (
            <button
              className="btn-primary"
              onClick={() => {
                const prescription = currentPrescription;
                setPrescriptionNotes(text(prescription?.["notes"]));
                const items = rows(prescription?.["items"]);
                setPrescriptionItems(
                  items.length
                    ? items.map((item) => ({
                        medicineName: text(item["medicineName"]),
                        dosage: text(item["dosage"]),
                        frequency: text(item["frequency"]),
                        duration: text(item["duration"]),
                        instructions: text(item["instructions"]),
                      }))
                    : [
                        {
                          medicineName: "",
                          dosage: "",
                          frequency: "",
                          duration: "",
                          instructions: "",
                        },
                      ],
                );
                setPrescriptionOpen(true);
              }}
            >
              <ClipboardPlus size={17} />{" "}
              {currentPrescription ? "Edit prescription" : "Write prescription"}
            </button>
          ) : null}
          {currentPrescription ? (
            <Card title="Prescription" description="Manual doctor prescription">
              <div className="p-4">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Dosage</th>
                      <th>Frequency</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows(currentPrescription["items"]).map((item) => (
                      <tr key={text(item["id"])}>
                        <td>{text(item["medicineName"])}</td>
                        <td>{text(item["dosage"])}</td>
                        <td>{text(item["frequency"])}</td>
                        <td>{text(item["duration"])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 flex gap-2">
                  <button className="btn-secondary" onClick={() => window.print()}>
                    <Printer size={16} /> Print prescription
                  </button>
                  {["OWNER", "ADMIN", "PHARMACIST"].includes(principal.role) ? (
                    <button className="btn-primary" onClick={() => navigate("/sales")}>
                      Open pharmacy sale
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={registerOpen}
        title="Register patient visit"
        onClose={() => setRegisterOpen(false)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate();
          }}
        >
          <Field label="Patient" hint="Dooro bukaanka booqashada loo diiwaangelinayo.">
            <select
              required
              value={visitForm.patientId}
              onChange={(event) => setVisitForm({ ...visitForm, patientId: event.target.value })}
            >
              <option value="">Choose patient</option>
              {(patients.data ?? []).map((patient) => (
                <option value={text(patient["id"])} key={text(patient["id"])}>
                  {text(patient["name"])} · {text(patient["phone"])}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setRegisterOpen(false);
              setPatientOpen(true);
            }}
          >
            + New patient
          </button>
          <Field label="Assign doctor" hint="Dooro doctor-ka qaabilaya bukaanka; waxaad sidoo kale u reebi kartaa queue-ga guud.">
            <select
              value={visitForm.doctorMembershipId}
              onChange={(event) =>
                setVisitForm({ ...visitForm, doctorMembershipId: event.target.value })
              }
            >
              <option value="">Any available doctor</option>
              {(doctors.data ?? []).map((doctor) => (
                <option value={text(doctor["id"])} key={text(doctor["id"])}>
                  {text((doctor["user"] as Row)?.["fullName"]) || text(doctor["username"])}
                </option>
              ))}
            </select>
          </Field>          <Field label="Consultation fee" hint="Geli lacagta booqashadan.">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={visitForm.consultationFee}
              onChange={(event) =>
                setVisitForm({ ...visitForm, consultationFee: event.target.value })
              }
            />
          </Field>
          {register.error ? (
            <p className="text-sm text-rose-700">{errorMessage(register.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={register.isPending}>
            Register visit
          </button>
        </form>
      </Dialog>
      <Dialog open={patientOpen} title="Register new patient" onClose={() => setPatientOpen(false)}>
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            createPatient.mutate();
          }}
        >
          <Field label="Patient name">
            <input
              required
              value={patientForm.name}
              onChange={(event) => setPatientForm({ ...patientForm, name: event.target.value })}
            />
          </Field>
          <Field label="Age">
            <input
              required
              type="number"
              min="0"
              max="130"
              value={patientForm.age}
              onChange={(event) => setPatientForm({ ...patientForm, age: event.target.value })}
            />
          </Field>
          <Field label="Sex">
            <input
              value={patientForm.sex}
              onChange={(event) => setPatientForm({ ...patientForm, sex: event.target.value })}
            />
          </Field>
          <Field label="Phone">
            <input
              value={patientForm.phone}
              onChange={(event) => setPatientForm({ ...patientForm, phone: event.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                value={patientForm.notes}
                onChange={(event) => setPatientForm({ ...patientForm, notes: event.target.value })}
              />
            </Field>
          </div>
          {createPatient.error ? (
            <p className="text-sm text-rose-700 sm:col-span-2">
              {errorMessage(createPatient.error)}
            </p>
          ) : null}
          <button className="btn-primary sm:col-span-2">Save patient</button>
        </form>
      </Dialog>
      <Dialog
        open={consultOpen}
        title="Doctor consultation"
        onClose={() => setConsultOpen(false)}
        wide
      >
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveConsultation.mutate();
          }}
        >
          <Field label="Chief complaint">
            <textarea
              required
              value={consultForm.chiefComplaint}
              onChange={(event) =>
                setConsultForm({ ...consultForm, chiefComplaint: event.target.value })
              }
            />
          </Field>
          <Field label="History">
            <textarea
              value={consultForm.history}
              onChange={(event) => setConsultForm({ ...consultForm, history: event.target.value })}
            />
          </Field>
          <Field label="Examination">
            <textarea
              value={consultForm.examination}
              onChange={(event) =>
                setConsultForm({ ...consultForm, examination: event.target.value })
              }
            />
          </Field>
          <Field label="Diagnosis">
            <textarea
              value={consultForm.diagnosis}
              onChange={(event) =>
                setConsultForm({ ...consultForm, diagnosis: event.target.value })
              }
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Doctor notes">
              <textarea
                value={consultForm.doctorNotes}
                onChange={(event) =>
                  setConsultForm({ ...consultForm, doctorNotes: event.target.value })
                }
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-semibold text-slate-700">
              Select the lab tests medically required
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {activeTests.map((test) => (
                <label
                  className="flex items-center gap-2 rounded-xl border border-slate-200 p-3"
                  key={text(test["id"])}
                >
                  <input
                    type="checkbox"
                    checked={consultForm.testIds.includes(text(test["id"]))}
                    onChange={(event) =>
                      setConsultForm({
                        ...consultForm,
                        testIds: event.target.checked
                          ? [...consultForm.testIds, text(test["id"])]
                          : consultForm.testIds.filter((id) => id !== text(test["id"])),
                      })
                    }
                  />{" "}
                  <span>
                    {text(test["name"])} · {money(test["price"], workspace.tenant.currencyCode)}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {saveConsultation.error ? (
            <p className="text-sm text-rose-700 sm:col-span-2">
              {errorMessage(saveConsultation.error)}
            </p>
          ) : null}
          <button className="btn-primary sm:col-span-2">Save consultation</button>
        </form>
      </Dialog>
      <Dialog
        open={prescriptionOpen}
        title="Manual prescription"
        onClose={() => setPrescriptionOpen(false)}
        wide
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            savePrescription.mutate();
          }}
        >
          {prescriptionItems.map((item, index) => (
            <div
              className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-5"
              key={index}
            >
              <Field label="Medicine">
                <input
                  required
                  value={item.medicineName}
                  onChange={(event) =>
                    setPrescriptionItems(
                      prescriptionItems.map((current, i) =>
                        i === index ? { ...current, medicineName: event.target.value } : current,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Dosage">
                <input
                  required
                  value={item.dosage}
                  onChange={(event) =>
                    setPrescriptionItems(
                      prescriptionItems.map((current, i) =>
                        i === index ? { ...current, dosage: event.target.value } : current,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Frequency">
                <input
                  required
                  value={item.frequency}
                  onChange={(event) =>
                    setPrescriptionItems(
                      prescriptionItems.map((current, i) =>
                        i === index ? { ...current, frequency: event.target.value } : current,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Duration">
                <input
                  required
                  value={item.duration}
                  onChange={(event) =>
                    setPrescriptionItems(
                      prescriptionItems.map((current, i) =>
                        i === index ? { ...current, duration: event.target.value } : current,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Instructions">
                <input
                  value={item.instructions}
                  onChange={(event) =>
                    setPrescriptionItems(
                      prescriptionItems.map((current, i) =>
                        i === index ? { ...current, instructions: event.target.value } : current,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          ))}
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              setPrescriptionItems([
                ...prescriptionItems,
                { medicineName: "", dosage: "", frequency: "", duration: "", instructions: "" },
              ])
            }
          >
            + Add medicine
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
          <button className="btn-primary">Save prescription</button>
        </form>
      </Dialog>
    </>
  );
}
