import {
  TILE_BREAKAGE_DEFAULT_PCT,
  groutKgPerSqm,
  parseTileSize,
  tileComponents,
  tileConfigErrors,
  tilePricingErrors,
  tileTakeoff,
  type TileCalcConfig,
} from "@systemboq/shared-types";

function config(patch: Partial<TileCalcConfig> = {}): TileCalcConfig {
  return {
    sourceMaterialId: null,
    tileName: "",
    widthMm: 600,
    lengthMm: 600,
    thicknessMm: 9,
    jointMm: 2,
    piecesPerBox: 4,
    rotate: false,
    pattern: "STRAIGHT",
    wastePct: 0,
    adhesive: null,
    grout: null,
    trim: null,
    tilePrice: null,
    tilePriceUnit: "SQM",
    priced: false,
    ...patch,
  };
}

const bathroom = { label: "ห้องน้ำ", count: 1, length: 1.5, width: 2 };

/** ตัวคิดกระเบื้อง: นับตามแนวปูทีละห้อง ไม่ใช่พื้นที่ ÷ พื้นที่แผ่น */
describe("ตัวคิดกระเบื้อง — นับตามแนวปู", () => {
  it("ห้องน้ำ 1.5 × 2 ม. ปู 60×60 ร่อง 2 มม. ใช้ 10 แผ่น (หารพื้นที่ได้แค่ 8.3)", () => {
    const r = tileTakeoff(config(), { rows: [bathroom], area: 0 });
    // ยาว 1.5: เต็ม 2 เศษ 0.296 (แผ่นหนึ่งตัดได้ 2 ชิ้น) · กว้าง 2.0: เต็ม 3 เศษ 0.194 (ได้ 3 ชิ้น)
    // เต็ม 6 + ขอบ ⌈3/2⌉=2 + ขอบ ⌈2/3⌉=1 + มุม 1 = 10
    expect(r.mode).toBe("LAYOUT");
    expect(r.area).toBe(3);
    expect(r.basePieces).toBe(10);
    expect(r.cutPct).toBe(0);
    expect(r.pieces).toBe(10);
    expect(r.boxes).toBe(3);
    expect(r.rooms[0].explain).toContain("= 10 แผ่น");
  });

  it("เผื่อแตกหักปัดขึ้นเป็นแผ่นเต็ม", () => {
    const r = tileTakeoff(config({ wastePct: TILE_BREAKAGE_DEFAULT_PCT }), { rows: [bathroom], area: 0 });
    expect(r.pieces).toBe(11); // 10 × 1.03 = 10.3
  });

  it("ห้องพอดีแผ่น ไม่มีแผ่นตัด", () => {
    const r = tileTakeoff(config({ jointMm: 0 }), { rows: [{ label: "ห้อง", count: 1, length: 1.2, width: 1.8 }], area: 0 });
    expect(r.basePieces).toBe(6);
  });

  it("ห้องที่เหมือนกันหลายห้องใช้เศษที่ตัดร่วมกัน", () => {
    const r = tileTakeoff(config(), { rows: [{ ...bathroom, count: 2 }], area: 0 });
    // เต็ม 12 + ขอบ ⌈6/2⌉=3 + ขอบ ⌈4/3⌉=2 + มุม ⌈2/6⌉=1 = 18 (แยกห้องจะเป็น 20)
    expect(r.basePieces).toBe(18);
  });

  it("ช่องหักคืนเฉพาะแผ่นเต็มที่อยู่ในช่องแน่ ๆ", () => {
    const tile30 = config({ widthMm: 300, lengthMm: 300, jointMm: 3 });
    const room = { label: "ครัว", count: 1, length: 3, width: 3 };
    const full = tileTakeoff(tile30, { rows: [room], area: 0 }).basePieces;
    const withCounter = tileTakeoff(tile30, {
      rows: [room, { label: "ฐานเคาน์เตอร์", count: 1, length: 1.2, width: 1.2, deduct: true }],
      area: 0,
    });
    // 1.2 ÷ 0.303 = 3.96 → แน่ ๆ 2 แผ่นต่อแนว → 2 × 2 = 4
    expect(withCounter.basePieces).toBe(full - 4);
    expect(withCounter.area).toBe(7.56);
    // ช่องเล็กกว่าสองแผ่นไม่คืนเลย
    const tiny = tileTakeoff(tile30, {
      rows: [room, { label: "ท่อ", count: 1, length: 0.6, width: 0.6, deduct: true }],
      area: 0,
    });
    expect(tiny.basePieces).toBe(full);
  });

  it("แผ่นสี่เหลี่ยมผืนผ้า: หมุนแนววางแล้วนับใหม่ตามแนว", () => {
    const rect = config({ widthMm: 300, lengthMm: 600 });
    const room = { label: "ระเบียง", count: 1, length: 3, width: 1.2 };
    const along = tileTakeoff(rect, { rows: [room], area: 0 });
    // ด้านยาวแผ่นตามด้านยาวห้อง: ยาว 3.0 = 4 แผ่น + เศษ 0.588 · กว้าง 1.2 = 3 แผ่น + เศษ 0.291 → 12+3+4+1
    expect(along.basePieces).toBe(20);
    const rotated = tileTakeoff({ ...rect, rotate: true }, { rows: [room], area: 0 });
    expect(rotated.rooms[0].explain).not.toBe(along.rooms[0].explain);
  });
});

