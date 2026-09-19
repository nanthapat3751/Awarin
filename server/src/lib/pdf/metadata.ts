import { PDFDocument } from "pdf-lib";

/**
 * เขียน "ชื่อเอกสาร" ลงใน metadata ของไฟล์ PDF
 *
 * ทำไมต้องมี: Chrome ที่เราใช้สร้าง PDF (`page.pdf()`) **ไม่เขียน metadata ให้เลย** — ไฟล์ที่ได้
 * ไม่มีแม้แต่ `/Info` dictionary (ตรวจแล้ว ใส่ `<title>` ในเทมเพลตก็ไม่ช่วย) ผลคือแถบของตัวอ่าน PDF
 * ในเบราว์เซอร์ไม่มีชื่อจะแสดง เลยขึ้นเป็นที่อยู่ของ blob หรือ "about:blank" และในโปรแกรมอ่าน PDF
 * อื่น ๆ ช่อง "คุณสมบัติเอกสาร → ชื่อเรื่อง" ก็ว่างเปล่า
 *
 * พอเขียน `/Title` ลงไป **ชื่อจะติดไปกับตัวไฟล์ตลอด** ลูกค้าดาวน์โหลดไปเปิดในมือถือหรือส่งต่อ
 * ทางอีเมลก็ยังรู้ว่าเป็นเอกสารใบไหนของโครงการไหน (ต่างจากการตั้งชื่อแท็บฝั่งเว็บ ซึ่งหายไปทันที
 * ที่ไฟล์ออกจากระบบเรา — ดู staff-app/src/lib/document-pdf.ts)
 */
export interface PdfMetadata {
  /** ชื่อที่ตัวอ่าน PDF เอาไปแสดงบนแถบ เช่น "BOQ QT-2026-0342 · บ้านพักอาศัย 2 ชั้น" */
  title: string;
  /** ผู้ออกเอกสาร = ชื่อบริษัท */
  author?: string;
  /** บรรทัดขยายความ เช่น เลขที่และชื่อโครงการ */
  subject?: string;
}

export async function applyPdfMetadata(
  bytes: Uint8Array,
  meta: PdfMetadata,
): Promise<Uint8Array> {
  try {
    // updateMetadata:false กัน pdf-lib เขียน Producer/ModDate ของตัวเองทับ — เราตั้งเองทั้งหมด
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    doc.setTitle(meta.title);
    if (meta.author) doc.setAuthor(meta.author);
    if (meta.subject) doc.setSubject(meta.subject);
    // useObjectStreams:false บังคับให้ /Info เป็นอ็อบเจกต์ปกติที่อ่านได้ตรง ๆ ไม่ถูกยัดเข้าไป
    // ในสตรีมที่บีบอัด — ตัวอ่าน PDF บางตัวอ่านจากสตรีมไม่เจอ แลกกับไฟล์ใหญ่ขึ้นเล็กน้อย
    return await doc.save({ useObjectStreams: false });
  } catch (err) {
    // ชื่อเอกสารเป็นของประกอบ ไม่ใช่เนื้อหา — ถ้าเขียน metadata ไม่สำเร็จต้องยังส่งไฟล์ให้ผู้ใช้ได้
    // แต่ต้อง log ไว้ ไม่งั้นชื่อจะหายเงียบ ๆ โดยไม่มีใครรู้
    console.error("ใส่ชื่อเอกสารลง PDF ไม่สำเร็จ ส่งไฟล์ต้นฉบับแทน:", err);
    return bytes;
  }
}
