import { contractPaymentSummary, installmentProgress } from "@systemboq/shared-types";

import { parseIsoDate, toIsoDate } from "../../src/lib/business-date";

const TODAY = "2026-09-14";
const none: { amount: number; withholdingAmount: number }[] = [];

/**
 * สถานะของงวดหนึ่ง
 *
 * สิ่งที่ต้องไม่พังเด็ดขาด: "จ่ายครบแล้ว" ต้องไม่ขึ้นว่าค้าง และ "ยังไม่ถึงคิว" ต้องไม่ปนกับ
 * "ทวงไปแล้วเงียบ" — สองอย่างหลังคือคนละงานกัน ถ้าปนกันหน้างานค้างจะเต็มไปด้วยงานปลอม
 */
describe("installmentProgress", () => {
  it("ยังไม่ตั้งวันครบกำหนด = ยังไม่ถึงกำหนด ไม่ใช่ค้างชำระ", () => {
    const p = installmentProgress({ amount: 100_000, payments: none, dueOn: null, today: TODAY });
    expect(p.status).toBe("NOT_DUE");
    expect(p.daysOverdue).toBeNull();
    expect(p.remaining).toBe(100_000);
  });

  it("ครบกำหนดวันข้างหน้า = ยังไม่ถึงกำหนด", () => {
    const p = installmentProgress({
      amount: 100_000,
      payments: none,
      dueOn: "2026-09-30",
      today: TODAY,
    });
    expect(p.status).toBe("NOT_DUE");
    expect(p.daysOverdue).toBeNull();
  });

  it("ครบกำหนดวันนี้พอดี = รอรับเงิน แต่ยังไม่นับว่าเกินกำหนด", () => {
    const p = installmentProgress({ amount: 100_000, payments: none, dueOn: TODAY, today: TODAY });
    expect(p.status).toBe("AWAITING");
    expect(p.daysOverdue).toBeNull();
  });

  it("เลยกำหนดมาแล้ว = นับวันที่ค้างให้ถูก", () => {
    const p = installmentProgress({
      amount: 100_000,
      payments: none,
      dueOn: "2026-09-02",
      today: TODAY,
    });
    expect(p.status).toBe("AWAITING");
    expect(p.daysOverdue).toBe(12);
  });

  it("รับมาบางส่วนแล้วแต่ยังเลยกำหนด = บอกทั้งสองอย่าง ไม่ยุบเหลืออย่างเดียว", () => {
    const p = installmentProgress({
      amount: 100_000,
      payments: [{ amount: 40_000, withholdingAmount: 0 }],
      dueOn: "2026-09-04",
      today: TODAY,
    });
    expect(p.status).toBe("PARTIAL");
    expect(p.remaining).toBe(60_000);
    expect(p.daysOverdue).toBe(10);
  });

  it("จ่ายครบแล้วไม่ถือว่าค้าง แม้จะจ่ายช้ากว่ากำหนด", () => {
    const p = installmentProgress({
      amount: 100_000,
      payments: [{ amount: 100_000, withholdingAmount: 0 }],
      dueOn: "2026-08-01",
      today: TODAY,
    });
    expect(p.status).toBe("PAID");
    expect(p.daysOverdue).toBeNull();
    expect(p.remaining).toBe(0);
  });

  it("ทยอยจ่ายหลายครั้งจนครบ = ครบ", () => {
    const p = installmentProgress({
      amount: 100_000,
      payments: [
        { amount: 30_000, withholdingAmount: 0 },
        { amount: 70_000, withholdingAmount: 0 },
      ],
      dueOn: "2026-09-01",
      today: TODAY,
    });
    expect(p.status).toBe("PAID");
    expect(p.remaining).toBe(0);
  });

  /**
   * หัวใจของการแยกสองช่อง: ลูกค้านิติบุคคลหัก 3% ไว้นำส่งสรรพากร เงินเข้าบัญชีน้อยกว่ายอดงวด
   * แต่หนี้งวดนั้น **ปิดแล้ว** ถ้าเก็บแค่ยอดที่โอนเข้ามา งวดนี้จะค้าง 2,803.74 ไปตลอดกาล
   */
  it("หัก ณ ที่จ่ายแล้ว = หนี้งวดปิด ไม่ค้างส่วนที่ถูกหักไว้", () => {
    const p = installmentProgress({
      amount: 100_000,
      payments: [{ amount: 100_000, withholdingAmount: 2_803.74 }],
      dueOn: "2026-09-01",
      today: TODAY,
    });
    expect(p.status).toBe("PAID");
    expect(p.remaining).toBe(0);
    expect(p.withheldAmount).toBe(2_803.74);
    expect(p.receivedAmount).toBe(97_196.26);
  });

  it("รับเกินมา = บอกว่าเกิน ไม่ตัดทิ้งและไม่ทำให้คงเหลือติดลบ", () => {
    const p = installmentProgress({
      amount: 100_000,
      payments: [{ amount: 100_005, withholdingAmount: 0 }],
      dueOn: "2026-09-01",
      today: TODAY,
    });
    expect(p.status).toBe("OVERPAID");
    expect(p.remaining).toBe(0);
    expect(p.overpaidAmount).toBe(5);
  });
});

