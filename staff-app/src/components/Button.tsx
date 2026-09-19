import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "dangerQuiet" | "ghost";
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
  primary: `${SOLID_LIFT} border border-transparent bg-slate-800 text-white hover:bg-slate-900`,
  secondary: `${SOLID_LIFT} border border-transparent bg-[#000099] text-white hover:bg-[#000077]`,
  danger: `${SOLID_LIFT} border border-transparent bg-red-600 text-white hover:bg-red-700`,
  // ปุ่มลบ "ประจำแถว" ในตาราง/รายการ ต้องเงียบไว้ก่อน แล้วค่อยเป็นสีแดงตอนเอาเมาส์ชี้ —
  // ตาราง BOQ มี 78 แถว ถ้าทุกแถวมีปุ่มแดงทึบ หน้าจะมีบล็อกสีแดง 79 ก้อนพร้อมกัน
  // (นับจากหน้าจริง) ซึ่งเป็นตัวทำให้ลายตาที่สุดในหน้า ส่วน danger ทึบเก็บไว้ใช้กับ
  // การกระทำครั้งเดียวที่ต้องเตือนจริง ๆ เช่น ลบถาวร/ยกเลิกโครงการ
  dangerQuiet: `${QUIET_TRANSITION} border border-slate-300 bg-white text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600`,
  ghost: `${QUIET_TRANSITION} border border-slate-300 text-slate-500 bg-white hover:bg-slate-100 hover:border-slate-400 hover:text-slate-800`,
};

/** Shared class string — also used to style react-router <Link>s as buttons. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={`${buttonClasses(variant, size)} ${className}`} {...props} />;
}
