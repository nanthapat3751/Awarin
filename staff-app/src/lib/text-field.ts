/**
 * เครื่องมือเล็ก ๆ สำหรับช่อง textarea/input ที่ React คุมค่าอยู่ — ใช้ร่วมกันระหว่างกล่องที่เด้ง
 * ตอนพิมพ์ {{ กับแผงแทรกตัวแปรข้างกระดาษของหน้าแม่แบบสัญญา
 */

import type { FieldMode } from "./variable-autocomplete";

export type TextField = HTMLTextAreaElement | HTMLInputElement;

/** ช่องที่ติดแอตทริบิวต์นี้ รับบล็อก {{ตารางงวดงาน}} ได้ (เนื้อความของข้อสัญญาเท่านั้น) */
export const ALLOW_BLOCKS_ATTR = "data-allow-blocks";

/**
 * ช่องที่ติดแอตทริบิวต์นี้ไม่ถูกแทนค่าตัวแปรเลย — ตอนนี้คือชื่อบนหน้าปก (docTitle) ซึ่งเซิร์ฟเวอร์
 * คัดลอกลงสัญญาตรง ๆ (ดู createContract) ตัวแปรที่ใส่ไว้ตรงนั้นจะถูกพิมพ์ออกมาทั้งวงเล็บ
 */
export const NO_VARIABLES_ATTR = "data-no-variables";

export function fieldMode(el: Element | null): FieldMode {
  if (el?.hasAttribute(NO_VARIABLES_ATTR)) return "none";
  return el?.hasAttribute(ALLOW_BLOCKS_ATTR) ? "varsAndBlocks" : "vars";
}

/**
 * เขียนค่าใหม่ลงช่องที่ React คุมอยู่ แล้วบอก React ให้รู้
 *
 * ต้องผ่าน setter ของ prototype + ส่ง event "input" เอง (ไม่ใช่ el.value = ...) ไม่งั้น state
 * กับ DOM จะไม่ตรงกัน แล้วการพิมพ์ครั้งถัดไปจะลบตัวแปรที่เพิ่งแทรกทิ้ง
 */
export function writeField(el: TextField, text: string, caret: number) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
  requestAnimationFrame(() => el.setSelectionRange(caret, caret));
}
