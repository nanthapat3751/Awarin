/**
 * โหมด smtp ของ mailer.ts — nodemailer ถูกแทนด้วยตัวปลอมทั้งก้อน จึงไม่มีทางยิงเมลจริง
 * (dev server ของโปรเจกต์นี้ส่งผ่าน Gmail จริง ห้ามให้เทสต์แตะ)
 *
 * สิ่งที่ตรวจ: ต่อได้/ต่อไม่ได้ถูกบันทึกให้หน้า "การส่งอีเมล" เห็น · ส่งพังแล้วไม่โยน error ใส่ผู้ใช้ ·
 * แปล error ของ SMTP เป็นคำแนะนำว่าต้องแก้ค่าไหน · เตือนตอนบูตเมื่อเมลไม่ได้ออกไปจริง
 */
const verify = jest.fn();
const send = jest.fn();
const createTransport = jest.fn(() => ({ verify, sendMail: send }));
jest.mock("nodemailer", () => ({ __esModule: true, default: { createTransport } }));

import { prisma } from "../../src/lib/prisma";
import {
  clearOutbox,
  describeSmtpError,
  lastMailTo,
  mailStatus,
  reportMailOnStartup,
  sendMail,
  transportMode,
  verifyMailTransport,
  warnIfMailNotSending,
} from "../../src/lib/mailer";

