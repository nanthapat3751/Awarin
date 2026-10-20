import {
  STOCK_LENGTH_OPTIONS,
  STRUCTURAL_KINDS,
  cutPlan,
  pickStock,
  rebarCode,
  settingsFromRuleSet,
  structuralTakeoff,
  type CutRequest,
  type RebarCuttingDto,
  type StructuralInput,
  type TakeoffRulePresets,
} from "@systemboq/shared-types";

import { prisma } from "./prisma";

const kgPerMetre = (dia: number) => (dia * dia) / 162;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** แถวเหล็กของชิ้นส่วนหนึ่ง (ชุดสั่งตัด) — ใช้ทั้งแผนตัดและชีต "รายชิ้นส่วน" ใน Excel */
export interface ScheduleRow {
  label: string;
  dia: number;
  /** ยาวต่อเส้น (ม.) รวมทาบ/งอ/ขอ ตามชุดสั่งตัด */
  length: number;
  count: number;
  totalLength: number;
  kg: number;
}

export interface MemberSchedule {
  label: string;
  kind: string;
  kindLabel: string;
  count: number;
  rows: ScheduleRow[];
}

export interface RebarSchedule {
  cutting: RebarCuttingDto;
  /** แถวต่อชิ้นส่วน คิดด้วยความยาวเหล็กเส้นที่แนะนำของแต่ละขนาด (จำนวนจุดทาบขึ้นกับความยาวเส้น) */
  members: MemberSchedule[];
}

/**
 * รายการสั่งเหล็กหน้างานทั้งโครงการ + แผนตัด (Phase 3) — ชิ้นส่วนที่ยังมีแถวอยู่ใน BOQ เท่านั้น (ชุดเดียวกับการเทียบ)
 *
 * แต่ละความยาวเหล็กเส้น (10/12 ม.) คิดชิ้นส่วนใหม่ด้วยชุดสั่งตัดที่ตั้งความยาวเส้นนั้น — เส้นยาวกว่าทาบน้อยกว่า
 * แล้วจัดตัดด้วย FFD แยกตามขนาด · ความยาวที่แนะนำ = ซื้อเหล็กน้อยกว่า
 */
export async function rebarSchedule(versionId: string, rules: TakeoffRulePresets): Promise<RebarSchedule> {
  const [members, linked] = await Promise.all([
    prisma.structuralMember.findMany({ where: { projectVersionId: versionId }, orderBy: { createdAt: "asc" } }),
    prisma.boqTakeoffRow.findMany({
      where: { memberKey: { not: null }, barDia: { not: null }, boqItem: { projectVersionId: versionId } },
      select: { memberKey: true },
      distinct: ["memberKey"],
    }),
  ]);
  const usedKeys = new Set(linked.map((r) => r.memberKey));
  const used = members.filter((m) => usedKeys.has(m.key));

  // ความยาวเส้น → ชิ้นส่วน → แถวเหล็ก
  const rowsBy = new Map<number, Map<string, ScheduleRow[]>>();
  for (const stock of STOCK_LENGTH_OPTIONS) {
    const perMember = new Map<string, ScheduleRow[]>();
    for (const m of used) {
      const input = m.input as unknown as StructuralInput;
      const out = structuralTakeoff({
        ...input,
        settings: { ...settingsFromRuleSet(rules.site, input.settings?.cover ?? 0), stockLength: stock },
      });
      perMember.set(
        m.key,
        out.rows
          .filter((r) => r.group === "REBAR" && r.row.barDia != null && (r.row.length ?? 0) > 0)
          .map((r) => {
            const length = r.row.length ?? 0;
            const dia = r.row.barDia!;
            return {
              label: r.row.label,
              dia,
              length,
              count: r.row.count,
              totalLength: round3(length * r.row.count),
              kg: round3(length * r.row.count * kgPerMetre(dia)),
            };
          }),
      );
    }
    rowsBy.set(stock, perMember);
  }

  const dias = [...new Set([...rowsBy.values()].flatMap((pm) => [...pm.values()].flat().map((r) => r.dia)))].sort((a, b) => a - b);
  const byDia: RebarCuttingDto["byDia"] = dias.map((dia) => {
    const plans = STOCK_LENGTH_OPTIONS.map((stock) => {
      const requests: CutRequest[] = [...rowsBy.get(stock)!.values()]
        .flat()
        .filter((r) => r.dia === dia)
        .map((r) => ({ length: r.length, count: r.count }));
      const plan = cutPlan(requests, stock);
      return {
        ...plan,
        netKg: round2(plan.netLength * kgPerMetre(dia)),
        purchaseKg: round2(plan.bars * stock * kgPerMetre(dia)),
      };
    });
    const pieces = [...rowsBy.get(STOCK_LENGTH_OPTIONS[0])!.values()]
      .flat()
      .filter((r) => r.dia === dia)
      .reduce((n, r) => n + r.count, 0);
    return { dia, code: rebarCode(dia), pieces, plans, recommended: pickStock(plans) };
  });

  const recommendedOf = new Map(byDia.map((d) => [d.dia, d.recommended]));
  const memberSchedules: MemberSchedule[] = used.map((m) => {
    // แต่ละขนาดใช้แถวที่คิดด้วยความยาวเส้นที่แนะนำของขนาดนั้น
    const rows = dias.flatMap((dia) =>
      (rowsBy.get(recommendedOf.get(dia) ?? STOCK_LENGTH_OPTIONS[0])!.get(m.key) ?? []).filter((r) => r.dia === dia),
    );
    return {
      label: m.label,
      kind: m.kind,
      kindLabel: STRUCTURAL_KINDS.find((k) => k.value === m.kind)?.label ?? m.kind,
      count: m.count,
      rows,
    };
  });

  return {
    cutting: { members: used.length, byDia },
    members: memberSchedules,
  };
}
