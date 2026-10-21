/** ตัวแปร {{ ... }} หนึ่งตัวในข้อความ — start/end เป็นตำแหน่งของทั้งก้อนรวมวงเล็บ · inner = ข้อความข้างใน (ยังไม่ตัดช่องว่าง) */
export interface VariableToken {
  start: number;
  end: number;
  inner: string;
}

/**
 * ทุก {{ ... }} ในข้อความตามลำดับ — ข้างในต้องมีอย่างน้อยหนึ่งตัวและไม่มี "}" (เหมือน /\{\{([^}]+)\}\}/g เดิมทุกกรณี)
 *
 * ใช้ร่วมกันทั้งเซิร์ฟเวอร์ (แทนค่าในสัญญา) และหน้าจอพนักงาน (ไฮไลต์ตัวแปร) — ถ้าจับไม่เหมือนกัน หน้าจอจะบอกว่าถูก
 * แต่เอกสารออกมาผิด · ไล่ทีละตัวแทน regex เดิมที่ย้อนลองแบบกำลังสองเมื่อเจอ "{{" ที่ไม่ปิดเรียงกันยาว ๆ
 */
export function scanVariableTokens(text: string): VariableToken[] {
  const out: VariableToken[] = [];
  let i = 0;
  for (;;) {
    const open = text.indexOf("{{", i);
    if (open < 0) break;
    const close = text.indexOf("}", open + 2);
    if (close < 0) break;
    if (close > open + 2 && text[close + 1] === "}") {
      out.push({ start: open, end: close + 2, inner: text.slice(open + 2, close) });
      i = close + 2;
    } else {
      // "{{" ที่อยู่ก่อน close − 1 ทุกตัวเจอ "}" ตัวเดียวกันและล้มแบบเดียวกัน — ข้ามไปเลย
      i = Math.max(open + 1, close - 1);
    }
  }
  return out;
}

/** แทนทุก {{ ... }} ด้วยผลของ fn (คืน whole = คงไว้ตามเดิม) */
export function replaceVariableTokens(text: string, fn: (whole: string, inner: string) => string): string {
  let out = "";
  let last = 0;
  for (const t of scanVariableTokens(text)) {
    out += text.slice(last, t.start) + fn(text.slice(t.start, t.end), t.inner);
    last = t.end;
  }
  return out + text.slice(last);
}
