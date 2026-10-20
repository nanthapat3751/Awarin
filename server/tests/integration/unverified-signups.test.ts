import request from "supertest";

import { app } from "../../src/app";
import { clearOutbox, lastMailTo } from "../../src/lib/mailer";
import { prisma } from "../../src/lib/prisma";
import { resetAllRateLimits } from "../../src/lib/rate-limit";
import { purgeUnverifiedSignups } from "../../src/lib/unverified-signups";
import { createAndLoginAdmin } from "../helpers/test-auth";

/**
 * ลูกค้าที่สมัครแล้วพิมพ์อีเมลผิด / ใช้อีเมลปลอม
 *
 * หลัก: บัญชีที่ยังไม่ยืนยันอีเมลยังไม่มีเจ้าของ — แทนที่ (สมัครทับ) แก้อีเมล (ด้วยตั๋วจากตอนสมัคร)
 * และลบทิ้งเมื่อเกินกำหนดได้ เว้นแต่พนักงานผูกของไว้แล้ว
 */
describe("unverified signups (wrong or fake email)", () => {
  const runId = Date.now();
  const password = "Copper-lantern-47-riverstone";
  const emails: string[] = [];
  const mail = (tag: string) => {
    const e = `unv-${tag}-${runId}@gmail.com`;
    emails.push(e);
    return e;
  };
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;

  beforeAll(async () => {
    admin = await createAndLoginAdmin("test-unverified-admin");
  });

  beforeEach(async () => {
    clearOutbox();
    // ทั้งไฟล์สมัครจากไอพีเดียวกัน — เพดานสมัคร 10 ครั้ง/ชม. จะเตะเทสต์เองกลางไฟล์
    await resetAllRateLimits();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await prisma.user.deleteMany({ where: { id: admin.userId } });
    await prisma.$disconnect();
  });

  const register = (email: string, fullName = "ทดสอบ สมัคร") =>
    request(app).post("/api/auth/customer/register").send({ email, password, fullName, phone: "0812345678" });

  const codeFrom = (email: string) => /\b(\d{6})\b/.exec(lastMailTo(email)!.text)![1];

  const changeEmail = (email: string, ticket: string, newEmail: string) =>
    request(app).post("/api/auth/customer/verify-email/change-email").send({ email, ticket, newEmail });

  // ── 3. อีเมลที่ยังไม่ยืนยันไม่ขวางเจ้าของตัวจริง ──

  it("hands the registering browser a ticket, and lets the real owner register over an unverified account", async () => {
    const email = mail("takeover");
    const first = await register(email, "คนพิมพ์ ผิดอีเมล");
    expect(first.status).toBe(201);
    expect(first.body.signupTicket).toEqual(expect.any(String));
    const firstCode = codeFrom(email);

    clearOutbox();
    const second = await register(email, "เจ้าของ ตัวจริง");
    expect(second.status).toBe(201);
    // บัญชีเดิมถูกแทนที่ ไม่ใช่สร้างซ้ำ
    expect(second.body.user.id).toBe(first.body.user.id);
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.fullName).toBe("เจ้าของ ตัวจริง");
    expect(await prisma.auditLog.count({ where: { userId: row.id, action: "REGISTER_REPLACED_UNVERIFIED" } })).toBe(1);

    // รหัสของคนก่อนตาย รหัสใหม่ใช้ได้ และรหัสผ่านใหม่ใช้เข้าระบบได้
    const newCode = codeFrom(email);
    if (newCode !== firstCode) {
      expect((await request(app).post("/api/auth/customer/verify-email").send({ email, code: firstCode })).status).toBe(400);
    }
    expect((await request(app).post("/api/auth/customer/verify-email").send({ email, code: newCode })).status).toBe(200);
    expect((await request(app).post("/api/auth/customer/login").send({ email, password })).status).toBe(200);
  });

  it("still refuses a verified email, and an unverified one that staff already linked something to", async () => {
    const verified = mail("verified");
    await register(verified);
    await request(app).post("/api/auth/customer/verify-email").send({ email: verified, code: codeFrom(verified) });
    expect((await register(verified)).status).toBe(409);

    const linked = mail("linked");
    await register(linked);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: linked } });
    await prisma.customerNote.create({ data: { customerId: user.id, body: "โทรคุยแล้ว", createdById: admin.userId } as never });
    expect((await register(linked)).status).toBe(409);
  });

  // ── 2. แก้อีเมลจากหน้ายืนยัน ──

  it("moves an unverified account to a corrected email with the signup ticket, and sends the code there", async () => {
    const typo = mail("typo");
    const fixed = mail("fixed");
    const { body } = await register(typo);
    clearOutbox();

    const res = await changeEmail(typo, body.signupTicket, fixed);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: fixed, codeSent: true });
    expect(await prisma.user.findUnique({ where: { email: typo } })).toBeNull();
    expect(lastMailTo(fixed)).toBeDefined();

    expect((await request(app).post("/api/auth/customer/verify-email").send({ email: fixed, code: codeFrom(fixed) })).status).toBe(200);
    // ยืนยันแล้ว ตั๋วหมดหน้าที่ — แก้อีเมลต่อไม่ได้
    expect((await changeEmail(fixed, body.signupTicket, mail("after"))).status).toBe(400);
  });

  it("refuses without the right ticket, caps the number of changes, and will not take a real account's email", async () => {
    const a = mail("cap-a");
    const { body } = await register(a);
    expect((await changeEmail(a, "x".repeat(43), mail("nope"))).status).toBe(400);

    let current = a;
    for (let i = 1; i <= 3; i++) {
      const next = mail(`cap-${i}`);
      expect((await changeEmail(current, body.signupTicket, next)).status).toBe(200);
      current = next;
    }
    expect((await changeEmail(current, body.signupTicket, mail("cap-4"))).status).toBe(429);

    const owner = mail("owner");
    await register(owner);
    await request(app).post("/api/auth/customer/verify-email").send({ email: owner, code: codeFrom(owner) });
    const b = mail("cap-b");
    const second = await register(b);
    expect((await changeEmail(b, second.body.signupTicket, owner)).status).toBe(409);
  });

  // ── 4. รายชื่อลูกค้าแยกบัญชีที่ยังไม่ยืนยัน ──

  it("keeps unverified signups out of the main customer list and shows them in their own view", async () => {
    const pending = mail("list-pending");
    await register(pending);

    const main = await admin.agent.get(`/api/customers/directory?q=${encodeURIComponent(pending)}`);
    expect(main.status).toBe(200);
    expect(main.body.customers).toHaveLength(0);
    expect(main.body.unverifiedCount).toBeGreaterThanOrEqual(1);

    const side = await admin.agent.get(`/api/customers/directory?view=unverified&q=${encodeURIComponent(pending)}`);
    expect(side.body.customers).toHaveLength(1);
    expect(side.body.customers[0]).toMatchObject({ emailVerified: false });
    const created = new Date(side.body.customers[0].createdAt).getTime();
    expect(new Date(side.body.customers[0].purgeAt).getTime() - created).toBe(7 * 24 * 60 * 60 * 1000);
  });

  // ── 5. ลบอัตโนมัติเมื่อเกิน 7 วัน ──

  it("purges week-old unverified signups but keeps recent, verified and staff-linked ones", async () => {
    const old = mail("purge-old");
    const recent = mail("purge-recent");
    const linked = mail("purge-linked");
    const verified = mail("purge-verified");
    for (const e of [old, recent, linked, verified]) await register(e);
    await request(app).post("/api/auth/customer/verify-email").send({ email: verified, code: codeFrom(verified) });

    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await prisma.user.updateMany({ where: { email: { in: [old, linked, verified] } }, data: { createdAt: eightDaysAgo } });
    const linkedUser = await prisma.user.findUniqueOrThrow({ where: { email: linked } });
    await prisma.customerNote.create({ data: { customerId: linkedUser.id, body: "รอเอกสาร", createdById: admin.userId } as never });

    expect(await purgeUnverifiedSignups()).toBeGreaterThanOrEqual(1);
    expect(await prisma.user.findUnique({ where: { email: old } })).toBeNull();
    for (const kept of [recent, linked, verified]) {
      expect(await prisma.user.findUnique({ where: { email: kept } })).not.toBeNull();
    }
  });
});
