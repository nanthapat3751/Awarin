import request from "supertest";

import { app } from "../../src/app";
import { hashPassword } from "../../src/lib/password";
import { prisma } from "../../src/lib/prisma";

const runId = Date.now();
const customerEmail = `test-customer-${runId}@example.com`;
const customerPassword = "Correct-horse-battery-7";
const ownerEmail = `test-owner-${runId}@example.com`;
const ownerUsername = `test-owner-${runId}`.toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
const ownerPassword = "Copper-meadow-88-flintlock";

async function seedOwner() {
  const passwordHash = await hashPassword(ownerPassword);
  await prisma.user.create({
    data: {
      email: ownerEmail,
      username: ownerUsername,
      passwordHash,
      fullName: "Test Owner",
      role: "OWNER",
    },
  });
}

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { email: { in: [customerEmail, ownerEmail] } },
  });
  await prisma.$disconnect();
});

describe("customer registration + login", () => {
  it("registers a new customer", async () => {
    const res = await request(app).post("/api/auth/customer/register").send({
      email: customerEmail,
      password: customerPassword,
      fullName: "Test Customer",
      phone: "0812345678",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("CUSTOMER");
    expect(res.body.user.email).toBe(customerEmail);
    expect(res.body.user.passwordHash).toBeUndefined();
    // สมัครแล้วยังใช้งานไม่ได้จนกว่าจะยืนยันอีเมล
    expect(res.body.verificationRequired).toBe(true);
  });

  it("cannot log in before the email is verified", async () => {
    const res = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: customerEmail, password: customerPassword });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("ยืนยันอีเมล");

    // เทสต์ที่เหลือในไฟล์นี้ทดสอบเรื่องอื่น (session, ล็อกบัญชี) จึงข้ามขั้นยืนยันด้วยการเขียน
    // ลงฐานข้อมูลตรง ๆ — ขั้นตอนยืนยันจริงเดินครบที่ email-verification.test.ts
    await prisma.user.update({
      where: { email: customerEmail },
      data: { emailVerifiedAt: new Date() },
    });
  });

  it("rejects registering the same email twice", async () => {
    const res = await request(app).post("/api/auth/customer/register").send({
      email: customerEmail,
      password: customerPassword,
      fullName: "Test Customer",
      phone: "0812345678",
    });

    expect(res.status).toBe(409);
  });

  it("logs in and reads the session via /me", async () => {
    const agent = request.agent(app);

    const loginRes = await agent
      .post("/api/auth/customer/login")
      .send({ email: customerEmail, password: customerPassword });
    expect(loginRes.status).toBe(200);
    expect(loginRes.headers["set-cookie"]).toBeDefined();

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(customerEmail);
  });

  it("rejects a wrong password with a generic error", async () => {
    const res = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: customerEmail, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).not.toMatch(/user|not found|exist/i);
  });

  it("rejects login for an email that does not exist, with the same generic error", async () => {
    const res = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: "nobody@example.com", password: "whatever12" });

    expect(res.status).toBe(401);
  });

  it("clears the session on logout", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/customer/login")
      .send({ email: customerEmail, password: customerPassword });

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(401);
  });
});

describe("staff login + RBAC", () => {
  beforeAll(async () => {
    await seedOwner();
  });

  it("rejects a CUSTOMER logging into the staff endpoint", async () => {
    // ลูกค้าไม่มีชื่อผู้ใช้เลย (คอลัมน์เป็น null) จึงหาบัญชีไม่เจอตั้งแต่ต้นทาง
    // ส่งอีเมลของลูกค้ามาเป็นชื่อผู้ใช้ก็ต้องไม่ผ่าน
    const res = await request(app)
      .post("/api/auth/staff/login")
      .send({ username: customerEmail, password: customerPassword });

    expect(res.status).toBe(401);
  });

  it("no longer lets a staff member log in with their email address", async () => {
    // ฝั่งบริษัทย้ายไปใช้ชื่อผู้ใช้แล้ว บัญชีนี้ยังมีอีเมลติดอยู่ในฐานข้อมูล แต่ต้องใช้เข้าระบบไม่ได้
    const res = await request(app)
      .post("/api/auth/staff/login")
      .send({ username: ownerEmail, password: ownerPassword });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain("ชื่อผู้ใช้");
    expect(res.body.error).not.toContain("อีเมล");
  });

  it("keeps the customer side on email — the same account cannot cross over", async () => {
    // ลูกค้ายังล็อกอินด้วยอีเมลเหมือนเดิม และช่องนี้ยังบังคับรูปแบบอีเมลอยู่
    const ok = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: customerEmail, password: customerPassword });
    expect(ok.status).toBe(200);

    const notAnEmail = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: "somchai", password: customerPassword });
    expect(notAnEmail.status).toBe(400);

    // พนักงานใช้ปลายทางของลูกค้าไม่ได้ (บัญชีพนักงานใหม่ไม่มีอีเมลด้วยซ้ำ)
    const staffOnCustomerDoor = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: ownerEmail, password: ownerPassword });
    expect(staffOnCustomerDoor.status).toBe(401);
  });

  it("logs an OWNER in and allows access to an OWNER/ADMIN-gated route", async () => {
    const agent = request.agent(app);

    const loginRes = await agent
      .post("/api/auth/staff/login")
      .send({ username: ownerUsername, password: ownerPassword });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe("OWNER");

    const categoriesRes = await agent.get("/api/categories");
    expect(categoriesRes.status).toBe(200);
    expect(Array.isArray(categoriesRes.body.categories)).toBe(true);
  });

  it("blocks a CUSTOMER session from the OWNER/ADMIN-gated route", async () => {
    const agent = request.agent(app);
    await agent
      .post("/api/auth/customer/login")
      .send({ email: customerEmail, password: customerPassword });

    const categoriesRes = await agent.get("/api/categories");
    expect(categoriesRes.status).toBe(403);
  });

  it("returns 401 from the gated route with no session at all", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(401);
  });
});

