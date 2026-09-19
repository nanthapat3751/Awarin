import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * ตัวจำกัดอัตราแบบ sliding-window เก็บในหน่วยความจำแบบง่าย ๆ เพียงพอสำหรับเป้าหมายที่รัน
 * process เดียว (dev/ติดตั้งขนาดเล็ก); ถ้ามีมากกว่า 1 instance จะต้องใช้ที่เก็บกลางร่วมกัน (Redis)
 */
export function createRateLimiter(options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      res.status(429).json({ error: "มีการร้องขอมากเกินไป กรุณาลองใหม่ภายหลัง" });
      return;
    }

    bucket.count += 1;
    next();
  };
}
