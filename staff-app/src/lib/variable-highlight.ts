import { BLOCK_ONLY_IN_CLAUSE, type FieldMode, NO_VARIABLES_HERE } from "./variable-autocomplete";

/**
 * ไฮไลต์ตัวแปรในเนื้อสัญญา — ตรรกะล้วน แยกจากหน้าจอเพื่อให้ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์
 *
 * เดิมตัวแปรที่พิมพ์ผิดจะรู้ก็ต่อเมื่อกดบันทึกแล้ว (ขึ้นเป็น toast ทีหลัง) และตัวแปรที่อยู่ผิดช่อง
 * (ตารางในอารัมภบท / ตัวแปรในชื่อบนหน้าปก) ไม่มีใครเตือนเลย ทั้งที่ทั้งสองแบบพิมพ์วงเล็บดิบลงสัญญาจริง
 */

/** ต้องตรงกับ VARIABLE_PATTERN ฝั่งเซิร์ฟเวอร์ — ถ้าจับไม่เหมือนกัน หน้าจอจะบอกว่าถูกแต่เอกสารออกมาผิด
 * (จับทั้งก้อนใน {{ }} แล้วตัดช่องว่างหัวท้ายด้วย tokenName — regex แบบ \s* ครอบกลุ่ม lazy ย้อนรอยยาว) */
const TOKEN = /\{\{([^}]+)\}\}/g;

/** ชื่อตัวแปรใน {{ ... }} · ข้างในเป็นช่องว่างล้วน = คงไว้ตามเดิม (นับเป็นตัวแปรที่ไม่รู้จัก) */
function tokenName(inner: string): string {
  return inner.trim() || inner;
}

export type SegmentKind =
  /** ข้อความธรรมดา */
  | "text"
  /** ตัวแปรที่จะถูกแทนค่า */
  | "var"
  /** บล็อกตารางในช่องที่วาดตารางได้ */
  | "block"
  /** ชื่อที่ระบบไม่รู้จัก (พิมพ์ผิด) — จะพิมพ์ออกมาทั้งวงเล็บ */
  | "unknown"
  /** รู้จัก แต่อยู่ผิดช่อง — จะพิมพ์ออกมาทั้งวงเล็บเหมือนกัน */
  | "misplaced";

export interface Segment {
  text: string;
  kind: SegmentKind;
}

export interface Vocabulary {
  variables: string[];
  blocks: string[];
}

function classify(name: string, vocab: Vocabulary, mode: FieldMode): SegmentKind {
  const isVar = vocab.variables.includes(name);
  const isBlock = vocab.blocks.includes(name);
  if (!isVar && !isBlock) return "unknown";
  if (mode === "none") return "misplaced";
  if (isBlock) return mode === "varsAndBlocks" ? "block" : "misplaced";
  return "var";
}

/** แบ่งข้อความเป็นช่วง ๆ — ต่อกลับแล้วต้องได้ข้อความเดิมทุกตัวอักษร (ไม่งั้นไฮไลต์เลื่อนจากตัวหนังสือจริง) */
export function segmentVariables(text: string, vocab: Vocabulary, mode: FieldMode): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), kind: "text" });
    out.push({ text: m[0], kind: classify(tokenName(m[1]), vocab, mode) });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), kind: "text" });
  return out;
}

/** ระยะแก้ไข (Levenshtein) — ภาษาไทยนับสระ/วรรณยุกต์เป็นหนึ่งตัว จึงจับ "ผู้วาจ้าง" ขาดไม้เอกได้ที่ระยะ 1 */
function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/**
 * ชื่อที่น่าจะตั้งใจพิมพ์ — เสนอเฉพาะเมื่อต่างกันไม่เกิน 2 ตัวอักษร
 * (ห่างกว่านั้นคือเดา และการเดาผิดแล้วโชว์ว่า "หมายถึงอันนี้ใช่ไหม" แย่กว่าไม่เสนอเลย)
 */
export function closestName(name: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const c of candidates) {
    const d = editDistance(name, c);
    if (d < bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  return bestDistance <= 2 ? best : null;
}

/** ข้อความเตือนใต้ช่อง — หนึ่งบรรทัดต่อหนึ่งโทเคนที่มีปัญหา (โทเคนเดียวกันซ้ำหลายที่ เตือนครั้งเดียว) */
export function fieldProblems(segments: Segment[], vocab: Vocabulary, mode: FieldMode): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of segments) {
    if ((seg.kind !== "unknown" && seg.kind !== "misplaced") || seen.has(seg.text)) continue;
    seen.add(seg.text);
    const name = tokenName(seg.text.slice(2, -2));
    if (seg.kind === "misplaced") {
      out.push(`${seg.text} ${mode === "none" ? NO_VARIABLES_HERE : BLOCK_ONLY_IN_CLAUSE}`);
      continue;
    }
    // "{{มูลค่าสัญญา{{วันที่ทำสัญญา}}" — ลืมปิดตัวแรก ตัวที่ตามมาเลยถูกกลืนเป็นก้อนเดียว
    // (เซิร์ฟเวอร์จับแบบเดียวกัน) ทั้งก้อนพิมพ์ออกมาดิบ รวมตัวที่พิมพ์ถูกด้วย — ต้องบอกสาเหตุนี้ตรง ๆ
    // ไม่งั้น "ไม่มีในระบบ" ทำให้คนไปไล่หาคำผิดในตัวแปรที่จริง ๆ สะกดถูกอยู่แล้ว
    if (name.includes("{{")) {
      const opened = name.slice(0, name.indexOf("{{")).trim();
      out.push(
        `{{${opened} ยังไม่ได้ปิดด้วย }} — ตัวแปรที่ตามมาถูกกลืนไปด้วย ทั้งก้อนจะพิมพ์ออกมาทั้งวงเล็บ`,
      );
      continue;
    }
    const suggestion = closestName(name, [...vocab.variables, ...vocab.blocks]);
    out.push(
      suggestion
        ? `${seg.text} ไม่มีในระบบ — หมายถึง {{${suggestion}}} ใช่ไหม? ถ้าไม่แก้จะพิมพ์ออกมาทั้งวงเล็บ`
        : `${seg.text} ไม่มีในระบบ — จะพิมพ์ออกมาทั้งวงเล็บ`,
    );
  }
  return out;
}
