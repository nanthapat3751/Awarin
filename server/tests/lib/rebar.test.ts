import { STANDARD_REBARS, rebarUnitWeightKgPerM, rebarWeightKg } from "@systemboq/shared-types";

// สูตรถอดปริมาณเหล็กเส้น: น้ำหนัก (กก./ม.) = d² / 162
describe("rebar take-off formula (kg = length × d²/162)", () => {
  it("computes unit weight kg/m per diameter (matches standard bar weights)", () => {
    expect(rebarUnitWeightKgPerM(6)).toBeCloseTo(0.222, 3); // RB6
    expect(rebarUnitWeightKgPerM(9)).toBeCloseTo(0.5, 3); // RB9
    expect(rebarUnitWeightKgPerM(12)).toBeCloseTo(0.889, 3); // DB12
    expect(rebarUnitWeightKgPerM(16)).toBeCloseTo(1.58, 2); // DB16
    expect(rebarUnitWeightKgPerM(20)).toBeCloseTo(2.469, 3); // DB20
    expect(rebarUnitWeightKgPerM(25)).toBeCloseTo(3.858, 3); // DB25
  });

  it("multiplies length by unit weight to get total kg", () => {
    // DB12 ยาวรวม 100 ม. → 100 × 0.8889 = 88.89 กก.
    expect(rebarWeightKg(100, 12)).toBeCloseTo(88.89, 2);
    // DB16 ยาวรวม 50 ม. → 50 × 1.5802 = 79.01 กก.
    expect(rebarWeightKg(50, 16)).toBeCloseTo(79.01, 2);
  });

  it("equals length × d² / 162 for any input", () => {
    const d = 20;
    const len = 37.5;
    expect(rebarWeightKg(len, d)).toBeCloseTo((len * d * d) / 162, 9);
  });

  it("ships the standard Thai bar sizes (RB round / DB deformed)", () => {
    expect(STANDARD_REBARS.map((r) => r.code)).toEqual([
      "RB6",
      "RB9",
      "DB10",
      "DB12",
      "DB16",
      "DB20",
      "DB25",
      "DB28",
      "DB32",
    ]);
    expect(STANDARD_REBARS.find((r) => r.code === "RB9")?.round).toBe(true);
    expect(STANDARD_REBARS.find((r) => r.code === "DB12")?.round).toBe(false);
  });
});
