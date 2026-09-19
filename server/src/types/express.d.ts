import type { AuthenticatedUser } from "@systemboq/shared-types";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
      authCookieName?: string;
    }
  }
}

export {};
