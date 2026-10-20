import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("change-password", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("rejects the wrong current password", async () => {
    const owner = await createAndLoginOwner("test-changepw-wrong");
    createdUserIds.push(owner.userId);

    const res = await owner.agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "not-the-real-password", newPassword: "Brand-new-password-123" });
    expect(res.status).toBe(401);
  });

  it("changes the password, revokes other sessions, and keeps the calling device logged in", async () => {
    const owner = await createAndLoginOwner("test-changepw-owner");
    createdUserIds.push(owner.userId);

    // session ของ "อุปกรณ์" ที่สองสำหรับบัญชีเดียวกัน เพื่อพิสูจน์ว่ามันถูกยกเลิก
    const otherDevice = request.agent(app);
    await otherDevice
      .post("/api/auth/staff/login")
      .send({ username: owner.username, password: "Quiet-lantern-42-riverbank" });
    const otherDeviceMeBefore = await otherDevice.get("/api/auth/me");
    expect(otherDeviceMeBefore.status).toBe(200);

    const changeRes = await owner.agent.post("/api/auth/change-password").send({
      currentPassword: "Quiet-lantern-42-riverbank",
      newPassword: "Birch-quarry-58-moonstone",
    });
    expect(changeRes.status).toBe(204);

    // อุปกรณ์ที่เปลี่ยนรหัสผ่านยังล็อกอินอยู่ (ได้ session cookie ใหม่)
    const callerMeAfter = await owner.agent.get("/api/auth/me");
    expect(callerMeAfter.status).toBe(200);

    // session เดิมของอีกอุปกรณ์ตอนนี้ตายแล้ว
    const otherDeviceMeAfter = await otherDevice.get("/api/auth/me");
    expect(otherDeviceMeAfter.status).toBe(401);

    // รหัสผ่านเดิมใช้ไม่ได้แล้ว รหัสใหม่ใช้ได้
    const loginWithOldPassword = await request(app)
      .post("/api/auth/staff/login")
      .send({ username: owner.username, password: "Quiet-lantern-42-riverbank" });
    expect(loginWithOldPassword.status).toBe(401);

    const loginWithNewPassword = await request(app)
      .post("/api/auth/staff/login")
      .send({ username: owner.username, password: "Birch-quarry-58-moonstone" });
    expect(loginWithNewPassword.status).toBe(200);
  });

  it("works the same way for a CUSTOMER account", async () => {
    const customer = await createAndLoginCustomer("test-changepw-customer");

    const res = await customer.agent.post("/api/auth/change-password").send({
      currentPassword: "Amber-thicket-71-woodgrain",
      newPassword: "Maple-sundial-63-cobblestone",
    });
    expect(res.status).toBe(204);

    const loginWithNewPassword = await request(app)
      .post("/api/auth/customer/login")
      .send({ email: customer.email, password: "Maple-sundial-63-cobblestone" });
    expect(loginWithNewPassword.status).toBe(200);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("records when the password was changed and shows it on the customer's profile", async () => {
    const customer = await createAndLoginCustomer("test-changepw-changedat");
    // บัญชีที่มีอยู่ก่อนคอลัมน์นี้ = null → หน้าบัญชีต้องได้ null (ไม่เดาวันที่)
    await prisma.user.update({ where: { email: customer.email }, data: { passwordChangedAt: null } });
    const before = await customer.agent.get("/api/auth/me/profile");
    expect(before.status).toBe(200);
    expect(before.body.passwordChangedAt).toBeNull();

    const startedAt = Date.now();
    const res = await customer.agent.post("/api/auth/change-password").send({
      currentPassword: "Amber-thicket-71-woodgrain",
      newPassword: "Harbor-lattice-29-thimble",
    });
    expect(res.status).toBe(204);

    const after = await customer.agent.get("/api/auth/me/profile");
    expect(after.status).toBe(200);
    expect(new Date(after.body.passwordChangedAt).getTime()).toBeGreaterThanOrEqual(startedAt - 1000);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app)
      .post("/api/auth/change-password")
      .send({ currentPassword: "x", newPassword: "irrelevant123" });
    expect(res.status).toBe(401);
  });
});
