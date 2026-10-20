import { roundTo, sumTakeoffSheet } from "@systemboq/shared-types";
import { calculateLineAmounts, round2 } from "../../src/lib/pricing";
import { effectiveQuantity } from "../../src/modules/boq/boq.service";

/**
 * เลขที่ลงท้าย 5 พอดีแต่ float เก็บเป็น …4999… ต้องปัดขึ้น — เคยเจอจริงใน PRJ-2026-0928:
 * ฐานพื้นที่ตั้งอาคาร 145 × 6.4483 = 935.0035 แต่ระบบบันทึก 935.003
 */
describe("roundTo — ปัดครึ่งขึ้นโดยไม่โดนเศษ float หลอก", () => {
  it.each([
    [145 * 6.4483, 3, 935.004],
    [1.005, 2, 1.01],
    [1.255, 2, 1.26],
    [8.345, 2, 8.35],
    [1234567.125, 2, 1234567.13],
    [0.1 + 0.2, 2, 0.3],
    [2.4999, 3, 2.5],
    [2.4994, 3, 2.499],
    [0, 2, 0],
  ])("roundTo(%p, %p) = %p", (value, places, expected) => {
    expect(roundTo(value, places)).toBe(expected);
  });

  it("ไม่ปัดค่าที่ต่ำกว่าครึ่งจริงขึ้น", () => {
    expect(roundTo(935.0034, 3)).toBe(935.003);
    expect(roundTo(1.0049, 2)).toBe(1);
  });

  it("ปริมาณจากค่าวัดใช้การปัดที่ถูก (เคสจริง PRJ-2026-0928)", () => {
    const quantity = effectiveQuantity({
      qtyBasis: "PER_FOOTPRINT",
      qtyCoefficient: 6.4483,
      wasteFactorPct: null,
      manualQuantity: 0,
      drivers: {
        floorArea: 220,
        wallArea: 400,
        perimeter: 50,
        volume: null,
        footprint: 145,
        bathrooms: null,
        floors: null,
      },
    });
    expect(quantity).toBe(935.004);
    expect(calculateLineAmounts({ quantity, materialUnitPrice: 34, laborUnitPrice: 17 }).lineTotal).toBe(47685.21);
  });

  it("ใบถอดแบบและเงินใช้การปัดตัวเดียวกัน", () => {
    expect(sumTakeoffSheet([{ label: "ฐาน", count: 145, length: 6.4483, width: null, height: null, barDia: null, deduct: false }], "เมตร", null).quantity).toBe(935.004);
    expect(round2(1.005)).toBe(1.01);
  });
});
