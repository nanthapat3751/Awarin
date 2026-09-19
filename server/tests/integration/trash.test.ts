import fs from "node:fs";
import path from "node:path";

import request from "supertest";

import { app } from "../../src/app";
import { hashPassword } from "../../src/lib/password";
import { prisma } from "../../src/lib/prisma";
import { sweepTrash } from "../../src/modules/trash/trash.service";
import { UPLOADS_DIR } from "../../src/modules/uploads/uploads.routes";
import { createAndLoginOwner } from "../helpers/test-auth";

// ผู้ใช้ ADMIN + ล็อกอิน (helper กลางมีแค่ owner/customer) — ใช้ทดสอบว่า ADMIN ลบถาวรไม่ได้
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

describe("trash (recycle bin) module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let itemCategoryId: string;
  const userIds: string[] = [];
  const categoryIds: string[] = [];
  const materialIds: string[] = [];
  const projectIds: string[] = [];
  const portfolioIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-trash-owner");
    admin = await createAndLoginAdmin("test-trash-admin");
    userIds.push(owner.userId, admin.userId);

    const cat = await owner.agent
      .post("/api/categories")
      .send({ level: "CATEGORY", name: "หมวดทดสอบถังขยะ" });
    categoryIds.push(cat.body.category.id);
    const sub = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: cat.body.category.id, name: "กลุ่มทดสอบถังขยะ" });
    categoryIds.push(sub.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: sub.body.category.id, name: "รายการทดสอบถังขยะ" });
    itemCategoryId = item.body.category.id;
    categoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    await prisma.material.deleteMany({ where: { id: { in: materialIds } } });
    await prisma.portfolio.deleteMany({ where: { id: { in: portfolioIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function createMaterial(name: string): Promise<string> {
    const res = await owner.agent.post("/api/materials").send({
      categoryId: itemCategoryId,
      name,
      unit: "หน่วย",
      materialUnitPrice: 100,
      laborUnitPrice: 0,
    });
    materialIds.push(res.body.material.id);
    return res.body.material.id;
  }

  it("moves a material to trash instead of hard-deleting it", async () => {
    const id = await createMaterial("วัสดุจะย้ายเข้าถังขยะ");

    const del = await owner.agent.delete(`/api/materials/${id}`);
    expect(del.status).toBe(204);

    // ยังอยู่ใน DB (soft delete) แต่หายจาก list ปกติ
    const row = await prisma.material.findUnique({ where: { id } });
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.deletedById).toBe(owner.userId);

    const list = await owner.agent.get("/api/materials");
    expect(list.body.materials.some((m: { id: string }) => m.id === id)).toBe(false);

    // โผล่ในถังขยะ
    const trash = await owner.agent.get("/api/trash");
    expect(trash.status).toBe(200);
    expect(trash.body.retentionDays).toBe(30);
    const found = trash.body.items.find((t: { id: string }) => t.id === id);
    expect(found).toBeTruthy();
    expect(found.type).toBe("material");
    expect(found.blockReason).toBeNull();
    expect(found.deletedByName).toBe("Test Owner");
  });

  it("restores a trashed material back into the normal list", async () => {
    const id = await createMaterial("วัสดุจะกู้คืน");
    await owner.agent.delete(`/api/materials/${id}`);

    const restore = await owner.agent.post(`/api/trash/material/${id}/restore`);
    expect(restore.status).toBe(204);

    const row = await prisma.material.findUnique({ where: { id } });
    expect(row?.deletedAt).toBeNull();

    const list = await owner.agent.get("/api/materials");
    expect(list.body.materials.some((m: { id: string }) => m.id === id)).toBe(true);
  });

  it("lets OWNER permanently delete but forbids ADMIN", async () => {
    const id = await createMaterial("วัสดุจะลบถาวร");
    await owner.agent.delete(`/api/materials/${id}`);

    // ADMIN กดลบถาวรไม่ได้
    const adminPurge = await admin.agent.delete(`/api/trash/material/${id}`);
    expect(adminPurge.status).toBe(403);
    expect(await prisma.material.findUnique({ where: { id } })).not.toBeNull();

    // OWNER ลบถาวรได้จริง
    const ownerPurge = await owner.agent.delete(`/api/trash/material/${id}`);
    expect(ownerPurge.status).toBe(204);
    expect(await prisma.material.findUnique({ where: { id } })).toBeNull();
  });

  it("hides a trashed project from detail (404) then brings it back on restore", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "[ชั่วคราว] โครงการทดสอบถังขยะ" });
    const projectId = created.body.project.id;
    projectIds.push(projectId);

    const del = await owner.agent.delete(`/api/projects/${projectId}`);
    expect(del.status).toBe(204);

    const detail = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detail.status).toBe(404);

    const restore = await owner.agent.post(`/api/trash/project/${projectId}/restore`);
    expect(restore.status).toBe(204);

    const detail2 = await owner.agent.get(`/api/projects/${projectId}`);
    expect(detail2.status).toBe(200);
  });

  it("keeps a trashed portfolio out of the public list", async () => {
    const created = await owner.agent
      .post("/api/portfolio")
      .send({ title: "ผลงานทดสอบถังขยะ", type: "DESIGN", published: true });
    const id = created.body.item.id;
    portfolioIds.push(id);

    await owner.agent.delete(`/api/portfolio/${id}`);

    const pub = await request(app).get("/api/public/portfolio");
    expect(pub.body.portfolio.some((p: { id: string }) => p.id === id)).toBe(false);
  });

  it("auto-purges items older than the retention window via sweepTrash", async () => {
    const id = await createMaterial("วัสดุเก่าเกิน 30 วัน");
    await owner.agent.delete(`/api/materials/${id}`);
    // ย้อนวันลบไป 40 วัน
    await prisma.material.update({
      where: { id },
      data: { deletedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    });

    const purged = await sweepTrash();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await prisma.material.findUnique({ where: { id } })).toBeNull();
  });

  it("does not auto-purge items still within the retention window", async () => {
    const id = await createMaterial("วัสดุเพิ่งลบ");
    await owner.agent.delete(`/api/materials/${id}`);

    await sweepTrash();
    // เพิ่งลบ → ยังอยู่ในถังขยะ (ไม่ถูกล้าง)
    const row = await prisma.material.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
  });

  it("blocks editing or issuing a quote on a trashed project via direct API", async () => {
    const created = await owner.agent.post("/api/projects").send({ name: "[ชั่วคราว] โครงการห้ามแก้" });
    const projectId = created.body.project.id;
    projectIds.push(projectId);
    await owner.agent.delete(`/api/projects/${projectId}`); // → ถังขยะ

    const rename = await owner.agent.patch(`/api/projects/${projectId}`).send({ name: "ห้ามเปลี่ยน" });
    expect(rename.status).toBe(404);

    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`);
    expect(quote.status).toBe(404);
  });

  it("deletes uploaded image files from disk when a portfolio is purged", async () => {
    const fname = `test-trash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    const fpath = path.join(UPLOADS_DIR, fname);
    fs.writeFileSync(fpath, "fake-image-bytes");

    const item = await prisma.portfolio.create({
      data: {
        title: "[ชั่วคราว] ผลงานมีรูป",
        type: "DESIGN",
        createdById: owner.userId,
        images: [`http://localhost:4000/uploads/${fname}`],
        deletedAt: new Date(),
        deletedById: owner.userId,
      },
    });
    portfolioIds.push(item.id);
    expect(fs.existsSync(fpath)).toBe(true);

    const purge = await owner.agent.delete(`/api/trash/portfolio/${item.id}`);
    expect(purge.status).toBe(204);
    expect(fs.existsSync(fpath)).toBe(false); // ไฟล์รูปถูกลบตามไปด้วย
    expect(await prisma.portfolio.findUnique({ where: { id: item.id } })).toBeNull();
  });
});
