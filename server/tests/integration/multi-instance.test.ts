import express from "express";
import request from "supertest";

import { app } from "../../src/app";
import { startDraining } from "../../src/lib/lifecycle";
import { prisma, withPoolSize } from "../../src/lib/prisma";
import { createRateLimiter, resetAllRateLimits, sweepRateLimitBuckets, useRateLimitStore } from "../../src/lib/rate-limit";
import { claimScheduledRun, releaseScheduledRun } from "../../src/lib/scheduled-run";
import { hashPassword } from "../../src/lib/password";
import { createCustomerDirect } from "../helpers/test-auth";

/**
 * รองรับ API หลายตัวหลัง load balancer
 *
 * เฝ้า: ตัวนับ rate limit อยู่ใน DB (ทุกเครื่องเห็นเลขเดียวกัน แม้ยิงพร้อมกัน) · งานตามเวลาจองรอบได้
 * ตัวเดียว · ล็อกบัญชี/รหัสยืนยันอีเมลนับครบแม้ยิงพร้อมกัน · error ใน handler แบบ async ได้ 500 พร้อม
 * เลขอ้างอิง (ไม่ปิด process) · ขนาดพูล DB · ready ตอบ 503 ตอนกำลังปิด
 */
describe("ตัวนับ rate limit ร่วมใน DB", () => {
  beforeAll(() => useRateLimitStore("db"));
  afterAll(async () => {
    await resetAllRateLimits();
    useRateLimitStore("memory");
  });
  beforeEach(() => resetAllRateLimits());

  // limiter สองตัวที่ชื่อเดียวกัน = API สองเครื่องที่รันโค้ดเดียวกัน
  function instance() {
    const a = express();
    a.get("/x", createRateLimiter({ name: "mi-test", windowMs: 60_000, max: 3 }), (_req, res) => {
      res.json({ ok: true });
    });
    return a;
  }

  it("สองเครื่องนับรวมกัน — ครั้งที่ 4 โดน 429 ไม่ว่าจะไปตกเครื่องไหน", async () => {
    const a = instance();
    const b = instance();
    expect((await request(a).get("/x")).status).toBe(200);
    expect((await request(b).get("/x")).status).toBe(200);
    expect((await request(a).get("/x")).status).toBe(200);
    const blocked = await request(b).get("/x");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
  });

  it("ยิงพร้อมกัน 10 ครั้ง นับครบทุกครั้ง (ไม่มีการนับหายตอนชนกัน)", async () => {
    const a = instance();
    const statuses = await Promise.all(Array.from({ length: 10 }, () => request(a).get("/x").then((r) => r.status)));
    expect(statuses.filter((s) => s === 200)).toHaveLength(3);
    const row = await prisma.rateLimitBucket.findFirstOrThrow({ where: { key: { startsWith: "mi-test:" } } });
    expect(row.count).toBe(10);
  });

  it("รอบหมดแล้วเริ่มนับใหม่ และงานล้างลบแถวที่หมดรอบ", async () => {
    const a = instance();
    for (let i = 0; i < 4; i++) await request(a).get("/x");
    await prisma.rateLimitBucket.updateMany({
      where: { key: { startsWith: "mi-test:" } },
      data: { resetAt: new Date(Date.now() - 1_000) },
    });
    expect((await request(a).get("/x")).status).toBe(200);
    const row = await prisma.rateLimitBucket.findFirstOrThrow({ where: { key: { startsWith: "mi-test:" } } });
    expect(row.count).toBe(1);

    await prisma.rateLimitBucket.updateMany({
      where: { key: { startsWith: "mi-test:" } },
      data: { resetAt: new Date(Date.now() - 1_000) },
    });
    expect(await sweepRateLimitBuckets()).toBeGreaterThanOrEqual(1);
    expect(await prisma.rateLimitBucket.count({ where: { key: { startsWith: "mi-test:" } } })).toBe(0);
  });
});

