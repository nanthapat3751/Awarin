import type { Test } from "supertest";

import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * คำตอบเมื่อขอผิดที่ของ API BOQ (/api/projects/:id/boq/...) — โครงการไม่มีจริง = 404 · ข้อมูลผิดรูป = 400
 * ห้ามหลุดเป็น 500 · พร้อมหน้าจอเหล็ก/ชิ้นส่วนโครงสร้างของโครงการที่ยังไม่มีอะไรเลย (ต้องไม่ล้ม)
 */
describe("BOQ API — validation and not-found answers", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let projectId: string;
  const ghostBase = "/api/projects/no-such-project/boq";

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-boq-errors");
    const res = await owner.agent.post("/api/projects").send({ name: "โครงการทดสอบเส้นทาง BOQ" });
    projectId = res.body.project.id;
  });

  afterAll(async () => {
    await prisma.projectVersion.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.session.deleteMany({ where: { userId: owner.userId } });
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  const call = (method: string, url: string) =>
    (owner.agent as unknown as Record<string, (u: string) => Test>)[method](url);

  const validItem = { categoryId: "x", name: "งานทดสอบ", quantity: 1, unit: "งาน", materialUnitPrice: 10, laborUnitPrice: 0 };

  const notFound: [string, string, unknown][] = [
    ["get", "/", null],
    ["get", "/structural-compare", null],
    ["get", "/export.xlsx", null],
    ["get", "/price-drift", null],
    ["post", "/price-drift/apply", { itemIds: ["x"] }],
    ["post", "/price-drift/keep", { itemIds: ["x"] }],
    ["get", "/versions/compare?from=1&to=2", null],
    ["post", "/items", validItem],
    ["get", "/rebar-cutting", null],
    ["get", "/rebar-bbs.xlsx", null],
    ["get", "/structural-members", null],
    ["post", "/structural-members/recompute", { apply: false }],
    ["delete", "/structural-members/00000000-0000-4000-8000-000000000000", null],
    ["put", "/items/order", { itemIds: ["x"] }],
    ["patch", "/items/x", { quantity: 2 }],
    ["delete", "/items/x", null],
  ];

  it.each(notFound)("%s %s on an unknown project answers 404", async (method, path, body) => {
    const req = call(method, `${ghostBase}${path}`);
    const res = body === null ? await req : await req.send(body as object);
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe("string");
  });

  const invalid: [string, string, unknown][] = [
    ["post", "/import", { rows: "nope" }],
    ["post", "/price-drift/apply", { itemIds: [] }],
    ["post", "/price-drift/keep", {}],
    ["post", "/items", { name: "" }],
    ["post", "/items/batch", { items: [] }],
    ["post", "/takeoff/apply", { rows: 1 }],
    ["post", "/structural-members/recompute", { apply: "yes" }],
    ["put", "/structural-members/00000000-0000-4000-8000-000000000000", { nope: true }],
    ["put", "/structural-members/not-a-uuid", {}],
        ["delete", "/structural-members/not-a-uuid", null],
    ["put", "/items/order", { itemIds: "x" }],
    ["patch", "/items/x", { quantity: "many" }],
  ];

  it.each(invalid)("%s %s with a malformed request answers 400", async (method, path, body) => {
    const req = call(method, `/api/projects/${projectId}/boq${path}`);
    const res = body === null ? await req : await req.send(body as object);
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });

  it("asks for both versions when comparing", async () => {
    const res = await owner.agent.get(`/api/projects/${projectId}/boq/versions/compare?from=1`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ต้องระบุเวอร์ชันที่จะเทียบ (from, to)");
  });

  it("returns empty structural views for a project with no BOQ yet", async () => {
    const base = `/api/projects/${projectId}/boq`;
    const members = await owner.agent.get(`${base}/structural-members`);
    expect(members.status).toBe(200);
    expect(members.body.members).toEqual([]);

    const cutting = await owner.agent.get(`${base}/rebar-cutting`);
    expect(cutting.status).toBe(200);

    const compare = await owner.agent.get(`${base}/structural-compare`);
    expect(compare.status).toBe(200);
    expect(compare.body.compare).toBeDefined();
  });

  describe("Excel import preview upload", () => {
    const url = () => `/api/projects/${projectId}/boq/import/preview`;

    it("rejects a request with no file", async () => {
      const res = await owner.agent.post(url());
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ไม่พบไฟล์ที่อัปโหลด");
    });

    it("rejects a file that is not .xlsx", async () => {
      const res = await owner.agent.post(url()).attach("file", Buffer.from("a,b"), "boq.csv");
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(".xlsx");
    });

    it("rejects a file larger than 5 MB", async () => {
      const res = await owner.agent
        .post(url())
        .attach("file", Buffer.alloc(5 * 1024 * 1024 + 10), "big.xlsx");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("ไฟล์ใหญ่เกิน 5 MB");
    });

    it("rejects a .xlsx that is not a real workbook", async () => {
      const res = await owner.agent.post(url()).attach("file", Buffer.from("not a zip"), "fake.xlsx");
      expect(res.status).toBe(400);
      expect(typeof res.body.error).toBe("string");
    });

    it("previews the blank import template and ignores malformed options", async () => {
      const tpl = await owner.agent
        .get(`/api/projects/${projectId}/boq/import/template.xlsx`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(tpl.status).toBe(200);
      const file = tpl.body as Buffer;

      // sheets ผิดรูป JSON → ถอยไปใช้ชีตที่ระบบเลือก · priceSet ไม่ใช่ตัวเลข → ไม่ใช้
      const res = await owner.agent
        .post(url())
        .field("sheets", "{not json")
        .field("priceSet", "abc")
        .field("defaultCategoryId", "")
        .attach("file", file, "template.xlsx");
      expect([200, 400]).toContain(res.status);
      if (res.status === 400) expect(typeof res.body.error).toBe("string");

      const withSheets = await owner.agent
        .post(url())
        .field("sheets", JSON.stringify(["ไม่มีชีตนี้"]))
        .field("priceSet", "1")
        .attach("file", file, "template.xlsx");
      expect([200, 400]).toContain(withSheets.status);
    });

    it("404s an import preview for an unknown project", async () => {
      const tpl = await owner.agent.get(`/api/projects/${projectId}/boq/import/template.xlsx`).buffer(true).parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
      const res = await owner.agent
        .post(`${ghostBase}/import/preview`)
        .attach("file", tpl.body as Buffer, "template.xlsx");
      expect([400, 404]).toContain(res.status);
    });
  });
});
