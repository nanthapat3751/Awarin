import sharp from "sharp";
import request from "supertest";

import { app } from "../../src/app";
import { renderQuoteSignatures } from "../../src/lib/pdf/company-blocks";
import { prisma } from "../../src/lib/prisma";
import { loadQuotePdfSigners } from "../../src/lib/quote-signers";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * ใบเสนอราคาสองช่องเซ็น: ผู้เสนอราคา (คนขออนุมัติ) + ผู้อนุมัติ (OWNER)
 * ส่งถึงลูกค้าได้ต่อเมื่ออนุมัติแล้ว และของที่อนุมัติต้องเป็นของที่ส่งจริง
 */
describe("quote approval + signatures", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let otherAdmin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdProjectIds: string[] = [];

  /** ลายเซ็นทดสอบ: เส้นหมึกบนพื้นขาว (สีต่างกันต่อคน จะได้แยกออกว่ารูปไหนของใคร) */
  const inkImage = (color: string, width = 400) =>
    sharp({ create: { width: 600, height: 200, channels: 3, background: "#ffffff" } })
      .composite([
        {
          input: { create: { width, height: 30, channels: 3, background: color } },
          top: 85,
          left: 100,
        },
      ])
      .png()
      .toBuffer();

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-approval-owner");
    admin = await createAndLoginAdmin("test-approval-admin");
    otherAdmin = await createAndLoginAdmin("test-approval-admin2");
    createdUserIds.push(owner.userId, admin.userId, otherAdmin.userId);
    await admin.agent
      .patch("/api/account/profile")
      .send({ fullName: "สมหญิง ผู้เสนอ", jobTitle: "วิศวกรประเมินราคา", workPhone: "081-234-5678" });
    await owner.agent.patch("/api/account/profile").send({ fullName: "สมชาย เจ้าของ", jobTitle: "กรรมการผู้จัดการ", workPhone: null });
    expect((await admin.agent.post("/api/account/signature").attach("file", await inkImage("#1a237e"), "a.png")).status).toBe(200);
    expect((await owner.agent.post("/api/account/signature").attach("file", await inkImage("#111111"), "o.png")).status).toBe(200);

    const category = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบอนุมัติ" });
    createdCategoryIds.push(category.body.category.id);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: category.body.category.id, name: "กลุ่มทดสอบอนุมัติ" });
    createdCategoryIds.push(sub.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "งานทดสอบอนุมัติ" });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function draftQuote(name: string) {
    const res = await admin.agent.post("/api/projects").send({ name });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await addLine(projectId, 100_000);
    const quote = await admin.agent.post(`/api/projects/${projectId}/quotes`);
    expect(quote.status).toBe(201);
    return { projectId, quoteId: quote.body.quote.id as string };
  }

  const addLine = (projectId: string, price: number) =>
    admin.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "งานเหมารวม",
      unit: "งาน",
      quantity: 1,
      materialUnitPrice: price,
      laborUnitPrice: 0,
    });

  const approvalOf = async (projectId: string, quoteId: string) => {
    const list = await owner.agent.get(`/api/projects/${projectId}/quotes`);
    return list.body.quotes.find((q: { id: string }) => q.id === quoteId);
  };
  const act = (who: typeof admin, projectId: string, quoteId: string, step: string, body?: object) =>
    who.agent.post(`/api/projects/${projectId}/quotes/${quoteId}/approval/${step}`).send(body ?? {});
  const send = (who: typeof admin, projectId: string, quoteId: string) =>
    who.agent.post(`/api/projects/${projectId}/quotes/${quoteId}/transition`).send({ toStatus: "SENT" });

  it("cannot send a quote that nobody approved", async () => {
    const { projectId, quoteId } = await draftQuote("อนุมัติ-ส่งไม่ได้");
    const res = await send(owner, projectId, quoteId);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("ยังไม่ได้รับอนุมัติ");
  });

  it("request → owner approves → send: both signers are frozen onto the quote", async () => {
    const { projectId, quoteId } = await draftQuote("อนุมัติ-ครบวงจร");

    expect((await act(admin, projectId, quoteId, "submit")).status).toBe(204);
    let q = await approvalOf(projectId, quoteId);
    expect(q.status).toBe("DRAFT");
    expect(q.approval.state).toBe("PENDING");
    expect(q.approval.proposer).toMatchObject({ name: "สมหญิง ผู้เสนอ", title: "วิศวกรประเมินราคา", hasSignature: true });
    expect(
      await prisma.notification.count({ where: { userId: owner.userId, message: { contains: "ขออนุมัติ" } } }),
    ).toBeGreaterThan(0);

    // ADMIN อนุมัติไม่ได้ — ทั้งของตัวเองและของคนอื่น
    expect((await act(admin, projectId, quoteId, "approve")).status).toBe(403);
    expect((await act(otherAdmin, projectId, quoteId, "approve")).status).toBe(403);
    // ขอซ้ำไม่ได้
    expect((await act(admin, projectId, quoteId, "submit")).status).toBe(409);

    expect((await act(owner, projectId, quoteId, "approve")).status).toBe(204);
    q = await approvalOf(projectId, quoteId);
    expect(q.approval.state).toBe("APPROVED");
    expect(q.approval.approver).toMatchObject({ name: "สมชาย เจ้าของ", hasSignature: true });
    expect(
      await prisma.notification.count({ where: { userId: admin.userId, message: { contains: "ได้รับอนุมัติ" } } }),
    ).toBe(1);

    expect((await send(admin, projectId, quoteId)).status).toBe(200);

    // ท้าย PDF (ทั้งฉบับลูกค้าและพนักงานใช้ตัวนี้): สองช่อง พร้อมลายเซ็นฝังในไฟล์ ชื่อ ตำแหน่ง เบอร์
    const signers = await loadQuotePdfSigners(quoteId);
    const html = renderQuoteSignatures({ companyName: "บริษัททดสอบ", signers });
    expect(html).toContain("ผู้เสนอราคา");
    expect(html).toContain("ผู้อนุมัติ");
    expect(html).toContain("( สมหญิง ผู้เสนอ )");
    expect(html).toContain("โทร 081-234-5678");
    expect(html).toContain("( สมชาย เจ้าของ )");
    expect(html.match(/<img class="sign-ink" src="data:image\/png;base64,/g)).toHaveLength(2);
  });

  it("changing my signature or name later does not change quotes I already signed", async () => {
    const { projectId, quoteId } = await draftQuote("อนุมัติ-ตรึงลายเซ็น");
    await act(admin, projectId, quoteId, "submit");
    const before = await prisma.quoteSigner.findUniqueOrThrow({
      where: { quoteId_role: { quoteId, role: "PROPOSER" } },
    });

    await admin.agent.post("/api/account/signature").attach("file", await inkImage("#b71c1c", 250), "new.png");
    await admin.agent.patch("/api/account/profile").send({ fullName: "ชื่อใหม่", jobTitle: null, workPhone: null });

    const after = await prisma.quoteSigner.findUniqueOrThrow({
      where: { quoteId_role: { quoteId, role: "PROPOSER" } },
    });
    expect(after.name).toBe("สมหญิง ผู้เสนอ");
    expect(Buffer.from(after.signaturePng!).equals(Buffer.from(before.signaturePng!))).toBe(true);

    await admin.agent
      .patch("/api/account/profile")
      .send({ fullName: "สมหญิง ผู้เสนอ", jobTitle: "วิศวกรประเมินราคา", workPhone: "081-234-5678" });
  });

  it("locks the approved content: BOQ edits go to a new version and customer files cannot change", async () => {
    const { projectId, quoteId } = await draftQuote("อนุมัติ-ล็อกเนื้อหา");
    const original = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    await act(admin, projectId, quoteId, "submit");

    expect((await addLine(projectId, 5_000)).status).toBe(201);
    const stillSame = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(stillSame.projectVersionId).toBe(original.projectVersionId);
    const versions = await prisma.projectVersion.count({ where: { projectId } });
    expect(versions).toBe(2);

    const customerFile = await admin.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/attachments`)
      .field("kind", "QUOTE")
      .field("visibility", "CUSTOMER")
      .attach("file", Buffer.from("%PDF-1.4 test"), { filename: "q.pdf", contentType: "application/pdf" });
    expect(customerFile.status).toBe(409);

    const internalFile = await admin.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/attachments`)
      .field("kind", "OTHER")
      .field("visibility", "INTERNAL")
      .attach("file", Buffer.from("%PDF-1.4 test"), { filename: "note.pdf", contentType: "application/pdf" });
    expect(internalFile.status).toBe(201);

    // ถอนคำขอ → กลับเป็นร่าง และชี้ไปเวอร์ชันล่าสุดที่มีบรรทัดใหม่แล้ว
    expect((await act(admin, projectId, quoteId, "withdraw")).status).toBe(204);
    const released = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    const latest = await prisma.projectVersion.findFirstOrThrow({ where: { projectId }, orderBy: { versionNo: "desc" } });
    expect(released.projectVersionId).toBe(latest.id);
    expect(await prisma.quoteSigner.count({ where: { quoteId } })).toBe(0);
    await prisma.quoteAttachment.deleteMany({ where: { quoteId } });
  });

  it("owner can send a quote back with a reason; the reason is required", async () => {
    const { projectId, quoteId } = await draftQuote("อนุมัติ-ส่งกลับ");
    await act(admin, projectId, quoteId, "submit");

    expect((await act(owner, projectId, quoteId, "return", { note: "  " })).status).toBe(400);
    expect((await act(admin, projectId, quoteId, "return", { note: "x" })).status).toBe(403);
    expect((await act(owner, projectId, quoteId, "return", { note: "ค่าแรงหมวดหลังคาต่ำไป" })).status).toBe(204);

    const q = await approvalOf(projectId, quoteId);
    expect(q.approval.state).toBe("NONE");
    expect(q.approvalReturnNote).toBe("ค่าแรงหมวดหลังคาต่ำไป");
    expect(
      await prisma.notification.count({ where: { userId: admin.userId, message: { contains: "ค่าแรงหมวดหลังคาต่ำไป" } } }),
    ).toBe(1);

    // ขอใหม่แล้วเหตุผลเก่าหายไป
    await act(admin, projectId, quoteId, "submit");
    expect((await approvalOf(projectId, quoteId)).approvalReturnNote).toBeNull();
  });

  it("only the requester (or an owner) can withdraw", async () => {
    const { projectId, quoteId } = await draftQuote("อนุมัติ-ถอน");
    await act(admin, projectId, quoteId, "submit");
    expect((await act(otherAdmin, projectId, quoteId, "withdraw")).status).toBe(403);
    expect((await act(owner, projectId, quoteId, "withdraw")).status).toBe(204);
  });

  it("an owner's own quote: one click approves it and signs both slots", async () => {
    const res = await owner.agent.post("/api/projects").send({ name: "อนุมัติ-เจ้าของทำเอง" });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);
    await addLine(projectId, 50_000);
    const quoteId = (await owner.agent.post(`/api/projects/${projectId}/quotes`)).body.quote.id as string;

    expect((await act(owner, projectId, quoteId, "approve")).status).toBe(204);
    const q = await approvalOf(projectId, quoteId);
    expect(q.approval.state).toBe("APPROVED");
    expect(q.approval.proposer.userId).toBe(owner.userId);
    expect(q.approval.approver.userId).toBe(owner.userId);
  });

  it("dashboard lists quotes waiting for approval", async () => {
    const { projectId, quoteId } = await draftQuote("อนุมัติ-แดชบอร์ด");
    await act(admin, projectId, quoteId, "submit");
    const res = await owner.agent.get("/api/dashboard/pending-work");
    expect(res.status).toBe(200);
    const row = res.body.pendingWork.pendingApprovals.find((r: { quote: { id: string } }) => r.quote.id === quoteId);
    expect(row).toMatchObject({ proposerName: "สมหญิง ผู้เสนอ", project: { id: projectId } });
  });
});

