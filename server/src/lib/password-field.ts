import { passwordProblem } from "@systemboq/shared-types";
import { z } from "zod";

/**
 * ช่อง "รหัสผ่านใหม่" สำหรับ zod — กฎตัวจริงอยู่ใน @systemboq/shared-types ที่เดียว
 *
 * ใช้กับปลายทางที่ **ยังไม่รู้ว่าเป็นบัญชีของใคร** ตอน parse (ตั้งรหัสจากลิงก์ลืมรหัสผ่าน,
 * ลิงก์เข้าใช้ครั้งเดียว, รีเซ็ตรหัสพนักงาน) จึงตรวจได้แค่กฎที่ไม่ต้องรู้ตัวตน — ข้อ "ห้ามมีชื่อ
 * หรืออีเมลตัวเองอยู่ในรหัส" ต้องไปตรวจซ้ำใน service ตอนโหลดบัญชีปลายทางขึ้นมาแล้ว
 * ด้วย passwordProblem(value, [...]) โดยตรง
 *
 * **ห้ามเอาไปใช้กับช่องรหัสผ่านตอนเข้าสู่ระบบ** ตรงนั้นต้องเป็น min(1) ตลอดไป — บัญชีที่ตั้งรหัส
 * ไว้ก่อนมีกฎนี้ (รวมบัญชีเจ้าของระบบ) ต้องเข้าระบบตัวเองได้ต่อ กฎใหม่มีผลเฉพาะตอน "ตั้ง" รหัส
 */
export const newPasswordField = z.string().superRefine((value, ctx) => {
  const problem = passwordProblem(value);
  if (problem !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  }
});

/** ชื่อช่องที่ถือ "รหัสผ่านใหม่" ในทุกสคีมา — ช่องรหัสปัจจุบันตอนล็อกอินไม่เกี่ยว */
const NEW_PASSWORD_FIELDS: ReadonlySet<string> = new Set(["password", "newPassword"]);

/**
 * ข้อความผิดพลาดของช่องรหัสผ่านจาก zod — คืน null ถ้าความผิดพลาดไม่ได้อยู่ที่ช่องรหัสผ่าน
 *
 * route พวกนี้ตอบ "ข้อมูลไม่ถูกต้อง" เป็นข้อความกลาง ๆ แล้วยัดรายละเอียดไว้ใน `details` ซึ่ง
 * หน้าเว็บไม่ได้อ่าน — พอใช้ได้กับช่องที่ผิดแบบเห็นชัด (ไม่กรอกชื่อ, อีเมลผิดรูปแบบ) แต่ใช้กับ
 * รหัสผ่านไม่ได้เลย เพราะกฎมีหกข้อและคนต้องรู้ว่าตัวเองชนข้อไหนถึงจะแก้ได้
 *
 * ยกมาแค่ช่องรหัสผ่านช่องเดียว ไม่เปลี่ยนพฤติกรรมของช่องอื่น — กฎรหัสผ่านเป็นที่เดียวที่เหตุผล
 * ของการถูกปฏิเสธมีค่ามากพอที่จะต้องส่งออกไปให้ผู้ใช้อ่าน
 */
export function passwordIssueMessage(error: z.ZodError): string | null {
  const hit = error.issues.find(
    (issue) => typeof issue.path[0] === "string" && NEW_PASSWORD_FIELDS.has(issue.path[0]),
  );
  return hit?.message ?? null;
}

/**
 * ผูกการตรวจรหัสผ่านเข้ากับ object ที่มีข้อมูลเจ้าของบัญชีอยู่ในตัวเอง (ฟอร์มสมัคร, ฟอร์มสร้าง
 * พนักงาน) — ตรวจครบทุกข้อรวม "ห้ามมีชื่อ/อีเมล/ชื่อผู้ใช้/เบอร์โทรอยู่ในรหัส" ได้ในครั้งเดียว
 *
 * ตรวจที่ระดับ object ไม่ใช่ระดับช่อง เพราะข้อนี้ต้องเห็นช่องอื่นด้วย · ถ้าตรวจสองชั้น
 * (ช่อง + object) คนจะได้ข้อความผิดพลาดสองข้อพร้อมกันจากรหัสผ่านตัวเดียว
 */
export function refinePasswordWith<T extends { password: string }>(
  personalFrom: (value: T) => ReadonlyArray<string | null | undefined>,
) {
  return (value: T, ctx: z.RefinementCtx): void => {
    const problem = passwordProblem(value.password, personalFrom(value));
    if (problem !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ["password"] });
    }
  };
}
