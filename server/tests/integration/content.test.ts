import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("content modules (house designs / portfolio)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdUserIds: string[] = [];
  const createdHouseDesignIds: string[] = [];
  const createdPortfolioIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-content-owner");
    createdUserIds.push(owner.userId);
  });

  afterAll(async () => {
    await prisma.houseDesign.deleteMany({ where: { id: { in: createdHouseDesignIds } } });
    await prisma.portfolio.deleteMany({ where: { id: { in: createdPortfolioIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe("house designs", () => {
    it("creates unpublished by default, hidden from public, then visible once published", async () => {
      const createRes = await owner.agent
        .post("/api/house-designs")
        .send({ name: "แบบบ้านทดสอบ", area: 120 });
      expect(createRes.status).toBe(201);
      expect(createRes.body.houseDesign.published).toBe(false);
      const id = createRes.body.houseDesign.id;
      createdHouseDesignIds.push(id);

      const publicListBefore = await owner.agent.get("/api/public/house-designs");
      expect(publicListBefore.body.houseDesigns.map((d: { id: string }) => d.id)).not.toContain(id);

      const publicGetBefore = await owner.agent.get(`/api/public/house-designs/${id}`);
      expect(publicGetBefore.status).toBe(404);

      const publishRes = await owner.agent
        .patch(`/api/house-designs/${id}`)
        .send({ published: true });
      expect(publishRes.status).toBe(200);

      const publicListAfter = await owner.agent.get("/api/public/house-designs");
      expect(publicListAfter.body.houseDesigns.map((d: { id: string }) => d.id)).toContain(id);

      const publicGetAfter = await owner.agent.get(`/api/public/house-designs/${id}`);
      expect(publicGetAfter.status).toBe(200);
    });

    it("rejects a CUSTOMER managing house designs", async () => {
      const customer = await createAndLoginCustomer("test-content-customer-hd");
      const res = await customer.agent.post("/api/house-designs").send({ name: "ห้ามสร้าง" });
      expect(res.status).toBe(403);
      await prisma.user.deleteMany({ where: { email: customer.email } });
    });
  });

  describe("portfolio", () => {
    it("publishes and filters by type on the public endpoint", async () => {
      const design = await owner.agent
        .post("/api/portfolio")
        .send({ title: "ผลงานออกแบบทดสอบ", type: "DESIGN", published: true });
      expect(design.status).toBe(201);
      expect(design.body.item.publishedAt).not.toBeNull();
      createdPortfolioIds.push(design.body.item.id);

      const construction = await owner.agent
        .post("/api/portfolio")
        .send({ title: "ผลงานก่อสร้างทดสอบ", type: "CONSTRUCTION", published: true });
      createdPortfolioIds.push(construction.body.item.id);

      const designOnly = await owner.agent.get("/api/public/portfolio?type=DESIGN");
      const ids = designOnly.body.portfolio.map((p: { id: string }) => p.id);
      expect(ids).toContain(design.body.item.id);
      expect(ids).not.toContain(construction.body.item.id);
    });
  });
});