describe("contractPaymentSummary", () => {
  const plan = [
    { amount: 200_000, dueOn: "2026-08-01", payments: [{ amount: 200_000, withholdingAmount: 0 }] },
    { amount: 300_000, dueOn: "2026-09-01", payments: [{ amount: 100_000, withholdingAmount: 0 }] },
    { amount: 500_000, dueOn: null, payments: [] },
  ];

  it("รวมยอดและนับงวดที่เก็บครบแล้วได้ถูก", () => {
    const s = contractPaymentSummary(plan, TODAY);
    expect(s.planTotal).toBe(1_000_000);
    expect(s.paidAmount).toBe(300_000);
    expect(s.remaining).toBe(700_000);
    expect(s.paidCount).toBe(1);
    expect(s.totalCount).toBe(3);
  });

  it("ยอดที่เกินกำหนดแล้วนับเฉพาะส่วนที่ยังขาด ไม่ใช่ยอดเต็มของงวด", () => {
    const s = contractPaymentSummary(plan, TODAY);
    // งวด 2 ครบกำหนดแล้วและยังขาด 200,000 · งวด 3 ยังไม่ตั้งวันครบกำหนด จึงไม่นับ
    expect(s.overdueCount).toBe(1);
    expect(s.overdueAmount).toBe(200_000);
  });

  /**
   * สัญญาที่ยังไม่มีแผนงวดต้องได้ 0/0 แล้วให้ผู้เรียกไปแสดงว่า "ยังไม่มีแผนงวด" —
   * ห้ามปล่อยให้อ่านได้ว่าเก็บเงินครบแล้ว ซึ่งเป็นคนละเรื่องกันสิ้นเชิง
   */
  it("ไม่มีแผนงวด = ทุกยอดเป็นศูนย์และจำนวนงวดเป็นศูนย์", () => {
    const s = contractPaymentSummary([], TODAY);
    expect(s.totalCount).toBe(0);
    expect(s.planTotal).toBe(0);
    expect(s.paidCount).toBe(0);
    expect(s.overdueCount).toBe(0);
  });
});

/**
 * คอลัมน์ DATE ไม่มีเขตเวลา แต่ Prisma คืนมาเป็นเที่ยงคืน UTC — ต้องอ่าน/เขียนเป็น UTC ตลอดทาง
 */
describe("business-date", () => {
  it("อ่านคอลัมน์ DATE กลับเป็น YYYY-MM-DD ตรงวัน", () => {
    expect(toIsoDate(new Date("2026-09-30T00:00:00.000Z"))).toBe("2026-09-30");
    expect(toIsoDate(null)).toBeNull();
  });

  it("ปฏิเสธวันที่ที่ไม่มีอยู่จริง แทนที่จะปัดให้เองเงียบ ๆ", () => {
    // new Date("2026-02-31") ปัดเป็น 3 มี.ค. ให้เอง ซึ่งเป็นวันที่ที่ผู้ใช้ไม่ได้ตั้งใจกรอก
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("14/09/2026")).toBeNull();
    expect(parseIsoDate("2026-09-14")?.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });
});
