import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Building2, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { errorMessage, getData, sendData } from "../api/client";
import {
  Card,
  date,
  Dialog,
  ErrorState,
  Field,
  LoadingState,
  money,
  PageHeader,
  SimpleTable,
  Stat,
  StatusBadge,
  SuccessMessage,
} from "../components/ui";
import { Link } from "../lib/navigation";
import type { PlatformPrincipal } from "../types";

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "-";
const list = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};

export function PlatformOverviewPage() {
  const tenants = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => getData<Row[]>("/platform/tenants"),
  });
  const plans = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => getData<Row[]>("/platform/plans"),
  });
  const support = useQuery({
    queryKey: ["support-requests"],
    queryFn: () => getData<Row[]>("/platform/support-requests"),
  });
  const tenantRows = tenants.data ?? [];
  const currentMonth = new Date().toISOString().slice(0, 7);
  const expectedSubscriptions = tenantRows.reduce(
    (total, row) => total + Number(record(row["subscription"])["monthlyFee"] ?? 0),
    0,
  );
  const collectedSubscriptions = tenantRows.reduce((total, row) => {
    const subscription = record(row["subscription"]);
    return text(subscription["lastPaidAt"]).startsWith(currentMonth)
      ? total + Number(subscription["lastPaymentAmount"] ?? 0)
      : total;
  }, 0);
  return (
    <>
      <PageHeader
        eyebrow="Control plane"
        title="Platform overview"
        description="Tenant lifecycle, plans, limits, support access, and immutable platform evidence."
        actions={
          <Link className="btn-primary" to="/platform/tenants/new">
            <Plus size={17} /> Onboard tenant
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Monthly expected" value={money(expectedSubscriptions)} tone="blue" />
        <Stat label="Collected this month" value={money(collectedSubscriptions)} tone="emerald" />
        <Stat
          label="Outstanding this month"
          value={money(Math.max(0, expectedSubscriptions - collectedSubscriptions))}
          tone="rose"
        />
        <Stat label="Tenants" value={tenantRows.length} />
        <Stat
          label="Active or trial"
          value={
            tenantRows.filter((row) => ["ACTIVE", "TRIAL"].includes(text(row["status"]))).length
          }
          tone="blue"
        />
        <Stat label="Plans" value={(plans.data ?? []).length} tone="amber" />
        <Stat
          label="Pending support"
          value={(support.data ?? []).filter((row) => row["status"] === "PENDING").length}
          tone="rose"
        />
      </div>
      <Card title="Recent tenants" className="mt-6">
        {tenants.isLoading ? (
          <LoadingState />
        ) : tenants.error ? (
          <ErrorState error={tenants.error} />
        ) : (
          <TenantTable rows={tenantRows.slice(0, 10)} />
        )}
      </Card>
    </>
  );
}

function TenantTable({ rows }: { rows: Row[] }) {
  return (
    <SimpleTable
      rows={rows}
      columns={[
        {
          label: "Tenant",
          render: (row) => (
            <Link
              className="font-bold text-emerald-700"
              to={`/platform/tenants/${text(row["id"])}`}
            >
              {text(row["name"])}
            </Link>
          ),
        },
        { label: "Slug", render: (row) => text(row["slug"]) },
        {
          label: "Plan",
          render: (row) =>
            text(row["planCode"] ?? (row["subscription"] as Row | undefined)?.["planCode"]),
        },
        { label: "Branches", render: (row) => list(row["branches"]).length },
        { label: "Users", render: (row) => text(row["activeUsers"] ?? 0) },
        { label: "Status", render: (row) => <StatusBadge value={text(row["status"])} /> },
      ]}
    />
  );
}

