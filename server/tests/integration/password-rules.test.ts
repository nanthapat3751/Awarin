import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { resetAllRateLimits } from "../../src/lib/rate-limit";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

/**
 * กฎรหัสผ่านบนปลายทางจริง + การบังคับเปลี่ยนรหัสที่คนอื่นตั้งให้
 *
 * เทสต์หน่วยของตัวกฎอยู่ที่ tests/lib/password-rules.test.ts — ไฟล์นี้ตรวจเรื่องที่ตัวกฎเองรับผิดชอบ
 * ไม่ได้: กฎถูก "ผูกเข้ากับทุกปลายทาง" จริงไหม, ข้อที่ต้องรู้ว่าเป็นบัญชีของใครถูกตรวจใน service
 * ไหม, และธง mustChangePassword ถูกตั้ง/ปลด/บังคับใช้ครบวงจรไหม
 */
describe("กฎรหัสผ่านบน API", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdIds: string[] = [];
  const runId = Date.now();
  const ownerPassword = "Quiet-lantern-42-riverbank";

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-pwrules-owner");
    createdIds.push(owner.userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  // ปลายทางสมัคร/ลืมรหัสมีเพดานจำนวนครั้งต่อไอพี — เทสต์ในไฟล์นี้ยิงหลายรอบ
  beforeEach(async () => {
    await resetAllRateLimits();
  });

  // ─────────────── กฎที่ตรวจได้จากสคีมา ───────────────

  describe("สมัครสมาชิก", () => {
    async function register(password: string, fullName = "วนิดา ทดสอบ") {
      const email = `pwrules-${runId}-${Math.random().toString(36).slice(2, 8)}@example.com`;
      const res = await request(app)
        .post("/api/auth/customer/register")
        .send({ email, password, fullName, phone: "0891112233" });
      return { res, email };
    }

    it("ปฏิเสธรหัสที่ขาดพิมพ์ใหญ่ / พิมพ์เล็ก / ตัวเลข — บอกข้อที่ขาดตรง ๆ", async () => {
      expect((await register("kanoklak7")).res.body.error).toContain("พิมพ์ใหญ่");
      expect((await register("KANOKLAK7")).res.body.error).toContain("พิมพ์เล็ก");
      const noDigit = await register("Kanoklak!");
      expect(noDigit.res.status).toBe(400);
      expect(noDigit.res.body.error).toContain("ตัวเลข");
    });

    it("ปฏิเสธรหัสที่อยู่ในรายการที่ถูกเดาบ่อย", async () => {
      const { res } = await register("Password123!");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("เดาบ่อย");
    });

    it("ปฏิเสธรหัสที่มีชื่อของเจ้าตัวอยู่ข้างใน — ข้อนี้ตรวจได้เพราะชื่อมาในคำขอเดียวกัน", async () => {
      const { res } = await register("Wanida-quiet-lantern-4", "Wanida Preecha");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("ชื่อ");
    });

    it("ปฏิเสธรหัสที่ยาวเกินเพดาน — กัน argon2 ถูกยิงด้วยข้อมูลยาว ๆ", async () => {
      const { res } = await register("Abcdefgh1!".repeat(20));
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("ยาวเกิน");
    });

    it("วลียาวที่ไม่มีพิมพ์ใหญ่/ตัวเลขไม่ผ่านแล้ว — ไม่มีทาง 16 ตัวอีก (เปลี่ยนกฎ 7 ต.ค. 2569)", async () => {
      const { res } = await register("meadowlanternriverbank");
      expect(res.status).toBe(400);
    });

    it("ปฏิเสธรหัสที่ไม่มีอักขระพิเศษ (บังคับตั้งแต่ 15 ต.ค. 2569) — ภาษาไทยไม่นับแทน", async () => {
      const noSymbol = await register("Meadowlantern58");
      expect(noSymbol.res.status).toBe(400);
      expect(noSymbol.res.body.error).toContain("อักขระพิเศษ");
      expect((await register("Meadowlantern58ทุ่งหญ้า")).res.body.error).toContain("อักขระพิเศษ");
    });

    it("รับรหัสที่ครบพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ", async () => {
      const { res, email } = await register("Meadowlantern58!");
      expect(res.status).toBe(201);
      const created = await prisma.user.findUnique({ where: { email } });
      if (created) createdIds.push(created.id);
    });
  });

  // ─────────────── กฎที่ต้องรู้ว่าเป็นบัญชีของใคร (ตรวจใน service) ───────────────

  describe("เปลี่ยนรหัสผ่านของตัวเอง", () => {
    it("ปฏิเสธการตั้งรหัสเดิมซ้ำ", async () => {
      const res = await owner.agent.post("/api/auth/change-password").send({
        currentPassword: ownerPassword,
        newPassword: ownerPassword,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("รหัสเดิม");
    });

    it("ปฏิเสธรหัสที่มีชื่อผู้ใช้ของตัวเองอยู่ข้างใน", async () => {
      const res = await owner.agent.post("/api/auth/change-password").send({
        currentPassword: ownerPassword,
        newPassword: `${owner.username}-Quiet-harbour-9`,
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("ชื่อ");
    });

    it("ยังตรวจรหัสปัจจุบันก่อนเสมอ — กฎใหม่ต้องไม่กลายเป็นทางเดาว่ารหัสปัจจุบันคืออะไร", async () => {
      const res = await owner.agent.post("/api/auth/change-password").send({
        currentPassword: "ไม่ใช่รหัสที่ถูกต้องเลย",
        newPassword: "Birch-quarry-58-moonstone",
      });
      expect(res.status).toBe(401);
    });
  });

  describe("ตั้งรหัสใหม่จากลิงก์ลืมรหัสผ่าน", () => {
    it("รหัสที่ผิดกฎไม่เผาลิงก์ทิ้ง — ไม่งั้นพิมพ์รหัสอ่อนครั้งเดียวต้องไปขอลิงก์ใหม่", async () => {
      const customer = await createCustomerDirect("pwrules-forgot");
      createdIds.push(customer.userId);

      await request(app)
        .post("/api/auth/customer/forgot-password")
        .send({ email: customer.email });
      // ปลายทางตอบก่อนแล้วค่อยทำงานเบื้องหลัง — รอให้แถว token ถูกเขียนลงฐานข้อมูลก่อน
      await new Promise((resolve) => setTimeout(resolve, 200));

      const row = await prisma.passwordResetToken.findFirst({
        where: { userId: customer.userId },
      });
      expect(row).not.toBeNull();

      // เดาไม่ได้ว่า token ตัวจริงคืออะไร (เก็บแต่แฮช) — ยิงผ่าน service ไม่ได้ จึงตรวจทางอ้อม:
      // ลิงก์ยังอยู่ในฐานข้อมูลหลังยิงรหัสผ่านที่ผิดกฎด้วย token ปลอม
      const bad = await request(app)
        .post("/api/auth/customer/reset-password")
        .send({ token: "x".repeat(43), password: "kanoklak7" });
      expect(bad.status).toBe(400);

      const stillThere = await prisma.passwordResetToken.findFirst({
        where: { userId: customer.userId },
      });
      expect(stillThere).not.toBeNull();

      await prisma.passwordResetToken.deleteMany({ where: { userId: customer.userId } });
    });
  });

  // ─────────────── บังคับเปลี่ยนรหัสที่คนอื่นตั้งให้ ───────────────

  describe("บังคับเปลี่ยนรหัสที่ OWNER ตั้งให้", () => {
    it("ติดธงตอนถูกสร้าง · เข้าระบบได้แต่ใช้งานอะไรไม่ได้ · ปลดธงเมื่อตั้งรหัสใหม่เอง", async () => {
      const username = `newstaff-${runId}`;
      const tempPassword = "Russet-dune-47-clockwork";

      const created = await owner.agent
        .post("/api/users")
        .send({ username, fullName: "พนักงานใหม่", email: `${username}@gmail.com`, role: "ADMIN", password: tempPassword });
      expect(created.status).toBe(201);
      createdIds.push(created.body.user.id);

      // 1) ธงถูกตั้งตอนสร้าง
      const row = await prisma.user.findUnique({ where: { username } });
      expect(row?.mustChangePassword).toBe(true);

      // 2) ล็อกอินได้ปกติ — ถ้าล็อกอินไม่ได้ก็ไม่มีทางเปลี่ยนรหัสได้เลย
      const staff = request.agent(app);
      const login = await staff.post("/api/auth/staff/login").send({ username, password: tempPassword });
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);

      // 3) /api/auth/me ต้องผ่าน — หน้าเว็บอ่านธงจากที่นี่เพื่อรู้ว่าต้องโชว์หน้าบังคับเปลี่ยนรหัส
      const me = await staff.get("/api/auth/me");
      expect(me.status).toBe(200);
      expect(me.body.user.mustChangePassword).toBe(true);

      // 4) ปลายทางอื่นถูกปิดทั้งหมด — หน้าจอที่บังไว้ฝั่งเบราว์เซอร์อย่างเดียวข้ามได้ด้วยแท็บเก่า
      const blocked = await staff.get("/api/dashboard/summary");
      expect(blocked.status).toBe(403);
      expect(blocked.body.code).toBe("MUST_CHANGE_PASSWORD");

      // 5) รหัสใหม่ยังต้องผ่านกฎทุกข้อ รวมข้อ "ห้ามใช้รหัสเดิมที่ได้รับมา"
      const reuse = await staff.post("/api/auth/change-password").send({
        currentPassword: tempPassword,
        newPassword: tempPassword,
      });
      expect(reuse.status).toBe(400);

      // 6) ตั้งรหัสใหม่สำเร็จ → ธงหาย → ใช้งานได้
      const changed = await staff.post("/api/auth/change-password").send({
        currentPassword: tempPassword,
        newPassword: "Maple-sundial-63-cobblestone",
      });
      expect(changed.status).toBe(204);

      const after = await prisma.user.findUnique({ where: { username } });
      expect(after?.mustChangePassword).toBe(false);

      const meAfter = await staff.get("/api/auth/me");
      expect(meAfter.body.user.mustChangePassword).toBe(false);
      const allowed = await staff.get("/api/dashboard/summary");
      expect(allowed.status).toBe(200);
    });

    it("ติดธงอีกครั้งเมื่อ OWNER รีเซ็ตรหัสให้ — OWNER รู้รหัสนั้นด้วย", async () => {
      const username = `resetstaff-${runId}`;
      const created = await owner.agent.post("/api/users").send({
        username,
        fullName: "พนักงานถูกรีเซ็ต",
        email: `${username}@gmail.com`,
        role: "ADMIN",
        password: "Olive-kestrel-52-snowdrift",
      });
      expect(created.status).toBe(201);
      const staffId = created.body.user.id as string;
      createdIds.push(staffId);

      // เจ้าตัวตั้งรหัสเองก่อน เพื่อให้ธงเป็น false ก่อนทดสอบว่าการรีเซ็ตตั้งกลับเป็น true
      const staff = request.agent(app);
      await staff
        .post("/api/auth/staff/login")
        .send({ username, password: "Olive-kestrel-52-snowdrift" });
      await staff.post("/api/auth/change-password").send({
        currentPassword: "Olive-kestrel-52-snowdrift",
        newPassword: "Plum-anvil-73-firelight",
      });
      expect((await prisma.user.findUnique({ where: { id: staffId } }))?.mustChangePassword).toBe(
        false,
      );

      const reset = await owner.agent
        .post(`/api/users/${staffId}/reset-password`)
        .send({ newPassword: "Bronze-heather-14-lakeshore" });
      expect(reset.status).toBe(204);
      expect((await prisma.user.findUnique({ where: { id: staffId } }))?.mustChangePassword).toBe(
        true,
      );
    });

    it("OWNER ตั้งรหัสที่ผิดกฎให้พนักงานไม่ได้ และตั้งรหัสที่มีชื่อพนักงานอยู่ข้างในไม่ได้", async () => {
      const username = `weakreset-${runId}`;
      const created = await owner.agent.post("/api/users").send({
        username,
        fullName: "Somsak Laksana",
        email: `${username}@gmail.com`,
        role: "ADMIN",
        password: "Cobalt-fern-38-driftwood",
      });
      expect(created.status).toBe(201);
      const staffId = created.body.user.id as string;
      createdIds.push(staffId);

      const weak = await owner.agent
        .post(`/api/users/${staffId}/reset-password`)
        .send({ newPassword: "kanoklak7" });
      expect(weak.status).toBe(400);

      // ข้อนี้ต้องตรวจใน service เพราะสคีมาไม่รู้ว่าปลายทางเป็นบัญชีของใคร
      const personal = await owner.agent
        .post(`/api/users/${staffId}/reset-password`)
        .send({ newPassword: "Somsak-quiet-harbour-3" });
      expect(personal.status).toBe(400);
      expect(personal.body.error).toContain("ชื่อ");
    });

    it("บัญชีลูกค้าไม่เคยติดธงนี้ — ทีมงานไม่เคยตั้งรหัสให้ลูกค้า (ออกลิงก์ให้ตั้งเอง)", async () => {
      const customer = await createCustomerDirect("pwrules-customer-flag");
      createdIds.push(customer.userId);

      const me = await customer.agent.get("/api/auth/me");
      expect(me.status).toBe(200);
      expect(me.body.user.mustChangePassword).toBe(false);
    });
  });
});
