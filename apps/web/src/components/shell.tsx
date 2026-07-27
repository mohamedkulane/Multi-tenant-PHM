import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  CreditCard,
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
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { useState } from "react";
import { removeSession } from "../api/client";
import { Link, navigate } from "../lib/navigation";
import type { Branch, PlatformPrincipal, TenantPrincipal, Workspace } from "../types";

interface NavigationItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const tenantNavigation: NavigationItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: PackageSearch },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/sales", label: "Sales & invoices", icon: ShoppingCart },
  { to: "/debts", label: "Debts", icon: WalletCards },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/staff", label: "Staff & branches", icon: Users },
  { to: "/operations", label: "Jobs & alerts", icon: Bell },
  { to: "/audit", label: "Audit trail", icon: ScrollText },
  { to: "/account", label: "Account", icon: Settings2 },
];

const platformNavigation: NavigationItem[] = [
  { to: "/platform", label: "Overview", icon: LayoutDashboard },
  { to: "/platform/tenants", label: "Tenants", icon: Building2 },
  { to: "/platform/plans", label: "Plans & limits", icon: CreditCard },
  { to: "/platform/support", label: "Support access", icon: LifeBuoy },
  { to: "/platform/audit", label: "Platform audit", icon: FileClock },
];

function Sidebar({
  navigation,
  currentPath,
  open,
  close,
  platform,
}: {
  navigation: NavigationItem[];
  currentPath: string;
  open: boolean;
  close: () => void;
  platform: boolean;
}) {
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
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 bg-[#0d2926] text-white transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <Link
            to={platform ? "/platform" : "/dashboard"}
            className="flex items-center gap-3"
            onClick={close}
          >
            <div className="grid size-10 place-items-center rounded-xl bg-[#b8f39a] text-[#0d2926]">
              {platform ? <ShieldCheck size={22} /> : <HeartPulse size={22} />}
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
              (to !== "/platform" && to !== "/dashboard" && currentPath.startsWith(`${to}/`));
            return (
              <Link
                key={to}
                to={to}
                onClick={close}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-[#b8f39a] text-[#0d2926]"
                    : "text-emerald-50/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <Link
            to={platform ? "/login" : "/platform/login"}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-white/10"
          >
            <ClipboardList size={16} />
            {platform ? "Open pharmacy login" : "Open platform login"}
          </Link>
        </div>
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
  const logout = async () => {
    await removeSession("/auth/logout");
    navigate("/login", true);
  };
  return (
    <div className="min-h-screen bg-[#f4f7f6]">
      <Sidebar
        navigation={tenantNavigation}
        currentPath={currentPath}
        open={open}
        close={() => setOpen(false)}
        platform={false}
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
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                {workspace.branding?.displayName ?? workspace.tenant.name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {principal.isSupportSession
                  ? "Read-only support session"
                  : `${principal.fullName} Â· ${principal.role}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
  const logout = async () => {
    await removeSession("/platform/auth/logout");
    navigate("/platform/login", true);
  };
  return (
    <div className="min-h-screen bg-[#f3f5f7]">
      <Sidebar
        navigation={platformNavigation}
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
                {principal.fullName} Â· {principal.role.replace("_", " ")}
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
