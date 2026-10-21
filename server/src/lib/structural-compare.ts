import {
  isWeightUnit,
  settingsFromRuleSet,
  structuralTakeoff,
  takeoffRowValue,
  type StructuralCompareDto,
  type StructuralInput,
  type TakeoffRulePresets,
} from "@systemboq/shared-types";

import { prisma } from "./prisma";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * เทียบเหล็กเสริมใน BOQ (ชุดเสนอราคา) กับชิ้นส่วนเดียวกันคิดด้วยชุดสั่งตัด — "กรอกครั้งเดียว ได้สองผลลัพธ์"
 *
 * - ฝั่งเสนอราคา = แถวในใบถอดแบบที่มาจากชิ้นส่วน (memberKey) ตามที่อยู่ในบรรทัดตอนนี้ — ถ้ามีคนแก้แถวเอง ตัวเลขนี้ก็ตามนั้น
 * - ฝั่งสั่งตัด = ขนาดชิ้นส่วนที่เก็บไว้ คิดใหม่ด้วยชุดสั่งตัดของบริษัท (ระยะหุ้มใช้ค่าของชิ้นส่วนเอง)
 * - ชิ้นส่วนหนึ่งตัวกับเหล็กขนาดหนึ่ง ถ้าแถวถูกแยกลงหลายบรรทัด ฝั่งสั่งตัดแบ่งตามสัดส่วนแถวเสนอราคา (ไม่นับซ้ำ)
 * - ชิ้นส่วนที่ถูกลบแถวออกหมดแล้วไม่นับ · บรรทัดเหล็กที่ไม่มีแถวจากชิ้นส่วนเลย = "ไม่มีข้อมูลเทียบ" (ไม่เดา)
 * ทุกตัวเลขเป็นปริมาณสุทธิก่อนเผื่อเสีย (กก.)
 */
type Share = Map<string, number>;
type CompareItem = { id: string; takeoffRows: { label: string; count: unknown; length: unknown; width: unknown; height: unknown; barDia: number | null; deduct: boolean; memberKey: string | null }[] };
type CompareMember = { key: string; input: unknown };

/** แถวเหล็กที่ผูกกับชิ้นส่วนที่ยังมีอยู่: (ชิ้นส่วน, ขนาด) → บรรทัด → น้ำหนักเสนอราคา · แถวเหล็กที่ไม่มีชิ้นส่วน = กรอกเอง */
function tenderShares(items: CompareItem[], memberByKey: Map<string, CompareMember>) {
  const tenderBy = new Map<string, Share>();
  const manualRows = new Map<string, number>();
  const linkedItems = new Set<string>();
  for (const item of items) {
    for (const r of item.takeoffRows) {
      if (r.barDia == null) continue;
      const member = r.memberKey ? memberByKey.get(r.memberKey) : undefined;
      if (!member) {
        manualRows.set(item.id, (manualRows.get(item.id) ?? 0) + 1);
        continue;
      }
      const key = `${member.key}|${r.barDia}`;
      const share = tenderBy.get(key) ?? new Map<string, number>();
      share.set(item.id, (share.get(item.id) ?? 0) + rowKg(r));
      tenderBy.set(key, share);
      linkedItems.add(item.id);
    }
  }
  return { tenderBy, manualRows, linkedItems };
}

/** น้ำหนักเหล็กของแถวใบถอดแบบหนึ่งแถว (แถวหักติดลบ) */
function rowKg(r: CompareItem["takeoffRows"][number]): number {
  const num = (v: unknown) => (v == null ? null : Number(v));
  const kg = takeoffRowValue(
    { label: r.label, count: Number(r.count), length: num(r.length), width: num(r.width), height: num(r.height), barDia: r.barDia },
    "กก.",
  );
  return kg * (r.deduct ? -1 : 1);
}

