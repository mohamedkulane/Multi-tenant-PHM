import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CircleHelp,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getData } from "../api/client";
import { Card, date, ErrorState, LoadingState } from "../components/ui";
import { brandChartPalette } from "../lib/chart-colors";
import { Link } from "../lib/navigation";
import type { PlatformPrincipal } from "../types";
import { SubscriptionCollections } from "./subscription-collections";

interface Overview {
  cards: {
    activeTenants: number;
    totalTenants: number;
    activeTenantUsers: number;
    activeBranches: number;
    salesLast30Days: number;
    activeProducts: number;
    pendingSupport: number;
    activePlatformSessions: number;
  };
  charts: {
    tenantGrowth: { label: string; value: number }[];
    tenantStatuses: { label: string; value: number }[];
  };
  alerts: { title: string; message: string }[];
  recentAudit: { id?: string; action: string; entityType: string; createdAt: string }[];
}

export function PlatformOverviewPage({ principal }: { principal: PlatformPrincipal }) {
  const reducedMotion = useReducedMotion();
  const query = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => getData<Overview>("/platform/overview"),
    refetchInterval: 60_000,
  });
  const settings = useQuery({
    queryKey: ["platform-settings"],
    queryFn: () =>
      getData<{ platform_profile?: { primaryColor?: string; accentColor?: string } }>(
        "/platform/settings",
      ),
  });
  if (query.isLoading) return <LoadingState label="Loading platform intelligence" />;
  if (query.error) return <ErrorState error={query.error} />;
  if (!query.data) return null;
  const { cards, charts, alerts, recentAudit } = query.data;
  if (
    !cards ||
    !charts ||
    !Array.isArray(charts.tenantStatuses) ||
    !Array.isArray(charts.tenantGrowth) ||
    !Array.isArray(alerts) ||
    !Array.isArray(recentAudit)
  ) {
    return (
      <ErrorState
        error={
          new Error(
            "Platform summary data is incomplete. Refresh the page; if this continues, contact platform support.",
          )
        }
      />
    );
  }
  const colors = brandChartPalette(
    settings.data?.platform_profile?.primaryColor ?? "#2563eb",
    settings.data?.platform_profile?.accentColor ?? "#38bdf8",
  );
  const total = charts.tenantStatuses.reduce((sum, item) => sum + Number(item.value), 0);
  const metrics = [
    {
      title: "Active organizations",
      value: cards.activeTenants,
      detail: `${cards.totalTenants} total tenants`,
      icon: Building2,
      tone: "bg-blue-50 text-blue-600",
    },
    {
      title: "People on the platform",
      value: cards.activeTenantUsers,
      detail: `${cards.activeBranches} active branches`,
      icon: Users,
      tone: "bg-violet-50 text-violet-600",
    },
    {
      title: "Sales · last 30 days",
      value: cards.salesLast30Days,
      detail: `${cards.activeProducts} active products · transaction count`,
      icon: ShoppingBag,
      tone: "bg-emerald-50 text-emerald-600",
    },
    {
      title: "Support requests",
      value: cards.pendingSupport,
      detail: `${cards.activePlatformSessions} active platform sessions`,
      icon: CircleHelp,
      tone: "bg-amber-50 text-amber-600",
    },
  ];
  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-32 size-96 rounded-full bg-blue-500/20 blur-3xl"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.22em] text-blue-200">
              <Activity size={15} /> Platform intelligence
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your platform, at a glance.
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">
              Welcome back, {principal.fullName.split(" ")[0]}. A clear view of your organizations,
              subscription collections and daily operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label="Refresh dashboard"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
              className="rounded-xl border border-white/20 p-3 text-white hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw
                size={17}
                className={query.isFetching && !reducedMotion ? "animate-spin" : ""}
              />
            </button>
            {principal.role === "SUPER_ADMIN" && (
              <Link
                to="/platform/tenants/new"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-950 hover:bg-blue-50"
              >
                <Plus size={17} /> Onboard tenant
              </Link>
            )}
          </div>
        </div>
        <div className="relative mt-7 flex flex-wrap gap-4 border-t border-white/10 pt-5 text-xs text-slate-300">
          <span className="flex items-center gap-2">
            <CalendarDays size={14} />
            {new Date().toLocaleDateString("en", {
              weekday: "short",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span>
            Updated{" "}
            {new Date(query.dataUpdatedAt).toLocaleTimeString("en", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · refreshes every minute
          </span>
        </div>
      </header>
      {principal.emailVerified === false && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <span>
            <strong>Protect your account.</strong> Verify {principal.email} to enable password
            recovery.
          </span>
          <Link to="/platform/request-verification" className="font-bold underline">
            Verify email
          </Link>
        </div>
      )}
      <section
        aria-label="Platform key metrics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.06 }}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">{metric.title}</p>
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${metric.tone}`}
              >
                <metric.icon size={19} />
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
              {Number(metric.value).toLocaleString()}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{metric.detail}</p>
          </motion.div>
        ))}
      </section>
      {principal.role === "SUPER_ADMIN" && <SubscriptionCollections />}
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card
          title="Organization growth"
          description="New organizations onboarded each month · last six months"
        >
          <div className="px-5 pt-5">
            <span className="text-3xl font-bold text-slate-950">
              {charts.tenantGrowth.reduce((sum, item) => sum + Number(item.value), 0)}
            </span>
            <span className="ml-2 text-sm text-slate-500">new organizations</span>
          </div>
          <div
            className="h-64 min-w-0 p-4"
            role="img"
            aria-label={`Organization growth: ${charts.tenantGrowth.map((item) => `${item.label}: ${item.value}`).join(", ")}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.tenantGrowth} margin={{ left: -25, right: 10, top: 15 }}>
                <defs>
                  <linearGradient id="organizationGrowthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors[0]} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={colors[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                <Area
                  name="New organizations"
                  dataKey="value"
                  type="monotone"
                  stroke={colors[0]}
                  strokeWidth={3}
                  fill="url(#organizationGrowthFill)"
                  isAnimationActive={!reducedMotion}
                  animationDuration={1100}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Tenant health" description="Current operating status across all organizations">
          <div className="flex flex-wrap items-center justify-center gap-3 p-5">
            <div
              className="relative h-52 w-52 shrink-0"
              role="img"
              aria-label={`${total} organizations by status`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      total
                        ? charts.tenantStatuses.filter((item) => Number(item.value) > 0)
                        : [{ label: "No tenants", value: 1 }]
                    }
                    dataKey="value"
                    nameKey="label"
                    innerRadius={68}
                    outerRadius={90}
                    paddingAngle={3}
                    stroke="none"
                    isAnimationActive={!reducedMotion}
                    animationDuration={1100}
                  >
                    {(total
                      ? charts.tenantStatuses.filter((item) => Number(item.value) > 0)
                      : [{ label: "No tenants", value: 1 }]
                    ).map((item) => (
                      <Cell
                        key={item.label}
                        fill={
                          total
                            ? (colors[
                                charts.tenantStatuses.findIndex(
                                  (status) => status.label === item.label,
                                ) % colors.length
                              ] ?? "#2563eb")
                            : "#e2e8f0"
                        }
                      />
                    ))}
                  </Pie>
                  {total > 0 && <Tooltip />}
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <strong className="text-3xl text-slate-950">{total}</strong>
                <span className="text-xs text-slate-500">organizations</span>
              </div>
            </div>
            <dl className="min-w-36 flex-1 space-y-4">
              {charts.tenantStatuses.map((item, index) => (
                <div key={item.label} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="flex items-center gap-2 text-slate-600">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: colors[index % colors.length] }}
                    />
                    {item.label.toLowerCase()}
                  </dt>
                  <dd className="font-bold text-slate-950">
                    {item.value}{" "}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      {total ? Math.round((Number(item.value) / total) * 100) : 0}%
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Card title="Recent activity" description="Latest security and administration events">
          <ul className="divide-y divide-slate-100 px-5">
            {recentAudit.slice(0, 5).map((event, index) => (
              <li key={event.id ?? index} className="flex gap-3 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-500">
                  <ShieldCheck size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold capitalize text-slate-800">
                    {event.action.toLowerCase().replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.entityType.replaceAll("_", " ")}
                  </p>
                </div>
                <time className="max-w-28 text-right text-xs leading-5 text-slate-400">
                  {date(event.createdAt)}
                </time>
              </li>
            ))}
          </ul>
          {!recentAudit.length && (
            <p className="p-6 text-sm text-slate-500">No recent administration activity.</p>
          )}
          {principal.role === "SUPER_ADMIN" && (
            <Link
              to="/platform/audit"
              className="flex items-center justify-center gap-2 border-t border-slate-100 p-4 text-xs font-bold text-blue-700"
            >
              View audit history <ArrowUpRight size={14} />
            </Link>
          )}
        </Card>
        <Card title="Attention center" description="Operational items that may need a review">
          <div className="space-y-3 p-5">
            {alerts.length ? (
              alerts.map((alert, index) => (
                <div key={index} className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-950">{alert.title}</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">{alert.message}</p>
                </div>
              ))
            ) : (
              <div className="rounded-xl bg-emerald-50 p-5">
                <ShieldCheck className="mb-3 text-emerald-600" />
                <p className="text-sm font-bold text-emerald-950">No pending platform alerts</p>
                <p className="mt-1 text-xs leading-5 text-emerald-800">
                  There are no operational alerts in the latest overview.
                </p>
              </div>
            )}
            {principal.role === "SUPER_ADMIN" && (
              <Link
                to="/platform/support"
                className="flex items-center justify-between rounded-xl border border-slate-200 p-4 text-sm font-semibold text-slate-700"
              >
                Open support center <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
