export interface TenantPrincipal {
  sessionId: string;
  tenantId: string;
  tenantName: string;
  userId: string;
  fullName: string;
  membershipId: string;
  username: string;
  role: string;
  allBranches: boolean;
  branchIds: string[];
  isSupportSession?: boolean;
}

export interface PlatformPrincipal {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  role: "SUPER_ADMIN" | "SUPPORT" | "AUDITOR";
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  timezone: string;
  active: boolean;
  phone?: string | null;
}

export interface Workspace {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    planCode: string;
    timezone: string;
    currencyCode: string;
  };
  branches: Branch[];
  branding?: {
    displayName: string;
    logoUrl?: string;
    primaryColor: string;
    accentColor: string;
    invoiceFooter?: string | null;
    supportContact?: string | null;
  } | null;
  subscription?: {
    planCode: string;
    overrides: Record<string, number>;
  } | null;
}
