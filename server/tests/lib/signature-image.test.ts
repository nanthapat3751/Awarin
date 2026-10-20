import sharp from "sharp";

import { normalizeSignature, SIGNATURE_MAX, SignatureImageError } from "../../src/lib/signature-image";

/** "รูปถ่ายลายเซ็น": กระดาษขาวอมเทา (เหมือนถ่ายใต้ไฟห้อง) ใหญ่ มีเส้นหมึกน้ำเงินกลางภาพ */
async function paperPhoto(): Promise<Buffer> {
  const stroke = await sharp({
    create: { width: 900, height: 120, channels: 3, background: { r: 20, g: 40, b: 150 } },
  })
    .png()
    .toBuffer();
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 232, g: 230, b: 226 } } })
    .composite([{ input: stroke, top: 940, left: 1050 }])
    .jpeg()
    .toBuffer();
}

describe("normalizeSignature", () => {
  it("removes the paper, keeps the ink colour, and crops tight to the ink", async () => {
    const out = await normalizeSignature(await paperPhoto());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    // รูป 3000 px ถูกย่อเหลือ 1600 ก่อน → เส้นหมึก 900×120 เหลือ 480×64 · ตัดชิดหมึกแล้วไม่ขยายกลับ
    // ±2 px: การย่อภาพทำให้ขอบหมึกมีแถวจาง ๆ เพิ่มมาหนึ่งแถว
    expect(Math.abs(meta.width! - 480)).toBeLessThanOrEqual(2);
    expect(Math.abs(meta.height! - 64)).toBeLessThanOrEqual(2);
    expect(meta.width).toBeLessThanOrEqual(SIGNATURE_MAX.width);

    const { data } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    // จุดกลางภาพเป็นหมึกน้ำเงินทึบ ไม่ใช่ดำ
    const mid = (Math.floor(meta.height! / 2) * meta.width! + Math.floor(meta.width! / 2)) * 4;
    expect(data[mid + 3]).toBe(255);
    expect(data[mid + 2]).toBeGreaterThan(data[mid]);
  });

  it("makes a drawn signature on a transparent canvas usable too", async () => {
    const drawn = await sharp({
      create: { width: 800, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        {
          input: await sharp({ create: { width: 400, height: 40, channels: 4, background: "#111111" } })
            .png()
            .toBuffer(),
          top: 130,
          left: 200,
        },
      ])
      .png()
      .toBuffer();
    const meta = await sharp(await normalizeSignature(drawn)).metadata();
    expect(meta).toMatchObject({ width: 400, height: 40, hasAlpha: true });
  });

  it("rejects a blank page and a non-image", async () => {
    const blank = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#ffffff" } })
      .png()
      .toBuffer();
    await expect(normalizeSignature(blank)).rejects.toThrow(SignatureImageError);
    await expect(normalizeSignature(Buffer.from("<svg onload=alert(1)>"))).rejects.toThrow(SignatureImageError);
  });
});