/** ชิ้นส่วนที่ยังมีแถวอยู่ คิดด้วยชุดสั่งตัด (คิดครั้งเดียวต่อชิ้นส่วน) → (ชิ้นส่วน, ขนาด) → น้ำหนัก/ความยาว */
function siteWeights(used: CompareMember[], rules: TakeoffRulePresets): Map<string, { kg: number; length: number }> {
  const siteBy = new Map<string, { kg: number; length: number }>();
  for (const m of used) {
    const input = m.input as unknown as StructuralInput;
    const out = structuralTakeoff({ ...input, settings: settingsFromRuleSet(rules.site, input.settings?.cover ?? 0) });
    for (const row of out.rows) {
      if (row.group !== "REBAR" || row.row.barDia == null) continue;
      const key = `${m.key}|${row.row.barDia}`;
      const cur = siteBy.get(key) ?? { kg: 0, length: 0 };
      cur.kg += row.value;
      cur.length += row.row.count * (row.row.length ?? 0);
      siteBy.set(key, cur);
    }
  }
  return siteBy;
}

/** รวมตามขนาด และแบ่งน้ำหนักสั่งตัดลงแต่ละบรรทัดตามสัดส่วนแถวเสนอราคา (ไม่นับซ้ำ) */
function spreadSiteOverLines(tenderBy: Map<string, Share>, siteBy: Map<string, { kg: number; length: number }>) {
  const lineMap = new Map<string, { tenderNet: number; siteNet: number }>();
  const diaMap = new Map<number, { tenderNet: number; siteNet: number; siteLength: number }>();
  for (const [key, share] of tenderBy) {
    const dia = Number(key.split("|")[1]);
    const total = [...share.values()].reduce((a, b) => a + b, 0);
    const site = siteBy.get(key) ?? { kg: 0, length: 0 };
    const d = diaMap.get(dia) ?? { tenderNet: 0, siteNet: 0, siteLength: 0 };
    d.tenderNet += total;
    d.siteNet += site.kg;
    d.siteLength += site.length;
    diaMap.set(dia, d);
    for (const [itemId, kg] of share) {
      const portion = total > 0 ? kg / total : 1 / share.size;
      const l = lineMap.get(itemId) ?? { tenderNet: 0, siteNet: 0 };
      l.tenderNet += kg;
      l.siteNet += site.kg * portion;
      lineMap.set(itemId, l);
    }
  }
  return { lineMap, diaMap };
}

export async function structuralCompare(versionId: string, rules: TakeoffRulePresets): Promise<StructuralCompareDto> {
  const [members, items] = await Promise.all([
    prisma.structuralMember.findMany({ where: { projectVersionId: versionId }, orderBy: { createdAt: "asc" } }),
    prisma.boqItem.findMany({
      where: { projectVersionId: versionId },
      select: { id: true, name: true, unit: true, takeoffRows: true },
    }),
  ]);
  const { tenderBy, manualRows, linkedItems } = tenderShares(items, new Map(members.map((m) => [m.key, m])));
  const used = members.filter((m) => [...tenderBy.keys()].some((k) => k.startsWith(`${m.key}|`)));
  const siteBy = siteWeights(used, rules);
  const { lineMap, diaMap } = spreadSiteOverLines(tenderBy, siteBy);

  return {
    members: used.map((m) => ({ label: m.label, kind: m.kind, count: m.count })),
    lines: [...lineMap].map(([itemId, v]) => ({
      itemId,
      tenderNet: round3(v.tenderNet),
      siteNet: round3(v.siteNet),
      manualRows: manualRows.get(itemId) ?? 0,
    })),
    byDia: [...diaMap]
      .sort((a, b) => a[0] - b[0])
      .map(([dia, v]) => ({ dia, tenderNet: round3(v.tenderNet), siteNet: round3(v.siteNet), siteLength: round3(v.siteLength) })),
    // บรรทัดเหล็กที่ไม่มีชิ้นส่วน — บอกเฉพาะเมื่อโครงการนี้ใช้ตัวคิดชิ้นส่วนแล้ว (ไม่งั้นทุกโครงการเก่าจะขึ้นป้ายเต็มไปหมด)
    noDataItemIds:
      used.length === 0
        ? []
        : items
            .filter((i) => !linkedItems.has(i.id) && isWeightUnit(i.unit) && /เหล็ก|RB\s?\d|DB\s?\d/i.test(i.name))
            .map((i) => i.id),
  };
}
