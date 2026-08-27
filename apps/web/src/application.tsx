import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getData } from "./api/client";
import { PlatformShell, TenantShell } from "./components/shell";
import { ErrorState, LoadingState } from "./components/ui";
import {
  platformDashboardPath,
  tenantLandingPath,
  tenantRouteAllowed,
} from "./lib/auth-navigation";
import { navigate, usePathname } from "./lib/navigation";
import { AcceptInvitationPage, PlatformLoginPage, TenantLoginPage } from "./pages/login-pages";
import {
  PlatformAuditPage,
  PlatformPlansPage,
  PlatformSupportPage,
  PlatformTenantDetailPage,
  PlatformTenantsPage,
  TenantOnboardingPage,
} from "./pages/platform-pages";
import {
  PlatformAdministratorsPage,
  PlatformBroadcastsPage,
  PlatformOverviewPage,
  PlatformSettingsPage,
} from "./pages/platform-control-pages";
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
import { CustomersPage, LabPage, SuppliersPage } from "./pages/operations-pages";
import { ClinicalVisitPage } from "./features/clinical/pages/clinical-visit-page";
import { VisitLabResultsPage } from "./features/clinical/pages/visit-lab-results-page";
import { RoleDashboardPage } from "./features/dashboard/pages/role-dashboard-page";
import {
  DoctorCalendarPage,
  DoctorMessagesPage,
  DoctorWorkspacePage,
  type DoctorWorkspaceMode,
} from "./features/dashboard/pages/doctor-workspace-pages";
import { ReceptionDeskPage } from "./features/reception/pages/reception-desk-page";
import { ClinicalPrintPage, type ClinicalPrintKind } from "./pages/clinical-print-page";
import type { PlatformPrincipal, TenantPrincipal, Workspace } from "./types";

