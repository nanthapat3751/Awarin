import type { AuthenticatedUser } from "@systemboq/shared-types";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      sessionId?: string;
      authCookieName?: string;
      /** เลขอ้างอิงคำขอ (ดู lib/request-id.ts) — ตรงกับ X-Request-Id ใน log ของ nginx */
      requestId?: string;
    }
  }
}

export {};
