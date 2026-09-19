import type { ContractVariableInfo } from "@systemboq/shared-types";
import { CONTRACT_VARIABLE_GROUP_LABELS } from "@systemboq/shared-types";

/**
 * ตรรกะล้วนของการพิมพ์ {{ แล้วเด้งรายการตัวแปร — แยกจากหน้าจอเพื่อให้ทดสอบได้โดยไม่ต้องมีเบราว์เซอร์
 */

/** ความยาวสูงสุดของสิ่งที่พิมพ์ต่อจาก {{ ก่อนจะถือว่าไม่ได้ตั้งใจพิมพ์ตัวแปรแล้ว */
const MAX_QUERY = 30;

export interface OpenToken {
  /** ตำแหน่งของ "{{" ในข้อความ */
  start: number;
  /** สิ่งที่พิมพ์ต่อจาก {{ ถึงเคอร์เซอร์ */
  query: string;
}

/**
 * มี {{ ที่ยังไม่ปิดอยู่ก่อนเคอร์เซอร์ไหม — ถ้ามี คืนตำแหน่งและคำที่พิมพ์ต่อ
 *
 * ไม่นับเมื่อ: ปิดด้วย } ไปแล้ว · ข้ามบรรทัด · พิมพ์ยาวเกินชื่อตัวแปรใด ๆ ไปมาก
 * (ข้อความสัญญาจริงไม่มีวงเล็บปีกกา การพิมพ์ {{ จึงแทบเป็นเจตนาเสมอ)
 */
export function findOpenToken(text: string, caret: number): OpenToken | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("{{");
  if (start === -1) return null;
  const query = before.slice(start + 2);
  if (query.includes("}") || query.includes("\n") || query.length > MAX_QUERY) return null;
  return { start, query: query.trim() };
}

export interface PickerItem {
  name: string;
  /** กลุ่มที่ใช้แสดงหัวข้อ — "block" = บล็อกที่ระบบวาดให้ตอนพิมพ์ ไม่ใช่คำ */
  group: ContractVariableInfo["group"] | "block";
  groupLabel: string;
  preview: string;
  note: string | null;
  missing: boolean;
  /** เหตุผลที่เลือกไม่ได้ในช่องนี้ — null = เลือกได้ */
  disabled: string | null;
}

export const BLOCK_GROUP_LABEL = "บล็อก (ใช้ได้เฉพาะในเนื้อความของข้อสัญญา)";

/**
 * ช่องแต่ละช่องรับอะไรได้บ้าง — ต้องตรงกับที่เซิร์ฟเวอร์แทนค่าจริง ไม่ใช่ที่หน้าจออยากให้เป็น
 * - `varsAndBlocks` เนื้อความของข้อสัญญา: ตัวแปร + บล็อกตาราง (contract-pdf.ts แยกตารางเฉพาะที่นี่)
 * - `vars` บรรทัดใต้ชื่อ / อารัมภบท / หัวข้อ / ปิดท้าย: ตัวแปรเท่านั้น (renderStructure)
 * - `none` ชื่อบนหน้าปก: ไม่ถูกแทนค่าเลย เซิร์ฟเวอร์คัดลอกลงสัญญาตรง ๆ
 */
export type FieldMode = "none" | "vars" | "varsAndBlocks";

export const BLOCK_ONLY_IN_CLAUSE =
  "ใช้ได้เฉพาะในเนื้อความของข้อสัญญา — ที่ช่องนี้จะพิมพ์วงเล็บดิบออกมา";
export const NO_VARIABLES_HERE =
  "ชื่อบนหน้าปกไม่ถูกแทนค่าตัวแปร — จะพิมพ์ออกมาทั้งวงเล็บ (ใส่ในบรรทัดใต้ชื่อแทน)";

/** เหตุผลที่บล็อก (เช่น ตารางงวดงาน) ใช้ไม่ได้ในช่องแต่ละแบบ · null = ใช้ได้ */
const BLOCK_DISABLED_REASON: Record<FieldMode, string | null> = {
  varsAndBlocks: null,
  none: NO_VARIABLES_HERE,
  vars: BLOCK_ONLY_IN_CLAUSE,
};

