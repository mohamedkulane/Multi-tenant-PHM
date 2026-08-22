import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Printer, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  SimpleTable,
  StatusBadge,
} from "../components/ui";
import type { Branch, TenantPrincipal, Workspace } from "../types";

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const object = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
const idempotency = (prefix: string) => prefix + ":" + Date.now() + ":" + crypto.randomUUID();

export function CustomersPage({
  workspace,
  principal,
}: {
  workspace: Workspace;
  principal: TenantPrincipal;
}) {
  const canManage = ["OWNER", "ADMIN", "RECEPTIONIST", "PHARMACIST"].includes(principal.role);
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Row | null>(null);
  const [invoiceSale, setInvoiceSale] = useState<Row | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "", active: true });
  const query = useQuery({
    queryKey: ["customers", search],
    queryFn: () => getData<Row[]>(`/customers?q=${encodeURIComponent(search)}`),
  });
  const ledger = useQuery({
    queryKey: ["customer-ledger", ledgerCustomer?.["id"]],
    queryFn: () => getData<Row>(`/customers/${text(ledgerCustomer?.["id"])}`),
    enabled: Boolean(ledgerCustomer),
  });
  const save = useMutation({
    mutationFn: () =>
      editing?.["id"]
        ? sendData("put", `/customers/${text(editing["id"])}`, form)
        : sendData("post", "/customers", form),
    onSuccess: async () => {
      setEditing(null);
      setForm({ name: "", phone: "", address: "", notes: "", active: true });
      showToast({
        title: "Customer account saved",
        message: "Buugga macmiilka hadda wuxuu diyaar u yahay sales iyo debt cusub.",
      });
      await client.invalidateQueries({ queryKey: ["customers"] });
    },
  });
  const openForm = (customer?: Row) => {
    setEditing(customer ?? {});
    setForm(
      customer
        ? {
            name: text(customer["name"]),
            phone: text(customer["phone"]),
            address: text(customer["address"]),
            notes: text(customer["notes"]),
            active: customer["active"] !== false,
          }
        : { name: "", phone: "", address: "", notes: "", active: true },
    );
  };
  return (
    <>
      <PageHeader
        eyebrow="Customer accounts"
        title="Customers and debt books"
        description="Diiwaangeli macmiilka hal mar, ku dar sales cusub buuggiisa, oo arag invoices, payments iyo deynta isku geysan."
        actions={
          canManage ? (
            <button className="btn-primary" onClick={() => openForm()}>
              <Plus size={16} /> New customer
            </button>
          ) : undefined
        }
      />
      <Card>
        <div className="border-b border-slate-100 p-4">
          <label className="relative block max-w-xl">
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              className="input pl-10"
              placeholder="Raadi magaca ama telefoonka (Search customer)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <SimpleTable
            rows={query.data ?? []}
            columns={[
              {
                label: "Customer",
                render: (row) => (
                  <div>
                    <p className="font-bold text-slate-900">{text(row["name"])}</p>
                    <p className="text-xs text-slate-500">{text(row["phone"])}</p>
                  </div>
                ),
              },
              {
                label: "Sales",
                render: (row) => text((row["_count"] as Row | undefined)?.["sales"] ?? 0),
              },
              {
                label: "Outstanding",
                render: (row) => (
                  <strong className="text-rose-700">
                    {money(row["outstandingBalance"], workspace.tenant.currencyCode)}
                  </strong>
                ),
              },
              {
                label: "Status",
                render: (row) => (
                  <StatusBadge value={row["active"] === false ? "INACTIVE" : "ACTIVE"} />
                ),
              },
              {
                label: "Actions",
                render: (row) => (
                  <div className="flex gap-2">
                    <button className="btn-secondary" onClick={() => setLedgerCustomer(row)}>
                      Open ledger
                    </button>
                    {canManage ? (
                      <button className="btn-secondary" onClick={() => openForm(row)}>
                        <Pencil size={15} /> Edit
                      </button>
                    ) : null}
                  </div>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Dialog
        open={editing !== null}
        title={editing?.["id"] ? "Edit customer" : "New customer account"}
        onClose={() => setEditing(null)}
      >
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Magaca macmiilka (Customer name)">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Telefoonka (Phone)">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </Field>
          <Field label="Cinwaanka (Address)">
            <input
              className="input"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Xaaladda (Status)">
            <select
              className="input"
              value={form.active ? "ACTIVE" : "INACTIVE"}
              onChange={(e) => setForm({ ...form, active: e.target.value === "ACTIVE" })}
            >
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Faahfaahin (Notes)">
              <textarea
                className="input min-h-24"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
          {save.error ? (
            <p className="text-sm text-rose-700 sm:col-span-2">{errorMessage(save.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={save.isPending}>
              Save customer
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        wide
        open={Boolean(ledgerCustomer)}
        title={`Customer ledger: ${text(ledgerCustomer?.["name"])}`}
        description="Sales, debt and payment history"
        onClose={() => setLedgerCustomer(null)}
      >
        <div className="max-h-[70vh] overflow-y-auto p-5">
          {ledger.isLoading ? (
            <LoadingState />
          ) : ledger.error ? (
            <ErrorState error={ledger.error} />
          ) : (
            <SimpleTable
              rows={rows(ledger.data?.["sales"])}
              columns={[
                {
                  label: "Invoice",
                  render: (row) => <strong>{text(row["invoiceNumber"])}</strong>,
                },
                { label: "Date", render: (row) => date(row["createdAt"]) },
                {
                  label: "Total",
                  render: (row) => money(row["grandTotal"], workspace.tenant.currencyCode),
                },
                {
                  label: "Paid",
                  render: (row) => money(row["amountPaid"], workspace.tenant.currencyCode),
                },
                {
                  label: "Balance",
                  render: (row) => (
                    <strong className="text-rose-700">
                      {money(row["remainingBalance"], workspace.tenant.currencyCode)}
                    </strong>
                  ),
                },
                {
                  label: "Invoice",
                  render: (row) => (
                    <button className="btn-secondary" onClick={() => setInvoiceSale(row)}>
                      <Printer size={15} /> Print
                    </button>
                  ),
                },
              ]}
            />
          )}
        </div>
      </Dialog>
      <Dialog
        wide
        open={Boolean(invoiceSale)}
        title={"Invoice " + text(invoiceSale?.["invoiceNumber"])}
        onClose={() => setInvoiceSale(null)}
      >
        {invoiceSale ? (
          <div className="p-5">
            <div className="mb-4 flex justify-end">
              <button className="btn-primary" onClick={() => window.print()}>
                <Printer size={16} /> Print invoice
              </button>
            </div>
            <section className="invoice-print-sheet rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <header className="flex items-start justify-between gap-6 border-b-2 border-emerald-800 pb-5">
                <div>
                  <h2 className="text-2xl font-black text-emerald-900">
                    {workspace.branding?.displayName ?? workspace.tenant.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {workspace.branches.find((item) => item.id === text(invoiceSale["branchId"]))
                      ?.name ?? ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black">
                    {workspace.branding?.invoiceTitle ?? "SALES INVOICE"}
                  </p>
                  <p className="font-bold text-emerald-800">{text(invoiceSale["invoiceNumber"])}</p>
                  <p className="text-xs text-slate-500">{date(invoiceSale["createdAt"])}</p>
                </div>
              </header>
              <div className="grid gap-4 border-b border-slate-200 py-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Customer
                  </p>
                  <p className="mt-1 font-bold">{text(invoiceSale["customerName"])}</p>
                  <p className="text-sm text-slate-600">{text(invoiceSale["customerPhone"])}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Status
                  </p>
                  <p
                    className={
                      Number(invoiceSale["remainingBalance"]) > 0
                        ? "font-black text-rose-700"
                        : "font-black text-emerald-700"
                    }
                  >
                    {Number(invoiceSale["remainingBalance"]) > 0 ? "PAYMENT DUE" : "PAID IN FULL"}
                  </p>
                </div>
              </div>
              <table className="my-5 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-xs uppercase text-slate-500">
                    <th className="py-3">Product</th>
                    <th>Package</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {rows(invoiceSale["items"]).map((item) => (
                    <tr key={text(item["id"])} className="border-b border-slate-100">
                      <td className="py-3 font-semibold">{text(item["productName"])}</td>
                      <td>{text(item["packageLabel"] ?? item["packageCode"])}</td>
                      <td className="text-right">{text(item["packageQuantity"])}</td>
                      <td className="text-right font-bold">
                        {money(
                          item["lineTotal"] ?? item["subtotal"],
                          workspace.tenant.currencyCode,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ml-auto max-w-sm space-y-2 text-sm">
                <p className="flex justify-between">
                  <span>Total</span>
                  <strong>{money(invoiceSale["grandTotal"], workspace.tenant.currencyCode)}</strong>
                </p>
                <p className="flex justify-between text-emerald-800">
                  <span>Paid</span>
                  <strong>{money(invoiceSale["amountPaid"], workspace.tenant.currencyCode)}</strong>
                </p>
                <p className="flex justify-between border-t pt-2 text-rose-700">
                  <span>Balance</span>
                  <strong>
                    {money(invoiceSale["remainingBalance"], workspace.tenant.currencyCode)}
                  </strong>
                </p>
              </div>
              {workspace.branding?.invoiceFooter ? (
                <footer className="mt-8 border-t pt-4 text-center text-xs text-slate-500">
                  {workspace.branding.invoiceFooter}
                </footer>
              ) : null}
            </section>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

export function SuppliersPage({ principal }: { principal: TenantPrincipal }) {
  const canManage = ["OWNER", "ADMIN"].includes(principal.role);
  const client = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const blank = {
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    active: true,
  };
  const [form, setForm] = useState(blank);
  const query = useQuery({ queryKey: ["suppliers"], queryFn: () => getData<Row[]>("/suppliers") });
  const save = useMutation({
    mutationFn: () =>
      editing?.["id"]
        ? sendData("put", `/suppliers/${text(editing["id"])}`, form)
        : sendData("post", "/suppliers", form),
    onSuccess: async () => {
      setEditing(null);
      setForm(blank);
      showToast({ title: "Supplier saved" });
      await client.invalidateQueries({ queryKey: ["suppliers"] });
    },
  });
  const open = (row?: Row) => {
    setEditing(row ?? {});
    setForm(
      row
        ? {
            name: text(row["name"]),
            contactPerson: text(row["contactPerson"]),
            phone: text(row["phone"]),
            email: text(row["email"]),
            address: text(row["address"]),
            notes: text(row["notes"]),
            active: row["active"] !== false,
          }
        : blank,
    );
  };
  return (
    <>
      <PageHeader
        eyebrow="Procurement"
        title="Suppliers"
        description="Manage approved medicine suppliers and link them to every stock receipt."
        actions={
          canManage ? (
            <button className="btn-primary" onClick={() => open()}>
              <Plus size={16} /> Add supplier
            </button>
          ) : undefined
        }
      />
      <Card>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <SimpleTable
            rows={query.data ?? []}
            columns={[
              {
                label: "Supplier",
                render: (r) => (
                  <div>
                    <strong>{text(r["name"])}</strong>
                    <p className="text-xs text-slate-500">{text(r["contactPerson"])}</p>
                  </div>
                ),
              },
              {
                label: "Contact",
                render: (r) => (
                  <div>
                    {text(r["phone"])}
                    <p className="text-xs">{text(r["email"])}</p>
                  </div>
                ),
              },
              {
                label: "Receipts",
                render: (r) => text((r["_count"] as Row | undefined)?.["receipts"] ?? 0),
              },
              {
                label: "Status",
                render: (r) => (
                  <StatusBadge value={r["active"] === false ? "INACTIVE" : "ACTIVE"} />
                ),
              },
              {
                label: "Actions",
                render: (r) =>
                  canManage ? (
                    <button className="btn-secondary" onClick={() => open(r)}>
                      <Pencil size={15} /> Edit
                    </button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>
      <Dialog
        open={editing !== null}
        title={editing?.["id"] ? "Edit supplier" : "New supplier"}
        onClose={() => setEditing(null)}
      >
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Magaca supplier-ka (Supplier name)">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Qofka lala xiriirayo (Contact person)">
            <input
              className="input"
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            />
          </Field>
          <Field label="Telefoonka (Phone)">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Cinwaanka (Address)">
              <input
                className="input"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Faahfaahin (Notes)">
              <textarea
                className="input min-h-20"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
          {save.error ? (
            <p className="text-sm text-rose-700 sm:col-span-2">{errorMessage(save.error)}</p>
          ) : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary">Save supplier</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function LabReportPrint({
  visit,
  workspace,
  branch,
}: {
  visit: Row;
  workspace: Workspace;
  branch: Branch;
}) {
  const patient = (visit["patient"] ?? {}) as Row;
  const tests = rows(visit["tests"]);
  const payments = rows(visit["payments"]);
  const balance = Math.max(0, Number(visit["total"] ?? 0) - Number(visit["amountPaid"] ?? 0));
  const pharmacyName = workspace.branding?.displayName ?? workspace.tenant.name;
  return (
    <article className="invoice-print-sheet lab-report-print-sheet" aria-label="Laboratory report">
      <header className="lab-print-header">
        <div className="lab-print-brand">
          {workspace.branding?.invoiceShowLogo !== false && workspace.branding?.logoUrl ? (
            <img src={workspace.branding.logoUrl} alt="Pharmacy logo" />
          ) : (
            <span className="lab-print-mark">+</span>
          )}
          <div>
            <h1>{pharmacyName}</h1>
            <p>{workspace.tenant.name}</p>
            <p>
              {branch.name} | {branch.code}
              {branch.phone ? " | " + branch.phone : ""}
            </p>
            {workspace.branding?.supportContact ? <p>{workspace.branding.supportContact}</p> : null}
          </div>
        </div>
        <div className="lab-print-title">
          <p>LABORATORY</p>
          <h2>Test Report & Invoice</h2>
          <strong>{text(visit["visitNumber"])}</strong>
          <span>{date(visit["createdAt"])}</span>
        </div>
      </header>
      <section className="lab-print-patient">
        <div>
          <span>Patient name</span>
          <strong>{text(patient["name"])}</strong>
        </div>
        <div>
          <span>Age</span>
          <strong>{text(patient["age"])}</strong>
        </div>
        <div>
          <span>Sex</span>
          <strong>{text(patient["sex"]) || "-"}</strong>
        </div>
        <div>
          <span>Phone</span>
          <strong>{text(patient["phone"]) || "-"}</strong>
        </div>
        <div>
          <span>Branch</span>
          <strong>{branch.name}</strong>
        </div>
        <div>
          <span>Status</span>
          <strong>{text(visit["status"]).replaceAll("_", " ")}</strong>
        </div>
      </section>
      <section className="lab-print-section">
        <h3>Baaritaannada iyo natiijooyinka (Tests & Results)</h3>
        <table className="lab-print-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Category</th>
              <th>Test</th>
              <th>Result</th>
              <th>Details</th>
              <th className="money-cell">Price</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((test, index) => (
              <tr key={text(test["id"])}>
                <td>{index + 1}</td>
                <td>{text(test["categoryName"])}</td>
                <td>
                  <strong>{text(test["testName"])}</strong>
                </td>
                <td>
                  <span
                    className={"lab-result lab-result-" + text(test["resultStatus"]).toLowerCase()}
                  >
                    {text(test["resultStatus"])}
                  </span>
                </td>
                <td>{text(test["resultNote"]) || "-"}</td>
                <td className="money-cell">
                  {money(test["price"], workspace.tenant.currencyCode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {visit["clinicalNotes"] ? (
        <section className="lab-print-notes">
          <span>Clinical notes</span>
          <p>{text(visit["clinicalNotes"])}</p>
        </section>
      ) : null}
      <section className="lab-print-finance">
        <div>
          <h3>Payment history</h3>
          {payments.length ? (
            payments.map((payment) => (
              <p key={text(payment["id"])}>
                <span>
                  {date(payment["createdAt"])} | {text(payment["method"]).replaceAll("_", " ")}
                </span>
                <strong>{money(payment["amount"], workspace.tenant.currencyCode)}</strong>
              </p>
            ))
          ) : (
            <p>
              <span>No payment recorded</span>
              <strong>-</strong>
            </p>
          )}
        </div>
        <dl>
          <div>
            <dt>Subtotal</dt>
            <dd>{money(visit["subtotal"], workspace.tenant.currencyCode)}</dd>
          </div>
          <div>
            <dt>Discount</dt>
            <dd>- {money(visit["discount"], workspace.tenant.currencyCode)}</dd>
          </div>
          <div className="lab-print-total">
            <dt>Total</dt>
            <dd>{money(visit["total"], workspace.tenant.currencyCode)}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>{money(visit["amountPaid"], workspace.tenant.currencyCode)}</dd>
          </div>
          <div className={balance > 0 ? "lab-print-balance due" : "lab-print-balance paid"}>
            <dt>Balance</dt>
            <dd>{money(balance, workspace.tenant.currencyCode)}</dd>
          </div>
        </dl>
      </section>
      <section className="lab-print-signatures">
        <div>
          <span>Laboratory officer</span>
          <i />
        </div>
        <div>
          <span>Authorized signature</span>
          <i />
        </div>
      </section>
      <footer>
        {workspace.branding?.invoiceFooter ??
          "Thank you for choosing our pharmacy and laboratory services."}
      </footer>
    </article>
  );
}

export function LabPage({
  branch,
  workspace,
  principal,
  initialVisitStage = "ALL",
}: {
  branch?: Branch | undefined;
  workspace: Workspace;
  principal: TenantPrincipal;
  initialVisitStage?: "ALL" | "SAMPLE" | "RESULTS" | "COMPLETED";
}) {
  const client = useQueryClient();
  const [tab, setTab] = useState<"visits" | "patients" | "catalog">("visits");
  const [patientOpen, setPatientOpen] = useState(false);
  const [patientReturnToVisit, setPatientReturnToVisit] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Row | null>(null);
  const [visitSearch, setVisitSearch] = useState(
    () => new URLSearchParams(window.location.search).get("search") ?? "",
  );
  const [visitStage, setVisitStage] = useState(initialVisitStage);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientForm, setPatientForm] = useState({
    name: "",
    age: "",
    sex: "",
    dateOfBirth: "",
    phone: "",
    address: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    bloodGroup: "",
    allergies: "",
    notes: "",
  });
  const [categoryName, setCategoryName] = useState("");
  const [testForm, setTestForm] = useState({
    categoryId: "",
    code: "",
    name: "",
    description: "",
    price: "",
    sampleType: "",
    resultType: "POSITIVE_NEGATIVE",
    unit: "",
    referenceRange: "",
    resultOptions: "",
    panelComponents: "",
  });
  const [visitForm, setVisitForm] = useState({
    patientId: "",
    testIds: [] as string[],
    discount: "0",
    paymentTiming: "LATER",
    amountPaid: "0",
    paymentMethod: "CASH",
    clinicalNotes: "",
  });
  const [labPayment, setLabPayment] = useState({
    amount: "",
    method: "CASH",
    externalReference: "",
    notes: "",
  });
  const [resultForms, setResultForms] = useState<
    Record<
      string,
      {
        resultStatus: string;
        resultValue: string;
        numericValue: string;
        interpretation: string;
        resultData: Record<string, string>;
        resultNote: string;
      }
    >
  >({});
  const canManage = ["OWNER", "ADMIN"].includes(principal.role);
  const canResult = ["OWNER", "ADMIN", "LAB_TECHNICIAN"].includes(principal.role);
  const canCollectPayment = ["OWNER", "ADMIN", "RECEPTIONIST"].includes(principal.role);
  useEffect(() => setVisitStage(initialVisitStage), [initialVisitStage]);
  const categories = useQuery({
    queryKey: ["lab-categories"],
    queryFn: () => getData<Row[]>("/lab/categories"),
  });
  const patients = useQuery({
    queryKey: ["lab-patients"],
    queryFn: () => getData<Row[]>("/lab/patients"),
  });
  const visits = useQuery({
    queryKey: ["lab-visits", branch?.id],
    queryFn: () => getData<Row[]>(`/lab/visits?branchId=${branch!.id}`),
    enabled: Boolean(branch),
  });
  const activeTests = useMemo<Row[]>(
    () =>
      categories.data?.flatMap((c) =>
        rows(c["tests"])
          .filter((t) => t["active"] !== false)
          .map((t) => ({ ...t, categoryName: c["name"] })),
      ) ?? [],
    [categories.data],
  );
  const refresh = async () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["lab-categories"] }),
      client.invalidateQueries({ queryKey: ["lab-patients"] }),
      client.invalidateQueries({ queryKey: ["lab-visits"] }),
    ]);
  const createPatient = useMutation({
    mutationFn: () =>
      sendData<Row>("post", "/lab/patients", {
        ...patientForm,
        age: Number(patientForm.age),
        sex: patientForm.sex || undefined,
        dateOfBirth: patientForm.dateOfBirth || undefined,
        phone: patientForm.phone || undefined,
        address: patientForm.address || undefined,
        emergencyContactName: patientForm.emergencyContactName || undefined,
        emergencyContactPhone: patientForm.emergencyContactPhone || undefined,
        bloodGroup: patientForm.bloodGroup || undefined,
        allergies: patientForm.allergies || undefined,
        notes: patientForm.notes || undefined,
      }),
    onSuccess: async (p) => {
      setPatientOpen(false);
      setPatientForm({
        name: "",
        age: "",
        sex: "",
        dateOfBirth: "",
        phone: "",
        address: "",
        emergencyContactName: "",
        emergencyContactPhone: "",
        bloodGroup: "",
        allergies: "",
        notes: "",
      });
      setVisitForm({ ...visitForm, patientId: text(p["id"]) });
      if (patientReturnToVisit) {
        setPatientReturnToVisit(false);
        setVisitOpen(true);
      }
      await refresh();
    },
  });
  const createCategory = useMutation({
    mutationFn: () => sendData("post", "/lab/categories", { name: categoryName }),
    onSuccess: async () => {
      setCategoryOpen(false);
      setCategoryName("");
      await refresh();
    },
  });
  const createTest = useMutation({
    mutationFn: () =>
      sendData("post", "/lab/tests", {
        ...testForm,
        code: testForm.code || undefined,
        description: testForm.description || undefined,
        sampleType: testForm.sampleType || undefined,
        unit: testForm.unit || undefined,
        referenceRange: testForm.referenceRange || undefined,
        resultOptions:
          testForm.resultType === "SELECT"
            ? testForm.resultOptions.split(",").map((item) => item.trim()).filter(Boolean)
            : undefined,
        panelComponents:
          testForm.resultType === "PANEL"
            ? testForm.panelComponents
                .split("\n")
                .map((line) => {
                  const [name, unit, referenceRange] = line.split("|").map((item) => item.trim());
                  return { name, unit: unit || undefined, referenceRange: referenceRange || undefined };
                })
                .filter((item) => item.name)
            : undefined,
      }),
    onSuccess: async () => {
      setTestOpen(false);
      setTestForm({
        categoryId: "",
        code: "",
        name: "",
        description: "",
        price: "",
        sampleType: "",
        resultType: "POSITIVE_NEGATIVE",
        unit: "",
        referenceRange: "",
        resultOptions: "",
        panelComponents: "",
      });
      await refresh();
    },
  });
  const createVisit = useMutation({
    mutationFn: () =>
      sendData("post", "/lab/visits", {
        branchId: branch!.id,
        patientId: visitForm.patientId,
        testIds: visitForm.testIds,
        discount: visitForm.discount,
        paymentTiming: visitForm.paymentTiming,
        amountPaid: visitForm.paymentTiming === "NOW" ? selectedTestTotal.toFixed(2) : "0",
        paymentMethod:
          visitForm.paymentTiming === "NOW" && selectedTestTotal > 0
            ? visitForm.paymentMethod
            : undefined,
        clinicalNotes: visitForm.clinicalNotes || undefined,
      }),
    onSuccess: async () => {
      setVisitOpen(false);
      setVisitForm({
        patientId: "",
        testIds: [],
        discount: "0",
        paymentTiming: "LATER",
        amountPaid: "0",
        paymentMethod: "CASH",
        clinicalNotes: "",
      });
      showToast({ title: "Lab visit registered" });
      await refresh();
    },
  });
  const collectLabPayment = useMutation({
    mutationFn: () =>
      sendData<Row>("post", "/lab/visits/" + text(selectedVisit?.["id"]) + "/payments", {
        amount: labPayment.amount,
        method: labPayment.method,
        externalReference: labPayment.externalReference || undefined,
        notes: labPayment.notes || undefined,
        idempotencyKey: idempotency("lab-payment"),
      }),
    onSuccess: async (visit) => {
      setSelectedVisit(visit);
      setLabPayment({ amount: "", method: "CASH", externalReference: "", notes: "" });
      showToast({
        title: "Lab payment recorded",
        message: "Balance-ka bukaanka waa la cusbooneysiiyey.",
      });
      await refresh();
    },
  });
  const markResult = useMutation({
    mutationFn: ({ visitId, testId }: { visitId: string; testId: string }) => {
      const test = rows(selectedVisit?.["tests"]).find((item) => text(item["id"]) === testId);
      const resultType = text(test?.["resultType"] || "POSITIVE_NEGATIVE");
      const form = resultForms[testId] ?? {
        resultStatus: text(test?.["resultStatus"] || "PENDING"),
        resultValue: text(test?.["resultValue"]),
        numericValue: text(test?.["numericValue"]),
        interpretation: text(test?.["interpretation"]),
        resultData: object(test?.["resultData"]) as Record<string, string>,
        resultNote: text(test?.["resultNote"]),
      };
      return sendData(
        "patch",
        "/lab/visits/" + visitId + "/tests/" + testId + "/result",
        {
          resultStatus:
            resultType === "POSITIVE_NEGATIVE" ? form.resultStatus : "COMPLETED",
          resultValue: form.resultValue || undefined,
          numericValue: form.numericValue ? Number(form.numericValue) : undefined,
          interpretation: form.interpretation || undefined,
          resultData:
            resultType === "PANEL" && Object.keys(form.resultData).length
              ? form.resultData
              : undefined,
          resultNote: form.resultNote || undefined,
        },
      );
    },
    onSuccess: async (data) => {
      setSelectedVisit(data as Row);
      await refresh();
    },
  });
  if (!branch) return <EmptyState title="Choose a branch" />;
  const visitTests = rows(selectedVisit?.["tests"]);
  const selectedVisitBalance = Math.max(
    0,
    Number(selectedVisit?.["total"] ?? 0) - Number(selectedVisit?.["amountPaid"] ?? 0),
  );
  const selectedTestSubtotal = activeTests
    .filter((test) => visitForm.testIds.includes(text(test["id"])))
    .reduce((total, test) => total + Number(test["price"] ?? 0), 0);
  const selectedTestDiscount = Math.max(0, Number(visitForm.discount || 0));
  const selectedTestTotal = Math.max(0, selectedTestSubtotal - selectedTestDiscount);
  const visitDiscountValid = selectedTestDiscount <= selectedTestSubtotal;
  const normalizedVisitSearch = visitSearch.trim().toLowerCase();
  const filteredVisits = (visits.data ?? []).filter((visit) => {
    const isCompleted = text(visit["status"]) === "COMPLETED";
    const isCollected = text(visit["sampleStatus"]) === "COLLECTED";
    if (visitStage === "SAMPLE" && (isCompleted || isCollected)) return false;
    if (visitStage === "RESULTS" && (isCompleted || !isCollected)) return false;
    if (visitStage === "COMPLETED" && !isCompleted) return false;
    if (!normalizedVisitSearch) return true;
    const patient = (visit["patient"] ?? {}) as Row;
    return [visit["visitNumber"], visit["status"], patient["name"], patient["phone"]].some(
      (value) => text(value).toLowerCase().includes(normalizedVisitSearch),
    );
  });
  const normalizedPatientSearch = patientSearch.trim().toLowerCase();
  const filteredPatients = (patients.data ?? []).filter(
    (patient) =>
      !normalizedPatientSearch ||
      [patient["name"], patient["phone"]].some((value) =>
        text(value).toLowerCase().includes(normalizedPatientSearch),
      ),
  );
  return (
    <>
      <PageHeader
        eyebrow="Clinical services"
        title="Laboratory"
        description="Register patients, choose priced tests, apply discounts, record results, receive payments, and print a professional report."
        actions={
          <div className="flex gap-2">
            {canManage ? (
              <button className="btn-secondary" onClick={() => setTab("catalog")}>
                Manage test catalog
              </button>
            ) : null}
            {canManage ? (
              <button className="btn-primary" onClick={() => setVisitOpen(true)}>
                <Plus size={16} /> New lab visit
              </button>
            ) : null}
          </div>
        }
      />
      <div className="mb-5 flex gap-2">
        {(["visits", "patients", "catalog"] as const).map((x) => (
          <button
            key={x}
            className={tab === x ? "btn-primary" : "btn-secondary"}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {tab === "visits" ? (
        <Card>
          <div className="border-b border-slate-200 p-4">
            <label className="relative block max-w-xl">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="input pl-10"
                placeholder="Raadi patient, phone, visit number ama status"
                value={visitSearch}
                onChange={(event) => setVisitSearch(event.target.value)}
              />
            </label>
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {(["ALL", "SAMPLE", "RESULTS", "COMPLETED"] as const).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  className={visitStage === stage ? "btn-primary" : "btn-secondary"}
                  onClick={() => setVisitStage(stage)}
                >
                  {stage === "ALL"
                    ? "All orders"
                    : stage === "SAMPLE"
                      ? "Sample collection"
                      : stage === "RESULTS"
                        ? "Results entry"
                        : "Completed"}
                </button>
              ))}
            </div>
          </div>
          {visits.isLoading ? (
            <LoadingState />
          ) : visits.error ? (
            <ErrorState error={visits.error} />
          ) : (
            <SimpleTable
              rows={filteredVisits}
              pageSize={10}
              columns={[
                {
                  label: "Visit",
                  render: (r) => (
                    <div>
                      <strong>{text(r["visitNumber"])}</strong>
                      <p className="text-xs">{date(r["createdAt"])}</p>
                    </div>
                  ),
                },
                { label: "Patient", render: (r) => text((r["patient"] as Row)?.["name"]) },
                { label: "Tests", render: (r) => rows(r["tests"]).length },
                { label: "Total", render: (r) => money(r["total"], workspace.tenant.currencyCode) },
                {
                  label: "Paid",
                  render: (r) => money(r["amountPaid"], workspace.tenant.currencyCode),
                },
                {
                  label: "Balance",
                  render: (r) => (
                    <strong
                      className={
                        Number(r["total"]) - Number(r["amountPaid"]) > 0
                          ? "text-rose-700"
                          : "text-emerald-700"
                      }
                    >
                      {money(
                        Math.max(0, Number(r["total"]) - Number(r["amountPaid"])),
                        workspace.tenant.currencyCode,
                      )}
                    </strong>
                  ),
                },
                { label: "Status", render: (r) => <StatusBadge value={text(r["status"])} /> },
                {
                  label: "Actions",
                  render: (r) => (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setSelectedVisit(r);
                        setLabPayment({
                          amount: String(Math.max(0, Number(r["total"]) - Number(r["amountPaid"]))),
                          method: "CASH",
                          externalReference: "",
                          notes: "",
                        });
                      }}
                    >
                      Open
                    </button>
                  ),
                },
              ]}
            />
          )}
        </Card>
      ) : null}
      {tab === "patients" ? (
        <>
          {canManage ? (
            <div className="mb-4">
              <button className="btn-primary" onClick={() => setPatientOpen(true)}>
                <Plus size={16} /> Register patient
              </button>
            </div>
          ) : null}
          <Card>
            <div className="border-b border-slate-200 p-4">
              <label className="relative block max-w-xl">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  className="input pl-10"
                  placeholder="Raadi patient number, magaca ama telefoonka"
                  value={patientSearch}
                  onChange={(event) => setPatientSearch(event.target.value)}
                />
              </label>
            </div>
            <SimpleTable
              rows={filteredPatients}
              pageSize={10}
              columns={[
                { label: "Patient #", render: (r) => <strong>{text(r["patientNumber"])}</strong> },
                { label: "Patient", render: (r) => <strong>{text(r["name"])}</strong> },
                { label: "Age", render: (r) => text(r["age"]) },
                { label: "Sex", render: (r) => text(r["sex"]) },
                { label: "Phone", render: (r) => text(r["phone"]) },
                { label: "Visits", render: (r) => text((r["_count"] as Row)?.["visits"] ?? 0) },
              ]}
            />
          </Card>
        </>
      ) : null}
      {tab === "catalog" ? (
        <>
          <div className="mb-4 flex gap-2">
            {canManage ? (
              <>
                <button className="btn-primary" onClick={() => setCategoryOpen(true)}>
                  <Plus size={16} /> Category
                </button>
                <button className="btn-secondary" onClick={() => setTestOpen(true)}>
                  <Plus size={16} /> Test and price
                </button>
              </>
            ) : null}
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {(categories.data ?? []).map((c) => (
              <Card key={text(c["id"])} title={text(c["name"])}>
                <div className="p-4">
                  <SimpleTable
                    pageSize={false}
                    rows={rows(c["tests"])}
                    columns={[
                      { label: "Code", render: (r) => text(r["code"]) },
                      { label: "Test", render: (r) => text(r["name"]) },
                      { label: "Result type", render: (r) => text(r["resultType"]) },
                      { label: "Sample", render: (r) => text(r["sampleType"]) || "—" },
                      {
                        label: "Price",
                        render: (r) => money(r["price"], workspace.tenant.currencyCode),
                      },
                      {
                        label: "Status",
                        render: (r) => (
                          <StatusBadge value={r["active"] === false ? "INACTIVE" : "ACTIVE"} />
                        ),
                      },
                    ]}
                  />
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
      <Dialog open={patientOpen} title="Register patient" onClose={() => setPatientOpen(false)}>
        <form
          className="grid gap-4 p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createPatient.mutate();
          }}
        >
          <Field label="Magaca bukaanka (Patient name)">
            <input
              className="input"
              value={patientForm.name}
              onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Da'da (Age)">
            <input
              className="input"
              type="number"
              min="0"
              max="130"
              value={patientForm.age}
              onChange={(e) => setPatientForm({ ...patientForm, age: e.target.value })}
              required
            />
          </Field>
          <Field label="Jinsiga (Sex)">
            <select
              className="input"
              value={patientForm.sex}
              onChange={(e) => setPatientForm({ ...patientForm, sex: e.target.value })}
            >
              <option value="">Select</option>
              <option>MALE</option>
              <option>FEMALE</option>
              <option>OTHER</option>
            </select>
          </Field>
          <Field label="Telefoonka (Phone)">
            <input
              className="input"
              value={patientForm.phone}
              onChange={(e) => setPatientForm({ ...patientForm, phone: e.target.value })}
            />
          </Field>
          <Field label="Date of birth">
            <input
              className="input"
              type="date"
              value={patientForm.dateOfBirth}
              onChange={(e) => setPatientForm({ ...patientForm, dateOfBirth: e.target.value })}
            />
          </Field>
          <Field label="Address">
            <input
              className="input"
              value={patientForm.address}
              onChange={(e) => setPatientForm({ ...patientForm, address: e.target.value })}
            />
          </Field>
          <Field label="Emergency contact name">
            <input
              className="input"
              value={patientForm.emergencyContactName}
              onChange={(e) =>
                setPatientForm({ ...patientForm, emergencyContactName: e.target.value })
              }
            />
          </Field>
          <Field label="Emergency contact phone">
            <input
              className="input"
              value={patientForm.emergencyContactPhone}
              onChange={(e) =>
                setPatientForm({ ...patientForm, emergencyContactPhone: e.target.value })
              }
            />
          </Field>
          <Field label="Blood group">
            <input
              className="input"
              placeholder="e.g. O+"
              value={patientForm.bloodGroup}
              onChange={(e) => setPatientForm({ ...patientForm, bloodGroup: e.target.value })}
            />
          </Field>
          <Field label="Known allergies">
            <textarea
              className="input"
              value={patientForm.allergies}
              onChange={(e) => setPatientForm({ ...patientForm, allergies: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Faahfaahin (Notes)">
              <textarea
                className="input"
                value={patientForm.notes}
                onChange={(e) => setPatientForm({ ...patientForm, notes: e.target.value })}
              />
            </Field>
          </div>
          <button className="btn-primary sm:col-span-2">Save patient</button>
        </form>
      </Dialog>
      <Dialog open={categoryOpen} title="New lab category" onClose={() => setCategoryOpen(false)}>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            createCategory.mutate();
          }}
        >
          <Field label="Qaybta cudurka/baaritaanka (Category)">
            <input
              className="input"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
            />
          </Field>
          <button className="btn-primary">Save category</button>
        </form>
      </Dialog>
      <Dialog open={testOpen} title="New lab test" onClose={() => setTestOpen(false)}>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            createTest.mutate();
          }}
        >
          <Field label="Qaybta (Category)">
            <select
              className="input"
              value={testForm.categoryId}
              onChange={(e) => setTestForm({ ...testForm, categoryId: e.target.value })}
              required
            >
              <option value="">Select</option>
              {(categories.data ?? []).map((c) => (
                <option key={text(c["id"])} value={text(c["id"])}>
                  {text(c["name"])}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Magaca cudurka/baaritaanka (Test name)">
            <input
              className="input"
              value={testForm.name}
              onChange={(e) => setTestForm({ ...testForm, name: e.target.value })}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Test code">
              <input
                className="input"
                placeholder="e.g. CBC"
                value={testForm.code}
                onChange={(e) => setTestForm({ ...testForm, code: e.target.value })}
              />
            </Field>
            <Field label="Result type">
              <select
                className="input"
                value={testForm.resultType}
                onChange={(e) => setTestForm({ ...testForm, resultType: e.target.value })}
              >
                {["POSITIVE_NEGATIVE", "NUMERIC", "TEXT", "SELECT", "PANEL"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Sample type">
              <input
                className="input"
                placeholder="Blood, urine, stool, swab..."
                value={testForm.sampleType}
                onChange={(e) => setTestForm({ ...testForm, sampleType: e.target.value })}
              />
            </Field>
            <Field label="Unit">
              <input
                className="input"
                placeholder="e.g. mg/dL"
                value={testForm.unit}
                onChange={(e) => setTestForm({ ...testForm, unit: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Reference range">
            <input
              className="input"
              value={testForm.referenceRange}
              onChange={(e) => setTestForm({ ...testForm, referenceRange: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="input"
              value={testForm.description}
              onChange={(e) => setTestForm({ ...testForm, description: e.target.value })}
            />
          </Field>
          {testForm.resultType === "SELECT" ? (
            <Field label="Select options" hint="Comma-separated values.">
              <input
                className="input"
                value={testForm.resultOptions}
                onChange={(e) => setTestForm({ ...testForm, resultOptions: e.target.value })}
              />
            </Field>
          ) : null}
          {testForm.resultType === "PANEL" ? (
            <Field
              label="Panel components"
              hint="One component per line: Name | Unit | Reference range"
            >
              <textarea
                className="input"
                placeholder={"WBC | 10^9/L | 4.0-11.0\nHemoglobin | g/dL | 12-17"}
                value={testForm.panelComponents}
                onChange={(e) => setTestForm({ ...testForm, panelComponents: e.target.value })}
              />
            </Field>
          ) : null}
          <Field label="Qiimaha baaritaanka (Price)">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={testForm.price}
              onChange={(e) => setTestForm({ ...testForm, price: e.target.value })}
              required
            />
          </Field>
          <button className="btn-primary">Save test</button>
        </form>
      </Dialog>
      <Dialog wide open={visitOpen} title="Register lab visit" onClose={() => setVisitOpen(false)}>
        <form
          className="grid gap-5 p-5 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            createVisit.mutate();
          }}
        >
          <Field label="Bukaanka (Patient)">
            <select
              className="input"
              value={visitForm.patientId}
              onChange={(e) => setVisitForm({ ...visitForm, patientId: e.target.value })}
              required
            >
              <option value="">Select patient</option>
              {(patients.data ?? []).map((p) => (
                <option key={text(p["id"])} value={text(p["id"])}>
                  {text(p["name"])} - {text(p["phone"])}
                </option>
              ))}
            </select>
          </Field>
          <div>
            <button
              type="button"
              className="btn-secondary mt-6"
              onClick={() => {
                setVisitOpen(false);
                setPatientReturnToVisit(true);
                setPatientOpen(true);
              }}
            >
              Register new patient
            </button>
          </div>
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-bold">Cudurada/baaritaannada (Tests)</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {activeTests.map((t) => (
                <label
                  key={text(t["id"])}
                  className="flex items-center gap-3 rounded-xl border p-3"
                >
                  <input
                    type="checkbox"
                    checked={visitForm.testIds.includes(text(t["id"]))}
                    onChange={(e) =>
                      setVisitForm({
                        ...visitForm,
                        testIds: e.target.checked
                          ? [...visitForm.testIds, text(t["id"])]
                          : visitForm.testIds.filter((id) => id !== text(t["id"])),
                      })
                    }
                  />
                  <span>
                    <strong>{text(t["name"])}</strong>
                    <small className="block text-slate-500">
                      {text(t["categoryName"])} · {money(t["price"], workspace.tenant.currencyCode)}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Field label="Discount-ka baaritaanka (Lab discount)">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              max={selectedTestSubtotal}
              value={visitForm.discount}
              onChange={(e) => setVisitForm({ ...visitForm, discount: e.target.value })}
            />
          </Field>
          <Field label="Goorta lacagta la bixinayo (Payment timing)">
            <select
              className="input"
              value={visitForm.paymentTiming}
              onChange={(e) =>
                setVisitForm({
                  ...visitForm,
                  paymentTiming: e.target.value,
                  amountPaid: e.target.value === "NOW" ? selectedTestTotal.toFixed(2) : "0",
                })
              }
            >
              <option value="NOW">Hadda bixi (Pay now)</option>
              <option value="LATER">
                Marka natiijada la qaadanayo (Pay when collecting result)
              </option>
            </select>
          </Field>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="flex justify-between">
              <span>Subtotal-ka baaritaanka (Subtotal)</span>
              <strong>{money(selectedTestSubtotal, workspace.tenant.currencyCode)}</strong>
            </p>
            <p className="mt-2 flex justify-between text-slate-600">
              <span>Discount</span>
              <strong>- {money(selectedTestDiscount, workspace.tenant.currencyCode)}</strong>
            </p>
            <p className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base">
              <span className="font-bold">Total</span>
              <strong>{money(selectedTestTotal, workspace.tenant.currencyCode)}</strong>
            </p>
            <p className="mt-2 flex justify-between">
              <span>Balance after registration</span>
              <strong
                className={visitForm.paymentTiming === "NOW" ? "text-emerald-700" : "text-rose-700"}
              >
                {money(
                  visitForm.paymentTiming === "NOW" ? 0 : selectedTestTotal,
                  workspace.tenant.currencyCode,
                )}
              </strong>
            </p>
          </div>
          {visitForm.paymentTiming === "NOW" ? (
            <>
              <Field label="Lacagta hadda la bixinayo (Full payment now)">
                <div className="input flex items-center bg-emerald-50 font-bold text-emerald-800">
                  {money(selectedTestTotal, workspace.tenant.currencyCode)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Pay now wuxuu bixinayaa total-ka oo dhan; balance-ku wuxuu noqonayaa eber.
                </p>
              </Field>
              <Field label="Habka lacagta (Payment method)">
                <select
                  className="input"
                  value={visitForm.paymentMethod}
                  onChange={(e) => setVisitForm({ ...visitForm, paymentMethod: e.target.value })}
                >
                  {["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Bukaanka lacagta waxaa lagu leeyahay ilaa natiijada la siinayo.
            </div>
          )}
          <Field label="Qoraalka dhakhtarka (Clinical notes)">
            <textarea
              className="input"
              value={visitForm.clinicalNotes}
              onChange={(e) => setVisitForm({ ...visitForm, clinicalNotes: e.target.value })}
            />
          </Field>
          {createVisit.error ? (
            <p className="text-rose-700 md:col-span-2">{errorMessage(createVisit.error)}</p>
          ) : null}
          <button
            className="btn-primary md:col-span-2"
            disabled={
              createVisit.isPending ||
              !visitForm.patientId ||
              visitForm.testIds.length === 0 ||
              !visitDiscountValid
            }
          >
            {visitForm.paymentTiming === "NOW"
              ? "Register and receive payment"
              : "Register with payment due"}
          </button>
        </form>
      </Dialog>
      <Dialog
        wide
        open={Boolean(selectedVisit)}
        title={`Lab visit ${text(selectedVisit?.["visitNumber"])}`}
        onClose={() => setSelectedVisit(null)}
      >
        <div className="max-h-[75vh] space-y-6 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2 print:hidden">
            <button className="btn-secondary" onClick={() => window.print()}>
              <Printer size={15} /> Print lab report
            </button>
          </div>
          {selectedVisit ? (
            <LabReportPrint visit={selectedVisit} workspace={workspace} branch={branch} />
          ) : null}{" "}
          <Card title="Lacagta baaritaanka (Lab payment)">
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Total</p>
                  <strong>{money(selectedVisit?.["total"], workspace.tenant.currencyCode)}</strong>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs text-emerald-700">Paid</p>
                  <strong>
                    {money(selectedVisit?.["amountPaid"], workspace.tenant.currencyCode)}
                  </strong>
                </div>
                <div
                  className={
                    selectedVisitBalance > 0
                      ? "rounded-xl bg-rose-50 p-3"
                      : "rounded-xl bg-emerald-50 p-3"
                  }
                >
                  <p className="text-xs">Balance</p>
                  <strong>{money(selectedVisitBalance, workspace.tenant.currencyCode)}</strong>
                </div>
              </div>
              {selectedVisitBalance > 0 ? (
                canCollectPayment ? (
                  <form
                    className="grid gap-3 md:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      collectLabPayment.mutate();
                    }}
                  >
                    <Field label="Lacagta la qabanayo (Amount to collect)">
                      <input
                        className="input"
                        type="number"
                        min="0.01"
                        max={selectedVisitBalance}
                        step="0.01"
                        value={labPayment.amount}
                        onChange={(e) => setLabPayment({ ...labPayment, amount: e.target.value })}
                        required
                      />
                    </Field>
                    <Field label="Habka lacagta (Payment method)">
                      <select
                        className="input"
                        value={labPayment.method}
                        onChange={(e) => setLabPayment({ ...labPayment, method: e.target.value })}
                      >
                        {["CASH", "CARD", "MOBILE_MONEY", "BANK_TRANSFER", "OTHER"].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Tixraaca (Reference)">
                      <input
                        className="input"
                        value={labPayment.externalReference}
                        onChange={(e) =>
                          setLabPayment({ ...labPayment, externalReference: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Faahfaahin (Notes)">
                      <input
                        className="input"
                        value={labPayment.notes}
                        onChange={(e) => setLabPayment({ ...labPayment, notes: e.target.value })}
                      />
                    </Field>
                    {collectLabPayment.error ? (
                      <p className="text-rose-700 md:col-span-2">
                        {errorMessage(collectLabPayment.error)}
                      </p>
                    ) : null}
                    <button
                      className="btn-primary md:col-span-2"
                      disabled={collectLabPayment.isPending}
                    >
                      Collect payment before releasing result
                    </button>
                  </form>
                ) : (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    Payment is still due. Ask an Owner, Admin or Manager to collect it.
                  </p>
                )
              ) : (
                <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                  PAID IN FULL — natiijada waa la siin karaa bukaanka.
                </p>
              )}
            </div>
          </Card>
          <Card title="Test results">
            <div className="space-y-3 p-4">
              {visitTests.map((t) => {
                const testId = text(t["id"]);
                const resultType = text(t["resultType"] || "POSITIVE_NEGATIVE");
                const catalog = object(t["labTest"]);
                const panelComponents = rows(catalog["panelComponents"]);
                const resultOptions = rows(catalog["resultOptions"]);
                const f = resultForms[testId] ?? {
                  resultStatus: text(t["resultStatus"] || "PENDING"),
                  resultValue: text(t["resultValue"]),
                  numericValue: text(t["numericValue"]),
                  interpretation: text(t["interpretation"]),
                  resultData: object(t["resultData"]) as Record<string, string>,
                  resultNote: text(t["resultNote"]),
                };
                const update = (patch: Partial<typeof f>) =>
                  setResultForms({ ...resultForms, [testId]: { ...f, ...patch } });
                return (
                  <div
                    key={testId}
                    className={
                      "space-y-3 rounded-xl border p-4 " +
                      (f.resultStatus === "POSITIVE"
                        ? "border-rose-300 bg-rose-50"
                        : "border-slate-200")
                    }
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <strong>{text(t["categoryName"])} / {text(t["testName"])}</strong>
                        <p className="text-xs text-slate-500">
                          {resultType.replaceAll("_", " ")}
                          {t["unit"] ? " - " + text(t["unit"]) : ""}
                          {t["referenceRange"] ? " - Reference: " + text(t["referenceRange"]) : ""}
                        </p>
                      </div>
                      <StatusBadge value={text(t["resultStatus"])} />
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {resultType === "POSITIVE_NEGATIVE" ? (
                        <Field label="Result">
                          <select
                            className="input"
                            disabled={!canResult}
                            value={f.resultStatus}
                            onChange={(event) => update({ resultStatus: event.target.value })}
                          >
                            {["PENDING", "NEGATIVE", "POSITIVE", "INCONCLUSIVE"].map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </Field>
                      ) : null}
                      {resultType === "NUMERIC" ? (
                        <Field label={"Measured value" + (t["unit"] ? " (" + text(t["unit"]) + ")" : "")}>
                          <input
                            className="input"
                            type="number"
                            step="any"
                            disabled={!canResult}
                            value={f.numericValue}
                            onChange={(event) => update({ numericValue: event.target.value })}
                          />
                        </Field>
                      ) : null}
                      {resultType === "TEXT" ? (
                        <Field label="Result text">
                          <textarea
                            className="input"
                            disabled={!canResult}
                            value={f.resultValue}
                            onChange={(event) => update({ resultValue: event.target.value })}
                          />
                        </Field>
                      ) : null}
                      {resultType === "SELECT" ? (
                        <Field label="Result">
                          <select
                            className="input"
                            disabled={!canResult}
                            value={f.resultValue}
                            onChange={(event) => update({ resultValue: event.target.value })}
                          >
                            <option value="">Choose result</option>
                            {resultOptions.map((option) => (
                              <option key={text(option)} value={text(option)}>{text(option)}</option>
                            ))}
                          </select>
                        </Field>
                      ) : null}
                      <Field label="Interpretation">
                        <select
                          className="input"
                          disabled={!canResult}
                          value={f.interpretation}
                          onChange={(event) => update({ interpretation: event.target.value })}
                        >
                          <option value="">Not specified</option>
                          {["NORMAL", "ABNORMAL", "HIGH", "LOW", "POSITIVE", "NEGATIVE", "CRITICAL", "INCONCLUSIVE", "BORDERLINE"].map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Result notes">
                        <input
                          className="input"
                          disabled={!canResult}
                          value={f.resultNote}
                          onChange={(event) => update({ resultNote: event.target.value })}
                        />
                      </Field>
                    </div>

                    {resultType === "PANEL" ? (
                      <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3">
                        {panelComponents.map((component) => {
                          const name = text(component["name"]);
                          return (
                            <Field
                              key={name}
                              label={
                                name +
                                (component["unit"] ? " (" + text(component["unit"]) + ")" : "")
                              }
                              hint={
                                component["referenceRange"]
                                  ? "Reference: " + text(component["referenceRange"])
                                  : "Reference range not configured"
                              }
                            >
                              <input
                                className="input"
                                disabled={!canResult}
                                value={f.resultData[name] ?? ""}
                                onChange={(event) =>
                                  update({
                                    resultData: {
                                      ...f.resultData,
                                      [name]: event.target.value,
                                    },
                                  })
                                }
                              />
                            </Field>
                          );
                        })}
                      </div>
                    ) : null}

                    {canResult ? (
                      <button
                        className="btn-primary"
                        onClick={() =>
                          markResult.mutate({
                            visitId: text(selectedVisit?.["id"]),
                            testId,
                          })
                        }
                      >
                        Save result
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </Dialog>
    </>
  );
}
