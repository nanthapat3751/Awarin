import { prisma } from "../../src/lib/prisma";
import { renderContractPdf } from "../../src/lib/pdf/contract-pdf";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// ดู quotes.test.ts ว่าทำไมต้อง mock: entry แบบ ESM ของ Puppeteer รันใต้ runtime CJS ของ
// ts-jest ไม่ได้ การเรนเดอร์จริงยืนยันแล้วว่าทำงานได้ผ่าน `tsx` + การ curl ด้วยมือ
jest.mock("../../src/lib/pdf/contract-pdf", () => ({
  renderContractPdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

describe("contracts module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  let materialId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-contracts-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบสัญญา" });
    createdCategoryIds.push(category.body.category.id);

    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบสัญญา",
    });
    createdCategoryIds.push(subgroup.body.category.id);

    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบสัญญา",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบสัญญา",
      unit: "หน่วย",
      materialUnitPrice: 5000,
      laborUnitPrice: 500,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);
  });

  afterAll(async () => {
    await prisma.contract.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  /** Creates a project, adds a BOQ line, sends a quote, accepts it, and approves the project. */
  async function createApprovedProject(name: string) {
    const projectRes = await owner.agent.post("/api/projects").send({ name });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 1 });

    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id;
    await sendQuote(owner.agent, projectId, quoteId);
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "ACCEPTED" });
    await owner.agent
      .post(`/api/projects/${projectId}/transition`)
      .send({ toStatus: "APPROVED" });

    return projectId;
  }

  it("rejects creating a contract for a project that isn't APPROVED yet", async () => {
    const projectRes = await owner.agent.post("/api/projects").send({ name: "โครงการยังไม่อนุมัติ" });
    const projectId = projectRes.body.project.id;
    createdProjectIds.push(projectId);

    const res = await owner.agent.post(`/api/projects/${projectId}/contracts`);
    expect(res.status).toBe(409);
  });

  it("creates a contract with an auto-generated contractNo once the project is APPROVED", async () => {
    const projectId = await createApprovedProject("โครงการอนุมัติแล้วสำหรับสัญญา");

    const res = await owner.agent.post(`/api/projects/${projectId}/contracts`);
    expect(res.status).toBe(201);
    expect(res.body.contract.contractNo).toMatch(/^CT-\d{4}-\d{4,}$/);
    expect(res.body.contract.signedAt).toBeNull();
  });

  it("signs a contract once and rejects signing it twice", async () => {
    const projectId = await createApprovedProject("โครงการเซ็นสัญญา");
    const created = await owner.agent.post(`/api/projects/${projectId}/contracts`);
    const contractId = created.body.contract.id;

    const signRes = await owner.agent.post(`/api/projects/${projectId}/contracts/${contractId}/sign`);
    expect(signRes.status).toBe(200);
    expect(signRes.body.contract.signedAt).not.toBeNull();

    const secondSignRes = await owner.agent.post(
      `/api/projects/${projectId}/contracts/${contractId}/sign`,
    );
    expect(secondSignRes.status).toBe(409);
  });

  it("builds correct PDF data (contract amount from the accepted version) and streams the bytes", async () => {
    const projectId = await createApprovedProject("โครงการสัญญา PDF");
    const created = await owner.agent.post(`/api/projects/${projectId}/contracts`);
    const contractId = created.body.contract.id;

    const pdfRes = await owner.agent
      .get(`/api/projects/${projectId}/contracts/${contractId}/pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toBe("application/pdf");
    expect((pdfRes.body as Buffer).toString()).toBe("%PDF-1.7 mock");

    const mockRender = renderContractPdf as jest.Mock;
    const dataPassed = mockRender.mock.calls[mockRender.mock.calls.length - 1][0];
    expect(dataPassed.contractNo).toBe(created.body.contract.contractNo);
    // วัสดุ 5000 + ค่าแรง 500, จำนวน 1, ตรงกับ createApprovedProject
    expect(dataPassed.contractAmount).toBeGreaterThan(0);
  });

  it("ตรึงผู้ลงนามฝั่งบริษัทไว้กับสัญญาตอนออก — เปลี่ยนในหน้าตั้งค่าทีหลังไม่กระทบฉบับเดิม", async () => {
    const KEYS = ["companySignatoryName", "companySignatoryTitle"];
    const before = await prisma.setting.findMany({ where: { key: { in: KEYS } } });
    try {
      await owner.agent.patch("/api/settings").send({ companySignatoryName: "", companySignatoryTitle: "" });
      const projectA = await createApprovedProject("โครงการสัญญาก่อนตั้งผู้ลงนาม");
      const unsigned = await owner.agent.post(`/api/projects/${projectA}/contracts`);
      expect(unsigned.body.contract.signatoryName).toBeNull();

      await owner.agent
        .patch("/api/settings")
        .send({ companySignatoryName: "นายสมชาย ใจดี", companySignatoryTitle: "กรรมการผู้จัดการ" });
      const projectB = await createApprovedProject("โครงการสัญญาผู้ลงนาม");
      const created = await owner.agent.post(`/api/projects/${projectB}/contracts`);
      expect(created.body.contract.signatoryName).toBe("นายสมชาย ใจดี");
      expect(created.body.contract.signatoryTitle).toBe("กรรมการผู้จัดการ");

      // เปลี่ยนกรรมการ — สัญญาที่ออกไปแล้วต้องยังพิมพ์ชื่อคนเดิม
      await owner.agent
        .patch("/api/settings")
        .send({ companySignatoryName: "นางสาวสมหญิง ใหม่", companySignatoryTitle: "กรรมการ" });
      await owner.agent.get(`/api/projects/${projectB}/contracts/${created.body.contract.id}/pdf`);
      const mockRender = renderContractPdf as jest.Mock;
      const printed = mockRender.mock.calls[mockRender.mock.calls.length - 1][0];
      expect(printed.signatory).toEqual({ name: "นายสมชาย ใจดี", title: "กรรมการผู้จัดการ" });
      // โลโก้ส่งไปกับข้อมูลเสมอ (ของที่อัปโหลด หรือไฟล์ตั้งต้น)
      expect(printed.logo).toMatch(/^data:image\/png;base64,/);

      // ฉบับที่ออกตอนยังไม่ตั้งผู้ลงนาม ไม่ถูกเติมชื่อคนปัจจุบันให้ย้อนหลัง
      await owner.agent.get(`/api/projects/${projectA}/contracts/${unsigned.body.contract.id}/pdf`);
      const legacy = mockRender.mock.calls[mockRender.mock.calls.length - 1][0];
      expect(legacy.signatory).toBeNull();
    } finally {
      await prisma.setting.deleteMany({ where: { key: { in: KEYS } } });
      for (const row of before) {
        await prisma.setting.create({ data: { key: row.key, value: row.value } });
      }
    }
  });

  it("rejects a CUSTOMER creating or signing contracts", async () => {
    const projectId = await createApprovedProject("โครงการห้ามลูกค้าทำสัญญา");
    const customer = await createAndLoginCustomer("test-contracts-customer");

    const createRes = await customer.agent.post(`/api/projects/${projectId}/contracts`);
    expect(createRes.status).toBe(403);

    await prisma.user.deleteMany({ where: { email: customer.email } });
  });
});
