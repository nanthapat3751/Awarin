import request from "supertest";

import { app } from "../../src/app";
import { clearOutbox, lastMailTo, type MailMessage } from "../../src/lib/mailer";
import { resetAllRateLimits } from "../../src/lib/rate-limit";
import { prisma } from "../../src/lib/prisma";
import { createStaffRecoveryLink } from "../../src/modules/auth/password-reset.service";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * พนักงานลืมรหัสผ่าน: ตั้งอีเมลกู้รหัส (ยืนยันด้วยรหัส 6 หลัก) → ขอลิงก์ด้วยชื่อผู้ใช้ → ตั้งรหัสใหม่
 * + OWNER ปิด 2FA ให้ตอนรีเซ็ต + ทางกู้จากเครื่องเซิร์ฟเวอร์ · เมลในเทสต์ไม่ส่งจริง (โหมด silent เก็บใน outbox)
 */

async function waitForMail(to: string, subjectPart: string): Promise<MailMessage | undefined> {
  for (let i = 0; i < 60; i++) {
    const mail = lastMailTo(to);
    if (mail && mail.subject.includes(subjectPart)) return mail;
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}

const codeIn = (mail: MailMessage) => /\b(\d{6})\b/.exec(mail.text ?? mail.html ?? "")?.[1];
const tokenIn = (mail: MailMessage) => /\/reset-password\/([A-Za-z0-9_-]{20,})/.exec(mail.html ?? mail.text ?? "")?.[1];

describe("staff password recovery", () => {
  const userIds: string[] = [];
  const runId = Date.now().toString(36);

  beforeEach(async () => {
    clearOutbox();
    await resetAllRateLimits();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("creating staff requires an email, unverified until the person confirms it", async () => {
    const owner = await createAndLoginOwner("test-recover-owner");
    userIds.push(owner.userId);
    const base = { username: `rec-${runId}`, fullName: "พนักงานกู้รหัส", role: "ADMIN", password: "Olive-kestrel-52-snowdrift" };

    expect((await owner.agent.post("/api/users").send(base)).status).toBe(400);
    const ok = await owner.agent.post("/api/users").send({ ...base, email: `rec-${runId}@gmail.com` });
    expect(ok.status).toBe(201);
    userIds.push(ok.body.user.id);
    expect(ok.body.user).toMatchObject({ email: `rec-${runId}@gmail.com`, emailVerified: false });

    const dup = await owner.agent
      .post("/api/users")
      .send({ ...base, username: `rec2-${runId}`, email: `rec-${runId}@gmail.com` });
    expect(dup.status).toBe(409);
  });

  it("set + verify recovery email, then reset by username through the emailed link", async () => {
    const staff = await createAndLoginAdmin("test-recover-staff");
    userIds.push(staff.userId);
    const email = `recover-${runId}@gmail.com`;

    // ยังไม่ยืนยัน → ขอลิงก์แล้วไม่มีเมลออก (แต่ตอบ ok เหมือนกัน)
    const early = await request(app).post("/api/auth/staff/forgot-password").send({ username: staff.username });
    expect(early.body).toEqual({ ok: true });

    // ตั้งอีเมล: รหัสผ่านผิด → ไม่ได้
    const wrong = await staff.agent.post("/api/account/email").send({ email, currentPassword: "nope" });
    expect(wrong.status).toBe(400);
    const set = await staff.agent.post("/api/account/email").send({ email, currentPassword: staff.password });
    expect(set.status).toBe(200);
    expect(set.body.user).toMatchObject({ email, emailVerified: false });

    const codeMail = await waitForMail(email, "รหัสยืนยันอีเมล");
    expect(codeMail).toBeDefined();
    const code = codeIn(codeMail!);
    expect(code).toMatch(/^\d{6}$/);

    const bad = await staff.agent.post("/api/account/email/verify").send({ code: code === "000000" ? "111111" : "000000" });
    expect(bad.status).toBe(400);
    const verified = await staff.agent.post("/api/account/email/verify").send({ code });
    expect(verified.status).toBe(200);
    expect(verified.body.user.emailVerified).toBe(true);
    expect((await staff.agent.get("/api/auth/me")).body.user.emailVerified).toBe(true);

    // ขอลิงก์ด้วยชื่อผู้ใช้ (ตัวพิมพ์ใหญ่ก็ได้) → เมลมีลิงก์ไปหน้าเว็บพนักงาน
    clearOutbox();
    await request(app).post("/api/auth/staff/forgot-password").send({ username: staff.username.toUpperCase() });
    const linkMail = await waitForMail(email, "ตั้งรหัสผ่านใหม่");
    expect(linkMail).toBeDefined();
    expect(linkMail!.html ?? linkMail!.text).toContain("http://localhost:5173/reset-password/");
    const token = tokenIn(linkMail!)!;

    // ลิงก์ของพนักงานใช้ที่ปลายทางของลูกค้าไม่ได้
    expect((await request(app).get(`/api/auth/customer/reset-password/${token}`)).status).toBe(400);
    const inspect = await request(app).get(`/api/auth/staff/reset-password/${token}`);
    expect(inspect.status).toBe(200);
    expect(inspect.body.username).toBe(staff.username);
    expect(inspect.body.maskedEmail).toContain("•");

    const newPassword = "Copper-meadow-47-lantern";
    const reset = await request(app).post("/api/auth/staff/reset-password").send({ token, password: newPassword });
    expect(reset.status).toBe(200);
    // ลิงก์ใช้ได้ครั้งเดียว · เครื่องเดิมหลุด · เข้าด้วยรหัสใหม่ได้
    expect((await request(app).post("/api/auth/staff/reset-password").send({ token, password: "Another-river-58-stone" })).status).toBe(400);
    expect((await staff.agent.get("/api/auth/me")).status).toBe(401);
    const login = await request(app).post("/api/auth/staff/login").send({ username: staff.username, password: newPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(false);

    // ไม่มีชื่อนี้ → ตอบ ok เหมือนกัน ไม่มีเมลออก
    clearOutbox();
    const ghost = await request(app).post("/api/auth/staff/forgot-password").send({ username: `ghost-${runId}` });
    expect(ghost.body).toEqual({ ok: true });
  });

  it("owner can switch off a staff member's 2FA while resetting their password", async () => {
    const owner = await createAndLoginOwner("test-recover-2fa-owner");
    const staff = await createAndLoginAdmin("test-recover-2fa-staff");
    userIds.push(owner.userId, staff.userId);
    await prisma.user.update({
      where: { id: staff.userId },
      data: { totpEnabled: true, totpSecret: "JBSWY3DPEHPK3PXP", twoFactorBackupCodes: ["x"] },
    });
    const listed = (await owner.agent.get("/api/users")).body.users.find((u: { id: string }) => u.id === staff.userId);
    expect(listed.twoFactorEnabled).toBe(true);

    const res = await owner.agent
      .post(`/api/users/${staff.userId}/reset-password`)
      .send({ newPassword: "Granite-willow-63-harbor", disableTwoFactor: true });
    expect(res.status).toBe(204);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: staff.userId },
      select: { totpEnabled: true, totpSecret: true, twoFactorBackupCodes: true },
    });
    expect(after).toEqual({ totpEnabled: false, totpSecret: null, twoFactorBackupCodes: [] });
  });

  it("server-side recovery link works for an owner with no verified email", async () => {
    const owner = await createAndLoginOwner("test-recover-cli");
    userIds.push(owner.userId);
    const { url } = await createStaffRecoveryLink(owner.username.toUpperCase());
    expect(url).toMatch(/^http:\/\/localhost:5173\/reset-password\//);
    const token = url.split("/").pop()!;
    expect((await request(app).get(`/api/auth/staff/reset-password/${token}`)).status).toBe(200);
    await expect(createStaffRecoveryLink(`ghost-${runId}`)).rejects.toThrow("ไม่พบบัญชีพนักงาน");
  });
});
