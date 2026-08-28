import type { PlatformRole } from "@prisma/client";

export interface PlatformPrincipal {
  emailVerified?: boolean;
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  role: PlatformRole;
}

export interface PlatformLoginInput {
  email: string;
  password: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface PlatformAuthService {
  login(input: PlatformLoginInput): Promise<{
    sessionToken: string;
    expiresAt: Date;
    principal: PlatformPrincipal;
  }>;
  authenticate(rawToken: string | undefined): Promise<PlatformPrincipal | null>;
  logout(rawToken: string | undefined): Promise<void>;
}