describe("my signature + my devices", () => {
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;

  beforeAll(async () => {
    admin = await createAndLoginAdmin("test-devices-admin");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: admin.userId } });
    await prisma.$disconnect();
  });

  it("signature: upload, read back as my own data URL, reject blank, remove", async () => {
    expect((await admin.agent.get("/api/account/signature")).body.signature.dataUrl).toBeNull();

    const blank = await sharp({ create: { width: 400, height: 150, channels: 3, background: "#ffffff" } }).png().toBuffer();
    const bad = await admin.agent.post("/api/account/signature").attach("file", blank, "blank.png");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain("ไม่พบลายเซ็น");

    const ink = await sharp({ create: { width: 400, height: 150, channels: 3, background: "#ffffff" } })
      .composite([{ input: { create: { width: 300, height: 20, channels: 3, background: "#000000" } }, top: 60, left: 50 }])
      .png()
      .toBuffer();
    const ok = await admin.agent.post("/api/account/signature").attach("file", ink, "sig.png");
    expect(ok.status).toBe(200);
    expect(ok.body.signature.dataUrl).toMatch(/^data:image\/png;base64,/);

    expect((await admin.agent.delete("/api/account/signature")).status).toBe(204);
    expect((await admin.agent.get("/api/account/signature")).body.signature.dataUrl).toBeNull();
  });

  it("devices: lists sessions without exposing tokens, signs out one or all others, never itself", async () => {
    // เข้าสู่ระบบอีกเครื่อง (agent ใหม่ = คุกกี้ใหม่)
    const phone = request.agent(app);
    const login = await phone
      .post("/api/auth/staff/login")
      .set("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")
      .send({ username: admin.username, password: admin.password });
    expect(login.status).toBe(200);

    const list = await admin.agent.get("/api/account/sessions");
    expect(list.status).toBe(200);
    const sessions = list.body.sessions as { handle: string; current: boolean; os: string }[];
    expect(sessions[0].current).toBe(true);
    const iphone = sessions.find((s) => s.os === "iPhone");
    expect(iphone).toBeDefined();

    const tokens = (await prisma.session.findMany({ where: { userId: admin.userId } })).map((s) => s.id);
    expect(JSON.stringify(list.body)).not.toMatch(new RegExp(tokens.join("|")));

    const current = sessions.find((s) => s.current)!;
    expect((await admin.agent.delete(`/api/account/sessions/${current.handle}`)).status).toBe(400);

    expect((await admin.agent.delete(`/api/account/sessions/${iphone!.handle}`)).status).toBe(204);
    expect((await phone.get("/api/auth/me")).status).toBe(401);
    expect((await admin.agent.get("/api/auth/me")).status).toBe(200);

    // อีกสองเครื่อง แล้วสั่งออกทั้งหมด
    const a = request.agent(app);
    const b = request.agent(app);
    await a.post("/api/auth/staff/login").send({ username: admin.username, password: admin.password });
    await b.post("/api/auth/staff/login").send({ username: admin.username, password: admin.password });
    const out = await admin.agent.post("/api/account/sessions/revoke-others");
    expect(out.body.count).toBe(2);
    expect((await a.get("/api/auth/me")).status).toBe(401);
    expect((await b.get("/api/auth/me")).status).toBe(401);
    expect((await admin.agent.get("/api/auth/me")).status).toBe(200);
  });
});
