import type { TenantRole } from "@prisma/client";

export interface LoginInput {
  tenantSlug: string;
  username: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticatedPrincipal {
  sessionId: string;
  tenantId: string;
  tenantName: string;
  userId: string;
  fullName: string;
  email?: string | null;
  membershipId: string;
  username: string;
  role: TenantRole;
  allBranches: boolean;
  branchIds: string[];
  isSupportSession?: boolean;
  supportSessionId?: string;
}

export interface UpdateProfileInput {
  fullName: string;
  email?: string | undefined;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface LoginResult {
  sessionToken: string;
  expiresAt: Date;
  principal: AuthenticatedPrincipal;
}

export interface AuthService {
  login(input: LoginInput): Promise<LoginResult>;
  authenticate(rawSessionToken: string | undefined): Promise<AuthenticatedPrincipal | null>;
  logout(rawSessionToken: string | undefined): Promise<void>;
  updateProfile(
    principal: AuthenticatedPrincipal,
    input: UpdateProfileInput,
  ): Promise<AuthenticatedPrincipal>;
  changePassword(
    principal: AuthenticatedPrincipal,
    input: ChangePasswordInput,
  ): Promise<{ changed: true }>;
}
