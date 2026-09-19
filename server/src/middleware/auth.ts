import type { NextFunction, Request, Response } from "express";

import { resolveCookieName } from "../lib/session-cookie";
import { resolveSession } from "../modules/auth/auth.service";

/** แนบ req.user เมื่อมี session cookie ที่ถูกต้อง ไม่มีการปฏิเสธ request ในตัวมันเอง */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cookieName = resolveCookieName(req.headers.origin, req.cookies ?? {}, req.path);
  const token = req.cookies?.[cookieName] as string | undefined;
  if (token) {
    const user = await resolveSession(token);
    if (user) {
      req.user = user;
      req.sessionId = token;
      req.authCookieName = cookieName;
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "ต้องเข้าสู่ระบบก่อนใช้งาน" });
    return;
  }
  next();
}
