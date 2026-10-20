import { prisma } from "../../src/lib/prisma";
import { renderQuotePdf } from "../../src/lib/pdf/quote-pdf";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// จุด entry แบบ ESM อย่างเดียวของ Puppeteer รันใต้ runtime เทสต์แบบ CJS ของ ts-jest ไม่ได้
// ("Unexpected token 'export'") — นี่คือข้อจำกัดเรื่อง sandbox ของ Jest/Chromium ไม่ใช่บั๊ก
// จริงของแอป (ยืนยันแล้วว่าทำงานได้ผ่าน `tsx` และการทดสอบ end-to-end ด้วย curl) เราจึง mock
// การเรียกเรนเดอร์ตรงนี้ แล้ว assert ตรรกะการสร้างข้อมูลของเราเองแทน แทนที่จะไปเทสต์
// Puppeteer/Chromium ซ้ำ ซึ่งถูกเทสต์มาอย่างละเอียดจากต้นทางอยู่แล้ว
jest.mock("../../src/lib/pdf/quote-pdf", () => ({
  renderQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

describe("quotes module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-quotes-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบใบเสนอราคา" });
    createdCategoryIds.push(category.body.category.id);

    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบใบเสนอราคา",
    });
    createdCategoryIds.push(subgroup.body.category.id);

    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบใบเสนอราคา",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบใบเสนอราคา",
      unit: "หน่วย",
      materialUnitPrice: 1000,
      laborUnitPrice: 200,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);
  });

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function createProjectWithBoq(name: string) {
    const projectRes = await owner.agent.post("/api/projects").send({ name });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);
    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 2 });
    return projectId;
  }

  it("rejects creating a quote for a project with no BOQ items", async () => {
    const projectRes = await owner.agent.post("/api/projects").send({ name: "โครงการไม่มี BOQ" });
    const projectId = projectRes.body.project.id;
    createdProjectIds.push(projectId);

    const res = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    expect(res.status).toBe(409);
  });

  it("creates a quote with an auto-generated quoteNo once the BOQ has items", async () => {
    const projectId = await createProjectWithBoq("โครงการมี BOQ สำหรับใบเสนอราคา");

    const res = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    expect(res.status).toBe(201);
    expect(res.body.quote.quoteNo).toMatch(/^QT-\d{4}-\d{4,}$/);
    expect(res.body.quote.status).toBe("DRAFT");
  });

  it("lists and fetches quote detail", async () => {
    const projectId = await createProjectWithBoq("โครงการดูใบเสนอราคา");
    const created = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = created.body.quote.id;

    const listRes = await owner.agent.get(`/api/projects/${projectId}/quotes`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.quotes.map((q: { id: string }) => q.id)).toContain(quoteId);

    const getRes = await owner.agent.get(`/api/projects/${projectId}/quotes/${quoteId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.quote.id).toBe(quoteId);
  });

  it("rejects skipping straight to ACCEPTED from DRAFT", async () => {
    const projectId = await createProjectWithBoq("โครงการ state machine ใบเสนอราคา");
    const created = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = created.body.quote.id;

    const res = await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "ACCEPTED" });
    expect(res.status).toBe(409);
  });

  it("sending a quote moves a DRAFT project forward to QUOTED", async () => {
    const projectId = await createProjectWithBoq("โครงการเปลี่ยนสถานะอัตโนมัติ");
    const created = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = created.body.quote.id;

    const sendRes = await sendQuote(owner.agent, projectId, quoteId);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.quote.sentAt).not.toBeNull();

    const projectRes = await owner.agent.get(`/api/projects/${projectId}`);
    expect(projectRes.body.project.status).toBe("QUOTED");
  });

  it("builds correct PDF data (groups/subtotals) and streams the rendered bytes", async () => {
    const projectId = await createProjectWithBoq("โครงการ PDF");
    const created = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = created.body.quote.id;

    const pdfRes = await owner.agent
      .get(`/api/projects/${projectId}/quotes/${quoteId}/pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toBe("application/pdf");
    expect((pdfRes.body as Buffer).toString()).toBe("%PDF-1.7 mock");

    const mockRender = renderQuotePdf as jest.Mock;
    const dataPassed = mockRender.mock.calls[mockRender.mock.calls.length - 1][0];
    expect(dataPassed.quoteNo).toBe(created.body.quote.quoteNo);
    expect(dataPassed.groups).toHaveLength(1);
    expect(dataPassed.groups[0].items).toHaveLength(1);
    // วัสดุ 1000 + ค่าแรง 200, จำนวน 2, ตรงกับ createProjectWithBoq
    expect(dataPassed.groups[0].subtotal).toBeCloseTo(2400, 2);
    expect(dataPassed.directCost).toBeCloseTo(2400, 2);
  });

  it("deletes a DRAFT quote (accidental create) but refuses to delete a SENT one", async () => {
    const projectId = await createProjectWithBoq("โครงการลบใบเสนอราคาร่าง");

    const created = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = created.body.quote.id;
    const del = await owner.agent.delete(`/api/projects/${projectId}/quotes/${quoteId}`);
    expect(del.status).toBe(204);

    const list = await owner.agent.get(`/api/projects/${projectId}/quotes`);
    expect(list.body.quotes.map((q: { id: string }) => q.id)).not.toContain(quoteId);

    const created2 = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId2 = created2.body.quote.id;
    await sendQuote(owner.agent, projectId, quoteId2);
    const delSent = await owner.agent.delete(`/api/projects/${projectId}/quotes/${quoteId2}`);
    expect(delSent.status).toBe(409);
  });

  it("rejects a CUSTOMER creating or reading quotes", async () => {
    const projectId = await createProjectWithBoq("โครงการห้ามลูกค้าดูใบเสนอราคา");
    const customer = await createAndLoginCustomer("test-quotes-customer");

    const createRes = await customer.agent.post(`/api/projects/${projectId}/quotes`);
    expect(createRes.status).toBe(403);

    const listRes = await customer.agent.get(`/api/projects/${projectId}/quotes`);
    expect(listRes.status).toBe(403);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });
});
