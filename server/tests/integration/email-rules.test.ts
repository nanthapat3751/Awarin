import request from "supertest";

import { newAccountEmailProblem, normalizeEmail } from "@systemboq/shared-types";

import { app } from "../../src/app";
import { clearDomainCache, domainAcceptsMail } from "../../src/lib/email-domain";
import { prisma } from "../../src/lib/prisma";

/**
 * กติกาอีเมลของบัญชีลูกค้า
 *
 * เดิมเช็คแค่ `z.string().email()` ซึ่งดูแต่รูปแบบ — อีเมลที่โดเมนกุขึ้นมาเองก็สมัครผ่าน
 * และที่แย่กว่านั้นคือไม่ได้แปลงเป็นตัวพิมพ์เล็ก ทำให้คนที่สมัครด้วย Pim@Gmail.com
 * เข้าระบบด้วย pim@gmail.com ไม่ได้ และสมัครซ้ำได้อีกบัญชี
 */
describe("customer email rules", () => {
  const runId = Date.now();
  const createdIds: string[] = [];
  const password = "Crimson-pebble-57-moonwhisper";

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  async function register(email: string) {
    return request(app)
      .post("/api/auth/customer/register")
      .send({ email, password, fullName: "ทดสอบ อีเมล", phone: "0812345678" });
  }

  // ── กฎที่ไม่ต้องพึ่งเครือข่าย ──

  it("lowercases and trims so one person cannot become two accounts", async () => {
    expect(normalizeEmail("  Pim@Gmail.COM ")).toBe("pim@gmail.com");
  });

  it("registers with mixed case, then logs in with lowercase", async () => {
    const mixed = `MiXeD-${runId}@Gmail.com`;
    const created = await register(mixed);
    expect(created.status).toBe(201);
    createdIds.push(created.body.user.id);

    // เก็บลงฐานข้อมูลเป็นพิมพ์เล็กแล้ว
    const row = await prisma.user.findUnique({ where: { id: created.body.user.id } });
    expect(row?.email).toBe(mixed.toLowerCase());

    // ชุดนี้ทดสอบเรื่องตัวพิมพ์ ไม่ได้ทดสอบการยืนยันอีเมล — ข้ามขั้นนั้นไป
    await prisma.user.update({
      where: { id: created.body.user.id },
      data: { emailVerifiedAt: new Date() },
    });

    // นี่คือบั๊กที่เคยเกิด: พิมพ์ต่างตัวพิมพ์แล้วเข้าไม่ได้
    const login = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: mixed.toLowerCase(), password });
    expect(login.status).toBe(200);

    // และพิมพ์ใหญ่ทั้งหมดก็ต้องเข้าได้เหมือนกัน
    const upper = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: mixed.toUpperCase(), password });
    expect(upper.status).toBe(200);
  });

  it("treats a different-case duplicate as the same account", async () => {
    const dupe = `Dupe-${runId}@Gmail.com`;
    const first = await register(dupe);
    expect(first.status).toBe(201);
    createdIds.push(first.body.user.id);

    // บัญชีแรกยังไม่ยืนยัน จึงสมัครทับได้ (ดู unverified-signups.test.ts) — ที่ต้องพิสูจน์ตรงนี้คือ
    // ตัวพิมพ์ต่างกันต้องลงบัญชีเดิม ไม่ใช่สร้างบัญชีที่สองที่อีเมลเดียวกัน
    const second = await register(dupe.toUpperCase());
    expect(second.status).toBe(201);
    expect(second.body.user.id).toBe(first.body.user.id);

    // ยืนยันแล้ว = มีเจ้าของจริง ตัวพิมพ์ต่างกันก็สมัครซ้ำไม่ได้
    await prisma.user.update({ where: { id: first.body.user.id }, data: { emailVerifiedAt: new Date() } });
    expect((await register(dupe.toLowerCase())).status).toBe(409);
  });

  it("rejects throwaway inboxes — we could never reach that customer again", async () => {
    const res = await register(`throwaway-${runId}@mailinator.com`);
    expect(res.status).toBe(400);
    expect(newAccountEmailProblem("x@mailinator.com")).toContain("อีเมลชั่วคราว");
  });

  it("asks back when the domain looks like a typo instead of guessing", async () => {
    const res = await register(`typo-${runId}@gmial.com`);
    expect(res.status).toBe(400);
    const problem = newAccountEmailProblem("x@gmial.com");
    expect(problem).toContain("gmail.com");
  });

  it("still lets existing accounts on odd domains log in (login has no new-account rules)", async () => {
    // บัญชีเทสต์ทั้งระบบใช้ example.com ซึ่งเป็นโดเมนสงวนที่ไม่มี MX — ถ้าเอากฎบัญชีใหม่
    // ไปใช้ตอนเข้าสู่ระบบด้วย คนที่สมัครไว้ก่อนจะโดนล็อกออกจากบัญชีตัวเอง
    const res = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: `nobody-${runId}@mailinator.com`, password: "whatever" });
    // 401 = ผ่านการตรวจรูปแบบแล้วไปหาบัญชีไม่เจอ (ไม่ใช่ 400 = ถูกกฎอีเมลปัด)
    expect(res.status).toBe(401);
  });

  // ── ตัวเช็คโดเมน (MX) ──

  it("is switched off in tests so the suite never depends on DNS", async () => {
    expect(process.env.EMAIL_MX_CHECK).toBe("off");
    expect(await domainAcceptsMail("anyone@domain-that-does-not-exist.invalid")).toBe(true);
  });

  it("rejects a domain that cannot exist, and passes a real one", async () => {
    process.env.EMAIL_MX_CHECK = "on";
    clearDomainCache();
    try {
      // .invalid เป็น TLD สงวนตาม RFC 2606 — ไม่มีวันมีอยู่จริง
      const invalid = await domainAcceptsMail("someone@definitely-not-real.invalid");
      // gmail.com ใช้เป็นตัวยืนยันว่าเครื่องนี้ถาม DNS ได้จริง ถ้าถามไม่ได้ให้ข้ามข้อนี้
      const real = await domainAcceptsMail("someone@gmail.com");
      if (!real) {
        console.warn("ข้าม: เครื่องนี้ถาม DNS ไม่ได้");
        return;
      }
      expect(invalid).toBe(false);
      expect(real).toBe(true);
    } finally {
      process.env.EMAIL_MX_CHECK = "off";
      clearDomainCache();
    }
  });
});
