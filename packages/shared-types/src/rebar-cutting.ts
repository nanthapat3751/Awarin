/**
 * จัดวิธีตัดเหล็ก (Phase 3 ข้อ 3a) — ชิ้นที่ต้องตัดทั้งโครงการของเหล็กขนาดหนึ่ง จัดลงเหล็กเส้นยาวให้เศษน้อยที่สุด
 *
 * วิธี: First-Fit Decreasing — เรียงชิ้นยาวไปสั้น วางลงเส้นแรกที่ยังมีที่ว่างพอ ไม่มีเส้นไหนพอก็เปิดเส้นใหม่
 * ได้ผลไม่เกิน ~11/9 ของคำตอบที่ดีที่สุด และเร็วพอสำหรับหลายพันชิ้น (ระดับบ้านหนึ่งหลัง)
 *
 * - ชิ้นที่ยาวกว่าเหล็กเส้น (ทาบต่อแล้ว) แตกเป็นเส้นเต็มหลายเส้น + ชิ้นเศษท้าย — ระยะทาบรวมอยู่ในความยาวชิ้นแล้ว
 * - เศษที่เหลือต่อเส้น ≥ OFFCUT_KEEP_MIN = "เศษเก็บไว้ใช้" (ข้อ C) · สั้นกว่านั้น = เศษทิ้ง
 * - คิดเป็นมิลลิเมตรจำนวนเต็ม กันทศนิยมเครื่องทำให้ 3.3 + 3.3 + 3.4 ไม่ลง 10 พอดี
 * - ไม่หักรอยตัด (ตัดด้วยกรรไกร/เครื่องตัดเหล็ก ไม่กินเนื้อ)
 */

/** เศษที่ยาวตั้งแต่เท่านี้ (เมตร) เก็บไว้ใช้งานอื่นได้ — สั้นกว่านี้นับเป็นเศษทิ้ง */
export const OFFCUT_KEEP_MIN = 1;

/** ความยาวเหล็กเส้นที่เทียบให้ (เมตร) — ขายทั่วไปในไทย */
export const STOCK_LENGTH_OPTIONS = [10, 12] as const;

export interface CutRequest {
  /** ความยาวต่อชิ้น (ม.) — รวมระยะทาบแล้ว */
  length: number;
  count: number;
}

export interface CutPattern {
  /** จำนวนเส้นที่ตัดแบบนี้ */
  bars: number;
  /** ชิ้นที่ได้จากหนึ่งเส้น เรียงยาวไปสั้น */
  cuts: { length: number; count: number }[];
  /** เศษต่อเส้น (ม.) */
  leftover: number;
}

export interface CutPlan {
  stock: number;
  /** จำนวนเหล็กเส้นที่ต้องซื้อ */
  bars: number;
  /** ความยาวที่ใช้จริงรวม (ม.) */
  netLength: number;
  /** เศษทิ้งรวม (ม.) */
  scrap: number;
  /** เศษเก็บไว้ใช้รวม (ม.) — แต่ละเส้นเหลือ ≥ OFFCUT_KEEP_MIN */
  offcut: number;
  /** เศษทิ้ง ÷ ความยาวที่ซื้อ (%) */
  scrapPct: number;
  /**
   * เหลือรวม (เศษทิ้ง + เศษเก็บไว้) ÷ ความยาวที่ซื้อ (%) — ต้องแสดงคู่กับ scrapPct เสมอ:
   * เศษชิ้นใหญ่ที่ "เก็บไว้ใช้" ก็คือเหล็กที่ซื้อเกินงานนี้ ถ้าโชว์แค่เศษทิ้ง 0% จะดูเหมือนไม่เปลืองเลย
   */
  leftoverPct: number;
  patterns: CutPattern[];
}

const mm = (m: number) => Math.round(m * 1000);
const m3 = (v: number) => Math.round(v) / 1000;

/** แตกชิ้นที่ยาวกว่าเหล็กเส้น: เส้นเต็ม k เส้น + ชิ้นท้ายที่เหลือ (ถ้ามี) */
export function splitToStock(lengthMm: number, stockMm: number): { full: number; remainder: number } {
  const full = Math.floor(lengthMm / stockMm);
  return { full, remainder: lengthMm - full * stockMm };
}