describe("account lockout", () => {
  const lockoutEmail = `test-lockout-${runId}@example.com`;
  const lockoutPassword = "Velvet-harbour-33-cindersmoke";

  beforeAll(async () => {
    await request(app).post("/api/auth/customer/register").send({
      email: lockoutEmail,
      password: lockoutPassword,
      fullName: "Test Lockout",
      phone: "0898765432",
    });
    // ชุดนี้ทดสอบการล็อกบัญชีเมื่อกรอกรหัสผิด ไม่ได้ทดสอบการยืนยันอีเมล — ข้ามขั้นนั้นไป
    // ไม่งั้นจะได้ 403 (ยังไม่ยืนยัน) แทน 401 (รหัสผิด) ตั้งแต่ครั้งแรก
    await prisma.user.update({
      where: { email: lockoutEmail },
      data: { emailVerifiedAt: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: lockoutEmail } });
  });

  it("locks the account after 5 consecutive failed attempts", async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post("/api/auth/customer/login")
        .send({ email: lockoutEmail, password: "wrong-password" });
      expect(res.status).toBe(401);
    }

    const lockedRes = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: lockoutEmail, password: lockoutPassword });
    expect(lockedRes.status).toBe(423);
    // แนบวินาทีที่เหลือ + header Retry-After มาตรฐาน เพื่อให้ frontend นับถอยหลังได้
    expect(lockedRes.body.retryAfter).toBeGreaterThan(0);
    expect(lockedRes.body.retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(lockedRes.headers["retry-after"]).toBeDefined();

    // เพิ่งถูกล็อก → ต้องมีการแจ้งเตือนเข้าบัญชี (ลูกค้าได้แจ้งเตือนของตัวเอง)
    const lockedUser = await prisma.user.findUnique({ where: { email: lockoutEmail } });
    const notes = await prisma.notification.findMany({ where: { userId: lockedUser!.id } });
    expect(notes.some((n) => n.message.includes("ถูกล็อกชั่วคราว"))).toBe(true);
  }, 20_000);

  it("resets the counter after the lock expires — a single miss does not immediately re-lock", async () => {
    // จำลองว่าล็อกหมดอายุแล้ว (failedAttempts ยังค้างที่ 5 จากเทสต์ก่อน)
    await prisma.user.update({
      where: { email: lockoutEmail },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });

    // พลาด 1 ครั้งหลังหมดล็อก → ต้องเป็น 401 (เริ่มนับใหม่เป็นครั้งที่ 1) ไม่ใช่ 423 (ล็อกซ้ำทันที)
    const missRes = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: lockoutEmail, password: "wrong-again" });
    expect(missRes.status).toBe(401);

    // รหัสถูก → เข้าได้ทันที พิสูจน์ว่าไม่ได้ถูกล็อกซ้ำ
    const okRes = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: lockoutEmail, password: lockoutPassword });
    expect(okRes.status).toBe(200);
  }, 20_000);
});

describe("registration rate limiting", () => {
  const createdEmails: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  });

  it("eventually returns 429 once the registration rate limit is exceeded", async () => {
    // การสมัครสมาชิกไม่มีตัวล็อกบัญชีรองรับเหมือนการล็อกอิน จึงถูกจำกัดอัตราของตัวเอง
    // (สูงสุด 10 ครั้ง/ชั่วโมง/IP — ดู registerLimiter ใน auth.routes.ts) ไฟล์นี้เรียกสมัคร
    // ไปแล้วสองสามครั้งด้านบน จึงวนเพิ่มให้มากพอเพื่อรับประกันว่าจะชนลิมิตแน่ ไม่ว่าจะใช้ไป
    // ก่อนหน้ากี่ครั้งก็ตาม
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const email = `test-ratelimit-${runId}-${i}@example.com`;
      createdEmails.push(email);
      const res = await request(app).post("/api/auth/customer/register").send({
        email,
        password: "Rate-limit-test-battery-5",
        fullName: "Test Rate Limit",
        phone: "0899999999",
      });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
  }, 20_000);
});
