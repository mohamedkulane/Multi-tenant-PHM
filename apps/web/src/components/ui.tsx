import { AlertTriangle, CheckCircle2, LoaderCircle, Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "../api/client";

function scalarText(value: unknown) {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
    ? String(value)
    : "—";
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-xs font-bold tracking-[0.18em] text-emerald-700 uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-bold tracking-[-0.03em] text-slate-950">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean | undefined;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`my-8 w-full ${wide ? "max-w-4xl" : "max-w-xl"} overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button className="btn-icon" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  className = "",
}: {
  title?: string;
  description?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-[0_10px_35px_rgba(15,23,42,0.05)] ${className}`}
    >
      {title || description ? (
        <div className="border-b border-slate-100 px-5 py-4">
          {title ? <h2 className="font-bold text-slate-900">{title}</h2> : null}
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone = "emerald",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "emerald" | "amber" | "rose" | "blue";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-800",
    blue: "bg-blue-50 text-blue-800",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-5 h-1.5 w-10 rounded-full ${tones[tone].split(" ")[0]}`} />
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      {detail ? <p className="mt-2 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const tone =
    normalized.includes("ACTIVE") ||
    normalized.includes("PAID") ||
    normalized.includes("SUCCEEDED") ||
    normalized.includes("APPROVED") ||
    normalized.includes("TRIAL")
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : normalized.includes("PENDING") ||
          normalized.includes("QUEUED") ||
          normalized.includes("PARTIAL")
        ? "bg-amber-50 text-amber-700 ring-amber-200"
        : "bg-rose-50 text-rose-700 ring-rose-200";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${tone}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description = "New records will appear here.",
}: {
  title?: string;
  description?: string | undefined;
}) {
  return (
    <div className="grid min-h-52 place-items-center p-8 text-center">
      <div>
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-slate-100 text-slate-500">
          <Search size={19} />
        </div>
        <p className="font-semibold text-slate-800">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-64 place-items-center">
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
        <LoaderCircle className="animate-spin text-emerald-600" size={20} />
        {label}
      </div>
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0" size={20} />
        <div>
          <p className="font-bold">Unable to load this page</p>
          <p className="mt-1 text-sm">{errorMessage(error)}</p>
        </div>
      </div>
    </div>
  );
}

export function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
      <CheckCircle2 size={17} />
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function SimpleTable({
  columns,
  rows,
  rowKey,
}: {
  columns: Array<{
    label: string;
    render: (row: Record<string, unknown>) => ReactNode;
  }>;
  rows: Array<Record<string, unknown>>;
  rowKey?: (row: Record<string, unknown>, index: number) => string;
}) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px]">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {columns.map((column) => (
              <th
                key={column.label}
                className="px-4 py-3 text-left text-xs font-bold tracking-wide text-slate-500 uppercase"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey?.(row, index) ?? scalarText(row["id"] ?? index)}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70"
            >
              {columns.map((column) => (
                <td key={column.label} className="px-4 py-3.5 text-sm text-slate-700">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function money(value: unknown, currency = "USD") {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}

export function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(scalarText(value));
  return Number.isNaN(parsed.getTime())
    ? scalarText(value)
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}
