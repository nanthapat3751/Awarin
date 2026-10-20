import { LOGO_KEYS } from "./company-logo";
import { prisma } from "./prisma";

/**
 * ค่าตั้งทั้งหมดแบบข้อความ — ไม่รวมโลโก้ (รูปหลายสิบ KB ที่ต้องใช้แค่ตอนพิมพ์เอกสาร อ่านผ่าน
 * getCompanyLogos แทน ไม่งั้นทุกคำขอที่แค่อยากรู้ชื่อบริษัทหรืออัตรา VAT จะลากรูปติดไปด้วย)
 */
export async function getSettingsMap(): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany({ where: { key: { notIn: LOGO_KEYS } } });
  return Object.fromEntries(settings.map((s) => [s.key, s.value]));
}

/**
 * เงินประกันผลงานตั้งต้นของสัญญาใหม่ (%) — ค่าว่าง = ไม่มีเงินประกันผลงาน
 *
 * ไม่มีค่า fallback: สัญญาบ้านพักอาศัยเอกชนจำนวนมากไม่มีข้อนี้ การเดา 5% ให้แล้วพิมพ์ลงสัญญา
 * คือการเขียนเงื่อนไขที่ไม่มีใครตกลงไว้
 */
export async function getDefaultRetentionPct(): Promise<number | null> {
  const row = await prisma.setting.findUnique({ where: { key: "retentionPercent" } });
  const pct = row && row.value !== "" ? Number(row.value) : null;
  return pct != null && Number.isFinite(pct) && pct > 0 ? pct : null;
}

/**
 * อัตราระดับบริษัท พร้อมค่า fallback เดียวกับที่ใช้ตอนคิดราคา
 *
 * `overheadProfitPct` คืออัตรารวมที่คุมราคา ส่วน `overheadPct` บอกว่าในก้อนรวมนั้นส่วนไหน
 * เป็นค่าดำเนินการ — **null = บริษัทยังไม่ได้ตั้งว่าจะแบ่งยังไง** ไม่ใช่ "ค่าดำเนินการเป็นศูนย์"
 * จึงไม่มีค่า fallback ให้ (เดาแทนคนไม่ได้ ตัวเลขนี้เป็นการตัดสินใจทางธุรกิจ)
 */
export async function getDefaultRates(): Promise<{
  overheadProfitPct: number;
  overheadPct: number | null;
  vatPct: number;
}> {
  const [overheadProfit, overhead, vat] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "overheadProfitPercent" } }),
    prisma.setting.findUnique({ where: { key: "overheadPercent" } }),
    prisma.setting.findUnique({ where: { key: "vatPercent" } }),
  ]);
  const overheadProfitPct = overheadProfit ? Number(overheadProfit.value) : 10;
  const overheadPct = overhead && overhead.value !== "" ? Number(overhead.value) : null;
  return {
    overheadProfitPct,
    // กันค่าที่ตั้งไว้เพี้ยนจนมากกว่าก้อนรวม (เช่นแก้ค่ารวมลงทีหลัง) — ถือว่ายังไม่ได้แยกดีกว่า
    // ปล่อยให้กำไรติดลบตั้งแต่โครงการยังไม่เริ่ม
    overheadPct:
      overheadPct != null && Number.isFinite(overheadPct) && overheadPct <= overheadProfitPct
        ? overheadPct
        : null,
    vatPct: vat ? Number(vat.value) : 7,
  };
}
