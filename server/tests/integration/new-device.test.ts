import request from "supertest";

import { app } from "../../src/app";
import { DEVICE_COOKIE_NAME } from "../../src/lib/known-device";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createCustomerDirect } from "../helpers/test-auth";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

/** ค่าคุกกี้เครื่องจาก Set-Cookie ของคำตอบล็อกอิน */
function deviceCookieOf(res: request.Response): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${DEVICE_COOKIE_NAME}=`));
  return line?.split(";")[0].split("=")[1];
}

const newDeviceNotes = (userId: string) =>
  prisma.notification.findMany({
    where: { userId, message: { contains: "อุปกรณ์ใหม่" } },
    orderBy: { createdAt: "asc" },
  });

describe("new-device login alert", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("stays silent on the first device, alerts on a new one, and not again on a remembered one", async () => {
    // เครื่องแรก (ล็อกอินใน helper) — บัญชียังไม่มีเครื่องที่จำไว้ จึงไม่แจ้ง
    const admin = await createAndLoginAdmin("test-newdevice-admin");
    userIds.push(admin.userId);
    expect(await prisma.knownDevice.count({ where: { userId: admin.userId } })).toBe(1);
    expect(await newDeviceNotes(admin.userId)).toHaveLength(0);

    // เบราว์เซอร์อื่น (ไม่มีคุกกี้เครื่อง) → แจ้ง พร้อมชื่อเครื่องและไอพี ลิงก์ไปหน้าอุปกรณ์
    const phone = await request(app)
      .post("/api/auth/staff/login")
      .set("User-Agent", SAFARI_IPHONE)
      .send({ username: admin.username, password: admin.password });
    expect(phone.status).toBe(200);
    const phoneCookie = deviceCookieOf(phone);
    expect(phoneCookie).toMatch(/^[a-f0-9]{64}$/);

    const notes = await newDeviceNotes(admin.userId);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain("Safari · iPhone");
    expect(notes[0].message).toContain("IP ");
    expect(notes[0].link).toBe("/account#devices");
    const audit = await prisma.auditLog.findFirst({
      where: { userId: admin.userId, action: "NEW_DEVICE_LOGIN" },
    });
    expect(audit).not.toBeNull();

    // เครื่องเดิมกลับมาล็อกอินอีกรอบ (ส่งคุกกี้เครื่องมาด้วย) → ไม่แจ้งซ้ำ
    const again = await request(app)
      .post("/api/auth/staff/login")
      .set("User-Agent", SAFARI_IPHONE)
      .set("Cookie", `${DEVICE_COOKIE_NAME}=${phoneCookie}`)
      .send({ username: admin.username, password: admin.password });
    expect(again.status).toBe(200);
    expect(deviceCookieOf(again)).toBe(phoneCookie);
    expect(await newDeviceNotes(admin.userId)).toHaveLength(1);
    expect(await prisma.knownDevice.count({ where: { userId: admin.userId } })).toBe(2);
  });

  it("does not alert on a wrong password, and ignores a forged cookie value", async () => {
    const admin = await createAndLoginAdmin("test-newdevice-wrongpw");
    userIds.push(admin.userId);

    const wrong = await request(app)
      .post("/api/auth/staff/login")
      .send({ username: admin.username, password: "not-the-password" });
    expect(wrong.status).toBe(401);
    expect(deviceCookieOf(wrong)).toBeUndefined();

    const forged = await request(app)
      .post("/api/auth/staff/login")
      .set("User-Agent", CHROME_WINDOWS)
      .set("Cookie", `${DEVICE_COOKIE_NAME}=<script>`)
      .send({ username: admin.username, password: admin.password });
    expect(forged.status).toBe(200);
    expect(deviceCookieOf(forged)).toMatch(/^[a-f0-9]{64}$/);
    expect(await newDeviceNotes(admin.userId)).toHaveLength(1);
  });

  it("a customer's alert never contains the IP and links to the customer account page", async () => {
    const customer = await createCustomerDirect("test-newdevice-customer");
    userIds.push(customer.userId);

    await request(app)
      .post("/api/auth/customer/login")
      .set("User-Agent", CHROME_WINDOWS)
      .send({ email: customer.email, password: customer.password })
      .expect(200);

    const notes = await newDeviceNotes(customer.userId);
    expect(notes).toHaveLength(1);
    expect(notes[0].message).toContain("Chrome · Windows");
    expect(notes[0].message).not.toContain("IP");
    expect(notes[0].link).toBe("/my/account");
  });

  it("a login still waiting for its 2FA code is not a device yet", async () => {
    const admin = await createAndLoginAdmin("test-newdevice-2fa");
    userIds.push(admin.userId);
    await prisma.user.update({
      where: { id: admin.userId },
      data: { totpEnabled: true, totpSecret: "JBSWY3DPEHPK3PXP" },
    });

    const pending = await request(app)
      .post("/api/auth/staff/login")
      .send({ username: admin.username, password: admin.password });
    expect(pending.body.twoFactorRequired).toBe(true);
    expect(deviceCookieOf(pending)).toBeUndefined();
    expect(await prisma.knownDevice.count({ where: { userId: admin.userId } })).toBe(1);
    expect(await newDeviceNotes(admin.userId)).toHaveLength(0);
  });
});
