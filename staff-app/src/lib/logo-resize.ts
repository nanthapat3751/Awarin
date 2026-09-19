/**
 * ย่อโลโก้เป็น PNG สองขนาดก่อนส่งขึ้นเซิร์ฟเวอร์
 *
 * เซิร์ฟเวอร์ไม่มีตัวย่อรูป และ PDF ทุกใบฝังโลโก้ลงไปตรง ๆ — ไฟล์ต้นฉบับ 300 KB จะทำให้เอกสาร
 * ทุกใบบวมตาม (แถบท้ายกระดาษวาดโลโก้ซ้ำทุกหน้าด้วย) จึงย่อที่เบราว์เซอร์ให้เท่าที่พิมพ์จริง:
 *   ใหญ่ ≤ 240×130 — หัวจดหมายแสดงในกรอบ 96×52 (คมราว 2.5 เท่าตอนพิมพ์)
 *   เล็ก สูง ≤ 34   — แถบท้ายทุกหน้าแสดงสูง 13px
 * ได้ PNG เสมอเพื่อเก็บพื้นโปร่งใสไว้ (JPG ที่ส่งเข้ามาก็กลายเป็น PNG พื้นทึบตามเดิม)
 */

export const LOGO_LARGE_BOX = { width: 240, height: 130 };
export const LOGO_SMALL_BOX = { width: 160, height: 34 };
export const LOGO_INPUT_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const LOGO_INPUT_MAX_BYTES = 5 * 1024 * 1024;

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("แปลงรูปไม่สำเร็จ"))), "image/png");
  });
}

/**
 * ย่อทีละครึ่งจนใกล้ขนาดเป้าหมาย แล้วค่อยย่อครั้งสุดท้าย — ย่อทีเดียวจาก 2000px ลง 240px
 * เส้นบาง ๆ ในโลโก้ (ตัวอักษรเล็ก เส้นขอบ) จะแตกเป็นหยัก ๆ
 */
async function fitInto(source: ImageBitmap, box: { width: number; height: number }): Promise<Blob> {
  const scale = Math.min(1, box.width / source.width, box.height / source.height);
  const targetW = Math.max(1, Math.round(source.width * scale));
  const targetH = Math.max(1, Math.round(source.height * scale));

  let current: CanvasImageSource = source;
  let w = source.width;
  let h = source.height;
  while (w / 2 >= targetW && h / 2 >= targetH) {
    const half = document.createElement("canvas");
    half.width = Math.round(w / 2);
    half.height = Math.round(h / 2);
    const ctx = half.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, half.width, half.height);
    current = half;
    w = half.width;
    h = half.height;
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, 0, 0, targetW, targetH);
  return toBlob(canvas);
}

export interface ResizedLogo {
  large: Blob;
  small: Blob;
}

/** โยน Error ที่มีข้อความภาษาไทยพร้อมแสดงถ้าไฟล์ใช้ไม่ได้ */
export async function resizeLogo(file: File): Promise<ResizedLogo> {
  if (!LOGO_INPUT_TYPES.includes(file.type)) {
    throw new Error("รองรับเฉพาะไฟล์ PNG, JPG หรือ WEBP");
  }
  if (file.size > LOGO_INPUT_MAX_BYTES) {
    throw new Error("ไฟล์ใหญ่เกิน 5 MB");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("เปิดไฟล์รูปนี้ไม่ได้ — ลองบันทึกเป็น PNG ใหม่อีกครั้ง");
  }
  try {
    return {
      large: await fitInto(bitmap, LOGO_LARGE_BOX),
      small: await fitInto(bitmap, LOGO_SMALL_BOX),
    };
  } finally {
    bitmap.close();
  }
}
