import { useQuery } from "@tanstack/react-query";
import {
  BadgeCheck,
  Blocks,
  Building2,
  Database,
  HeartPulse,
  LockKeyhole,
  Server,
} from "lucide-react";
import { getApiLiveness } from "../api/health";

const milestones = [
  {
    label: "M1",
    title: "Platform foundation",
    description: "TypeScript workspace, API, web application, PostgreSQL and delivery checks.",
    current: true,
  },
  {
    label: "M2",
    title: "Tenant isolation",
    description: "Identity, memberships, permissions, sessions and PostgreSQL Row-Level Security.",
    current: false,
  },
  {
    label: "M3",
    title: "Catalog and inventory",
    description: "Products, packaging rules, batches, stock movements and branch transfers.",
    current: false,
  },
  {
    label: "M4+",
    title: "Pharmacy operations",
    description: "Sales, invoices, debt, expenses, reporting, jobs and platform administration.",
    current: false,
  },
] as const;

export function FoundationPage() {
  const health = useQuery({
    queryKey: ["api-liveness"],
    queryFn: getApiLiveness,
  });

  const apiOnline = health.isSuccess;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e4f6ef_0,#f7faf8_42%,#edf3f1_100%)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between rounded-2xl border border-white/70 bg-white/80 px-5 py-4 shadow-[0_18px_55px_rgba(25,70,63,0.08)] backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-[#123f3a] text-[#b7f08c] shadow-sm">
              <HeartPulse aria-hidden="true" size={24} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.16em] text-[#35685f] uppercase">
                PHMS
              </p>
              <p className="text-base font-semibold text-slate-900">Multi-Tenant Platform</p>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
              apiOnline
                ? "bg-emerald-50 text-emerald-800"
                : health.isPending
                  ? "bg-amber-50 text-amber-800"
                  : "bg-rose-50 text-rose-800"
            }`}
            role="status"
          >
            <span
              className={`size-2 rounded-full ${
                apiOnline
                  ? "bg-emerald-500"
                  : health.isPending
                    ? "animate-pulse bg-amber-500"
                    : "bg-rose-500"
              }`}
            />
            {apiOnline ? "API online" : health.isPending ? "Checking API" : "API unavailable"}
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#b9d9cd] bg-white/70 px-3 py-1.5 text-sm font-semibold text-[#285f56]">
              <Blocks aria-hidden="true" size={16} />
              Milestone M1 in progress
            </div>
            <h1 className="max-w-3xl text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-[#102f2b] sm:text-5xl lg:text-6xl">
              A secure foundation for every pharmacy tenant.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              PHMS is being rebuilt as a PostgreSQL multi-tenant platform with explicit tenant
              boundaries, branch-aware operations, transactional inventory and auditable financial
              workflows.
            </p>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {[
                { icon: Building2, label: "Tenant and branch aware" },
                { icon: LockKeyhole, label: "RLS defense in depth" },
                { icon: Database, label: "PostgreSQL + Prisma" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex min-h-24 flex-col justify-between rounded-2xl border border-white bg-white/75 p-4 shadow-sm"
                >
                  <Icon aria-hidden="true" className="text-[#2e7468]" size={21} />
                  <span className="text-sm font-semibold text-slate-700">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white bg-white/85 p-5 shadow-[0_24px_80px_rgba(25,70,63,0.12)] backdrop-blur sm:p-7">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#2e7468]">Delivery sequence</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  Build, prove, then expand
                </h2>
              </div>
              <div className="grid size-11 place-items-center rounded-xl bg-[#e4f6ef] text-[#285f56]">
                <Server aria-hidden="true" size={22} />
              </div>
            </div>

            <ol className="space-y-3">
              {milestones.map((milestone) => (
                <li
                  key={milestone.label}
                  className={`grid grid-cols-[auto_1fr] gap-4 rounded-2xl border p-4 ${
                    milestone.current
                      ? "border-[#93c9b8] bg-[#effaf5]"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div
                    className={`grid size-10 place-items-center rounded-xl text-sm font-bold ${
                      milestone.current
                        ? "bg-[#123f3a] text-[#b7f08c]"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {milestone.current ? (
                      <BadgeCheck aria-label={`${milestone.label} current`} size={20} />
                    ) : (
                      milestone.label
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{milestone.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{milestone.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-[#cbded8] pt-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Secure multi-tenant pharmacy operations</span>
          <span>React · Express · Prisma · PostgreSQL</span>
        </footer>
      </div>
    </main>
  );
}
