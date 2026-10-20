import type { ComponentPropsWithRef } from "react";

/**
 * สีปุ่มไล่ตาม "ผลของการกด" ไม่ใช่ตามชื่อปุ่ม — ชื่อปุ่มงอกใหม่ได้เรื่อย ๆ และชื่อเดียวกัน
 * ในแอปนี้ก็หมายคนละเรื่อง (คำว่า "ลบ" มีสามความหมาย) ทุกปุ่มตอบสามคำถามนี้ได้เสมอ:
 * กดแล้วย้อนได้ไหม · คนนอกเห็นผลหรือยัง · เปลี่ยนข้อมูลหรือแค่เปิดดู
 *
 *   brand        นาวี #000099 ทึบ  ปล่อยของออกไปถึงคนนอกจริง ย้อนยาก
 *                                  (ส่งใบเสนอราคา, ออกลิงก์เข้าใช้, เผยแพร่, ออกใบแจ้งหนี้)
 *   neutral      เทา slate-800 ทึบ ยืนยันงานที่ยังอยู่ในบ้านเรา ย้อนได้ — ค่าเริ่มต้น
 *                                  (บันทึก, เพิ่มรายการ, ขออนุมัติ)
 *   ghost        ขาว ขอบเทา        ไม่แตะข้อมูลเลย (เปิดฟอร์ม, พาไปหน้าอื่น, พิมพ์, โหลด)
 *   dangerQuiet  ขาว แดงตอนชี้     หยุด/ถอย/ยึดคืน แต่กู้ได้ (ลบเข้าถังขยะ, ระงับบัญชี, ซ่อน)
 *   danger       แดง red-600 ทึบ   กู้ไม่ได้ หรือคนนอกรู้ไปแล้ว
 *
 * กฎบังคับสามข้อ
 * 1. ปุ่ม brand ไม่เกินหนึ่งปุ่มต่อหนึ่งกล่อง/หน้าจอ — ถ้ามีสองแปลว่ายังไม่ได้เลือกว่าอันไหนคือทางหลัก
 * 2. ปุ่มประจำแถวในตาราง ใช้ได้แค่ ghost กับ dangerQuiet เท่านั้น — ตาราง BOQ มี 78 แถว
 *    ปุ่มสีทึบประจำแถวจะกลายเป็นแถบสียาวทั้งคอลัมน์ (เหตุผลเดียวกับที่ตัดปุ่มแดง 79 ก้อนออกไป)
 *    ถ้าการกระทำนั้นสมควรได้สีทึบจริง ให้ยกสีไปไว้ที่ปุ่มยืนยันในกล่อง confirm แทน
 * 3. สีให้ปุ่มที่ "ลงมือทำ" ไม่ใช่ปุ่มที่ "พาไปทำ" — ปุ่มแก้ไข/ไปที่.. แค่กางฟอร์มหรือเลื่อนหน้า
 *    ตัวที่ควรได้สีคือปุ่มบันทึกในฟอร์มนั้น
 *
 * กล่อง confirm (lib/confirm-context.tsx) ใช้คำเดียวกันนี้ ยกเว้นไม่มี ghost/dangerQuiet
 * รายละเอียดเต็มและตารางปุ่มทุกปุ่ม: staff-app/docs/button-system.md
 */
export type ButtonVariant = "neutral" | "brand" | "danger" | "dangerQuiet" | "ghost";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1 rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed";

const SIZE: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5",
  md: "text-sm px-4 py-2",
};

// ปุ่มทึบ (ปุ่มหลักของหน้า) ตอบสนองด้วยเงา + ยกตัวขึ้น 2px แล้วลงกลับที่เดิมตอนกด
// เป็นแพตเทิร์นเดียวกับการ์ดแดชบอร์ดและปุ่มเข้าสู่ระบบที่แอปนี้ใช้อยู่แล้ว
//
// ต้องเป็น transition-all ไม่ใช่ transition-colors — transition-colors ไล่เฉพาะสี
// เงาจะเด้งปุ๊บทันทีไม่นุ่ม (นี่คือเหตุที่ย้าย transition ออกจาก BASE มาไว้ในแต่ละแบบ)
//
// การยกตัวครอบด้วย motion-safe: แทนที่จะสั่งทับทีหลังด้วย motion-reduce: เพราะกฎที่มี :hover
// มีน้ำหนัก (specificity) มากกว่ากฎที่อยู่ใน media query เฉย ๆ สั่งทับแล้วจะไม่ชนะ
// คนที่ตั้งค่าลดการเคลื่อนไหวไว้จึงเหลือแค่เงา ไม่มีการขยับ
const SOLID_LIFT =
  "transition-all duration-200 motion-reduce:transition-none " +
  "hover:shadow-md motion-safe:hover:-translate-y-0.5 " +
  "active:shadow-sm motion-safe:active:translate-y-0 " +
  "disabled:hover:shadow-none disabled:motion-safe:hover:translate-y-0";

