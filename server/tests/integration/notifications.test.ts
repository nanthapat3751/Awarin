import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

describe("notifications module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-notifications-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบแจ้งเตือน" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบแจ้งเตือน",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบแจ้งเตือน",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบแจ้งเตือน",
      unit: "หน่วย",
      materialUnitPrice: 1000,
      laborUnitPrice: 200,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.contract.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("notifies staff when a new lead comes in", async () => {
    const before = await owner.agent.get("/api/notifications/unread-count");

    const leadRes = await request(app).post("/api/public/leads").send({
      name: "ทดสอบแจ้งเตือน Lead",
      phone: "0899998888",
      email: "lead-0899998888@example.com",
      serviceType: "ก่อสร้าง",
    });
    expect(leadRes.status).toBe(201);

    const after = await owner.agent.get("/api/notifications/unread-count");
    expect(after.body.count).toBe(before.body.count + 1);

    const listRes = await owner.agent.get("/api/notifications");
    const found = listRes.body.notifications.find((n: { link: string }) => n.link === "/leads");
    expect(found).toBeDefined();
    expect(found.message).toContain("ทดสอบแจ้งเตือน Lead");
    expect(found.read).toBe(false);
  });

  it("notifies the assigned customer when a quote is sent, and notifies staff when they respond", async () => {
    const customer = await createAndLoginCustomer("test-notifications-customer");
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(customerUser.id);

    const createRes = await owner.agent.post("/api/projects").send({ name: "โครงการทดสอบแจ้งเตือน" });
    const projectId = createRes.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent
      .patch(`/api/projects/${projectId}`)
      .send({ customerId: customerUser.id });

    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      materialId,
      quantity: 3,
    });

    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`).send();
    const quoteId = quoteRes.body.quote.id as string;

    const custCountBefore = await customer.agent.get("/api/notifications/unread-count");

    const sendRes = await sendQuote(owner.agent, projectId, quoteId);
    expect(sendRes.status).toBe(200);

    const custCountAfter = await customer.agent.get("/api/notifications/unread-count");
    expect(custCountAfter.body.count).toBe(custCountBefore.body.count + 1);

    const custList = await customer.agent.get("/api/notifications");
    const quoteNotif = custList.body.notifications.find(
      (n: { link: string }) => n.link === `/my/quotes/${quoteId}`,
    );
    expect(quoteNotif).toBeDefined();
    expect(quoteNotif.message).toContain("โครงการทดสอบแจ้งเตือน");

    // ทำเครื่องหมายว่าอ่านการแจ้งเตือนนั้นแล้ว ตรวจว่าจำนวนลดลงและ flag อ่านสลับค่า
    const markRes = await customer.agent.post(`/api/notifications/${quoteNotif.id}/read`);
    expect(markRes.status).toBe(204);
    const custCountAfterRead = await customer.agent.get("/api/notifications/unread-count");
    expect(custCountAfterRead.body.count).toBe(custCountAfter.body.count - 1);

    // ลูกค้าตอบกลับ -> พนักงานได้รับการแจ้งเตือน
    const staffCountBefore = await owner.agent.get("/api/notifications/unread-count");
    const respondRes = await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "ACCEPT" });
    expect(respondRes.status).toBe(200);

    const staffCountAfter = await owner.agent.get("/api/notifications/unread-count");
    expect(staffCountAfter.body.count).toBe(staffCountBefore.body.count + 1);
    const staffList = await owner.agent.get("/api/notifications");
    const respondNotif = staffList.body.notifications.find(
      (n: { link: string }) => n.link === `/projects/${projectId}`,
    );
    expect(respondNotif).toBeDefined();
    expect(respondNotif.message).toContain("ยอมรับใบเสนอราคา");
  });

  it("แจ้งลูกค้าเมื่อออกสัญญา เปลี่ยนสถานะโครงการ และเมื่อส่งใบเสนอราคาฉบับแก้ไข", async () => {
    const customer = await createAndLoginCustomer("test-notifications-events");
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(customerUser.id);

    const createRes = await owner.agent.post("/api/projects").send({ name: "โครงการทดสอบเหตุการณ์" });
    const projectId = createRes.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent.patch(`/api/projects/${projectId}`).send({ customerId: customerUser.id });
    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 2 });

    // ฉบับแรก: ข้อความต้องเป็นแบบ "ใบเสนอราคาใหม่"
    const first = await owner.agent.post(`/api/projects/${projectId}/quotes`).send();
    await sendQuote(owner.agent, projectId, first.body.quote.id);

    // ฉบับที่สองของโครงการเดียวกัน = ฉบับแก้ไข ต้องบอกให้ชัดว่าเป็นฉบับที่เท่าไร
    const second = await owner.agent.post(`/api/projects/${projectId}/quotes`).send();
    expect(second.body.quote.revisionNo).toBe(2);
    await sendQuote(owner.agent, projectId, second.body.quote.id);

    const afterQuotes = await customer.agent.get("/api/notifications");
    const revisionNotif = afterQuotes.body.notifications.find((n: { link: string }) =>
      n.link === `/my/quotes/${second.body.quote.id}`,
    );
    expect(revisionNotif.message).toContain("ฉบับแก้ไข");
    expect(revisionNotif.message).toContain("ฉบับที่ 2");
    const firstNotif = afterQuotes.body.notifications.find((n: { link: string }) =>
      n.link === `/my/quotes/${first.body.quote.id}`,
    );
    expect(firstNotif.message).toContain("มีใบเสนอราคาใหม่");
    expect(firstNotif.message).not.toContain("ฉบับแก้ไข");

    // ลูกค้ายอมรับ -> โครงการขยับเป็น APPROVED -> ออกสัญญาได้
    await customer.agent
      .post(`/api/my/quotes/${second.body.quote.id}/respond`)
      .send({ action: "ACCEPT" });

    const contractRes = await owner.agent.post(`/api/projects/${projectId}/contracts`).send();
    expect(contractRes.status).toBe(201);
    const contractNo = contractRes.body.contract.contractNo as string;

    const afterContract = await customer.agent.get("/api/notifications");
    const contractNotif = afterContract.body.notifications.find(
      (n: { link: string | null }) => n.link === "/my/contracts",
    );
    expect(contractNotif).toBeDefined();
    expect(contractNotif.message).toContain(contractNo);
    expect(contractNotif.read).toBe(false);

    // ส่งมอบงาน -> แจ้งลูกค้า (ไม่มีลิงก์ เพราะพอร์ทัลลูกค้าไม่มีหน้าโครงการ)
    const beforeDone = Date.now();
    const done = await owner.agent
      .post(`/api/projects/${projectId}/transition`)
      .send({ toStatus: "COMPLETED" });
    expect(done.status).toBe(200);
    // วันที่ส่งมอบถูกบันทึก — แถบขั้นตอนแสดงใต้ขั้น "ส่งมอบ"
    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    expect(new Date(detail.body.project.completedAt).getTime()).toBeGreaterThanOrEqual(beforeDone - 1000);

    const afterDone = await customer.agent.get("/api/notifications");
    const doneNotif = afterDone.body.notifications.find((n: { message: string }) =>
      n.message.includes("ส่งมอบงาน"),
    );
    expect(doneNotif).toBeDefined();
    expect(doneNotif.link).toBeNull();
  });

  it("does not let a user mark or see another user's notification", async () => {
    const customerA = await createAndLoginCustomer("test-notifications-a");
    const userA = await prisma.user.findUniqueOrThrow({ where: { email: customerA.email } });
    createdUserIds.push(userA.id);
    const customerB = await createAndLoginCustomer("test-notifications-b");
    const userB = await prisma.user.findUniqueOrThrow({ where: { email: customerB.email } });
    createdUserIds.push(userB.id);

    const notif = await prisma.notification.create({
      data: { userId: userA.id, message: "ข้อความส่วนตัวของ A", link: "/my/quotes" },
    });

    const listB = await customerB.agent.get("/api/notifications");
    expect(listB.body.notifications.some((n: { id: string }) => n.id === notif.id)).toBe(false);

    // B tries to mark A's notification as read — should silently no-op, not affect A's data.
    const markRes = await customerB.agent.post(`/api/notifications/${notif.id}/read`);
    expect(markRes.status).toBe(204);
    const stillUnread = await prisma.notification.findUniqueOrThrow({ where: { id: notif.id } });
    expect(stillUnread.read).toBe(false);
  });
});
