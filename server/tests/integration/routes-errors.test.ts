import request, { type Test } from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

/**
 * คำตอบเมื่อขอผิดที่ — ทุกโมดูลที่เหลือ (แม่แบบ · โครงการ · ใบเสนอราคา · ไฟล์แนบ · ลูกค้า · คำขอ ·
 * 2FA · บัญชีของฉัน · พนักงาน · แม่แบบสัญญา · อัปโหลด · สัญญาฝั่งลูกค้า)
 *
 * ข้อมูลผิดรูป = 400 · ไม่มีของชิ้นนั้น = 404 · และทุกคำตอบมีข้อความให้หน้าจอโชว์ — เส้นทางที่ลืมจับ
 * error ของเซอร์วิสจะหลุดเป็น 500 "Internal server error" ซึ่งผู้ใช้อ่านแล้วไม่รู้ว่าต้องทำอะไรต่อ
 */
describe("API error answers across modules", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let projectId: string;
  const ghost = "no-such-id";

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-route-errors-owner");
    customer = await createCustomerDirect("test-route-errors-cust");
    const res = await owner.agent.post("/api/projects").send({ name: "โครงการทดสอบคำตอบผิดพลาด" });
    projectId = res.body.project.id;
  });

  afterAll(async () => {
    const ids = [owner.userId, customer.userId];
    await prisma.projectVersion.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.customerProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  type Who = "owner" | "customer" | "anon";
  type Row = [Who, string, string, unknown, number];

  const agentOf = (who: "owner" | "customer") => (who === "owner" ? owner : customer).agent;

  function send(who: Who, method: string, url: string, body: unknown): Test {
    const client = who === "anon" ? request(app) : agentOf(who);
    const target = client as unknown as Record<string, (u: string) => Test>;
    const req = target[method](url.replace(":pid", projectId).replace(":cid", customer.userId).replace(":me", owner.userId));
    return body === null ? req : req.send(body as object);
  }

  const rows: Row[] = [
    // แม่แบบ BOQ
    ["owner", "get", `/api/templates/${ghost}`, null, 404],
    ["owner", "patch", `/api/templates/${ghost}`, { name: "" }, 400],
    ["owner", "patch", `/api/templates/${ghost}`, { name: "แม่แบบ" }, 404],
    ["owner", "delete", `/api/templates/${ghost}`, null, 404],
    ["owner", "post", "/api/projects/:pid/templates/save-as", {}, 400],
    ["owner", "post", "/api/projects/:pid/templates/apply", {}, 400],
    ["owner", "post", "/api/projects/:pid/templates/apply", { templateId: ghost }, 404],
    // โครงการ
    ["owner", "post", "/api/projects", {}, 400],
    ["owner", "get", `/api/projects/${ghost}`, null, 404],
    ["owner", "patch", "/api/projects/:pid", { name: "" }, 400],
    ["owner", "patch", `/api/projects/${ghost}`, { name: "x" }, 404],
    ["owner", "delete", `/api/projects/${ghost}`, null, 404],
    ["owner", "post", "/api/projects/:pid/customer-access-link", { email: "not-an-email" }, 400],
    ["owner", "post", "/api/projects/:pid/link-lead", {}, 400],
    ["owner", "post", "/api/projects/:pid/link-lead", { leadId: ghost }, 404],
    ["owner", "post", "/api/projects/:pid/custom-price", {}, 400],
    ["owner", "patch", "/api/projects/:pid/rates", { vatPct: -1 }, 400],
    ["owner", "post", "/api/projects/:pid/transition", {}, 400],
    ["owner", "post", `/api/projects/${ghost}/transition`, { toStatus: "QUOTED" }, 404],
    // ใบเสนอราคา
    ["owner", "get", `/api/projects/:pid/quotes/${ghost}`, null, 404],
    ["owner", "delete", `/api/projects/:pid/quotes/${ghost}`, null, 404],
    ["owner", "post", `/api/projects/:pid/quotes/${ghost}/transition`, {}, 400],
    ["owner", "post", `/api/projects/:pid/quotes/${ghost}/transition`, { toStatus: "SENT" }, 404],
    ["owner", "patch", `/api/projects/:pid/quotes/${ghost}/validity`, { validDays: -3 }, 400],
    ["owner", "get", `/api/projects/:pid/quotes/${ghost}/pdf`, null, 404],
    ["owner", "get", `/api/projects/:pid/quotes/${ghost}/export.xlsx`, null, 404],
    ["owner", "post", `/api/projects/:pid/quotes/${ghost}/approval/submit`, null, 404],
    ["owner", "post", `/api/projects/:pid/quotes/${ghost}/approval/return`, {}, 400],
    // ไฟล์แนบของใบเสนอราคา
    ["owner", "post", `/api/projects/:pid/quotes/${ghost}/attachments`, null, 400],
    ["owner", "patch", `/api/projects/:pid/quotes/${ghost}/attachments/${ghost}`, { visibility: "CUSTOMER" }, 404],
    ["owner", "patch", `/api/projects/:pid/quotes/${ghost}/attachments/${ghost}`, { visibility: "EVERYONE" }, 400],
    ["owner", "delete", `/api/projects/:pid/quotes/${ghost}/attachments/${ghost}`, null, 404],
    ["owner", "get", `/api/projects/:pid/quotes/${ghost}/attachments/${ghost}/download`, null, 404],
    ["owner", "get", `/api/projects/:pid/quotes/${ghost}/attachments/${ghost}/preview`, null, 404],
    // ลูกค้า
    ["owner", "get", `/api/customers/${ghost}`, null, 404],
    ["owner", "patch", `/api/customers/${ghost}`, { fullName: "สมชาย ใจดี" }, 404],
    ["owner", "patch", "/api/customers/:cid", { phone: 12 }, 400],
    ["owner", "post", `/api/customers/${ghost}/access-link`, null, 404],
    ["owner", "post", `/api/customers/${ghost}/active`, { active: false }, 404],
    ["owner", "post", "/api/customers/:cid/active", {}, 400],
    ["owner", "post", "/api/customers/:cid/notes", { body: "" }, 400],
    ["owner", "patch", `/api/customers/:cid/notes/${ghost}`, { body: "บันทึก" }, 404],
    ["owner", "patch", `/api/customers/:cid/notes/${ghost}`, { body: "" }, 400],
    ["owner", "delete", `/api/customers/:cid/notes/${ghost}`, null, 404],
    // คำขอจากลูกค้า
    ["owner", "post", `/api/leads/${ghost}/create-project`, null, 404],
    ["owner", "patch", `/api/leads/${ghost}`, { status: "WHATEVER" }, 400],
    ["owner", "patch", `/api/leads/${ghost}`, { status: "CONTACTED" }, 404],
    ["owner", "delete", `/api/leads/${ghost}`, null, 404],
    ["owner", "patch", `/api/leads/${ghost}/reply`, {}, 400],
    ["owner", "patch", `/api/leads/${ghost}/reply`, { reply: "ติดต่อกลับแล้ว" }, 404],
    ["customer", "get", `/api/my/leads/${ghost}`, null, 404],
    ["anon", "post", "/api/public/leads", {}, 400],
    // 2FA
    ["anon", "post", "/api/auth/2fa/verify", {}, 400],
    ["anon", "post", "/api/auth/2fa/verify", { code: "123456" }, 401],
    ["owner", "post", "/api/auth/2fa/activate", { code: "1" }, 400],
    ["owner", "post", "/api/auth/2fa/disable", {}, 400],
    ["owner", "post", "/api/auth/2fa/add-device", {}, 400],
    ["owner", "post", "/api/auth/2fa/backup-codes", {}, 400],
    // บัญชีของฉัน (พนักงาน)
    ["owner", "patch", "/api/account/profile", { fullName: "" }, 400],
    ["owner", "post", "/api/account/email", {}, 400],
    ["owner", "post", "/api/account/email/verify", {}, 400],
    ["owner", "delete", `/api/account/sessions/${ghost}`, null, 404],
    // พนักงาน
    ["owner", "post", "/api/users", {}, 400],
    ["owner", "post", `/api/users/${ghost}/reset-password`, {}, 400],
    ["owner", "post", `/api/users/${ghost}/active`, {}, 400],
    ["owner", "post", `/api/users/${ghost}/active`, { active: false }, 404],
    // แม่แบบสัญญา
    ["owner", "get", `/api/contract-templates/${ghost}`, null, 404],
    ["owner", "post", "/api/contract-templates", {}, 400],
    ["owner", "patch", `/api/contract-templates/${ghost}`, { name: "" }, 400],
    ["owner", "post", `/api/contract-templates/${ghost}/default`, null, 404],
    ["owner", "delete", `/api/contract-templates/${ghost}`, null, 404],
    // อัปโหลดรูป
    ["owner", "post", "/api/uploads", null, 400],
    // สัญญาฝั่งลูกค้า
    ["customer", "get", `/api/my/contracts/${ghost}/pdf`, null, 404],
    ["customer", "get", `/api/my/contracts/${ghost}/documents/${ghost}/pdf`, null, 404],
    ["customer", "post", `/api/my/contracts/${ghost}/change-orders/${ghost}/respond`, {}, 400],
    ["customer", "post", `/api/my/contracts/${ghost}/change-orders/${ghost}/respond`, { decision: "APPROVE" }, 404],
    ["customer", "get", `/api/my/contracts/${ghost}/change-orders/${ghost}/pdf`, null, 404],
    ["customer", "post", `/api/my/contracts/${ghost}/payment-notices`, null, 400],
    ["customer", "post", `/api/my/contracts/${ghost}/payment-notices/${ghost}/cancel`, null, 404],
    ["customer", "get", `/api/my/contracts/${ghost}/payment-notices/${ghost}/evidence/${ghost}`, null, 404],
  ];

  it.each(rows)("%s %s %s → expected status", async (who, method, url, body, expected) => {
    const res = await send(who, method, url, body);
    expect({ status: res.status, url }).toEqual({ status: expected, url });
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  it("returns the first page of a project's activity even when the page number is junk", async () => {
    const res = await owner.agent.get(`/api/projects/${projectId}/activity?page=abc`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(Array.isArray(res.body.activity)).toBe(true);
  });

  it("refuses an upload of a type that is not an image", async () => {
    const res = await owner.agent
      .post("/api/uploads")
      .attach("file", Buffer.from("#!/bin/sh"), { filename: "run.sh", contentType: "text/x-shellscript" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });

  it("refuses a quote attachment of a type that is not allowed", async () => {
    const res = await owner.agent
      .post(`/api/projects/${projectId}/quotes/${ghost}/attachments`)
      .attach("file", Buffer.from("MZ"), { filename: "setup.exe", contentType: "application/octet-stream" });
    expect(res.status).toBe(400);
  });

  it("refuses a customer payment notice of a type that is not allowed", async () => {
    const res = await customer.agent
      .post(`/api/my/contracts/${ghost}/payment-notices`)
      .field("amount", "1000")
      .attach("files", Buffer.from("MZ"), { filename: "slip.exe", contentType: "application/octet-stream" });
    expect(res.status).toBe(400);
  });
});
