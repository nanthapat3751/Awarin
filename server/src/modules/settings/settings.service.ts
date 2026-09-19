import { writeAuditLog } from "../../lib/audit-log";
import { prisma } from "../../lib/prisma";
import { getSettingsMap } from "../../lib/settings";

export class SettingsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SettingsError";
    this.status = status;
  }
}
import type { Role } from "@prisma/client";

import {
  EDITABLE_SETTING_KEYS,
  OWNER_ONLY_SETTING_KEYS,
  PAYMENT_ACCOUNT_KEYS,
  PUBLIC_SETTING_KEYS,
  type UpdateSettingsInput,
} from "./settings.schemas";

export async function getAllSettings(): Promise<Record<string, string>> {
  const all = await getSettingsMap();
  const result: Record<string, string> = {};
  for (const key of EDITABLE_SETTING_KEYS) {
    result[key] = all[key] ?? "";
  }
  return result;
}

export async function getPublicSettings(): Promise<Record<string, string>> {
  const all = await getSettingsMap();
  const result: Record<string, string> = {};
  for (const key of PUBLIC_SETTING_KEYS) {
    result[key] = all[key] ?? "";
  }
  return result;
}

/** ค่าที่ส่งมาเท่ากับที่เก็บไว้หรือไม่ — ตัวเลขเทียบเป็นตัวเลข ("15" กับ 15 คือค่าเดียวกัน) */
function sameStoredValue(stored: string | undefined, next: string | number | null): boolean {
  const current = (stored ?? "").trim();
  if (next === null) return current === "";
  if (typeof next === "number") return current !== "" && Number(current) === next;
  return current === next.trim();
}

/**
 * อัตรากำไรแก้ได้เฉพาะ OWNER — แต่หน้าตั้งค่าส่งฟอร์มทั้งก้อน (ทุกช่องทุกแท็บ) มาในคำขอเดียว
 * ถ้าปฏิเสธทันทีที่เห็นคีย์ ADMIN จะบันทึกแม้แต่เบอร์โทรไม่ได้ จึงปฏิเสธเฉพาะเมื่อ "ค่าเปลี่ยนจริง"
 * ค่าที่เท่าเดิมถูกตัดทิ้งเงียบ ๆ ไม่เขียนทับ (updatedById จะได้ไม่กลายเป็นชื่อ ADMIN)
 */
async function withoutUnchangedOwnerOnlyKeys(input: UpdateSettingsInput, role: Role): Promise<UpdateSettingsInput> {
  if (role === "OWNER") return input;
  const touched = OWNER_ONLY_SETTING_KEYS.filter((key) => input[key] !== undefined);
  if (touched.length === 0) return input;
  const current = await getSettingsMap();
  if (touched.some((key) => !sameStoredValue(current[key], input[key] ?? null))) {
    throw new SettingsError("อัตราค่าดำเนินการและกำไรแก้ได้เฉพาะเจ้าของระบบ (OWNER)", 403);
  }
  const kept = { ...input };
  for (const key of touched) delete kept[key];
  return kept;
}

/**
 * ตรวจ "สถานะปลายทาง" ไม่ใช่เฉพาะช่องที่ส่งมา — หน้าตั้งค่าอาจส่งมาแค่ช่องเดียว
 * ค่าดำเนินการที่มากกว่าอัตรารวม แปลว่ากำไรติดลบตั้งแต่ยังไม่เริ่มงาน ซึ่งเป็นการกรอกผิดแน่ ๆ
 */
async function assertOverheadWithinTotal(input: UpdateSettingsInput): Promise<void> {
  if (input.overheadPercent == null && input.overheadProfitPercent == null) return;
  const current = await getSettingsMap();
  const total =
    input.overheadProfitPercent ??
    (current.overheadProfitPercent ? Number(current.overheadProfitPercent) : 10);
  const storedOverhead = current.overheadPercent ? Number(current.overheadPercent) : null;
  const overhead = input.overheadPercent === undefined ? storedOverhead : input.overheadPercent;
  if (overhead != null && overhead > total) {
    throw new SettingsError(
      `ค่าดำเนินการ (${overhead}%) มากกว่าอัตรารวมค่าดำเนินการ+กำไร (${total}%) ไม่ได้`,
    );
  }
}

/**
 * บัญชีรับเงินต้อง "ครบ หรือว่างทั้งหมด" — ตรวจจากสถานะปลายทางเหมือนข้างบน
 * เลขบัญชีที่ไม่มีชื่อธนาคาร หรือพร้อมเพย์ลอย ๆ ที่ไม่มีบัญชี ไม่ถูกพิมพ์ลงเอกสาร (ดู
 * paymentAccountFrom) ถ้าปล่อยให้บันทึกผ่าน พนักงานจะนึกว่าตั้งไว้แล้วทั้งที่ลูกค้าไม่เห็นอะไรเลย
 */
async function assertPaymentAccountComplete(input: UpdateSettingsInput): Promise<void> {
  if (!PAYMENT_ACCOUNT_KEYS.some((key) => input[key] !== undefined)) return;
  const current = await getSettingsMap();
  const valueOf = (key: (typeof PAYMENT_ACCOUNT_KEYS)[number]) => (input[key] ?? current[key] ?? "").trim();
  const anyFilled = PAYMENT_ACCOUNT_KEYS.some((key) => valueOf(key) !== "");
  const coreFilled = (["paymentBankName", "paymentAccountName", "paymentAccountNo"] as const).every(
    (key) => valueOf(key) !== "",
  );
  if (anyFilled && !coreFilled) {
    throw new SettingsError(
      "บัญชีรับเงินต้องกรอกให้ครบทั้ง ธนาคาร ชื่อบัญชี และเลขที่บัญชี (หรือเว้นว่างทั้งหมด)",
    );
  }
}

export async function updateSettings(
  rawInput: UpdateSettingsInput,
  actor: { id: string; role: Role },
): Promise<void> {
  const actorId = actor.id;

  const input = await withoutUnchangedOwnerOnlyKeys(rawInput, actor.role);
  await assertOverheadWithinTotal(input);
  await assertPaymentAccountComplete(input);

  const entries = Object.entries(input).filter(
    (entry): entry is [string, string | number | null] => entry[1] !== undefined,
  );

  await Promise.all(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        // null (เฉพาะ overheadPercent) = ล้างค่า เก็บเป็นสตริงว่างซึ่ง getDefaultRates อ่านเป็น "ยังไม่ได้แยก"
        update: { value: value === null ? "" : String(value), updatedById: actorId },
        create: { key, value: value === null ? "" : String(value), updatedById: actorId },
      }),
    ),
  );

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_SETTINGS",
    entityType: "Setting",
    details: input,
  });
}
