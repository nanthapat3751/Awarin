import { addDaysIso, calendarWeeks, dmyToIso, isoToDmy, maskDmy, monthLabelTh, todayIso } from "@systemboq/shared-types";

describe("ช่องวันที่ วว/ดด/ปปปป (ปี พ.ศ.)", () => {
  it("แสดงค่าที่เก็บ (YYYY-MM-DD ค.ศ.) เป็น วว/ดด/ปปปป ปี พ.ศ.", () => {
    expect(isoToDmy("2026-10-24")).toBe("24/10/2569");
    expect(isoToDmy("")).toBe("");
    expect(isoToDmy(null)).toBe("");
    expect(isoToDmy("24/10/2026")).toBe("");
  });

  it("ใส่ / ให้เองระหว่างพิมพ์ และตัดตัวที่ไม่ใช่ตัวเลข", () => {
    expect(maskDmy("2")).toBe("2");
    expect(maskDmy("241")).toBe("24/1");
    expect(maskDmy("24102569")).toBe("24/10/2569");
    expect(maskDmy("24-10-2569x9")).toBe("24/10/2569");
    expect(maskDmy("24/")).toBe("24");
  });

  it("แปลงกลับเป็น YYYY-MM-DD (ค.ศ.) เฉพาะวันที่ที่มีจริง", () => {
    expect(dmyToIso("24/10/2569")).toBe("2026-10-24");
    expect(dmyToIso("29/02/2571")).toBe("2028-02-29");
    expect(dmyToIso("29/02/2570")).toBeNull();
    expect(dmyToIso("31/04/2569")).toBeNull();
    expect(dmyToIso("24/13/2569")).toBeNull();
    expect(dmyToIso("24/10/25")).toBeNull();
  });

  it("พิมพ์ปี ค.ศ. มา (คนที่ติดมือ) ยังรับ", () => {
    expect(dmyToIso("24/10/2026")).toBe("2026-10-24");
  });

  it("แสดงแล้วแปลงกลับได้ค่าเดิมเสมอ", () => {
    for (const iso of ["2026-01-01", "2026-12-31", "2028-02-29"]) expect(dmyToIso(isoToDmy(iso))).toBe(iso);
  });
});

describe("ปฏิทินไทย", () => {
  it("ตารางเดือน 6 แถว × 7 วัน เริ่มวันอาทิตย์ · ตุลาคม 2569 เริ่มวันพฤหัสบดี", () => {
    const weeks = calendarWeeks(2026, 9);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // 1 ต.ค. 2026 เป็นวันพฤหัสบดี → ช่องที่ 5 ของแถวแรก
    expect(weeks[0][4]).toEqual({ iso: "2026-10-01", day: 1, inMonth: true });
    expect(weeks[0][0]).toEqual({ iso: "2026-09-27", day: 27, inMonth: false });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(31);
  });

  it("ชื่อเดือนไทย ปี พ.ศ. · เลื่อนวัน · วันนี้ตามเวลาเครื่อง", () => {
    expect(monthLabelTh("2026-10")).toBe("ตุลาคม 2569");
    expect(monthLabelTh("2026-13")).toBe("");
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(todayIso(new Date(2026, 9, 17, 1, 0))).toBe("2026-10-17");
  });
});