function PlatformApplication({ pathname }: { pathname: string }) {
  const principal = useQuery({
    queryKey: ["platform-principal"],
    queryFn: () => getData<PlatformPrincipal>("/platform/auth/me"),
    retry: false,
  });
  useEffect(() => {
    if (principal.isLoading) return;
    if (principal.error || !principal.data) {
      if (pathname !== "/platform/login") navigate("/platform/login", true);
      return;
    }
    if (pathname === "/platform/login" || pathname === "/platform") {
      navigate(platformDashboardPath, true);
    }
  }, [pathname, principal.data, principal.error, principal.isLoading]);
  if (principal.isLoading) return <LoadingState label="Restoring platform session" />;
  if (principal.error || !principal.data) {
    return <PlatformLoginPage />;
  }
  if (pathname === "/platform/login" || pathname === "/platform") {
    return <LoadingState label="Opening platform dashboard" />;
  }
  let page: React.ReactNode = <PlatformOverviewPage principal={principal.data} />;
  if (pathname === "/platform/tenants") page = <PlatformTenantsPage principal={principal.data} />;
  else if (pathname === "/platform/tenants/new")
    page =
      principal.data.role === "SUPER_ADMIN" ? (
        <TenantOnboardingPage />
      ) : (
        <PlatformOverviewPage principal={principal.data} />
      );
  else if (/^\/platform\/tenants\/[^/]+$/.test(pathname))
    page = (
      <PlatformTenantDetailPage tenantId={pathname.split("/").at(-1)!} principal={principal.data} />
    );
  else if (pathname === "/platform/plans") page = <PlatformPlansPage principal={principal.data} />;
  else if (pathname === "/platform/support")
    page = <PlatformSupportPage principal={principal.data} />;
  else if (pathname === "/platform/administrators")
    page =
      principal.data.role === "SUPER_ADMIN" ? (
        <PlatformAdministratorsPage />
      ) : (
        <PlatformOverviewPage principal={principal.data} />
      );
  else if (pathname === "/platform/notifications")
    page =
      principal.data.role === "SUPER_ADMIN" ? (
        <PlatformBroadcastsPage />
      ) : (
        <PlatformOverviewPage principal={principal.data} />
      );
  else if (pathname === "/platform/settings")
    page = <PlatformSettingsPage principal={principal.data} />;
  else if (pathname === "/platform/audit")
    page =
      principal.data.role === "SUPER_ADMIN" ? (
        <PlatformAuditPage />
      ) : (
        <PlatformOverviewPage principal={principal.data} />
      );
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
  useEffect(() => {
    if (principal.isLoading) return;
    if (principal.error || !principal.data) {
      if (pathname !== "/login") navigate("/login", true);
      return;
    }
    if (pathname === "/login") navigate(tenantLandingPath(principal.data.role), true);
  }, [pathname, principal.data, principal.error, principal.isLoading]);
  const branch = useMemo(
    () => workspace.data?.branches.find((item) => item.id === branchId),
    [workspace.data, branchId],
  );
  if (principal.isLoading) return <LoadingState label="Restoring pharmacy session" />;
  if (principal.error || !principal.data) {
    return <TenantLoginPage />;
  }
  if (pathname === "/login") return <LoadingState label="Opening your workspace" />;
  if (workspace.isLoading) return <LoadingState label="Loading tenant workspace" />;
  if (workspace.error || !workspace.data) return <ErrorState error={workspace.error} />;
  if (!tenantRouteAllowed(principal.data.role, pathname)) {
    navigate(tenantLandingPath(principal.data.role), true);
    return <LoadingState label="Opening your authorized workspace" />;
  }
  let page: React.ReactNode = <DashboardPage branch={branch} workspace={workspace.data} />;
  const clinicalPrintMatch = pathname.match(
    /^\/clinic\/visits\/([^/]+)\/print\/(lab|consultation-receipt|lab-receipt)$/,
  );
  const clinicalVisitMatch = pathname.match(/^\/clinic\/visits\/([^/]+)$/);
  const doctorLabResultMatch = pathname.match(/^\/doctor\/visits\/([^/]+)\/lab-results$/);
  if (clinicalPrintMatch)
    page = (
      <ClinicalPrintPage
        visitId={clinicalPrintMatch[1]!}
        kind={clinicalPrintMatch[2] as ClinicalPrintKind}
        workspace={workspace.data}
        principal={principal.data}
      />
    );
  else if (clinicalVisitMatch)
    page = (
      <ClinicalVisitPage
        visitId={clinicalVisitMatch[1]!}
        workspace={workspace.data}
        principal={principal.data}
      />
    );
  else if (doctorLabResultMatch) page = <VisitLabResultsPage visitId={doctorLabResultMatch[1]!} />;
  else if (pathname === "/clinic") {
    navigate(tenantLandingPath(principal.data.role), true);
    page = <LoadingState label="Opening your role workspace" />;
  } else if (
    ["/doctor/dashboard", "/reception/dashboard", "/lab/dashboard", "/pharmacy/dashboard"].includes(
      pathname,
    )
  )
    page = <RoleDashboardPage branch={branch} principal={principal.data} />;
  else if (pathname === "/doctor/calendar") page = <DoctorCalendarPage branch={branch} />;
  else if (pathname === "/doctor/messages") page = <DoctorMessagesPage branch={branch} />;
  else if (
    [
      "/doctor/queue",
      "/doctor/active",
      "/doctor/lab-results",
      "/doctor/completed",
      "/doctor/patients",
      "/doctor/history",
    ].includes(pathname)
  ) {
    const modes: Record<string, DoctorWorkspaceMode> = {
      "/doctor/queue": "queue",
      "/doctor/active": "active",
      "/doctor/lab-results": "results",
      "/doctor/completed": "completed",
      "/doctor/patients": "patients",
      "/doctor/history": "history",
    };
    page = <DoctorWorkspacePage branch={branch} mode={modes[pathname]!} />;
  } else if (["/reception/visits", "/reception/patients"].includes(pathname))
    page = <ReceptionDeskPage branch={branch} workspace={workspace.data} />;
  else if (pathname === "/products")
    page = (
      <ProductsPage
        principal={principal.data}
        branch={branch}
        currency={workspace.data.tenant.currencyCode}
      />
    );
  else if (pathname === "/customers")
    page = <CustomersPage workspace={workspace.data} principal={principal.data} />;
  else if (pathname === "/suppliers") page = <SuppliersPage principal={principal.data} />;
  else if (
    [
      "/lab",
      "/lab/orders",
      "/lab/sample-collection",
      "/lab/results-entry",
      "/lab/completed",
    ].includes(pathname)
  ) {
    const labStages = {
      "/lab/sample-collection": "SAMPLE",
      "/lab/results-entry": "RESULTS",
      "/lab/completed": "COMPLETED",
    } as const;
    page = (
      <LabPage
        branch={branch}
        workspace={workspace.data}
        principal={principal.data}
        initialVisitStage={labStages[pathname as keyof typeof labStages] ?? "ALL"}
      />
    );
  } else if (pathname === "/inventory")
    page = <InventoryPage branch={branch} workspace={workspace.data} principal={principal.data} />;
  else if (pathname === "/sales" || pathname === "/invoices")
    page = (
      <SalesPage
        branch={branch}
        workspace={workspace.data}
        principal={principal.data}
        mode={pathname === "/invoices" ? "invoices" : "sales"}
      />
    );
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
