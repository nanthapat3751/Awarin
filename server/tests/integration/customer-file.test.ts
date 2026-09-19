import request from "supertest";

import { app } from "../../src/app";
import { hashPassword } from "../../src/lib/password";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner, createCustomerDirect } from "../helpers/test-auth";

// mock ด้วยเหตุผลเดียวกับไฟล์เทสต์อื่น: entry แบบ ESM ของ Puppeteer โหลดใต้ runtime CJS ของ
// ts-jest ไม่ได้ และเทสต์ชุดนี้ก็ไม่ได้ใช้มันอยู่แล้ว
jest.mock("../../src/lib/pdf/quote-pdf", () => ({
  renderQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));
jest.mock("../../src/lib/pdf/customer-quote-pdf", () => ({
  renderCustomerQuotePdf: jest.fn(async () => Buffer.from("%PDF-1.7 mock")),
}));

/**
 * ลูกค้าที่ "ไม่ล็อกอิน" — ใช้เมื่อเทสต์ทำงานผ่าน agent ของ owner/admin อย่างเดียว
 *
 * `createCustomerDirect` ล็อกอินให้เสมอ ซึ่งกิน `loginLimiter` (20 ครั้ง/15 นาที) ไฟล์นี้สร้าง
 * ลูกค้าใหม่เกือบ 20 คน พอรวมกับเทสต์อื่นก็ชน 429 ทั้งชุด — ให้ล็อกอินเฉพาะเทสต์ที่ต้องใช้จริง
 */
async function createCustomerNoLogin(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const passwordHash = await hashPassword("test-customer-battery-staple");
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: "Test Customer",
      role: "CUSTOMER",
      customerProfile: { create: { phone: "0812345678" } },
    },
  });
  return { userId: user.id, email };
}

/** ผู้ใช้ ADMIN + ล็อกอิน (helper กลางมีแค่ owner/customer) — ใช้ทดสอบว่า ADMIN ไม่เห็นไอพี */
async function createAndLoginAdmin(prefix: string) {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = "test-admin-battery-staple";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName: "Test Admin", role: "ADMIN" },
  });
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/staff/login").send({ email, password });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
  return { agent, userId: user.id };
}

