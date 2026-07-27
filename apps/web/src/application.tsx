import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getData } from "./api/client";
import { PlatformShell, TenantShell } from "./components/shell";
import { ErrorState, LoadingState } from "./components/ui";
import { navigate, usePathname } from "./lib/navigation";
import { AcceptInvitationPage, PlatformLoginPage, TenantLoginPage } from "./pages/login-pages";
import {
  PlatformAuditPage,
  PlatformOverviewPage,
  PlatformPlansPage,
  PlatformSupportPage,
  PlatformTenantDetailPage,
  PlatformTenantsPage,
  TenantOnboardingPage,
} from "./pages/platform-pages";
import {
  AccountPage,
  DashboardPage,
  DebtsPage,
  ExpensesPage,
  InventoryPage,
  OperationsPage,
  ProductsPage,
  ReportsPage,
  SalesPage,
  StaffPage,
  TenantAuditPage,
} from "./pages/tenant-pages";
import type { PlatformPrincipal, TenantPrincipal, Workspace } from "./types";

function PlatformApplication({ pathname }: { pathname: string }) {
  const principal = useQuery({
    queryKey: ["platform-principal"],
    queryFn: () => getData<PlatformPrincipal>("/platform/auth/me"),
    retry: false,
  });
  if (principal.isLoading) return <LoadingState label="Restoring platform session" />;
  if (principal.error || !principal.data) {
    if (pathname !== "/platform/login") navigate("/platform/login", true);
    return <PlatformLoginPage />;
  }
  if (pathname === "/platform/login") navigate("/platform", true);
  let page: React.ReactNode = <PlatformOverviewPage />;
  if (pathname === "/platform/tenants") page = <PlatformTenantsPage />;
  else if (pathname === "/platform/tenants/new") page = <TenantOnboardingPage />;
  else if (/^\/platform\/tenants\/[^/]+$/.test(pathname))
    page = <PlatformTenantDetailPage tenantId={pathname.split("/").at(-1)!} />;
  else if (pathname === "/platform/plans") page = <PlatformPlansPage principal={principal.data} />;
  else if (pathname === "/platform/support")
    page = <PlatformSupportPage principal={principal.data} />;
  else if (pathname === "/platform/audit") page = <PlatformAuditPage />;
  return (
    <PlatformShell principal={principal.data} currentPath={pathname}>
      {page}
    </PlatformShell>
  );
}

function TenantApplication({ pathname }: { pathname: string }) {
  const principal = useQuery({
    queryKey: ["tenant-principal"],
    queryFn: () => getData<TenantPrincipal>("/auth/me"),
    retry: false,
  });
  const workspace = useQuery({
    queryKey: ["tenant-workspace"],
    queryFn: () => getData<Workspace>("/tenant/workspace"),
    enabled: principal.isSuccess,
    retry: false,
  });
  const [branchId, setBranchId] = useState(() => window.localStorage.getItem("phms.branch") ?? "");
  useEffect(() => {
    if (
      workspace.data?.branches.length &&
      !workspace.data.branches.some((branch) => branch.id === branchId)
    ) {
      setBranchId(workspace.data.branches[0]!.id);
    }
  }, [workspace.data, branchId]);
  const branch = useMemo(
    () => workspace.data?.branches.find((item) => item.id === branchId),
    [workspace.data, branchId],
  );
  if (principal.isLoading) return <LoadingState label="Restoring pharmacy session" />;
  if (principal.error || !principal.data) {
    if (pathname !== "/login") navigate("/login", true);
    return <TenantLoginPage />;
  }
  if (pathname === "/login") navigate("/dashboard", true);
  if (workspace.isLoading) return <LoadingState label="Loading tenant workspace" />;
  if (workspace.error || !workspace.data) return <ErrorState error={workspace.error} />;
  let page: React.ReactNode = <DashboardPage branch={branch} workspace={workspace.data} />;
  if (pathname === "/products") page = <ProductsPage principal={principal.data} />;
  else if (pathname === "/inventory")
    page = <InventoryPage branch={branch} workspace={workspace.data} principal={principal.data} />;
  else if (pathname === "/sales")
    page = <SalesPage branch={branch} workspace={workspace.data} principal={principal.data} />;
  else if (pathname === "/debts")
    page = <DebtsPage branch={branch} workspace={workspace.data} principal={principal.data} />;
  else if (pathname === "/expenses")
    page = <ExpensesPage branch={branch} workspace={workspace.data} principal={principal.data} />;
  else if (pathname === "/reports")
    page = <ReportsPage branch={branch} workspace={workspace.data} />;
  else if (pathname === "/staff")
    page = <StaffPage workspace={workspace.data} principal={principal.data} />;
  else if (pathname === "/operations") page = <OperationsPage branch={branch} />;
  else if (pathname === "/audit") page = <TenantAuditPage />;
  else if (pathname === "/account")
    page = <AccountPage principal={principal.data} workspace={workspace.data} />;
  return (
    <TenantShell
      principal={principal.data}
      workspace={workspace.data}
      branch={branch}
      currentPath={pathname}
      onBranchChange={(next) => {
        window.localStorage.setItem("phms.branch", next);
        setBranchId(next);
      }}
    >
      {page}
    </TenantShell>
  );
}

export function Application() {
  const pathname = usePathname();
  if (pathname === "/accept-invitation") return <AcceptInvitationPage />;
  if (pathname.startsWith("/platform")) return <PlatformApplication pathname={pathname} />;
  return <TenantApplication pathname={pathname} />;
}
