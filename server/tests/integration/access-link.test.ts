import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

// ลิงก์เข้าใช้ครั้งเดียว: ทีมงานสร้างบัญชีลูกค้าจากคำขอแล้วออกลิงก์ให้ลูกค้าตั้งรหัสผ่านเอง
describe("account access links", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdUserIds: string[] = [];
  const createdLeadIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-access-owner");
    createdUserIds.push(owner.userId);
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
    await prisma.accountAccessToken.deleteMany({
      where: {
        OR: [{ userId: { in: createdUserIds } }, { createdById: { in: createdUserIds } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  // สร้าง lead (แบบไม่ล็อกอิน) → โปรเจกต์จาก lead → ออกลิงก์เข้าใช้ให้ลูกค้าใหม่
  async function issueLinkForNewCustomer(tag: string) {
    const stamp = `${tag}-${Date.now()}`;
    const email = `access-${stamp}@example.com`;
    const lead = await request(app)
      .post("/api/public/leads")
      .send({
        name: "ลิงก์ ทดสอบ",
        phone: "0890000000",
        email: `lead-${stamp}@example.com`,
        serviceType: "รับสร้างบ้าน",
      });
    createdLeadIds.push(lead.body.lead.id);

    const projectRes = await owner.agent.post(`/api/leads/${lead.body.lead.id}/create-project`);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const res = await owner.agent
      .post(`/api/projects/${projectId}/customer-access-link`)
      .send({ email, fullName: "ลิงก์ ทดสอบ", phone: "0890000000" });
    expect(res.status).toBe(201);
    createdUserIds.push(res.body.customer.id);

    const token = (res.body.url as string).split("/activate/")[1];
    return { projectId, customerId: res.body.customer.id as string, token, email };
  }

  it("returns account info for a valid token", async () => {
    const { token, email } = await issueLinkForNewCustomer("info");
    const res = await request(app).get(`/api/auth/access/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(email);
    expect(typeof res.body.fullName).toBe("string");
  });

  it("rejects an unknown token", async () => {
    expect((await request(app).get("/api/auth/access/not-a-real-token")).status).toBe(400);
    expect(
      (await request(app).post("/api/auth/access/not-a-real-token").send({ password: "abcd1234" }))
        .status,
    ).toBe(400);
  });

  it("cannot be redeemed twice (single-use)", async () => {
    const { token } = await issueLinkForNewCustomer("reuse");
    const first = await request(app)
      .post(`/api/auth/access/${token}`)
      .send({ password: "First-pw-1234" });
    expect(first.status).toBe(200);
    const second = await request(app)
      .post(`/api/auth/access/${token}`)
      .send({ password: "Second-pw-1234" });
    expect(second.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const { token, customerId } = await issueLinkForNewCustomer("expired");
    await prisma.accountAccessToken.updateMany({
      where: { userId: customerId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    expect((await request(app).get(`/api/auth/access/${token}`)).status).toBe(400);
    expect(
      (await request(app).post(`/api/auth/access/${token}`).send({ password: "Expired-pw-1234" }))
        .status,
    ).toBe(400);
  });

  it("issuing a new link invalidates the previous unused one", async () => {
    const { projectId, token: firstToken } = await issueLinkForNewCustomer("rotate");
    const second = await owner.agent
      .post(`/api/projects/${projectId}/customer-access-link`)
      .send({});
    expect(second.status).toBe(200);
    const secondToken = (second.body.url as string).split("/activate/")[1];

    // ลิงก์เก่าถูกเผาทิ้งแล้ว
    expect(
      (await request(app).post(`/api/auth/access/${firstToken}`).send({ password: "Old-pw-1234" }))
        .status,
    ).toBe(400);
    // ลิงก์ใหม่ยังใช้ได้
    expect(
      (await request(app).post(`/api/auth/access/${secondToken}`).send({ password: "New-pw-1234" }))
        .status,
    ).toBe(200);
  });

  it("rejects a too-short password", async () => {
    const { token } = await issueLinkForNewCustomer("shortpw");
    const res = await request(app).post(`/api/auth/access/${token}`).send({ password: "short" });
    expect(res.status).toBe(400);
  });

  it("stores the optional address given while activating, and exposes/edits it via the profile", async () => {
    const { token, customerId } = await issueLinkForNewCustomer("addr");

    // เปิดใช้บัญชี + กรอกที่อยู่ (ไม่บังคับ) — ใช้ agent เพื่อเก็บ cookie session ที่ได้จากการ activate
    const customer = request.agent(app);
    const redeem = await customer
      .post(`/api/auth/access/${token}`)
      .send({ password: "Activate-pw-1234", address: "99/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000" });
    expect(redeem.status).toBe(200);

    // ที่อยู่ถูกเก็บ และเบอร์โทรจากคำขอยังอยู่ (ทีมงาน seed ไว้ตอนสร้างบัญชี)
    const stored = await prisma.customerProfile.findUnique({ where: { userId: customerId } });
    expect(stored?.address).toBe("99/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000");
    expect(stored?.phone).toBe("0890000000");

    // ลูกค้าอ่านโปรไฟล์ตัวเองได้
    const getRes = await customer.get("/api/auth/me/profile");
    expect(getRes.status).toBe(200);
    expect(getRes.body.profile).toMatchObject({
      phone: "0890000000",
      address: "99/9 ถ.มิตรภาพ ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000",
    });

    // และแก้ที่อยู่ภายหลังได้
    const patchRes = await customer
      .patch("/api/auth/me/profile")
      .send({ address: "123 ที่อยู่ใหม่" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.profile.address).toBe("123 ที่อยู่ใหม่");
    expect(patchRes.body.profile.phone).toBe("0890000000");
  });

  // ลูกค้าที่โทรมา/เดินเข้ามาเอง: โครงการไม่มีคำขอ — พนักงานกรอกชื่อ+อีเมลเองแล้วสร้างบัญชีได้
  it("creates a customer for a project that has no request (walk-in)", async () => {
    const stamp = Date.now();
    const projectRes = await owner.agent.post("/api/projects").send({ name: `walk-in ${stamp}` });
    expect(projectRes.status).toBe(201);
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    const noName = await owner.agent
      .post(`/api/projects/${projectId}/customer-access-link`)
      .send({ email: `walkin-${stamp}@example.com` });
    expect(noName.status).toBe(400);

    const res = await owner.agent
      .post(`/api/projects/${projectId}/customer-access-link`)
      .send({ email: `walkin-${stamp}@example.com`, fullName: "วอล์กอิน ทดสอบ", phone: "0811111111" });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    createdUserIds.push(res.body.customer.id);

    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detail.body.project.customer).toMatchObject({
      id: res.body.customer.id,
      fullName: "วอล์กอิน ทดสอบ",
      phone: "0811111111",
      avatarUrl: null,
    });
    const audit = await prisma.auditLog.findFirst({ where: { entityId: res.body.customer.id, action: "CREATE_CUSTOMER_FOR_PROJECT" } });
    expect(audit).not.toBeNull();
  });
});
