import sharp, { type OutputInfo } from "sharp";

/**
 * ทำรูปลายเซ็นให้พร้อมวางบนเอกสาร — ใช้ทางเดียวกันทั้งที่ "วาด" และ "ถ่ายรูปลายเซ็นบนกระดาษ"
 *
 * 1. วางบนพื้นขาวก่อน (ภาพวาดที่โปร่งใสอยู่แล้วกับรูปถ่ายจะได้ผ่านขั้นเดียวกัน)
 * 2. ความโปร่งใสมาจาก "ความเข้ม" ของแต่ละจุด: กระดาษ/เงาจาง ๆ หายไป หมึกทึบ ขอบหมึกไล่ระดับนุ่ม
 *    สีหมึกเดิมยังอยู่ (ปากกาน้ำเงินยังเป็นน้ำเงิน) — ไม่แปลงเป็นดำล้วน
 * 3. ตัดขอบให้ชิดหมึก แล้วย่อให้อยู่ในกรอบที่ PDF ใช้
 *
 * รูปที่ได้เป็นไฟล์ใหม่ทั้งหมด ไม่มี EXIF และไม่มีอะไรจากไฟล์ต้นทางติดมานอกจากพิกเซล
 */

/** ขนาดสูงสุดที่เก็บ — ช่องลายเซ็นใน PDF กว้างราว 5 ซม. เผื่อความคมตอนพิมพ์ */
export const SIGNATURE_MAX = { width: 600, height: 200 };
/** สว่างกว่านี้ = กระดาษ (โปร่งใสทั้งหมด) · มืดกว่า INK = หมึกทึบเต็มที่ · ระหว่างนั้นไล่ระดับ */
const PAPER_LUMA = 200;
const INK_LUMA = 110;
/** หมึกที่เหลือหลังตัดพื้นต้องมีอย่างน้อยเท่านี้ ไม่งั้นถือว่าไม่มีลายเซ็นในรูป (รูปว่าง/รูปอื่น) */
const MIN_INK_PIXELS = 150;

export class SignatureImageError extends Error {}

function alphaFromLuma(luma: number): number {
  if (luma >= PAPER_LUMA) return 0;
  if (luma <= INK_LUMA) return 255;
  return Math.round(((PAPER_LUMA - luma) / (PAPER_LUMA - INK_LUMA)) * 255);
}

export async function normalizeSignature(input: Buffer): Promise<Buffer> {
  let raw: { data: Buffer; info: OutputInfo };
  try {
    raw = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .flatten({ background: "#ffffff" })
      // รูปถ่ายจากมือถือใหญ่มาก ย่อก่อนไล่ทีละพิกเซล (ลายเซ็นไม่ต้องการความละเอียดขนาดนั้น)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new SignatureImageError("อ่านไฟล์รูปนี้ไม่ได้ — ลองใช้ไฟล์ JPG หรือ PNG");
  }

  const { width, height } = raw.info;
  const rgba = Buffer.alloc(width * height * 4);
  let inkPixels = 0;
  for (let i = 0, j = 0; i < raw.data.length; i += 3, j += 4) {
    const r = raw.data[i];
    const g = raw.data[i + 1];
    const b = raw.data[i + 2];
    const alpha = alphaFromLuma(0.299 * r + 0.587 * g + 0.114 * b);
    rgba[j] = r;
    rgba[j + 1] = g;
    rgba[j + 2] = b;
    rgba[j + 3] = alpha;
    if (alpha > 128) inkPixels++;
  }
  if (inkPixels < MIN_INK_PIXELS) {
    throw new SignatureImageError("ไม่พบลายเซ็นในรูป — เซ็นด้วยปากกาสีเข้มบนกระดาษขาว แล้วถ่ายให้ชัด");
  }

  // trim ต้องทำเป็นขั้นแยก: sharp ประมวลผล resize ก่อน trim ถ้าเขียนต่อกันในท่อเดียว
  const trimmed = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
    .png()
    .toBuffer();
  return sharp(trimmed)
    .resize({ ...SIGNATURE_MAX, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export function signatureDataUrl(png: Buffer | Uint8Array | null | undefined): string | null {
  return png ? `data:image/png;base64,${Buffer.from(png).toString("base64")}` : null;
}
