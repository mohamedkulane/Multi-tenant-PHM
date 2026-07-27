import {
  supportAccessService,
  type SupportAccessService,
} from "../platform/support-access.service.js";
import { authService } from "./auth.service.js";
import type { AuthenticatedPrincipal, AuthService, LoginInput, LoginResult } from "./auth.types.js";

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
}

export const combinedAuthService = new CombinedAuthService(authService, supportAccessService);
