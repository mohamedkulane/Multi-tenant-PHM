import { HeartPulse, KeyRound, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { errorMessage, sendData } from "../api/client";
import { Field, SuccessMessage } from "../components/ui";
import { Link, navigate } from "../lib/navigation";
import type { PlatformPrincipal, TenantPrincipal } from "../types";

function LoginFrame({
  platform,
  title,
  description,
  children,
}: {
  platform?: boolean;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-[#eef4f1] lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[#0d2926] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -top-32 -left-24 size-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-[#b8f39a] text-[#0d2926]">
            {platform ? <ShieldCheck size={24} /> : <HeartPulse size={24} />}
          </div>
          <div>
            <p className="text-xl font-bold">PHMS</p>
            <p className="text-xs tracking-[0.16em] text-emerald-200 uppercase">
              Multi-tenant pharmacy platform
            </p>
          </div>
        </div>
        <div className="relative max-w-xl">
          <p className="text-sm font-bold tracking-[0.18em] text-[#b8f39a] uppercase">
            {platform ? "Platform administration" : "Pharmacy operations"}
          </p>
          <h2 className="mt-4 text-5xl leading-tight font-bold tracking-[-0.04em]">
            {platform
              ? "Operate every tenant without crossing trust boundaries."
              : "Reliable pharmacy work, from stock receipt to financial evidence."}
          </h2>
          <p className="mt-6 text-lg leading-8 text-emerald-50/70">
            PostgreSQL row-level security, branch-aware workflows, immutable inventory and finance
            records, and complete audit evidence.
          </p>
        </div>
        <p className="relative text-xs text-emerald-100/60">
          Secure local development Â· PostgreSQL Â· Prisma Â· Express Â· React
        </p>
      </section>
      <section className="grid place-items-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 grid size-11 place-items-center rounded-xl bg-[#0d2926] text-[#b8f39a]">
              {platform ? <ShieldCheck size={23} /> : <HeartPulse size={23} />}
            </div>
            <p className="font-bold text-slate-900">PHMS</p>
          </div>
          <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">
            Secure sign in
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
            {children}
          </div>
          <div className="mt-5 text-center text-sm">
            <Link
              className="font-semibold text-emerald-700 hover:text-emerald-900"
              to={platform ? "/login" : "/platform/login"}
            >
              {platform ? "Sign in to a pharmacy tenant" : "Open platform administration"}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

export function TenantLoginPage() {
  const [form, setForm] = useState({
    tenantSlug: "",
    username: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await sendData<TenantPrincipal>("post", "/auth/login", form);
      navigate("/dashboard", true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };
  return (
    <LoginFrame
      title="Pharmacy workspace"
      description="Enter your organization, username, and password."
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field label="Organization">
          <input
            className="input"
            autoComplete="organization"
            placeholder="example-pharmacy"
            value={form.tenantSlug}
            onChange={(event) => setForm({ ...form, tenantSlug: event.target.value })}
            required
          />
        </Field>
        <Field label="Username">
          <input
            className="input"
            autoComplete="username"
            value={form.username}
            onChange={(event) => setForm({ ...form, username: event.target.value })}
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
        </Field>
        {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
        <button className="btn-primary w-full" disabled={pending}>
          <KeyRound size={17} />
          {pending ? "Signing inâ€¦" : "Sign in"}
        </button>
        <Link
          to="/accept-invitation"
          className="block text-center text-sm font-semibold text-emerald-700"
        >
          Accept a staff invitation
        </Link>
      </form>
    </LoginFrame>
  );
}

export function PlatformLoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await sendData<PlatformPrincipal>("post", "/platform/auth/login", form);
      navigate("/platform", true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };
  return (
    <LoginFrame
      platform
      title="Platform control"
      description="This login is separate from every pharmacy tenant."
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field label="Platform email">
          <input
            className="input"
            type="email"
            autoComplete="username"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
        </Field>
        {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
        <button className="btn-primary w-full" disabled={pending}>
          <ShieldCheck size={17} />
          {pending ? "Signing inâ€¦" : "Sign in securely"}
        </button>
      </form>
    </LoginFrame>
  );
}

export function AcceptInvitationPage() {
  const query = new URLSearchParams(window.location.search);
  const [form, setForm] = useState({
    token: query.get("token") ?? "",
    fullName: "",
    password: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await sendData("post", "/tenant/invitations/accept", form);
      setMessage("Account created. You can now sign in with the invited username.");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };
  return (
    <LoginFrame
      title="Accept staff invitation"
      description="Invitation links expire after 72 hours and can only be used once."
    >
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <Field label="Invitation token">
          <textarea
            className="input min-h-24"
            value={form.token}
            onChange={(event) => setForm({ ...form, token: event.target.value })}
            required
          />
        </Field>
        <Field label="Full name">
          <input
            className="input"
            value={form.fullName}
            onChange={(event) => setForm({ ...form, fullName: event.target.value })}
            required
          />
        </Field>
        <Field label="Create password" hint="Use at least 12 characters.">
          <input
            className="input"
            type="password"
            minLength={12}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
          />
        </Field>
        {message ? <SuccessMessage>{message}</SuccessMessage> : null}
        {error ? <p className="text-sm font-semibold text-rose-700">{error}</p> : null}
        <button className="btn-primary w-full">Create account</button>
        <Link className="block text-center text-sm text-emerald-700" to="/login">
          Return to sign in
        </Link>
      </form>
    </LoginFrame>
  );
}
