import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

const SAFARI_IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

interface SessionBody {
  handle: string;
  current: boolean;
  os: string;
  newDevice: boolean;
  expiresAt: string;
  ipKind: string | null;
  ipGeo: unknown;
}

interface EventBody {
  id: string;
  title: string;
  tone: string;
  newDevice: boolean;
  device: string | null;
  ip: string | null;
}

describe("devices page: new-device badge, login history, owner control of staff devices", () => {
  const userIds: string[] = [];

  // AuditLog ลบไม่ได้โดยตั้งใจ (role ของแอปไม่มีสิทธิ์ DELETE) — ลบผู้ใช้แล้วแถวเหลือ userId = null เหมือนเทสต์อื่น
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("marks the session from a never-seen browser as new, with expiry and ip kind", async () => {
    const admin = await createAndLoginAdmin("test-devsec-badge");
    userIds.push(admin.userId);

    // agent ใหม่ = ไม่มีคุกกี้เครื่อง = เครื่องใหม่ (บัญชีมีเครื่องแรกแล้วจาก helper)
    const ipad = request.agent(app);
    const login = await ipad
      .post("/api/auth/staff/login")
      .set("User-Agent", SAFARI_IPAD)
      .send({ username: admin.username, password: admin.password });
    expect(login.status).toBe(200);

    const list = await admin.agent.get("/api/account/sessions");
    const sessions = list.body.sessions as SessionBody[];
    const mine = sessions.find((s) => s.current)!;
    const other = sessions.find((s) => s.os === "iPad")!;
    expect(mine.newDevice).toBe(false);
    expect(other.newDevice).toBe(true);
    expect(new Date(other.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // เทสต์วิ่งบนเครื่องเดียวกัน — ไอพีเป็นของเซิร์ฟเวอร์เอง ค้นประเทศไม่ได้
    expect(other.ipKind).toBe("loopback");
    expect(other.ipGeo).toBeNull();
  });

  it("login history: new-device login is one row, wrong passwords show, pages by cursor", async () => {
    const admin = await createAndLoginAdmin("test-devsec-history");
    userIds.push(admin.userId);

    await request(app)
      .post("/api/auth/staff/login")
      .set("User-Agent", SAFARI_IPAD)
      .send({ username: admin.username, password: "Wrong-password-123" });
    await request(app)
      .post("/api/auth/staff/login")
      .set("User-Agent", SAFARI_IPAD)
      .send({ username: admin.username, password: admin.password });

    const first = await admin.agent.get("/api/account/login-history");
    expect(first.status).toBe(200);
    const events = first.body.events as EventBody[];
    expect(first.body.days).toBe(90);
    expect(first.body).toMatchObject({ page: 1, pageSize: 15, total: 3 });
    expect(events.map((e) => e.title)).toEqual([
      "เข้าสู่ระบบจากเครื่องใหม่",
      "รหัสผ่านไม่ถูกต้อง",
      "เข้าสู่ระบบ",
    ]);
    expect(events[0].device).toBe("Safari · iPad");
    expect(events[1].tone).toBe("danger");
    // แถว NEW_DEVICE_LOGIN ถูกรวมเข้ากับการเข้าสำเร็จ ไม่ขึ้นซ้ำเป็นแถวที่สี่
    expect(events).toHaveLength(3);

    // เลขหน้า: รวม 23 แถว → หน้า 1 มี 15 + หน้า 2 มี 8 ไม่ซ้ำ ไม่หาย
    const base = Date.now() - 60 * 60_000;
    await prisma.auditLog.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        userId: admin.userId,
        action: "LOGIN_FAILED",
        entityType: "User",
        entityId: admin.userId,
        createdAt: new Date(base - i * 1000),
      })),
    });
    const page1 = await admin.agent.get("/api/account/login-history?page=1");
    expect(page1.body.events).toHaveLength(15);
    expect(page1.body.total).toBe(23);
    const page2 = await admin.agent.get("/api/account/login-history?page=2");
    expect(page2.body.page).toBe(2);
    expect(page2.body.events).toHaveLength(8);
    // ขอเกินหน้าสุดท้าย / ค่าเพี้ยน → ได้หน้าที่มีจริง
    expect((await admin.agent.get("/api/account/login-history?page=99")).body.page).toBe(2);
    expect((await admin.agent.get("/api/account/login-history?page=abc")).body.page).toBe(1);
    const ids = [...page1.body.events, ...page2.body.events].map((e: EventBody) => e.id);
    expect(new Set(ids).size).toBe(23);

    // ประวัติของคนอื่นไม่ปน
    const other = await createAndLoginAdmin("test-devsec-history-other");
    userIds.push(other.userId);
    const theirs = await other.agent.get("/api/account/login-history");
    expect((theirs.body.events as EventBody[]).every((e) => !ids.includes(e.id))).toBe(true);
  });

  it("owner sees a staff member's devices and signs them out; not their own, not as ADMIN", async () => {
    const owner = await createAndLoginOwner("test-devsec-owner");
    const staff = await createAndLoginAdmin("test-devsec-staff");
    userIds.push(owner.userId, staff.userId);
    const phone = request.agent(app);
    await phone
      .post("/api/auth/staff/login")
      .set("User-Agent", SAFARI_IPAD)
      .send({ username: staff.username, password: staff.password });

    const users = await owner.agent.get("/api/users");
    const row = (users.body.users as { id: string; activeSessions: number; lastSeenAt: string | null }[]).find(
      (u) => u.id === staff.userId,
    )!;
    expect(row.activeSessions).toBe(2);
    expect(row.lastSeenAt).toEqual(expect.any(String));

    const list = await owner.agent.get(`/api/users/${staff.userId}/sessions`);
    expect(list.status).toBe(200);
    const sessions = list.body.sessions as SessionBody[];
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => !s.current)).toBe(true);
    const tokens = (await prisma.session.findMany({ where: { userId: staff.userId } })).map((s) => s.id);
    expect(JSON.stringify(list.body)).not.toMatch(new RegExp(tokens.join("|")));

    // สั่งออกทีละเครื่อง
    const ipad = sessions.find((s) => s.os === "iPad")!;
    expect((await owner.agent.delete(`/api/users/${staff.userId}/sessions/${ipad.handle}`)).status).toBe(204);
    expect((await phone.get("/api/auth/me")).status).toBe(401);
    expect((await staff.agent.get("/api/auth/me")).status).toBe(200);

    // ADMIN จัดการเครื่องของคนอื่นไม่ได้ · OWNER ใช้ทางนี้กับบัญชีตัวเองไม่ได้
    expect((await staff.agent.get(`/api/users/${owner.userId}/sessions`)).status).toBe(403);
    expect((await owner.agent.get(`/api/users/${owner.userId}/sessions`)).status).toBe(400);

    // ออกทุกเครื่อง → เจ้าตัวหลุด ได้การแจ้งเตือน และเห็นในประวัติของตัวเองหลังเข้าใหม่
    const all = await owner.agent.post(`/api/users/${staff.userId}/sessions/revoke-all`);
    expect(all.status).toBe(200);
    expect(all.body.count).toBe(1);
    expect((await staff.agent.get("/api/auth/me")).status).toBe(401);
    const note = await prisma.notification.findFirst({
      where: { userId: staff.userId, message: { contains: "เจ้าของระบบสั่งออกจากระบบทุกเครื่อง" } },
    });
    expect(note).not.toBeNull();

    const back = request.agent(app);
    await back.post("/api/auth/staff/login").send({ username: staff.username, password: staff.password });
    const history = await back.get("/api/account/login-history");
    const byOwner = (history.body.events as EventBody[]).filter((e) => e.title.startsWith("เจ้าของระบบ"));
    expect(byOwner.map((e) => e.title)).toEqual([
      "เจ้าของระบบสั่งออกจากระบบทุกเครื่อง",
      "เจ้าของระบบสั่งออกจากระบบเครื่อง Safari · iPad",
    ]);
    // เครื่อง/ไอพีของ OWNER ไม่โผล่ในประวัติของพนักงาน
    expect(byOwner.every((e) => e.device === null && e.ip === null)).toBe(true);
  });
});
