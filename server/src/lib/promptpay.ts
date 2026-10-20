import QRCode from "qrcode";

/**
 * QR พร้อมเพย์ฝังยอดเงิน (Thai QR Payment ตามมาตรฐาน EMVCo ของ ธปท.) — สแกนได้ทุกแอปธนาคารไทย
 *
 * สร้างเองในระบบ ไม่ผ่านผู้ให้บริการภายนอก จึงไม่มีค่าธรรมเนียมและไม่ส่งข้อมูลออกนอกระบบ
 * แต่ **ระบบไม่รู้ว่าเงินเข้าแล้ว** — ลูกค้ายังต้องแจ้งโอน และพนักงานยังต้องตรวจกับบัญชีเหมือนเดิม
 *
 * โครง payload: ช่อง ID(2 หลัก) + ความยาว(2 หลัก) + ค่า ต่อกันไปเรื่อย ๆ ปิดท้ายด้วย CRC16
 */

const PROMPTPAY_AID = "A000000677010111";

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, ค่าเริ่ม 0xFFFF) — ตัวที่มาตรฐาน EMVCo QR กำหนด */
export function crc16(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * แปลงเลขพร้อมเพย์เป็นช่องในบัญชีผู้รับ
 * - เบอร์มือถือ 10 หลัก (0XXXXXXXXX) → ช่อง 01 รูปแบบ 0066XXXXXXXXX (ตัด 0 หน้า เติมรหัสประเทศ)
 * - เลขประจำตัวผู้เสียภาษี/บัตรประชาชน 13 หลัก → ช่อง 02
 * - e-Wallet 15 หลัก → ช่อง 03
 * รูปแบบอื่นคืน null — ไม่เดา เพราะ QR ผิดเลขคือเงินลูกค้าเข้าบัญชีคนอื่น
 */
function accountField(promptPayId: string): string | null {
  const digits = promptPayId.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return field("01", `0066${digits.slice(1)}`);
  if (digits.length === 13) return field("02", digits);
  if (digits.length === 15) return field("03", digits);
  return null;
}

/** เลขพร้อมเพย์ใช้สร้าง QR ได้ไหม */
export function isValidPromptPayId(promptPayId: string | null | undefined): boolean {
  return promptPayId != null && accountField(promptPayId) != null;
}

/**
 * payload ของ QR · `amount` = ยอดที่ฝังไว้ (ลูกค้าแก้ในแอปไม่ได้) · ไม่ส่ง = QR ไม่ระบุยอด
 * ฝังยอด → ชนิด "12" (ใช้ครั้งเดียว) · ไม่ฝัง → "11" (ใช้ซ้ำได้) ตามมาตรฐาน
 */
export function promptPayPayload(promptPayId: string, amount?: number): string {
  const account = accountField(promptPayId);
  if (!account) throw new Error("เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก เลขผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก");
  if (amount != null && (!Number.isFinite(amount) || amount <= 0 || amount > 9_999_999_999.99)) {
    throw new Error("ยอดเงินใน QR ไม่ถูกต้อง");
  }
  const body = [
    field("00", "01"),
    field("01", amount == null ? "11" : "12"),
    field("29", field("00", PROMPTPAY_AID) + account),
    field("58", "TH"),
    field("53", "764"),
    amount == null ? "" : field("54", amount.toFixed(2)),
  ].join("");
  // CRC คิดรวมหัวของช่อง 63 ("6304") ด้วยตามมาตรฐาน
  const withCrcHeader = `${body}6304`;
  return withCrcHeader + crc16(withCrcHeader);
}

/** รูป QR เป็น data URL (PNG) — ใช้ได้ทั้งในพอร์ทัลและฝังลง PDF (Puppeteer โหลด URL ภายนอกไม่ได้) */
export function promptPayQrDataUrl(promptPayId: string, amount: number): Promise<string> {
  return QRCode.toDataURL(promptPayPayload(promptPayId, amount), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
}
