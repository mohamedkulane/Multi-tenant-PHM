import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPlus, Eye, Printer, ReceiptText, UserPlus, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
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
import { CatalogPagination } from "../../../components/medicine-browser";
import {
  filterReceptionVisits,
  hasPaidLabReceipt,
  loadReceptionHistory,
  receptionVisitStatus,
} from "../reception-visits";
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
  const [search, setSearch] = useState("");
  const [visitDate, setVisitDate] = useState("");
  const [page, setPage] = useState(1);
  const configuredPaymentMethods =
    workspace.branding?.paymentMethods ?? PAYMENT_METHOD_OPTIONS.map((option) => option.value);
  const paymentOptions = PAYMENT_METHOD_OPTIONS.filter((option) =>
    configuredPaymentMethods.includes(option.value),
  );
  const configuredDefaultMethod = toPaymentMethod(
    paymentOptions[0]?.value ?? DEFAULT_PAYMENT_METHOD,
  );
  const [visitOpen, setVisitOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Row | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<{
    visit: Row;
    kind: "CONSULTATION" | "LAB";
  } | null>(null);
  const [labDiscount, setLabDiscount] = useState("0");
  const [visitForm, setVisitForm] = useState({
    patientId: "",
    doctorMembershipId: "",
    consultationFee: String(workspace.branding?.consultationFee ?? 0),
    paymentMethod: configuredDefaultMethod,
    transactionReference: "",
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
  const [method, setMethod] = useState(configuredDefaultMethod);
  const [transactionReference, setTransactionReference] = useState("");
  const visits = useQuery({
    queryKey: ["clinic-visits", branch?.id],
    queryFn: () => loadReceptionHistory(branch!.id),
    enabled: Boolean(branch),
  });
  const receptionVisits = filterReceptionVisits(
    visits.data ?? [],
    search,
    visitDate,
    branch?.timezone,
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(receptionVisits.length / 10)));
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
  useEffect(() => {
    const visitId = new URLSearchParams(window.location.search).get("visit");
    if (visitId && visits.data)
      setSelectedVisit(visits.data.find((visit) => text(visit["id"]) === visitId) ?? null);
  }, [visits.data]);
  const refresh = () => client.invalidateQueries({ queryKey: ["clinic-visits"] });
  const register = useMutation({
    mutationFn: async () => {
      const visit = await sendData<Row>("post", "/clinic/visits", {
        branchId: branch!.id,
        patientId: visitForm.patientId,
        consultationFee: visitForm.consultationFee,
        doctorMembershipId: visitForm.doctorMembershipId || undefined,
      });
      if (Number(visitForm.consultationFee) > 0) {
        await sendData<Row>("post", `/clinic/visits/${text(visit["id"])}/consultation-payment`, {
          method: visitForm.paymentMethod,
          externalReference: visitForm.transactionReference.trim() || undefined,
          idempotencyKey: `consultation:${text(visit["id"])}:${crypto.randomUUID()}`,
        });
      }
      return visit;
    },
    onSuccess: async () => {
      setVisitOpen(false);
      setVisitForm({
        patientId: "",
        doctorMembershipId: "",
        consultationFee: String(workspace.branding?.consultationFee ?? 0),
        paymentMethod: configuredDefaultMethod,
        transactionReference: "",
      });
      showToast({
        title: "Patient visit registered and paid",
        message: "The patient is cleared to proceed to the doctor.",
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
            const discount = Number(labDiscount || 0);
            const discountedBalance =
              Number(text(lab["subtotal"])) - discount - Number(text(lab["amountPaid"]));
            return sendData<Row>("post", `/lab/visits/${text(lab["id"])}/payments`, {
              amount: discountedBalance.toFixed(2),
              discount: discount.toFixed(2),
              method,
              externalReference: transactionReference.trim() || undefined,
              idempotencyKey: `laboratory:${text(lab["id"])}:${crypto.randomUUID()}`,
            });
          })(),
    onSuccess: async () => {
      setTransactionReference("");
      setPaymentTarget(null);
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
        title="All patient visits"
        description="Clinical details and laboratory results are hidden from Reception."
      >
        <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0 flex-1">
            <Field label="Search visits">
              <input
                placeholder="Patient name, patient number or visit"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>
          <Field label="Visit date (optional)">
            <input
              type="date"
              value={visitDate}
              onChange={(event) => {
                setVisitDate(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          {search || visitDate ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearch("");
                setVisitDate("");
                setPage(1);
              }}
            >
              Show all visits
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          {receptionVisits.length ? (
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
                {receptionVisits.slice((currentPage - 1) * 10, currentPage * 10).map((visit) => {
                  const status = text(visit["status"]);
                  const lab = rows(visit["labVisits"])[0];
                  return (
                    <tr key={text(visit["id"])}>
                      <td className="font-semibold">{text(visit["visitNumber"])}</td>
                      <td>{text((visit["patient"] as Row)?.["name"])}</td>
                      <td>
                        <StatusBadge value={receptionVisitStatus(visit)} />
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
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setSelectedVisit(visit)}
                          >
                            <Eye size={16} /> View
                          </button>
                          {visit["consultationPaymentStatus"] === "PAID" ? (
                            <Link
                              className="btn-secondary"
                              to={`/clinic/visits/${text(visit["id"])}/print/consultation-receipt`}
                            >
                              <Printer size={16} /> Consultation receipt
                            </Link>
                          ) : null}
                          {status === "AWAITING_CONSULTATION_PAYMENT" ? (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => setPaymentTarget({ visit, kind: "CONSULTATION" })}
                            >
                              <WalletCards size={16} /> Receive fee
                            </button>
                          ) : status === "AWAITING_LAB_PAYMENT" ? (
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => {
                                setLabDiscount(text(lab?.["discount"]) || "0");
                                setPaymentTarget({ visit, kind: "LAB" });
                              }}
                            >
                              <WalletCards size={16} /> Collect lab payment
                            </button>
                          ) : null}
                          {hasPaidLabReceipt(visit) ? (
                            <Link
                              className="btn-secondary"
                              to={`/clinic/visits/${text(visit["id"])}/print/lab-receipt`}
                            >
                              <Printer size={16} /> Lab authorization
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="No matching visits"
              description="Clear the search or date to see earlier visits."
            />
          )}
        </div>
        <CatalogPagination
          page={currentPage}
          count={receptionVisits.length}
          pageSize={10}
          onChange={setPage}
          noun="visits"
        />
      </Card>
      <Dialog
        open={Boolean(selectedVisit)}
        title={`Visit ${text(selectedVisit?.["visitNumber"])}`}
        onClose={() => setSelectedVisit(null)}
        wide
      >
        {selectedVisit ? (
          <div className="space-y-5 p-5">
            <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Patient</p>
                <p className="mt-1 font-bold">
                  {text((selectedVisit["patient"] as Row)?.["name"])}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Patient number</p>
                <p className="mt-1 font-bold">
                  {text((selectedVisit["patient"] as Row)?.["patientNumber"])}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase">Status</p>
                <div className="mt-1">
                  <StatusBadge value={receptionVisitStatus(selectedVisit)} />
                </div>
              </div>
            </div>
            {rows(selectedVisit["labVisits"]).map((lab) => (
              <section
                key={text(lab["id"])}
                className="overflow-hidden rounded-2xl border border-slate-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-4">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase">Laboratory order</p>
                    <p className="font-bold">{text(lab["visitNumber"])}</p>
                  </div>
                  <StatusBadge
                    value={
                      Number(lab["amountPaid"]) >= Number(lab["total"])
                        ? "PAID"
                        : "PAYMENT REQUIRED"
                    }
                  />
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Sample</th>
                      {text(selectedVisit["status"]) === "AWAITING_LAB_PAYMENT" ? (
                        <th>Price</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {rows(lab["tests"]).map((test) => (
                      <tr key={text(test["id"])}>
                        <td className="font-semibold">{text(test["testName"])}</td>
                        <td>{text(test["sampleType"]) || "Specimen"}</td>
                        {text(selectedVisit["status"]) === "AWAITING_LAB_PAYMENT" ? (
                          <td>{money(test["price"], workspace.tenant.currencyCode)}</td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {Number(lab["amountPaid"]) >= Number(lab["total"]) ? (
                  <div className="flex justify-end p-4">
                    <Link
                      className="btn-primary"
                      to={`/clinic/visits/${text(selectedVisit["id"])}/print/lab-receipt`}
                    >
                      <ReceiptText size={16} /> Print lab authorization
                    </Link>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        ) : null}
      </Dialog>
      <Dialog
        open={Boolean(paymentTarget)}
        title={
          paymentTarget?.kind === "LAB" ? "Collect laboratory payment" : "Collect consultation fee"
        }
        onClose={() => setPaymentTarget(null)}
        wide={paymentTarget?.kind === "LAB"}
      >
        {paymentTarget ? (
          <form
            className="space-y-4 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              pay.mutate(paymentTarget);
            }}
          >
            {paymentTarget.kind === "LAB" ? (
              (() => {
                const lab = rows(paymentTarget.visit["labVisits"])[0]!;
                const subtotal = Number(lab["subtotal"] ?? 0);
                const discount = Number(labDiscount || 0);
                const total = Math.max(0, subtotal - discount);
                return (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Test</th>
                            <th>Sample</th>
                            <th>Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows(lab["tests"]).map((test) => (
                            <tr key={text(test["id"])}>
                              <td className="font-semibold">{text(test["testName"])}</td>
                              <td>{text(test["sampleType"]) || "Specimen"}</td>
                              <td>{money(test["price"], workspace.tenant.currencyCode)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="ml-auto grid max-w-md grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                      <span>Subtotal</span>
                      <strong className="text-right">
                        {money(subtotal, workspace.tenant.currencyCode)}
                      </strong>
                      <label htmlFor="lab-discount">Discount</label>
                      <input
                        id="lab-discount"
                        type="number"
                        min="0"
                        max={subtotal}
                        step="0.01"
                        value={labDiscount}
                        onChange={(event) => setLabDiscount(event.target.value)}
                      />
                      <span className="border-t pt-3 font-bold">Total</span>
                      <strong className="border-t pt-3 text-right text-lg">
                        {money(total, workspace.tenant.currencyCode)}
                      </strong>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">Consultation fee</p>
                <p className="text-2xl font-black">
                  {money(paymentTarget.visit["consultationFee"], workspace.tenant.currencyCode)}
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Payment method">
                <select
                  value={method}
                  onChange={(event) => setMethod(toPaymentMethod(event.target.value))}
                >
                  {paymentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Transaction reference (optional)">
                <input
                  value={transactionReference}
                  onChange={(event) => setTransactionReference(event.target.value)}
                />
              </Field>
            </div>
            {pay.error ? (
              <p className="text-sm font-semibold text-rose-700">{errorMessage(pay.error)}</p>
            ) : null}
            <button
              className="btn-primary w-full"
              disabled={
                pay.isPending ||
                (paymentTarget.kind === "LAB" &&
                  Number(labDiscount) >=
                    Number(rows(paymentTarget.visit["labVisits"])[0]?.["subtotal"] ?? 0))
              }
            >
              <WalletCards size={16} /> {pay.isPending ? "Processing…" : "Confirm payment"}
            </button>
          </form>
        ) : null}
      </Dialog>
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
          <Field label="Payment method">
            <select
              value={visitForm.paymentMethod}
              onChange={(event) =>
                setVisitForm({ ...visitForm, paymentMethod: toPaymentMethod(event.target.value) })
              }
            >
              {paymentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Transaction reference (optional)">
            <input
              value={visitForm.transactionReference}
              onChange={(event) =>
                setVisitForm({ ...visitForm, transactionReference: event.target.value })
              }
            />
          </Field>
          <button className="btn-primary" disabled={register.isPending}>
            {register.isPending
              ? "Registering and collecting…"
              : "Register visit & collect payment"}
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
