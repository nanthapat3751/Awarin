import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("delete-account (PDPA anonymization)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("rejects the wrong password", async () => {
    const customer = await createAndLoginCustomer("test-delacct-wrong");
    const res = await customer.agent
      .post("/api/auth/delete-account")
      .send({ currentPassword: "not-the-real-password" });
    expect(res.status).toBe(401);
    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("anonymizes personal fields, deactivates the account, and revokes the session", async () => {
    const customer = await createAndLoginCustomer("test-delacct-owner");
    const originalEmail = customer.email;

    const res = await customer.agent
      .post("/api/auth/delete-account")
      .send({ currentPassword: "Amber-thicket-71-woodgrain" });
    expect(res.status).toBe(204);

    // session ตายทันที
    const meAfter = await customer.agent.get("/api/auth/me");
    expect(meAfter.status).toBe(401);

    // อีเมลเดิมไม่ควรค้นเจอแล้ว (ถูกเขียนใหม่เป็นรูปแบบที่ไม่ระบุตัวตน)
    const user = await prisma.user.findUnique({ where: { email: originalEmail } });
    expect(user).toBeNull();

    const anonymized = await prisma.user.findFirstOrThrow({
      where: { fullName: "ลูกค้าที่ลบบัญชี", email: { contains: "@anonymized.local" } },
      include: { customerProfile: true },
    });
    expect(anonymized.active).toBe(false);
    expect(anonymized.customerProfile?.phone).toBeNull();
    expect(anonymized.customerProfile?.address).toBeNull();

    // ข้อมูลล็อกอินเดิมใช้ไม่ได้อีกต่อไปเลย (บัญชีถูกปิดใช้งาน)
    const loginAttempt = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: originalEmail, password: "Amber-thicket-71-woodgrain" });
    expect(loginAttempt.status).toBe(401);

    createdUserIds.push(anonymized.id);
  });

  it("rejects a staff (OWNER) account calling this customer-only endpoint", async () => {
    const owner = await createAndLoginOwner("test-delacct-staff-forbidden");
    createdUserIds.push(owner.userId);

    const res = await owner.agent
      .post("/api/auth/delete-account")
      .send({ currentPassword: "Quiet-lantern-42-riverbank" });
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app)
      .post("/api/auth/delete-account")
      .send({ currentPassword: "irrelevant" });
    expect(res.status).toBe(401);
  });
});
