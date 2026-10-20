/**
 * ย่อรูปก่อนอัปโหลด (แบบบ้าน · ผลงาน) — เซิร์ฟเวอร์รับไม่เกิน 5 MB แต่รูปจากกล้อง/มือถือ/ไฟล์เรนเดอร์
 * มักใหญ่ 6-15 MB ผู้ใช้เลยอัปไม่ได้ (17 ต.ค.) · ย่อที่เบราว์เซอร์ให้ด้านยาวไม่เกิน PHOTO_MAX_EDGE แล้วบันทึกเป็น JPEG
 *
 * - รูปเล็กอยู่แล้ว (ไฟล์ ≤ KEEP_BYTES และด้านยาวไม่เกินเพดาน) ส่งไฟล์เดิม ไม่บีบซ้ำให้เสียคุณภาพ
 * - PNG ที่มีพื้นโปร่งใส ถูกเทพื้นขาวตอนเป็น JPEG — รูปแบบบ้าน/ผลงานเป็นภาพถ่ายหรือเรนเดอร์ ไม่ใช่โลโก้
 * - 2560 px พอสำหรับภาพเต็มจอบนเว็บลูกค้า (แกลเลอรีแสดงกว้างสุดราว 1600 px)
 */

export const PHOTO_MAX_EDGE = 2560;
const KEEP_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.85;
/** เพดานไฟล์ที่ยอมเปิดในเบราว์เซอร์ก่อนย่อ — ใหญ่กว่านี้มักไม่ใช่รูปถ่ายธรรมดา และกินหน่วยความจำ */
export const PHOTO_INPUT_MAX_BYTES = 40 * 1024 * 1024;

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("แปลงรูปไม่สำเร็จ"))), "image/jpeg", JPEG_QUALITY);
  });
}

/** โยน Error ข้อความไทยพร้อมแสดง ถ้าไฟล์ใช้ไม่ได้ */
export async function preparePhoto(file: File): Promise<File> {
  if (file.size > PHOTO_INPUT_MAX_BYTES) {
    throw new Error(`${file.name}: ไฟล์ใหญ่เกิน ${PHOTO_INPUT_MAX_BYTES / 1024 / 1024} MB`);
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: เปิดไฟล์รูปนี้ไม่ได้ — ลองบันทึกเป็น JPG หรือ PNG ใหม่`);
  }
  try {
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (file.size <= KEEP_BYTES && longEdge <= PHOTO_MAX_EDGE) return file;

    const scale = Math.min(1, PHOTO_MAX_EDGE / longEdge);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    // JPEG ไม่มีพื้นโปร่งใส — เทขาวก่อน ไม่งั้นส่วนโปร่งใสของ PNG กลายเป็นดำ
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await toJpeg(canvas);
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
