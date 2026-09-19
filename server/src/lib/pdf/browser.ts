import type { Browser } from "puppeteer";

import { applyPdfMetadata, type PdfMetadata } from "./metadata";

// การเปิด Chromium แบบ headless มีต้นทุนสูง (~1-2 วินาที) จึงเก็บไว้ตัวเดียวตลอดอายุ
// ของ process แทนที่จะเปิดใหม่ทุก request เอนจินข้อความของ Chromium ทำ Unicode shaping
// เต็มรูปแบบ ซึ่งคือเหตุผลที่วิธีนี้เชื่อถือได้กับสระ/วรรณยุกต์ไทย — ไลบรารี PDF ที่จัดวาง
// glyph เองไม่สามารถรับประกันเรื่องนี้ได้
//
// entry ของแพ็กเกจ puppeteer เป็น ESM อย่างเดียว การ `import` แบบ static จะทำให้ตัวรัน
// เทสต์ CJS ของ ts-jest พัง ("Unexpected token 'export'") การใช้ `import()` แบบ dynamic
// เลี่ยงปัญหานี้ได้ เพราะ Node (และ module loader ของ Jest) โหลด dependency ESM ตามต้องการ
// จากโค้ด CJS ได้
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const { default: puppeteer } = await import("puppeteer");
    browserPromise = puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  }
  return browserPromise;
}

/**
 * แถบหัว/ท้ายที่ Chrome วาดซ้ำให้ทุกหน้าในขอบกระดาษ
 *
 * ข้อควรระวัง: เทมเพลตพวกนี้ถูกเรนเดอร์ในเอกสารแยกต่างหาก **ไม่รับ CSS หรือฟอนต์จากตัวหน้า
 * เอกสาร** ฉะนั้นต้องฝัง @font-face และกำหนด font-size เองในเทมเพลต (ค่าเริ่มต้นของ Chrome
 * คือ 0 จะมองไม่เห็นอะไรเลย) — ดู `documentChrome()` ใน letterhead.ts
 */
export interface PdfChrome {
  headerTemplate: string;
  footerTemplate: string;
  /** ต้องเผื่อขอบบน/ล่างให้พอวางแถบ ไม่งั้นแถบจะถูกตัด */
  margin: { top: string; bottom: string; left: string; right: string };
}

/**
 * `meta` = ชื่อเอกสารที่จะฝังลงไฟล์ ต้องทำหลัง page.pdf() เสมอ เพราะ Chrome ไม่เขียน metadata
 * ให้เลย (ใส่ <title> ในเทมเพลตก็ไม่ช่วย — ตรวจแล้ว) ดู metadata.ts
 */
export async function renderHtmlToPdf(
  html: string,
  chrome?: PdfChrome,
  meta?: PdfMetadata,
): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  let bytes: Uint8Array;
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");
    bytes = chrome
      ? await page.pdf({
          format: "a4",
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: chrome.headerTemplate,
          footerTemplate: chrome.footerTemplate,
          margin: chrome.margin,
        })
      : await page.pdf({ format: "a4", printBackground: true });
  } finally {
    await page.close();
  }
  return meta ? applyPdfMetadata(bytes, meta) : bytes;
}

export async function closePdfBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
}
