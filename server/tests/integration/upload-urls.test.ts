import fs from "node:fs";
import path from "node:path";

import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { UPLOADS_DIR } from "../../src/modules/uploads/uploads.routes";
import { createAndLoginOwner } from "../helpers/test-auth";

// PNG 1×1 เล็กที่สุด
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * รูปที่อัปโหลดเก็บเป็น /uploads/... ในฐานข้อมูล แล้วต่อโดเมนตอนส่งออก — ย้ายโดเมนไม่ต้องแก้ข้อมูล
 */
describe("upload URLs are stored relative, served absolute", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const KEY = "siteHeroServices";
  let original: string | null = null;
  const createdFiles: string[] = [];
  const baseBefore = process.env.PUBLIC_UPLOAD_BASE_URL;

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-uploadurl-owner");
    original = (await prisma.setting.findUnique({ where: { key: KEY } }))?.value ?? null;
  });

  afterAll(async () => {
    if (baseBefore === undefined) delete process.env.PUBLIC_UPLOAD_BASE_URL;
    else process.env.PUBLIC_UPLOAD_BASE_URL = baseBefore;
    if (original === null) await prisma.setting.deleteMany({ where: { key: KEY } });
    else await prisma.setting.update({ where: { key: KEY }, data: { value: original } });
    for (const f of createdFiles) fs.rmSync(path.join(UPLOADS_DIR, f), { force: true });
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  afterEach(() => {
    if (baseBefore === undefined) delete process.env.PUBLIC_UPLOAD_BASE_URL;
    else process.env.PUBLIC_UPLOAD_BASE_URL = baseBefore;
  });

  it("อัปโหลดแล้วได้ URL เต็มกลับไปแสดง → บันทึกกลับมา → ฐานข้อมูลเก็บแค่ /uploads/...", async () => {
    process.env.PUBLIC_UPLOAD_BASE_URL = "http://localhost:4000";
    const up = await owner.agent.post("/api/uploads").attach("file", PNG, { filename: "x.png", contentType: "image/png" });
    expect(up.status).toBe(201);
    expect(up.body.url).toMatch(/^http:\/\/localhost:4000\/uploads\/[\w.-]+\.png$/);
    const file = up.body.url.split("/uploads/")[1];
    createdFiles.push(file);

    const save = await owner.agent.patch("/api/settings").send({ [KEY]: up.body.url });
    expect(save.status).toBe(200);
    expect(save.body.settings[KEY]).toBe(up.body.url);

    const row = await prisma.setting.findUniqueOrThrow({ where: { key: KEY } });
    expect(row.value).toBe(`/uploads/${file}`);

    // ไฟล์เสิร์ฟได้จริงจาก URL ที่ส่งออก
    const img = await request(app).get(`/uploads/${file}`);
    expect(img.status).toBe(200);
  });

  it("ย้ายโดเมน = แก้ PUBLIC_UPLOAD_BASE_URL ค่าเดียว รูปเก่าตามไปทันทีโดยไม่แตะฐานข้อมูล", async () => {
    await prisma.setting.upsert({
      where: { key: KEY },
      update: { value: "/uploads/1-moved.jpg" },
      create: { key: KEY, value: "/uploads/1-moved.jpg" },
    });
    process.env.PUBLIC_UPLOAD_BASE_URL = "https://api.awarin.co.th/";
    const res = await request(app).get("/api/public/settings");
    expect(res.body.settings[KEY]).toBe("https://api.awarin.co.th/uploads/1-moved.jpg");
  });

  it("ค่าที่ส่งกลับมาจากโดเมนจริงก็ถูกตัดเป็น /uploads/... เหมือนกัน", async () => {
    process.env.PUBLIC_UPLOAD_BASE_URL = "https://api.awarin.co.th";
    await owner.agent.patch("/api/settings").send({ [KEY]: "https://api.awarin.co.th/uploads/2-x.jpg" });
    expect((await prisma.setting.findUniqueOrThrow({ where: { key: KEY } })).value).toBe("/uploads/2-x.jpg");
  });

  it("ลิงก์รูปจากเว็บอื่นเก็บตามที่กรอก ไม่ถูกตัด", async () => {
    const external = "https://images.example.com/uploads/hero.jpg";
    await owner.agent.patch("/api/settings").send({ [KEY]: external });
    expect((await prisma.setting.findUniqueOrThrow({ where: { key: KEY } })).value).toBe(external);
    const res = await request(app).get("/api/public/settings");
    expect(res.body.settings[KEY]).toBe(external);
  });
});