describe("ตัวคิดกระเบื้อง — คิดจากพื้นที่", () => {
  it("ลายทแยง: พื้นที่ ÷ (แผ่น + ร่อง)² + เผื่อเศษตัด 10% + แตกหัก", () => {
    const r = tileTakeoff(config({ widthMm: 300, lengthMm: 300, jointMm: 3, pattern: "DIAGONAL", wastePct: 3 }), {
      rows: [{ label: "โถง", count: 1, length: 5, width: 4 }],
      area: 20,
    });
    // 20 ÷ 0.303² = 217.844 × 1.13 = 246.2
    expect(r.mode).toBe("AREA");
    expect(r.cutPct).toBe(10);
    expect(r.basePieces).toBe(217.844);
    expect(r.pieces).toBe(247);
  });

  it("ไม่มีขนาดห้อง (บรรทัดคิดจากค่าวัด): ใช้พื้นที่ + เผื่อเศษตัดปูตรง 5%", () => {
    const r = tileTakeoff(config(), { rows: null, area: 20 });
    expect(r.mode).toBe("AREA");
    expect(r.areaReason).toBe("ยังไม่มีขนาดห้อง");
    expect(r.cutPct).toBe(5);
    // 20 ÷ 0.602² = 55.187 × 1.05 = 57.9
    expect(r.pieces).toBe(58);
  });

  it("แถวที่ไม่ใช่ ยาว × กว้าง ทำให้นับตามแนวปูไม่ได้", () => {
    const r = tileTakeoff(config(), { rows: [{ label: "ยอดรวม", count: 12 }], area: 12 });
    expect(r.mode).toBe("AREA");
    expect(r.areaReason).toContain("ยาว × กว้าง");
  });
});

