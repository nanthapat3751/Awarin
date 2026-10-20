import type { NextFunction, Request, Response } from "express";

import { prisma } from "./prisma";

/**
 * ตัวจำกัดอัตราแบบหน้าต่างคงที่ (fixed window) ต่อไอพี
 *
 * ตัวนับเก็บในตาราง RateLimitBucket เป็นค่าเริ่มต้น — API หลายตัวหลัง load balancer ต้องนับร่วมกัน
 * ถ้าแต่ละตัวนับของตัวเอง เพดานกันเดารหัสผ่าน 20 ครั้งจะกลายเป็น 20 × จำนวนเครื่อง และคนยิงแค่
 * กระจายคำขอให้โดนหลายตัวก็หลุดเพดานไปเอง
 *
 * RATE_LIMIT_STORE=memory ใช้ตัวนับในหน่วยความจำแบบเดิม — สำหรับเทสต์ (แต่ละไฟล์เริ่มนับใหม่
 * เหมือนเดิม) หรือเครื่องที่รันตัวเดียว ห้ามใช้ตอนมีหลายตัว
 */
export interface RateLimitHit {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  /** นับคำขอนี้หนึ่งครั้ง แล้วคืนจำนวนในรอบปัจจุบัน (รวมครั้งนี้) กับเวลาที่รอบหมด */
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
  clear(): Promise<void>;
}

class MemoryStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitHit>();

  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }
    bucket.count += 1;
    return { ...bucket };
  }

  async clear(): Promise<void> {
    this.buckets.clear();
  }
}

/**
 * นับด้วย upsert คำสั่งเดียว — Postgres ล็อกแถวให้ คำขอที่มาพร้อมกันจากหลายเครื่องจึงนับครบทุกครั้ง
 * (อ่านค่าแล้วค่อยเขียนกลับเป็นสองคำสั่งจะนับหายตอนชนกัน)
 * รอบหมดแล้ว = เริ่มนับ 1 ใหม่พร้อมเวลาหมดรอบใหม่ · ยังไม่หมด = +1 โดยเวลาหมดรอบคงเดิม
 * เวลาเป็น UTC เพราะคอลัมน์ไม่มีโซนเวลา (Prisma อ่านเป็น UTC) — now() เฉย ๆ ขึ้นกับ TimeZone ของ DB
 */
class PostgresStore implements RateLimitStore {
  async hit(key: string, windowMs: number): Promise<RateLimitHit> {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${windowMs / 1000}))
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= (now() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= (now() AT TIME ZONE 'UTC') THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    const row = rows[0];
    return { count: Number(row.count), resetAt: row.resetAt.getTime() };
  }

  async clear(): Promise<void> {
    await prisma.rateLimitBucket.deleteMany({});
  }
}

function storeFromEnv(): RateLimitStore {
  return (process.env.RATE_LIMIT_STORE ?? "db").toLowerCase() === "memory" ? new MemoryStore() : new PostgresStore();
}

let store: RateLimitStore = storeFromEnv();

/** สลับที่เก็บ — เทสต์ใช้ทดสอบ PostgresStore ตรง ๆ (ค่าเริ่มต้นของเทสต์คือ memory) */
export function useRateLimitStore(kind: "db" | "memory"): void {
  store = kind === "memory" ? new MemoryStore() : new PostgresStore();
}

/**
 * ล้างตัวนับของ limiter ทุกตัว — **สำหรับเทสต์เท่านั้น**
 *
 * เทสต์ทั้งไฟล์ยิงมาจากไอพีเดียวกันหมด ชุดที่ต้องเรียกปลายทางเดิมเกินเพดาน (เช่น ลืมรหัสผ่าน
 * 10 ครั้ง/ชม.) จะโดนตัวเองเตะเป็น 429 ตั้งแต่กลางไฟล์ แล้วขึ้นเป็นความล้มเหลวที่อ่านไม่ออกว่า
 * สาเหตุคือ rate limit · เรียกตัวนี้ใน beforeEach แล้วเขียนเทสต์แยกหนึ่งข้อไว้ยืนยันว่าเพดานยังทำงาน
 */
export async function resetAllRateLimits(): Promise<void> {
  await store.clear();
}

/** ลบแถวที่หมดรอบแล้ว — เรียกจากงานล้างรายวัน (แถวที่หมดรอบไม่มีผลกับการนับอยู่แล้ว แค่กินที่) */
export async function sweepRateLimitBuckets(): Promise<number> {
  const { count } = await prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date() } } });
  return count;
}

/** `name` ต้องไม่ซ้ำกันทั้งระบบ — เป็นส่วนหนึ่งของ key ในตารางที่ทุก limiter ใช้ร่วมกัน */
export function createRateLimiter(options: { name: string; windowMs: number; max: number }) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let hit: RateLimitHit;
    try {
      hit = await store.hit(`${options.name}:${req.ip ?? "unknown"}`, options.windowMs);
    } catch (err) {
      // ที่เก็บตัวนับล่ม (DB ล่ม) — ปล่อยผ่าน ไม่ปิดทั้งระบบเพราะตัวนับ การล็อกบัญชีรายบัญชี
      // ยังกันเดารหัสผ่านอยู่ และถ้า DB ล่มจริงคำขอก็ไปไม่ถึงไหนอยู่ดี
      console.error(`rate-limit(${options.name}): นับไม่ได้ ปล่อยผ่าน:`, err);
      next();
      return;
    }

    if (hit.count > options.max) {
      // บอกด้วยว่าต้องรออีกกี่วินาที — ข้อความ "ลองใหม่ภายหลัง" เฉย ๆ ทำให้ผู้ใช้กดซ้ำไปเรื่อย ๆ
      // โดยไม่รู้ว่าอีกนานแค่ไหน · ใช้รูปแบบเดียวกับ 423 ตอนบัญชีถูกล็อก (header มาตรฐาน + ค่าในเนื้อ
      // ให้หน้าเว็บเอาไปแสดงเป็นเวลาได้)
      const retryAfter = Math.max(1, Math.ceil((hit.resetAt - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "มีการร้องขอมากเกินไป กรุณาลองใหม่ภายหลัง", retryAfter });
      return;
    }

    next();
  };
}