describe("แฟ้มลูกค้า (customer file)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let customer: Awaited<ReturnType<typeof createCustomerDirect>>;
  let itemCategoryId: string;
  let materialId: string;
  const createdUserIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdMaterialIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdContractIds: string[] = [];
  const createdLeadIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-custfile-owner");
    admin = await createAndLoginAdmin("test-custfile-admin");
    customer = await createCustomerDirect("test-custfile-customer");
    createdUserIds.push(owner.userId, admin.userId, customer.userId);

    const category = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบแฟ้มลูกค้า" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent.post("/api/categories").send({
      level: "SUBGROUP",
      parentId: category.body.category.id,
      name: "กลุ่มงานย่อยทดสอบแฟ้มลูกค้า",
    });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent.post("/api/categories").send({
      level: "ITEM",
      parentId: subgroup.body.category.id,
      name: "รายการทดสอบแฟ้มลูกค้า",
    });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);

    const material = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name: "วัสดุทดสอบแฟ้มลูกค้า",
      unit: "หน่วย",
      materialUnitPrice: 500,
      laborUnitPrice: 100,
    });
    materialId = material.body.material.id;
    createdMaterialIds.push(materialId);
  });

  afterAll(async () => {
    await prisma.contractInstallment.deleteMany({
      where: { contractId: { in: createdContractIds } },
    });
    await prisma.contract.deleteMany({ where: { id: { in: createdContractIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
    await prisma.customerNote.deleteMany({ where: { customerId: { in: createdUserIds } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.material.deleteMany({ where: { id: { in: createdMaterialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    // ลิงก์เข้าใช้ที่เทสต์ออกไว้ต้องลบก่อนลบผู้ใช้ — AccountAccessToken.createdById เป็น RESTRICT
    // (ทั้ง userId ของลูกค้าและ createdById ของพนักงานที่กดออกลิงก์ ชี้มาที่ผู้ใช้ชุดนี้ทั้งคู่)
    await prisma.accountAccessToken.deleteMany({
      where: {
        OR: [{ userId: { in: createdUserIds } }, { createdById: { in: createdUserIds } }],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  /** โครงการ + BOQ + ใบเสนอราคาที่ส่งแล้ว ของลูกค้ารายนี้ */
  async function createSentQuote(name: string) {
    const projectRes = await owner.agent
      .post("/api/projects")
      .send({ name, customerId: customer.userId });
    const projectId = projectRes.body.project.id as string;
    createdProjectIds.push(projectId);

    await owner.agent
      .post(`/api/projects/${projectId}/boq/items`)
      .send({ categoryId: itemCategoryId, materialId, quantity: 2 });

    const quoteRes = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    const quoteId = quoteRes.body.quote.id as string;
    await owner.agent
      .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
      .send({ toStatus: "SENT" });

    return { projectId, quoteId, quoteNo: quoteRes.body.quote.quoteNo as string };
  }

  it("รวมข้อมูลติดต่อ โครงการ และใบเสนอราคาพร้อมสถานะการเปิดดู ไว้ในที่เดียว", async () => {
    const { projectId, quoteId } = await createSentQuote("โครงการในแฟ้มลูกค้า");

    const res = await owner.agent.get(`/api/customers/${customer.userId}`).expect(200);
    const file = res.body.customer;

    expect(file.id).toBe(customer.userId);
    expect(file.email).toBe(customer.email);
    expect(file.phone).toBe("0812345678");
    expect(file.projects.map((p: { id: string }) => p.id)).toContain(projectId);

    const project = file.projects.find((p: { id: string }) => p.id === projectId);
    // ราคาสุทธิมาจากเวอร์ชันล่าสุด ไม่ใช่ null — 2 หน่วย × (500+100) บวกกำไรและ VAT
    expect(Number(project.netPrice)).toBeGreaterThan(1200);

    const quote = file.quotes.find((q: { id: string }) => q.id === quoteId);
    expect(quote.projectName).toBe("โครงการในแฟ้มลูกค้า");
    expect(quote.status).toBe("SENT");
    // ฟิลด์ชุดเดียวกับตารางใบเสนอราคา — ยังไม่มีใครเปิดจึงเป็น null/0
    expect(quote.firstViewedAt).toBeNull();
    expect(quote.viewCount).toBe(0);

    // ลูกค้าเปิดดูจริง แล้วแฟ้มต้องเปลี่ยนตาม
    await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
    const after = await owner.agent.get(`/api/customers/${customer.userId}`).expect(200);
    const openedQuote = after.body.customer.quotes.find((q: { id: string }) => q.id === quoteId);
    expect(openedQuote.firstViewedAt).toEqual(expect.any(String));
    expect(openedQuote.viewCount).toBe(1);
    expect(after.body.customer.lastLoginAt).toEqual(expect.any(String));
  });

  it("แปลบันทึกเป็นภาษาคน และผูกเหตุการณ์ของใบเสนอราคาเข้ากับโครงการ", async () => {
    const { projectId, quoteId } = await createSentQuote("โครงการไทม์ไลน์ลูกค้า");
    await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
    await customer.agent
      .post(`/api/my/quotes/${quoteId}/respond`)
      .send({ action: "ACCEPT" })
      .expect(200);

    const res = await owner.agent.get(`/api/customers/${customer.userId}/activity`).expect(200);
    const activity = res.body.activity as {
      kind: string;
      title: string;
      detail: string | null;
      projectId: string | null;
      projectName: string | null;
    }[];

    // เรียงใหม่สุดก่อน
    const times = (res.body.activity as { at: string }[]).map((a) => new Date(a.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    const accepted = activity.find((a) => a.kind === "accepted");
    expect(accepted?.title).toMatch(/^ยอมรับใบเสนอราคา /);
    expect(accepted?.projectId).toBe(projectId);
    expect(accepted?.projectName).toBe("โครงการไทม์ไลน์ลูกค้า");

    // "ครั้งแรก" ย้ายไปอยู่บรรทัดรอง เพราะหัวข้อต้องบอกชนิดการกระทำ (เปิดหน้า/เปิด PDF/โหลดไฟล์)
    const viewed = activity.find((a) => a.kind === "view") as
      | { title: string; detail: string | null; projectId: string | null }
      | undefined;
    expect(viewed?.title).toMatch(/^เปิดดูใบเสนอราคา /);
    expect(viewed?.detail).toBe("ครั้งแรก");
    expect(viewed?.projectId).toBe(projectId);

    // การเข้าสู่ระบบต้องอยู่ในแฟ้มด้วย และต้องอ่านรู้เรื่อง ไม่ใช่ชื่อ action ดิบ
    const login = activity.find((a) => a.kind === "login");
    expect(login?.title).toBe("เข้าสู่ระบบ");
    expect(activity.every((a) => a.kind !== "other")).toBe(true);
  });

  it("หมายเลขไอพีให้เฉพาะ OWNER — ADMIN ต้องได้ null เสมอ", async () => {
    const ownerRes = await owner.agent
      .get(`/api/customers/${customer.userId}/activity`)
      .expect(200);
    const ownerLogin = (ownerRes.body.activity as { kind: string; ip: string | null }[]).find(
      (a) => a.kind === "login",
    );
    expect(ownerLogin?.ip).toEqual(expect.any(String));

    const adminRes = await admin.agent
      .get(`/api/customers/${customer.userId}/activity`)
      .expect(200);
    const adminActivity = adminRes.body.activity as { ip: string | null }[];
    expect(adminActivity.length).toBeGreaterThan(0);
    expect(adminActivity.every((a) => a.ip === null)).toBe(true);
  });

  it("ไม่เปิดแฟ้มของพนักงาน และไม่บอกด้วยว่าบัญชีนั้นมีอยู่ (404 ไม่ใช่ 403)", async () => {
    await owner.agent.get(`/api/customers/${admin.userId}`).expect(404);
    await owner.agent.get(`/api/customers/${admin.userId}/activity`).expect(404);
    await owner.agent.get("/api/customers/ไม่มีบัญชีนี้").expect(404);
  });

  it("โครงการที่อยู่ในถังขยะไม่โผล่ในแฟ้ม", async () => {
    const { projectId } = await createSentQuote("โครงการที่จะถูกลบ");

    const before = await owner.agent.get(`/api/customers/${customer.userId}`).expect(200);
    expect(before.body.customer.projects.map((p: { id: string }) => p.id)).toContain(projectId);

    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date(), deletedById: owner.userId },
    });

    const after = await owner.agent.get(`/api/customers/${customer.userId}`).expect(200);
    expect(after.body.customer.projects.map((p: { id: string }) => p.id)).not.toContain(projectId);
    // ใบเสนอราคาของโครงการที่ถูกลบก็ต้องหายไปด้วย ไม่ใช่ค้างอยู่โดยไม่มีโครงการให้กดเข้าไป
    expect(
      after.body.customer.quotes.some((q: { projectId: string }) => q.projectId === projectId),
    ).toBe(false);

    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: null, deletedById: null },
    });
  });

  it("รายชื่อลูกค้ารวมคนที่ยังไม่มีโครงการด้วย — ไม่งั้นจะเปิดแฟ้มของเขาไม่ได้เลย", async () => {
    const lonely = await createCustomerDirect("test-custfile-noproject");
    createdUserIds.push(lonely.userId);

    const res = await owner.agent.get("/api/customers/directory").expect(200);
    const rows = res.body.customers as {
      id: string;
      projectCount: number;
      quoteCount: number;
      lastLoginAt: string | null;
    }[];

    const lonelyRow = rows.find((c) => c.id === lonely.userId);
    expect(lonelyRow).toBeDefined();
    expect(lonelyRow!.projectCount).toBe(0);
    expect(lonelyRow!.quoteCount).toBe(0);
    expect(lonelyRow!.lastLoginAt).toEqual(expect.any(String));

    const activeRow = rows.find((c) => c.id === customer.userId);
    expect(activeRow!.projectCount).toBeGreaterThan(0);
    expect(activeRow!.quoteCount).toBeGreaterThan(0);

    // พนักงานต้องไม่หลุดเข้ามาในรายชื่อลูกค้า
    expect(rows.some((c) => c.id === owner.userId || c.id === admin.userId)).toBe(false);
  });

  it("กรองไทม์ไลน์ตามชนิด ช่วงวันที่ และคำค้นได้", async () => {
    const { quoteId, quoteNo } = await createSentQuote("โครงการทดสอบตัวกรอง");
    await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
    await customer.agent.get(`/api/my/quotes/${quoteId}/pdf`).expect(200);

    const base = `/api/customers/${customer.userId}/activity`;
    const kindsOf = async (query: string) => {
      const res = await owner.agent.get(`${base}${query}`).expect(200);
      return (res.body.activity as { kind: string }[]).map((a) => a.kind);
    };

    const all = await kindsOf("");
    expect(all).toContain("view");
    expect(all).toContain("login");

    // กรองชนิด — ต้องเหลือเฉพาะที่เลือก
    const onlyView = await kindsOf("?kinds=view");
    expect(onlyView.length).toBeGreaterThan(0);
    expect(onlyView.every((k) => k === "view")).toBe(true);

    // เลือกหลายชนิดพร้อมกัน
    const viewAndLogin = await kindsOf("?kinds=view,login");
    expect(viewAndLogin.every((k) => k === "view" || k === "login")).toBe(true);
    expect(viewAndLogin.length).toBeGreaterThan(onlyView.length);

    // ช่วงวันที่ — "วันนี้ถึงวันนี้" ต้องได้ของวันนี้ครบ ไม่ใช่ศูนย์
    const today = new Date().toISOString().slice(0, 10);
    const todayRows = await kindsOf(`?from=${today}&to=${today}`);
    expect(todayRows.length).toBeGreaterThan(0);

    // ช่วงวันที่ในอดีตที่ไม่มีอะไรเลย
    const past = await kindsOf("?from=2020-01-01&to=2020-01-02");
    expect(past).toHaveLength(0);

    // ค้นหาด้วยเลขที่ใบเสนอราคา
    const found = await owner.agent.get(`${base}?q=${encodeURIComponent(quoteNo)}`).expect(200);
    const titles = (found.body.activity as { title: string }[]).map((a) => a.title);
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.every((t) => t.includes(quoteNo))).toBe(true);
  });

  it("ฟีดรวมทั้งบริษัทบอกด้วยว่าใครทำ และกรองรายลูกค้าได้", async () => {
    const other = await createCustomerDirect("test-custfile-feed-other");
    createdUserIds.push(other.userId);

    const { quoteId } = await createSentQuote("โครงการฟีดรวม");
    await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);

    const res = await owner.agent.get("/api/customers/activity").expect(200);
    const feed = res.body.activity as {
      customerId: string | null;
      customerName: string | null;
      kind: string;
      at: string;
    }[];

    expect(feed.length).toBeGreaterThan(0);
    // ทุกแถวต้องบอกว่าใครทำ ไม่งั้นฟีดรวมอ่านไม่รู้เรื่อง
    expect(feed.every((f) => f.customerId !== null && f.customerName !== null)).toBe(true);
    // เรียงใหม่สุดก่อน
    const times = feed.map((f) => new Date(f.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // มีทั้งสองคนอยู่ในฟีด (คนที่สองมีแถวล็อกอิน)
    expect(feed.some((f) => f.customerId === customer.userId)).toBe(true);
    expect(feed.some((f) => f.customerId === other.userId)).toBe(true);

    const mine = await owner.agent
      .get(`/api/customers/activity?customerId=${customer.userId}`)
      .expect(200);
    const mineRows = mine.body.activity as { customerId: string }[];
    expect(mineRows.length).toBeGreaterThan(0);
    expect(mineRows.every((f) => f.customerId === customer.userId)).toBe(true);

    // พนักงานต้องไม่หลุดเข้ามาในฟีดของลูกค้า
    expect(feed.some((f) => f.customerId === owner.userId || f.customerId === admin.userId)).toBe(
      false,
    );
  });

  it("แถบบนหน้าโครงการเห็นเฉพาะสิ่งที่ลูกค้าทำ ไม่ปนงานของพนักงาน", async () => {
    const { projectId, quoteId } = await createSentQuote("โครงการมุมมองลูกค้า");
    await customer.agent.get(`/api/my/quotes/${quoteId}`).expect(200);
    await customer.agent.get(`/api/my/quotes/${quoteId}/pdf`).expect(200);

    const res = await owner.agent.get(`/api/projects/${projectId}/customer-activity`).expect(200);
    expect(res.body.customerId).toBe(customer.userId);
    const activity = res.body.activity as { kind: string; title: string; projectId: string }[];

    expect(activity.length).toBeGreaterThan(0);
    expect(activity.every((a) => a.projectId === projectId)).toBe(true);
    // เห็นทั้งเปิดหน้าและเปิด PDF (ละเอียดกว่าไทม์ไลน์รวมที่เหลือแค่ครั้งแรก)
    expect(activity.filter((a) => a.kind === "view")).toHaveLength(2);

    // ไทม์ไลน์รวมของโครงการเดียวกันต้องยังเหลือ "เปิดดูครั้งแรก" บรรทัดเดียว
    const timeline = await owner.agent.get(`/api/projects/${projectId}/activity`).expect(200);
    const firstViewLines = (timeline.body.activity as { title: string }[]).filter((a) =>
      a.title.includes("เปิดดูใบเสนอราคา"),
    );
    expect(firstViewLines).toHaveLength(1);
    // และต้องมีงานของพนักงานปนอยู่ด้วย (ซึ่งเป็นเหตุผลที่ต้องมีมุมมองแยก)
    expect(
      (timeline.body.activity as { title: string }[]).some((a) => a.title.includes("ส่ง")),
    ).toBe(true);
  });

  it("โครงการที่ยังไม่ได้ระบุลูกค้า คืนรายการว่าง ไม่ใช่พัง", async () => {
    const res = await owner.agent.post("/api/projects").send({ name: "โครงการไม่มีลูกค้า" });
    const projectId = res.body.project.id as string;
    createdProjectIds.push(projectId);

    const activity = await owner.agent
      .get(`/api/projects/${projectId}/customer-activity`)
      .expect(200);
    expect(activity.body.customerId).toBeNull();
    expect(activity.body.activity).toEqual([]);

    await owner.agent.get("/api/projects/ไม่มีโครงการนี้/customer-activity").expect(404);
  });

  it("ลูกค้าเปิดแฟ้มของคนอื่น (หรือของตัวเอง) ไม่ได้", async () => {
    await customer.agent.get(`/api/customers/${customer.userId}`).expect(403);
    await customer.agent.get("/api/customers/directory").expect(403);
  });

  // ---------- งานที่พนักงานทำกับบัญชีลูกค้า ----------
  //
  // โมดูลนี้เคยเป็น GET ล้วน แฟ้มลูกค้าจึงดูได้อย่างเดียว ทำอะไรกับลูกค้าไม่ได้เลย

  describe("แก้ข้อมูลติดต่อ / ออกลิงก์ / ระงับบัญชี", () => {
    /** ลูกค้าคนใหม่ต่อหนึ่งเทสต์ เพื่อไม่ให้การแก้ข้อมูลของเทสต์หนึ่งไปกระทบเทสต์อื่น */
    async function freshCustomer(prefix: string) {
      const c = await createCustomerNoLogin(prefix);
      createdUserIds.push(c.userId);
      return c;
    }

    /** เฉพาะเทสต์ที่ต้องใช้ session ของลูกค้าเอง — กิน loginLimiter จึงเรียกเท่าที่จำเป็น */
    async function freshCustomerLoggedIn(prefix: string) {
      const c = await createCustomerDirect(prefix);
      createdUserIds.push(c.userId);
      return c;
    }

    it("แก้ชื่อ เบอร์โทร และที่อยู่ได้ และที่อยู่ลงไปถึง CustomerProfile จริง", async () => {
      const c = await freshCustomer("test-custfile-edit");

      const res = await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ fullName: "ชื่อใหม่ หลังแก้", phone: "0899999999", address: "99/9 ถนนทดสอบ" })
        .expect(200);

      expect(res.body.customer.fullName).toBe("ชื่อใหม่ หลังแก้");
      expect(res.body.customer.phone).toBe("0899999999");
      expect(res.body.customer.address).toBe("99/9 ถนนทดสอบ");

      // ที่อยู่นี้คือ "ที่อยู่ผู้ว่าจ้าง" ที่พิมพ์ลงใบเสนอราคา/สัญญา ต้องลงจริงไม่ใช่แค่ค่าที่ตอบกลับ
      const profile = await prisma.customerProfile.findUnique({ where: { userId: c.userId } });
      expect(profile?.address).toBe("99/9 ถนนทดสอบ");
    });

    it("ส่งค่าว่างมา = ล้างค่า แต่ช่องที่ไม่ได้ส่งมาต้องไม่ถูกแตะ", async () => {
      const c = await freshCustomer("test-custfile-clear");
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ phone: "0811111111", address: "ที่อยู่เดิม" })
        .expect(200);

      const res = await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ phone: "" })
        .expect(200);

      expect(res.body.customer.phone).toBeNull();
      expect(res.body.customer.address).toBe("ที่อยู่เดิม");
    });

    it("แก้อีเมลไม่ได้ — เป็นชื่อผู้ใช้ที่ลูกค้าใช้ล็อกอิน", async () => {
      const c = await freshCustomer("test-custfile-email");
      const before = await prisma.user.findUniqueOrThrow({ where: { id: c.userId } });

      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ email: "hijack@example.com", phone: "0822222222" })
        .expect(200);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: c.userId } });
      expect(after.email).toBe(before.email);
    });

    it("บันทึกลง AuditLog ว่าช่องไหนถูกแก้ ไม่ใช่ค่าเก่า/ค่าใหม่", async () => {
      const c = await freshCustomer("test-custfile-audit");
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ phone: "0833333333" })
        .expect(200);

      const row = await prisma.auditLog.findFirst({
        where: { action: "UPDATE_CUSTOMER", entityType: "User", entityId: c.userId },
        orderBy: { createdAt: "desc" },
      });
      expect(row?.userId).toBe(owner.userId);
      expect(row?.details).toEqual({ fields: ["phone"] });
      // เบอร์โทรต้องไม่ถูกคัดลอกลง AuditLog ซึ่งอ่านได้กว้างกว่าและเก็บไว้ 1 ปี
      expect(JSON.stringify(row?.details)).not.toContain("0833333333");
    });

    it("ออกลิงก์เข้าใช้งานได้โดยไม่ต้องมีโครงการ และเหลือลิงก์ที่ใช้ได้ทีละหนึ่ง", async () => {
      const c = await freshCustomer("test-custfile-link");

      const first = await owner.agent.post(`/api/customers/${c.userId}/access-link`).expect(201);
      expect(first.body.url).toContain("/activate/");

      const second = await owner.agent.post(`/api/customers/${c.userId}/access-link`).expect(201);
      expect(second.body.url).not.toBe(first.body.url);

      const live = await prisma.accountAccessToken.count({
        where: { userId: c.userId, usedAt: null },
      });
      expect(live).toBe(1);
    });

    it("ระงับบัญชีแล้วลูกค้าถูกเตะออกจากระบบทันที และเปิดคืนได้", async () => {
      const c = await freshCustomerLoggedIn("test-custfile-suspend");
      await c.agent.get("/api/auth/me").expect(200);

      const suspended = await owner.agent
        .post(`/api/customers/${c.userId}/active`)
        .send({ active: false, reason: "ทดสอบการระงับ" })
        .expect(200);
      expect(suspended.body.customer.active).toBe(false);

      // คุกกี้เดิมต้องใช้ไม่ได้ทันที (sessionVersion ถูกเลื่อน) ไม่ใช่รอ session หมดอายุเอง
      await c.agent.get("/api/auth/me").expect(401);

      const restored = await owner.agent
        .post(`/api/customers/${c.userId}/active`)
        .send({ active: true })
        .expect(200);
      expect(restored.body.customer.active).toBe(true);
    });

    it("บัญชีที่ถูกระงับต้องไม่โผล่ในช่องเลือกลูกค้าตอนผูกโครงการ", async () => {
      const c = await freshCustomer("test-custfile-picker");

      // ค้นด้วยอีเมล เพราะ searchCustomers จำกัด 20 แถว และฐานข้อมูลเทสต์มีลูกค้าสะสมเกินนั้นแล้ว
      const q = `?q=${encodeURIComponent(c.email)}`;
      const before = await owner.agent.get(`/api/customers${q}`).expect(200);
      expect(before.body.customers.map((x: { id: string }) => x.id)).toContain(c.userId);

      await owner.agent
        .post(`/api/customers/${c.userId}/active`)
        .send({ active: false })
        .expect(200);

      const after = await owner.agent.get(`/api/customers${q}`).expect(200);
      expect(after.body.customers.map((x: { id: string }) => x.id)).not.toContain(c.userId);

      // แต่ยังต้องอยู่ในสารบัญแฟ้มลูกค้า ไม่งั้นจะเปิดเข้าไปกดเปิดใช้งานคืนไม่ได้เลย
      //
      // ค้นด้วยอีเมล เพราะสารบัญแบ่งหน้าที่เซิร์ฟเวอร์แล้ว และการเรียงเริ่มต้นดันบัญชีที่ถูกระงับ
      // ไปท้ายสุด — บัญชีที่เพิ่งระงับจึงไม่ได้อยู่หน้าแรกอีกต่อไป
      const dir = await owner.agent
        .get(`/api/customers/directory?q=${encodeURIComponent(c.email)}`)
        .expect(200);
      expect(dir.body.customers.map((x: { id: string }) => x.id)).toContain(c.userId);
    });

    it("ออกลิงก์ให้บัญชีที่ถูกระงับไม่ได้", async () => {
      const c = await freshCustomer("test-custfile-link-suspended");
      await owner.agent
        .post(`/api/customers/${c.userId}/active`)
        .send({ active: false })
        .expect(200);
      await owner.agent.post(`/api/customers/${c.userId}/access-link`).expect(400);
    });

    it("บัญชีที่ลูกค้าขอลบไปแล้ว แก้ไข/เปิดใช้งาน/ออกลิงก์ ไม่ได้ทุกทาง", async () => {
      const c = await freshCustomerLoggedIn("test-custfile-anon");
      await c.agent
        .post("/api/auth/delete-account")
        .send({ currentPassword: c.password })
        .expect(204);

      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ phone: "0844444444" })
        .expect(400);
      await owner.agent.post(`/api/customers/${c.userId}/active`).send({ active: true }).expect(400);
      await owner.agent.post(`/api/customers/${c.userId}/access-link`).expect(400);

      const detail = await owner.agent.get(`/api/customers/${c.userId}`).expect(200);
      expect(detail.body.customer.anonymized).toBe(true);
      expect(detail.body.customer.active).toBe(false);
    });

    it("ADMIN แก้ข้อมูลและออกลิงก์ได้ แต่ระงับบัญชีไม่ได้ (OWNER เท่านั้น)", async () => {
      const c = await freshCustomer("test-custfile-role");

      await admin.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ phone: "0855555555" })
        .expect(200);
      await admin.agent.post(`/api/customers/${c.userId}/access-link`).expect(201);
      await admin.agent
        .post(`/api/customers/${c.userId}/active`)
        .send({ active: false })
        .expect(403);
    });

    it("ลูกค้าเรียกเส้นทางเขียนข้อมูลเองไม่ได้", async () => {
      const c = await freshCustomerLoggedIn("test-custfile-selfwrite");
      await c.agent.patch(`/api/customers/${c.userId}`).send({ phone: "0866666666" }).expect(403);
      await c.agent.post(`/api/customers/${c.userId}/access-link`).expect(403);
      await c.agent.post(`/api/customers/${c.userId}/active`).send({ active: false }).expect(403);
    });

    it("งานที่พนักงานทำโผล่ในไทม์ไลน์ของลูกค้า พร้อมชื่อคนทำ แต่ไม่ปนเข้าฟีดรวม", async () => {
      const c = await freshCustomer("test-custfile-timeline");
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ phone: "0877777777" })
        .expect(200);

      const res = await owner.agent.get(`/api/customers/${c.userId}/activity`).expect(200);
      const staffRows = res.body.activity.filter((a: { kind: string }) => a.kind === "staff");
      expect(staffRows.length).toBeGreaterThan(0);
      expect(staffRows[0].title).toContain("แก้ไขข้อมูลติดต่อ");
      expect(staffRows[0].detail).toContain("โดย");

      // ฟีดรวมทั้งบริษัทตอบคำถาม "ลูกค้าทำอะไร" — งานของพนักงานต้องไม่ปนเข้าไป
      const feed = await owner.agent
        .get(`/api/customers/activity?customerId=${c.userId}`)
        .expect(200);
      expect(feed.body.activity.some((a: { kind: string }) => a.kind === "staff")).toBe(false);
    });
  });

  // ---------- สัญญา / คำขอ / บันทึกการติดต่อ ----------

  describe("สัญญา คำขอ และบันทึกการติดต่อในแฟ้ม", () => {
    async function freshCustomer(prefix: string) {
      const c = await createCustomerNoLogin(prefix);
      createdUserIds.push(c.userId);
      return c;
    }

    /** เฉพาะเทสต์ที่ต้องใช้ session ของลูกค้าเอง — กิน loginLimiter จึงเรียกเท่าที่จำเป็น */
    async function freshCustomerLoggedIn(prefix: string) {
      const c = await createCustomerDirect(prefix);
      createdUserIds.push(c.userId);
      return c;
    }

    it("สัญญาของโครงการลูกค้าโผล่ในแฟ้ม พร้อมมูลค่าที่ตรึงไว้และจำนวนงวด", async () => {
      const { projectId, quoteId } = await createSentQuote("โครงการมีสัญญาในแฟ้ม");
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
        .send({ toStatus: "ACCEPTED" });

      const res = await owner.agent.post(`/api/projects/${projectId}/contracts`).expect(201);
      const contractId = res.body.contract.id as string;
      createdContractIds.push(contractId);

      const detail = await owner.agent.get(`/api/customers/${customer.userId}`).expect(200);
      const row = detail.body.customer.contracts.find(
        (c: { id: string }) => c.id === contractId,
      );
      expect(row).toBeDefined();
      expect(row.projectId).toBe(projectId);
      expect(row.contractNo).toBe(res.body.contract.contractNo);
      // มูลค่าต้องเป็นค่าที่ตรึงไว้ตอนออกสัญญา ไม่ใช่ค่าที่อ่านสดจากโครงการ
      expect(row.amount).not.toBeNull();
      expect(typeof row.installmentCount).toBe("number");
    });

    it("สัญญาของโครงการที่อยู่ในถังขยะไม่โผล่ในแฟ้ม", async () => {
      const { projectId, quoteId } = await createSentQuote("โครงการสัญญาเข้าถังขยะ");
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
        .send({ toStatus: "ACCEPTED" });
      const res = await owner.agent.post(`/api/projects/${projectId}/contracts`).expect(201);
      createdContractIds.push(res.body.contract.id);

      // ลบผ่าน API ไม่ได้ เพราะ guard เดิมกันโครงการที่มีใบเสนอราคา/สัญญาไว้ (คืน 409 ซึ่งถูกแล้ว)
      // ที่เทสต์นี้ต้องพิสูจน์คือ "ตัวอ่านกรอง deletedAt ออกไหม" จึงย้ายเข้าถังขยะตรง ๆ
      await prisma.project.update({
        where: { id: projectId },
        data: { deletedAt: new Date() },
      });

      const detail = await owner.agent.get(`/api/customers/${customer.userId}`).expect(200);
      const ids = detail.body.customer.contracts.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(res.body.contract.id);
    });

    it("คำขอที่ผูกกับบัญชีโผล่ในแฟ้ม พร้อมเนื้อคำขอและโครงการที่เกิดจากคำขอนั้น", async () => {
      const c = await freshCustomer("test-custfile-lead");
      const lead = await prisma.lead.create({
        data: {
          customerId: c.userId,
          name: "ผู้ส่งคำขอทดสอบ",
          phone: "0812345678",
          serviceType: "งานก่อสร้าง",
          message: "อยากได้บ้านสองชั้น งบ 3 ล้าน",
        },
      });
      createdLeadIds.push(lead.id);

      const detail = await owner.agent.get(`/api/customers/${c.userId}`).expect(200);
      expect(detail.body.customer.leads).toHaveLength(1);
      expect(detail.body.customer.leads[0].serviceType).toBe("งานก่อสร้าง");
      expect(detail.body.customer.leads[0].message).toContain("บ้านสองชั้น");
      expect(detail.body.customer.leads[0].projectId).toBeNull();
    });

    it("คำขอที่อยู่ในถังขยะไม่โผล่ในแฟ้ม", async () => {
      const c = await freshCustomer("test-custfile-lead-trash");
      const lead = await prisma.lead.create({
        data: {
          customerId: c.userId,
          name: "คำขอที่ถูกลบ",
          phone: "0812345679",
          serviceType: "งานออกแบบ",
          deletedAt: new Date(),
        },
      });
      createdLeadIds.push(lead.id);

      const detail = await owner.agent.get(`/api/customers/${c.userId}`).expect(200);
      expect(detail.body.customer.leads).toHaveLength(0);
    });

    it("เพิ่ม แก้ไข และลบบันทึกการติดต่อได้", async () => {
      const c = await freshCustomer("test-custfile-note");

      const added = await owner.agent
        .post(`/api/customers/${c.userId}/notes`)
        .send({ body: "โทรคุยเรื่องงบ นัดดูแบบศุกร์นี้" })
        .expect(201);
      expect(added.body.customer.notes).toHaveLength(1);
      const noteId = added.body.customer.notes[0].id as string;
      expect(added.body.customer.notes[0].authorName).toBeTruthy();

      const edited = await owner.agent
        .patch(`/api/customers/${c.userId}/notes/${noteId}`)
        .send({ body: "โทรคุยเรื่องงบ นัดดูแบบเสาร์นี้" })
        .expect(200);
      expect(edited.body.customer.notes[0].body).toContain("เสาร์");

      const removed = await owner.agent
        .delete(`/api/customers/${c.userId}/notes/${noteId}`)
        .expect(200);
      expect(removed.body.customer.notes).toHaveLength(0);
    });

    it("เนื้อบันทึกต้องไม่ถูกคัดลอกลง AuditLog", async () => {
      const c = await freshCustomer("test-custfile-note-audit");
      const secret = "ลูกค้าบอกว่าเพื่อนบ้านทะเลาะกัน";
      const added = await owner.agent
        .post(`/api/customers/${c.userId}/notes`)
        .send({ body: secret })
        .expect(201);

      const row = await prisma.auditLog.findFirst({
        where: { action: "CREATE_CUSTOMER_NOTE", entityId: c.userId },
        orderBy: { createdAt: "desc" },
      });
      expect(row?.details).toEqual({ noteId: added.body.customer.notes[0].id });
      expect(JSON.stringify(row?.details)).not.toContain("เพื่อนบ้าน");
    });

    it("แก้/ลบบันทึกของคนอื่นไม่ได้ ยกเว้น OWNER", async () => {
      const c = await freshCustomer("test-custfile-note-perm");

      const mine = await admin.agent
        .post(`/api/customers/${c.userId}/notes`)
        .send({ body: "บันทึกของแอดมิน" })
        .expect(201);
      const adminNoteId = mine.body.customer.notes[0].id as string;

      const theirs = await owner.agent
        .post(`/api/customers/${c.userId}/notes`)
        .send({ body: "บันทึกของเจ้าของระบบ" })
        .expect(201);
      const ownerNoteId = theirs.body.customer.notes.find(
        (n: { id: string }) => n.id !== adminNoteId,
      ).id as string;

      // แอดมินแก้ของตัวเองได้
      await admin.agent
        .patch(`/api/customers/${c.userId}/notes/${adminNoteId}`)
        .send({ body: "แก้ของตัวเอง" })
        .expect(200);
      // แต่แตะของ OWNER ไม่ได้
      await admin.agent
        .patch(`/api/customers/${c.userId}/notes/${ownerNoteId}`)
        .send({ body: "พยายามแก้ของคนอื่น" })
        .expect(403);
      await admin.agent.delete(`/api/customers/${c.userId}/notes/${ownerNoteId}`).expect(403);
      // OWNER ลบของแอดมินได้
      await owner.agent.delete(`/api/customers/${c.userId}/notes/${adminNoteId}`).expect(200);
    });

    it("ยิง noteId ของลูกค้าคนอื่นมาที่ path ของเราไม่ได้", async () => {
      const a = await freshCustomer("test-custfile-note-a");
      const b = await freshCustomer("test-custfile-note-b");
      const added = await owner.agent
        .post(`/api/customers/${a.userId}/notes`)
        .send({ body: "บันทึกของลูกค้า A" })
        .expect(201);
      const noteId = added.body.customer.notes[0].id as string;

      await owner.agent
        .patch(`/api/customers/${b.userId}/notes/${noteId}`)
        .send({ body: "พยายามแก้ข้ามลูกค้า" })
        .expect(404);
    });

    it("ลูกค้าขอลบข้อมูล — บันทึกการติดต่อเกี่ยวกับเขาต้องถูกลบไปด้วย", async () => {
      const c = await freshCustomerLoggedIn("test-custfile-note-pdpa");
      await owner.agent
        .post(`/api/customers/${c.userId}/notes`)
        .send({ body: "ข้อมูลส่วนตัวที่ไม่ควรค้างอยู่หลังลูกค้าขอลบ" })
        .expect(201);
      expect(await prisma.customerNote.count({ where: { customerId: c.userId } })).toBe(1);

      await c.agent
        .post("/api/auth/delete-account")
        .send({ currentPassword: c.password })
        .expect(204);

      expect(await prisma.customerNote.count({ where: { customerId: c.userId } })).toBe(0);
    });

    it("ลูกค้าเพิ่มบันทึกในแฟ้มตัวเองไม่ได้", async () => {
      const c = await freshCustomerLoggedIn("test-custfile-note-self");
      await c.agent
        .post(`/api/customers/${c.userId}/notes`)
        .send({ body: "ลูกค้าพยายามเขียนเอง" })
        .expect(403);
    });
  });

  // ============================================================================
  // ลูกค้านิติบุคคล · แบ่งหน้าที่เซิร์ฟเวอร์ · ส่งออกไฟล์
  // ============================================================================

  describe("ลูกค้านิติบุคคล", () => {
    async function freshCustomer(prefix: string) {
      const c = await createCustomerNoLogin(prefix);
      createdUserIds.push(c.userId);
      return c;
    }

    it("ระบุชื่อนิติบุคคล เลขประจำตัวผู้เสียภาษี สาขา และผู้ประสานงานได้ และเอกสารจะออกในนามนั้น", async () => {
      const c = await freshCustomer("test-custfile-company");

      const res = await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({
          customerType: "COMPANY",
          companyName: "บริษัท ทดสอบนิติบุคคล จำกัด",
          taxId: "0105500000001",
          branch: "สำนักงานใหญ่",
          contactPerson: "คุณมานี ฝ่ายจัดซื้อ",
        })
        .expect(200);

      const file = res.body.customer;
      expect(file.customerType).toBe("COMPANY");
      expect(file.companyName).toBe("บริษัท ทดสอบนิติบุคคล จำกัด");
      expect(file.taxId).toBe("0105500000001");
      expect(file.branch).toBe("สำนักงานใหญ่");
      expect(file.contactPerson).toBe("คุณมานี ฝ่ายจัดซื้อ");
      // ชื่อบนเอกสารต้องเป็นชื่อบริษัท ไม่ใช่ชื่อคนที่สมัคร — หน้าจอเอาค่านี้ไปแสดงตรง ๆ
      expect(file.billingName).toBe("บริษัท ทดสอบนิติบุคคล จำกัด");

      const profile = await prisma.customerProfile.findUnique({ where: { userId: c.userId } });
      expect(profile?.taxId).toBe("0105500000001");
    });

    it("ติ๊กว่าเป็นนิติบุคคลโดยไม่มีชื่อนิติบุคคลไม่ได้ (ไม่งั้นเอกสารจะออกในนามชื่อคน)", async () => {
      const c = await freshCustomer("test-custfile-company-noname");
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ customerType: "COMPANY" })
        .expect(400);

      const profile = await prisma.customerProfile.findUnique({ where: { userId: c.userId } });
      expect(profile?.customerType).toBe("INDIVIDUAL");
    });

    it("เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก", async () => {
      const c = await freshCustomer("test-custfile-taxid");
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ customerType: "COMPANY", companyName: "บริษัท ก จำกัด", taxId: "123" })
        .expect(400);
    });

    it("กลับไปเป็นบุคคลธรรมดาแล้วข้อมูลบริษัทต้องถูกล้าง ไม่ใช่ซ่อนไว้", async () => {
      const c = await freshCustomer("test-custfile-company-back");
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ customerType: "COMPANY", companyName: "บริษัท ข จำกัด", taxId: "0105500000002" })
        .expect(200);

      const res = await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ customerType: "INDIVIDUAL", companyName: "", taxId: "", branch: "", contactPerson: "" })
        .expect(200);

      expect(res.body.customer.customerType).toBe("INDIVIDUAL");
      expect(res.body.customer.companyName).toBeNull();
      expect(res.body.customer.taxId).toBeNull();
      expect(res.body.customer.billingName).toBe("Test Customer");
    });

    it("บันทึกในไทม์ไลน์ว่าช่องไหนถูกแก้ แต่ต้องไม่เก็บชื่อบริษัทหรือเลขภาษีลง AuditLog", async () => {
      const c = await freshCustomer("test-custfile-company-audit");
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ customerType: "COMPANY", companyName: "บริษัท ลับ จำกัด", taxId: "0105500000003" })
        .expect(200);

      const row = await prisma.auditLog.findFirst({
        where: { action: "UPDATE_CUSTOMER", entityId: c.userId },
        orderBy: { createdAt: "desc" },
      });
      const details = JSON.stringify(row?.details ?? {});
      expect(details).toContain("companyName");
      expect(details).not.toContain("บริษัท ลับ จำกัด");
      expect(details).not.toContain("0105500000003");

      const activity = await owner.agent
        .get(`/api/customers/${c.userId}/activity`)
        .expect(200);
      const staffRow = activity.body.activity.find((a: { kind: string }) => a.kind === "staff");
      expect(staffRow.title).toContain("ชื่อนิติบุคคล");
      expect(staffRow.title).toContain("เลขประจำตัวผู้เสียภาษี");
    });

    it("ลูกค้าตั้งค่านิติบุคคลของตัวเองได้จากหน้าบัญชี", async () => {
      const c = await createCustomerDirect("test-custfile-company-self");
      createdUserIds.push(c.userId);

      const res = await c.agent
        .patch("/api/auth/me/profile")
        .send({ customerType: "COMPANY", companyName: "บริษัท ลูกค้ากรอกเอง จำกัด" })
        .expect(200);
      expect(res.body.profile.customerType).toBe("COMPANY");
      expect(res.body.profile.companyName).toBe("บริษัท ลูกค้ากรอกเอง จำกัด");

      // กฎเดียวกับฝั่งพนักงาน — ระบุว่าเป็นนิติบุคคลโดยไม่มีชื่อไม่ได้
      await c.agent
        .patch("/api/auth/me/profile")
        .send({ customerType: "COMPANY", companyName: null })
        .expect(400);
    });

    it("สัญญาที่ออกใหม่ต้องตรึงยอด VAT ไว้ เพื่อคำนวณฐานภาษีหัก ณ ที่จ่ายได้ภายหลัง", async () => {
      const { projectId, quoteId } = await createSentQuote("โครงการนิติบุคคล");
      // โครงการขยับเป็น APPROVED ตรง ๆ ไม่ได้ (409) — ต้องผ่านการยอมรับใบเสนอราคาก่อน
      await owner.agent
        .post(`/api/projects/${projectId}/quotes/${quoteId}/transition`)
        .send({ toStatus: "ACCEPTED" })
        .expect(200);
      await owner.agent
        .post(`/api/projects/${projectId}/transition`)
        .send({ toStatus: "APPROVED" });

      const res = await owner.agent.post(`/api/projects/${projectId}/contracts`).expect(201);
      const contractId = res.body.contract.id as string;
      createdContractIds.push(contractId);

      const contract = await prisma.contract.findUniqueOrThrow({ where: { id: contractId } });
      expect(contract.vatAmount).not.toBeNull();
      // ฐานภาษี = ยอดรวม − VAT ต้องมากกว่าศูนย์และน้อยกว่ายอดรวมเสมอ
      const amount = Number(contract.amount);
      const vat = Number(contract.vatAmount);
      expect(vat).toBeGreaterThan(0);
      expect(amount - vat).toBeGreaterThan(0);
    });
  });

  describe("แบ่งหน้าที่เซิร์ฟเวอร์", () => {
    async function freshCustomer(prefix: string) {
      const c = await createCustomerNoLogin(prefix);
      createdUserIds.push(c.userId);
      return c;
    }

    it("รายชื่อลูกค้าคืนยอดจริงมาด้วย และตัดตามขนาดหน้าที่ขอ", async () => {
      const res = await owner.agent.get("/api/customers/directory?pageSize=2").expect(200);
      expect(res.body.pageSize).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.customers.length).toBeLessThanOrEqual(2);
      // ยอดรวมคือของทั้งระบบ ไม่ใช่จำนวนแถวในหน้านี้ — ตัวเลขบนหน้าจออ่านจากช่องนี้
      expect(res.body.total).toBeGreaterThan(res.body.customers.length);

      const p2 = await owner.agent.get("/api/customers/directory?pageSize=2&page=2").expect(200);
      const ids1 = res.body.customers.map((c: { id: string }) => c.id);
      const ids2 = p2.body.customers.map((c: { id: string }) => c.id);
      expect(ids2.some((id: string) => ids1.includes(id))).toBe(false);
    });

    it("เรียงตามชื่อได้ทั้งขึ้นและลง", async () => {
      // สร้างชื่อของตัวเองแล้วกรองให้เหลือแค่สองแถว — ห้ามยืนยันลำดับของทั้งฐานข้อมูล เพราะ
      // ลำดับไทย/อังกฤษขึ้นกับ collation ของ PostgreSQL ซึ่งไม่ตรงกับ localeCompare ของ JS
      const tag = `zzsort${Date.now()}`;
      const first = await freshCustomer("test-custfile-sort-a");
      const second = await freshCustomer("test-custfile-sort-b");
      await owner.agent.patch(`/api/customers/${first.userId}`).send({ fullName: `A ${tag}` });
      await owner.agent.patch(`/api/customers/${second.userId}`).send({ fullName: `B ${tag}` });

      const asc = await owner.agent
        .get(`/api/customers/directory?q=${tag}&sort=name&dir=asc`)
        .expect(200);
      const desc = await owner.agent
        .get(`/api/customers/directory?q=${tag}&sort=name&dir=desc`)
        .expect(200);

      expect(asc.body.customers.map((c: { id: string }) => c.id)).toEqual([
        first.userId,
        second.userId,
      ]);
      expect(desc.body.customers.map((c: { id: string }) => c.id)).toEqual([
        second.userId,
        first.userId,
      ]);
    });

    it("ค้นหาที่เซิร์ฟเวอร์ — หาเจอด้วยชื่อบริษัท ไม่ใช่แค่ชื่อคน", async () => {
      const c = await freshCustomer("test-custfile-search-company");
      const unique = `บริษัท ค้นหา${Date.now()} จำกัด`;
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ customerType: "COMPANY", companyName: unique })
        .expect(200);

      const res = await owner.agent
        .get(`/api/customers/directory?q=${encodeURIComponent(unique)}`)
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.customers[0].id).toBe(c.userId);
      expect(res.body.customers[0].companyName).toBe(unique);
    });

    it("ค่าหน้าที่ผิดรูปแบบไม่ทำให้คำขอพัง แต่ตกกลับไปใช้ค่าเริ่มต้น", async () => {
      const res = await owner.agent.get("/api/customers/directory?page=abc&pageSize=-5").expect(200);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBeGreaterThan(0);
    });

    it("ไทม์ไลน์ลูกค้าแบ่งหน้า และยอดรวมเป็นของทั้งชุด ไม่ใช่ของหน้านี้", async () => {
      const res = await owner.agent
        .get(`/api/customers/${customer.userId}/activity?pageSize=1`)
        .expect(200);
      expect(res.body.activity).toHaveLength(1);
      expect(res.body.pageSize).toBe(1);
      expect(res.body.total).toBeGreaterThan(1);

      const p2 = await owner.agent
        .get(`/api/customers/${customer.userId}/activity?pageSize=1&page=2`)
        .expect(200);
      expect(p2.body.activity[0].id).not.toBe(res.body.activity[0].id);
      expect(p2.body.total).toBe(res.body.total);
    });

    it("ค้นหาในไทม์ไลน์ทำที่ฐานข้อมูล — คำค้นภาษาไทยต้องกรองได้จริงและยอดรวมต้องลดตาม", async () => {
      const all = await owner.agent
        .get(`/api/customers/${customer.userId}/activity`)
        .expect(200);
      const filtered = await owner.agent
        .get(`/api/customers/${customer.userId}/activity?q=${encodeURIComponent("เข้าสู่ระบบ")}`)
        .expect(200);

      expect(filtered.body.total).toBeGreaterThan(0);
      expect(filtered.body.total).toBeLessThan(all.body.total);
      for (const row of filtered.body.activity) {
        expect(row.title).toContain("เข้าสู่ระบบ");
      }
    });

    it("คำค้นต้องไม่ลากกิจกรรมของลูกค้าคนอื่นเข้ามาในแฟ้ม", async () => {
      const other = await freshCustomer("test-custfile-search-leak");
      const res = await owner.agent
        .get(`/api/customers/${other.userId}/activity?q=${encodeURIComponent("เข้าสู่ระบบ")}`)
        .expect(200);
      // บัญชีนี้ไม่เคยล็อกอินเลย ผลต้องว่าง ไม่ใช่ได้แถวของคนอื่นที่ข้อความตรงกัน
      expect(res.body.total).toBe(0);
      expect(res.body.activity).toEqual([]);
    });
  });

  describe("ส่งออกไฟล์", () => {
    async function freshCustomer(prefix: string) {
      const c = await createCustomerNoLogin(prefix);
      createdUserIds.push(c.userId);
      return c;
    }

    it("รายชื่อลูกค้าเป็น CSV ที่ Excel เปิดแล้วภาษาไทยไม่เพี้ยน", async () => {
      const c = await freshCustomer("test-custfile-csv");
      const res = await owner.agent
        .get(`/api/customers/directory.csv?q=${encodeURIComponent(c.email)}`)
        .expect(200);

      expect(res.headers["content-type"]).toContain("text/csv");
      expect(res.headers["content-disposition"]).toContain("filename*=UTF-8''");
      // BOM คือสิ่งเดียวที่ทำให้ Excel บน Windows อ่านไฟล์เป็น UTF-8
      expect(res.text.charCodeAt(0)).toBe(0xfeff);
      expect(res.text).toContain("ชื่อ-นามสกุล");
      expect(res.text).toContain(c.email);
    });

    it("ช่องที่ขึ้นต้นด้วยเครื่องหมายเท่ากับต้องไม่กลายเป็นสูตรใน Excel", async () => {
      const c = await freshCustomer("test-custfile-csv-injection");
      await owner.agent
        .patch(`/api/customers/${c.userId}`)
        .send({ fullName: "=HYPERLINK(\"http://evil.example\")" })
        .expect(200);

      const res = await owner.agent
        .get(`/api/customers/directory.csv?q=${encodeURIComponent(c.email)}`)
        .expect(200);
      expect(res.text).toContain("'=HYPERLINK");
      expect(res.text).not.toContain('"=HYPERLINK');
    });

    it("ไฟล์กิจกรรมของ ADMIN ต้องไม่มีคอลัมน์ IP เลย ส่วนของ OWNER มี", async () => {
      const ownerCsv = await owner.agent.get("/api/customers/activity.csv").expect(200);
      const adminCsv = await admin.agent.get("/api/customers/activity.csv").expect(200);

      expect(ownerCsv.text.split("\r\n")[0]).toContain("IP");
      // ไม่ใส่คอลัมน์ว่างไว้ เพราะจะอ่านว่า "ไม่มีข้อมูลไอพี" ซึ่งไม่จริง
      expect(adminCsv.text.split("\r\n")[0]).not.toContain("IP");
    });

    it("สำเนาข้อมูลส่วนบุคคล (PDPA) — OWNER เท่านั้น", async () => {
      const c = await freshCustomer("test-custfile-pdpa-role");
      await admin.agent.get(`/api/customers/${c.userId}/export`).expect(403);
      await owner.agent.get(`/api/customers/${c.userId}/export`).expect(200);
    });

    it("ไฟล์สำเนาข้อมูลรวมทุกส่วนที่เก็บไว้ และบอกตรง ๆ ว่าอะไรไม่ได้รวม", async () => {
      const c = await freshCustomer("test-custfile-pdpa-body");
      await owner.agent
        .post(`/api/customers/${c.userId}/notes`)
        .send({ body: "โทรคุยเรื่องงบประมาณ" })
        .expect(201);

      const res = await owner.agent.get(`/api/customers/${c.userId}/export`).expect(200);
      const pkg = JSON.parse(res.text);

      expect(pkg["เกี่ยวกับไฟล์นี้"]["เจ้าของข้อมูล"]).toBe("Test Customer");
      expect(pkg["บัญชีผู้ใช้"]["อีเมล"]).toBe(c.email);
      expect(pkg["ข้อมูลติดต่อ"]).toHaveProperty("เลขประจำตัวผู้เสียภาษี");
      expect(pkg).toHaveProperty("โครงการ");
      expect(pkg).toHaveProperty("ใบเสนอราคา");
      expect(pkg).toHaveProperty("สัญญา");
      expect(pkg).toHaveProperty("ประวัติการใช้งาน");
      // รหัสผ่านต้องไม่อยู่ในไฟล์ และไฟล์ต้องระบุว่าให้ไม่ได้เพราะอะไร
      expect(res.text).not.toContain("passwordHash");
      expect(JSON.stringify(pkg["เกี่ยวกับไฟล์นี้"]["สิ่งที่ไม่รวมอยู่ในไฟล์นี้"])).toContain("รหัสผ่าน");

      expect(pkg["บันทึกการติดต่อของพนักงาน"]).toHaveLength(1);
    });

    it("ตัดบันทึกการติดต่อออกได้ แต่ไฟล์ต้องระบุว่าตัดออก ไม่ใช่หายเงียบ ๆ", async () => {
      const c = await freshCustomer("test-custfile-pdpa-notes");
      await owner.agent
        .post(`/api/customers/${c.userId}/notes`)
        .send({ body: "ความเห็นภายในของพนักงาน" })
        .expect(201);

      const res = await owner.agent
        .get(`/api/customers/${c.userId}/export?includeNotes=0`)
        .expect(200);
      const pkg = JSON.parse(res.text);

      expect(pkg["บันทึกการติดต่อของพนักงาน"]).toBeNull();
      expect(res.text).not.toContain("ความเห็นภายในของพนักงาน");
      expect(JSON.stringify(pkg["เกี่ยวกับไฟล์นี้"]["สิ่งที่ไม่รวมอยู่ในไฟล์นี้"])).toContain(
        "บันทึกการติดต่อภายในของพนักงาน",
      );
    });

    it("การส่งออกข้อมูลส่วนบุคคลต้องมีร่องรอยว่าใครโหลดเมื่อไร", async () => {
      const c = await freshCustomer("test-custfile-pdpa-audit");
      await owner.agent.get(`/api/customers/${c.userId}/export`).expect(200);

      const row = await prisma.auditLog.findFirst({
        where: { action: "EXPORT_CUSTOMER_DATA", entityId: c.userId },
        orderBy: { createdAt: "desc" },
      });
      expect(row).not.toBeNull();
      expect(row?.userId).toBe(owner.userId);
    });
  });
});

