/**
 * สคริปต์เติมข้อมูลย้อนหลังแบบครั้งเดียว สำหรับรหัสงาน BOQ และรหัสแคตตาล็อกวัสดุที่เพิ่มเข้ามา
 * โดย migration 20260723090000_add_work_and_material_codes
 *
 * ทำซ้ำได้ปลอดภัย (idempotent): แถวที่มีรหัสอยู่แล้วจะไม่ถูกแตะ และเลขของมันจะถูกนับว่าใช้ไปแล้ว
 * เพื่อไม่ให้การรันซ้ำสร้างรหัสซ้ำ รันกับฐานข้อมูลที่เติมไปบางส่วนแล้วก็ปลอดภัย
 *
 *   npx tsx prisma/backfill-codes.ts            # ลงมือเติมจริง
 *   npx tsx prisma/backfill-codes.ts --dry-run  # ดูตัวอย่างอย่างเดียว
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const CHILD_CODE_DIGITS = 2;
const MATERIAL_CODE_PREFIX = "MAT-";
const MATERIAL_CODE_DIGITS = 4;

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

function lettersToNumber(code: string): number {
  return code.split("").reduce((acc, ch) => acc * 26 + ((ch.codePointAt(0) ?? 64) - 64), 0);
}

interface Node {
  id: string;
  parentId: string | null;
  level: string;
  code: string | null;
  name: string;
  sortOrder: number;
}

/** ลำดับที่คงที่และคนเข้าใจได้ สำหรับใช้ไล่ให้รหัสแบบเรียงลำดับ */
function bySortOrderThenName(a: Node, b: Node): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name, "th");
}

type CodeUpdate = { id: string; code: string };

/** เลขถัดไปที่ยังไม่ถูกใช้ — make(n) สร้างรหัสจากเลข n */
function nextFreeCode(start: number, make: (n: number) => string, taken: Set<string>): { code: string; n: number } {
  let n = start + 1;
  while (taken.has(make(n))) n += 1;
  return { code: make(n), n };
}

/** เลขที่มากที่สุดที่ใช้ไปแล้วในรหัสรูป prefix + ตัวเลข */
function highestNumberedCode(codes: (string | null)[], prefix: string): number {
  return codes.reduce((max: number, code) => {
    if (!code?.startsWith(prefix)) return max;
    const suffix = code.slice(prefix.length);
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, 0);
}

/** ระดับบนสุด: A, B, C, ... */
function planTopCodes(tops: Node[], taken: Set<string>, updates: CodeUpdate[], planned: string[]): void {
  let highestLetter = tops.reduce((max, node) => {
    if (!node.code || !/^[A-Z]+$/.test(node.code)) return max;
    return Math.max(max, lettersToNumber(node.code));
  }, 0);
  for (const top of tops) {
    if (top.code) continue;
    const next = nextFreeCode(highestLetter, numberToLetters, taken);
    highestLetter = next.n;
    top.code = next.code;
    taken.add(next.code);
    updates.push({ id: top.id, code: next.code });
    planned.push(`${next.code.padEnd(10)} ${top.name}`);
  }
}

/** ไล่ลงล่าง: รหัสแม่ + "-NN" ในทุกระดับที่อยู่ต่ำลงไป */
function planChildCodes(
  tops: Node[],
  childrenOf: Map<string | null, Node[]>,
  taken: Set<string>,
  updates: CodeUpdate[],
  planned: string[],
): void {
  const queue = [...tops];
  for (let parent = queue.shift(); parent; parent = queue.shift()) {
    const children = childrenOf.get(parent.id) ?? [];
    if (children.length === 0) continue;
    if (!parent.code) {
      console.warn(`ข้าม "${parent.name}" (ไม่มีรหัสแม่) รวมถึงลูกทั้งหมด`);
      continue;
    }

    const prefix = `${parent.code}-`;
    const make = (n: number) => prefix + String(n).padStart(CHILD_CODE_DIGITS, "0");
    let counter = highestNumberedCode(children.map((c) => c.code), prefix);
    for (const child of children) {
      if (!child.code) {
        const next = nextFreeCode(counter, make, taken);
        counter = next.n;
        child.code = next.code;
        taken.add(next.code);
        updates.push({ id: child.id, code: next.code });
        planned.push(`${next.code.padEnd(10)} ${child.name}`);
      }
      queue.push(child);
    }
  }
}

/** วัสดุ: ไล่ตั้งแต่ MAT-0001 ขึ้นไป เรียงตามหมวดที่มันสังกัดอยู่ */
async function planMaterialCodes(categories: Node[], planned: string[]): Promise<CodeUpdate[]> {
  const materials = await prisma.material.findMany({
    select: { id: true, code: true, name: true, categoryId: true },
  });
  const codeByCategoryId = new Map(categories.map((c) => [c.id, c.code ?? "\uffff"]));
  const categoryCodeOf = (categoryId: string | null) =>
    categoryId ? (codeByCategoryId.get(categoryId) ?? "\uffff") : "\uffff";

  let materialCounter = highestNumberedCode(materials.map((m) => m.code), MATERIAL_CODE_PREFIX);
  const materialCodesTaken = new Set(materials.flatMap((m) => (m.code ? [m.code] : [])));
  const make = (n: number) => MATERIAL_CODE_PREFIX + String(n).padStart(MATERIAL_CODE_DIGITS, "0");

  const sortedMaterials = [...materials].sort((a, b) => {
    const catA = categoryCodeOf(a.categoryId);
    const catB = categoryCodeOf(b.categoryId);
    if (catA !== catB) return catA.localeCompare(catB);
    return a.name.localeCompare(b.name, "th");
  });

  const materialUpdates: CodeUpdate[] = [];
  for (const material of sortedMaterials) {
    if (material.code) continue;
    const next = nextFreeCode(materialCounter, make, materialCodesTaken);
    materialCounter = next.n;
    materialCodesTaken.add(next.code);
    materialUpdates.push({ id: material.id, code: next.code });
    planned.push(`${next.code.padEnd(10)} ${material.name}`);
  }
  return materialUpdates;
}

async function main() {
  const planned: string[] = [];

  const categories: Node[] = await prisma.workCategory.findMany({
    select: { id: true, parentId: true, level: true, code: true, name: true, sortOrder: true },
  });
  const taken = new Set(categories.flatMap((c) => (c.code ? [c.code] : [])));

  const childrenOf = new Map<string | null, Node[]>();
  for (const c of categories) {
    const key = c.parentId ?? null;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), c]);
  }
  for (const list of childrenOf.values()) list.sort(bySortOrderThenName);

  const updates: CodeUpdate[] = [];
  const tops = childrenOf.get(null) ?? [];
  planTopCodes(tops, taken, updates, planned);
  planChildCodes(tops, childrenOf, taken, updates, planned);
  const materialUpdates = await planMaterialCodes(categories, planned);

  console.log(planned.join("\n"));
  console.log(
    `\nหมวดงานที่จะเติมรหัส: ${updates.length} รายการ, วัสดุ: ${materialUpdates.length} รายการ`,
  );

  if (dryRun) {
    console.log("(dry-run: ไม่ได้บันทึกลงฐานข้อมูล)");
    return;
  }

  await prisma.$transaction([
    ...updates.map((u) => prisma.workCategory.update({ where: { id: u.id }, data: { code: u.code } })),
    ...materialUpdates.map((u) =>
      prisma.material.update({ where: { id: u.id }, data: { code: u.code } }),
    ),
  ]);
  console.log("บันทึกเรียบร้อย");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
