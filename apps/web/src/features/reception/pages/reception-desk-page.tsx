import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPlus, Printer, UserPlus, WalletCards } from "lucide-react";
import { useState } from "react";
import { errorMessage, getData, sendData } from "../../../api/client";
import { showToast } from "../../../components/toast";
import {
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  StatusBadge,
  date,
  money,
} from "../../../components/ui";
import type { Branch, Workspace } from "../../../types";
import { Link } from "../../../lib/navigation";
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHOD_OPTIONS,
  toPaymentMethod,
} from "../../../lib/payment-methods";

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);

export function ReceptionDeskPage({
  branch,
  workspace,
}: {
  branch: Branch | undefined;
  workspace: Workspace;
}) {
  const client = useQueryClient();
  const [visitOpen, setVisitOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [visitForm, setVisitForm] = useState({
    patientId: "",
    doctorMembershipId: "",
    consultationFee: "0",
  });
  const [patientForm, setPatientForm] = useState({
    name: "",
    sex: "",
    dateOfBirth: "",
    estimatedAgeValue: "",
    estimatedAgeUnit: "YEARS",
    phone: "",
    allergyStatus: "UNKNOWN",
    allergies: "",
  });
  const [method, setMethod] = useState(DEFAULT_PAYMENT_METHOD);
  const [transactionReference, setTransactionReference] = useState("");
  const visits = useQuery({
    queryKey: ["clinic-visits", branch?.id],
    queryFn: () => getData<Row[]>(`/clinic/visits?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const patients = useQuery({
    queryKey: ["reception-patients"],
    queryFn: () => getData<Row[]>("/lab/patients"),
    enabled: Boolean(branch),
  });
  const doctors = useQuery({
    queryKey: ["clinic-doctors", branch?.id],
    queryFn: () => getData<Row[]>(`/clinic/doctors?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["clinic-visits"] });
  const register = useMutation({
    mutationFn: () =>
      sendData<Row>("post", "/clinic/visits", {
        branchId: branch!.id,
        patientId: visitForm.patientId,
        consultationFee: visitForm.consultationFee,
        doctorMembershipId: visitForm.doctorMembershipId || undefined,
      }),
    onSuccess: async () => {
      setVisitOpen(false);
      setVisitForm({ patientId: "", doctorMembershipId: "", consultationFee: "0" });
      showToast({
        title: "Patient visit registered",
        message: "Collect the consultation fee before sending the patient to the doctor.",
      });
      await refresh();
    },
    onError: (error) =>
      showToast({ title: "Visit not registered", message: errorMessage(error), tone: "error" }),
  });
  const createPatient = useMutation({
    mutationFn: () =>
      sendData<Row>("post", "/lab/patients", {
        name: patientForm.name,
        sex: patientForm.sex,
        dateOfBirth: patientForm.dateOfBirth || undefined,
        estimatedAgeValue: patientForm.dateOfBirth
          ? undefined
          : Number(patientForm.estimatedAgeValue),
        estimatedAgeUnit: patientForm.dateOfBirth ? undefined : patientForm.estimatedAgeUnit,
        phone: patientForm.phone || undefined,
        allergyStatus: patientForm.allergyStatus,
        allergies:
          patientForm.allergyStatus === "HAS_ALLERGIES"
            ? patientForm.allergies || undefined
            : undefined,
      }),
    onSuccess: async (patient) => {
      setPatientOpen(false);
      setPatientForm({
        name: "",
        sex: "",
        dateOfBirth: "",
        estimatedAgeValue: "",
        estimatedAgeUnit: "YEARS",
        phone: "",
        allergyStatus: "UNKNOWN",
        allergies: "",
      });
      setVisitForm((current) => ({ ...current, patientId: text(patient["id"]) }));
      await client.invalidateQueries({ queryKey: ["reception-patients"] });
      setVisitOpen(true);
    },
    onError: (error) =>
      showToast({ title: "Patient not saved", message: errorMessage(error), tone: "error" }),
  });
  const pay = useMutation({
    mutationFn: ({ visit, kind }: { visit: Row; kind: "CONSULTATION" | "LAB" }) =>
      kind === "CONSULTATION"
        ? sendData<Row>("post", `/clinic/visits/${text(visit["id"])}/consultation-payment`, {
            method,
            externalReference: transactionReference.trim() || undefined,
            idempotencyKey: `consultation:${text(visit["id"])}:${crypto.randomUUID()}`,
          })
        : (() => {
            const lab = rows(visit["labVisits"])[0]!;
            const balance = Number(text(lab["total"])) - Number(text(lab["amountPaid"]));
            return sendData<Row>("post", `/lab/visits/${text(lab["id"])}/payments`, {
              amount: balance.toFixed(2),
              method,
              externalReference: transactionReference.trim() || undefined,
              idempotencyKey: `laboratory:${text(lab["id"])}:${crypto.randomUUID()}`,
            });
          })(),
    onSuccess: async () => {
      setTransactionReference("");
      showToast({
        title: "Payment received",
        message: "The patient can proceed to the next care station.",
      });
      await refresh();
    },
    onError: (error) =>
      showToast({ title: "Payment not recorded", message: errorMessage(error), tone: "error" }),
  });
  if (!branch) return <EmptyState title="Choose a branch" />;
  if (visits.isLoading) return <LoadingState label="Loading reception desk" />;
  if (visits.error) return <ErrorState error={visits.error} />;
  return (
    <>
      <PageHeader
        eyebrow="Front desk operations"
        title="Patient desk"
        description="Register the patient, collect each required fee, and confirm the next care station."
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setPatientOpen(true)}>
              <UserPlus size={17} /> New patient
            </button>
            <button className="btn-primary" onClick={() => setVisitOpen(true)}>
              <ClipboardPlus size={17} /> Register visit
            </button>
          </div>
        }
      />
      <Card
        title="Patient flow"
        description="Clinical details and laboratory results are hidden from Reception."
      >
        <div className="border-b border-slate-100 p-4">
          <Field label="Payment Method *">
            <select
              className="max-w-xs"
              value={method}
              onChange={(event) => setMethod(toPaymentMethod(event.target.value))}
            >
              {PAYMENT_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Transaction Reference"
            hint={method === "SALAAM_BANK" ? "Recommended for Salaam Bank" : "Optional"}
          >
            <input
              className="max-w-xs"
              value={transactionReference}
              onChange={(event) => setTransactionReference(event.target.value)}
              placeholder="Optional transaction reference"
            />
          </Field>
        </div>
        <div className="overflow-x-auto">
          {visits.data?.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Patient</th>
                  <th>Status / next step</th>
                  <th>Registered</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visits.data.map((visit) => {
                  const status = text(visit["status"]);
                  const lab = rows(visit["labVisits"])[0];
                  return (
                    <tr key={text(visit["id"])}>
                      <td className="font-semibold">{text(visit["visitNumber"])}</td>
                      <td>{text((visit["patient"] as Row)?.["name"])}</td>
                      <td>
                        <StatusBadge value={status} />
                        <p className="mt-1 text-xs text-slate-500">
                          {status === "AWAITING_CONSULTATION_PAYMENT"
                            ? "Collect consultation fee"
                            : status === "AWAITING_LAB_PAYMENT"
                              ? `Collect ${money(Number(text(lab?.["total"])) - Number(text(lab?.["amountPaid"])), workspace.tenant.currencyCode)} laboratory balance`
                              : "Track patient hand-off"}
                        </p>
                      </td>
                      <td>{date(visit["createdAt"])}</td>
                      <td>
                        {status === "AWAITING_CONSULTATION_PAYMENT" ? (
                          <button
                            className="btn-primary"
                            disabled={pay.isPending}
                            onClick={() => pay.mutate({ visit, kind: "CONSULTATION" })}
                          >
                            <WalletCards size={16} /> Receive fee
                          </button>
                        ) : status === "AWAITING_LAB_PAYMENT" ? (
                          <button
                            className="btn-primary"
                            disabled={pay.isPending}
                            onClick={() => pay.mutate({ visit, kind: "LAB" })}
                          >
                            <WalletCards size={16} /> Receive lab fee
                          </button>
                        ) : lab &&
                          [
                            "WAITING_FOR_SAMPLE",
                            "LAB_IN_PROGRESS",
                            "LAB_RESULTS_READY",
                            "DOCTOR_REVIEW",
                            "COMPLETED",
                          ].includes(status) ? (
                          <Link
                            className="btn-secondary"
                            to={`/clinic/visits/${text(visit["id"])}/print/lab-receipt`}
                          >
                            <Printer size={16} /> Print lab receipt
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState title="No visits today" />
          )}
        </div>
      </Card>
      <Dialog
        open={visitOpen}
        title="Register patient visit"
        description="Assign a doctor and set the consultation fee."
        onClose={() => setVisitOpen(false)}
      >
        <form
          className="grid gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            register.mutate();
          }}
        >
          <Field label="Patient">
            <select
              required
              value={visitForm.patientId}
              onChange={(event) => setVisitForm({ ...visitForm, patientId: event.target.value })}
            >
              <option value="">Choose patient</option>
              {(patients.data ?? []).map((patient) => (
                <option key={text(patient["id"])} value={text(patient["id"])}>
                  {text(patient["patientNumber"])} · {text(patient["name"])}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Doctor">
            <select
              value={visitForm.doctorMembershipId}
              onChange={(event) =>
                setVisitForm({ ...visitForm, doctorMembershipId: event.target.value })
              }
            >
              <option value="">Any available doctor</option>
              {(doctors.data ?? []).map((doctor) => (
                <option key={text(doctor["id"])} value={text(doctor["id"])}>
                  {text(doctor["fullName"]) || text(doctor["username"])}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Consultation fee">
            <input
              required
              inputMode="decimal"
              value={visitForm.consultationFee}
              onChange={(event) =>
                setVisitForm({ ...visitForm, consultationFee: event.target.value })
              }
            />
          </Field>
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
          <Field label="Patient name *">
            <input
              required
              value={patientForm.name}
              onChange={(event) => setPatientForm({ ...patientForm, name: event.target.value })}
            />
          </Field>
          <Field label="Sex *">
            <select
              required
              value={patientForm.sex}
              onChange={(event) => setPatientForm({ ...patientForm, sex: event.target.value })}
            >
              <option value="">Choose sex</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={patientForm.dateOfBirth}
              onChange={(event) =>
                setPatientForm({
                  ...patientForm,
                  dateOfBirth: event.target.value,
                  estimatedAgeValue: event.target.value ? "" : patientForm.estimatedAgeValue,
                })
              }
            />
          </Field>
          <Field label="Estimated age (when DOB is unknown) *">
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                required={!patientForm.dateOfBirth}
                disabled={Boolean(patientForm.dateOfBirth)}
                type="number"
                min="0"
                max="130"
                value={patientForm.estimatedAgeValue}
                onChange={(event) =>
                  setPatientForm({ ...patientForm, estimatedAgeValue: event.target.value })
                }
              />
              <select
                disabled={Boolean(patientForm.dateOfBirth)}
                value={patientForm.estimatedAgeUnit}
                onChange={(event) =>
                  setPatientForm({ ...patientForm, estimatedAgeUnit: event.target.value })
                }
              >
                <option value="DAYS">Days</option>
                <option value="MONTHS">Months</option>
                <option value="YEARS">Years</option>
              </select>
            </div>
          </Field>
          <details className="rounded-xl border border-slate-200 p-4 sm:col-span-2">
            <summary className="cursor-pointer font-semibold text-slate-800">
              + Additional information
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Phone (optional)">
                <input
                  value={patientForm.phone}
                  onChange={(event) =>
                    setPatientForm({ ...patientForm, phone: event.target.value })
                  }
                />
              </Field>
              <Field label="Allergy status">
                <select
                  value={patientForm.allergyStatus}
                  onChange={(event) =>
                    setPatientForm({ ...patientForm, allergyStatus: event.target.value })
                  }
                >
                  <option value="UNKNOWN">Unknown</option>
                  <option value="NO_KNOWN_ALLERGIES">No known allergies</option>
                  <option value="HAS_ALLERGIES">Has allergies</option>
                </select>
              </Field>
              {patientForm.allergyStatus === "HAS_ALLERGIES" ? (
                <div className="sm:col-span-2">
                  <Field label="Allergy details *">
                    <textarea
                      required
                      value={patientForm.allergies}
                      onChange={(event) =>
                        setPatientForm({ ...patientForm, allergies: event.target.value })
                      }
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          </details>
          <button className="btn-primary sm:col-span-2" disabled={createPatient.isPending}>
            Save patient
          </button>
        </form>
      </Dialog>
    </>
  );
}
