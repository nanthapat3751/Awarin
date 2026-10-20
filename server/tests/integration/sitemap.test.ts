import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * sitemap.xml ของเว็บลูกค้า — เฝ้า: มีหน้าหลัก + แบบบ้าน/ผลงานที่เผยแพร่เท่านั้น (ไม่หลุดของร่าง/ของในถังขยะ)
 * · URL ใช้โดเมนเว็บลูกค้า · ไม่มีหน้าพอร์ทัล · อ่านได้โดยไม่ล็อกอิน
 */
describe("sitemap.xml", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const ids = { designs: [] as string[], portfolio: [] as string[] };

  beforeAll(async () => {
    owner = await createAndLoginOwner("sitemap");
    const mk = (name: string, extra: object) =>
      prisma.houseDesign.create({ data: { name, createdById: owner.userId, ...extra } });
    for (const d of await Promise.all([
      mk("[sitemap] เผยแพร่", { published: true }),
      mk("[sitemap] ร่าง", { published: false }),
      mk("[sitemap] ในถังขยะ", { published: true, deletedAt: new Date() }),
    ]))
      ids.designs.push(d.id);
    const p = await prisma.portfolio.create({
      data: { title: "[sitemap] ผลงาน", type: "DESIGN", createdById: owner.userId, published: true, publishedAt: new Date("2026-09-01T00:00:00Z") },
    });
    ids.portfolio.push(p.id);
  });

  afterAll(async () => {
    await prisma.houseDesign.deleteMany({ where: { id: { in: ids.designs } } });
    await prisma.portfolio.deleteMany({ where: { id: { in: ids.portfolio } } });
  });

  it("เป็น XML ที่อ่านได้โดยไม่ล็อกอิน มีหน้าหลักและเฉพาะแบบบ้าน/ผลงานที่เผยแพร่", async () => {
    const res = await request(app).get("/api/public/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
    const xml = res.text;
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);

    const base = (process.env.CLIENT_BASE_URL ?? process.env.CORS_ORIGIN_CLIENT ?? "http://localhost:5174").replace(/\/+$/, "");
    for (const path of ["/", "/house-designs", "/portfolio", "/services", "/contact", "/privacy"]) {
      expect(xml).toContain(`<loc>${base}${path}</loc>`);
    }
    const [published, draft, trashed] = ids.designs;
    expect(xml).toContain(`<loc>${base}/house-designs/${published}</loc>`);
    expect(xml).not.toContain(draft);
    expect(xml).not.toContain(trashed);
    expect(xml).toContain(`<loc>${base}/portfolio/${ids.portfolio[0]}</loc>\n    <lastmod>2026-09-01</lastmod>`);

    // หน้าที่ต้องล็อกอิน คนค้นหาเปิดแล้วเจอแต่หน้าล็อกอิน — ไม่ใส่
    expect(xml).not.toContain("/my/");
    expect(xml).not.toContain("/login");
  });
});
