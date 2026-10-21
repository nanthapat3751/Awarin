import { authenticator } from "otplib";

import { prisma } from "../../src/lib/prisma";
import { resetAllRateLimits } from "../../src/lib/rate-limit";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * ขั้นตอนบัญชีพนักงานที่ต้องกดตามลำดับ — ทำผิดลำดับต้องได้ข้อความบอกว่าต้องทำอะไรก่อน ไม่ใช่ 500
 * - 2FA: เปิดก่อนเริ่มตั้งค่า · ตั้งค่าซ้ำตอนเปิดอยู่ · ขอ QR/รหัสสำรองตอนยังไม่เปิด · รหัสผิด
 * - OWNER จัดการพนักงาน: แก้รหัส/ปิดบัญชีของตัวเองผ่านหน้าจัดการพนักงานไม่ได้
 */
describe("staff account step-order guards", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-acct-guards-owner");
    admin = await createAndLoginAdmin("test-acct-guards-admin");
  });

  beforeEach(async () => {
    await resetAllRateLimits();
  });

  afterAll(async () => {
    const ids = [owner.userId, admin.userId];
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  describe("two-factor setup order", () => {
    it("refuses to activate before setup was started", async () => {
      const res = await admin.agent.post("/api/auth/2fa/activate").send({ token: "123456" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ยังไม่ได้เริ่มตั้งค่า 2FA กรุณาเริ่มใหม่");
    });

    it("refuses device and backup-code actions while 2FA is off", async () => {
      const device = await admin.agent.post("/api/auth/2fa/add-device").send({ currentPassword: "Quiet-lantern-42-riverbank" });
      expect(device.status).toBe(400);
      expect(device.body.error).toBe("บัญชีนี้ยังไม่ได้เปิดใช้ 2FA");
      const codes = await admin.agent.post("/api/auth/2fa/backup-codes").send({ token: "123456" });
      expect(codes.status).toBe(400);
      expect(codes.body.error).toBe("บัญชีนี้ยังไม่ได้เปิดใช้ 2FA");
    });

    it("rejects a wrong code, then once on refuses setup/activate again and checks password and code", async () => {
      const setup = await admin.agent.post("/api/auth/2fa/setup");
      expect(setup.status).toBe(200);
      const secret = setup.body.secret as string;

      const wrong = await admin.agent.post("/api/auth/2fa/activate").send({ token: "000000" });
      expect(wrong.status).toBe(400);
      expect(wrong.body.error).toBe("รหัสยืนยันไม่ถูกต้อง");

      const ok = await admin.agent.post("/api/auth/2fa/activate").send({ token: authenticator.generate(secret) });
      expect(ok.status).toBe(200);

      const again = await admin.agent.post("/api/auth/2fa/setup");
      expect(again.status).toBe(400);
      expect(again.body.error).toBe("บัญชีนี้เปิดใช้ 2FA อยู่แล้ว");
      const reActivate = await admin.agent.post("/api/auth/2fa/activate").send({ token: "123456" });
      expect(reActivate.body.error).toBe("บัญชีนี้เปิดใช้ 2FA อยู่แล้ว");

      const badPassword = await admin.agent.post("/api/auth/2fa/add-device").send({ currentPassword: "Not-the-password-9!" });
      expect(badPassword.status).toBe(401);
      expect(badPassword.body.error).toBe("รหัสผ่านไม่ถูกต้อง");

      const device = await admin.agent.post("/api/auth/2fa/add-device").send({ currentPassword: "Quiet-lantern-42-riverbank" });
      expect(device.status).toBe(200);
      // เครื่องใหม่ต้องได้ secret เดิม ไม่ใช่ชุดใหม่ — ไม่งั้นเครื่องเก่าใช้ไม่ได้ทันที
      expect(device.body.secret).toBe(secret);
      expect(device.body.qrDataUrl).toMatch(/^data:image\/png;base64,/);

      const badCode = await admin.agent.post("/api/auth/2fa/backup-codes").send({ token: "000000" });
      expect(badCode.status).toBe(400);
      expect(badCode.body.error).toBe("รหัสยืนยันไม่ถูกต้อง");

      const audit = await prisma.auditLog.findFirst({ where: { userId: admin.userId, action: "2FA_DEVICE_ADDED" } });
      expect(audit).not.toBeNull();
    });
  });

  describe("owner managing staff", () => {
    it("cannot reset or deactivate their own account from the staff page", async () => {
      const reset = await owner.agent
        .post(`/api/users/${owner.userId}/reset-password`)
        .send({ newPassword: "Brand-new-Pass-77!" });
      expect(reset.status).toBe(400);
      expect(reset.body.error).toBe("เปลี่ยนรหัสของตัวเองที่หน้า ตั้งค่า > ความปลอดภัย");

      const off = await owner.agent.post(`/api/users/${owner.userId}/active`).send({ active: false });
      expect(off.status).toBe(400);
      expect(off.body.error).toBe("ปิดใช้งานบัญชีของตัวเองไม่ได้");
    });

    it("deactivates another staff member, which signs them out, and reactivates them", async () => {
      const temp = await createAndLoginAdmin("test-acct-guards-temp");
      const off = await owner.agent.post(`/api/users/${temp.userId}/active`).send({ active: false });
      expect(off.status).toBe(204);
      expect((await temp.agent.get("/api/auth/me")).status).toBe(401);

      const on = await owner.agent.post(`/api/users/${temp.userId}/active`).send({ active: true });
      expect(on.status).toBe(204);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: temp.userId } })).active).toBe(true);
      await prisma.session.deleteMany({ where: { userId: temp.userId } });
      await prisma.user.delete({ where: { id: temp.userId } });
    });

    it("refuses a new password that is the same as the old one", async () => {
      const res = await owner.agent
        .post(`/api/users/${admin.userId}/reset-password`)
        .send({ newPassword: "Quiet-lantern-42-riverbank" });
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe("string");
    });
  });
});
