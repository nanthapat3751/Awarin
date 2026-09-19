import fs from "node:fs";
import path from "node:path";

import request from "supertest";

import { app } from "../../src/app";
import { prisma } from "../../src/lib/prisma";
import { createAndLoginCustomer, createAndLoginOwner } from "../helpers/test-auth";

describe("settings module", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const createdUserIds: string[] = [];
  // settings เป็น global (คีย์เดียวทั้งระบบ) — เก็บค่าเดิมของคีย์ที่เทสต์นี้แก้ แล้วคืนใน afterAll
  // เพื่อไม่ให้ค่า margin/VAT ที่ตั้งในเทสต์รั่วไปกระทบชุดอื่น (เช่น boq pricing ที่อิงอัตราเริ่มต้น)
  const TOUCHED_KEYS = [
    "companyName",
    "overheadProfitPercent",
    "vatPercent",
    "companyEmail",
    "companySignatoryName",
    "companySignatoryTitle",
    "paymentBankName",
    "paymentBankBranch",
    "paymentAccountName",
    "paymentAccountNo",
    "paymentPromptPay",
    "companyLogoPng",
    "companyLogoSmallPng",
  ];
  const originalSettings: Record<string, string | null> = {};

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-settings-owner");
    createdUserIds.push(owner.userId);
    for (const key of TOUCHED_KEYS) {
      const row = await prisma.setting.findUnique({ where: { key } });
      originalSettings[key] = row ? row.value : null;
    }
  });

  afterAll(async () => {
    for (const key of TOUCHED_KEYS) {
      const value = originalSettings[key];
      if (value === null) {
        await prisma.setting.deleteMany({ where: { key } });
      } else {
        await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
    }
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("lets staff read and update settings", async () => {
    const getRes = await owner.agent.get("/api/settings");
    expect(getRes.status).toBe(200);
    expect(getRes.body.settings).toHaveProperty("companyName");
    expect(getRes.body.settings).toHaveProperty("overheadProfitPercent");

    const updateRes = await owner.agent
      .patch("/api/settings")
      .send({ companyName: "บริษัททดสอบการตั้งค่า" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.settings.companyName).toBe("บริษัททดสอบการตั้งค่า");
  });

  it("exposes only public-safe keys on the public endpoint (no margin rates)", async () => {
    const res = await request(app).get("/api/public/settings");
    expect(res.status).toBe(200);
    expect(res.body.settings).toHaveProperty("companyName");
    expect(res.body.settings).not.toHaveProperty("overheadProfitPercent");
    expect(res.body.settings).not.toHaveProperty("vatPercent");
  });

  it("rejects a CUSTOMER reading or updating staff settings", async () => {
    const customer = await createAndLoginCustomer("test-settings-customer");
    const res = await customer.agent.get("/api/settings");
    expect(res.status).toBe(403);
    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  it("strips unknown keys so arbitrary Setting rows cannot be written", async () => {
    const res = await owner.agent
      .patch("/api/settings")
      .send({ companyName: "บริษัทกันคีย์แปลก", notARealKey: "evil", __proto__: "x" });
    expect(res.status).toBe(200);
    // คีย์นอก whitelist ต้องไม่ถูกเขียนลงตาราง Setting
    const injected = await prisma.setting.findUnique({ where: { key: "notARealKey" } });
    expect(injected).toBeNull();
  });

  it("rejects out-of-range percentage values", async () => {
    const tooHigh = await owner.agent.patch("/api/settings").send({ vatPercent: 200 });
    expect(tooHigh.status).toBe(400);
    const negative = await owner.agent.patch("/api/settings").send({ overheadProfitPercent: -5 });
    expect(negative.status).toBe(400);
  });

  it("อีเมลบริษัทต้องถูกรูปแบบ และขึ้นบนเว็บสาธารณะได้", async () => {
    const bad = await owner.agent.patch("/api/settings").send({ companyEmail: "info@awarin" });
    expect(bad.status).toBe(400);

    const ok = await owner.agent.patch("/api/settings").send({ companyEmail: "  info@awarin.co.th " });
    expect(ok.status).toBe(200);
    expect(ok.body.settings.companyEmail).toBe("info@awarin.co.th");

    const pub = await request(app).get("/api/public/settings");
    expect(pub.body.settings.companyEmail).toBe("info@awarin.co.th");
  });

  it("ผู้ลงนามและบัญชีรับเงินไม่หลุดไปที่ปลายทางสาธารณะ", async () => {
    const pub = await request(app).get("/api/public/settings");
    for (const key of ["companySignatoryName", "paymentAccountNo", "paymentBankName", "companyTaxId"]) {
      expect(pub.body.settings).not.toHaveProperty(key);
    }
  });

  it("ตรวจรูปแบบเลขที่บัญชีและพร้อมเพย์", async () => {
    const account = {
      paymentBankName: "ธนาคารกสิกรไทย",
      paymentAccountName: "บริษัท ทดสอบ จำกัด",
    };
    const nine = await owner.agent.patch("/api/settings").send({ ...account, paymentAccountNo: "123-4-5678-9" });
    expect(nine.status).toBe(400);
    const letters = await owner.agent.patch("/api/settings").send({ ...account, paymentAccountNo: "12345ABCDE" });
    expect(letters.status).toBe(400);
    const badPromptPay = await owner.agent
      .patch("/api/settings")
      .send({ ...account, paymentAccountNo: "123-4-56789-0", paymentPromptPay: "12345" });
    expect(badPromptPay.status).toBe(400);
  });

  it("บัญชีรับเงินต้องครบหรือว่างทั้งหมด — ตรวจจากสถานะหลังบันทึก ไม่ใช่เฉพาะช่องที่ส่งมา", async () => {
    // เริ่มจากว่างทั้งหมด
    await owner.agent.patch("/api/settings").send({
      paymentBankName: "",
      paymentBankBranch: "",
      paymentAccountName: "",
      paymentAccountNo: "",
      paymentPromptPay: "",
    });

    const onlyNumber = await owner.agent.patch("/api/settings").send({ paymentAccountNo: "1234567890" });
    expect(onlyNumber.status).toBe(400);
    expect(onlyNumber.body.error).toContain("ให้ครบ");

    const complete = await owner.agent.patch("/api/settings").send({
      paymentBankName: "ธนาคารกสิกรไทย",
      paymentAccountName: "บริษัท ทดสอบ จำกัด",
      paymentAccountNo: "123-4-56789-0",
    });
    expect(complete.status).toBe(200);

    // ส่งมาแค่ช่องเดียวเพื่อลบชื่อธนาคาร — ที่เหลือยังค้างอยู่ใน DB จึงต้องถูกปฏิเสธ
    const dropBank = await owner.agent.patch("/api/settings").send({ paymentBankName: "" });
    expect(dropBank.status).toBe(400);

    // ลูกค้าเห็นบัญชีในหน้าสัญญาของตัวเอง (ต้องล็อกอิน) แม้ยังไม่มีสัญญาสักฉบับ
    const customer = await createAndLoginCustomer("test-settings-payto");
    const mine = await customer.agent.get("/api/my/contracts");
    expect(mine.status).toBe(200);
    expect(mine.body.payTo).toEqual({
      bankName: "ธนาคารกสิกรไทย",
      branch: null,
      accountName: "บริษัท ทดสอบ จำกัด",
      accountNo: "123-4-56789-0",
      promptPay: null,
    });

    const cleared = await owner.agent.patch("/api/settings").send({
      paymentBankName: "",
      paymentAccountName: "",
      paymentAccountNo: "",
    });
    expect(cleared.status).toBe(200);
    expect((await customer.agent.get("/api/my/contracts")).body.payTo).toBeNull();
    await prisma.user.deleteMany({ where: { email: customer.email } });
  });

  describe("โลโก้บนเอกสาร", () => {
    const asset = (name: string) => fs.readFileSync(path.resolve(__dirname, "../../src/assets", name));
    const LARGE = asset("company-logo.png");
    const SMALL = asset("company-logo-small.png");

    /** PNG ที่มีแค่ header — พอให้ตัวตรวจอ่านขนาดที่ "ประกาศ" ไว้ (ตัวอันตรายคือขนาดที่ประกาศ) */
    function pngHeader(width: number, height: number): Buffer {
      const buf = Buffer.alloc(33);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
      buf.writeUInt32BE(13, 8);
      buf.write("IHDR", 12, "ascii");
      buf.writeUInt32BE(width, 16);
      buf.writeUInt32BE(height, 20);
      return buf;
    }

    it("ยังไม่เคยอัปโหลด = ใช้ไฟล์ตั้งต้น", async () => {
      await owner.agent.delete("/api/settings/logo");
      const res = await owner.agent.get("/api/settings/logo");
      expect(res.status).toBe(200);
      expect(res.body.custom).toBe(false);
      expect(res.body.logo).toBe(`data:image/png;base64,${LARGE.toString("base64")}`);
      // หน้าจอใช้โชว์ตัวอย่างตอนกด "กลับไปใช้โลโก้ตั้งต้น" ก่อนกดบันทึก
      expect(res.body.defaultLogo).toBe(`data:image/png;base64,${LARGE.toString("base64")}`);
    });

    it("อัปโหลด PNG สองขนาดแล้วเอกสารใช้รูปนั้น · กลับไปใช้ของเดิมได้", async () => {
      // สลับไฟล์เล็กกับใหญ่ของตั้งต้นให้ต่างจากค่าเริ่มต้น แต่ยังผ่านเพดานของแต่ละขนาด
      const res = await owner.agent
        .post("/api/settings/logo")
        .attach("logo", SMALL, { filename: "logo.png", contentType: "image/png" })
        .attach("logoSmall", SMALL, { filename: "logo-small.png", contentType: "image/png" });
      expect(res.status).toBe(200);
      expect(res.body.custom).toBe(true);
      expect(res.body.logo).toBe(`data:image/png;base64,${SMALL.toString("base64")}`);

      const { loadCompanyProfile } = await import("../../src/lib/company-profile");
      const profile = await loadCompanyProfile();
      expect(profile.logo).toBe(`data:image/png;base64,${SMALL.toString("base64")}`);
      expect(profile.logoSmall).toBe(`data:image/png;base64,${SMALL.toString("base64")}`);

      // รูปไม่ติดไปกับค่าตั้งปกติ (ทั้งหน้าตั้งค่าและทุกที่ที่อ่าน getSettingsMap)
      const all = await owner.agent.get("/api/settings");
      expect(all.body.settings).not.toHaveProperty("companyLogoPng");
      const { getSettingsMap } = await import("../../src/lib/settings");
      expect(await getSettingsMap()).not.toHaveProperty("companyLogoPng");

      const reset = await owner.agent.delete("/api/settings/logo");
      expect(reset.status).toBe(200);
      expect(reset.body.custom).toBe(false);
      expect(reset.body.logo).toBe(`data:image/png;base64,${LARGE.toString("base64")}`);
    });

    it("ปฏิเสธไฟล์ที่ไม่ใช่ PNG · ขนาดที่ประกาศใหญ่เกิน · ส่งมาไม่ครบสองขนาด", async () => {
      const svg = await owner.agent
        .post("/api/settings/logo")
        .attach("logo", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), {
          filename: "logo.svg",
          contentType: "image/svg+xml",
        })
        .attach("logoSmall", SMALL, { filename: "s.png", contentType: "image/png" });
      expect(svg.status).toBe(400);

      const huge = await owner.agent
        .post("/api/settings/logo")
        .attach("logo", pngHeader(20000, 20000), { filename: "big.png", contentType: "image/png" })
        .attach("logoSmall", SMALL, { filename: "s.png", contentType: "image/png" });
      expect(huge.status).toBe(400);
      expect(huge.body.error).toContain("20000×20000");

      const tallSmall = await owner.agent
        .post("/api/settings/logo")
        .attach("logo", LARGE, { filename: "l.png", contentType: "image/png" })
        .attach("logoSmall", pngHeader(64, 400), { filename: "s.png", contentType: "image/png" });
      expect(tallSmall.status).toBe(400);

      const onlyOne = await owner.agent
        .post("/api/settings/logo")
        .attach("logo", LARGE, { filename: "l.png", contentType: "image/png" });
      expect(onlyOne.status).toBe(400);

      expect((await owner.agent.get("/api/settings/logo")).body.custom).toBe(false);
    });

    it("ลูกค้าเปลี่ยนหรือดูโลโก้ผ่านปลายทางนี้ไม่ได้", async () => {
      const customer = await createAndLoginCustomer("test-settings-logo-customer");
      expect((await customer.agent.get("/api/settings/logo")).status).toBe(403);
      expect(
        (
          await customer.agent
            .post("/api/settings/logo")
            .attach("logo", LARGE, { filename: "l.png", contentType: "image/png" })
            .attach("logoSmall", SMALL, { filename: "s.png", contentType: "image/png" })
        ).status,
      ).toBe(403);
      expect((await customer.agent.delete("/api/settings/logo")).status).toBe(403);
      await prisma.user.deleteMany({ where: { email: customer.email } });
    });
  });

  it("partial update does not wipe other settings (rates preserved)", async () => {
    // ตั้งค่า rate ให้แน่ใจว่ามีค่าเดิมอยู่
    await owner.agent.patch("/api/settings").send({ overheadProfitPercent: 12, vatPercent: 7 });
    // แก้เฉพาะชื่อบริษัท — rate ต้องไม่ถูกเขียนทับเป็น 0 หรือหาย
    await owner.agent.patch("/api/settings").send({ companyName: "บริษัทเทสต์ partial" });
    const after = await owner.agent.get("/api/settings");
    expect(after.body.settings.overheadProfitPercent).toBe("12");
    expect(after.body.settings.vatPercent).toBe("7");
  });
});