// ปุ่มขอบ/ปุ่มเงียบไม่ต้องยกตัว — ตาราง BOQ มีปุ่มประจำแถว 78 แถว ถ้ายกตัวตามเมาส์ทุกแถว
// หน้าจะกระตุกไปมาเวลาเลื่อนเมาส์ผ่าน (เหตุผลเดียวกับที่ตัดปุ่มแดงทึบประจำแถวออกไป)
const QUIET_TRANSITION = "transition-colors";

// ปุ่มทึบใส่ขอบใสไว้ด้วย เพื่อให้กล่องสูงเท่ากับ ghost ที่มีขอบจริง -- วางเรียงกันแล้วขอบบน/ล่างตรงกัน
const VARIANT: Record<ButtonVariant, string> = {
  neutral: `${SOLID_LIFT} border border-transparent bg-slate-800 text-white hover:bg-slate-900`,
  brand: `${SOLID_LIFT} border border-transparent bg-[#000099] text-white hover:bg-[#000077]`,
  danger: `${SOLID_LIFT} border border-transparent bg-red-600 text-white hover:bg-red-700`,
  // ปุ่มลบ "ประจำแถว" ในตาราง/รายการ ต้องเงียบไว้ก่อน แล้วค่อยเป็นสีแดงตอนเอาเมาส์ชี้ —
  // ตาราง BOQ มี 78 แถว ถ้าทุกแถวมีปุ่มแดงทึบ หน้าจะมีบล็อกสีแดง 79 ก้อนพร้อมกัน
  // (นับจากหน้าจริง) ซึ่งเป็นตัวทำให้ลายตาที่สุดในหน้า ส่วน danger ทึบเก็บไว้ใช้กับ
  // การกระทำครั้งเดียวที่ต้องเตือนจริง ๆ เช่น ลบถาวร/ยกเลิกโครงการ
  dangerQuiet: `${QUIET_TRANSITION} border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600`,
  ghost: `${QUIET_TRANSITION} border border-slate-300 text-slate-500 bg-white hover:bg-slate-100 hover:border-slate-400 hover:text-slate-800`,
};

/** Shared class string — also used to style react-router <Link>s as buttons. */
export function buttonClasses(variant: ButtonVariant = "neutral", size: ButtonSize = "md"): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]}`;
}

// ปุ่มไอคอนล้วนประจำแถว (ถังขยะ/ดินสอ) — ไอคอนเปล่า ๆ 14px ทำให้เป้ากดเล็กแค่ 14px กดพลาดง่าย
// และตอนกด Tab มาถึงก็มองไม่ออกว่าโฟกัสอยู่ตรงไหน จึงครอบเป็นกล่อง 28px มีพื้นตอนเมาส์ชี้
// และมีกรอบโฟกัสชุดเดียวกับปุ่มเลื่อนแท็บ · สีเทาไว้ก่อนแล้วค่อยเป็นสีตอนชี้ ตามกฎปุ่มประจำแถว
const ICON_BASE =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";

export function iconButtonClasses(tone: "danger" | "neutral" = "neutral"): string {
  return tone === "danger"
    ? `${ICON_BASE} hover:bg-red-50 hover:text-red-600 focus-visible:outline-red-500`
    : `${ICON_BASE} hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-brand`;
}

export function Button({
  variant = "neutral",
  size = "md",
  className = "",
  type = "button",
  ...props
// React 19 ส่ง ref ผ่าน props ได้ตรง ๆ — ใช้คืนโฟกัสให้ปุ่มหลังปิดฟอร์มที่ปุ่มนั้นเปิด
}: ComponentPropsWithRef<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={`${buttonClasses(variant, size)} ${className}`} {...props} />;
}
