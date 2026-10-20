import request from "supertest";

import { app } from "../../src/app";
import { setGeoLookupForTest } from "../../src/lib/geoip";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginAdmin, createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

/**
 * ไอพีในแฟ้มลูกค้า — เฝ้า 3 เรื่อง:
 *  1. ทุกการกระทำของลูกค้าได้ไอพี/อุปกรณ์ แม้จุดที่เขียน AuditLog ไม่ได้ส่งมาเอง (เดิม 17 จาก 38 แถวไม่มี)
 *  2. ไอพีจัดประเภทก่อนถึงหน้าจอ และยังเห็นเฉพาะ OWNER · อุปกรณ์เห็นได้ทุกคน
 *  3. หน้าตรวจการรับไอพีตอบถูกตามสภาพ proxy และเปิดได้เฉพาะ OWNER
 */
describe("ไอพีและอุปกรณ์ในแฟ้มลูกค้า", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("การกระทำที่ไม่ได้ส่งไอพีมาเอง (แก้ข้อมูลส่วนตัว) ก็ได้ไอพีและอุปกรณ์ของคำขอนั้น", async () => {
    const customer = await createCustomerDirect("iptrack-profile");
    userIds.push(customer.userId);

    await customer.agent
      .patch("/api/auth/me/profile")
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1")
      .send({ phone: "0899999999" })
      .expect(200);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { userId: customer.userId, action: "UPDATE_PROFILE" },
    });
    expect(row.ip).toEqual(expect.any(String));
    expect(row.userAgent).toContain("iPhone");
  });

  it("ไอพีจัดประเภทและเห็นเฉพาะ OWNER · อุปกรณ์และผู้ทำรายการเห็นทุกคน", async () => {
    const owner = await createAndLoginOwner("iptrack-owner");
    const admin = await createAndLoginAdmin("iptrack-admin");
    const customer = await createCustomerDirect("iptrack-view");
    userIds.push(owner.userId, admin.userId, customer.userId);
    await customer.agent.patch("/api/auth/me/profile").set("User-Agent", "curl/8.4.0").send({ phone: "0811111111" }).expect(200);

    type Row = { title: string; ip: string | null; ipKind: string | null; device: string | null; actor: { kind: string; name: string | null } };
    const ownerRows = (await owner.agent.get(`/api/customers/${customer.userId}/activity`).expect(200)).body.activity as Row[];
    const edited = ownerRows.find((r) => r.title === "แก้ไขข้อมูลส่วนตัว")!;
    // supertest ต่อจากเครื่องเดียวกัน → ต้องถูกจัดเป็น "เครื่องเซิร์ฟเวอร์เอง" ไม่ใช่ไอพีของลูกค้า
    expect(edited.ip).toMatch(/^(127\.0\.0\.1|::1)$/);
    expect(edited.ipKind).toBe("loopback");
    expect(edited.device).toBe("เครื่องมืออัตโนมัติ (curl)");
    expect(edited.actor).toEqual({ kind: "customer", name: "Test Customer" });

    const adminRows = (await admin.agent.get(`/api/customers/${customer.userId}/activity`).expect(200)).body.activity as Row[];
    const adminEdited = adminRows.find((r) => r.title === "แก้ไขข้อมูลส่วนตัว")!;
    expect(adminEdited.ip).toBeNull();
    expect(adminEdited.ipKind).toBeNull();
    expect(adminEdited.device).toBe("เครื่องมืออัตโนมัติ (curl)");
  });

  it("แถวที่พนักงานทำกับบัญชีลูกค้า บอกว่าเป็นพนักงานคนไหน", async () => {
    const owner = await createAndLoginOwner("iptrack-staffrow");
    const customer = await createCustomerDirect("iptrack-staffrow-c");
    userIds.push(owner.userId, customer.userId);
    await owner.agent.patch(`/api/customers/${customer.userId}`).send({ phone: "0822222222" }).expect(200);

    const rows = (await owner.agent.get(`/api/customers/${customer.userId}/activity`).expect(200)).body.activity as {
      kind: string;
      actor: { kind: string; name: string | null };
    }[];
    const staffRow = rows.find((r) => r.kind === "staff")!;
    expect(staffRow.actor.kind).toBe("staff");
    expect(staffRow.actor.name).toBe((await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })).fullName);
  });

  it("ประเทศ/ผู้ให้บริการ: OWNER เห็นพร้อมธงต่างประเทศ · ADMIN ไม่เห็น (ได้มาจากไอพี)", async () => {
    setGeoLookupForTest({
      country: { get: () => ({ country: { iso_code: "US" } }) },
      asn: { get: () => ({ autonomous_system_number: 15169, autonomous_system_organization: "Google LLC" }) },
      month: "2026-10",
    });
    try {
      const owner = await createAndLoginOwner("iptrack-geo");
      const admin = await createAndLoginAdmin("iptrack-geo-admin");
      const customer = await createCustomerDirect("iptrack-geo-c");
      userIds.push(owner.userId, admin.userId, customer.userId);
      // จำลองแถวที่มาจากเน็ตจริงหลังขึ้นระบบ — ในเทสต์ทุกคำขอมาจากเครื่องตัวเอง
      await prisma.auditLog.create({
        data: { userId: customer.userId, action: "LOGIN_SUCCESS", entityType: "User", entityId: customer.userId, ip: "8.8.8.8" },
      });

      type Row = { ip: string | null; ipGeo: { country: string; network: string; foreign: boolean } | null };
      const ownerRows = (await owner.agent.get(`/api/customers/${customer.userId}/activity`).expect(200)).body.activity as Row[];
      const fromNet = ownerRows.find((r) => r.ip === "8.8.8.8")!;
      expect(fromNet.ipGeo).toMatchObject({ country: "สหรัฐอเมริกา", network: "Google", foreign: true });
      // แถวที่มาจากเครื่องตัวเองไม่มีประเทศ
      expect(ownerRows.filter((r) => r.ip !== "8.8.8.8").every((r) => r.ipGeo === null)).toBe(true);

      const adminRows = (await admin.agent.get(`/api/customers/${customer.userId}/activity`).expect(200)).body.activity as Row[];
      expect(adminRows.every((r) => r.ipGeo === null)).toBe(true);
    } finally {
      setGeoLookupForTest(null);
    }
  });

  describe("หน้าตรวจการรับไอพี", () => {
    let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;

    beforeAll(async () => {
      owner = await createAndLoginOwner("iptrack-check");
      userIds.push(owner.userId);
    });

    afterEach(() => {
      app.set("trust proxy", false);
    });

    it("เปิดจากเครื่องเดียวกันโดยไม่มี proxy = ยังตอบไม่ได้", async () => {
      const res = await owner.agent.get("/api/system/ip-check").expect(200);
      expect(res.body.verdict).toBe("local");
      expect(res.body.seen.kind).toBe("loopback");
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("proxy ส่ง X-Forwarded-For มาแต่ระบบยังไม่เชื่อ → บอกให้ตั้ง TRUST_PROXY และไม่เอาไอพีปลอมไปใช้", async () => {
      const res = await owner.agent.get("/api/system/ip-check").set("X-Forwarded-For", "203.0.113.5").expect(200);
      expect(res.body.verdict).toBe("proxy-untrusted");
      expect(res.body.seen.kind).toBe("loopback");
      expect(res.body.forwardedFor).toEqual([{ address: "203.0.113.5", kind: "public" }]);
      expect(res.body.forwardHeaders).toContain("x-forwarded-for");
    });

    it("ตั้งให้เชื่อ proxy 1 ชั้นแล้ว ได้ไอพีจริงของต้นทาง", async () => {
      app.set("trust proxy", 1);
      const res = await owner.agent.get("/api/system/ip-check").set("X-Forwarded-For", "203.0.113.5").expect(200);
      expect(res.body.verdict).toBe("ok");
      expect(res.body.seen).toEqual({ address: "203.0.113.5", kind: "public" });
      expect(res.body.geoip).toMatchObject({ homeCountry: "TH", autoUpdate: false });
    });

    it("เฉพาะ OWNER — ADMIN 403 · ไม่ล็อกอิน 401", async () => {
      const admin = await createAndLoginAdmin("iptrack-check-admin");
      userIds.push(admin.userId);
      await admin.agent.get("/api/system/ip-check").expect(403);
      await request(app).get("/api/system/ip-check").expect(401);
    });
  });
});