describe("จองรอบงานตามเวลา", () => {
  const key = `test-run:${Date.now()}`;
  afterAll(() => prisma.scheduledRun.deleteMany({ where: { key: { startsWith: "test-run:" } } }));

  it("หลายเครื่องจองพร้อมกัน ได้ตัวเดียว · คืนรอบแล้วจองใหม่ได้", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => claimScheduledRun(key)));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimScheduledRun(key)).toBe(false);

    await releaseScheduledRun(key);
    expect(await claimScheduledRun(key)).toBe(true);
  });
});

describe("เพดานลองรหัสเมื่อยิงพร้อมกัน", () => {
  const emails: string[] = [];
  afterAll(() => prisma.user.deleteMany({ where: { email: { in: emails } } }));

  it("รหัสผิด 12 ครั้งพร้อมกัน ได้ลองจริงแค่ 5 — ที่เหลือโดนล็อกทันที และแจ้งเตือนครั้งเดียว", async () => {
    const c = await createCustomerDirect("mi-lock");
    emails.push(c.email);
    const statuses = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app).post("/api/auth/customer/login").send({ email: c.email, password: "wrong-password" }).then((r) => r.status),
      ),
    );
    expect(statuses.filter((s) => s === 401)).toHaveLength(5);
    expect(statuses.filter((s) => s === 423)).toHaveLength(7);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: c.userId } });
    expect(user.failedAttempts).toBe(5);
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    const notes = await prisma.notification.count({ where: { userId: c.userId, message: { contains: "ถูกล็อกชั่วคราว" } } });
    expect(notes).toBe(1);

    // ล็อกแล้วรหัสถูกก็เข้าไม่ได้
    const ok = await request(app).post("/api/auth/customer/login").send({ email: c.email, password: c.password });
    expect(ok.status).toBe(423);
  }, 30_000);

  it("รหัสถูกแต่ยังไม่ยืนยันอีเมล ไม่นับเป็นครั้งที่เดาผิด", async () => {
    const email = `mi-unverified-${Date.now()}@example.com`;
    emails.push(email);
    const password = "Amber-thicket-71-woodgrain";
    await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), fullName: "ยังไม่ยืนยัน", role: "CUSTOMER" },
    });
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post("/api/auth/customer/login").send({ email, password });
      expect(res.status).toBe(403);
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.failedAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
  }, 30_000);

  it("รหัสยืนยันอีเมลผิด 12 ครั้งพร้อมกัน ได้ลองจริงแค่ 5", async () => {
    const email = `mi-code-${Date.now()}@example.com`;
    emails.push(email);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("Amber-thicket-71-woodgrain"),
        fullName: "รอยืนยัน",
        role: "CUSTOMER",
        // แฮชที่ไม่ตรงกับรหัสไหนเลย — ทุกครั้งที่กรอกจึงผิด
        emailVerification: { create: { codeHash: "f".repeat(64), expiresAt: new Date(Date.now() + 600_000) } },
      },
    });
    const statuses = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app).post("/api/auth/customer/verify-email").send({ email, code: "123456" }).then((r) => r.status),
      ),
    );
    expect(statuses.filter((s) => s === 400)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(7);
    const row = await prisma.emailVerification.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.attempts).toBe(5);
  }, 30_000);
});