describe("ตัวคิดกระเบื้อง — ของประกอบ", () => {
  it("ยาแนวตามสูตรผู้ผลิต (ก + ย) ÷ (ก × ย) × ร่อง × ลึก × 1.6", () => {
    expect(groutKgPerSqm(300, 300, 3, 8)).toBeCloseTo(0.256, 6);
    expect(groutKgPerSqm(600, 600, 2, 9)).toBeCloseTo(0.096, 6);
    expect(groutKgPerSqm(600, 600, 0, 9)).toBe(0);
  });

  it("ปูนกาว/ยาแนว/คิ้ว ปัดเป็นถุง/เส้น", () => {
    const r = tileTakeoff(
      config({
        adhesive: { kgPerSqm: 6, bagKg: 20, wastePct: 5, pricePerBag: null },
        grout: { packKg: 1, wastePct: 10, pricePerPack: null },
        trim: { lengthM: 6.2, pieceLengthM: 2.5, pricePerPiece: null },
      }),
      { rows: [{ label: "ห้อง", count: 1, length: 4, width: 5 }], area: 0 },
    );
    expect(r.adhesive).toEqual({ kgPerSqm: 6, kg: 126, bags: 7 }); // 20 × 6 × 1.05
    expect(r.grout).toEqual({ kgPerSqm: 0.096, kg: 2.112, packs: 3 }); // 20 × 0.096 × 1.1
    expect(r.trim).toEqual({ pieces: 3 });
  });

  it("วัสดุย่อยต่อ ตร.ม. คูณกลับแล้วไม่เกินจำนวนจริง (รายการสั่งซื้อไม่ปัดเพิ่ม)", () => {
    const c = config({
      wastePct: 3,
      tilePrice: 350,
      priced: true,
      adhesive: { kgPerSqm: 6, bagKg: 20, wastePct: 5, pricePerBag: 180 },
    });
    const r = tileTakeoff(c, { rows: [bathroom], area: 0 });
    const comps = tileComponents(c, r, 3);
    // 11 แผ่น = 2.75 กล่อง ÷ 3 ตร.ม. · ราคา 350 × 4 แผ่น × 0.36 ตร.ม. = 504 บาท/กล่อง
    expect(comps[0]).toMatchObject({ unit: "กล่อง", qtyPerUnit: 0.9166, unitPrice: 504, wasteFactorPct: null });
    expect(Math.ceil(comps[0].qtyPerUnit * 3 - 1e-9)).toBe(3);
    expect(comps[1]).toMatchObject({ name: "ปูนกาว (ถุง 20 กก.)", unit: "ถุง", qtyPerUnit: 0.3, wasteFactorPct: 5 });
  });

  it("ไม่รู้แผ่นต่อกล่อง = สั่งเป็นแผ่น ราคาต่อแผ่นจากราคาต่อ ตร.ม.", () => {
    const c = config({ piecesPerBox: null, tilePrice: 300, priced: true });
    const r = tileTakeoff(c, { rows: [bathroom], area: 0 });
    expect(tileComponents(c, r, 3)[0]).toMatchObject({ unit: "แผ่น", unitPrice: 108 });
  });
});

describe("ตัวคิดกระเบื้อง — ตรวจค่า", () => {
  it("ยาแนวกับร่อง 0 มม. · ราคาต่อกล่องโดยไม่รู้แผ่นต่อกล่อง · ราคายังไม่ครบ", () => {
    expect(tileConfigErrors(config({ jointMm: 0, grout: { packKg: 1, wastePct: 0, pricePerPack: 20 } }))[0]).toContain("0 มม.");
    expect(tilePricingErrors(config({ tilePrice: 500, tilePriceUnit: "BOX", piecesPerBox: null }))).toContain(
      "ราคาต่อกล่องต้องรู้จำนวนแผ่นต่อกล่อง",
    );
    expect(tilePricingErrors(config({ tilePrice: 300, adhesive: { kgPerSqm: 5, bagKg: 20, wastePct: 0, pricePerBag: null } }))).toEqual([
      "กรอกราคาปูนกาวต่อถุง",
    ]);
    expect(tileTakeoff(config({ widthMm: 5 }), { rows: [bathroom], area: 0 }).errors).toHaveLength(1);
  });

  it("แถวหักมากกว่าพื้นที่ห้อง = ใช้ไม่ได้", () => {
    const r = tileTakeoff(config(), {
      rows: [bathroom, { label: "เกิน", count: 1, length: 2, width: 2, deduct: true }],
      area: 0,
    });
    expect(r.errors[0]).toContain("แถวหัก");
  });
});

describe("อ่านขนาดแผ่นจากชื่อวัสดุ", () => {
  it.each([
    ["F2 - พื้น ปูกระเบื้องเซรามิก ขนาด 300x300", { widthMm: 300, lengthMm: 300 }],
    ["งานปูกระเบื้องเซรามิกผนัง ขนาด 300x600", { widthMm: 300, lengthMm: 600 }],
    ["ปูกระเบื้องพื้นเซรามิค 60x60 ซม.", { widthMm: 600, lengthMm: 600 }],
    ["แกรนิตโต้ 60×120", { widthMm: 600, lengthMm: 1200 }],
    ["กระเบื้องยางลายไม้", null],
  ])("%s", (name, expected) => {
    expect(parseTileSize(name)).toEqual(expected);
  });
});
