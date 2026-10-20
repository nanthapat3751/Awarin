import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * บัญชีพนักงานใช้ "ชื่อผู้ใช้" เป็นกุญแจเข้าระบบ ไม่ใช่อีเมล
 *
 * เหตุผล: ระบบไม่เคยส่งอีเมลถึงพนักงานเลย อีเมลจึงเป็นแค่สตริงยาว ๆ ที่ต้องจำ
 * ลูกค้ายังใช้อีเมลเหมือนเดิม เพราะเป็นตัวตนที่ใช้ติดต่อและออกลิงก์เข้าใช้จริง
 */
describe("staff accounts use a username", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdIds: string[] = [];
  const runId = Date.now();

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-username-owner");
    createdIds.push(owner.userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.$disconnect();
  });

  it("creates a staff member with a username and no email, then logs in with it", async () => {
    const username = `somchai-${runId}`;
    const password = "Russet-dune-47-clockwork";

    const created = await owner.agent
      .post("/api/users")
      .send({ username, fullName: "สมชาย ทดสอบ", email: `${username}@gmail.com`, role: "ADMIN", password });
    expect(created.status).toBe(201);
    createdIds.push(created.body.user.id);
    expect(created.body.user.username).toBe(username);
    // อีเมลกู้รหัสผ่านที่ OWNER กรอกให้ ยังไม่นับว่ายืนยัน จนกว่าเจ้าตัวกรอกรหัสจากเมล
    expect(created.body.user.email).toBe(`${username}@gmail.com`);
    expect(created.body.user.emailVerified).toBe(false);

    const agent = request.agent(app);
    const login = await agent.post("/api/auth/staff/login").send({ username, password });
    expect(login.status).toBe(200);
    expect(login.body.user.username).toBe(username);
  });

  it("rejects a duplicate username and says so in words the user can act on", async () => {
    const username = `duplicate-${runId}`;
    const first = await owner.agent
      .post("/api/users")
      .send({ username, fullName: "คนแรก", email: `${username}-a@gmail.com`, role: "ADMIN", password: "Olive-kestrel-52-snowdrift" });
    expect(first.status).toBe(201);
    createdIds.push(first.body.user.id);

    const second = await owner.agent
      .post("/api/users")
      .send({ username, fullName: "คนที่สอง", email: `${username}-b@gmail.com`, role: "ADMIN", password: "Plum-anvil-73-firelight" });
    expect(second.status).toBe(409);
    expect(second.body.error).toContain("ชื่อผู้ใช้");
  });

  it("rejects usernames that would be retyped wrong", async () => {
    const bad = ["ab", "มีไทย", "has space", "-leading", "UPPER CASE HERE"];
    for (const username of bad) {
      const res = await owner.agent
        .post("/api/users")
        .send({ username, fullName: "ทดสอบ", role: "ADMIN", password: "Slate-orchid-81-windmill" });
      expect([400, 409]).toContain(res.status);
    }
    // ตัวพิมพ์ใหญ่ล้วนถูกแปลงเป็นพิมพ์เล็กแล้วผ่าน — เก็บเป็นพิมพ์เล็กเสมอ กันคนจำสลับ
    const upper = await owner.agent
      .post("/api/users")
      .send({ username: `MixedCase${runId}`, fullName: "ทดสอบ", email: `mixedcase${runId}@gmail.com`, role: "ADMIN", password: "Bronze-heather-14-lakeshore" });
    expect(upper.status).toBe(201);
    createdIds.push(upper.body.user.id);
    expect(upper.body.user.username).toBe(`mixedcase${runId}`);
  });

  it("leaves customers without a username at all", async () => {
    const customers = await prisma.user.count({ where: { role: "CUSTOMER", username: { not: null } } });
    expect(customers).toBe(0);
  });
});
