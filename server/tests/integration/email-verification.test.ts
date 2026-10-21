import request from "supertest";

import { app } from "../../src/app";
import * as mailer from "../../src/lib/mailer";
import { clearOutbox, lastMailTo } from "../../src/lib/mailer";
import { prisma } from "../../src/lib/prisma";
import { resetAllRateLimits } from "../../src/lib/rate-limit";

/**
 * ยืนยันอีเมลด้วยรหัส 6 หลัก — เดินครบทุกขั้นเหมือนของจริง
 *
 * โหมดเมลตอนเทสต์เป็น "silent" (tests/setup-env.ts) ไม่ส่งออกไปจริง แต่เก็บฉบับล่าสุดไว้ใน
 * outbox ให้อ่านรหัสออกมาได้ — ฐานข้อมูลเก็บแต่แฮชของรหัส อ่านย้อนไม่ได้โดยตั้งใจ
 */
describe("customer email verification", () => {
  const runId = Date.now();
  const password = "Saffron-brook-64-glasswing";
  const createdEmails: string[] = [];

  beforeEach(() => clearOutbox());

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.$disconnect();
  });

  async function registerFresh(tag: string) {
    const email = `verify-${tag}-${runId}@gmail.com`;
    createdEmails.push(email);
    const res = await request(app)
      .post("/api/auth/customer/register")
      .send({ email, password, fullName: "ทดสอบ ยืนยัน", phone: "0812345678" });
    expect(res.status).toBe(201);
    return email;
  }

  /** ดึงรหัส 6 หลักออกจากเมลที่ส่งไป */
  function codeFrom(email: string): string {
    const mail = lastMailTo(email);
    expect(mail).toBeDefined();
    const found = /\b(\d{6})\b/.exec(mail!.text);
    expect(found).not.toBeNull();
    return found![1];
  }

  it("sends a code on registration and only lets the account in after it is entered", async () => {
    const email = await registerFresh("happy");

    // ส่งรหัสไปที่อีเมลนั้นจริง (ไม่ใช่อีเมลอื่น) และรหัสไม่ได้อยู่ในคำตอบของ API
    const mail = lastMailTo(email);
    expect(mail).toBeDefined();
    expect(mail!.subject).toContain("รหัสยืนยัน");

    // ก่อนยืนยัน: เข้าไม่ได้ แม้รหัสผ่านถูก
    const blocked = await request(app)
      .post("/api/auth/customer/login")
      .send({ email, password });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toContain("ยืนยันอีเมล");

    const verified = await request(app)
      .post("/api/auth/customer/verify-email")
      .send({ email, code: codeFrom(email) });
    expect(verified.status).toBe(200);

    // หลังยืนยัน: เข้าได้
    const ok = await request(app).post("/api/auth/customer/login").send({ email, password });
    expect(ok.status).toBe(200);

    // รหัสถูกลบทิ้งหลังใช้ — ใช้ซ้ำไม่ได้
    const row = await prisma.user.findUnique({
      where: { email },
      select: { emailVerifiedAt: true, emailVerification: true },
    });
    expect(row?.emailVerifiedAt).not.toBeNull();
    expect(row?.emailVerification).toBeNull();
  });

  it("does not put the code in the API response — only in the email", async () => {
    const email = `peek-${runId}@gmail.com`;
    createdEmails.push(email);
    const res = await request(app)
      .post("/api/auth/customer/register")
      .send({ email, password, fullName: "ทดสอบ ยืนยัน", phone: "0812345678" });

    const code = codeFrom(email);
    expect(JSON.stringify(res.body)).not.toContain(code);
  });

  it("rejects a wrong code and stops guessing after 5 tries", async () => {
    const email = await registerFresh("guess");
    const real = codeFrom(email);
    const wrong = real === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/customer/verify-email")
        .send({ email, code: wrong });
      expect(res.status).toBe(400);
    }

    // ครั้งที่ 6 ปิดประตู — และรหัสที่ถูกต้องก็ใช้ไม่ได้แล้ว ต้องขอใหม่
    const locked = await request(app)
      .post("/api/auth/customer/verify-email")
      .send({ email, code: real });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toContain("ขอรหัสใหม่");
  });

  it("refuses an expired code", async () => {
    const email = await registerFresh("expired");
    const code = codeFrom(email);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    await prisma.emailVerification.update({
      where: { userId: user!.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post("/api/auth/customer/verify-email")
      .send({ email, code });
    expect(res.status).toBe(400);
  });

  it("holds resend for a minute so nobody can use us to flood an inbox", async () => {
    const email = await registerFresh("resend");

    const tooSoon = await request(app)
      .post("/api/auth/customer/verify-email/resend")
      .send({ email });
    expect(tooSoon.status).toBe(200);
    expect(tooSoon.body.sent).toBe(false);
    expect(tooSoon.body.retryAfterSeconds).toBeGreaterThan(0);

    // พ้นช่วงพักแล้วขอใหม่ได้ และได้รหัสคนละตัวกับของเดิม
    const first = codeFrom(email);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    await prisma.emailVerification.update({
      where: { userId: user!.id },
      data: { sentAt: new Date(Date.now() - 90_000) },
    });
    const again = await request(app)
      .post("/api/auth/customer/verify-email/resend")
      .send({ email });
    expect(again.body.sent).toBe(true);

    // รหัสเดิมใช้ไม่ได้แล้ว (ถูกทับ) รหัสใหม่ใช้ได้
    const stale = await request(app)
      .post("/api/auth/customer/verify-email")
      .send({ email, code: first });
    expect(stale.status).toBe(400);
    const fresh = await request(app)
      .post("/api/auth/customer/verify-email")
      .send({ email, code: codeFrom(email) });
    expect(fresh.status).toBe(200);
  });

  it("sends a single code when many resend requests arrive at once", async () => {
    // ช่วงพักต้องกันคำขอที่มาพร้อมกันได้ด้วย — เดิมทุกคำขออ่านรหัสเดิมพร้อมกันแล้วส่งคนละฉบับ (BUG-API-006)
    const email = await registerFresh("burst");
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    await prisma.emailVerification.update({
      where: { userId: user!.id },
      data: { sentAt: new Date(Date.now() - 90_000) },
    });
    await resetAllRateLimits(); // เพดานขอรหัสใหม่ 10 ครั้ง/ชั่วโมง/ไอพี — เคสข้างบนใช้ไปแล้วบางส่วน
    const spy = jest.spyOn(mailer, "sendMail");
    try {
      const answers = await Promise.all(
        Array.from({ length: 10 }, () => request(app).post("/api/auth/customer/verify-email/resend").send({ email })),
      );
      expect(answers.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(answers.filter((r) => r.body.sent === true)).toHaveLength(1);
      expect(spy.mock.calls.filter(([m]) => m.to === email)).toHaveLength(1);
    } finally {
      spy.mockRestore();
      await resetAllRateLimits(); // คืนโควตาที่เคสนี้ใช้ไป 10 ครั้ง ให้เคสถัดไป
    }
  });

  it("answers the same way for an email that has no pending account", async () => {
    // ปลายทางขอรหัสใหม่ต้องไม่กลายเป็นเครื่องมือไล่ถามว่าอีเมลไหนสมัครไว้แล้ว
    const res = await request(app)
      .post("/api/auth/customer/verify-email/resend")
      .send({ email: `nobody-${runId}@gmail.com` });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(lastMailTo(`nobody-${runId}@gmail.com`)).toBeUndefined();
  });

  it("leaves staff-created accounts alone — they log in without a code", async () => {
    // ลิงก์เข้าใช้ถูกส่งทาง LINE/โทรศัพท์ ไม่ได้ส่งทางเมล บังคับยืนยันจะพังขั้นตอนที่ใช้อยู่จริง
    const email = `staff-made-${runId}@gmail.com`;
    createdEmails.push(email);
    const { hashPassword } = await import("../../src/lib/password");
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        fullName: "ลูกค้า ทีมงานสร้างให้",
        role: "CUSTOMER",
        emailVerifiedAt: new Date(),
        customerProfile: { create: { phone: "0812345678" } },
      },
    });

    const res = await request(app).post("/api/auth/customer/login").send({ email, password });
    expect(res.status).toBe(200);
  });
});