const ENV_KEYS = ["MAIL_TRANSPORT", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_SECURE", "CLIENT_BASE_URL"];

describe("mailer", () => {
  const saved: Record<string, string | undefined> = {};
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;
  let info: jest.SpyInstance;

  beforeAll(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
  });

  beforeEach(() => {
    verify.mockReset();
    send.mockReset();
    createTransport.mockClear();
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    info = jest.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function useSmtp(extra: Record<string, string> = {}) {
    process.env.MAIL_TRANSPORT = "smtp";
    process.env.SMTP_HOST = "smtp.test.invalid";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "sender@test.invalid";
    process.env.SMTP_PASS = "app-password";
    delete process.env.SMTP_SECURE;
    Object.assign(process.env, extra);
  }

  describe("transport mode", () => {
    it("defaults to console and understands smtp / silent in any case", () => {
      delete process.env.MAIL_TRANSPORT;
      expect(transportMode()).toBe("console");
      process.env.MAIL_TRANSPORT = "SMTP";
      expect(transportMode()).toBe("smtp");
      process.env.MAIL_TRANSPORT = "Silent";
      expect(transportMode()).toBe("silent");
      process.env.MAIL_TRANSPORT = "carrier-pigeon";
      expect(transportMode()).toBe("console");
    });

    it("prints the mail to the log in console mode and keeps it for tests", async () => {
      process.env.MAIL_TRANSPORT = "console";
      clearOutbox();
      expect(await sendMail({ to: "Someone@Example.com", subject: "หัวเรื่อง", text: "เนื้อหา" })).toBe(true);
      expect(info).toHaveBeenCalledWith(expect.stringContaining("หัวเรื่อง"));
      expect(lastMailTo("someone@example.com")?.text).toBe("เนื้อหา");
      expect(createTransport).not.toHaveBeenCalled();
    });

    it("keeps only the latest 20 mails in the outbox", async () => {
      process.env.MAIL_TRANSPORT = "silent";
      clearOutbox();
      for (let i = 0; i < 25; i++) await sendMail({ to: `u${i}@example.com`, subject: "s", text: String(i) });
      expect(lastMailTo("u0@example.com")).toBeUndefined();
      expect(lastMailTo("u24@example.com")?.text).toBe("24");
    });

    it("warns loudly at startup when mail is not really sent", async () => {
      process.env.MAIL_TRANSPORT = "console";
      await reportMailOnStartup();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ไม่ถูกส่งออกไปจริง"));
      expect(warn.mock.calls[0][0]).toContain("จะถูกพิมพ์ลง log");

      warn.mockClear();
      process.env.MAIL_TRANSPORT = "silent";
      warnIfMailNotSending();
      expect(warn.mock.calls[0][0]).toContain("ทิ้งเงียบ");

      warn.mockClear();
      useSmtp();
      warnIfMailNotSending();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("smtp mode", () => {
    it("has nothing to verify outside smtp mode", async () => {
      process.env.MAIL_TRANSPORT = "console";
      expect(await verifyMailTransport()).toBeNull();
      const status = await mailStatus();
      expect(status).toMatchObject({ mode: "console", smtp: null, lastCheck: null });
    });

    it("records a successful connection check and reports it in the status", async () => {
      useSmtp({ SMTP_PORT: "465" });
      verify.mockResolvedValue(true);
      const check = await verifyMailTransport();
      expect(check).toMatchObject({ ok: true, problem: null });

      const status = await mailStatus();
      expect(status.mode).toBe("smtp");
      expect(status.smtp).toEqual({ host: "smtp.test.invalid", port: 465, secure: true, user: "sender@test.invalid" });
      expect(status.lastCheck).toMatchObject({ ok: true });
      // พอร์ต 465 = เข้ารหัสตั้งแต่ต่อ
      expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
    });

    it("records a failed connection with an actionable explanation", async () => {
      useSmtp({ SMTP_HOST: "smtp.wrong-host.invalid", SMTP_SECURE: "false" });
      verify.mockRejectedValue(Object.assign(new Error("Invalid login: 535-5.7.8"), { code: "EAUTH" }));
      const check = await verifyMailTransport();
      expect(check!.ok).toBe(false);
      expect(check!.problem).toContain("App Password");
      expect((await mailStatus()).lastCheck).toMatchObject({ ok: false });
    });

    it("refuses to build a transport without SMTP_HOST", async () => {
      useSmtp();
      delete process.env.SMTP_HOST;
      const check = await verifyMailTransport();
      expect(check).toMatchObject({ ok: false });
      expect(check!.problem).toContain("SMTP_HOST");
    });

    it("logs a successful startup check and warns when links still point at localhost", async () => {
      useSmtp({ SMTP_HOST: "smtp.startup-ok.invalid", CLIENT_BASE_URL: "http://localhost:5174" });
      verify.mockResolvedValue(true);
      await reportMailOnStartup();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("เชื่อมต่อสำเร็จ"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("CLIENT_BASE_URL"));
    });

    it("warns at startup when the smtp connection fails", async () => {
      useSmtp({ SMTP_HOST: "smtp.startup-bad.invalid" });
      verify.mockRejectedValue(new Error("getaddrinfo ENOTFOUND smtp.startup-bad.invalid"));
      await reportMailOnStartup();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ไม่สำเร็จ — เมลจะส่งไม่ออก"));
    });

    it("sends through the transport with inline images, without keeping a copy", async () => {
      useSmtp({ SMTP_HOST: "smtp.send-ok.invalid" });
      clearOutbox();
      send.mockResolvedValue({ messageId: "x" });
      const ok = await sendMail({
        to: "customer@example.com",
        subject: "ใบเสนอราคา",
        text: "t",
        html: "<img src=\"cid:logo\">",
        inlineImages: [{ cid: "logo", filename: "logo.png", content: Buffer.from("png"), contentType: "image/png" }],
      });
      expect(ok).toBe(true);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "customer@example.com",
          attachments: [expect.objectContaining({ cid: "logo", contentDisposition: "inline" })],
        }),
      );
      expect(lastMailTo("customer@example.com")).toBeUndefined();
    });

    it("returns false instead of throwing when sending fails, and records why", async () => {
      useSmtp({ SMTP_HOST: "smtp.send-bad.invalid" });
      send.mockRejectedValue(Object.assign(new Error("Mailbox unavailable"), { responseCode: 550 }));
      expect(await sendMail({ to: "x@example.com", subject: "s", text: "t" })).toBe(false);
      expect(error).toHaveBeenCalled();
      const status = await mailStatus();
      expect(status.lastCheck!.problem).toContain("MAIL_FROM");
    });

    it("reuses one transport for the same settings", async () => {
      useSmtp({ SMTP_HOST: "smtp.reuse.invalid" });
      send.mockResolvedValue({});
      await sendMail({ to: "a@example.com", subject: "s", text: "t" });
      await sendMail({ to: "b@example.com", subject: "s", text: "t" });
      expect(createTransport).toHaveBeenCalledTimes(1);
    });
  });

  describe("describeSmtpError", () => {
    beforeEach(() => useSmtp({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587" }));

    it.each([
      [{ responseCode: 534, message: "x" }, "App Password"],
      [{ message: "wrong version number" }, "พอร์ต 587 ต้องตั้ง SMTP_SECURE=false"],
      [{ code: "EDNS", message: "x" }, "หาเซิร์ฟเวอร์ smtp.gmail.com ไม่เจอ"],
      [{ code: "ETIMEDOUT", message: "x" }, "ต่อ smtp.gmail.com:587 ไม่ได้"],
      [{ message: "connect ECONNREFUSED 1.2.3.4:587" }, "ไฟร์วอลล์"],
      [{ code: "EENVELOPE", message: "x" }, "MAIL_FROM"],
      [{ responseCode: 553, message: "x" }, "อีเมลปลายทาง"],
      [{ message: "something odd" }, "ส่งไม่สำเร็จ: something odd"],
    ])("explains %o", (err, expected) => {
      expect(describeSmtpError(err)).toContain(expected);
    });

    it("copes with a non-object error and an unset host", () => {
      delete process.env.SMTP_HOST;
      expect(describeSmtpError("plain failure")).toBe("ส่งไม่สำเร็จ: plain failure");
      expect(describeSmtpError({ message: "getaddrinfo EAI_AGAIN" })).toContain("(ว่าง)");
      expect(describeSmtpError(null)).toContain("ส่งไม่สำเร็จ");
    });
  });
});
