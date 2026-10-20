import { crc16, isValidPromptPayId, promptPayPayload, promptPayQrDataUrl } from "../../src/lib/promptpay";

/**
 * QR พร้อมเพย์ผิดแม้ตัวเดียว = แอปธนาคารสแกนไม่ได้ หรือแย่กว่านั้นคือเงินลูกค้าเข้าบัญชีอื่น
 * จึงตรวจกับค่าอ้างอิงที่รู้คำตอบแน่นอน ไม่ใช่แค่ "สร้างได้ไม่ error"
 */
describe("QR พร้อมเพย์ (EMVCo)", () => {
  it("CRC16 ตรงกับค่าตรวจสอบมาตรฐานของ CRC-16/CCITT-FALSE", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("เบอร์มือถือ + ยอดเงิน ตรงกับ payload อ้างอิงของไลบรารี promptpay-qr ทุกตัวอักษร", () => {
    expect(promptPayPayload("000-000-0000", 4.22)).toBe(
      "00020101021229370016A000000677010111011300660000000005802TH530376454044.226304E469",
    );
  });

  it("เบอร์มือถือตัด 0 หน้าแล้วเติม 0066 · เลขผู้เสียภาษี 13 หลักใช้ช่อง 02", () => {
    expect(promptPayPayload("081-234-5678", 100)).toContain("0113" + "0066812345678");
    const juristic = promptPayPayload("0105561234567", 344743.3);
    expect(juristic).toContain("0213" + "0105561234567");
    expect(juristic).toContain("5409344743.30");
    // ฝังยอด = QR ใช้ครั้งเดียว (12)
    expect(juristic.startsWith("000201010212")).toBe(true);
  });

  it("CRC ท้าย payload ถูกต้องสำหรับยอดใดก็ได้", () => {
    for (const amount of [1, 30000, 258557.47, 1723716.5]) {
      const p = promptPayPayload("0812345678", amount);
      expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
    }
  });

  it("ปฏิเสธเลขที่ไม่ใช่พร้อมเพย์ และยอดที่ไม่ใช่เงินจริง — ไม่เดาเลข", () => {
    expect(isValidPromptPayId("12345")).toBe(false);
    expect(isValidPromptPayId("1812345678")).toBe(false); // 10 หลักแต่ไม่ขึ้นต้น 0
    expect(isValidPromptPayId(null)).toBe(false);
    expect(isValidPromptPayId("0105561234567")).toBe(true);
    expect(() => promptPayPayload("12345", 10)).toThrow();
    expect(() => promptPayPayload("0812345678", 0)).toThrow();
    expect(() => promptPayPayload("0812345678", -5)).toThrow();
    expect(() => promptPayPayload("0812345678", Number.NaN)).toThrow();
  });

  it("สร้างรูป QR เป็น PNG data URL ได้ (ฝังลง PDF ได้)", async () => {
    const url = await promptPayQrDataUrl("0812345678", 30000);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
});