/** First-Fit Decreasing — ชิ้นที่เรียงยาวไปสั้นแล้ว ลงเส้นแรกที่ยังเหลือพอ ไม่พอก็เปิดเส้นใหม่ */
function firstFitDecreasing(pieces: number[], stockMm: number): { free: number; cuts: number[] }[] {
  const bins: { free: number; cuts: number[] }[] = [];
  for (const p of pieces) {
    const bin = bins.find((b) => b.free >= p);
    if (bin) {
      bin.free -= p;
      bin.cuts.push(p);
    } else {
      bins.push({ free: stockMm - p, cuts: [p] });
    }
  }
  return bins;
}

export function cutPlan(requests: CutRequest[], stock: number, keepMin = OFFCUT_KEEP_MIN): CutPlan {
  const stockMm = mm(stock);
  const keepMm = mm(keepMin);
  let fullBars = 0;
  const pieces: number[] = [];
  for (const r of requests) {
    const len = mm(r.length);
    if (len <= 0 || r.count <= 0) continue;
    const { full, remainder } = splitToStock(len, stockMm);
    fullBars += full * r.count;
    for (let i = 0; i < r.count; i++) if (remainder > 0) pieces.push(remainder);
  }
  pieces.sort((a, b) => b - a);
  const bins = firstFitDecreasing(pieces, stockMm);

  // รวมเส้นที่ตัดแบบเดียวกันเป็นแบบเดียว
  const byPattern = new Map<string, CutPattern>();
  const add = (cuts: number[], free: number, n: number) => {
    const counts = new Map<number, number>();
    for (const c of cuts) counts.set(c, (counts.get(c) ?? 0) + 1);
    const sorted = [...counts].sort((a, b) => b[0] - a[0]);
    const key = sorted.map(([l, c]) => `${l}x${c}`).join(",");
    const cur = byPattern.get(key);
    if (cur) cur.bars += n;
    else byPattern.set(key, { bars: n, cuts: sorted.map(([l, c]) => ({ length: m3(l), count: c })), leftover: m3(free) });
  };
  if (fullBars > 0) add([stockMm], 0, fullBars);
  for (const b of bins) add(b.cuts, b.free, 1);

  const bars = fullBars + bins.length;
  const netMm = fullBars * stockMm + pieces.reduce((a, b) => a + b, 0);
  const scrapMm = bins.reduce((sum, b) => sum + (b.free < keepMm ? b.free : 0), 0);
  const offcutMm = bins.reduce((sum, b) => sum + (b.free >= keepMm ? b.free : 0), 0);
  const boughtMm = bars * stockMm;
  return {
    stock,
    bars,
    netLength: m3(netMm),
    scrap: m3(scrapMm),
    offcut: m3(offcutMm),
    scrapPct: boughtMm > 0 ? Math.round((scrapMm / boughtMm) * 1000) / 10 : 0,
    leftoverPct: boughtMm > 0 ? Math.round(((scrapMm + offcutMm) / boughtMm) * 1000) / 10 : 0,
    // เส้นที่ใช้หลายเส้นขึ้นก่อน (อ่านง่ายตอนสั่งช่างตัด)
    patterns: [...byPattern.values()].sort((a, b) => b.bars - a.bars || a.leftover - b.leftover),
  };
}

/**
 * เลือกความยาวเหล็กเส้นที่คุ้มสุด: ซื้อเหล็กน้อยกว่า (ความยาวรวมที่ซื้อ = น้ำหนัก) ชนะ
 * เท่ากัน → เศษทิ้งน้อยกว่า → เส้นสั้นกว่า (หาง่าย ขนง่าย)
 */
export function pickStock(plans: CutPlan[]): number {
  const best = [...plans].sort(
    (a, b) => a.bars * a.stock - b.bars * b.stock || a.scrap - b.scrap || a.stock - b.stock,
  )[0];
  return best?.stock ?? STOCK_LENGTH_OPTIONS[0];
}
