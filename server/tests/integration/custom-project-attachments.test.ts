import fs from "node:fs";
import path from "node:path";

import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";
import { sendQuote } from "../helpers/quote-send";

// Puppeteer เรนเดอร์ PDF ไม่ได้ใต้ jest (ESM/Chromium sandbox) — mock ไว้เหมือน quotes.test.ts
jest.mock("../../src/lib/pdf/contract-pdf", () => ({
  renderContractPdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock-contract")),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function binaryParser(res: any, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
}

describe("custom projects + quote attachments", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdProjectIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-custom-owner");
    createdUserIds.push(owner.userId);
  });

  afterAll(async () => {
    await prisma.quoteAttachment.deleteMany({
      where: { quote: { projectId: { in: createdProjectIds } } },
    });
    await prisma.contract.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function createCustomProject(name: string, customerId?: string) {
    const res = await owner.agent.post("/api/projects").send({ name, type: "CUSTOM", customerId });
    createdProjectIds.push(res.body.project.id);
    return res.body.project.id as string;
  }

  it("creates a CUSTOM project with type set and zero starting price", async () => {
    const res = await owner.agent.post("/api/projects").send({ name: "บ้านออกแบบใหม่", type: "CUSTOM" });
    expect(res.status).toBe(201);
    expect(res.body.project.type).toBe("CUSTOM");
    createdProjectIds.push(res.body.project.id);

    const detail = await owner.agent.get(`/api/projects/${res.body.project.id}`);
    expect(Number(detail.body.currentVersion.netPrice)).toBe(0);
  });

  it("blocks BOQ item creation on a CUSTOM project", async () => {
    const projectId = await createCustomProject("บ้าน CUSTOM กัน BOQ");
    const res = await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: "irrelevant", quantity: 1, name: "x", unit: "ชิ้น", materialUnitPrice: 10 });
    expect(res.status).toBe(409);
  });

  it("computes VAT on the manual pre-VAT subtotal and stores it on the version", async () => {
    const projectId = await createCustomProject("บ้าน CUSTOM ราคา");

    const noPrice = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    expect(noPrice.status).toBe(409);

    const priceRes = await owner.agent
      .post(`/api/projects/${projectId}/custom-price`)
      .send({ subtotalBeforeVat: 1000 });
    expect(priceRes.status).toBe(200);
    const vatPct = Number(priceRes.body.version.vatPct);
    expect(Number(priceRes.body.version.directCost)).toBeCloseTo(1000, 2);
    expect(Number(priceRes.body.version.overheadProfitAmt)).toBe(0);
    expect(Number(priceRes.body.version.netPrice)).toBeCloseTo(1000 * (1 + vatPct / 100), 2);

    const withPrice = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    expect(withPrice.status).toBe(201);
  });

  it("cleans up the orphaned file and 404s when attaching to a non-existent quote", async () => {
    const projectId = await createCustomProject("บ้าน CUSTOM orphan");
    const dir = path.resolve(process.cwd(), "private-uploads");
    const before = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;

    const res = await owner.agent
      .post(`/api/projects/${projectId}/quotes/nonexistent-quote-id/attachments`)
      .field("kind", "QUOTE")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("orphan"), { filename: "x.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(404);

    const after = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    expect(after).toBe(before); // ไฟล์ที่เขียนไปถูกลบทิ้ง ไม่มี orphan ค้าง
  });

  it("rejects setting a custom price on a non-CUSTOM (ESTIMATE) project", async () => {
    const res0 = await owner.agent.post("/api/projects").send({ name: "โครงการประเมิน" });
    createdProjectIds.push(res0.body.project.id);
    const res = await owner.agent
      .post(`/api/projects/${res0.body.project.id}/custom-price`)
      .send({ subtotalBeforeVat: 500 });
    expect(res.status).toBe(409);
  });

  it("runs the full custom flow: attach → gated send → customer view/download → contract", async () => {
    const customer = await createAndLoginCustomer("test-custom-customer");
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(customerUser.id);

    const projectId = await createCustomProject("บ้าน CUSTOM เต็มวงจร", customerUser.id);
    await owner.agent.post(`/api/projects/${projectId}/custom-price`).send({ subtotalBeforeVat: 2_850_000 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;
    const attBase = `/api/projects/${projectId}/quotes/${quoteId}/attachments`;

    // ไฟล์ภายใน (Excel ที่โชว์กำไร)
    const internalUp = await owner.agent
      .post(attBase)
      .field("kind", "OTHER")
      .field("visibility", "INTERNAL")
      .attach("file", Buffer.from("internal excel"), {
        filename: "ต้นทุน.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    expect(internalUp.status).toBe(201);
    const internalId = internalUp.body.attachment.id as string;

    // ส่งไม่ได้ถ้ายังไม่มีไฟล์ที่ "ให้ลูกค้าเห็น"
    // ขออนุมัติก็ไม่ได้เช่นกัน — กันไว้ตั้งแต่ต้นทาง ไม่งั้นอนุมัติเสร็จแล้วค่อยเจอว่าส่งไม่ได้
    // และตอนนั้นไฟล์ที่ลูกค้าเห็นก็ถูกล็อกไปแล้ว
    const blockedSubmit = await owner.agent.post(`/api/projects/${projectId}/quotes/${quoteId}/approval/submit`);
    expect(blockedSubmit.status).toBe(409);
    const blockedSend = await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "SENT" });
    expect(blockedSend.status).toBe(409);

    // ไฟล์ที่ให้ลูกค้าเห็น (ใบเสนอราคาจริง)
    const customerUp = await owner.agent
      .post(attBase)
      .field("kind", "QUOTE")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("%PDF customer quote"), {
        filename: "ใบเสนอราคา.pdf",
        contentType: "application/pdf",
      });
    expect(customerUp.status).toBe(201);
    const customerAttId = customerUp.body.attachment.id as string;

    // ตอนนี้ส่งได้แล้ว
    const send = await sendQuote(owner.agent, projectId, quoteId);
    expect(send.status).toBe(200);

    // พนักงานเห็นไฟล์แนบทั้งสอง
    const list = await owner.agent.get(`/api/projects/${projectId}/quotes`);
    const q = list.body.quotes.find((x: { id: string }) => x.id === quoteId);
    expect(q.attachments).toHaveLength(2);

    // ลูกค้าเห็นใบเสนอราคา: isCustom=true, ไม่มี groups, มีเฉพาะไฟล์ CUSTOMER
    const myQuote = await customer.agent.get(`/api/my/quotes/${quoteId}`);
    expect(myQuote.status).toBe(200);
    expect(myQuote.body.quote.isCustom).toBe(true);
    expect(myQuote.body.quote.groups).toHaveLength(0);
    expect(myQuote.body.quote.attachments).toHaveLength(1);
    expect(myQuote.body.quote.attachments[0].id).toBe(customerAttId);

    // ลูกค้าโหลดไฟล์ CUSTOMER ได้
    const customerDl = await customer.agent.get(
      `/api/my/quotes/${quoteId}/attachments/${customerAttId}/download`,
    );
    expect(customerDl.status).toBe(200);

    // ลูกค้าโหลดไฟล์ INTERNAL ไม่ได้ (กันข้อมูลกำไรหลุด)
    const customerDlInternal = await customer.agent.get(
      `/api/my/quotes/${quoteId}/attachments/${internalId}/download`,
    );
    expect(customerDlInternal.status).toBe(404);

    // พนักงานโหลดได้ทั้งสองไฟล์
    const staffDl = await owner.agent.get(`${attBase}/${internalId}/download`);
    expect(staffDl.status).toBe(200);

    // สลับ/ลบไฟล์ได้แม้ส่งใบเสนอราคาไปแล้ว
    const del = await owner.agent.delete(`${attBase}/${internalId}`);
    expect(del.status).toBe(204);

    // ลูกค้ายอมรับ → โปรเจกต์เป็น APPROVED → ออกสัญญา → ลูกค้าเห็น/โหลดสัญญาได้
    const accept = await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "ACCEPT" });
    expect(accept.status).toBe(200);

    const projAfter = await owner.agent.get(`/api/projects/${projectId}`);
    expect(projAfter.body.project.status).toBe("APPROVED");

    const contractRes = await owner.agent.post(`/api/projects/${projectId}/contracts`);
    expect(contractRes.status).toBe(201);
    const contractId = contractRes.body.contract.id as string;

    const myContracts = await customer.agent.get("/api/my/contracts");
    expect(myContracts.status).toBe(200);
    expect(myContracts.body.contracts.map((c: { id: string }) => c.id)).toContain(contractId);

    const contractPdf = await customer.agent
      .get(`/api/my/contracts/${contractId}/pdf`)
      .buffer(true)
      .parse(binaryParser);
    expect(contractPdf.status).toBe(200);
    expect(contractPdf.headers["content-type"]).toBe("application/pdf");

    // ลูกค้าอื่นเข้าถึงสัญญานี้ไม่ได้
    const other = await createAndLoginCustomer("test-custom-other");
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { email: other.email } });
    createdUserIds.push(otherUser.id);
    const otherContract = await other.agent.get(`/api/my/contracts/${contractId}/pdf`);
    expect(otherContract.status).toBe(404);
    const otherAtt = await other.agent.get(
      `/api/my/quotes/${quoteId}/attachments/${customerAttId}/download`,
    );
    expect(otherAtt.status).toBe(404);
  });

  it("holds the attachment notice until the quote is sent (customers cannot open drafts)", async () => {
    const customer = await createAndLoginCustomer("test-draft-notice-customer");
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(customerUser.id);

    const projectId = await createCustomProject("บ้าน CUSTOM แจ้งเตือน", customerUser.id);
    await owner.agent.post(`/api/projects/${projectId}/custom-price`).send({ subtotalBeforeVat: 900_000 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;
    const attBase = `/api/projects/${projectId}/quotes/${quoteId}/attachments`;

    const draftUp = await owner.agent
      .post(attBase)
      .field("kind", "QUOTE")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("%PDF draft"), {
        filename: "ใบเสนอราคา-ร่าง.pdf",
        contentType: "application/pdf",
      });
    expect(draftUp.status).toBe(201);

    // แนบตอนใบยังเป็นร่าง = ยังไม่แจ้ง — ลูกค้ากดแล้วจะเจอหน้า 404
    const draftNotices = await prisma.notification.count({ where: { userId: customerUser.id } });
    expect(draftNotices).toBe(0);

    // ยืนยันว่าเปิดไม่ได้จริง
    const draftQuote = await customer.agent.get(`/api/my/quotes/${quoteId}`);
    expect(draftQuote.status).toBe(404);

    await sendQuote(owner.agent, projectId, quoteId);

    // ตอนส่งแจ้งครั้งเดียว ไฟล์ที่แนบตอนร่างไปถึงมือพร้อมกัน
    const afterSend = await prisma.notification.findMany({ where: { userId: customerUser.id } });
    expect(afterSend).toHaveLength(1);
    expect(afterSend[0].link).toBe(`/my/quotes/${quoteId}`);

    // แนบเพิ่มหลังส่งแล้ว = ของใหม่ที่ลูกค้าเปิดได้จริง ต้องแจ้ง
    const sentUp = await owner.agent
      .post(attBase)
      .field("kind", "OTHER")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("%PDF extra"), {
        filename: "แบบเพิ่มเติม.pdf",
        contentType: "application/pdf",
      });
    expect(sentUp.status).toBe(201);

    const afterAttach = await prisma.notification.findMany({
      where: { userId: customerUser.id },
      orderBy: { createdAt: "asc" },
    });
    expect(afterAttach).toHaveLength(2);
    expect(afterAttach[1].message).toContain("แบบเพิ่มเติม.pdf");
  });

  it("tells the customer when an internal file is opened up to them, and only when it really changed", async () => {
    const customer = await createAndLoginCustomer("test-flip-notice-customer");
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(customerUser.id);

    const projectId = await createCustomProject("บ้าน CUSTOM พลิกสิทธิ์ไฟล์", customerUser.id);
    await owner.agent.post(`/api/projects/${projectId}/custom-price`).send({ subtotalBeforeVat: 750_000 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;
    const attBase = `/api/projects/${projectId}/quotes/${quoteId}/attachments`;

    // ไฟล์ภายในสองตัว: ตัวแรกใช้ทดสอบตอนใบยังเป็นร่าง ตัวที่สองใช้ตอนส่งแล้ว
    const uploadInternal = async (filename: string) => {
      const res = await owner.agent
        .post(attBase)
        .field("kind", "DESIGN")
        .field("visibility", "INTERNAL")
        .attach("file", Buffer.from("%PDF internal"), { filename, contentType: "application/pdf" });
      expect(res.status).toBe(201);
      return res.body.attachment.id as string;
    };
    const draftFlipId = await uploadInternal("แบบภายใน-ร่าง.pdf");
    const sentFlipId = await uploadInternal("แบบภายใน-หลังส่ง.pdf");

    // พลิกตอนใบยังเป็นร่าง = เงียบ (ลูกค้าเปิดใบร่างไม่ได้) และต้องคงป้าย "แบบ" ไว้
    const draftFlip = await owner.agent.patch(`${attBase}/${draftFlipId}`).send({ visibility: "CUSTOMER" });
    expect(draftFlip.status).toBe(200);
    expect(draftFlip.body.attachment.visibility).toBe("CUSTOMER");
    expect(draftFlip.body.attachment.kind).toBe("DESIGN");
    expect(await prisma.notification.count({ where: { userId: customerUser.id } })).toBe(0);

    await sendQuote(owner.agent, projectId, quoteId);
    const countAfterSend = await prisma.notification.count({ where: { userId: customerUser.id } });
    expect(countAfterSend).toBe(1); // แจ้งว่าใบเสนอราคาพร้อมให้ดู

    // พลิกบนใบที่ส่งแล้ว = ลูกค้าได้เอกสารเพิ่มจริง ต้องแจ้ง
    const sentFlip = await owner.agent.patch(`${attBase}/${sentFlipId}`).send({ visibility: "CUSTOMER" });
    expect(sentFlip.status).toBe(200);
    expect(sentFlip.body.attachment.kind).toBe("DESIGN");
    const afterFlip = await prisma.notification.findMany({
      where: { userId: customerUser.id },
      orderBy: { createdAt: "asc" },
    });
    expect(afterFlip).toHaveLength(2);
    expect(afterFlip[1].message).toContain("แบบภายใน-หลังส่ง.pdf");
    expect(afterFlip[1].link).toBe(`/my/quotes/${quoteId}`);

    // ลูกค้าเห็นไฟล์ที่เพิ่งเปิดให้จริง
    const myQuote = await customer.agent.get(`/api/my/quotes/${quoteId}`);
    expect(myQuote.body.quote.attachments.map((a: { id: string }) => a.id)).toContain(sentFlipId);

    // ส่งค่าเดิมซ้ำ / แก้ช่องอื่น = ไม่มีอะไรเปลี่ยน ต้องไม่แจ้งซ้ำ
    await owner.agent.patch(`${attBase}/${sentFlipId}`).send({ visibility: "CUSTOMER" });
    await owner.agent.patch(`${attBase}/${sentFlipId}`).send({ kind: "QUOTE" });
    expect(await prisma.notification.count({ where: { userId: customerUser.id } })).toBe(2);

    // พลิกกลับเป็นไฟล์ภายใน = ไม่แจ้ง (ไฟล์แค่หายไปจากหน้าลูกค้า)
    const back = await owner.agent.patch(`${attBase}/${sentFlipId}`).send({ visibility: "INTERNAL" });
    expect(back.status).toBe(200);
    expect(back.body.attachment.kind).toBe("QUOTE"); // ค่าที่เพิ่งตั้งไว้ต้องไม่ถูกรีเซ็ต
    expect(await prisma.notification.count({ where: { userId: customerUser.id } })).toBe(2);

    // ค่าที่ไม่ใช่ตัวเลือกที่มีอยู่ต้องตอบ 400 ไม่ใช่เงียบ ๆ เปลี่ยนสถานะไฟล์ให้
    const bad = await owner.agent.patch(`${attBase}/${sentFlipId}`).send({ visibility: "PUBLIC" });
    expect(bad.status).toBe(400);
    const untouched = await prisma.quoteAttachment.findUniqueOrThrow({ where: { id: sentFlipId } });
    expect(untouched.visibility).toBe("INTERNAL");
    expect(untouched.kind).toBe("QUOTE");
  });

  it("stays quiet about files added to a quote whose project is in the trash", async () => {
    const customer = await createAndLoginCustomer("test-trash-notice-customer");
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(customerUser.id);

    const projectId = await createCustomProject("บ้าน CUSTOM ถังขยะ", customerUser.id);
    await owner.agent.post(`/api/projects/${projectId}/custom-price`).send({ subtotalBeforeVat: 600_000 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;
    const attBase = `/api/projects/${projectId}/quotes/${quoteId}/attachments`;

    const first = await owner.agent
      .post(attBase)
      .field("kind", "QUOTE")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("%PDF trash"), {
        filename: "ใบเสนอราคา-ถังขยะ.pdf",
        contentType: "application/pdf",
      });
    expect(first.status).toBe(201);
    await sendQuote(owner.agent, projectId, quoteId);

    const before = await prisma.notification.count({ where: { userId: customerUser.id } });

    // ทาง endpoint ลบโครงการที่มีใบเสนอราคาแล้วไม่ได้ (ตอบ 409 ให้ไปใช้การยกเลิกแทน) สถานะนี้จึง
    // เกิดจากการใช้งานปกติไม่ได้ — ตั้ง deletedAt ตรง ๆ เพื่อกันชั้นนี้ไว้เหมือนที่ myQuotes.service กันไว้เอง
    const blocked = await owner.agent.delete(`/api/projects/${projectId}`);
    expect(blocked.status).toBe(409);
    await prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });

    // โครงการในถังขยะ: ลูกค้าเปิดใบเสนอราคาไม่ได้แล้ว การแจ้งจึงต้องไม่เกิด
    const myQuote = await customer.agent.get(`/api/my/quotes/${quoteId}`);
    expect(myQuote.status).toBe(404);

    const afterTrash = await owner.agent
      .post(attBase)
      .field("kind", "OTHER")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("%PDF trash 2"), {
        filename: "เอกสารหลังลบโครงการ.pdf",
        contentType: "application/pdf",
      });
    expect(afterTrash.status).toBe(201);
    expect(await prisma.notification.count({ where: { userId: customerUser.id } })).toBe(before);

    // คืนโครงการออกจากถังขยะ ให้ afterAll เก็บกวาดตามทางปกติ
    await prisma.project.update({ where: { id: projectId }, data: { deletedAt: null } });
  });

  it("serves attachments inline for preview, but only for file types a browser can render", async () => {
    const customer = await createAndLoginCustomer("test-preview-customer");
    const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customer.email } });
    createdUserIds.push(customerUser.id);

    const projectId = await createCustomProject("บ้าน CUSTOM เปิดดูไฟล์", customerUser.id);
    await owner.agent.post(`/api/projects/${projectId}/custom-price`).send({ subtotalBeforeVat: 1_000_000 });
    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;
    const attBase = `/api/projects/${projectId}/quotes/${quoteId}/attachments`;

    const pdfUp = await owner.agent
      .post(attBase)
      .field("kind", "QUOTE")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("%PDF preview"), {
        filename: "ใบเสนอราคา.pdf",
        contentType: "application/pdf",
      });
    const pdfId = pdfUp.body.attachment.id as string;

    const excelUp = await owner.agent
      .post(attBase)
      .field("kind", "OTHER")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("excel"), {
        filename: "ถอดปริมาณ.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
    const excelId = excelUp.body.attachment.id as string;

    // ไฟล์รูปที่ "ประกาศตัว" ว่าเป็น HTML — ผ่านด่านอัปโหลดได้เพราะนามสกุลถูก (isAllowedAttachment)
    const spoofUp = await owner.agent
      .post(attBase)
      .field("kind", "DESIGN")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("<script>alert(1)</script>"), {
        filename: "แบบแปลน.png",
        contentType: "text/html",
      });
    const spoofId = spoofUp.body.attachment.id as string;

    const internalUp = await owner.agent
      .post(attBase)
      .field("kind", "OTHER")
      .field("visibility", "INTERNAL")
      .attach("file", Buffer.from("%PDF internal"), {
        filename: "ต้นทุนภายใน.pdf",
        contentType: "application/pdf",
      });
    const internalId = internalUp.body.attachment.id as string;

    await sendQuote(owner.agent, projectId, quoteId);

    // ลูกค้าเปิดดู PDF ได้ในเบราว์เซอร์ (inline) — ไม่ถูกบังคับให้บันทึกลงเครื่องก่อน
    const preview = await customer.agent.get(
      `/api/my/quotes/${quoteId}/attachments/${pdfId}/preview`,
    );
    expect(preview.status).toBe(200);
    expect(preview.headers["content-type"]).toContain("application/pdf");
    expect(preview.headers["content-disposition"]).toMatch(/^inline;/);

    // ปุ่มดาวน์โหลดเดิมยังบังคับบันทึกลงเครื่องเหมือนเดิม
    const download = await customer.agent.get(
      `/api/my/quotes/${quoteId}/attachments/${pdfId}/download`,
    );
    expect(download.headers["content-disposition"]).toMatch(/^attachment;/);

    // Excel เปิดในเบราว์เซอร์ไม่ได้ → ปฏิเสธไปเลย ไม่ใช่ยัดไฟล์ให้เบราว์เซอร์เดา
    const excelPreview = await customer.agent.get(
      `/api/my/quotes/${quoteId}/attachments/${excelId}/preview`,
    );
    expect(excelPreview.status).toBe(415);

    // ด่านสำคัญ: ชนิดที่ส่งออกมาต้องมาจากนามสกุลไฟล์ ไม่ใช่ mimeType ที่ผู้อัปโหลดบอกมา
    // ไม่งั้นไฟล์ .png ที่อ้างว่าเป็น text/html จะรันสคริปต์บนโดเมนของ API ได้
    const spoofPreview = await customer.agent.get(
      `/api/my/quotes/${quoteId}/attachments/${spoofId}/preview`,
    );
    expect(spoofPreview.status).toBe(200);
    expect(spoofPreview.headers["content-type"]).toContain("image/png");
    expect(spoofPreview.headers["content-type"]).not.toContain("text/html");

    // ไฟล์ภายในยังหลุดถึงลูกค้าไม่ได้ แม้จะเป็น PDF ที่เปิดดูได้ก็ตาม
    const internalPreview = await customer.agent.get(
      `/api/my/quotes/${quoteId}/attachments/${internalId}/preview`,
    );
    expect(internalPreview.status).toBe(404);

    // พนักงานเปิดดูไฟล์ภายในได้
    const staffPreview = await owner.agent.get(`${attBase}/${internalId}/preview`);
    expect(staffPreview.status).toBe(200);
    expect(staffPreview.headers["content-disposition"]).toMatch(/^inline;/);
    const staffExcelPreview = await owner.agent.get(`${attBase}/${excelId}/preview`);
    expect(staffExcelPreview.status).toBe(415);

    // หน้าเว็บต้องบอกได้ว่าไฟล์แนบเมื่อไหร่ (เดิม DTO ฝั่งลูกค้าไม่มี createdAt เลย)
    const myQuote = await customer.agent.get(`/api/my/quotes/${quoteId}`);
    for (const a of myQuote.body.quote.attachments) {
      expect(typeof a.createdAt).toBe("string");
      expect(Number.isNaN(Date.parse(a.createdAt))).toBe(false);
    }
  });
});
