import { type ContractStructure, DEFAULT_CONTRACT_TEMPLATE } from "../../src/lib/contract-template";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

/**
 * แม่แบบสัญญาที่แก้ถ้อยคำเองได้ + การแช่แข็งเนื้อสัญญาลงฉบับที่ออกไปแล้ว
 *
 * เทสต์ที่สำคัญที่สุดในไฟล์นี้คือ "แก้แม่แบบแล้วสัญญาเก่าต้องไม่เปลี่ยน" — ถ้าพลาดข้อนี้
 * เอกสารที่คู่สัญญาเซ็นไปแล้วจะถูกแก้ย้อนหลังโดยไม่มีใครรู้ ซึ่งเป็นปัญหาทางกฎหมาย ไม่ใช่บั๊ก UI
 */
describe("contract templates", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdTemplateIds: string[] = [];
  // เทสต์ในไฟล์นี้สลับ "แม่แบบเริ่มต้น" ไปมา ต้องจำของเดิมไว้คืนตอนจบ
  // ไม่งั้นฐานข้อมูลจริงจะเหลือสภาพไม่มีแม่แบบเริ่มต้นเลยหลังรันเทสต์
  let originalDefaultId: string | null = null;
  /** แม่แบบมาตรฐาน 9 ข้อ — เทสต์ที่ต้องใช้ข้อ 7 ต้องระบุตัวนี้ตรง ๆ ไม่ใช่พึ่งค่าเริ่มต้น */
  let standardTemplateId = "";

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-ctpl-owner");
    createdUserIds.push(owner.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบแม่แบบสัญญา" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบแม่แบบสัญญา",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบแม่แบบสัญญา",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    await owner.agent.get("/api/contract-templates"); // สร้างแม่แบบมาตรฐานถ้ายังไม่มี

    /*
     * สร้างแม่แบบมาตรฐานของเทสต์เอง แทนการหยิบแถวที่ค้างอยู่ในฐานข้อมูล
     *
     * แถวที่ระบบสร้างให้ครั้งแรกเป็น "สำเนา" ของค่าตั้งต้นในโค้ด ณ วันนั้น และระบบตั้งใจไม่เขียนทับ
     * (ผู้ใช้แก้ถ้อยคำไปแล้วต้องไม่ถูกลบทิ้ง) เทสต์ที่ไปหยิบแถวนั้นมาจึงกลายเป็นการทดสอบ
     * "ฐานข้อมูลเครื่องนี้" ไม่ใช่ทดสอบโค้ด — พอค่าตั้งต้นในโค้ดถูกปรับ เทสต์จะแดงทั้งที่โค้ดถูก
     */
    const standard = await owner.agent.post("/api/contract-templates").send({
      name: `${DEFAULT_CONTRACT_TEMPLATE.name} [เทสต์]`,
      docTitle: DEFAULT_CONTRACT_TEMPLATE.docTitle,
      structure: DEFAULT_CONTRACT_TEMPLATE.structure,
    });
    standardTemplateId = standard.body.template.id as string;
    createdTemplateIds.push(standardTemplateId);
    const currentDefault = await prisma.contractTemplate.findFirst({
      where: { isDefault: true, deletedAt: null },
    });
    originalDefaultId = currentDefault?.id ?? null;
  });

  afterAll(async () => {
    await prisma.contract.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.contractTemplate.deleteMany({ where: { id: { in: createdTemplateIds } } });
    // คืนธง "แม่แบบเริ่มต้น" ให้เหมือนก่อนรันเทสต์
    if (originalDefaultId) {
      await prisma.contractTemplate.updateMany({
        where: { isDefault: true, id: { not: originalDefaultId } },
        data: { isDefault: false },
      });
      await prisma.contractTemplate.update({
        where: { id: originalDefaultId },
        data: { isDefault: true },
      });
    }
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  /** โครงการที่อนุมัติแล้ว (ออกสัญญาได้) มูลค่า 1,177.00 */
  async function approvedProject(name: string) {
    const res = await owner.agent
      .post("/api/projects")
      .send({ name, siteAddress: "ที่ตั้งทดสอบ" });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "รายการทดสอบ",
      quantity: 10,
      unit: "หน่วย",
      materialUnitPrice: 60,
      laborUnitPrice: 40,
    });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    const quoteId = quote.body.quote.id;
    await sendQuote(owner.agent, projectId, quoteId);
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "ACCEPTED" });
    await owner.agent.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" });
    return projectId;
  }

  const sampleStructure = (marker: string): ContractStructure => ({
    coverSubtitle: "{{ชื่อโครงการ}}",
    preamble: `${marker} ระหว่าง {{ชื่อผู้ว่าจ้าง}} กับ {{ชื่อผู้รับจ้าง}}`,
    clauses: [{ heading: "ข้อ 1. ทดสอบ", body: `มูลค่า {{มูลค่าสัญญา}} บาท — ${marker}` }],
    closing: "ทำขึ้นสองฉบับ",
  });

  it("มีแม่แบบมาตรฐาน 9 ข้อให้อัตโนมัติเมื่อระบบยังไม่มีแม่แบบเลย", async () => {
    const res = await owner.agent.get("/api/contract-templates");
    expect(res.status).toBe(200);

    // ตรวจที่ "แม่แบบมาตรฐานมีอยู่" ไม่ใช่ "ตัวไหนถือธงค่าเริ่มต้น" — ธงถูกสลับไปมาในเทสต์อื่น
    const standard = res.body.templates.find(
      (t: { id: string }) => t.id === standardTemplateId,
    );
    expect(standard).toBeDefined();
    expect(standard.structure.clauses).toHaveLength(9);

    // ส่งรายชื่อตัวแปรมาด้วย หน้าจอจะได้ไม่ต้องฮาร์ดโค้ดเอง
    expect(res.body.variables).toContain("ชื่อผู้ว่าจ้าง");
    expect(res.body.variables).toContain("มูลค่าสัญญาตัวหนังสือ");
  });

  it("สร้าง / แก้ไข / ตั้งเป็นค่าเริ่มต้นได้", async () => {
    const created = await owner.agent.post("/api/contract-templates").send({
      name: "แม่แบบทดสอบ ก",
      docTitle: "สัญญาทดสอบ",
      structure: sampleStructure("รุ่นแรก"),
    });
    expect(created.status).toBe(201);
    const id = created.body.template.id as string;
    createdTemplateIds.push(id);
    expect(created.body.template.isDefault).toBe(false);

    const updated = await owner.agent
      .patch(`/api/contract-templates/${id}`)
      .send({ name: "แม่แบบทดสอบ ก (แก้แล้ว)" });
    expect(updated.status).toBe(200);
    expect(updated.body.template.name).toBe("แม่แบบทดสอบ ก (แก้แล้ว)");

    const madeDefault = await owner.agent.post(`/api/contract-templates/${id}/default`);
    expect(madeDefault.status).toBe(200);
    expect(madeDefault.body.template.isDefault).toBe(true);

    // ต้องมีค่าเริ่มต้นได้ตัวเดียว — ตัวเดิมถูกปลดธงให้อัตโนมัติ
    const defaults = await prisma.contractTemplate.count({
      where: { isDefault: true, deletedAt: null },
    });
    expect(defaults).toBe(1);
  });

  it("เตือนตัวแปรที่พิมพ์ผิด แต่ยังบันทึกให้", async () => {
    const res = await owner.agent.post("/api/contract-templates").send({
      name: "แม่แบบทดสอบตัวแปรผิด",
      docTitle: "สัญญาทดสอบ",
      structure: {
        coverSubtitle: "",
        preamble: "เรียน {{ชื่อผู้วาจ้าง}}",
        clauses: [{ heading: "ข้อ 1.", body: "ทดสอบ" }],
        closing: "",
      },
    });
    expect(res.status).toBe(201);
    createdTemplateIds.push(res.body.template.id);
    expect(res.body.unknownVariables).toEqual(["ชื่อผู้วาจ้าง"]);
  });

  it("ปฏิเสธแม่แบบที่ไม่มีข้อสัญญาเลย หรืออารัมภบทว่าง", async () => {
    for (const structure of [
      { coverSubtitle: "", preamble: "ก", clauses: [], closing: "" },
      { coverSubtitle: "", preamble: "", clauses: [{ heading: "ข้อ 1.", body: "ก" }], closing: "" },
      { coverSubtitle: "", preamble: "ก", clauses: [{ heading: "", body: "ก" }], closing: "" },
    ]) {
      const res = await owner.agent
        .post("/api/contract-templates")
        .send({ name: "ไม่ควรถูกสร้าง", docTitle: "x", structure });
      expect(res.status).toBe(400);
    }
  });

  it("ออกสัญญาแล้วเนื้อหาถูกแทนค่าตัวแปรและแช่แข็งไว้กับฉบับนั้น", async () => {
    const tpl = await owner.agent.post("/api/contract-templates").send({
      name: "แม่แบบทดสอบแช่แข็ง",
      docTitle: "สัญญาทดสอบแช่แข็ง",
      structure: sampleStructure("รุ่นแรก"),
    });
    const templateId = tpl.body.template.id as string;
    createdTemplateIds.push(templateId);

    const projectId = await approvedProject("โครงการทดสอบแม่แบบ 1");
    const res = await owner.agent
      .post(`/api/projects/${projectId}/contracts`)
      .send({ templateId });

    expect(res.status).toBe(201);
    const c = res.body.contract;
    expect(c.templateId).toBe(templateId);
    expect(c.templateName).toBe("แม่แบบทดสอบแช่แข็ง");
    expect(c.docTitle).toBe("สัญญาทดสอบแช่แข็ง");
    // ตัวแปรถูกแทนค่าแล้ว ไม่เหลือ {{...}}
    expect(JSON.stringify(c.bodyJson)).not.toMatch(/\{\{/);
    expect(c.bodyJson.clauses[0].body).toContain("1,177.00");
    expect(c.bodyJson.preamble).toContain("รุ่นแรก");
  });

  /*
   * หน้าโครงการเพิ่งมีช่องเลือกแม่แบบตอนออกสัญญา สองเทสต์นี้ค้ำสัญญาที่หน้าจอฝากไว้กับเซิร์ฟเวอร์:
   * เลือกตัวไหนต้องได้ตัวนั้น และ "ไม่เลือก" ต้องได้ตัวค่าเริ่มต้นเสมอ ไม่ใช่ตัวที่สร้างล่าสุด
   */
  it("ไม่ระบุแม่แบบ = ได้ตัวค่าเริ่มต้น ไม่ใช่ตัวที่สร้างทีหลัง", async () => {
    const wanted = await owner.agent.post("/api/contract-templates").send({
      name: "แม่แบบที่ตั้งเป็นค่าเริ่มต้น",
      docTitle: "สัญญาจากตัวค่าเริ่มต้น",
      structure: sampleStructure("ตัวค่าเริ่มต้น"),
    });
    const wantedId = wanted.body.template.id as string;
    createdTemplateIds.push(wantedId);
    await owner.agent.post(`/api/contract-templates/${wantedId}/default`);

    // สร้างอีกตัวทีหลัง เพื่อพิสูจน์ว่าระบบไม่ได้หยิบ "ตัวล่าสุด" มาใช้
    const decoy = await owner.agent.post("/api/contract-templates").send({
      name: "แม่แบบที่ไม่ควรถูกหยิบ",
      docTitle: "สัญญาที่ไม่ควรออก",
      structure: sampleStructure("ตัวหลอก"),
    });
    createdTemplateIds.push(decoy.body.template.id as string);

    const projectId = await approvedProject("โครงการทดสอบค่าเริ่มต้น");
    const res = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});

    expect(res.status).toBe(201);
    expect(res.body.contract.templateId).toBe(wantedId);
    expect(res.body.contract.docTitle).toBe("สัญญาจากตัวค่าเริ่มต้น");
  });

  it("ระบุแม่แบบที่ไม่มีอยู่จริง = 404 และไม่สร้างสัญญาค้างไว้", async () => {
    const projectId = await approvedProject("โครงการทดสอบแม่แบบผิด");
    const res = await owner.agent
      .post(`/api/projects/${projectId}/contracts`)
      .send({ templateId: "ไม่มีแม่แบบนี้" });

    expect(res.status).toBe(404);
    expect(await prisma.contract.count({ where: { projectId } })).toBe(0);
  });

  it("แก้แม่แบบแล้ว สัญญาที่ออกไปแล้วต้องไม่เปลี่ยนตาม", async () => {
    const tpl = await owner.agent.post("/api/contract-templates").send({
      name: "แม่แบบทดสอบไม่ย้อนหลัง",
      docTitle: "สัญญาทดสอบ",
      structure: sampleStructure("ถ้อยคำเดิม"),
    });
    const templateId = tpl.body.template.id as string;
    createdTemplateIds.push(templateId);

    const projectId = await approvedProject("โครงการทดสอบแม่แบบ 2");
    const contractRes = await owner.agent
      .post(`/api/projects/${projectId}/contracts`)
      .send({ templateId });
    const contractId = contractRes.body.contract.id as string;

    await owner.agent
      .patch(`/api/contract-templates/${templateId}`)
      .send({ structure: sampleStructure("ถ้อยคำใหม่ที่แก้ทีหลัง") });

    const after = await owner.agent.get(`/api/projects/${projectId}/contracts/${contractId}`);
    expect(after.body.contract.bodyJson.preamble).toContain("ถ้อยคำเดิม");
    expect(after.body.contract.bodyJson.preamble).not.toContain("ถ้อยคำใหม่ที่แก้ทีหลัง");
  });

  it("แก้ข้อความของสัญญาฉบับนั้นได้ โดยแม่แบบกลางไม่ถูกแตะ", async () => {
    const projectId = await approvedProject("โครงการทดสอบแม่แบบ 3");
    const contractRes = await owner.agent
      .post(`/api/projects/${projectId}/contracts`)
      .send({ templateId: standardTemplateId });
    const contractId = contractRes.body.contract.id as string;
    const body = contractRes.body.contract.bodyJson as ContractStructure;

    // เติมเงื่อนไขเฉพาะฉบับนี้ต่อท้ายข้อ 7 — โทเคนตารางงวดงานต้องอยู่ครบเหมือนเดิม
    body.clauses[6].body += "\n\nงวดสุดท้ายชำระภายใน 235.40 วันหลังส่งมอบงาน";

    const saved = await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/body`)
      .send({ body });
    expect(saved.status).toBe(200);
    expect(saved.body.contract.bodyJson.clauses[6].body).toContain("235.40 วัน");
    expect(saved.body.contract.bodyJson.clauses[6].body).toContain("{{ตารางงวดงาน}}");

    // แม่แบบต้องไม่ถูกแตะ — แก้ที่ฉบับเดียว ไม่ใช่แก้ถ้อยคำกลางของทั้งบริษัท
    const tpl = await prisma.contractTemplate.findFirstOrThrow({
      where: { id: contractRes.body.contract.templateId },
    });
    expect(JSON.stringify(tpl.structure)).not.toContain("235.40");
  });

  it("สัญญาที่ลงนามแล้วแก้ข้อความไม่ได้", async () => {
    const projectId = await approvedProject("โครงการทดสอบแม่แบบ 4");
    const contractRes = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const contractId = contractRes.body.contract.id as string;
    await owner.agent.post(`/api/projects/${projectId}/contracts/${contractId}/sign`);

    const res = await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/body`)
      .send({ body: sampleStructure("แก้หลังเซ็น") });
    expect(res.status).toBe(409);

    const after = await owner.agent.get(`/api/projects/${projectId}/contracts/${contractId}`);
    expect(JSON.stringify(after.body.contract.bodyJson)).not.toContain("แก้หลังเซ็น");
  });

  it("ลบแม่แบบที่เป็นค่าเริ่มต้นไม่ได้ ต้องย้ายธงก่อน", async () => {
    const def = await prisma.contractTemplate.findFirstOrThrow({
      where: { isDefault: true, deletedAt: null },
    });
    const res = await owner.agent.delete(`/api/contract-templates/${def.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("ค่าเริ่มต้น");
  });

  it("ลบแม่แบบธรรมดา = ย้ายเข้าถังขยะ และกู้คืนได้", async () => {
    const created = await owner.agent.post("/api/contract-templates").send({
      name: "แม่แบบทดสอบถังขยะ",
      docTitle: "สัญญาทดสอบ",
      structure: sampleStructure("ถังขยะ"),
    });
    const id = created.body.template.id as string;
    createdTemplateIds.push(id);

    expect((await owner.agent.delete(`/api/contract-templates/${id}`)).status).toBe(204);

    const list = await owner.agent.get("/api/contract-templates");
    expect(list.body.templates.map((t: { id: string }) => t.id)).not.toContain(id);

    const trash = await owner.agent.get("/api/trash");
    const row = trash.body.items.find((i: { id: string }) => i.id === id);
    expect(row).toBeDefined();
    expect(row.type).toBe("contractTemplate");
    expect(row.typeLabel).toBe("แม่แบบสัญญา");

    const restored = await owner.agent.post(`/api/trash/contractTemplate/${id}/restore`);
    expect(restored.status).toBe(204);
    const back = await owner.agent.get("/api/contract-templates");
    expect(back.body.templates.map((t: { id: string }) => t.id)).toContain(id);
  });

  it("ออกสัญญาแล้วได้งวดเงินตั้งต้น 7 งวดที่รวมเท่ามูลค่าสัญญาพอดี", async () => {
    const projectId = await approvedProject("โครงการทดสอบงวดเงิน 1");
    const contractRes = await owner.agent
      .post(`/api/projects/${projectId}/contracts`)
      .send({ templateId: standardTemplateId });
    const contractId = contractRes.body.contract.id as string;

    // มูลค่าสัญญาถูกตรึงไว้กับฉบับนี้ ไม่ใช่ไปอ่านเวอร์ชันล่าสุดตอนพิมพ์
    expect(Number(contractRes.body.contract.amount)).toBe(1177);

    const res = await owner.agent.get(
      `/api/projects/${projectId}/contracts/${contractId}/installments`,
    );
    expect(res.status).toBe(200);
    expect(res.body.installments).toHaveLength(7);
    expect(res.body.installments.map((i: { seq: number }) => i.seq)).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const sum = res.body.installments.reduce(
      (a: number, i: { amount: string }) => a + Number(i.amount),
      0,
    );
    expect(Math.round(sum * 100) / 100).toBe(1177);
  });

  it("บอกได้ว่าเนื้อสัญญาจะพิมพ์ตารางงวดออกมาไหม — กันงวดที่กรอกแล้วหายเงียบ", async () => {
    const projectId = await approvedProject("โครงการทดสอบบล็อกตาราง");
    const contractRes = await owner.agent
      .post(`/api/projects/${projectId}/contracts`)
      .send({ templateId: standardTemplateId });
    const contractId = contractRes.body.contract.id as string;
    const url = `/api/projects/${projectId}/contracts/${contractId}/installments`;

    // มูลค่าเป้าหมายต้องมาจากเซิร์ฟเวอร์ ไม่ให้หน้าจอเดาเอง
    const before = await owner.agent.get(url);
    expect(Number(before.body.contractAmount)).toBe(1177);
    expect(before.body.printsTable).toBe(true);

    // ลบโทเคนออกจากเนื้อสัญญา = งวดยังบันทึกได้แต่จะไม่ถูกพิมพ์ ต้องมีสัญญาณบอก
    const body = contractRes.body.contract.bodyJson;
    const stripped = {
      ...body,
      clauses: body.clauses.map((c: { heading: string; body: string }) => ({
        ...c,
        body: c.body.replace("{{ตารางงวดงาน}}", "ตามที่ตกลงกัน"),
      })),
    };
    const patched = await owner.agent
      .patch(`/api/projects/${projectId}/contracts/${contractId}/body`)
      .send({ body: stripped });
    expect(patched.status).toBe(200);

    const after = await owner.agent.get(url);
    expect(after.body.printsTable).toBe(false);
    expect(after.body.installments).toHaveLength(7);
  });

  it("บันทึกงวดเงินได้เมื่อยอดรวมตรง และถูกปฏิเสธเมื่อไม่ตรง", async () => {
    const projectId = await approvedProject("โครงการทดสอบงวดเงิน 2");
    const contractRes = await owner.agent
      .post(`/api/projects/${projectId}/contracts`)
      .send({ templateId: standardTemplateId });
    const contractId = contractRes.body.contract.id as string;
    const url = `/api/projects/${projectId}/contracts/${contractId}/installments`;

    // ขาดไป 177 — นี่คือความผิดพลาดที่ตอนเป็นข้อความไม่มีอะไรดักได้เลย
    const short = await owner.agent
      .put(url)
      .send({ installments: [{ milestone: "มัดจำ", amount: 500 }, { milestone: "ส่งงาน", amount: 500 }] });
    expect(short.status).toBe(400);
    expect(short.body.error).toContain("ยังขาดอีก");

    const over = await owner.agent
      .put(url)
      .send({ installments: [{ milestone: "มัดจำ", amount: 2000 }] });
    expect(over.status).toBe(400);
    expect(over.body.error).toContain("เกินมูลค่าสัญญา");

    // ของเดิมต้องไม่ถูกแตะหลังคำขอที่ถูกปฏิเสธ
    expect((await owner.agent.get(url)).body.installments).toHaveLength(7);

    const ok = await owner.agent.put(url).send({
      installments: [
        { milestone: "เซ็นสัญญา", amount: 600 },
        { milestone: "ส่งมอบงาน", amount: 577 },
      ],
    });
    expect(ok.status).toBe(200);
    expect(ok.body.installments).toHaveLength(2);
    expect(ok.body.installments.map((i: { seq: number }) => i.seq)).toEqual([1, 2]);
    expect(Number(ok.body.installments[1].amount)).toBe(577);
  });

  it("ปฏิเสธงวดที่เงื่อนไขว่าง หรือไม่มีงวดเลย", async () => {
    const projectId = await approvedProject("โครงการทดสอบงวดเงิน 3");
    const contractRes = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const url = `/api/projects/${projectId}/contracts/${contractRes.body.contract.id}/installments`;

    for (const installments of [
      [],
      [{ milestone: "", amount: 1177 }],
      [{ milestone: "งวดเดียว", amount: -5 }],
    ]) {
      expect((await owner.agent.put(url).send({ installments })).status).toBe(400);
    }
  });

  it("สัญญาที่ลงนามแล้วแก้งวดเงินไม่ได้", async () => {
    const projectId = await approvedProject("โครงการทดสอบงวดเงิน 4");
    const contractRes = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const contractId = contractRes.body.contract.id as string;
    await owner.agent.post(`/api/projects/${projectId}/contracts/${contractId}/sign`);

    const res = await owner.agent
      .put(`/api/projects/${projectId}/contracts/${contractId}/installments`)
      .send({ installments: [{ milestone: "แก้หลังเซ็น", amount: 1177 }] });
    expect(res.status).toBe(409);
  });

  it("สัญญาที่ออกก่อนมีระบบแม่แบบยังเปิดดูได้ (bodyJson = null)", async () => {
    const projectId = await approvedProject("โครงการทดสอบแม่แบบ 5");
    const contractRes = await owner.agent.post(`/api/projects/${projectId}/contracts`).send({});
    const contractId = contractRes.body.contract.id as string;

    // จำลองสัญญาเก่า: ล้างเนื้อสัญญาออกให้เหมือนแถวที่มีอยู่ก่อน migration
    await prisma.contract.update({
      where: { id: contractId },
      data: { bodyJson: undefined, templateId: null, templateName: null, docTitle: null },
    });

    const res = await owner.agent.get(`/api/projects/${projectId}/contracts/${contractId}`);
    expect(res.status).toBe(200);
    expect(res.body.contract.templateName).toBeNull();
  });
});
