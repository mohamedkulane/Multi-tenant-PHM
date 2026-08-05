import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Send, ShieldCheck, UserCog } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { errorMessage, getData, sendData } from "../api/client";
import {
  Card,
  date,
  Dialog,
  ErrorState,
  Field,
  LoadingState,
  PageHeader,
  SimpleTable,
  Stat,
  StatusBadge,
  SuccessMessage,
} from "../components/ui";
import { brandChartPalette } from "../lib/chart-colors";
import { Link } from "../lib/navigation";
import type { PlatformPrincipal } from "../types";

type Row = Record<string, unknown>;
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "-";
const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
const record = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};

export function PlatformOverviewPage({ principal }: { principal: PlatformPrincipal }) {
  const query = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => getData<Row>("/platform/overview"),
    refetchInterval: 60_000,
  });
  const settings = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => getData<Row>("/platform/settings"),
  });
  if (query.isLoading) return <LoadingState label="Loading platform intelligence" />;
  if (query.error) return <ErrorState error={query.error} />;
  const data = query.data ?? {};
  const cards = record(data["cards"]);
  const charts = record(data["charts"]);
  const profile = record(settings.data?.["platform_profile"]);
  const chartColors = brandChartPalette(
    text(profile["primaryColor"] ?? "#0D2926"),
    text(profile["accentColor"] ?? "#B8F39A"),
  );
  const alerts = rows(data["alerts"]);
  const tenantStatuses = rows(charts["tenantStatuses"]);
  const tenantStatusTotal = tenantStatuses.reduce(
    (total, status) => total + Number(status["value"] ?? 0),
    0,
  );
  const audit = rows(data["recentAudit"]);
  return (
    <>
      <PageHeader
        eyebrow="Control plane"
        title="Platform overview"
        description="Live tenant health, adoption, capacity, security sessions, and actions requiring attention."
        actions={
          principal.role === "SUPER_ADMIN" ? (
            <Link className="btn-primary" to="/platform/tenants/new">
              <Plus size={17} /> Onboard tenant
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Active tenants"
          value={text(cards["activeTenants"] ?? 0)}
          detail={`${text(cards["totalTenants"] ?? 0)} total organizations`}
        />
        <Stat
          label="Tenant users"
          value={text(cards["activeTenantUsers"] ?? 0)}
          detail={`${text(cards["activeBranches"] ?? 0)} active branches`}
          tone="blue"
        />
        <Stat
          label="Sales / 30 days"
          value={text(cards["salesLast30Days"] ?? 0)}
          detail={`${text(cards["activeProducts"] ?? 0)} active products`}
          tone="amber"
        />
        <Stat
          label="Pending support"
          value={text(cards["pendingSupport"] ?? 0)}
          detail={`${text(cards["activePlatformSessions"] ?? 0)} platform sessions`}
          tone="rose"
        />
      </div>
      {alerts.length ? (
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {alerts.map((alert, index) => (
            <div
              key={`${text(alert["title"])}-${index}`}
              className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
            >
              <p className="font-bold text-amber-950">{text(alert["title"])}</p>
              <p className="mt-1 text-sm text-amber-800">{text(alert["message"])}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card
          title="Tenant growth"
          description="New organizations onboarded during the last six months."
        >
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rows(charts["tenantGrowth"])}>
                <defs>
                  <linearGradient id="platformGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors[0]} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={chartColors[1]} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chartColors[0]}
                  strokeWidth={3}
                  fill="url(#platformGrowth)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card
          title="Tenant lifecycle"
          description="All organizations grouped by operating status, including zero-count statuses."
        >
          <div className="p-4">
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={tenantStatuses.filter((status) => Number(status["value"] ?? 0) > 0)}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={92}
                    paddingAngle={4}
                    isAnimationActive
                    animationDuration={900}
                  >
                    {tenantStatuses
                      .filter((status) => Number(status["value"] ?? 0) > 0)
                      .map((row, index) => (
                        <Cell
                          key={text(row["label"])}
                          fill={chartColors[index % chartColors.length] ?? chartColors[0]}
                        />
                      ))}
                  </Pie>
                  <Tooltip formatter={(value) => [Number(value), "Tenants"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tenantStatuses.map((status, index) => {
                const value = Number(status["value"] ?? 0);
                const percentage = tenantStatusTotal
                  ? Math.round((value / tenantStatusTotal) * 100)
                  : 0;
                return (
                  <div
                    key={text(status["label"])}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <span
                        className="size-2.5 rounded-full"
                        style={{
                          backgroundColor:
                            chartColors[index % chartColors.length] ?? chartColors[0],
                        }}
                      />
                      {text(status["label"])}
                    </div>
                    <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
                    <p className="text-xs text-slate-500">{percentage}% of all tenants</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      </div>
      <Card title="Recent security and administration activity" className="mt-6">
        <SimpleTable
          rows={audit}
          columns={[
            { label: "Time", render: (row) => date(row["createdAt"]) },
            { label: "Action", render: (row) => text(row["action"]).replaceAll("_", " ") },
            { label: "Entity", render: (row) => text(row["entityType"]) },
            { label: "Tenant", render: (row) => text(row["targetTenantId"]) },
          ]}
        />
      </Card>
    </>
  );
}

export function PlatformAdministratorsPage() {
  const client = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [success, setSuccess] = useState("");
  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    role: "ADMIN",
    password: "",
  });
  const [editForm, setEditForm] = useState({
    fullName: "",
    role: "ADMIN",
    active: true,
    password: "",
    reason: "",
  });
  const query = useQuery({
    queryKey: ["platform-users"],
    queryFn: () => getData<Row[]>("/platform/users"),
  });
  const create = useMutation({
    mutationFn: () => sendData("post", "/platform/users", createForm),
    onSuccess: async () => {
      setCreateOpen(false);
      setCreateForm({ fullName: "", email: "", role: "ADMIN", password: "" });
      setSuccess("Platform administrator created successfully.");
      await client.invalidateQueries({ queryKey: ["platform-users"] });
    },
  });
  const update = useMutation({
    mutationFn: () =>
      sendData("patch", `/platform/users/${text(editing?.["userId"])}`, {
        ...editForm,
        password: editForm.password || undefined,
      }),
    onSuccess: async () => {
      setEditing(null);
      setSuccess("Administrator security settings updated.");
      await client.invalidateQueries({ queryKey: ["platform-users"] });
    },
  });
  const revoke = useMutation({
    mutationFn: () =>
      sendData("post", `/platform/users/${text(editing?.["userId"])}/revoke-sessions`, {
        reason: editForm.reason,
      }),
    onSuccess: async () => {
      setEditing(null);
      setSuccess("All active sessions for this administrator were revoked.");
      await client.invalidateQueries({ queryKey: ["platform-users"] });
    },
  });
  const openEdit = (user: Row) => {
    setEditing(user);
    setEditForm({
      fullName: text(user["fullName"]),
      role: text(user["role"]),
      active: user["active"] !== false,
      password: "",
      reason: "",
    });
  };
  return (
    <>
      <PageHeader
        eyebrow="Identity and access"
        title="Platform administrators"
        description="Create administrators, assign platform roles, disable access, rotate credentials, and revoke sessions."
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus size={17} /> Add administrator
          </button>
        }
      />
      {success ? <SuccessMessage>{success}</SuccessMessage> : null}
      <div className="mb-6 mt-5 grid gap-4 sm:grid-cols-3">
        <Stat label="Accounts" value={(query.data ?? []).length} />
        <Stat
          label="Enabled"
          value={(query.data ?? []).filter((user) => user["active"] !== false).length}
          tone="blue"
        />
        <Stat
          label="Active sessions"
          value={(query.data ?? []).reduce(
            (total, user) => total + Number(user["activeSessions"] ?? 0),
            0,
          )}
          tone="amber"
        />
      </div>
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
                label: "Administrator",
                render: (row) => (
                  <div>
                    <p className="font-bold text-slate-950">{text(row["fullName"])}</p>
                    <p className="text-xs text-slate-500">{text(row["email"])}</p>
                  </div>
                ),
              },
              { label: "Role", render: (row) => <StatusBadge value={text(row["role"])} /> },
              {
                label: "Access",
                render: (row) => (
                  <StatusBadge value={row["active"] === false ? "DISABLED" : "ACTIVE"} />
                ),
              },
              { label: "Sessions", render: (row) => text(row["activeSessions"] ?? 0) },
              { label: "Last active", render: (row) => date(row["lastSeenAt"]) },
              {
                label: "Actions",
                render: (row) => (
                  <button className="btn-secondary" onClick={() => openEdit(row)}>
                    <UserCog size={15} /> Manage
                  </button>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Dialog
        open={createOpen}
        title="Create platform administrator"
        description="Use a unique email and a password of at least 16 characters."
        onClose={() => setCreateOpen(false)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Full name (Magaca oo buuxa)">
            <input
              className="input"
              value={createForm.fullName}
              onChange={(event) => setCreateForm({ ...createForm, fullName: event.target.value })}
              required
            />
          </Field>
          <Field label="Platform email (Email-ka platform-ka)">
            <input
              className="input"
              type="email"
              value={createForm.email}
              onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              required
            />
          </Field>
          <Field label="Role (Doorka)">
            <select
              className="input"
              value={createForm.role}
              onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}
            >
              <option value="ADMIN">Platform Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </Field>
          <Field label="Temporary password (Furaha ku-meelgaarka ah)">
            <input
              className="input"
              type="password"
              minLength={16}
              value={createForm.password}
              onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
              required
            />
          </Field>
          {create.error ? (
            <p className="text-sm text-rose-700">{errorMessage(create.error)}</p>
          ) : null}
          <button className="btn-primary" disabled={create.isPending}>
            <ShieldCheck size={16} /> Create secure account
          </button>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(editing)}
        title="Manage administrator"
        description="Security changes revoke sessions automatically. A reason is required for audit."
        onClose={() => setEditing(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate();
          }}
        >
          <Field label="Full name (Magaca oo buuxa)">
            <input
              className="input"
              value={editForm.fullName}
              onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role (Doorka)">
              <select
                className="input"
                value={editForm.role}
                onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}
              >
                <option value="ADMIN">Platform Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </Field>
            <Field label="Account access (Gelitaanka)">
              <select
                className="input"
                value={editForm.active ? "ACTIVE" : "DISABLED"}
                onChange={(event) =>
                  setEditForm({ ...editForm, active: event.target.value === "ACTIVE" })
                }
              >
                <option value="ACTIVE">Enabled</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </Field>
          </div>
          <Field label="New password / optional (Fure cusub)">
            <input
              className="input"
              type="password"
              minLength={16}
              value={editForm.password}
              onChange={(event) => setEditForm({ ...editForm, password: event.target.value })}
            />
          </Field>
          <Field label="Audit reason (Sababta)">
            <textarea
              className="input min-h-24"
              value={editForm.reason}
              onChange={(event) => setEditForm({ ...editForm, reason: event.target.value })}
              required
            />
          </Field>
          {update.error || revoke.error ? (
            <p className="text-sm text-rose-700">{errorMessage(update.error ?? revoke.error)}</p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={update.isPending}>
              Save account
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={revoke.isPending || editForm.reason.trim().length < 3}
              onClick={() => revoke.mutate()}
            >
              <KeyRound size={16} /> Revoke all sessions
            </button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function PlatformBroadcastsPage() {
  const client = useQueryClient();
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    targetType: "ALL_TENANTS",
    tenantId: "",
    branchId: "",
    membershipId: "",
    role: "OWNER",
    title: "",
    message: "",
  });
  const tenants = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => getData<Row[]>("/platform/tenants"),
  });
  const broadcasts = useQuery({
    queryKey: ["platform-broadcasts"],
    queryFn: () => getData<Row[]>("/platform/broadcasts"),
  });
  const users = useQuery({
    queryKey: ["platform-tenant-users", form.tenantId],
    queryFn: () => getData<Row[]>(`/platform/tenants/${form.tenantId}/users`),
    enabled: Boolean(form.tenantId) && form.targetType === "USER",
  });
  const selectedTenant = (tenants.data ?? []).find((tenant) => tenant["id"] === form.tenantId);
  const branches = rows(selectedTenant?.["branches"]);
  const send = useMutation({
    mutationFn: () =>
      sendData("post", "/platform/broadcasts", {
        targetType: form.targetType,
        tenantId: form.targetType === "ALL_TENANTS" ? undefined : form.tenantId,
        branchId: form.targetType === "BRANCH" ? form.branchId : undefined,
        membershipId: form.targetType === "USER" ? form.membershipId : undefined,
        role: form.targetType === "ROLE" ? form.role : undefined,
        title: form.title,
        message: form.message,
      }),
    onSuccess: async (result: unknown) => {
      const delivery = record(result);
      setSuccess(`Message delivered to ${text(delivery["deliveryCount"] ?? 0)} user(s).`);
      setForm({ ...form, title: "", message: "" });
      await client.invalidateQueries({ queryKey: ["platform-broadcasts"] });
    },
  });
  return (
    <>
      <PageHeader
        eyebrow="Communication"
        title="Platform notifications"
        description="Send auditable in-app messages to every tenant, one organization, branch, role, or individual user."
      />
      {success ? <SuccessMessage>{success}</SuccessMessage> : null}
      <div className="mt-5 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card
          title="Compose notification"
          description="Every recipient receives an independent read state."
        >
          <form
            className="space-y-4 p-5"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              send.mutate();
            }}
          >
            <Field label="Recipients (Dadka loo dirayo)">
              <select
                className="input"
                value={form.targetType}
                onChange={(event) => setForm({ ...form, targetType: event.target.value })}
              >
                <option value="ALL_TENANTS">All active tenant users</option>
                <option value="TENANT">One tenant</option>
                <option value="BRANCH">One branch</option>
                <option value="ROLE">One tenant role</option>
                <option value="USER">One tenant user</option>
              </select>
            </Field>
            {form.targetType !== "ALL_TENANTS" ? (
              <Field label="Tenant (Farmashiyaha)">
                <select
                  className="input"
                  value={form.tenantId}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      tenantId: event.target.value,
                      branchId: "",
                      membershipId: "",
                    })
                  }
                  required
                >
                  <option value="">Select tenant</option>
                  {(tenants.data ?? []).map((tenant) => (
                    <option key={text(tenant["id"])} value={text(tenant["id"])}>
                      {text(tenant["name"])} / {text(tenant["slug"])}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {form.targetType === "BRANCH" ? (
              <Field label="Branch (Laanta)">
                <select
                  className="input"
                  value={form.branchId}
                  onChange={(event) => setForm({ ...form, branchId: event.target.value })}
                  required
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={text(branch["id"])} value={text(branch["id"])}>
                      {text(branch["name"])}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {form.targetType === "ROLE" ? (
              <Field label="Role (Doorka)">
                <select
                  className="input"
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value })}
                >
                  {["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "CASHIER", "AUDITOR"].map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </Field>
            ) : null}
            {form.targetType === "USER" ? (
              <Field label="User (Shaqaalaha)">
                <select
                  className="input"
                  value={form.membershipId}
                  onChange={(event) => setForm({ ...form, membershipId: event.target.value })}
                  required
                >
                  <option value="">Select user</option>
                  {(users.data ?? []).map((user) => (
                    <option key={text(user["membershipId"])} value={text(user["membershipId"])}>
                      {text(user["fullName"])} / {text(user["role"])}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Title (Cinwaanka)">
              <input
                className="input"
                maxLength={180}
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                required
              />
            </Field>
            <Field label="Message (Fariinta)">
              <textarea
                className="input min-h-32"
                maxLength={500}
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                required
              />
            </Field>
            {send.error ? (
              <p className="text-sm text-rose-700">{errorMessage(send.error)}</p>
            ) : null}
            <button className="btn-primary" disabled={send.isPending}>
              <Send size={16} /> Send notification
            </button>
          </form>
        </Card>
        <Card title="Delivery history">
          {broadcasts.isLoading ? (
            <LoadingState />
          ) : broadcasts.error ? (
            <ErrorState error={broadcasts.error} />
          ) : (
            <SimpleTable
              rows={broadcasts.data ?? []}
              columns={[
                {
                  label: "Notification",
                  render: (row) => (
                    <div className="max-w-sm">
                      <p className="font-bold text-slate-950">{text(row["title"])}</p>
                      <p className="line-clamp-2 text-xs text-slate-500">{text(row["message"])}</p>
                    </div>
                  ),
                },
                {
                  label: "Audience",
                  render: (row) => text(row["targetType"]).replaceAll("_", " "),
                },
                { label: "Delivered", render: (row) => text(row["deliveryCount"]) },
                { label: "Sent", render: (row) => date(row["createdAt"]) },
              ]}
            />
          )}
        </Card>
      </div>
    </>
  );
}

export function PlatformSettingsPage({ principal }: { principal: PlatformPrincipal }) {
  const client = useQueryClient();
  const [saved, setSaved] = useState("");
  const [form, setForm] = useState({
    displayName: "PHMS Platform",
    logoUrl: "",
    primaryColor: "#0D2926",
    accentColor: "#B8F39A",
    supportContact: "",
    paymentNumber: "",
    monthlyFee: "0",
    currencyCode: "USD",
    billingInstructions: "La xiriir platform admin marka aad lacagta dirtid.",
  });
  const query = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () => getData<Record<string, Row>>("/platform/settings"),
  });
  useEffect(() => {
    if (!query.data) return;
    const profile = query.data["platform_profile"] ?? {};
    const billing = query.data["billing"] ?? {};
    setForm({
      displayName: text(profile["displayName"] ?? "PHMS Platform"),
      logoUrl: profile["logoUrl"] ? text(profile["logoUrl"]) : "",
      primaryColor: text(profile["primaryColor"] ?? "#0D2926"),
      accentColor: text(profile["accentColor"] ?? "#B8F39A"),
      supportContact: profile["supportContact"] ? text(profile["supportContact"]) : "",
      paymentNumber: billing["paymentNumber"] ? text(billing["paymentNumber"]) : "",
      monthlyFee: text(billing["monthlyFee"] ?? "0"),
      currencyCode: text(billing["currencyCode"] ?? "USD"),
      billingInstructions: text(
        billing["instructions"] ?? "La xiriir platform admin marka aad lacagta dirtid.",
      ),
    });
  }, [query.data]);
  const save = useMutation({
    mutationFn: () =>
      sendData("put", "/platform/settings", {
        ...form,
        logoUrl: form.logoUrl || undefined,
        supportContact: form.supportContact || undefined,
      }),
    onSuccess: async () => {
      setSaved("Platform branding iyo billing settings waa la keydiyey.");
      await client.invalidateQueries({ queryKey: ["platform-settings"] });
    },
  });
  if (query.isLoading) return <LoadingState label="Loading platform settings" />;
  if (query.error) return <ErrorState error={query.error} />;
  const editable = principal.role === "SUPER_ADMIN";
  return (
    <>
      <PageHeader
        eyebrow="Platform configuration"
        title="Platform settings"
        description="Manage the platform identity and the monthly subscription payment information shown to pharmacies."
      />
      {saved ? <SuccessMessage>{saved}</SuccessMessage> : null}
      <form
        className="mt-5 grid gap-6 xl:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (editable) save.mutate();
        }}
      >
        <Card title="Platform branding" description="Applied to the Super Admin control workspace.">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Platform name (Magaca platform-ka)">
              <input
                className="input"
                value={form.displayName}
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                disabled={!editable}
                required
              />
            </Field>
            <Field label="Logo URL (Link-ga logo-ga)">
              <input
                className="input"
                type="url"
                value={form.logoUrl}
                onChange={(event) => setForm({ ...form, logoUrl: event.target.value })}
                disabled={!editable}
              />
            </Field>
            <Field label="Primary color (Midabka koowaad)">
              <input
                className="input h-12"
                type="color"
                value={form.primaryColor}
                onChange={(event) => setForm({ ...form, primaryColor: event.target.value })}
                disabled={!editable}
              />
            </Field>
            <Field label="Accent color (Midabka labaad)">
              <input
                className="input h-12"
                type="color"
                value={form.accentColor}
                onChange={(event) => setForm({ ...form, accentColor: event.target.value })}
                disabled={!editable}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Support contact (Xiriirka taageerada)">
                <input
                  className="input"
                  value={form.supportContact}
                  onChange={(event) => setForm({ ...form, supportContact: event.target.value })}
                  disabled={!editable}
                />
              </Field>
            </div>
          </div>
        </Card>
        <Card
          title="Monthly subscription"
          description="This information is shown on an expired pharmacy login."
        >
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Monthly fee (Qiimaha bishii)">
              <input
                className="input"
                inputMode="decimal"
                value={form.monthlyFee}
                onChange={(event) => setForm({ ...form, monthlyFee: event.target.value })}
                disabled={!editable}
                required
              />
            </Field>
            <Field label="Currency (Lacagta)">
              <input
                className="input uppercase"
                maxLength={3}
                value={form.currencyCode}
                onChange={(event) =>
                  setForm({ ...form, currencyCode: event.target.value.toUpperCase() })
                }
                disabled={!editable}
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Payment number (Lambarka lacagta)">
                <input
                  className="input"
                  value={form.paymentNumber}
                  onChange={(event) => setForm({ ...form, paymentNumber: event.target.value })}
                  disabled={!editable}
                  required
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Payment instructions (Tilmaamaha lacag-bixinta)">
                <textarea
                  className="input min-h-28"
                  value={form.billingInstructions}
                  onChange={(event) =>
                    setForm({ ...form, billingInstructions: event.target.value })
                  }
                  disabled={!editable}
                  required
                />
              </Field>
            </div>
          </div>
        </Card>
        <div className="xl:col-span-2">
          {save.error ? (
            <p className="mb-3 text-sm text-rose-700">{errorMessage(save.error)}</p>
          ) : null}
          {editable ? (
            <button className="btn-primary" disabled={save.isPending}>
              Save platform settings
            </button>
          ) : (
            <StatusBadge value="READ ONLY" />
          )}
        </div>
      </form>
    </>
  );
}
