import { authenticator } from "otplib";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { resetAllRateLimits } from "../../src/lib/rate-limit";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * รหัสจากแอปของช่วงเวลาถัดไป `steps` ช่วง (ช่วงละ 30 วิ) — รหัสใช้ได้ครั้งเดียวต่อช่วง และ enableTwoFactor
 * ใช้รหัสของช่วงปัจจุบันไปแล้ว เทสต์ที่ล็อกอินต่อจึงต้องใช้ช่วงที่ใหม่กว่า (ระบบยอมเวลาคลาดถึง +3 ช่วง)
 */
function codeAt(secret: string, steps: number): string {
  return authenticator.clone({ epoch: Date.now() + steps * 30_000 }).generate(secret);
}

describe("two-factor auth (2FA / TOTP)", () => {
  const createdUserIds: string[] = [];

  // ทุกคำขอในเทสต์มาจากไอพีเดียวกัน — ไม่ล้าง limiter ต่อไอพี (30 ครั้ง/15 นาที) จะชนก่อนถึงเพดานต่อบัญชีที่กำลังทดสอบ
  beforeEach(async () => {
    await resetAllRateLimits();
  });

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
      .send({ username: owner.username, password: owner.password });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ twoFactorRequired: true });

    const meBefore = await device.get("/api/auth/me");
    expect(meBefore.status).toBe(401); // session ครึ่งทางยังไม่ถือว่าล็อกอิน

    const verify = await device
      .post("/api/auth/2fa/verify")
      .send({ code: codeAt(secret, 1) });
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
    await device.post("/api/auth/staff/login").send({ username: owner.username, password: owner.password });
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
    await device.post("/api/auth/staff/login").send({ username: owner.username, password: owner.password });
    const first = await device.post("/api/auth/2fa/verify").send({ code });
    expect(first.status).toBe(200);

    // เหลือ 9 ชุด
    const status = await owner.agent.get("/api/auth/2fa/status");
    expect(status.body.backupCodesRemaining).toBe(9);

    // ใช้ซ้ำไม่ได้
    const device2 = request.agent(app);
    await device2.post("/api/auth/staff/login").send({ username: owner.username, password: owner.password });
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
      .send({ username: owner.username, password: owner.password });
    expect(login.body.user?.email).toBe(owner.email);
    expect(login.body.twoFactorRequired).toBeUndefined();
  });

  // ── ช่องโหว่ที่ปิดแล้ว: รหัสใช้ซ้ำ / ส่งพร้อมกัน / เพดานต่อบัญชี ──

  // ล็อกอินด้วยรหัสผ่านจากอุปกรณ์ใหม่ ได้เซสชันครึ่งทางที่รอรหัส 2FA
  async function pendingDevice(owner: Awaited<ReturnType<typeof createAndLoginOwner>>) {
    const device = request.agent(app);
    const login = await device
      .post("/api/auth/staff/login")
      .send({ username: owner.username, password: owner.password });
    expect(login.body).toEqual({ twoFactorRequired: true });
    return device;
  }

  it("rejects a TOTP code that was already used, and any older one", async () => {
    const owner = await createAndLoginOwner("2fa-replay");
    createdUserIds.push(owner.userId);
    const { secret } = await enableTwoFactor(owner);

    const code = codeAt(secret, 2);
    expect((await (await pendingDevice(owner)).post("/api/auth/2fa/verify").send({ code })).status).toBe(200);

    // คนที่แอบเห็นรหัสเดียวกันเอาไปใช้ต่อ — ต้องไม่ผ่าน แม้ยังอยู่ในช่วงเวลาที่ยอมรับ
    const thief = await pendingDevice(owner);
    const replay = await thief.post("/api/auth/2fa/verify").send({ code });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toContain("ถูกใช้ไปแล้ว");
    // รหัสของช่วงก่อนหน้าก็ใช้ไม่ได้แล้ว (ผ่านช่วงที่ใหม่กว่าไปแล้ว)
    const older = await thief.post("/api/auth/2fa/verify").send({ code: codeAt(secret, 1) });
    expect(older.status).toBe(401);
    expect((await thief.get("/api/auth/me")).status).toBe(401);

    // รหัสของช่วงถัดไปยังใช้ได้ตามปกติ
    expect((await thief.post("/api/auth/2fa/verify").send({ code: codeAt(secret, 3) })).status).toBe(200);
  });

  it("lets only one of two simultaneous requests use the same TOTP code", async () => {
    const owner = await createAndLoginOwner("2fa-race-totp");
    createdUserIds.push(owner.userId);
    const { secret } = await enableTwoFactor(owner);

    const [a, b] = await Promise.all([pendingDevice(owner), pendingDevice(owner)]);
    const code = codeAt(secret, 1);
    const results = await Promise.all([
      a.post("/api/auth/2fa/verify").send({ code }),
      b.post("/api/auth/2fa/verify").send({ code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it("lets only one of two simultaneous requests use the same backup code", async () => {
    const owner = await createAndLoginOwner("2fa-race-backup");
    createdUserIds.push(owner.userId);
    const { backupCodes } = await enableTwoFactor(owner);

    const [a, b] = await Promise.all([pendingDevice(owner), pendingDevice(owner)]);
    const results = await Promise.all([
      a.post("/api/auth/2fa/verify").send({ code: backupCodes[0] }),
      b.post("/api/auth/2fa/verify").send({ code: backupCodes[0] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect((await owner.agent.get("/api/auth/2fa/status")).body.backupCodesRemaining).toBe(9);
  });

  it("drops the half-way session after 5 wrong codes, so the password must be entered again", async () => {
    const owner = await createAndLoginOwner("2fa-session-cap");
    createdUserIds.push(owner.userId);
    const { secret } = await enableTwoFactor(owner);

    const device = await pendingDevice(owner);
    for (let i = 1; i <= 4; i += 1) {
      const res = await device.post("/api/auth/2fa/verify").send({ code: "000000" });
      expect(res.status).toBe(401);
      expect(res.body.restartLogin).toBeUndefined();
    }
    const fifth = await device.post("/api/auth/2fa/verify").send({ code: "000000" });
    expect(fifth.status).toBe(401);
    expect(fifth.body.restartLogin).toBe(true);

    // รหัสถูกก็ไม่ช่วยแล้ว — เซสชันนี้ถูกทิ้ง ต้องกลับไปกรอกรหัสผ่าน
    const after = await device.post("/api/auth/2fa/verify").send({ code: codeAt(secret, 1) });
    expect(after.status).toBe(401);
    expect(after.body.restartLogin).toBe(true);
  });

  it("suspends the 2FA step for the account after 10 wrong codes, whichever session or IP they came from", async () => {
    const owner = await createAndLoginOwner("2fa-account-cap");
    createdUserIds.push(owner.userId);
    const { secret } = await enableTwoFactor(owner);

    // 9 ครั้งแรกกระจายไปคนละเซสชัน + ล้าง limiter ต่อไอพีเป็นระยะ (เหมือนคนเดาที่ล็อกอินใหม่/สลับไอพีไปเรื่อย ๆ)
    for (let i = 0; i < 9; i += 1) {
      if (i % 4 === 0) await resetAllRateLimits();
      const device = await pendingDevice(owner);
      expect((await device.post("/api/auth/2fa/verify").send({ code: "000000" })).status).toBe(401);
    }
    const tenth = await (await pendingDevice(owner)).post("/api/auth/2fa/verify").send({ code: "000000" });
    expect(tenth.status).toBe(423);
    expect(tenth.body.restartLogin).toBe(true);
    expect(tenth.body.retryAfter).toBeGreaterThan(14 * 60);
    expect(tenth.body.retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(tenth.headers["retry-after"]).toBe(String(tenth.body.retryAfter));

    // ระหว่างระงับ รหัสถูกต้องก็ไม่ถูกตรวจ (และไม่ถูกจดว่าใช้แล้ว)
    const blocked = await (await pendingDevice(owner))
      .post("/api/auth/2fa/verify")
      .send({ code: codeAt(secret, 1) });
    expect(blocked.status).toBe(423);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(row.twoFactorFailedCount).toBe(10);

    // ครบเวลาแล้วรหัสเดียวกันนั้นผ่าน และตัวนับกลับเป็นศูนย์
    await prisma.user.update({
      where: { id: owner.userId },
      data: { twoFactorLockedUntil: new Date(Date.now() - 1000) },
    });
    expect(
      (await (await pendingDevice(owner)).post("/api/auth/2fa/verify").send({ code: codeAt(secret, 1) })).status,
    ).toBe(200);
    const cleared = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
    expect(cleared.twoFactorFailedCount).toBe(0);
    expect(cleared.twoFactorLockedUntil).toBeNull();
  });

  it("doubles the suspension for every 5 further wrong codes, capped at one day", async () => {
    const owner = await createAndLoginOwner("2fa-escalate");
    createdUserIds.push(owner.userId);
    await enableTwoFactor(owner);

    const wrongAfter = async (failedSoFar: number) => {
      await prisma.user.update({
        where: { id: owner.userId },
        data: { twoFactorFailedCount: failedSoFar, twoFactorLockedUntil: new Date(Date.now() - 1000) },
      });
      return (await pendingDevice(owner)).post("/api/auth/2fa/verify").send({ code: "000000" });
    };

    expect((await wrongAfter(10)).status).toBe(401); // ครั้งที่ 11 ยังไม่ถึงรอบระงับถัดไป
    const fifteenth = await wrongAfter(14);
    expect(fifteenth.status).toBe(423);
    expect(fifteenth.body.retryAfter).toBeGreaterThan(29 * 60);
    expect(fifteenth.body.retryAfter).toBeLessThanOrEqual(30 * 60);
    // ตัวนับสูงมาก ๆ ต้องไม่ทำ SQL ล้น และระงับไม่เกิน 1 วัน
    const huge = await wrongAfter(1_000_004);
    expect(huge.status).toBe(423);
    expect(huge.body.retryAfter).toBeGreaterThan(24 * 60 * 60 - 60);
    expect(huge.body.retryAfter).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("forgets earlier wrong codes once the user gets through", async () => {
    const owner = await createAndLoginOwner("2fa-clear");
    createdUserIds.push(owner.userId);
    const { secret } = await enableTwoFactor(owner);

    const device = await pendingDevice(owner);
    for (let i = 0; i < 3; i += 1) await device.post("/api/auth/2fa/verify").send({ code: "000000" });
    expect((await device.post("/api/auth/2fa/verify").send({ code: codeAt(secret, 1) })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })).twoFactorFailedCount).toBe(0);
  });

  it("rejects reusing the activation code to regenerate backup codes", async () => {
    const owner = await createAndLoginOwner("2fa-regen-replay");
    createdUserIds.push(owner.userId);
    const { secret } = await enableTwoFactor(owner);

    const reuse = await owner.agent
      .post("/api/auth/2fa/backup-codes")
      .send({ token: authenticator.generate(secret) });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error).toContain("ถูกใช้ไปแล้ว");
    expect(
      (await owner.agent.post("/api/auth/2fa/backup-codes").send({ token: codeAt(secret, 1) })).status,
    ).toBe(200);
  });

  it("blocks 2FA management endpoints when not authenticated", async () => {
    expect((await request(app).get("/api/auth/2fa/status")).status).toBe(401);
    expect((await request(app).post("/api/auth/2fa/setup")).status).toBe(401);
    expect((await request(app).post("/api/auth/2fa/verify").send({ code: "123456" })).status).toBe(
      401,
    );
  });
});
