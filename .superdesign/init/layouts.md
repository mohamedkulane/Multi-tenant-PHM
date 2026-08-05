# Shared Layouts

## `apps/web/src/components/shell.tsx`

Tenant and platform application shells, responsive sidebar, branding, branch selector, notifications, and session controls.

```tsx
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  CreditCard,
  FlaskConical,
  FileClock,
  HeartPulse,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  PackageSearch,
  Receipt,
  ScrollText,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type CSSProperties } from "react";
import { getData, removeSession } from "../api/client";
import { Link, navigate } from "../lib/navigation";
import type { Branch, PlatformPrincipal, TenantPrincipal, Workspace } from "../types";

interface NavigationItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: TenantPrincipal["role"][];
}

const tenantNavigation: NavigationItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "AUDITOR"],
  },
  { to: "/products", label: "Products", icon: PackageSearch },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  {
    to: "/suppliers",
    label: "Suppliers",
    icon: Truck,
    roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "AUDITOR"],
  },
  {
    to: "/lab",
    label: "Laboratory",
    icon: FlaskConical,
    roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "AUDITOR"],
  },
  {
    to: "/sales",
    label: "Sales & invoices",
    icon: ShoppingCart,
    roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "CASHIER"],
  },
  {
    to: "/debts",
    label: "Debts",
    icon: WalletCards,
    roles: ["OWNER", "ADMIN", "MANAGER"],
  },
  {
    to: "/expenses",
    label: "Expenses",
    icon: Receipt,
    roles: ["OWNER", "ADMIN", "MANAGER", "AUDITOR"],
  },
  {
    to: "/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "AUDITOR"],
  },
  {
    to: "/staff",
    label: "Staff & branches",
    icon: Users,
    roles: ["OWNER", "ADMIN", "MANAGER", "AUDITOR"],
  },
  {
    to: "/operations",
    label: "Jobs & alerts",
    icon: Bell,
    roles: ["OWNER", "ADMIN", "MANAGER", "PHARMACIST", "AUDITOR"],
  },
  {
    to: "/audit",
    label: "Audit trail",
    icon: ScrollText,
    roles: ["OWNER", "ADMIN", "MANAGER", "AUDITOR"],
  },
  { to: "/account", label: "Account", icon: Settings2 },
];

const platformNavigation: NavigationItem[] = [
  { to: "/platform/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/platform/tenants", label: "Tenants", icon: Building2 },
  { to: "/platform/plans", label: "Plans & limits", icon: CreditCard },
  { to: "/platform/administrators", label: "Administrators", icon: Users },
  { to: "/platform/notifications", label: "Notifications", icon: Bell },
  { to: "/platform/support", label: "Support access", icon: LifeBuoy },
  { to: "/platform/audit", label: "Platform audit", icon: FileClock },
];

function Sidebar({
  navigation,
  currentPath,
  open,
  close,
  platform,
  primaryColor,
  accentColor,
  logoUrl,
}: {
  navigation: NavigationItem[];
  currentPath: string;
  open: boolean;
  close: () => void;
  platform: boolean;
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
}) {
  const primary = primaryColor ?? "#0d2926";
  const accent = accentColor ?? "#b8f39a";
  return (
    <>
      {open ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={close}
        />
      ) : null}
      <aside
        style={{ backgroundColor: primary }}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 text-white transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <Link
            to={platform ? "/platform/dashboard" : "/dashboard"}
            className="flex items-center gap-3"
            onClick={close}
          >
            <div
              className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15"
              style={{ backgroundColor: accent, color: primary }}
            >
              {!platform && logoUrl ? (
                <img
                  src={logoUrl}
                  alt="Pharmacy logo"
                  className="size-full bg-white object-contain p-1"
                />
              ) : platform ? (
                <ShieldCheck size={24} />
              ) : (
                <HeartPulse size={24} />
              )}
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">PHMS</p>
              <p className="text-[11px] font-semibold tracking-[0.12em] text-emerald-200 uppercase">
                {platform ? "Platform control" : "Pharmacy workspace"}
              </p>
            </div>
          </Link>
          <button
            className="rounded-lg p-2 text-emerald-100 hover:bg-white/10 lg:hidden"
            onClick={close}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {navigation.map(({ to, label, icon: Icon }) => {
            const active =
              currentPath === to ||
              (to !== "/platform/dashboard" &&
                to !== "/dashboard" &&
                currentPath.startsWith(`${to}/`));
            return (
              <Link
                key={to}
                to={to}
                onClick={close}
                {...(active ? { style: { backgroundColor: accent, color: primary } } : {})}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active ? "shadow-sm" : "text-emerald-50/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

export function TenantShell({
  principal,
  workspace,
  branch,
  onBranchChange,
  currentPath,
  children,
}: {
  principal: TenantPrincipal;
  workspace: Workspace;
  branch?: Branch | undefined;
  onBranchChange: (branchId: string) => void;
  currentPath: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications", branch?.id, "shell"],
    queryFn: () => getData<{ unread: number }>(`/notifications?branchId=${branch!.id}`),
    enabled: Boolean(branch) && principal.role !== "CASHIER",
    refetchInterval: 60_000,
  });
  const unreadNotifications = notifications.data?.unread ?? 0;
  const tenantTheme = {
    "--tenant-primary": workspace.branding?.primaryColor ?? "#0d2926",
    "--tenant-accent": workspace.branding?.accentColor ?? "#b8f39a",
  } as CSSProperties;
  const logout = async () => {
    await removeSession("/auth/logout");
    queryClient.clear();
    window.localStorage.removeItem("phms.branch");
    navigate("/login", true);
  };
  return (
    <div className="min-h-screen bg-[#f4f7f6]" style={tenantTheme}>
      <Sidebar
        navigation={tenantNavigation.filter(
          (item) => !item.roles || item.roles.includes(principal.role),
        )}
        currentPath={currentPath}
        open={open}
        close={() => setOpen(false)}
        platform={false}
        primaryColor={workspace.branding?.primaryColor ?? "#0d2926"}
        accentColor={workspace.branding?.accentColor ?? "#b8f39a"}
        {...(workspace.branding?.logoUrl ? { logoUrl: workspace.branding.logoUrl } : {})}
      />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-18 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-700 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            {workspace.branding?.logoUrl ? (
              <img
                src={workspace.branding.logoUrl}
                alt="Pharmacy logo"
                className="size-10 rounded-xl border border-slate-200 bg-white object-contain p-1"
              />
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                {workspace.branding?.displayName ?? workspace.tenant.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {principal.isSupportSession
                  ? "Read-only support session"
                  : `${principal.fullName} | ${principal.role}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {principal.role !== "CASHIER" ? (
              <Link
                to="/operations"
                aria-label={`Digniinaha (Notifications): ${unreadNotifications} unread`}
                className="relative grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                <Bell size={18} />
                {unreadNotifications > 0 ? (
                  <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                ) : null}
              </Link>
            ) : null}
            {workspace.branches.length ? (
              <label className="relative hidden sm:block">
                <span className="sr-only">Active branch</span>
                <select
                  value={branch?.id ?? ""}
                  onChange={(event) => onBranchChange(event.target.value)}
                  className="appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500"
                >
                  {workspace.branches.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={15}
                  className="pointer-events-none absolute top-2.5 right-3 text-slate-500"
                />
              </label>
            ) : null}
            <button
              onClick={() => void logout()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut size={17} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>
        {principal.isSupportSession ? (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs font-bold text-amber-800">
            Support access is temporary, tenant-bound, audited, and read-only.
          </div>
        ) : null}
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

export function PlatformShell({
  principal,
  currentPath,
  children,
}: {
  principal: PlatformPrincipal;
  currentPath: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const logout = async () => {
    await removeSession("/platform/auth/logout");
    queryClient.clear();
    navigate("/platform/login", true);
  };
  return (
    <div className="min-h-screen bg-[#f3f5f7]">
      <Sidebar
        navigation={
          principal.role === "SUPER_ADMIN"
            ? platformNavigation
            : platformNavigation.filter(
                (item) =>
                  ![
                    "/platform/administrators",
                    "/platform/notifications",
                    "/platform/audit",
                    "/platform/support",
                  ].includes(item.to),
              )
        }
        currentPath={currentPath}
        open={open}
        close={() => setOpen(false)}
        platform
      />
      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex min-h-18 items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="rounded-xl border border-slate-200 p-2 text-slate-700 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <p className="text-sm font-bold text-slate-900">Platform control</p>
              <p className="text-xs text-slate-500">
                {principal.fullName} / {principal.role.replace("_", " ")}
              </p>
            </div>
          </div>
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut size={17} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
```
