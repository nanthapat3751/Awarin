import { mockSlipProvider } from "./mock-provider";
import { slipOkProvider } from "./slipok-provider";

/**
 * ตัวอ่านสลิปกับธนาคาร (ผ่านผู้ให้บริการภายนอก) — แยกเป็นชั้นของตัวเองให้เปลี่ยนเจ้าได้โดยไม่แตะส่วนอื่น
 *
 * ผู้ให้บริการยืนยันได้แค่ "รายการโอนนี้มีจริงที่ธนาคาร" + ยอด/วันเวลา/บัญชีปลายทาง (ปิดบางหลัก)
 * ส่วนการตัดสินว่าสลิปซ้ำ/เข้าบัญชีบริษัทไหม/ยอดตรงงวดไหม ทำในระบบเราเองทั้งหมด (slip-check.ts)
 * จึงไม่พึ่งการกันซ้ำ/เทียบยอดของผู้ให้บริการ — เปลี่ยนเจ้าแล้วกติกาเดิมยังอยู่ครบ
 */
export interface SlipFileInput {
  path: string;
  mimetype: string;
  originalname: string;
}

export interface SlipData {
  /** เลขอ้างอิงรายการจากธนาคาร — ตัวที่ใช้กันสลิปซ้ำ */
  transRef: string;
  amount: number;
  /** วันที่โอนตามเวลาไทย (YYYY-MM-DD) */
  transDate: string | null;
  /** วัน-เวลาที่โอน */
  transferredAt: Date | null;
  senderName: string | null;
  senderBank: string | null;
  receiverName: string | null;
  /** เลขบัญชีปลายทาง (ปิดบางหลัก เช่น xxx-x-x5163-x) */
  receiverAccount: string | null;
  /** พร้อมเพย์ปลายทาง (ปิดบางหลัก) — มีเมื่อโอนเข้าพร้อมเพย์ */
  receiverProxy: string | null;
}

export type SlipReadResult =
  | { kind: "ok"; slip: SlipData }
  /** ธนาคารยืนยันว่าไม่มีรายการนี้ — เป็นเหตุเดียวที่ปฏิเสธเพราะ "สลิปปลอม" */
  | { kind: "fake"; message: string }
  /** อ่าน/ตรวจไม่ได้ (ไม่มี QR, ไฟล์ไม่ใช่รูป, ผู้ให้บริการขัดข้อง, หมดโควตา) — ไม่ใช่ความผิดลูกค้า */
  | { kind: "unreadable"; message: string; configProblem?: boolean };

export interface SlipProvider {
  name: string;
  read(file: SlipFileInput): Promise<SlipReadResult>;
}

let override: SlipProvider | null | undefined;

/** เทสต์ใส่ตัวอ่านจำลองแทนได้ (undefined = กลับไปอ่านจากค่าตั้งใน .env) */
export function setSlipProviderForTests(provider: SlipProvider | null | undefined): void {
  override = provider;
}

/**
 * ตัวอ่านที่ใช้อยู่ — null = ปิดระบบตรวจสลิป (การแจ้งโอนทำงานแบบเดิม พนักงานตรวจเองทั้งหมด)
 * SLIP_PROVIDER=slipok ต้องมี SLIPOK_API_KEY + SLIPOK_BRANCH_ID ครบ ไม่งั้นถือว่าปิด (ไม่ล้มทั้งระบบ)
 */
export function slipProvider(): SlipProvider | null {
  if (override !== undefined) return override;
  const name = process.env.SLIP_PROVIDER?.trim().toLowerCase();
  if (name === "slipok") {
    const apiKey = process.env.SLIPOK_API_KEY?.trim();
    const branchId = process.env.SLIPOK_BRANCH_ID?.trim();
    return apiKey && branchId ? slipOkProvider({ apiKey, branchId }) : null;
  }
  // ตัวจำลองผ่านได้ด้วยการตั้งชื่อไฟล์ — ปิดเสมอบนเครื่องจริง แม้ตั้งค่าผิด
  if (name === "mock") return process.env.NODE_ENV === "production" ? null : mockSlipProvider;
  return null;
}

/** ไฟล์ที่ส่งไปตรวจได้ — ผู้ให้บริการอ่าน QR จากรูปเท่านั้น (PDF ข้ามไป = ตรวจไม่ได้) */
export function isCheckableImage(mimetype: string): boolean {
  return mimetype === "image/jpeg" || mimetype === "image/png" || mimetype === "image/webp";
}
