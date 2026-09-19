import fs from "node:fs";
import path from "node:path";

// อ้างอิงจาก process.cwd() (โฟลเดอร์ราก package server ทั้งตอนรันด้วย `tsx` dev และ
// `node dist/server.js`) เพราะ src/assets เป็น static asset ไม่ใช่ผลลัพธ์ที่ถูก compile
const FONT_DIR = path.resolve(process.cwd(), "src/assets/fonts");

export function loadSarabunRegular(): Uint8Array {
  return fs.readFileSync(path.join(FONT_DIR, "Sarabun-Regular.ttf"));
}

export function loadSarabunBold(): Uint8Array {
  return fs.readFileSync(path.join(FONT_DIR, "Sarabun-Bold.ttf"));
}

let cachedFontFaceCss: string | null = null;

/**
 * กฎ @font-face ที่ฝังฟอนต์เป็น base64 data URI เพื่อให้ HTML สมบูรณ์ในตัวเอง (ไม่ต้องโหลดไฟล์นอก)
 *
 * ต้องเป็น Sarabun ชุดเต็ม (ไทย + ละติน + ตัวเลข + เครื่องหมายวรรคตอน) เท่านั้น —
 * ของเดิมเป็นไฟล์ .woff ที่ถูกตัดเหลือแต่กลุ่มอักษรไทย 12KB ตัวเลข/เครื่องหมาย/อังกฤษ
 * จึงตกไปใช้ฟอนต์เริ่มต้นของ Chrome ทำให้ในเอกสารตัวเลข (เช่น มูลค่าสัญญา เลขที่เอกสาร วันที่
 * เบอร์โทร) เป็นคนละฟอนต์กับข้อความไทยรอบ ๆ อย่างเห็นได้ชัด
 * วิธีตรวจซ้ำ: วัดความกว้างข้อความเมื่อสั่ง font-family เป็น Sarabun เทียบกับชื่อฟอนต์ที่ไม่มีจริง
 * ถ้าได้เท่ากันแปลว่ากลุ่มอักขระนั้นไม่ได้ใช้ Sarabun
 */
export function sarabunFontFaceCss(): string {
  if (!cachedFontFaceCss) {
    const regular = Buffer.from(loadSarabunRegular()).toString("base64");
    const bold = Buffer.from(loadSarabunBold()).toString("base64");
    cachedFontFaceCss = `
      @font-face {
        font-family: "Sarabun";
        src: url(data:font/ttf;base64,${regular}) format("truetype");
        font-weight: 400;
      }
      @font-face {
        font-family: "Sarabun";
        src: url(data:font/ttf;base64,${bold}) format("truetype");
        font-weight: 700;
      }
    `;
  }
  return cachedFontFaceCss;
}
