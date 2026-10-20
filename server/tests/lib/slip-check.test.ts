import { maskedDigitsMatch, receiverVerdict } from "../../src/lib/slip/slip-check";
import { interpretSlipOkResponse, parseSlipOkSuccess } from "../../src/lib/slip/slipok-provider";

const account = { bankName: "SCB", branch: null, accountName: "Awarin", accountNo: "726-0-85163-5", promptPay: "0955763003" };

describe("เทียบบัญชีปลายทางที่ถูกปิดบางหลัก", () => {
  it("หลักที่มองเห็นตรงกันทั้งหมด = ใช่", () => {
    expect(maskedDigitsMatch("xxx-x-x5163-x", "7260851635")).toBe(true);
    expect(maskedDigitsMatch("XXX-X-X5163-X", "726-0-85163-5")).toBe(true);
    expect(maskedDigitsMatch("xxx-xxx-3003", "0955763003")).toBe(true);
  });
  it("มีหลักที่ขัดกัน = ไม่ใช่", () => {
    expect(maskedDigitsMatch("xxx-x-x9999-x", "7260851635")).toBe(false);
    // เลขในสลิปยาวกว่าบัญชีเรา (ต่างธนาคาร) ก็ไม่ใช่
    expect(maskedDigitsMatch("x1234567890123", "7260851635")).toBe(false);
  });
  it("เห็นน้อยกว่า 3 หลัก / ไม่มีข้อมูล = เทียบไม่ได้ (ไม่เดา)", () => {
    expect(maskedDigitsMatch("xxx-x-xxxx3-x", "7260851635")).toBeNull();
    expect(maskedDigitsMatch(null, "7260851635")).toBeNull();
    expect(maskedDigitsMatch("xxx-x-x5163-x", null)).toBeNull();
  });
  it("โอนเข้าพร้อมเพย์ก็นับเป็นบัญชีบริษัท · ไม่ได้ตั้งบัญชี = ไม่รู้", () => {
    const base = { transRef: "R", amount: 1, transDate: null, transferredAt: null, senderName: null, senderBank: null, receiverName: null };
    expect(receiverVerdict({ ...base, receiverAccount: null, receiverProxy: "xxx-xxx-3003" }, account)).toBe("ours");
    expect(receiverVerdict({ ...base, receiverAccount: "xxx-x-x1111-x", receiverProxy: null }, account)).toBe("other");
    expect(receiverVerdict({ ...base, receiverAccount: null, receiverProxy: null }, account)).toBe("unknown");
    expect(receiverVerdict({ ...base, receiverAccount: "xxx-x-x5163-x", receiverProxy: null }, null)).toBe("unknown");
  });
});

describe("อ่านคำตอบที่สำเร็จของ SlipOK", () => {
  it("แปลงยอด เลขอ้างอิง วันเวลา (เวลาไทย) และบัญชีปลายทาง", () => {
    const slip = parseSlipOkSuccess({
      transRef: "015292143911CTF04938",
      transDate: "20261018",
      transTime: "14:22:05",
      amount: 473423.02,
      sendingBank: "004",
      sender: { displayName: "นาย ก.", account: { value: "xxx-x-x1234-x" } },
      receiver: { displayName: "Awarin Engineering", account: { value: "xxx-x-x5163-x" } },
    });
    expect(slip).toMatchObject({
      transRef: "015292143911CTF04938",
      amount: 473423.02,
      transDate: "2026-10-18",
      senderName: "นาย ก.",
      receiverAccount: "xxx-x-x5163-x",
      receiverProxy: null,
    });
    expect(slip!.transferredAt!.toISOString()).toBe("2026-10-18T07:22:05.000Z");
  });
  it("ข้อมูลไม่ครบ (ไม่มีเลขอ้างอิง/ยอด) = อ่านไม่ได้ ไม่เดาค่า", () => {
    expect(parseSlipOkSuccess({ amount: 100 })).toBeNull();
    expect(parseSlipOkSuccess({ transRef: "R", amount: "abc" })).toBeNull();
    expect(parseSlipOkSuccess({ transRef: "R", amount: 0 })).toBeNull();
  });
});

/** ตัวอย่างคำตอบจาก SlipOK API Guide v1.13 */
describe("แปลคำตอบของ SlipOK ตามเอกสาร", () => {
  const slipData = {
    success: true,
    message: "✅",
    transRef: "010092101507665143",
    sendingBank: "004",
    receivingBank: "004",
    transDate: "20200401",
    transTime: "10:15:07",
    transTimestamp: "2020-04-01T03:15:07.000Z",
    sender: { displayName: "นาย ธนาคาร ก", name: "Mr. Thanakarn K", proxy: { type: null, value: null }, account: { type: "BANKAC", value: "xxx-x-x0209-x" } },
    receiver: { displayName: "กสิกร ร", name: "KASIKORN R", proxy: { type: "", value: "" }, account: { type: "BANKAC", value: "xxx-x-x3109-x" } },
    amount: 1,
  };

  it("สำเร็จ (HTTP 200) = อ่านได้ · proxy ว่างเป็น null · ใช้ transTimestamp", () => {
    const r = interpretSlipOkResponse(200, { success: true, data: slipData });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.slip.receiverAccount).toBe("xxx-x-x3109-x");
    expect(r.slip.receiverProxy).toBeNull();
    expect(r.slip.transferredAt!.toISOString()).toBe("2020-04-01T03:15:07.000Z");
  });

  it("1012/1013/1014 มากับข้อมูลสลิป = ใช้ข้อมูลแล้วตัดสินด้วยกติกาของเราเอง", () => {
    expect(interpretSlipOkResponse(400, { code: 1012, message: "สลิปซ้ำ", data: slipData }).kind).toBe("ok");
  });

  it("1011 (หมดอายุ/ไม่มีรายการ) = ตรวจไม่ได้ ไม่ใช่สลิปปลอม (สลิปจริงที่เก่าเกินก็ได้รหัสนี้)", () => {
    const r = interpretSlipOkResponse(400, { code: 1011, message: "QR Code หมดอายุ หรือ ไม่มีรายการอยู่จริง" });
    expect(r.kind).toBe("unreadable");
  });

  it("1010 สลิปที่ต้องรอ = บอกให้ตรวจอีกครั้งภายหลัง พร้อมชื่อธนาคารและนาที", () => {
    const r = interpretSlipOkResponse(400, { code: 1010, message: "...", data: { bankCode: "002", bankName: "กรุงเทพ", delay: 8 } });
    expect(r.kind).toBe("unreadable");
    if (r.kind === "unreadable") {
      expect(r.message).toContain("ธนาคารกรุงเทพ");
      expect(r.message).toContain("8 นาที");
      expect(r.message).toContain("ตรวจสลิปอีกครั้ง");
    }
  });

  it("ตั้งค่าผิด/แพ็กเกจหมด = บอกว่าระบบตรวจสลิปใช้งานไม่ได้", () => {
    const r = interpretSlipOkResponse(401, { code: 1002, message: "Authorization Header ไม่ถูกต้อง" });
    expect(r).toMatchObject({ kind: "unreadable", configProblem: true });
    if (r.kind === "unreadable") expect(r.message).toContain("SLIPOK_API_KEY");
  });

  it("ไม่มี QR / คำตอบเพี้ยน = ตรวจไม่ได้", () => {
    expect(interpretSlipOkResponse(400, { code: 1007, message: "รูปภาพไม่มี Qr code" })).toMatchObject({ kind: "unreadable" });
    expect(interpretSlipOkResponse(502, null)).toMatchObject({ kind: "unreadable" });
  });
});
