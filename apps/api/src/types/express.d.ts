import type { AuthenticatedPrincipal } from "../auth/auth.types.js";
import type { PlatformPrincipal } from "../platform/platform-auth.types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedPrincipal;
      platformAuth?: PlatformPrincipal;
    }
  }
}

export {};
