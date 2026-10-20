import { normalizeTakeoffRules, type TakeoffRulePresets } from "@systemboq/shared-types";

import { writeAuditLog } from "./audit-log";
import { prisma } from "./prisma";

/**
 * ชุดกฎการถอดปริมาณของบริษัท (ตั้งค่า → ถอดปริมาณ) — เก็บเป็น JSON ก้อนเดียวในตาราง Setting
 * ไม่อยู่ในรายการคีย์ของฟอร์มตั้งค่าหลัก (EDITABLE_SETTING_KEYS) เพราะไม่ใช่ข้อความ และแก้ได้เฉพาะเจ้าของ
 * ยังไม่เคยบันทึก / ค่าเก่าอ่านไม่ออก = ค่าตั้งต้น (normalizeTakeoffRules ไม่โยน error)
 */
export const TAKEOFF_RULES_KEY = "takeoffRules";

export async function getTakeoffRules(): Promise<TakeoffRulePresets> {
  const row = await prisma.setting.findUnique({ where: { key: TAKEOFF_RULES_KEY } });
  if (!row?.value) return normalizeTakeoffRules(null);
  try {
    return normalizeTakeoffRules(JSON.parse(row.value));
  } catch {
    return normalizeTakeoffRules(null);
  }
}

export async function saveTakeoffRules(input: TakeoffRulePresets, actorId: string): Promise<TakeoffRulePresets> {
  // ผ่าน normalize อีกรอบ — เก็บเฉพาะช่องที่รู้จัก ช่องแปลก ๆ ที่ติดมากับคำขอไม่ลงฐานข้อมูล
  const rules = normalizeTakeoffRules(input);
  const value = JSON.stringify(rules);
  await prisma.setting.upsert({
    where: { key: TAKEOFF_RULES_KEY },
    update: { value, updatedById: actorId },
    create: { key: TAKEOFF_RULES_KEY, value, updatedById: actorId },
  });
  await writeAuditLog({ userId: actorId, action: "UPDATE_TAKEOFF_RULES", entityType: "Setting", details: { ...rules } as unknown as Record<string, unknown> });
  return rules;
}
