import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { FEATURED_HOUSE_DESIGN_LIMIT } from "../../src/modules/houseDesigns/houseDesigns.service";
import { FEATURED_LIMIT } from "../../src/modules/portfolio/portfolio.service";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * จัดการผลงาน/แบบบ้านฝั่งพนักงานครบวงจร: รายการ · ดูรายตัว · แก้ · เผยแพร่/เลิกเผยแพร่ ·
 * ผลงานเด่น (เพดาน + ต่อท้ายลำดับ + ลากเรียง) · ย้ายเข้าถังขยะ · และสิ่งที่ฝั่งสาธารณะเห็น
 * (content.test.ts ครอบเฉพาะการสร้าง+เผยแพร่ครั้งแรก)
 */
describe("content management (portfolio + house designs)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const anon = request(app);
  const portfolioIds: string[] = [];
  const houseDesignIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-content-mgmt");
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { houseDesignId: { in: houseDesignIds } } });
    await prisma.portfolio.deleteMany({ where: { id: { in: portfolioIds } } });
    await prisma.houseDesign.deleteMany({ where: { id: { in: houseDesignIds } } });
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  async function newPortfolio(body: Record<string, unknown> = {}) {
    const res = await owner.agent
      .post("/api/portfolio")
      .send({ title: `ผลงาน ${portfolioIds.length + 1}`, type: "DESIGN", ...body });
    expect(res.status).toBe(201);
    portfolioIds.push(res.body.item.id);
    return res.body.item as { id: string; publishedAt: string | null };
  }

  async function newHouseDesign(body: Record<string, unknown> = {}) {
    const res = await owner.agent
      .post("/api/house-designs")
      .send({ name: `แบบบ้าน ${houseDesignIds.length + 1}`, ...body });
    expect(res.status).toBe(201);
    houseDesignIds.push(res.body.houseDesign.id);
    return res.body.houseDesign as { id: string };
  }

  describe("portfolio", () => {
    it("rejects an invalid create body with 400", async () => {
      const res = await owner.agent.post("/api/portfolio").send({ title: "", type: "OTHER" });
      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
    });

    it("lists drafts for staff but 404s them on the public endpoint", async () => {
      const draft = await newPortfolio();

      const staffList = await owner.agent.get("/api/portfolio");
      expect(staffList.status).toBe(200);
      expect(staffList.body.portfolio.map((p: { id: string }) => p.id)).toContain(draft.id);

      const staffGet = await owner.agent.get(`/api/portfolio/${draft.id}`);
      expect(staffGet.status).toBe(200);
      expect(staffGet.body.item.published).toBe(false);

      const publicGet = await anon.get(`/api/public/portfolio/${draft.id}`);
      expect(publicGet.status).toBe(404);
    });

    it("404s an unknown id for get / patch / delete", async () => {
      const missing = "does-not-exist";
      expect((await owner.agent.get(`/api/portfolio/${missing}`)).status).toBe(404);
      expect((await owner.agent.patch(`/api/portfolio/${missing}`).send({ title: "x" })).status).toBe(404);
      expect((await owner.agent.delete(`/api/portfolio/${missing}`)).status).toBe(404);
    });

    it("rejects an invalid patch body with 400", async () => {
      const item = await newPortfolio();
      const res = await owner.agent.patch(`/api/portfolio/${item.id}`).send({ title: "" });
      expect(res.status).toBe(400);
    });

    it("keeps the first publish date when re-published and clears it when unpublished", async () => {
      const item = await newPortfolio({ published: true });
      const firstPublishedAt = item.publishedAt;
      expect(firstPublishedAt).not.toBeNull();

      const unpublished = await owner.agent.patch(`/api/portfolio/${item.id}`).send({ published: false });
      expect(unpublished.status).toBe(200);
      expect(unpublished.body.item.publishedAt).toBeNull();

      const republished = await owner.agent.patch(`/api/portfolio/${item.id}`).send({ published: true });
      expect(republished.body.item.publishedAt).not.toBeNull();

      // เผยแพร่ซ้ำขณะที่ยังเผยแพร่อยู่ → วันที่เดิมต้องไม่ถูกเขียนทับ
      const again = await owner.agent
        .patch(`/api/portfolio/${item.id}`)
        .send({ published: true, description: "แก้คำบรรยาย" });
      expect(again.body.item.publishedAt).toBe(republished.body.item.publishedAt);
      expect(again.body.item.description).toBe("แก้คำบรรยาย");

      const publicGet = await anon.get(`/api/public/portfolio/${item.id}`);
      expect(publicGet.status).toBe(200);
      expect(publicGet.body.item.id).toBe(item.id);
    });

    it("appends newly featured items to the end of the order and reorders on request", async () => {
      // เผื่อชุดเทสต์มีผลงานเด่นค้างอยู่แล้ว — ต้องเหลือที่ว่างอย่างน้อย 2
      const before = await prisma.portfolio.count({ where: { featured: true, deletedAt: null } });
      if (before > FEATURED_LIMIT - 2) {
        await prisma.portfolio.updateMany({ where: { featured: true }, data: { featured: false } });
      }

      const a = await newPortfolio({ published: true });
      const b = await newPortfolio({ published: true });
      const fa = await owner.agent.patch(`/api/portfolio/${a.id}`).send({ featured: true });
      const fb = await owner.agent.patch(`/api/portfolio/${b.id}`).send({ featured: true });
      expect(fa.status).toBe(200);
      expect(fb.body.item.featuredOrder).toBe(fa.body.item.featuredOrder + 1);

      // ตั้ง featured ซ้ำกับตัวที่เด่นอยู่แล้ว ต้องไม่ขยับลำดับ
      const same = await owner.agent.patch(`/api/portfolio/${a.id}`).send({ featured: true });
      expect(same.body.item.featuredOrder).toBe(fa.body.item.featuredOrder);

      const reorder = await owner.agent
        .patch("/api/portfolio/featured/reorder")
        .send({ orderedIds: [b.id, a.id] });
      expect(reorder.status).toBe(204);
      const rows = await prisma.portfolio.findMany({ where: { id: { in: [a.id, b.id] } } });
      expect(rows.find((r) => r.id === b.id)!.featuredOrder).toBe(1);
      expect(rows.find((r) => r.id === a.id)!.featuredOrder).toBe(2);

      const featured = await anon.get("/api/public/portfolio/featured?limit=2");
      expect(featured.status).toBe(200);
      expect(featured.body.portfolio.length).toBeLessThanOrEqual(2);
      expect(typeof featured.body.total).toBe("number");
      expect(featured.body.total).toBeGreaterThanOrEqual(2);

      // limit ที่ใช้ไม่ได้ ถอยไปใช้ค่าเพดาน
      const fallback = await anon.get("/api/public/portfolio/featured?limit=999");
      expect(fallback.body.portfolio.length).toBeLessThanOrEqual(FEATURED_LIMIT);
    });

    it("rejects a malformed reorder body", async () => {
      const res = await owner.agent.patch("/api/portfolio/featured/reorder").send({ orderedIds: "x" });
      expect(res.status).toBe(400);
    });

    it(`refuses to feature more than ${FEATURED_LIMIT} items`, async () => {
      const current = await prisma.portfolio.count({ where: { featured: true, deletedAt: null } });
      for (let i = current; i < FEATURED_LIMIT; i++) {
        const item = await newPortfolio({ published: true });
        const res = await owner.agent.patch(`/api/portfolio/${item.id}`).send({ featured: true });
        expect(res.status).toBe(200);
      }
      const extra = await newPortfolio({ published: true });
      const res = await owner.agent.patch(`/api/portfolio/${extra.id}`).send({ featured: true });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(String(FEATURED_LIMIT));

      await prisma.portfolio.updateMany({ where: { id: { in: portfolioIds } }, data: { featured: false } });
    });

    it("moves a deleted item to the trash so it disappears everywhere", async () => {
      const item = await newPortfolio({ published: true });
      const del = await owner.agent.delete(`/api/portfolio/${item.id}`);
      expect(del.status).toBe(204);

      const row = await prisma.portfolio.findUnique({ where: { id: item.id } });
      expect(row!.deletedAt).not.toBeNull();
      expect(row!.deletedById).toBe(owner.userId);

      const staffList = await owner.agent.get("/api/portfolio");
      expect(staffList.body.portfolio.map((p: { id: string }) => p.id)).not.toContain(item.id);
      expect((await owner.agent.get(`/api/portfolio/${item.id}`)).status).toBe(404);
      expect((await owner.agent.patch(`/api/portfolio/${item.id}`).send({ title: "x" })).status).toBe(404);

      const publicList = await anon.get("/api/public/portfolio");
      expect(publicList.body.portfolio.map((p: { id: string }) => p.id)).not.toContain(item.id);
    });
  });

  describe("house designs", () => {
    it("rejects invalid create / patch bodies with 400", async () => {
      const bad = await owner.agent.post("/api/house-designs").send({ name: "", floors: 0 });
      expect(bad.status).toBe(400);

      const design = await newHouseDesign();
      const badPatch = await owner.agent.patch(`/api/house-designs/${design.id}`).send({ bedrooms: -1 });
      expect(badPatch.status).toBe(400);
    });

    it("lists for staff, returns detail with a null estimate when there is no standard template", async () => {
      const design = await newHouseDesign({ area: 150, floors: 2, bedrooms: 3, bathrooms: 2 });

      const list = await owner.agent.get("/api/house-designs");
      expect(list.status).toBe(200);
      expect(list.body.houseDesigns.map((d: { id: string }) => d.id)).toContain(design.id);

      const detail = await owner.agent.get(`/api/house-designs/${design.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body.houseDesign.floors).toBe(2);
      expect(detail.body.houseDesign.standard).toBeNull();
    });

    it("404s an unknown id for get / patch / delete", async () => {
      const missing = "does-not-exist";
      expect((await owner.agent.get(`/api/house-designs/${missing}`)).status).toBe(404);
      expect((await owner.agent.patch(`/api/house-designs/${missing}`).send({ name: "x" })).status).toBe(404);
      expect((await owner.agent.delete(`/api/house-designs/${missing}`)).status).toBe(404);
    });

    it("updates spec fields and clears nullable ones", async () => {
      const design = await newHouseDesign({ area: 100, description: "เดิม" });
      const res = await owner.agent
        .patch(`/api/house-designs/${design.id}`)
        .send({ name: "ชื่อใหม่", area: null, description: null, wallAreaSqm: 320.5 });
      expect(res.status).toBe(200);
      expect(res.body.houseDesign.name).toBe("ชื่อใหม่");
      expect(res.body.houseDesign.area).toBeNull();
      expect(res.body.houseDesign.description).toBeNull();
      expect(Number(res.body.houseDesign.wallAreaSqm)).toBe(320.5);
    });

    it("features designs in order, reorders them and shows them on the public featured list", async () => {
      const before = await prisma.houseDesign.count({ where: { featured: true, deletedAt: null } });
      if (before > FEATURED_HOUSE_DESIGN_LIMIT - 2) {
        await prisma.houseDesign.updateMany({ where: { featured: true }, data: { featured: false } });
      }

      const a = await newHouseDesign({ published: true });
      const b = await newHouseDesign({ published: true });
      const fa = await owner.agent.patch(`/api/house-designs/${a.id}`).send({ featured: true });
      const fb = await owner.agent.patch(`/api/house-designs/${b.id}`).send({ featured: true });
      expect(fb.body.houseDesign.featuredOrder).toBe(fa.body.houseDesign.featuredOrder + 1);

      const reorder = await owner.agent
        .patch("/api/house-designs/featured/reorder")
        .send({ orderedIds: [b.id, a.id] });
      expect(reorder.status).toBe(204);
      const rows = await prisma.houseDesign.findMany({ where: { id: { in: [a.id, b.id] } } });
      expect(rows.find((r) => r.id === b.id)!.featuredOrder).toBe(1);
      expect(rows.find((r) => r.id === a.id)!.featuredOrder).toBe(2);

      const featured = await anon.get("/api/public/house-designs/featured?limit=2");
      expect(featured.status).toBe(200);
      expect(featured.body.houseDesigns.length).toBeLessThanOrEqual(2);
      const ids = (await anon.get("/api/public/house-designs/featured")).body.houseDesigns.map(
        (d: { id: string }) => d.id,
      );
      expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
      expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));

      const badReorder = await owner.agent.patch("/api/house-designs/featured/reorder").send({});
      expect(badReorder.status).toBe(400);
    });

    it(`refuses to feature more than ${FEATURED_HOUSE_DESIGN_LIMIT} designs`, async () => {
      const current = await prisma.houseDesign.count({ where: { featured: true, deletedAt: null } });
      for (let i = current; i < FEATURED_HOUSE_DESIGN_LIMIT; i++) {
        const d = await newHouseDesign({ published: true });
        expect((await owner.agent.patch(`/api/house-designs/${d.id}`).send({ featured: true })).status).toBe(200);
      }
      const extra = await newHouseDesign({ published: true });
      const res = await owner.agent.patch(`/api/house-designs/${extra.id}`).send({ featured: true });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(String(FEATURED_HOUSE_DESIGN_LIMIT));

      await prisma.houseDesign.updateMany({ where: { id: { in: houseDesignIds } }, data: { featured: false } });
    });

    it("blocks deleting a design that a live project uses, then trashes it once free", async () => {
      const design = await newHouseDesign({ published: true });
      const project = await prisma.project.create({
        data: {
          projectNo: `T-HD-${Date.now()}`,
          name: "โครงการผูกแบบบ้าน",
          houseDesignId: design.id,
          createdById: owner.userId,
        },
      });

      const blocked = await owner.agent.delete(`/api/house-designs/${design.id}`);
      expect(blocked.status).toBe(409);

      await prisma.project.delete({ where: { id: project.id } });
      const ok = await owner.agent.delete(`/api/house-designs/${design.id}`);
      expect(ok.status).toBe(204);

      const row = await prisma.houseDesign.findUnique({ where: { id: design.id } });
      expect(row!.deletedAt).not.toBeNull();
      expect((await anon.get(`/api/public/house-designs/${design.id}`)).status).toBe(404);
      expect((await owner.agent.get(`/api/house-designs/${design.id}`)).status).toBe(404);
    });
  });
});
