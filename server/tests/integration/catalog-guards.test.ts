import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * กติกาโครงสร้างของคลังหมวดงาน/วัสดุ — ข้อมูลที่ผิดลำดับชั้นหรืออ้างของที่ไม่มีต้องถูกปฏิเสธพร้อมเหตุผล
 * เพราะ BOQ ทุกโครงการอ้างคลังนี้ (หมวดผิดชั้น = รายงานแยกหมวดผิด · สูตรอ้างตัวเอง = คิดราคาวน)
 */
describe("catalog guards (work categories + materials)", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const categoryIds: string[] = [];
  const materialIds: string[] = [];
  let catId: string;
  let subId: string;
  let itemId: string;
  const stamp = Date.now();

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-catalog-guards");
    const cat = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: `หมวดกติกา ${stamp}` });
    catId = cat.body.category.id;
    const sub = await owner.agent.post("/api/categories").send({ level: "SUBGROUP", parentId: catId, name: "กลุ่มกติกา" });
    subId = sub.body.category.id;
    const item = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: subId, name: "รายการกติกา" });
    itemId = item.body.category.id;
    categoryIds.push(catId, subId, itemId);
  });

  afterAll(async () => {
    await prisma.materialComponent.deleteMany({ where: { materialId: { in: materialIds } } });
    await prisma.material.deleteMany({ where: { id: { in: materialIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: [...categoryIds].reverse() } } });
    await prisma.session.deleteMany({ where: { userId: owner.userId } });
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  async function material(body: Record<string, unknown>) {
    const res = await owner.agent
      .post("/api/materials")
      .send({ categoryId: itemId, name: "วัสดุทดสอบ", unit: "ชิ้น", materialUnitPrice: 100, laborUnitPrice: 20, ...body });
    if (res.status === 201) materialIds.push(res.body.material.id);
    return res;
  }

  describe("work categories", () => {
    it.each([
      [{ level: "CATEGORY", parentId: "x", name: "หมวดมีแม่" }, 400, "หมวดงานระดับ CATEGORY ต้องไม่มี parent"],
      [{ level: "SUBGROUP", name: "กลุ่มไม่มีแม่" }, 400, "หมวดงานระดับ SUBGROUP ต้องระบุ parent ที่เป็นระดับ CATEGORY"],
      [{ level: "ITEM", parentId: "no-such-parent", name: "แม่ไม่มีจริง" }, 404, "ไม่พบหมวดงานแม่ที่ระบุ"],
    ])("rejects %o", async (body, status, message) => {
      const res = await owner.agent.post("/api/categories").send(body);
      expect(res.status).toBe(status);
      expect(res.body.error).toBe(message);
    });

    it("rejects an ITEM placed directly under a CATEGORY", async () => {
      const res = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: catId, name: "ข้ามชั้น" });
      expect(res.status).toBe(400);
    });

    it("rejects making a category its own parent and 404s unknown ids", async () => {
      const self = await owner.agent.patch(`/api/categories/${subId}`).send({ parentId: subId });
      expect(self.status).toBe(400);
      expect(self.body.error).toBe("หมวดงานไม่สามารถเป็น parent ของตัวเองได้");
      expect((await owner.agent.patch("/api/categories/no-such-id").send({ name: "x" })).status).toBe(404);
      expect((await owner.agent.delete("/api/categories/no-such-id")).status).toBe(404);
    });

    it("refuses to delete a category that still has children or materials", async () => {
      const withChild = await owner.agent.delete(`/api/categories/${subId}`);
      expect(withChild.status).toBe(409);
      expect(withChild.body.error).toBe("ไม่สามารถลบหมวดงานที่มีหมวดงานย่อยอยู่ได้");

      await material({ name: "วัสดุกันลบหมวด" });
      const withMaterial = await owner.agent.delete(`/api/categories/${itemId}`);
      expect(withMaterial.status).toBe(409);
      expect(withMaterial.body.error).toBe("ไม่สามารถลบหมวดงานที่มีรายการวัสดุ/ค่าแรงผูกอยู่ได้");
    });

    it("moves an item to another valid parent", async () => {
      const sub2 = await owner.agent.post("/api/categories").send({ level: "SUBGROUP", parentId: catId, name: "กลุ่มใหม่" });
      categoryIds.splice(1, 0, sub2.body.category.id);
      const item2 = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: subId, name: "ย้ายได้" });
      categoryIds.push(item2.body.category.id);
      const moved = await owner.agent.patch(`/api/categories/${item2.body.category.id}`).send({ parentId: sub2.body.category.id });
      expect(moved.status).toBe(200);
      expect(moved.body.category.parentId).toBe(sub2.body.category.id);
    });
  });

  describe("materials", () => {
    it("rejects a category that does not exist or is not an ITEM", async () => {
      const missing = await material({ categoryId: "no-such-category" });
      expect(missing.status).toBe(404);
      expect(missing.body.error).toBe("ไม่พบหมวดงานที่ระบุ");
      const notItem = await material({ categoryId: subId });
      expect(notItem.status).toBe(400);
      expect(notItem.body.error).toBe("รายการวัสดุ/ค่าแรงต้องผูกกับหมวดงานระดับ ITEM เท่านั้น");
    });

    it("refuses new materials under a category whose parent was switched off", async () => {
      const sub = await owner.agent.post("/api/categories").send({ level: "SUBGROUP", parentId: catId, name: "กลุ่มที่จะปิด" });
      const item = await owner.agent.post("/api/categories").send({ level: "ITEM", parentId: sub.body.category.id, name: "ใต้กลุ่มที่ปิด" });
      categoryIds.splice(1, 0, sub.body.category.id);
      categoryIds.push(item.body.category.id);
      await owner.agent.patch(`/api/categories/${sub.body.category.id}`).send({ active: false });
      const res = await material({ categoryId: item.body.category.id });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("หมวดงานนี้ถูกปิดใช้งานแล้ว ไม่สามารถเพิ่มวัสดุใหม่ได้");
    });

    it("rejects a recipe that points at a missing material or at itself", async () => {
      const missingRef = await material({
        components: [{ componentMaterialId: "no-such-material", name: "ปูน", unit: "ถุง", qtyPerUnit: 1, unitPrice: 10 }],
      });
      expect(missingRef.status).toBe(404);
      expect(missingRef.body.error).toBe("มีวัสดุย่อยอ้างอิงวัสดุที่ไม่พบในระบบ");

      const base = await material({ name: "วัสดุมีสูตร" });
      const self = await owner.agent.patch(`/api/materials/${base.body.material.id}`).send({
        components: [{ componentMaterialId: base.body.material.id, name: "ตัวเอง", unit: "ชิ้น", qtyPerUnit: 1, unitPrice: 1 }],
      });
      expect(self.status).toBe(400);
      expect(self.body.error).toBe("วัสดุย่อยอ้างอิงตัวเองไม่ได้");
    });

    it("keeps the recipe-derived price when only the name changes, and clears the recipe on request", async () => {
      const raw = await material({ name: "ทรายหยาบ", materialUnitPrice: 50 });
      const mixed = await material({
        name: "ปูนก่อผสม",
        components: [
          { componentMaterialId: raw.body.material.id, name: "ทรายหยาบ", unit: "คิว", qtyPerUnit: 2, unitPrice: 50 },
          { name: "น้ำ", unit: "ลิตร", qtyPerUnit: 10, unitPrice: 0.5, wasteFactorPct: 10 },
        ],
      });
      expect(mixed.status).toBe(201);
      const derived = Number(mixed.body.material.materialUnitPrice);
      expect(derived).toBeGreaterThan(100);

      const renamed = await owner.agent
        .patch(`/api/materials/${mixed.body.material.id}`)
        .send({ name: "ปูนก่อผสมเสร็จ", materialUnitPrice: 1 });
      expect(renamed.status).toBe(200);
      expect(Number(renamed.body.material.materialUnitPrice)).toBe(derived);

      const cleared = await owner.agent
        .patch(`/api/materials/${mixed.body.material.id}`)
        .send({ components: [], materialUnitPrice: 80 });
      expect(Number(cleared.body.material.materialUnitPrice)).toBe(80);
      expect(cleared.body.material.components).toEqual([]);
    });

    it("404s updates and deletes of unknown or trashed materials", async () => {
      expect((await owner.agent.patch("/api/materials/no-such-id").send({ name: "x" })).status).toBe(404);
      expect((await owner.agent.delete("/api/materials/no-such-id")).status).toBe(404);

      const gone = await material({ name: "จะลบ" });
      expect((await owner.agent.delete(`/api/materials/${gone.body.material.id}`)).status).toBe(204);
      expect((await owner.agent.patch(`/api/materials/${gone.body.material.id}`).send({ name: "x" })).status).toBe(404);
    });
  });
});
