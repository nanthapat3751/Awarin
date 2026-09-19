import { authenticator } from "otplib";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

describe("two-factor auth (2FA / TOTP)", () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  // เปิดใช้ 2FA ให้ owner ที่ล็อกอินอยู่ คืน secret + รหัสสำรอง
  async function enableTwoFactor(owner: Awaited<ReturnType<typeof createAndLoginOwner>>) {
    const setup = await owner.agent.post("/api/auth/2fa/setup");
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;

    const activate = await owner.agent
      .post("/api/auth/2fa/activate")
      .send({ token: authenticator.generate(secret) });
    expect(activate.status).toBe(200);
    return { secret, backupCodes: activate.body.backupCodes as string[] };
  }

  it("reports disabled, then enables and issues 10 backup codes", async () => {
    const owner = await createAndLoginOwner("2fa-enable");
    createdUserIds.push(owner.userId);

    const before = await owner.agent.get("/api/auth/2fa/status");
    expect(before.body).toEqual({ enabled: false, backupCodesRemaining: 0 });

    const { backupCodes } = await enableTwoFactor(owner);
    expect(backupCodes).toHaveLength(10);

    const after = await owner.agent.get("/api/auth/2fa/status");
    expect(after.body).toEqual({ enabled: true, backupCodesRemaining: 10 });
  });

  it("rejects activation with a wrong token", async () => {
    const owner = await createAndLoginOwner("2fa-badactivate");
    createdUserIds.push(owner.userId);
    await owner.agent.post("/api/auth/2fa/setup");
    const res = await owner.agent.post("/api/auth/2fa/activate").send({ token: "000000" });
    expect(res.status).toBe(400);
  });

  it("requires the second factor at login and completes with a TOTP code", async () => {
    const owner = await createAndLoginOwner("2fa-login");
    createdUserIds.push(owner.userId);
    const { secret } = await enableTwoFactor(owner);

    // ล็อกอินใหม่จากอุปกรณ์อื่น — ต้องได้ twoFactorRequired และยังเข้าไม่ได้
    const device = request.agent(app);
    const login = await device
      .post("/api/auth/staff/login")
      .send({ email: owner.email, password: owner.password });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ twoFactorRequired: true });

    const meBefore = await device.get("/api/auth/me");
    expect(meBefore.status).toBe(401); // session ครึ่งทางยังไม่ถือว่าล็อกอิน

    const verify = await device
      .post("/api/auth/2fa/verify")
      .send({ code: authenticator.generate(secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.user.email).toBe(owner.email);

    const meAfter = await device.get("/api/auth/me");
    expect(meAfter.status).toBe(200);
  });

  it("rejects a wrong 2FA code at login", async () => {
    const owner = await createAndLoginOwner("2fa-wrongcode");
    createdUserIds.push(owner.userId);
    await enableTwoFactor(owner);

    const device = request.agent(app);
    await device.post("/api/auth/staff/login").send({ email: owner.email, password: owner.password });
    const verify = await device.post("/api/auth/2fa/verify").send({ code: "000000" });
    expect(verify.status).toBe(401);
    expect((await device.get("/api/auth/me")).status).toBe(401);
  });

  it("accepts a backup code once, then rejects its reuse", async () => {
    const owner = await createAndLoginOwner("2fa-backup");
    createdUserIds.push(owner.userId);
    const { backupCodes } = await enableTwoFactor(owner);
    const code = backupCodes[0];

    const device = request.agent(app);
    await device.post("/api/auth/staff/login").send({ email: owner.email, password: owner.password });
    const first = await device.post("/api/auth/2fa/verify").send({ code });
    expect(first.status).toBe(200);

    // เหลือ 9 ชุด
    const status = await owner.agent.get("/api/auth/2fa/status");
    expect(status.body.backupCodesRemaining).toBe(9);

    // ใช้ซ้ำไม่ได้
    const device2 = request.agent(app);
    await device2.post("/api/auth/staff/login").send({ email: owner.email, password: owner.password });
    const reuse = await device2.post("/api/auth/2fa/verify").send({ code });
    expect(reuse.status).toBe(401);
  });

  it("disables 2FA only with the correct password", async () => {
    const owner = await createAndLoginOwner("2fa-disable");
    createdUserIds.push(owner.userId);
    await enableTwoFactor(owner);

    const wrong = await owner.agent
      .post("/api/auth/2fa/disable")
      .send({ currentPassword: "not-the-password" });
    expect(wrong.status).toBe(401);

    const ok = await owner.agent
      .post("/api/auth/2fa/disable")
      .send({ currentPassword: owner.password });
    expect(ok.status).toBe(204);

    expect((await owner.agent.get("/api/auth/2fa/status")).body).toEqual({
      enabled: false,
      backupCodesRemaining: 0,
    });

    // เมื่อปิดแล้ว ล็อกอินต้องเข้าได้เลยโดยไม่ต้อง 2FA
    const device = request.agent(app);
    const login = await device
      .post("/api/auth/staff/login")
      .send({ email: owner.email, password: owner.password });
    expect(login.body.user?.email).toBe(owner.email);
    expect(login.body.twoFactorRequired).toBeUndefined();
  });

  it("blocks 2FA management endpoints when not authenticated", async () => {
    expect((await request(app).get("/api/auth/2fa/status")).status).toBe(401);
    expect((await request(app).post("/api/auth/2fa/setup")).status).toBe(401);
    expect((await request(app).post("/api/auth/2fa/verify").send({ code: "123456" })).status).toBe(
      401,
    );
  });
});
