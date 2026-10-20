import { prisma } from "../../src/lib/prisma";
import { LOGO_CID } from "../../src/lib/mail-template";
import { clearOutbox, lastMailTo, mailStatus, verifyMailTransport } from "../../src/lib/mailer";
import { resetAllRateLimits } from "../../src/lib/rate-limit";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * หน้า "การส่งอีเมล" — สถานะ / ตรวจการเชื่อมต่อ / เมลทดสอบ (เฉพาะ OWNER)
 *
 * เทสต์ทั้งหมดรันในโหมด silent (setup-env.ts) จึงไม่มีเมลออกไปจริง — ส่วนโหมด smtp ทดสอบเฉพาะ
 * กรณีที่ต่อไม่ได้ ด้วยพอร์ตที่ไม่มีใครฟังอยู่ ซึ่งไม่ออกนอกเครื่อง
 */
describe("การส่งอีเมล (OWNER)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-mail-owner");
    admin = await createAndLoginAdmin("test-mail-admin");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [owner.userId, admin.userId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetAllRateLimits();
    clearOutbox();
  });

  it("ADMIN เห็นหรือสั่งอะไรไม่ได้เลย", async () => {
    expect((await admin.agent.get("/api/mail")).status).toBe(403);
    expect((await admin.agent.post("/api/mail/verify")).status).toBe(403);
    expect((await admin.agent.post("/api/mail/test").send({ to: "a@example.com" })).status).toBe(403);
  });

  it("สถานะบอกโหมดและปลายทางของลิงก์ ไม่มีรหัสผ่าน SMTP หลุดออกมา", async () => {
    const res = await owner.agent.get("/api/mail");
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("silent");
    expect(res.body.smtp).toBeNull();
    expect(res.body.lastCheck).toBeNull();
    expect(typeof res.body.linkBaseUrl).toBe("string");
    expect(JSON.stringify(res.body)).not.toMatch(/pass/i);
  });

  it("เมลทดสอบ: เนื้อตายตัว มีทั้ง HTML และข้อความล้วน · บันทึกแค่โดเมนปลายทางลง AuditLog", async () => {
    const to = `Mail-Test-${Date.now()}@Example.COM`;
    const res = await owner.agent.post("/api/mail/test").send({ to, subject: "แอบแก้หัวเรื่อง", text: "แอบแก้เนื้อ" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mode: "silent", to: to.toLowerCase(), deliveredForReal: false });

    const mail = lastMailTo(to.toLowerCase());
    expect(mail?.subject).toBe("ทดสอบการส่งอีเมล — Awarin Engineering");
    expect(mail?.text).not.toContain("แอบแก้");
    // โลโก้แนบแบบ CID และ HTML อ้างถึงตัวเดียวกัน (ไม่มีโลโก้ในหน้าตั้งค่า ระบบใช้โลโก้ตั้งต้น)
    expect(mail?.inlineImages?.map((i) => i.cid)).toEqual([LOGO_CID]);
    expect(mail?.html).toContain(`cid:${LOGO_CID}`);
    expect(mail?.text).toContain(to.toLowerCase());

    const audit = await prisma.auditLog.findFirst({
      where: { userId: owner.userId, action: "MAIL_TEST" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.details).toEqual({ mode: "silent", sent: true, toDomain: "example.com" });
  });

  it("ปลายทางผิดรูปแบบ → 400 และไม่ส่งอะไรออกไป", async () => {
    const res = await owner.agent.post("/api/mail/test").send({ to: "ไม่ใช่อีเมล" });
    expect(res.status).toBe(400);
    expect(lastMailTo("ไม่ใช่อีเมล")).toBeUndefined();
  });

  it("จำกัด 5 ฉบับต่อ 10 นาที — กันไม่ให้กลายเป็นช่องยิงเมลออกจากโดเมนบริษัท", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await owner.agent.post("/api/mail/test").send({ to: `rl${i}@example.com` })).status).toBe(200);
    }
    const blocked = await owner.agent.post("/api/mail/test").send({ to: "rl6@example.com" });
    expect(blocked.status).toBe(429);
  });

  it("โหมด smtp ที่ต่อไม่ได้ → ตรวจแล้วได้สาเหตุเป็นภาษาคน และเมลทดสอบตอบ 502 พร้อมสาเหตุเดียวกัน", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      MAIL_TRANSPORT: "smtp",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
      SMTP_SECURE: "false",
      SMTP_USER: "",
    });
    try {
      const check = await verifyMailTransport();
      expect(check?.ok).toBe(false);
      expect(check?.problem).toMatch(/127\.0\.0\.1:1/);
      const status = await mailStatus();
      expect(status.smtp).toEqual({ host: "127.0.0.1", port: 1, secure: false, user: null });
      // ผลตรวจอยู่ใน DB — API ตัวอื่นหลัง load balancer อ่านได้ผลเดียวกัน
      expect(status.lastCheck?.ok).toBe(false);
      expect(await prisma.mailTransportCheck.findUnique({ where: { id: 1 } })).toMatchObject({ ok: false });

      const res = await owner.agent.post("/api/mail/test").send({ to: "smtp-fail@example.com" });
      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/127\.0\.0\.1:1/);
    } finally {
      await prisma.mailTransportCheck.deleteMany({});
      for (const key of ["MAIL_TRANSPORT", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER"]) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  });
});
