import fs from "node:fs";
import path from "node:path";

import sharp from "sharp";
import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { UPLOADS_DIR } from "../../src/modules/uploads/uploads.routes";
import { createAndLoginAdmin, createAndLoginCustomer } from "../helpers/test-auth";

/** หน้า "บัญชีของฉัน" ฝั่งลูกค้า — แก้ชื่อตัวเอง + รูปโปรไฟล์ */
describe("customer profile (name + avatar)", () => {
  const createdEmails: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  const fileOf = (url: string) => path.join(UPLOADS_DIR, url.split("/uploads/")[1]);
  const photo = () =>
    sharp({ create: { width: 600, height: 900, channels: 3, background: "#884422" } }).jpeg().toBuffer();

  it("lets a customer rename themselves and returns the updated user", async () => {
    const customer = await createAndLoginCustomer("test-custprofile-name");
    createdEmails.push(customer.email);

    const res = await customer.agent.patch("/api/auth/me/profile").send({ fullName: "  สมหญิง ใจดี  " });
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe("สมหญิง ใจดี");

    const me = await customer.agent.get("/api/auth/me");
    expect(me.body.user.fullName).toBe("สมหญิง ใจดี");

    const blank = await customer.agent.patch("/api/auth/me/profile").send({ fullName: "   " });
    expect(blank.status).toBe(400);
  });

  it("uploads, replaces and removes a customer avatar", async () => {
    const customer = await createAndLoginCustomer("test-custprofile-avatar");
    createdEmails.push(customer.email);

    const first = await customer.agent
      .post("/api/auth/me/avatar")
      .attach("file", await photo(), { filename: "me.jpg", contentType: "image/jpeg" });
    expect(first.status).toBe(201);
    const firstUrl: string = first.body.user.avatarUrl;
    expect(firstUrl).toMatch(/\/uploads\/avatar-[\w-]+\.webp$/);
    const meta = await sharp(fs.readFileSync(fileOf(firstUrl))).metadata();
    expect([meta.width, meta.height]).toEqual([256, 256]);

    const second = await customer.agent
      .post("/api/auth/me/avatar")
      .attach("file", await photo(), { filename: "me2.jpg", contentType: "image/jpeg" });
    expect(second.status).toBe(201);
    expect(fs.existsSync(fileOf(firstUrl))).toBe(false);

    const removed = await customer.agent.delete("/api/auth/me/avatar");
    expect(removed.status).toBe(200);
    expect(removed.body.user.avatarUrl).toBeNull();
    expect(fs.existsSync(fileOf(second.body.user.avatarUrl))).toBe(false);
  });

  it("deleting the account also deletes the avatar file", async () => {
    const customer = await createAndLoginCustomer("test-custprofile-delete");
    const upload = await customer.agent
      .post("/api/auth/me/avatar")
      .attach("file", await photo(), { filename: "me.jpg", contentType: "image/jpeg" });
    const url: string = upload.body.user.avatarUrl;
    const userId: string = upload.body.user.id;
    createdUserIds.push(userId);

    const res = await customer.agent
      .post("/api/auth/delete-account")
      .send({ currentPassword: "Amber-thicket-71-woodgrain" });
    expect(res.status).toBe(204);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.avatarUrl).toBeNull();
    expect(fs.existsSync(fileOf(url))).toBe(false);
  });

  it("is customer-only and needs a session", async () => {
    const admin = await createAndLoginAdmin("test-custprofile-admin");
    createdUserIds.push(admin.userId);
    const asStaff = await admin.agent
      .post("/api/auth/me/avatar")
      .attach("file", await photo(), { filename: "x.jpg", contentType: "image/jpeg" });
    expect(asStaff.status).toBe(403);

    const anonymous = await request(app).delete("/api/auth/me/avatar");
    expect(anonymous.status).toBe(401);
  });
});