export function PlatformTenantsPage({ principal }: { principal: PlatformPrincipal }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const query = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => getData<Row[]>("/platform/tenants"),
  });
  const filtered = (query.data ?? []).filter((tenant) => {
    const matchesSearch = `${text(tenant["name"])} ${text(tenant["slug"])}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesSearch && (status === "ALL" || tenant["status"] === status);
  });
  return (
    <>
      <PageHeader
        eyebrow="Tenants"
        title="Organizations"
        description="Search, inspect, onboard, and control every isolated tenant from the platform control plane."
        actions={
          principal.role === "SUPER_ADMIN" ? (
            <Link className="btn-primary" to="/platform/tenants/new">
              <Plus size={17} /> Onboard tenant
            </Link>
          ) : undefined
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Total tenants" value={(query.data ?? []).length} />
        <Stat
          label="Active or trial"
          value={
            (query.data ?? []).filter((row) => ["ACTIVE", "TRIAL"].includes(text(row["status"])))
              .length
          }
          tone="blue"
        />
        <Stat
          label="Suspended"
          value={(query.data ?? []).filter((row) => row["status"] === "SUSPENDED").length}
          tone="rose"
        />
      </div>
      <Card>
        <div className="action-bar">
          <input
            className="input max-w-md"
            placeholder="Search organization or slug"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input max-w-48"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["ALL", "TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <span className="ml-auto text-sm font-semibold text-slate-500">
            {filtered.length} results
          </span>
        </div>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <TenantTable rows={filtered} />
        )}
      </Card>
    </>
  );
}
export function TenantOnboardingPage() {
  const plans = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => getData<Row[]>("/platform/plans"),
  });
  const [result, setResult] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    slug: "",
    timezone: "Africa/Nairobi",
    currencyCode: "KES",
    planCode: "starter",
    branchName: "Main Branch",
    branchCode: "MAIN",
    ownerFullName: "",
    ownerEmail: "",
    ownerUsername: "owner",
    ownerPassword: "",
    monthlyFee: "0",
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      setResult(await sendData<Row>("post", "/platform/tenants", form));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="Tenant lifecycle"
        title="Onboard a tenant"
        description="Tenant, plan, branding, owner, membership, branch, and audit evidence commit atomically."
      />
      {result ? (
        <SuccessMessage>
          Tenant created successfully. The owner can now sign in using the tenant slug and username.
        </SuccessMessage>
      ) : null}
      <Card className="mt-5">
        <form
          className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3"
          onSubmit={(event) => void submit(event)}
        >
          {(
            [
              ["Organization name", "name"],
              ["Tenant slug", "slug"],
              ["Timezone", "timezone"],
              ["Currency code", "currencyCode"],
              ["Plan code", "planCode"],
              ["Branch name", "branchName"],
              ["Branch code", "branchCode"],
              ["Owner full name", "ownerFullName"],
              ["Owner email", "ownerEmail"],
              ["Owner username", "ownerUsername"],
              ["Owner password", "ownerPassword"],
              ["Agreed monthly fee", "monthlyFee"],
            ] as const
          ).map(([label, key]) => (
            <Field key={key} label={label}>
              {key === "planCode" ? (
                <select
                  className="input"
                  value={form.planCode}
                  onChange={(event) => setForm({ ...form, planCode: event.target.value })}
                  required
                >
                  {(plans.data ?? [])
                    .filter((plan) => plan["active"] !== false)
                    .map((plan) => (
                      <option key={text(plan["code"])} value={text(plan["code"])}>
                        {text(plan["name"])}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  className="input"
                  type={
                    key === "ownerPassword"
                      ? "password"
                      : key === "ownerEmail"
                        ? "email"
                        : key === "monthlyFee"
                          ? "number"
                          : "text"
                  }
                  minLength={key === "ownerPassword" ? 12 : undefined}
                  value={form[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  required
                />
              )}
            </Field>
          ))}
          <div className="md:col-span-2 xl:col-span-3">
            {error ? <p className="mb-3 text-sm text-rose-700">{error}</p> : null}
            <button className="btn-primary">
              <Building2 size={17} /> Create tenant
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}

export function PlatformTenantDetailPage({
  tenantId,
  principal,
}: {
  tenantId: string;
  principal: PlatformPrincipal;
}) {
  const client = useQueryClient();
  const isSuperAdmin = principal.role === "SUPER_ADMIN";
  const [dialog, setDialog] = useState<"edit" | "plan" | "branding" | "renew" | null>(null);
  const [userControl, setUserControl] = useState<Row | null>(null);
  const [userReason, setUserReason] = useState("");
  const [renewForm, setRenewForm] = useState({
    months: "1",
    paymentAmount: "0",
    paymentReference: "",
    note: "",
  });
  const [editForm, setEditForm] = useState({ name: "", timezone: "", currencyCode: "" });
  const [planForm, setPlanForm] = useState({
    planCode: "starter",
    maxBranches: "",
    maxUsers: "",
    maxProducts: "",
    maxMonthlySales: "",
  });
  const [brandForm, setBrandForm] = useState({
    displayName: "",
    logoUrl: "",
    primaryColor: "#174C3F",
    accentColor: "#B8F39A",
    invoiceFooter: "",
    supportContact: "",
  });
  const query = useQuery({
    queryKey: ["platform-tenant", tenantId],
    queryFn: () => getData<Row>(`/platform/tenants/${tenantId}`),
  });
  const plans = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => getData<Row[]>("/platform/plans"),
  });
  const tenantUsers = useQuery({
    queryKey: ["platform-tenant-users", tenantId],
    queryFn: () => getData<Row[]>(`/platform/tenants/${tenantId}/users`),
    enabled: isSuperAdmin,
  });
  const userStatus = useMutation({
    mutationFn: () =>
      sendData(
        "patch",
        `/platform/tenants/${tenantId}/users/${text(userControl?.["membershipId"])}/status`,
        {
          active: userControl?.["status"] !== "ACTIVE",
          reason: userReason,
        },
      ),
    onSuccess: async () => {
      setUserControl(null);
      setUserReason("");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["platform-tenant-users", tenantId] }),
        client.invalidateQueries({ queryKey: ["platform-tenant", tenantId] }),
      ]);
    },
  });
  const status = useMutation({
    mutationFn: (value: string) =>
      sendData("patch", `/platform/tenants/${tenantId}/status`, {
        status: value,
        reason: `Changed through platform control on ${new Date().toISOString()}`,
      }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["platform-tenant", tenantId] }),
  });
  const saveTenant = useMutation({
    mutationFn: () => sendData("patch", `/platform/tenants/${tenantId}`, editForm),
    onSuccess: async () => {
      setDialog(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["platform-tenant", tenantId] }),
        client.invalidateQueries({ queryKey: ["platform-tenants"] }),
      ]);
    },
  });
  const savePlan = useMutation({
    mutationFn: () =>
      sendData("patch", `/platform/tenants/${tenantId}/plan`, {
        planCode: planForm.planCode,
        overrides: Object.fromEntries(
          Object.entries({
            maxBranches: planForm.maxBranches,
            maxUsers: planForm.maxUsers,
            maxProducts: planForm.maxProducts,
            maxMonthlySales: planForm.maxMonthlySales,
          })
            .filter(([, value]) => value !== "")
            .map(([key, value]) => [key, Number(value)]),
        ),
      }),
    onSuccess: async () => {
      setDialog(null);
      await client.invalidateQueries({ queryKey: ["platform-tenant", tenantId] });
    },
  });
  const renewSubscription = useMutation({
    mutationFn: () =>
      sendData("post", `/platform/tenants/${tenantId}/subscription/renew`, {
        months: Number(renewForm.months),
        paymentAmount: Number(renewForm.paymentAmount),
        paymentReference: renewForm.paymentReference || undefined,
        note: renewForm.note || undefined,
      }),
    onSuccess: async () => {
      setDialog(null);
      setRenewForm({ months: "1", paymentAmount: "0", paymentReference: "", note: "" });
      await client.invalidateQueries({ queryKey: ["platform-tenant", tenantId] });
    },
  });
  const saveBranding = useMutation({
    mutationFn: () =>
      sendData("put", `/platform/tenants/${tenantId}/branding`, {
        displayName: brandForm.displayName,
        logoUrl: brandForm.logoUrl || undefined,
        primaryColor: brandForm.primaryColor,
        accentColor: brandForm.accentColor,
        invoiceFooter: brandForm.invoiceFooter || undefined,
        supportContact: brandForm.supportContact || undefined,
      }),
    onSuccess: async () => {
      setDialog(null);
      await client.invalidateQueries({ queryKey: ["platform-tenant", tenantId] });
    },
  });
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  const tenant = query.data!;
  const branding = (tenant["branding"] ?? {}) as Row;
  const subscription = (tenant["subscription"] ?? {}) as Row;
  const usage = record(tenant["usage"]);
  const openEdit = () => {
    setEditForm({
      name: text(tenant["name"]),
      timezone: text(tenant["timezone"]),
      currencyCode: text(tenant["currencyCode"]),
    });
    setDialog("edit");
  };
  const openPlan = () => {
    setPlanForm({
      planCode: text(subscription["planCode"] ?? tenant["planCode"]),
      maxBranches: "",
      maxUsers: "",
      maxProducts: "",
      maxMonthlySales: "",
    });
    setDialog("plan");
  };
  const openBranding = () => {
    setBrandForm({
      displayName: text(branding["displayName"] ?? tenant["name"]),
      logoUrl: branding["logoUrl"] ? text(branding["logoUrl"]) : "",
      primaryColor: text(branding["primaryColor"] ?? "#174C3F"),
      accentColor: text(branding["accentColor"] ?? "#B8F39A"),
      invoiceFooter: branding["invoiceFooter"] ? text(branding["invoiceFooter"]) : "",
      supportContact: branding["supportContact"] ? text(branding["supportContact"]) : "",
    });
    setDialog("branding");
  };
  return (
    <>
      <PageHeader
        eyebrow="Tenant detail"
        title={text(tenant["name"])}
        description={`${text(tenant["slug"])}  |  ${text(tenant["timezone"])}  |  ${text(tenant["currencyCode"])}`}
        actions={
          isSuperAdmin ? (
            <>
              <button className="btn-primary" onClick={() => setDialog("renew")}>
                Renew subscription
              </button>
              <button className="btn-secondary" onClick={openEdit}>
                <Pencil size={15} /> Edit tenant
              </button>
              {tenant["status"] !== "CANCELLED" ? (
                <button
                  className="btn-secondary text-rose-700"
                  onClick={() => {
                    if (window.confirm("Archive this tenant and revoke all active sessions?"))
                      status.mutate("CANCELLED");
                  }}
                >
                  <Archive size={15} /> Archive tenant
                </button>
              ) : null}
              <button className="btn-secondary" onClick={openPlan}>
                Change plan
              </button>
              <button className="btn-secondary" onClick={openBranding}>
                <Pencil size={15} /> Branding
              </button>
              <select
                className="input"
                value={text(tenant["status"])}
                onChange={(event) => status.mutate(event.target.value)}
              >
                {["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </>
          ) : (
            <StatusBadge value="READ ONLY" />
          )
        }
      />
      {status.error ? (
        <div className="mb-5">
          <ErrorState error={status.error} />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Subscription"
          value={subscription["endsAt"] ? date(subscription["endsAt"]) : "No expiry"}
          detail={
            subscription["endsAt"] && new Date(text(subscription["endsAt"])) <= new Date()
              ? "Expired — tenant login is locked"
              : "Next renewal date"
          }
          tone={
            subscription["endsAt"] && new Date(text(subscription["endsAt"])) <= new Date()
              ? "rose"
              : "emerald"
          }
        />
        {(
          [
            ["Branches", "branches", "blue"],
            ["Active users", "users", "amber"],
            ["Products", "products", "emerald"],
            ["Monthly sales", "monthlySales", "rose"],
          ] as const
        ).map(([label, key, tone]) => {
          const item = record(usage[key]);
          return (
            <Stat
              key={key}
              label={label}
              value={`${text(item["used"] ?? 0)} / ${text(item["limit"] ?? 0)}`}
              detail="Used against effective plan limit"
              tone={tone}
            />
          );
        })}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <Card title="Branches">
          <SimpleTable
            rows={list(tenant["branches"])}
            columns={[
              { label: "Name", render: (row) => text(row["name"]) },
              { label: "Code", render: (row) => text(row["code"]) },
              { label: "Timezone", render: (row) => text(row["timezone"]) },
              {
                label: "Status",
                render: (row) => (
                  <StatusBadge value={row["active"] === false ? "INACTIVE" : "ACTIVE"} />
                ),
              },
            ]}
          />
        </Card>
        <Card title="Brand identity">
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm">
            <dt className="text-slate-500">Display name</dt>
            <dd className="font-bold">{text(branding["displayName"] ?? tenant["name"])}</dd>
            <dt className="text-slate-500">Primary</dt>
            <dd>
              <span
                className="inline-block size-5 rounded-full align-middle"
                style={{ background: text(branding["primaryColor"] ?? "#174C3F") }}
              />{" "}
              {text(branding["primaryColor"] ?? "#174C3F")}
            </dd>
            <dt className="text-slate-500">Accent</dt>
            <dd>
              <span
                className="inline-block size-5 rounded-full align-middle"
                style={{ background: text(branding["accentColor"] ?? "#B8F39A") }}
              />{" "}
              {text(branding["accentColor"] ?? "#B8F39A")}
            </dd>
            <dt className="text-slate-500">Support</dt>
            <dd>{text(branding["supportContact"])}</dd>
          </dl>
        </Card>
      </div>
      {isSuperAdmin ? (
        <>
          <Card
            title="Tenant users and access"
            description="Super Admin can suspend or restore a tenant membership. Disabling access revokes every active tenant session."
            className="mt-6"
          >
            {tenantUsers.isLoading ? (
              <LoadingState />
            ) : tenantUsers.error ? (
              <ErrorState error={tenantUsers.error} />
            ) : (
              <SimpleTable
                rows={tenantUsers.data ?? []}
                columns={[
                  {
                    label: "User",
                    render: (row) => (
                      <div>
                        <p className="font-bold text-slate-950">{text(row["fullName"])}</p>
                        <p className="text-xs text-slate-500">
                          {text(row["username"])} / {text(row["email"])}
                        </p>
                      </div>
                    ),
                  },
                  { label: "Role", render: (row) => <StatusBadge value={text(row["role"])} /> },
                  { label: "Status", render: (row) => <StatusBadge value={text(row["status"])} /> },
                  {
                    label: "Branches",
                    render: (row) =>
                      row["allBranches"]
                        ? "All branches"
                        : list(row["branches"])
                            .map((branch) => text(branch["name"]))
                            .join(", ") || "None",
                  },
                  { label: "Sessions", render: (row) => text(row["activeSessions"] ?? 0) },
                  { label: "Last active", render: (row) => date(row["lastSeenAt"]) },
                  {
                    label: "Action",
                    render: (row) => (
                      <button className="btn-secondary" onClick={() => setUserControl(row)}>
                        {row["status"] === "ACTIVE" ? "Disable" : "Enable"}
                      </button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
          <Dialog
            open={Boolean(userControl)}
            title={
              userControl?.["status"] === "ACTIVE" ? "Disable tenant user" : "Enable tenant user"
            }
            description="This action is recorded in the immutable platform audit log."
            onClose={() => setUserControl(null)}
          >
            <form
              className="space-y-4 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                userStatus.mutate();
              }}
            >
              <p className="text-sm text-slate-600">
                Account: <strong>{text(userControl?.["fullName"])}</strong> /{" "}
                {text(userControl?.["role"])}
              </p>
              <Field label="Audit reason (Sababta)">
                <textarea
                  className="input min-h-24"
                  value={userReason}
                  onChange={(event) => setUserReason(event.target.value)}
                  required
                />
              </Field>
              {userStatus.error ? (
                <p className="text-sm text-rose-700">{errorMessage(userStatus.error)}</p>
              ) : null}
              <button className="btn-primary" disabled={userStatus.isPending}>
                Confirm access change
              </button>
            </form>
          </Dialog>{" "}
        </>
      ) : null}
      <Dialog
        open={dialog === "edit"}
        title="Edit tenant"
        description="Update the organization identity. Every change is written to the platform audit log."
        onClose={() => setDialog(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            saveTenant.mutate();
          }}
        >
          <Field label="Organization name">
            <input
              className="input"
              value={editForm.name}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              required
            />
          </Field>
          <Field label="Timezone">
            <input
              className="input"
              value={editForm.timezone}
              onChange={(event) => setEditForm({ ...editForm, timezone: event.target.value })}
              required
            />
          </Field>
          <Field label="Currency code">
            <input
              className="input"
              maxLength={3}
              value={editForm.currencyCode}
              onChange={(event) =>
                setEditForm({ ...editForm, currencyCode: event.target.value.toUpperCase() })
              }
              required
            />
          </Field>
          {saveTenant.error ? (
            <p className="text-sm text-rose-700">{errorMessage(saveTenant.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={saveTenant.isPending}>
            Save tenant
          </button>
        </form>
      </Dialog>{" "}
      <Dialog
        open={dialog === "renew"}
        title="Renew monthly subscription"
        description="Extends access from the current expiry date, or from today if it already expired."
        onClose={() => setDialog(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            renewSubscription.mutate();
          }}
        >
          <Field label="Months (Bilaha)">
            <input
              className="input"
              type="number"
              min="1"
              max="36"
              value={renewForm.months}
              onChange={(event) => setRenewForm({ ...renewForm, months: event.target.value })}
              required
            />
          </Field>
          <Field label="Payment received (Lacagta la helay)">
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={renewForm.paymentAmount}
              onChange={(event) =>
                setRenewForm({ ...renewForm, paymentAmount: event.target.value })
              }
              required
            />
          </Field>{" "}
          <Field label="Payment reference (Tixraaca lacagta)">
            <input
              className="input"
              value={renewForm.paymentReference}
              onChange={(event) =>
                setRenewForm({ ...renewForm, paymentReference: event.target.value })
              }
            />
          </Field>
          <Field label="Note (Faahfaahin)">
            <textarea
              className="input min-h-24"
              value={renewForm.note}
              onChange={(event) => setRenewForm({ ...renewForm, note: event.target.value })}
            />
          </Field>
          {renewSubscription.error ? (
            <p className="text-sm text-rose-700">{errorMessage(renewSubscription.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={renewSubscription.isPending}>
            Confirm renewal
          </button>
        </form>
      </Dialog>
      <Dialog
        open={dialog === "plan"}
        title="Change tenant plan"
        description="Plan limits are enforced at the database boundary."
        onClose={() => setDialog(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            savePlan.mutate();
          }}
        >
          <Field label="Plan">
            <select
              className="input"
              value={planForm.planCode}
              onChange={(e) => setPlanForm({ ...planForm, planCode: e.target.value })}
            >
              {(plans.data ?? [])
                .filter((plan) => plan["active"] !== false)
                .map((plan) => (
                  <option key={text(plan["code"])} value={text(plan["code"])}>
                    {text(plan["name"])}
                  </option>
                ))}
            </select>
          </Field>
          <p className="text-sm font-bold text-slate-800">Optional tenant-specific overrides</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["Max branches", "maxBranches"],
                ["Max users", "maxUsers"],
                ["Max products", "maxProducts"],
                ["Monthly sales", "maxMonthlySales"],
              ] as const
            ).map(([label, key]) => (
              <Field key={key} label={label}>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={planForm[key]}
                  onChange={(e) => setPlanForm({ ...planForm, [key]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          {savePlan.error ? (
            <p className="text-sm text-rose-700">{errorMessage(savePlan.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={savePlan.isPending}>
            Apply plan
          </button>
        </form>
      </Dialog>
      <Dialog
        open={dialog === "branding"}
        title="Tenant branding"
        onClose={() => setDialog(null)}
        wide
      >
        <form
          className="grid gap-4 p-5 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveBranding.mutate();
          }}
        >
          <Field label="Display name">
            <input
              className="input"
              value={brandForm.displayName}
              onChange={(e) => setBrandForm({ ...brandForm, displayName: e.target.value })}
              required
            />
          </Field>
          <Field label="Logo URL">
            <input
              className="input"
              type="url"
              value={brandForm.logoUrl}
              onChange={(e) => setBrandForm({ ...brandForm, logoUrl: e.target.value })}
            />
          </Field>
          <Field label="Primary color">
            <input
              className="input h-11"
              type="color"
              value={brandForm.primaryColor}
              onChange={(e) => setBrandForm({ ...brandForm, primaryColor: e.target.value })}
            />
          </Field>
          <Field label="Accent color">
            <input
              className="input h-11"
              type="color"
              value={brandForm.accentColor}
              onChange={(e) => setBrandForm({ ...brandForm, accentColor: e.target.value })}
            />
          </Field>
          <Field label="Support contact">
            <input
              className="input"
              value={brandForm.supportContact}
              onChange={(e) => setBrandForm({ ...brandForm, supportContact: e.target.value })}
            />
          </Field>
          <Field label="Invoice footer">
            <textarea
              className="input min-h-20"
              value={brandForm.invoiceFooter}
              onChange={(e) => setBrandForm({ ...brandForm, invoiceFooter: e.target.value })}
            />
          </Field>
          {saveBranding.error ? (
            <p className="text-sm text-rose-700 md:col-span-2">
              {errorMessage(saveBranding.error)}
            </p>
          ) : null}
          <button className="btn-primary md:col-span-2" disabled={saveBranding.isPending}>
            Save branding
          </button>
        </form>
      </Dialog>
    </>
  );
}
export function PlatformPlansPage({ principal }: { principal: PlatformPrincipal }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    maxBranches: "1",
    maxUsers: "5",
    maxProducts: "1000",
    maxMonthlySales: "10000",
    active: true,
  });
  const query = useQuery({
    queryKey: ["platform-plans"],
    queryFn: () => getData<Row[]>("/platform/plans"),
  });
  const save = useMutation({
    mutationFn: () =>
      sendData("put", `/platform/plans/${form.code}`, {
        name: form.name,
        description: form.description || undefined,
        active: form.active,
        limits: {
          maxBranches: Number(form.maxBranches),
          maxUsers: Number(form.maxUsers),
          maxProducts: Number(form.maxProducts),
          maxMonthlySales: Number(form.maxMonthlySales),
        },
      }),
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      await client.invalidateQueries({ queryKey: ["platform-plans"] });
    },
  });
  const begin = (plan?: Row) => {
    const limits = (plan?.["limits"] ?? {}) as Row;
    setEditing(plan ?? null);
    setForm({
      code: plan ? text(plan["code"]) : "",
      name: plan ? text(plan["name"]) : "",
      description: plan?.["description"] ? text(plan["description"]) : "",
      maxBranches: text(limits["maxBranches"] ?? 1),
      maxUsers: text(limits["maxUsers"] ?? 5),
      maxProducts: text(limits["maxProducts"] ?? 1000),
      maxMonthlySales: text(limits["maxMonthlySales"] ?? 10000),
      active: plan?.["active"] !== false,
    });
    setOpen(true);
  };
  const canManage = principal.role === "SUPER_ADMIN";
  return (
    <>
      <PageHeader
        eyebrow="Subscriptions"
        title="Plans and database limits"
        description="Create plans, change capacity limits, and deactivate retired offers without breaking existing tenant history."
        actions={
          canManage ? (
            <button className="btn-primary" onClick={() => begin()}>
              <Plus size={17} /> New plan
            </button>
          ) : undefined
        }
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          {(query.data ?? []).map((plan) => (
            <Card
              key={text(plan["code"])}
              title={text(plan["name"])}
              description={text(plan["description"])}
            >
              <div className="space-y-3 p-5">
                {Object.entries((plan["limits"] ?? {}) as Row).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-slate-500">{key}</span>
                    <strong>{text(value)}</strong>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <StatusBadge value={plan["active"] === false ? "INACTIVE" : "ACTIVE"} />
                  {canManage ? (
                    <button className="btn-secondary" onClick={() => begin(plan)}>
                      <Pencil size={15} /> Edit
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {!canManage ? (
        <p className="mt-5 text-sm text-slate-500">
          Only a super administrator can change plan limits.
        </p>
      ) : null}
      <Dialog
        open={open}
        title={editing ? "Edit plan" : "Create plan"}
        description="Limits are enforced by PostgreSQL controls for every tenant."
        onClose={() => setOpen(false)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Plan code" hint="Lowercase letters, numbers, and underscores.">
            <input
              className="input"
              pattern="[a-z0-9_]+"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase() })}
              disabled={Boolean(editing)}
              required
            />
          </Field>
          <Field label="Plan name">
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Description">
            <textarea
              className="input min-h-20"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["Max branches", "maxBranches"],
                ["Max users", "maxUsers"],
                ["Max products", "maxProducts"],
                ["Monthly sales", "maxMonthlySales"],
              ] as const
            ).map(([label, key]) => (
              <Field key={key} label={label}>
                <input
                  className="input"
                  type="number"
                  min="1"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  required
                />
              </Field>
            ))}
          </div>
          <Field label="Status">
            <select
              className="input"
              value={form.active ? "ACTIVE" : "INACTIVE"}
              onChange={(e) => setForm({ ...form, active: e.target.value === "ACTIVE" })}
            >
              <option>ACTIVE</option>
              <option>INACTIVE</option>
            </select>
          </Field>
          {save.error ? <p className="text-sm text-rose-700">{errorMessage(save.error)}</p> : null}
          <button className="btn-primary" disabled={save.isPending}>
            Save plan
          </button>
        </form>
      </Dialog>
    </>
  );
}
export function PlatformSupportPage({ principal }: { principal: PlatformPrincipal }) {
  const client = useQueryClient();
  const [requestOpen, setRequestOpen] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [form, setForm] = useState({ tenantId: "", reason: "" });
  const [revokeReason, setRevokeReason] = useState("");
  const query = useQuery({
    queryKey: ["support-requests"],
    queryFn: () => getData<Row[]>("/platform/support-requests"),
  });
  const tenants = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => getData<Row[]>("/platform/tenants"),
  });
  const create = useMutation({
    mutationFn: () => sendData("post", "/platform/support-requests", form),
    onSuccess: async () => {
      setRequestOpen(false);
      setForm({ tenantId: "", reason: "" });
      await client.invalidateQueries({ queryKey: ["support-requests"] });
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      sendData("post", `/platform/support-requests/${id}/decision`, {
        approve,
        reason: approve ? "Approved through platform control" : "Rejected through platform control",
        durationMinutes: 60,
      }),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["support-requests"] }),
  });
  const activate = useMutation({
    mutationFn: (id: string) => sendData("post", `/platform/support-requests/${id}/activate`),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["support-requests"] }),
  });
  const revoke = useMutation({
    mutationFn: () =>
      sendData("post", `/platform/support-requests/${revokeId}/revoke`, { reason: revokeReason }),
    onSuccess: async () => {
      setRevokeId(null);
      setRevokeReason("");
      await client.invalidateQueries({ queryKey: ["support-requests"] });
    },
  });
  const canRequest = ["SUPER_ADMIN", "SUPPORT"].includes(principal.role);
  return (
    <>
      <PageHeader
        eyebrow="Controlled access"
        title="Support sessions"
        description="Every support session requires a tenant target, business reason, independent approval, short expiry, read-only access, and revocation evidence."
        actions={
          canRequest ? (
            <button className="btn-primary" onClick={() => setRequestOpen(true)}>
              <Plus size={17} /> Request access
            </button>
          ) : undefined
        }
      />
      {activate.isSuccess ? (
        <div className="mb-5">
          <SuccessMessage>
            Support session activated. Open the pharmacy workspace to use read-only tenant access.
          </SuccessMessage>
        </div>
      ) : null}
      {decide.error || activate.error ? (
        <div className="mb-5">
          <ErrorState error={decide.error ?? activate.error} />
        </div>
      ) : null}
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
                label: "Tenant",
                render: (row) =>
                  text(
                    (tenants.data ?? []).find((tenant) => tenant["id"] === row["targetTenantId"])?.[
                      "name"
                    ] ?? row["targetTenantId"],
                  ),
              },
              { label: "Reason", render: (row) => text(row["reason"]) },
              { label: "Requester", render: (row) => text(row["requestedByUserId"]) },
              { label: "Created", render: (row) => date(row["createdAt"]) },
              { label: "Expires", render: (row) => date(row["expiresAt"]) },
              { label: "Status", render: (row) => <StatusBadge value={text(row["status"])} /> },
              {
                label: "Actions",
                render: (row) => (
                  <div className="flex flex-wrap gap-2">
                    {principal.role === "SUPER_ADMIN" &&
                    row["status"] === "PENDING" &&
                    row["requestedByUserId"] !== principal.userId ? (
                      <>
                        <button
                          className="btn-secondary"
                          onClick={() => decide.mutate({ id: text(row["id"]), approve: true })}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => decide.mutate({ id: text(row["id"]), approve: false })}
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                    {row["requestedByUserId"] === principal.userId &&
                    row["status"] === "APPROVED" ? (
                      <button
                        className="btn-primary"
                        onClick={() => activate.mutate(text(row["id"]))}
                      >
                        <ShieldCheck size={15} /> Activate
                      </button>
                    ) : null}
                    {["PENDING", "APPROVED"].includes(text(row["status"])) &&
                    (principal.role === "SUPER_ADMIN" ||
                      row["requestedByUserId"] === principal.userId) ? (
                      <button className="btn-danger" onClick={() => setRevokeId(text(row["id"]))}>
                        Revoke
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
        open={requestOpen}
        title="Request tenant support access"
        description="Use a specific operational reason; credentials and broad access are never requested."
        onClose={() => setRequestOpen(false)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Tenant">
            <select
              className="input"
              value={form.tenantId}
              onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
              required
            >
              <option value="">Select tenant</option>
              {(tenants.data ?? [])
                .filter((tenant) => ["TRIAL", "ACTIVE"].includes(text(tenant["status"])))
                .map((tenant) => (
                  <option key={text(tenant["id"])} value={text(tenant["id"])}>
                    {text(tenant["name"])} | {text(tenant["slug"])}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Business reason">
            <textarea
              className="input min-h-28"
              minLength={10}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
            />
          </Field>
          {create.error ? (
            <p className="text-sm text-rose-700">{errorMessage(create.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={create.isPending}>
            Submit request
          </button>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(revokeId)}
        title="Revoke support access"
        description="Any active support session will end immediately."
        onClose={() => setRevokeId(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            revoke.mutate();
          }}
        >
          <Field label="Reason">
            <textarea
              className="input min-h-24"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              required
            />
          </Field>
          {revoke.error ? (
            <p className="text-sm text-rose-700">{errorMessage(revoke.error)}</p>
          ) : null}
          <button className="btn-danger" disabled={revoke.isPending}>
            Confirm revocation
          </button>
        </form>
      </Dialog>
    </>
  );
}
export function PlatformAuditPage() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("ALL");
  const query = useQuery({
    queryKey: ["platform-audit"],
    queryFn: () => getData<Row[]>("/platform/audit?take=250"),
  });
  const auditRows = query.data ?? [];
  const actions = [...new Set(auditRows.map((row) => text(row["action"])))].sort();
  const filtered = auditRows.filter((row) => {
    const haystack =
      `${text(row["action"])} ${text(row["entityType"])} ${text(row["entityId"])} ${text(row["targetTenantId"])} ${text(row["actorUserId"])}`.toLowerCase();
    return (
      haystack.includes(search.toLowerCase()) && (action === "ALL" || row["action"] === action)
    );
  });
  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Platform audit"
        description="Append-only platform lifecycle and support-access evidence."
      />{" "}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Audit events" value={auditRows.length} />
        <Stat label="Action types" value={actions.length} tone="blue" />
        <Stat
          label="Tenant-scoped events"
          value={auditRows.filter((row) => Boolean(row["targetTenantId"])).length}
          tone="amber"
        />
      </div>
      <Card>
        <div className="action-bar">
          <input
            className="input max-w-md"
            placeholder="Search action, entity, tenant, or actor"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="input max-w-64"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            <option value="ALL">All actions</option>
            {actions.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <span className="ml-auto text-sm font-semibold text-slate-500">
            {filtered.length} results
          </span>
        </div>
        {query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : (
          <SimpleTable
            rows={filtered}
            columns={[
              { label: "Time", render: (row) => date(row["createdAt"]) },
              { label: "Action", render: (row) => <strong>{text(row["action"])}</strong> },
              {
                label: "Entity",
                render: (row) => `${text(row["entityType"])}  |  ${text(row["entityId"])}`,
              },
              { label: "Tenant", render: (row) => text(row["targetTenantId"]) },
              { label: "Actor", render: (row) => text(row["actorUserId"]) },
            ]}
          />
        )}
      </Card>
    </>
  );
}