/**
 * รวมตัวแปร + บล็อก เป็นรายการเดียวสำหรับแสดงผล
 *
 * `mode` = ช่องที่เคอร์เซอร์อยู่รับอะไรได้ — `{{ตารางงวดงาน}}` ถูกวาดเป็นตาราง
 * เฉพาะในเนื้อความของข้อสัญญา ถ้าไปอยู่ในอารัมภบท/หัวข้อ/บรรทัดใต้ชื่อ PDF จะพิมพ์วงเล็บดิบออกมา
 * และระบบไม่เตือนเพราะนับว่าเป็นโทเคนที่รู้จัก — จึงกดไม่ได้ในช่องอื่น แต่ยังโชว์พร้อมเหตุผล
 * (ถ้าซ่อนไปเฉย ๆ คนที่พิมพ์ {{ตาราง ในอารัมภบทจะนึกว่าระบบไม่มีตารางให้ใช้)
 */
export function buildPickerItems(
  variables: ContractVariableInfo[],
  blockTokens: string[],
  mode: FieldMode,
): PickerItem[] {
  const items: PickerItem[] = variables.map((v) => ({
    name: v.name,
    group: v.group,
    groupLabel: CONTRACT_VARIABLE_GROUP_LABELS[v.group],
    preview: v.preview,
    note: v.note,
    missing: v.missing,
    disabled: mode === "none" ? NO_VARIABLES_HERE : null,
  }));
  for (const token of blockTokens) {
    items.push({
      name: token,
      group: "block",
      groupLabel: BLOCK_GROUP_LABEL,
      preview: "ตารางงวดเงินของสัญญาฉบับนั้น ระบบวาดให้ตอนออกเอกสาร",
      note: null,
      missing: false,
      disabled: BLOCK_DISABLED_REASON[mode],
    });
  }
  return items;
}

/** เหตุผลสั้น ๆ ที่ป้ายติดเมาส์บอก ตอนชี้ช่องที่วางไม่ได้ (แบบ "เลือกก่อน แล้วคลิกวาง") */
export const PLACE_NOT_ON_COVER = "ชื่อบนหน้าปกใส่ตัวแปรไม่ได้ — วางในบรรทัดใต้ชื่อแทน";
export const PLACE_BLOCK_ONLY_IN_CLAUSE = "ตารางวางได้เฉพาะในเนื้อความของข้อสัญญา";

/**
 * วางตัวแปรที่เลือกไว้ลงช่องนี้ได้ไหม — null = วางได้ · ข้อความ = เหตุผลที่วางไม่ได้
 * กฎเดียวกับ buildPickerItems แต่กลับด้าน: เลือกตัวแปรก่อน แล้วค่อยรู้ช่องตอนคลิกวาง
 */
export function placementBlocker(name: string, blockTokens: string[], mode: FieldMode): string | null {
  if (mode === "none") return PLACE_NOT_ON_COVER;
  if (blockTokens.includes(name) && mode !== "varsAndBlocks") return PLACE_BLOCK_ONLY_IN_CLAUSE;
  return null;
}

/**
 * กรองตามคำที่พิมพ์ — จับทั้งชื่อตัวแปรและชื่อกลุ่ม
 * พิมพ์ "ลูกค้า" จึงได้ตัวแปรฝั่งผู้ว่าจ้างทั้งหมด แม้ไม่มีตัวไหนมีคำว่าลูกค้าในชื่อ
 */
export function filterPickerItems(items: PickerItem[], query: string): PickerItem[] {
  const q = query.trim();
  if (!q) return items;
  return items.filter((i) => i.name.includes(q) || i.groupLabel.includes(q));
}

/**
 * ข้อความใหม่หลังแทรกตัวแปรแทนที่ "{{คำที่พิมพ์" — คืนข้อความและตำแหน่งเคอร์เซอร์ถัดไป
 *
 * ถ้าหลังเคอร์เซอร์มี "}}" อยู่แล้ว (พิมพ์ {{}} ก่อนแล้วค่อยกลับมาใส่ชื่อ) กินวงเล็บปิดนั้นด้วย
 * ไม่งั้นจะได้ {{ชื่อ}}}} ซึ่งพิมพ์ออกมาเป็นวงเล็บเกินบนสัญญา
 */
export function applyPick(
  text: string,
  token: OpenToken,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const inserted = `{{${name}}}`;
  const end = text.startsWith("}}", caret) ? caret + 2 : caret;
  return {
    text: text.slice(0, token.start) + inserted + text.slice(end),
    caret: token.start + inserted.length,
  };
}
