import type { NextFunction, Request, Response } from "express";

import type { Role } from "@systemboq/shared-types";

/** ต้องรันหลัง requireAuth เช่น BR-09: ข้อมูลต้นทุน/กำไรเป็นของ OWNER/ADMIN เท่านั้น */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "ต้องเข้าสู่ระบบก่อนใช้งาน" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูลนี้" });
      return;
    }
    next();
  };
}
