import crypto from "node:crypto";

import request from "supertest";

import { app } from "../../src/app";
import { clearOutbox, lastMailTo } from "../../src/lib/mailer";
import { hashPassword } from "../../src/lib/password";
import { resetAllRateLimits } from "../../src/lib/rate-limit";
import { prisma } from "../../src/lib/prisma";

/**
 * ลืมรหัสผ่าน / ตั้งรหัสผ่านใหม่ — เน้นคุณสมบัติด้านความปลอดภัย ไม่ใช่แค่ "ทางสุขใจ" ทางเดียว
 *
 * โหมดเมลตอนเทสต์เป็น "silent" (tests/setup-env.ts) ไม่ส่งออกไปจริง แต่เก็บฉบับล่าสุดไว้ใน outbox
 * ให้ดึงลิงก์ออกมาได้ — ฐานข้อมูลเก็บแต่แฮชของ token อ่านย้อนไม่ได้โดยตั้งใจ
 */
describe("customer password reset", () => {
  const runId = Date.now();
  const password = "Indigo-marble-26-stormlace";
  const newPassword = "Walnut-ember-95-tidepool";
  const createdIds: string[] = [];

  beforeEach(async () => {
    clearOutbox();
    // เทสต์ทั้งไฟล์มาจากไอพีเดียวกัน ถ้าไม่ล้างตัวนับ ข้อที่ 11 เป็นต้นไปจะโดนเพดาน
    // เพดาน 20 ครั้ง/15 นาที ของตัวเองเตะเป็น 429 (เพดานยังทำงานจริง — มีเทสต์แยกยืนยันข้างล่าง)
    await resetAllRateLimits();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  async function makeCustomer(tag: string, overrides: Record<string, unknown> = {}) {
    const email = `reset-${tag}-${runId}@gmail.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        fullName: "ทดสอบ ลืมรหัส",
        role: "CUSTOMER",
        emailVerifiedAt: new Date(),
        customerProfile: { create: { phone: "0812345678" } },
        ...overrides,
      },
    });
    createdIds.push(user.id);
    return { email, id: user.id };
  }

  /**
   * ขอลิงก์ แล้วรอให้งานเบื้องหลังเดินจบ
   *
   * ปลายทางนี้ตอบ 200 ทันทีแล้วค่อยหาบัญชี/ส่งเมลทีหลัง (ตั้งใจ — ถ้ารอส่งเมลเสร็จค่อยตอบ
   * คำขอที่มีบัญชีจริงจะช้ากว่าอย่างเห็นได้ชัด กลายเป็นบอกใบ้ว่าอีเมลไหนมีบัญชี) เทสต์จึงต้อง
   * หน่วงก่อนอ่าน outbox ไม่งั้นจะอ่านตอนที่เมลยังไม่ถูกส่ง
   */
  const ask = async (email: string) => {
    const res = await request(app).post("/api/auth/customer/forgot-password").send({ email });
    await new Promise((r) => setTimeout(r, 150));
    return res;
  };

  /** ดึง token ออกจากลิงก์ในอีเมลที่ส่งไป */
  function tokenFrom(email: string): string {
    const mail = lastMailTo(email);
    expect(mail).toBeDefined();
    const found = /\/reset-password\/([A-Za-z0-9_-]+)/.exec(mail!.text);
    expect(found).not.toBeNull();
    return found![1];
  }

  // ── ไม่บอกว่าอีเมลไหนมีบัญชี ──

  it("answers identically whether the account exists or not", async () => {
    const { email } = await makeCustomer("exists");
    const real = await ask(email);
    clearOutbox();
    const fake = await ask(`nobody-${runId}@gmail.com`);

    expect(real.status).toBe(fake.status);
    expect(real.body).toEqual(fake.body);
    // และไม่มีเมลออกไปหาอีเมลที่ไม่มีบัญชี
    expect(lastMailTo(`nobody-${runId}@gmail.com`)).toBeUndefined();
  });

  it("never sends a reset link to a staff account", async () => {
    // พนักงานล็อกอินด้วย username ถ้าเปิดทางนี้ไว้ อีเมลจะกลายเป็นกุญแจสำรองของบัญชีพนักงาน
    const email = `reset-staff-${runId}@gmail.com`;
    const staff = await prisma.user.create({
      data: {
        email,
        username: `reset-staff-${runId}`,
        passwordHash: await hashPassword(password),
        fullName: "ทดสอบ พนักงาน",
        role: "ADMIN",
      },
    });
    createdIds.push(staff.id);

    const res = await ask(email);
    expect(res.status).toBe(200);
    expect(lastMailTo(email)).toBeUndefined();
  });

  it("never sends a reset link to a deactivated account", async () => {
    const { email } = await makeCustomer("inactive", { active: false });
    await ask(email);
    expect(lastMailTo(email)).toBeUndefined();
  });

  it("holds a minute between links so nobody can flood an inbox", async () => {
    const { email } = await makeCustomer("cooldown");
    await ask(email);
    expect(lastMailTo(email)).toBeDefined();

    clearOutbox();
    await ask(email);
    expect(lastMailTo(email)).toBeUndefined();
  });

  // ── ตัว token เอง ──

  it("stores only a hash of the token, never the token itself", async () => {
    const { email, id } = await makeCustomer("hash");
    await ask(email);
    const raw = tokenFrom(email);

    const row = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: id } });
    expect(row.tokenHash).not.toBe(raw);
    expect(row.tokenHash).toBe(crypto.createHash("sha256").update(raw).digest("hex"));
    expect(row.tokenHash).toHaveLength(64);
  });

  it("keeps only one usable link — asking again kills the previous one", async () => {
    const { email, id } = await makeCustomer("single");
    await ask(email);
    const first = tokenFrom(email);

    // ย้อนเวลาที่ขอครั้งก่อนให้พ้นช่วงพัก แล้วขอใหม่
    await prisma.passwordResetToken.updateMany({
      where: { userId: id },
      data: { createdAt: new Date(Date.now() - 90_000) },
    });
    clearOutbox();
    await ask(email);
    const second = tokenFrom(email);
    expect(second).not.toBe(first);

    const stale = await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token: first, password: newPassword });
    expect(stale.status).toBe(400);
    expect(await prisma.passwordResetToken.count({ where: { userId: id } })).toBe(1);
  });

  it("does not burn the link just by opening it (mail scanners prefetch links)", async () => {
    const { email } = await makeCustomer("prefetch");
    await ask(email);
    const token = tokenFrom(email);

    for (let i = 0; i < 3; i++) {
      const peek = await request(app).get(`/api/auth/customer/reset-password/${token}`);
      expect(peek.status).toBe(200);
      // อีเมลถูกปิดบางส่วน ไม่ส่งอีเมลเต็มออกไปกับ URL ที่อาจหลุด
      expect(peek.body.maskedEmail).toContain("•");
      expect(peek.body.maskedEmail).not.toBe(email);
    }

    const used = await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token, password: newPassword });
    expect(used.status).toBe(200);
  });

  it("refuses a made-up token and an expired one", async () => {
    const bogus = await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token: crypto.randomBytes(32).toString("base64url"), password: newPassword });
    expect(bogus.status).toBe(400);

    const { email, id } = await makeCustomer("expired");
    await ask(email);
    const token = tokenFrom(email);
    await prisma.passwordResetToken.updateMany({
      where: { userId: id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const late = await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token, password: newPassword });
    expect(late.status).toBe(400);
  });

  it("refuses a password that is too short", async () => {
    const { email } = await makeCustomer("short");
    await ask(email);
    const res = await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token: tokenFrom(email), password: "sho" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("8 ตัวอักษร");
  });

  // ── ผลของการตั้งรหัสใหม่ ──

  it("swaps the password, is single use, and hands out no session", async () => {
    const { email, id } = await makeCustomer("happy");
    await ask(email);
    const token = tokenFrom(email);

    const done = await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token, password: newPassword });
    expect(done.status).toBe(200);
    // ตั้งใจไม่ออก session — คนที่อ่านอีเมลได้ต้องไม่ได้ session ติดมือจากการกดลิงก์
    expect(done.headers["set-cookie"]).toBeUndefined();

    const oldPw = await request(app)
      .post("/api/auth/customer/login")
      .send({ email, password });
    expect(oldPw.status).toBe(401);

    const newPw = await request(app)
      .post("/api/auth/customer/login")
      .send({ email, password: newPassword });
    expect(newPw.status).toBe(200);

    // ใช้ซ้ำไม่ได้ และไม่มีแถวค้างในฐานข้อมูล
    const again = await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token, password: "Cobalt-fern-38-driftwood" });
    expect(again.status).toBe(400);
    expect(await prisma.passwordResetToken.count({ where: { userId: id } })).toBe(0);
  });

  it("logs every existing device out", async () => {
    const { email } = await makeCustomer("sessions");
    const agent = request.agent(app);
    const before = await agent.post("/api/auth/customer/login").send({ email, password });
    expect(before.status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(200);

    await ask(email);
    await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token: tokenFrom(email), password: newPassword });

    // คุกกี้เดิมยังอยู่ในมือ แต่ต้องใช้ไม่ได้แล้ว
    expect((await agent.get("/api/auth/me")).status).toBe(401);
  });

  it("unlocks an account that got locked out by wrong-password attempts", async () => {
    // คนที่ลืมรหัสจนโดนล็อกคือกลุ่มที่ต้องใช้ฟีเจอร์นี้มากที่สุด ถ้าตั้งรหัสใหม่แล้วยังเข้าไม่ได้
    // เพราะยังติดล็อกอยู่ ก็เท่ากับฟีเจอร์นี้แก้ปัญหาไม่ได้เลย
    const { email, id } = await makeCustomer("locked");
    await prisma.user.update({
      where: { id },
      data: { failedAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) },
    });

    await ask(email);
    await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token: tokenFrom(email), password: newPassword });

    const res = await request(app)
      .post("/api/auth/customer/login")
      .send({ email, password: newPassword });
    expect(res.status).toBe(200);
  });

  it("counts as email verification and burns leftover staff-issued links", async () => {
    const { email, id } = await makeCustomer("unverified", { emailVerifiedAt: null });
    // ลิงก์ที่พนักงานเคยออกให้แล้วยังไม่ถูกใช้ ก็เป็นกุญแจตั้งรหัสผ่านเหมือนกัน
    const staff = await prisma.user.create({
      data: {
        username: `reset-issuer-${runId}`,
        passwordHash: await hashPassword(password),
        fullName: "ผู้ออกลิงก์",
        role: "ADMIN",
      },
    });
    createdIds.push(staff.id);
    await prisma.accountAccessToken.create({
      data: {
        userId: id,
        tokenHash: crypto.randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdById: staff.id,
      },
    });

    await ask(email);
    await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token: tokenFrom(email), password: newPassword });

    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    // กดลิงก์ในกล่องจดหมายได้ = พิสูจน์แล้วว่าคุมอีเมลนี้จริง จึงถือว่ายืนยันอีเมลไปด้วย
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(await prisma.accountAccessToken.count({ where: { userId: id, usedAt: null } })).toBe(0);

    // และเข้าระบบได้เลยโดยไม่ต้องไปกรอกรหัส 6 หลักอีกรอบ
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({ email, password: newPassword });
    expect(login.status).toBe(200);
  });

  it("still caps the requests per IP, and says how long to wait", async () => {
    const { email } = await makeCustomer("ratelimit");
    let limited: { status: number; body: Record<string, unknown>; headers: Record<string, string> } | null = null;
    // เพดานคือ 20 ครั้ง/15 นาที/ไอพี — ยิงเกินไว้หน่อยให้ชนแน่ ๆ
    for (let i = 0; i < 25 && !limited; i++) {
      const res = await request(app).post("/api/auth/customer/forgot-password").send({ email });
      if (res.status === 429) limited = res as never;
    }
    expect(limited).not.toBeNull();
    // ต้องบอกด้วยว่ารออีกนานแค่ไหน ไม่ใช่แค่ "ลองใหม่ภายหลัง" ลอย ๆ
    expect(limited!.body.retryAfter).toBeGreaterThan(0);
    expect(limited!.headers["retry-after"]).toBeDefined();
  });

  it("tells the owner afterwards that the password changed", async () => {
    const { email } = await makeCustomer("notify");
    await ask(email);
    const token = tokenFrom(email);
    clearOutbox();

    await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token, password: newPassword });

    // ส่งแบบไม่รอผล (อ่านข้อมูลบริษัทจากฐานข้อมูลก่อนประกอบเมล) — รอจนเข้า outbox แทนการรอเวลาตายตัว
    let mail = lastMailTo(email);
    for (let i = 0; i < 40 && !mail; i++) {
      await new Promise((r) => setTimeout(r, 50));
      mail = lastMailTo(email);
    }
    expect(mail).toBeDefined();
    expect(mail!.subject).toContain("ถูกเปลี่ยน");
  });

  // ── รหัส 6 หลักในเมลเดียวกับลิงก์ (กรอกในหน้าเว็บที่เปิดค้างไว้แทนการกดลิงก์) ──

  /** รหัสในเมล — ฉบับข้อความพิมพ์รหัสเป็นบรรทัดของตัวเอง เยื้อง 4 ช่อง */
  function codeFrom(email: string): string {
    const found = /^\s{4}(\d{6})$/m.exec(lastMailTo(email)!.text);
    expect(found).not.toBeNull();
    return found![1];
  }
  const verify = (email: string, code: string) =>
    request(app).post("/api/auth/customer/reset-password/verify-code").send({ email, code });
  const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

  it("puts a 6-digit code next to the link, and stores only its hash", async () => {
    const { email, id } = await makeCustomer("code-mail");
    await ask(email);
    const code = codeFrom(email);
    expect(tokenFrom(email)).toBeTruthy();

    const row = await prisma.passwordResetToken.findFirst({ where: { userId: id } });
    expect(row!.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row!.codeHash).not.toContain(code);
  });

  it("swaps a correct code for a fresh token that resets the password — and kills the emailed link", async () => {
    const { email } = await makeCustomer("code-ok");
    await ask(email);
    const linkToken = tokenFrom(email);

    // พิมพ์เว้นวรรคกลางรหัสมาก็ได้ (482 913)
    const code = codeFrom(email);
    const res = await verify(email, `${code.slice(0, 3)} ${code.slice(3)}`);
    expect(res.status).toBe(200);
    expect(res.body.maskedEmail).toMatch(/^r•••••@gmail\.com$/);
    expect(res.body.token).not.toBe(linkToken);

    // ใช้รหัสไปแล้ว ลิงก์ในเมลฉบับเดียวกันต้องตาย และรหัสเดิมใช้ซ้ำไม่ได้
    expect((await request(app).get(`/api/auth/customer/reset-password/${linkToken}`)).status).toBe(400);
    expect((await verify(email, code)).status).toBe(400);

    const reset = await request(app)
      .post("/api/auth/customer/reset-password")
      .send({ token: res.body.token, password: newPassword });
    expect(reset.status).toBe(200);
    const login = await request(app).post("/api/auth/customer/login").send({ email, password: newPassword });
    expect(login.status).toBe(200);
  });

  it("using the link first kills the code", async () => {
    const { email } = await makeCustomer("link-first");
    await ask(email);
    const code = codeFrom(email);
    await request(app).post("/api/auth/customer/reset-password").send({ token: tokenFrom(email), password: newPassword });
    expect((await verify(email, code)).status).toBe(400);
  });

  it(`kills the code (and the link with it) after ${5} wrong guesses — even the right code stops working`, async () => {
    const { email, id } = await makeCustomer("code-lock");
    await ask(email);
    const code = codeFrom(email);
    const link = tokenFrom(email);

    const messages = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await verify(email, wrong(code));
      expect(res.status).toBe(400);
      messages.add(res.body.error);
    }
    expect((await verify(email, code)).status).toBe(400);
    expect(await prisma.passwordResetToken.count({ where: { userId: id } })).toBe(0);
    expect((await request(app).get(`/api/auth/customer/reset-password/${link}`)).status).toBe(400);
    // ข้อความไม่เปลี่ยนเมื่อครบเพดาน — ไม่งั้นบอกใบ้ว่าอีเมลนี้มีบัญชีจริง
    expect(messages.size).toBe(1);
  });

  it("answers a wrong code exactly like an email with no account", async () => {
    const { email } = await makeCustomer("code-enum");
    await ask(email);
    const real = await verify(email, wrong(codeFrom(email)));
    const ghost = await verify(`nobody-code-${runId}@gmail.com`, "123456");
    expect(real.status).toBe(ghost.status);
    expect(real.body).toEqual(ghost.body);
  });

  it("asking again kills the previous code", async () => {
    const { email, id } = await makeCustomer("code-again");
    await ask(email);
    const first = codeFrom(email);
    // ข้ามช่วงพัก 60 วินาทีโดยดันเวลาสร้างของแถวเดิมย้อนหลัง
    await prisma.passwordResetToken.updateMany({ where: { userId: id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    clearOutbox();
    await ask(email);
    const second = codeFrom(email);
    if (first !== second) expect((await verify(email, first)).status).toBe(400);
    expect((await verify(email, second)).status).toBe(200);
  });

  it("rejects a code that is not 6 digits before touching the database", async () => {
    const res = await verify(`whoever-${runId}@gmail.com`, "12ab56");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("รหัสต้องเป็นตัวเลข 6 หลัก");
  });
});