describe("error ใน handler แบบ async + เลขอ้างอิงคำขอ", () => {
  it("handler async ที่โยน error ไปถึงตัวจัดการ error (ได้ 500) แทนที่คำขอจะค้าง/process ดับ", async () => {
    // app.ts import lib/async-errors ไปแล้ว — แก้ที่ prototype ของ Express จึงมีผลกับแอปใหม่ตรงนี้ด้วย
    const a = express();
    a.get("/boom", async () => {
      await Promise.resolve();
      throw new Error("ทดสอบ: DB สะดุด");
    });
    a.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: String(err) });
    });
    const res = await request(a).get("/boom").timeout(5_000);
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("DB สะดุด");
  });

  it("ทุกคำตอบมี X-Request-Id · ใช้เลขจาก nginx ถ้ารูปแบบปลอดภัย · ค่าแปลกปลอมถูกแทนด้วยเลขใหม่", async () => {
    const own = await request(app).get("/api/health");
    expect(own.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

    const fromLb = await request(app).get("/api/health").set("X-Request-Id", "0123456789abcdef0123456789abcdef");
    expect(fromLb.headers["x-request-id"]).toBe("0123456789abcdef0123456789abcdef");

    const injected = await request(app).get("/api/health").set("X-Request-Id", "x FAKE LOG LINE level=error");
    expect(injected.headers["x-request-id"]).not.toContain("FAKE");
    expect(injected.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ตัวจัดการ error ของ app ตอบ 500 พร้อมเลขเดียวกับ header", async () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    // จำลอง DB สะดุดกลางคำขอจริง — ต้องไปตกตัวจัดการรวม แนบ requestId และพิมพ์ log พร้อมเลขอ้างอิง
    const dbSpy = jest.spyOn(prisma.user, "findUnique").mockRejectedValueOnce(new Error("ทดสอบ: DB สะดุด"));
    try {
      await resetAllRateLimits(); // เคสเพดานล็อกอินข้างบนใช้โควตาไอพีนี้ไปหมดแล้ว
      const res = await request(app)
        .post("/api/auth/staff/login")
        .set("X-Request-Id", "req-test-12345678")
        .send({ username: "nobody", password: "x" });
      expect(res.status).toBe(500);
      expect(res.body.requestId).toBe("req-test-12345678");
      expect(res.body.error).toContain("รหัสอ้างอิง req-test");
      expect(errSpy.mock.calls.some((c) => String(c[0]).includes("[req-test-12345678]"))).toBe(true);
    } finally {
      dbSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it("คำขอผิดรูปแบบจาก body-parser (JSON พัง / ใหญ่เกิน) ตอบ 4xx ตาม status เดิม ไม่ใช่ 500", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const broken = await request(app)
        .post("/api/auth/staff/login")
        .set("Content-Type", "application/json")
        .set("X-Request-Id", "req-test-12345678")
        .send("{not json");
      expect(broken.status).toBe(400);
      expect(broken.body).toEqual({ error: "รูปแบบข้อมูลไม่ถูกต้อง", requestId: "req-test-12345678" });
      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes("[req-test-12345678]"))).toBe(true);

      const huge = await request(app)
        .post("/api/auth/staff/login")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ username: "a".repeat(200_000), password: "x" }));
      expect(huge.status).toBe(413);
      expect(huge.body.error).toBe("ข้อมูลที่ส่งมามีขนาดใหญ่เกินกำหนด");
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("ขนาดพูลการเชื่อมต่อ DB", () => {
  const base = "postgresql://u:p@localhost:5432/db";
  it("ตั้ง DATABASE_POOL_SIZE แล้วใส่ connection_limit · ค่าใน URL ชนะ · ค่าไม่ใช่จำนวนเต็มบวก = บูตไม่ขึ้น", () => {
    expect(withPoolSize(base, undefined)).toBe(base);
    expect(new URL(withPoolSize(base, "8")).searchParams.get("connection_limit")).toBe("8");
    expect(withPoolSize(`${base}?connection_limit=3`, "8")).toBe(`${base}?connection_limit=3`);
    expect(() => withPoolSize(base, "0")).toThrow("DATABASE_POOL_SIZE");
    expect(() => withPoolSize(base, "abc")).toThrow("DATABASE_POOL_SIZE");
  });
});

describe("ตรวจสุขภาพสำหรับ load balancer", () => {
  it("health ตอบ ok · ready เช็ค DB แล้วตอบ ready · กำลังปิด = 503 + Connection: close", async () => {
    expect((await request(app).get("/api/health")).body).toEqual({ status: "ok" });
    const ready = await request(app).get("/api/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: "ready" });
    expect(ready.headers["cache-control"]).toBe("no-store");

    // ต้องเป็นข้อสุดท้ายของไฟล์ — สถานะ draining ย้อนกลับไม่ได้ (แต่ละไฟล์เทสต์โหลดโมดูลใหม่)
    startDraining();
    const draining = await request(app).get("/api/health/ready");
    expect(draining.status).toBe(503);
    expect(draining.body).toEqual({ status: "draining" });
    expect(draining.headers.connection).toBe("close");
  });
});
