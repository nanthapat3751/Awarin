import { paymentWarnings, type PaymentCheckInstallment } from "@systemboq/shared-types";

/**
 * คำเตือนก่อนบันทึกรับเงิน (ข้อ 1 กันความผิดพลาดจากคนกรอก) — เตือน ไม่ห้าม
 */
const installments: PaymentCheckInstallment[] = [
  { id: "i1", seq: 1, remaining: 0, payments: [{ id: "p1", paidOn: "2026-10-10", amount: 344_743.3 }] },
  { id: "i2", seq: 2, remaining: 258_557.47, payments: [] },
  { id: "i3", seq: 3, remaining: 258_557.47, payments: [] },
];
const base = {
  installmentId: "i2",
  amount: 258_557.47,
  paidOn: "2026-10-17",
  method: "TRANSFER" as const,
  hasEvidence: true,
  today: "2026-10-18",
};

describe("คำเตือนก่อนบันทึกรับเงิน", () => {
  it("กรณีปกติ (ครบงวด มีสลิป งวดก่อนจ่ายครบ) = ไม่มีคำเตือน", () => {
    expect(paymentWarnings(base, installments)).toEqual([]);
  });

  it("พิมพ์ศูนย์ขาด/เกิน (ต่าง 10 เท่า) แยกจากรับไม่ครบ/รับเกินธรรมดา", () => {
    expect(paymentWarnings({ ...base, amount: 25_855.75 }, installments)[0]).toContain("พิมพ์ศูนย์ขาดหรือเกิน");
    expect(paymentWarnings({ ...base, amount: 2_585_574.7 }, installments)[0]).toContain("พิมพ์ศูนย์ขาดหรือเกิน");
    expect(paymentWarnings({ ...base, amount: 200_000 }, installments)[0]).toContain("รับไม่ครบงวด ยังขาดอีก 58,557.47");
    expect(paymentWarnings({ ...base, amount: 260_000 }, installments)[0]).toContain("ยอดเกินยอดค้างของงวด 1,442.53");
  });

  it("งวดที่รับครบแล้ว · บันทึกซ้ำ (ยอดเดียวกัน วันเดียวกัน งวดไหนก็ได้) · แก้รายการเดิมไม่นับตัวเองซ้ำ", () => {
    expect(paymentWarnings({ ...base, installmentId: "i1", amount: 344_743.3, paidOn: "2026-10-10" }, installments).join(" ")).toMatch(
      /รับครบแล้ว.*บันทึกซ้ำ|บันทึกซ้ำ.*รับครบแล้ว/s,
    );
    const editing = paymentWarnings(
      { ...base, installmentId: "i1", amount: 344_743.3, paidOn: "2026-10-10", editingPaymentId: "p1" },
      [{ ...installments[0], remaining: 344_743.3 }, installments[1]],
    );
    expect(editing.some((w) => w.includes("บันทึกซ้ำ"))).toBe(false);
  });

  it("งวดก่อนหน้ายังค้าง → เตือนว่าอาจผิดงวด · ย้อนหลังเกิน 30 วัน · โอนแต่ไม่มีสลิป", () => {
    expect(paymentWarnings({ ...base, installmentId: "i3" }, installments)).toContain("งวดที่ 2 ยังค้างอยู่ — ตรวจว่าบันทึกถูกงวด");
    expect(paymentWarnings({ ...base, paidOn: "2026-08-01" }, installments)[0]).toContain("ย้อนหลัง 78 วัน");
    expect(paymentWarnings({ ...base, hasEvidence: false }, installments)[0]).toContain("ยังไม่ได้แนบสลิป");
    // เงินสดไม่มีสลิป — ไม่ต้องเตือน
    expect(paymentWarnings({ ...base, hasEvidence: false, method: "CASH" }, installments)).toEqual([]);
  });
});
