import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

/**
 * คำตอบเมื่อส่งข้อมูลผิดรูปหรือใช้ลิงก์/รหัสที่ไม่ถูกต้อง ของปลายทางเข้าสู่ระบบทั้งหมด
 *
 * ทุกกรณีต้องได้ 4xx พร้อมข้อความภาษาไทยให้หน้าจอโชว์ — ไม่ใช่ 500 — และปลายทางที่ถูกออกแบบ
 * ให้ "ตอบเหมือนกันทุกกรณี" (ลืมรหัส · ขอรหัสใหม่) ต้องไม่บอกใบ้ว่าบัญชีมีจริงหรือไม่
 */
describe("auth API — malformed input and bad links", () => {
  const anon = () => request(app);
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;

  beforeAll(async () => {
    customer = await createCustomerDirect("test-auth-errors-cust");
    owner = await createAndLoginOwner("test-auth-errors-owner");
  });

  afterAll(async () => {
    const ids = [customer.userId, owner.userId];
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const expect4xx = (res: request.Response) => {
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  };

  const malformed: [string, unknown][] = [
    ["/api/auth/staff/login", { username: "" }],
    ["/api/auth/customer/register", { email: "not-an-email" }],
    ["/api/auth/customer/verify-email", { email: "a@example.com", code: "12" }],
    ["/api/auth/customer/verify-email/resend", { email: "nope" }],
    ["/api/auth/customer/verify-email/change-email", { email: "a@example.com" }],
    ["/api/auth/customer/login", { email: "x" }],
    ["/api/auth/customer/forgot-password", { email: "x" }],
    ["/api/auth/customer/reset-password/verify-code", { email: "a@example.com" }],
    ["/api/auth/customer/reset-password", { token: "t" }],
    ["/api/auth/staff/forgot-password", {}],
    ["/api/auth/staff/reset-password", { token: "t", password: "short" }],
    ["/api/auth/access/some-token", { password: "" }],
  ];

  it.each(malformed)("POST %s with a malformed body answers 400", async (url, body) => {
    const res = await anon().post(url).send(body as object);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });

  it("answers the same 'sent' reply when asked to resend a code for an unknown email", async () => {
    const res = await anon()
      .post("/api/auth/customer/verify-email/resend")
      .send({ email: `nobody-${Date.now()}@example.com` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, retryAfterSeconds: 60 });
  });

  it("rejects a wrong verification code", async () => {
    const res = await anon()
      .post("/api/auth/customer/verify-email")
      .send({ email: `nobody-${Date.now()}@example.com`, code: "123456" });
    expect4xx(res);
  });

  it("rejects changing a signup email without a valid ticket", async () => {
    const res = await anon()
      .post("/api/auth/customer/verify-email/change-email")
      .send({ email: customer.email, ticket: "x".repeat(43), newEmail: `new-${Date.now()}@example.com` });
    expect4xx(res);
  });

  it("answers forgot-password requests with the same reply whether or not the account exists", async () => {
    const real = await anon().post("/api/auth/customer/forgot-password").send({ email: customer.email });
    const fake = await anon()
      .post("/api/auth/customer/forgot-password")
      .send({ email: `ghost-${Date.now()}@example.com` });
    expect(real.status).toBe(200);
    expect(fake.status).toBe(200);
    expect(real.body).toEqual(fake.body);

    const staff = await anon().post("/api/auth/staff/forgot-password").send({ username: `ghost-${Date.now()}` });
    expect(staff.status).toBe(200);
    expect(staff.body).toEqual({ ok: true });
  });

  it("rejects unknown reset / access tokens for customers and staff", async () => {
    const bogus = "b".repeat(43);
    expect4xx(await anon().get(`/api/auth/customer/reset-password/${bogus}`));
    expect4xx(await anon().get(`/api/auth/staff/reset-password/${bogus}`));
    expect4xx(
      await anon().post("/api/auth/customer/reset-password").send({ token: bogus, password: "Fresh-meadow-55-Lantern!" }),
    );
    expect4xx(
      await anon().post("/api/auth/staff/reset-password").send({ token: bogus, password: "Fresh-meadow-55-Lantern!" }),
    );
    expect4xx(await anon().get(`/api/auth/access/${bogus}`));
    expect4xx(await anon().post(`/api/auth/access/${bogus}`).send({ password: "Fresh-meadow-55-Lantern!" }));
  });

  it("rejects a wrong reset code with one generic message", async () => {
    const res = await anon()
      .post("/api/auth/customer/reset-password/verify-code")
      .send({ email: customer.email, code: "000000" });
    expect4xx(res);
  });

  it("logs out cleanly even without a session cookie", async () => {
    const res = await anon().post("/api/auth/logout");
    expect(res.status).toBe(204);
  });

  describe("signed-in customer", () => {
    it("rejects a malformed profile update", async () => {
      const res = await customer.agent.patch("/api/auth/me/profile").send({ phone: 12345 });
      expect(res.status).toBe(400);
    });

    it("rejects a malformed or wrong change-password request", async () => {
      const bad = await customer.agent.post("/api/auth/change-password").send({ newPassword: "x" });
      expect(bad.status).toBe(400);

      const wrong = await customer.agent
        .post("/api/auth/change-password")
        .send({ currentPassword: "Not-my-password-1!", newPassword: "Fresh-meadow-55-Lantern!" });
      expect4xx(wrong);
    });

    it("refuses to delete the account without the right password", async () => {
      const bad = await customer.agent.post("/api/auth/delete-account").send({});
      expect(bad.status).toBe(400);

      const wrong = await customer.agent
        .post("/api/auth/delete-account")
        .send({ currentPassword: "Not-my-password-1!" });
      expect4xx(wrong);
      expect(await prisma.user.findUnique({ where: { id: customer.userId } })).not.toBeNull();
    });

    it("keeps staff out of customer-only profile endpoints", async () => {
      expect((await owner.agent.get("/api/auth/me/profile")).status).toBe(403);
      expect((await owner.agent.post("/api/auth/delete-account").send({ currentPassword: "x" })).status).toBe(403);
    });
  });
});
