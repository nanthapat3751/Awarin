import { prisma } from "./prisma";

/**
 * รหัส BOQ ที่คนอ่านเข้าใจได้
 *
 * หมวดงานใช้ระบบเลขแบบเดียวกับเอกสาร BOQ จริง: ตัวอักษรสำหรับหมวดงานระดับบนสุด
 * แล้วตามด้วยเลขสองหลักต่อหนึ่งระดับที่ลึกลงไป
 *
 *   B          หมวดงานโครงสร้าง
 *   B-02       งานคอนกรีตโครงสร้าง
 *   B-02-01    คอนกรีตโครงสร้าง fc' 240
 *
 * ส่วนวัสดุใช้รหัสแคตตาล็อกแบบวิ่งเรียบ ๆ (MAT-0001) เพราะค้นด้วยรหัส ไม่ได้อ่านเป็นลำดับชั้น
 *
 * รหัสไม่ซ้ำกันในฐานข้อมูล ตัวสร้างทุกตัวด้านล่างจึงตรวจรหัสที่จะใช้ซ้ำอีกรอบ แล้วขยับไปข้างหน้า
 * เมื่อชนกัน -- เพราะพนักงานพิมพ์รหัสเองด้วยมือได้ ซึ่งไม่งั้นจะทำให้ลำดับที่ระบบสร้างกระโดด
 * ไปทับช่องที่มีคนใช้แล้ว
 */

const MATERIAL_CODE_PREFIX = "MAT-";
const MATERIAL_CODE_DIGITS = 4;
const CHILD_CODE_DIGITS = 2;
const MAX_COLLISION_STEPS = 500;

const TOP_CODE_PATTERN = /^[A-Z]+$/;

/** "A" -> 1, "Z" -> 26, "AA" -> 27 (เรียงแบบคอลัมน์สเปรดชีต) */
function lettersToNumber(code: string): number {
  return code.split("").reduce((acc, ch) => acc * 26 + ((ch.codePointAt(0) ?? 64) - 64), 0);
}

/** ฟังก์ชันผกผันของ lettersToNumber เพื่อให้ลำดับไม่หมดหลังจาก Z */
function numberToLetters(value: number): string {
  let n = value;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCodePoint(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || "A";
}

async function isCodeTaken(code: string): Promise<boolean> {
  const existing = await prisma.workCategory.findUnique({ where: { code }, select: { id: true } });
  return existing !== null;
}

/** รหัสระดับบนสุดตัวถัดไปที่ว่าง: A, B, ... Z, AA, ... */
export async function nextTopLevelCode(): Promise<string> {
  const rows = await prisma.workCategory.findMany({
    where: { level: "CATEGORY", code: { not: null } },
    select: { code: true },
  });

  const highest = rows.reduce((max, row) => {
    const code = row.code!;
    if (!TOP_CODE_PATTERN.test(code)) return max;
    return Math.max(max, lettersToNumber(code));
  }, 0);

  for (let step = 1; step <= MAX_COLLISION_STEPS; step += 1) {
    const candidate = numberToLetters(highest + step);
    if (!(await isCodeTaken(candidate))) return candidate;
  }
  throw new Error("ไม่สามารถสร้างรหัสหมวดงานใหม่ได้");
}

/**
 * รหัสลูกตัวถัดไปที่ว่างภายใต้ `parentCode` เช่น "B-02" แล้วต่อด้วย "B-02-01"
 * คืน null เมื่อ parent ไม่มีรหัสของตัวเอง -- เพราะไม่มีอะไรให้ต่อยอด
 */
export async function nextChildCode(parentId: string, parentCode: string | null): Promise<string | null> {
  if (!parentCode) return null;

  const siblings = await prisma.workCategory.findMany({
    where: { parentId, code: { not: null } },
    select: { code: true },
  });

  const prefix = `${parentCode}-`;
  const highest = siblings.reduce((max, row) => {
    const code = row.code!;
    if (!code.startsWith(prefix)) return max;
    const suffix = code.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) return max;
    return Math.max(max, Number(suffix));
  }, 0);

  for (let step = 1; step <= MAX_COLLISION_STEPS; step += 1) {
    const candidate = prefix + String(highest + step).padStart(CHILD_CODE_DIGITS, "0");
    if (!(await isCodeTaken(candidate))) return candidate;
  }
  return null;
}

/** เลือกตัวสร้างรหัสให้ถูกกับระดับที่กำลังสร้าง */
export async function generateCategoryCode(
  level: "CATEGORY" | "SUBGROUP" | "ITEM",
  parentId: string | null,
): Promise<string | null> {
  if (level === "CATEGORY") return nextTopLevelCode();
  if (!parentId) return null;

  const parent = await prisma.workCategory.findUnique({
    where: { id: parentId },
    select: { code: true },
  });
  if (!parent) return null;

  return nextChildCode(parentId, parent.code);
}

/** รหัสแคตตาล็อกตัวถัดไปที่ว่าง: MAT-0001, MAT-0002, ... */
export async function nextMaterialCode(): Promise<string> {
  const rows = await prisma.material.findMany({
    where: { code: { startsWith: MATERIAL_CODE_PREFIX } },
    select: { code: true },
  });

  const highest = rows.reduce((max, row) => {
    const suffix = row.code!.slice(MATERIAL_CODE_PREFIX.length);
    if (!/^\d+$/.test(suffix)) return max;
    return Math.max(max, Number(suffix));
  }, 0);

  for (let step = 1; step <= MAX_COLLISION_STEPS; step += 1) {
    const candidate =
      MATERIAL_CODE_PREFIX + String(highest + step).padStart(MATERIAL_CODE_DIGITS, "0");
    const taken = await prisma.material.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  throw new Error("ไม่สามารถสร้างรหัสวัสดุใหม่ได้");
}
