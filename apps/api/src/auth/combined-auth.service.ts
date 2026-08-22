import {
  supportAccessService,
  type SupportAccessService,
} from "../platform/support-access.service.js";
import { authService } from "./auth.service.js";
import type {
  AuthenticatedPrincipal,
  AuthService,
  ChangePasswordInput,
  LoginInput,
  LoginResult,
  UpdateProfileInput,
} from "./auth.types.js";
import { AppError } from "../errors/app-error.js";

export class CombinedAuthService implements AuthService {
  constructor(
    private readonly tenantAuth: AuthService,
    private readonly supportAuth: SupportAccessService,
  ) {}

  login(input: LoginInput): Promise<LoginResult> {
    return this.tenantAuth.login(input);
  }

  async authenticate(rawSessionToken: string | undefined): Promise<AuthenticatedPrincipal | null> {
    if (rawSessionToken?.startsWith("support.")) {
      return this.supportAuth.authenticate(rawSessionToken);
    }
    return this.tenantAuth.authenticate(rawSessionToken);
  }

  async logout(rawSessionToken: string | undefined): Promise<void> {
    if (rawSessionToken?.startsWith("support.")) {
      await this.supportAuth.logout(rawSessionToken);
      return;
    }
    await this.tenantAuth.logout(rawSessionToken);
  }

  updateProfile(principal: AuthenticatedPrincipal, input: UpdateProfileInput) {
    this.requireWritableTenantSession(principal);
    return this.tenantAuth.updateProfile(principal, input);
  }

  changePassword(principal: AuthenticatedPrincipal, input: ChangePasswordInput) {
    this.requireWritableTenantSession(principal);
    return this.tenantAuth.changePassword(principal, input);
  }

  private requireWritableTenantSession(principal: AuthenticatedPrincipal) {
    if (principal.isSupportSession) {
      throw new AppError({
        statusCode: 403,
        code: "SUPPORT_SESSION_READ_ONLY",
        message: "Support sessions cannot change tenant account information",
      });
    }
  }
}

export const combinedAuthService = new CombinedAuthService(authService, supportAccessService);
