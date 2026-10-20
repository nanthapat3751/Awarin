import {
  DEFAULT_STRUCTURAL_SETTINGS,
  DEFAULT_TAKEOFF_RULES,
  normalizeTakeoffRules,
  settingsFromRuleSet,
  structuralTakeoff,
  sumTakeoffSheet,
  takeoffRowValue,
  takeoffShapeForUnit,
  takeoffShapeOf,
  type StructuralInput,
} from "@systemboq/shared-types";

/** ใบถอดแบบ: จำนวน × ยาว × กว้าง × สูง (× d²/162 ถ้าเป็นเหล็ก) · แถวหักลบออก · เผื่อเสียคูณท้าย */
describe("ใบถอดแบบ", () => {
  it("ปริมาตรหลายแถวรวมกันแล้วเผื่อเสีย", () => {
    const rows = [
      { label: "F1", count: 8, length: 1.2, width: 1.2, height: 0.3 },
      { label: "F2", count: 4, length: 1, width: 1, height: 0.3 },
    ];
    // 3.456 + 1.2 = 4.656 → +5% = 4.8888
    expect(sumTakeoffSheet(rows, "ลบ.ม.", 5)).toEqual({ added: 4.656, deducted: 0, net: 4.656, quantity: 4.889 });
  });

  it("หักช่องเปิดออกจากพื้นที่ผนัง", () => {
    const rows = [
      { label: "ผนังห้องนอน", count: 2, length: 4, width: 3 },
      { label: "ประตู D1", count: 1, length: 0.9, width: 2, deduct: true },
      { label: "หน้าต่าง W1", count: 2, length: 1.2, width: 1, deduct: true },
    ];
    // 24 − 1.8 − 2.4
    expect(sumTakeoffSheet(rows, "ตร.ม.", null)).toEqual({ added: 24, deducted: 4.2, net: 19.8, quantity: 19.8 });
  });

  it("มิติที่เว้นว่างไม่ถูกคูณ", () => {
    expect(takeoffRowValue({ label: "สุขภัณฑ์", count: 3 }, "ชุด")).toBe(3);
    expect(takeoffRowValue({ label: "บัว", count: 2, length: 4.5 }, "ม.")).toBe(9);
  });

  it("แถวเหล็กคิดน้ำหนัก d²/162 · บรรทัดหน่วยตันแปลงให้", () => {
    const row = { label: "เหล็กล่าง", count: 10, length: 6, barDia: 12 };
    expect(sumTakeoffSheet([row], "กก.", 0).quantity).toBe(53.333);
    expect(sumTakeoffSheet([row], "ตัน", 0).quantity).toBe(0.053);
  });

  it("เดารูปแบบจากหน่วย และไม่ซ่อนมิติที่แถวกรอกไว้", () => {
    expect(takeoffShapeForUnit("ลบ.ม.")).toBe("VOLUME");
    expect(takeoffShapeForUnit("ตร.ม.")).toBe("AREA");
    expect(takeoffShapeForUnit("ม.")).toBe("LENGTH");
    expect(takeoffShapeForUnit("กก.")).toBe("WEIGHT");
    expect(takeoffShapeForUnit("ชุด")).toBe("COUNT");
    // หน่วย "ชุด" แต่แถวมีกว้าง×ยาว → ต้องโชว์คอลัมน์ให้เห็น
    expect(takeoffShapeOf([{ length: 2, width: 1 }], "ชุด")).toBe("AREA");
    expect(takeoffShapeOf([{ length: 2, barDia: 12 }], "กก.")).toBe("WEIGHT");
    // บรรทัดเหล็กที่มีแค่แถว "ปริมาณเดิม" (นับอย่างเดียว) ไม่ต้องโชว์ช่องขนาดเหล็ก
    expect(takeoffShapeOf([{}], "กก.")).toBe("COUNT");
  });
});

describe("ตัวคิดชิ้นส่วนโครงสร้าง", () => {
  const settings = (cover: number) => ({ ...DEFAULT_STRUCTURAL_SETTINGS, cover });
  const valueOf = (rows: ReturnType<typeof structuralTakeoff>["rows"], label: string) =>
    rows.find((r) => r.row.label.includes(label))!;

  it("คาน: คอนกรีต · ไม้แบบข้าง+ท้อง · เหล็กบน/ล่าง · ปลอกพร้อมขอ", () => {
    const input: StructuralInput = {
      kind: "BEAM",
      label: "B1",
      count: 2,
      width: 0.2,
      depth: 0.4,
      length: 4,
      topBars: { count: 2, dia: 12 },
      bottomBars: { count: 3, dia: 16 },
      ties: { dia: 6, spacing: 0.15 },
      settings: settings(0.03),
    };
    const { rows, errors } = structuralTakeoff(input);
    expect(errors).toEqual([]);
    expect(valueOf(rows, "คาน").value).toBeCloseTo(0.64, 6);
    // (2×0.4 + 0.2) × 4 × 2
    expect(valueOf(rows, "แบบ").value).toBeCloseTo(8, 6);
    // ยาวรวม 4 ม. วัดถึงผิวนอกเสา — เหล็กหักระยะหุ้มปลาย 2 × 0.03
    expect(valueOf(rows, "เหล็กบน").row).toMatchObject({ count: 4, length: 3.94, barDia: 12 });
    expect(valueOf(rows, "เหล็กล่าง").row).toMatchObject({ count: 6, length: 3.94, barDia: 16 });
    // 4 ÷ 0.15 = 26.67 ปัดขึ้น 27 ช่อง + 1 = 28 วง/ชิ้น × 2 (ระยะในแบบคือ "ไม่เกิน" ช่องสุดท้ายห้ามกว้างกว่า)
    // วงละ 2×(0.14+0.34) + 2×10×6 มม. = 1.08 ม.
    const ties = valueOf(rows, "ปลอก");
    expect(ties.row).toMatchObject({ count: 56, length: 1.08, barDia: 6 });
    expect(ties.value).toBeCloseTo(56 * 1.08 * (36 / 162), 6);
  });

  it("เหล็กยาวเกิน 10 ม. บวกระยะทาบ 40d ต่อจุดต่อ", () => {
    const { rows } = structuralTakeoff({
      kind: "BEAM",
      label: "B2",
      count: 1,
      width: 0.2,
      depth: 0.5,
      length: 12,
      bottomBars: { count: 2, dia: 16 },
      settings: settings(0.03),
    });
    // 12 − หุ้มปลาย 2×0.03 = 11.94 → เกิน 10 ม. ต่อ 1 จุด + 40×16 มม.
    expect(valueOf(rows, "เหล็กล่าง").row.length).toBeCloseTo(12.58, 6);
  });

  it("เสา: แบบ 4 ด้าน · เหล็กยืนบวกทาบต่อชั้น", () => {
    const { rows } = structuralTakeoff({
      kind: "COLUMN",
      label: "C1",
      count: 4,
      width: 0.2,
      depth: 0.2,
      length: 3,
      mainBars: { count: 4, dia: 12 },
      ties: { dia: 6, spacing: 0.2 },
      settings: settings(0.035),
    });
    expect(valueOf(rows, "เสา").value).toBeCloseTo(0.48, 6);
    expect(valueOf(rows, "แบบเสา").value).toBeCloseTo(9.6, 6);
    expect(valueOf(rows, "เหล็กยืน").row).toMatchObject({ count: 16, length: 3.48 });
    expect(valueOf(rows, "ปลอก").row).toMatchObject({ count: 64, length: 0.64 });
  });

  it("ฐานราก: แบบข้างรอบรูป · ตะแกรงสองทางหักระยะหุ้ม", () => {
    const { rows } = structuralTakeoff({
      kind: "FOOTING",
      label: "F1",
      count: 8,
      width: 1.2,
      depth: 0.3,
      length: 1.2,
      mesh: { dia: 12, spacing: 0.15 },
      settings: settings(0.075),
    });
    expect(valueOf(rows, "ฐานราก").value).toBeCloseTo(3.456, 6);
    expect(valueOf(rows, "แบบข้าง").value).toBeCloseTo(11.52, 6);
    // ระยะในหุ้ม 1.05 ÷ 0.15 = 7 → 8 เส้น/ทาง/ฐาน
    expect(valueOf(rows, "แนวยาว").row).toMatchObject({ count: 64, length: 1.05 });
    expect(valueOf(rows, "แนวกว้าง").row).toMatchObject({ count: 64, length: 1.05 });
  });

  it("พื้นเทบนดินไม่มีไม้แบบท้องพื้น", () => {
    const base = {
      kind: "SLAB" as const,
      label: "S1",
      count: 1,
      width: 3,
      depth: 0.1,
      length: 4,
      mesh: { dia: 9, spacing: 0.2 },
      settings: settings(0.02),
    };
    expect(structuralTakeoff(base).rows.some((r) => r.group === "FORMWORK")).toBe(true);
    expect(structuralTakeoff({ ...base, onGround: true }).rows.some((r) => r.group === "FORMWORK")).toBe(false);
  });

  // ตัวเลขชุดนี้มาจากแบบจริง (บ้านคุณก้อย แบบ S-06): F1 = หัวเสาเข็ม 0.9×0.9×0.5 "16-DB16 + 2ป-RB6@0.10"
  it("ฐานรากหัวเสาเข็ม: เหล็กยืนรอบฐานงอบนล่าง + ปลอกรัดสี่เหลี่ยมและข้าวหลามตัดเป็นชั้น", () => {
    const { rows, errors } = structuralTakeoff({
      kind: "FOOTING",
      label: "F1",
      count: 15,
      width: 0.9,
      depth: 0.5,
      length: 0.9,
      footingType: "PILE_CAP",
      mainBars: { count: 16, dia: 16 },
      ties: { dia: 6, spacing: 0.1 },
      diamondTies: true,
      settings: settings(0.075),
    });
    expect(errors).toEqual([]);
    // ไม่มีตะแกรง — หัวเสาเข็มใช้เหล็กยืน + ปลอกรัดแทน
    expect(rows.some((r) => r.row.label.includes("ตะแกรง"))).toBe(false);
    // สูงในหุ้ม 0.5 − 2×0.075 = 0.35 + งอ 2×12×16 มม. = 0.734
    expect(valueOf(rows, "เหล็กยืนรอบฐาน").row).toMatchObject({ count: 240, length: 0.734, barDia: 16 });
    // 0.35 ÷ 0.10 = 3.5 → 4 ช่อง → 5 ชั้น × 15 ฐาน · รอบนอก 2×(0.75+0.75) + ขอ 2×10×6 มม.
    expect(valueOf(rows, "ปลอกรัดรอบ").row).toMatchObject({ count: 75, length: 3.12, barDia: 6 });
    // ข้าวหลามตัด 4×√(0.375²+0.375²) + 0.12 = 2.2413
    expect(valueOf(rows, "ปลอกข้าวหลามตัด").row).toMatchObject({ count: 75, length: 2.241 });
    // คอนกรีต/ไม้แบบคิดเหมือนฐานแผ่
    expect(valueOf(rows, "ฐานราก").value).toBeCloseTo(6.075, 6);
    expect(valueOf(rows, "แบบข้าง").value).toBeCloseTo(27, 6);
  });

  // F2 แบบ S-06: 1.2×0.7×0.4 "4-DB16 (แนวยาว) + 8-DB16 (แนวกว้าง)" งอขึ้นเป็นรูปตัว U
  it("ฐานราก: ตะแกรงกำหนดเป็นจำนวนเส้น + งอขึ้นถึงผิวบน", () => {
    const { rows } = structuralTakeoff({
      kind: "FOOTING",
      label: "F2",
      count: 2,
      width: 0.7,
      depth: 0.4,
      length: 1.2,
      mesh: { dia: 16, spacing: 0.15 },
      meshCount: { long: 4, short: 8 },
      endBends: true,
      meshBendUp: true,
      settings: settings(0.075),
    });
    // ขาตัว U สูง 0.4 − 2×0.075 = 0.25 ต่อข้าง
    const long = valueOf(rows, "แนวยาว");
    expect(long.row).toMatchObject({ count: 8, length: 1.55 });
    expect(long.row.label).toContain("4-DB16");
    expect(long.explain).toContain("งอขึ้นถึงผิวบน");
    expect(valueOf(rows, "แนวกว้าง").row).toMatchObject({ count: 16, length: 1.05 });
  });

  it("ตะแกรงจำนวนเส้นต้องเป็นจำนวนเต็มทั้งสองแนว", () => {
    const { rows, errors } = structuralTakeoff({
      kind: "FOOTING",
      label: "F2",
      count: 1,
      width: 0.7,
      depth: 0.4,
      length: 1.2,
      mesh: { dia: 16, spacing: 0.15 },
      meshCount: { long: 4, short: 0 },
      settings: settings(0.075),
    });
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("จำนวนเส้นตะแกรง");
  });

  it("คานคอดินเทบนดิน: ไม้แบบเฉพาะข้าง ไม่มีท้องคาน", () => {
    const base = {
      kind: "BEAM" as const,
      label: "B3-1",
      count: 1,
      width: 0.2,
      depth: 0.4,
      length: 3,
      settings: settings(0.03),
    };
    expect(valueOf(structuralTakeoff(base).rows, "แบบข้าง").value).toBeCloseTo(3, 6);
    const onGround = valueOf(structuralTakeoff({ ...base, onGround: true }).rows, "แบบข้าง");
    expect(onGround.row.label).toBe("B3-1 แบบข้างคาน");
    expect(onGround.value).toBeCloseTo(2.4, 6);
  });

  it("แบบขอบพื้น: รอบรูปเต็มเมื่อไม่ระบุ · ระบุความยาวขอบเองได้", () => {
    const base = {
      kind: "SLAB" as const,
      label: "GS",
      count: 1,
      width: 5,
      depth: 0.1,
      length: 10,
      onGround: true,
      settings: settings(0.02),
    };
    expect(structuralTakeoff(base).rows.some((r) => r.row.label.includes("แบบขอบ"))).toBe(false);
    expect(valueOf(structuralTakeoff({ ...base, edgeForm: { length: null } }).rows, "แบบขอบ").value).toBeCloseTo(3, 6);
    // พื้นรูปไม่เหลี่ยม — ขอบจริง 51 ม. ตามที่วัดจากแปลน
    expect(valueOf(structuralTakeoff({ ...base, edgeForm: { length: 51 } }).rows, "แบบขอบ").value).toBeCloseTo(5.1, 6);
  });

  it("ฐานรากงอปลายตะแกรงขึ้นสองข้าง ข้างละ 12d", () => {
    const { rows } = structuralTakeoff({
      kind: "FOOTING",
      label: "F1",
      count: 1,
      width: 1.5,
      depth: 0.4,
      length: 1.5,
      mesh: { dia: 12, spacing: 0.15 },
      endBends: true,
      settings: settings(0.075),
    });
    // 1.35 ÷ 0.15 = 9 ช่อง → 10 เส้น · ยาว 1.35 + 2×12×12 มม. = 1.638
    const mesh = valueOf(rows, "แนวยาว");
    expect(mesh.row).toMatchObject({ count: 10, length: 1.638 });
    expect(mesh.explain).toContain("งอปลาย 2×12d");
  });

  it("คานงอปลายเหล็กบน/ล่างเข้าเสาทั้งสองข้าง", () => {
    const { rows } = structuralTakeoff({
      kind: "BEAM",
      label: "B1",
      count: 1,
      width: 0.2,
      depth: 0.4,
      length: 4,
      topBars: { count: 2, dia: 12 },
      bottomBars: { count: 2, dia: 16 },
      endBends: true,
      settings: settings(0.03),
    });
    // 4 − หุ้มปลาย 2×0.03 + งอ 2×12d
    expect(valueOf(rows, "เหล็กบน").row.length).toBeCloseTo(4.228, 6);
    expect(valueOf(rows, "เหล็กล่าง").row.length).toBeCloseTo(4.324, 6);
  });

  it("คาน: หักเสาที่พาดผ่าน + พื้นบนคาน — คอนกรีต/ไม้แบบ/ปลอกใช้ช่วงสุทธิใต้ท้องพื้น เหล็กยังเต็มยาวรวม", () => {
    const beam = (slabSides: 1 | 2) =>
      structuralTakeoff({
        kind: "BEAM",
        label: "B1",
        count: 1,
        width: 0.2,
        depth: 0.4,
        length: 4,
        bottomBars: { count: 2, dia: 12 },
        ties: { dia: 6, spacing: 0.15 },
        supports: { count: 2, width: 0.2 },
        slabOnTop: { thickness: 0.1, sides: slabSides },
        settings: settings(0.03),
      });
    const { rows, errors } = beam(2);
    expect(errors).toEqual([]);
    // ช่วงสุทธิ 4 − 2×0.2 = 3.6 · ใต้ท้องพื้น 0.4 − 0.1 = 0.3 → 0.2 × 0.3 × 3.6
    expect(valueOf(rows, "B1 คาน").value).toBeCloseTo(0.216, 6);
    expect(valueOf(rows, "B1 คาน").row).toMatchObject({ length: 3.6, width: 0.2, height: 0.3 });
    // พื้นสองข้าง: (ข้าง 2×0.3 + ท้อง 0.2) × 3.6
    expect(valueOf(rows, "แบบ").value).toBeCloseTo(2.88, 6);
    // คานขอบ พื้นข้างเดียว: (0.3 + 0.4 + 0.2) × 3.6
    expect(valueOf(beam(1).rows, "แบบ").value).toBeCloseTo(3.24, 6);
    // ปลอกเฉพาะช่วงสุทธิ: 3.6 ÷ 0.15 = 24 + 1 = 25 วง · วงยังสูงเต็มความลึกคาน (ปลอกขึ้นไปในพื้น)
    expect(valueOf(rows, "ปลอก").row).toMatchObject({ count: 25, length: 1.08 });
    // เหล็กล่างวิ่งเต็มยาวรวมถึงผิวนอกเสา: 4 − หุ้มปลาย 2×0.03
    expect(valueOf(rows, "เหล็กล่าง").row.length).toBeCloseTo(3.94, 6);
  });

  it("คาน: เสา/พื้นที่กรอกแล้วกินคานหมด = แจ้งเตือน ไม่คืนแถว", () => {
    const base = { kind: "BEAM" as const, label: "B1", count: 1, width: 0.2, depth: 0.4, length: 1, settings: settings(0.03) };
    expect(structuralTakeoff({ ...base, supports: { count: 5, width: 0.2 } }).errors).toEqual([
      "ความกว้างเสารวมกันเท่ากับหรือยาวกว่าคาน — ตรวจยาวรวมหรือจำนวนเสา",
    ]);
    expect(structuralTakeoff({ ...base, slabOnTop: { thickness: 0.4, sides: 2 } }).errors).toEqual([
      "พื้นบนคานหนาเท่ากับหรือมากกว่าความลึกคาน",
    ]);
  });

  it("พื้น: ตะแกรงบนแยกขนาด/ระยะจากชั้นล่าง — ได้ 4 แถว (ล่าง/บน × สองแนว)", () => {
    const { rows, errors } = structuralTakeoff({
      kind: "SLAB",
      label: "S1",
      count: 1,
      width: 3,
      depth: 0.1,
      length: 4,
      mesh: { dia: 9, spacing: 0.2 },
      meshTop: { dia: 6, spacing: 0.25 },
      settings: settings(0.02),
    });
    expect(errors).toEqual([]);
    const labels = rows.filter((r) => r.group === "REBAR").map((r) => r.row.label);
    expect(labels).toEqual([
      "S1 ตะแกรงล่างแนวยาว RB9@0.2",
      "S1 ตะแกรงล่างแนวกว้าง RB9@0.2",
      "S1 ตะแกรงบนแนวยาว RB6@0.25",
      "S1 ตะแกรงบนแนวกว้าง RB6@0.25",
    ]);
    // ชั้นบนแนวยาว: วางเรียงตามกว้างสุทธิ 3 − 2×0.02 = 2.96 ÷ 0.25 = 11.84 → 12 + 1 = 13 เส้น ยาวเส้นละ 4 − 0.04
    expect(valueOf(rows, "ตะแกรงบนแนวยาว").row).toMatchObject({ count: 13, length: 3.96, barDia: 6 });
  });

  it("นับจุดทาบโดยคิดว่าทาบกินความยาวเหล็ก — 2 เส้นทาบกันได้ไม่ถึง 2 เท่าของยาวต่อเส้น", () => {
    const beam = (length: number) =>
      valueOf(
        structuralTakeoff({
          kind: "BEAM",
          label: "B1",
          count: 1,
          width: 0.2,
          depth: 0.4,
          length,
          bottomBars: { count: 2, dia: 12 },
          settings: settings(0.03),
        }).rows,
        "เหล็กล่าง",
      );
    // 19.8 − หุ้มปลาย 0.06 = 19.74 · เหล็ก 10 ม. สองเส้นทาบ 0.48 ได้แค่ 19.52 → ต้อง 3 เส้น 2 จุด
    // ⌈(19.74 − 10) ÷ (10 − 0.48)⌉ = 2 → 19.74 + 2 × 0.48 = 20.70 (เดิมนับ 1 จุด ได้ 20.22 เหล็กขาด)
    const long = beam(19.8);
    expect(long.row.length).toBeCloseTo(20.7, 6);
    expect(long.explain).toContain("ทาบ 2×40d");
    // 19.5 − 0.06 = 19.44 ≤ 19.52 → สองเส้นยังพอ ทาบจุดเดียว
    expect(beam(19.5).row.length).toBeCloseTo(19.92, 6);
  });

  it("ระยะทาบยาวเท่าเหล็กทั้งเส้น = แจ้งเตือน ไม่คิดเลขวนไม่จบ", () => {
    const { rows, errors } = structuralTakeoff({
      kind: "BEAM",
      label: "B1",
      count: 1,
      width: 0.2,
      depth: 0.4,
      length: 12,
      bottomBars: { count: 2, dia: 25 },
      settings: { ...settings(0.03), lapFactor: 400 },
    });
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("ระยะทาบยาวเท่ากับหรือเกินความยาวเหล็กต่อเส้น");
  });

  it("คาน: ยาวรวมไม่เกินระยะหุ้มปลายสองข้าง = ไม่มีที่วางเหล็ก", () => {
    const { rows, errors } = structuralTakeoff({
      kind: "BEAM",
      label: "B1",
      count: 1,
      width: 0.2,
      depth: 0.4,
      length: 0.06,
      bottomBars: { count: 2, dia: 12 },
      settings: settings(0.03),
    });
    expect(rows).toEqual([]);
    expect(errors).toEqual(["ยาวรวมของคานต้องมากกว่าระยะหุ้มปลายสองข้าง"]);
  });

  it("เสาต้นล่าง: ฝังฐานรากถึงตะแกรงล่างแล้วงอ · ชั้นบนสุดงอเข้าคานแทนทาบ", () => {
    const column = (extra: Partial<StructuralInput>) =>
      valueOf(
        structuralTakeoff({
          kind: "COLUMN",
          label: "C1",
          count: 1,
          width: 0.2,
          depth: 0.2,
          length: 3,
          mainBars: { count: 4, dia: 12 },
          settings: settings(0.035),
          ...extra,
        }).rows,
        "เหล็กยืน",
      ).row.length;
    // 3 + ฝัง (0.4 − 0.075) + งอในฐาน 0.144 + ทาบต่อชั้น 0.48
    expect(column({ footingDepth: 0.4 })).toBeCloseTo(3.949, 6);
    // ต้นเดียวจบ (ชั้นเดียว): ฝังฐาน + งอฐาน + งอเข้าคาน 0.144
    expect(column({ footingDepth: 0.4, topFloor: true })).toBeCloseTo(3.613, 6);
    // เสาชั้นบน (ไม่ตั้งบนฐาน) ชั้นบนสุด
    expect(column({ topFloor: true })).toBeCloseTo(3.144, 6);
  });

  it("ปลอกถี่ช่วงปลาย: นับปลายสองข้าง + ช่วงกลาง ไม่นับวงที่รอยต่อซ้ำ", () => {
    const beam = (tieEndZone: StructuralInput["tieEndZone"], length = 4) =>
      valueOf(
        structuralTakeoff({
          kind: "BEAM",
          label: "B1",
          count: 1,
          width: 0.2,
          depth: 0.4,
          length,
          ties: { dia: 6, spacing: 0.15 },
          tieEndZone,
          settings: settings(0.03),
        }).rows,
        "ปลอก",
      );
    // ปลายข้างละ 1 ม. @0.10 = 11 วง (รวมวงที่ปลายและที่รอยต่อ) · กลาง 2 ม. @0.15 = 14 ช่อง → 13 วงข้างใน
    const zoned = beam({ spacing: 0.1, length: 1 });
    expect(zoned.row.count).toBe(35);
    expect(zoned.row.label).toContain("@0.1/0.15");
    // ถ้าไม่มีช่วงปลาย = 28 วง — ถี่ปลายได้มากขึ้น 7 วง
    expect(beam(null).row.count).toBe(28);
    // ช่วงปลายสองข้างยาวเกินชิ้น = ถี่ตลอด: 1.5 ÷ 0.1 = 15 ช่อง → 16 วง
    expect(beam({ spacing: 0.1, length: 0.8 }, 1.5).row.count).toBe(16);
  });

  it("เหล็กที่งอปลายแล้วยาวเกินเหล็กที่ขาย ต้องบวกระยะทาบด้วย", () => {
    const { rows } = structuralTakeoff({
      kind: "SLAB",
      label: "S1",
      count: 1,
      width: 3,
      depth: 0.1,
      length: 9.9,
      mesh: { dia: 9, spacing: 0.2 },
      endBends: true,
      settings: settings(0.02),
    });
    // 9.86 + 2×12×9 มม. = 10.076 > 10 → ทาบ 1 จุด 40×9 มม.
    expect(valueOf(rows, "แนวยาว").row.length).toBeCloseTo(10.436, 6);
  });

  it("ข้อมูลผิดไม่คืนแถว แต่บอกเหตุผล", () => {
    const bad = structuralTakeoff({
      kind: "COLUMN",
      label: "C9",
      count: 1,
      width: 0.05,
      depth: 0.2,
      length: 3,
      ties: { dia: 6, spacing: 0.2 },
      settings: settings(0.035),
    });
    expect(bad.rows).toEqual([]);
    expect(bad.errors).toContain("ระยะหุ้มมากกว่าขนาดชิ้นส่วน");
    expect(structuralTakeoff({ kind: "BEAM", label: "B", count: 1.5, width: 0.2, depth: 0.4, length: 4, settings: settings(0.03) }).errors.length).toBeGreaterThan(0);
    const beam = { kind: "BEAM" as const, label: "B", count: 1, width: 0.2, depth: 0.4, length: 4, ties: { dia: 6, spacing: 0.15 }, settings: settings(0.03) };
    expect(structuralTakeoff({ ...beam, tieEndZone: { spacing: 0, length: 1 } }).errors[0]).toContain("ปลอกช่วงปลาย");
    expect(structuralTakeoff({ ...beam, kind: "COLUMN", footingDepth: 0.05 }).errors[0]).toContain("ความหนาฐานราก");
  });
});

/**
 * ชุดกฎ "เสนอราคา" — ยาวตามแบบ ไม่หักระยะหุ้ม ไม่งอ ไม่ทาบ ไม่มีขอปลอก (วิธีของ BOQ บริษัท บ้านคุณก้อย Rev2)
 * ชุด "สั่งตัด" = ผลแบบเดิมทุกข้อ (เทสต์ด้านบนทั้งหมดคือชุดนี้)
 */
describe("ชุดกฎการถอดปริมาณ", () => {
  const tender = (cover: number) => settingsFromRuleSet(DEFAULT_TAKEOFF_RULES.tender, cover);
  const site = (cover: number) => settingsFromRuleSet(DEFAULT_TAKEOFF_RULES.site, cover);
  const valueOf = (rows: ReturnType<typeof structuralTakeoff>["rows"], label: string) =>
    rows.find((r) => r.row.label.includes(label))!;
  const beam = (settings: ReturnType<typeof tender>): StructuralInput => ({
    kind: "BEAM",
    label: "B1",
    count: 1,
    width: 0.2,
    depth: 0.4,
    length: 3,
    topBars: { count: 2, dia: 12 },
    bottomBars: { count: 2, dia: 12 },
    ties: { dia: 6, spacing: 0.15 },
    endBends: true,
    settings,
  });

  it("คาน: เสนอราคา = ยาวตามแบบ · ปลอกรอบนอกไม่มีขอ — สั่งตัดเหมือนเดิม", () => {
    const t = structuralTakeoff(beam(tender(0.03))).rows;
    expect(valueOf(t, "เหล็กบน").row).toMatchObject({ count: 2, length: 3 });
    expect(valueOf(t, "เหล็กบน").explain).toContain("ยาวตามแบบ");
    expect(valueOf(t, "ปลอก").row).toMatchObject({ count: 21, length: 1.2 });
    expect(valueOf(t, "ปลอก").explain).not.toContain("ขอ");
    const s = structuralTakeoff(beam(site(0.03))).rows;
    expect(valueOf(s, "เหล็กบน").row.length).toBeCloseTo(3.228, 6);
    expect(valueOf(s, "ปลอก").row.length).toBeCloseTo(1.08, 6);
    // คอนกรีต/ไม้แบบไม่ขึ้นกับชุดกฎ
    expect(valueOf(t, "คาน").value).toBeCloseTo(valueOf(s, "คาน").value, 9);
    expect(valueOf(t, "แบบข้าง").value).toBeCloseTo(valueOf(s, "แบบข้าง").value, 9);
  });

  it("เสา: เสนอราคาไม่ฝังฐานราก ไม่งอ ไม่ทาบต่อชั้น", () => {
    const col = (settings: ReturnType<typeof tender>, topFloor: boolean): StructuralInput => ({
      kind: "COLUMN",
      label: "C1",
      count: 1,
      width: 0.2,
      depth: 0.2,
      length: 3,
      mainBars: { count: 4, dia: 12 },
      footingDepth: 0.5,
      topFloor,
      settings,
    });
    expect(valueOf(structuralTakeoff(col(tender(0.035), true)).rows, "เหล็กยืน").row.length).toBe(3);
    expect(valueOf(structuralTakeoff(col(tender(0.035), false)).rows, "เหล็กยืน").row.length).toBe(3);
    // สั่งตัด: 3 + ฝัง 0.425 + งอ 0.144 + ทาบ 0.48
    expect(valueOf(structuralTakeoff(col(site(0.035), false)).rows, "เหล็กยืน").row.length).toBeCloseTo(4.049, 6);
  });

  it("หัวเสาเข็ม: เสนอราคานับชั้นปลอกเต็มความหนา วัดรอบนอก", () => {
    const { rows } = structuralTakeoff({
      kind: "FOOTING",
      label: "F1",
      count: 1,
      width: 0.9,
      depth: 0.5,
      length: 0.9,
      footingType: "PILE_CAP",
      mainBars: { count: 16, dia: 16 },
      ties: { dia: 6, spacing: 0.1 },
      diamondTies: true,
      settings: tender(0.075),
    });
    // 0.5 ÷ 0.10 + 1 = 6 ชั้น · รอบนอก 2×(0.9+0.9) = 3.6 · ข้าวหลามตัด 4×√(0.45²+0.45²) = 2.546
    expect(valueOf(rows, "ปลอกรัดรอบ").row).toMatchObject({ count: 6, length: 3.6 });
    expect(valueOf(rows, "ปลอกข้าวหลามตัด").row).toMatchObject({ count: 6, length: 2.546 });
    expect(valueOf(rows, "เหล็กยืนรอบฐาน").row).toMatchObject({ count: 16, length: 0.5 });
  });

  it("ตะแกรงรูปตัว U งอขึ้นเสมอ (เป็นรูปทรงในแบบ) แต่ขาวัดเต็มความหนาเมื่อไม่หักระยะหุ้ม", () => {
    const { rows } = structuralTakeoff({
      kind: "FOOTING",
      label: "F2",
      count: 1,
      width: 0.7,
      depth: 0.4,
      length: 1.2,
      mesh: { dia: 16, spacing: 1 },
      meshCount: { long: 4, short: 8 },
      endBends: true,
      meshBendUp: true,
      settings: tender(0.075),
    });
    // ตรงกับไฟล์วิศวกร: 0.4 + 1.2 + 0.4 = 2.0 · 0.4 + 0.7 + 0.4 = 1.5
    expect(valueOf(rows, "แนวยาว").row).toMatchObject({ count: 4, length: 2 });
    expect(valueOf(rows, "แนวกว้าง").row).toMatchObject({ count: 8, length: 1.5 });
  });

  it("ค่าที่เก็บไว้ไม่ครบ/ผิดชนิด ใช้ค่าตั้งต้นแทน — ไม่พัง", () => {
    expect(normalizeTakeoffRules(null)).toEqual(DEFAULT_TAKEOFF_RULES);
    const r = normalizeTakeoffRules({ tender: { bends: true, lapFactor: "50", wastePct: { "12": 8, "20": null, x: 3, "16": 500 } }, site: { hooks: false } });
    expect(r.tender.bends).toBe(true);
    expect(r.tender.lapFactor).toBe(40);
    expect(r.tender.wastePct).toEqual({ "6": 5, "9": 7, "12": 8, "16": 11, "20": null });
    expect(r.site.hooks).toBe(false);
    expect(r.site.deductCover).toBe(true);
  });
});

/** Phase 1: เหล็กเสริมพิเศษคาน · เหล็กเดือยฐานราก · บันได */
describe("ชิ้นส่วนเพิ่มเติม", () => {
  const tender = (cover: number) => settingsFromRuleSet(DEFAULT_TAKEOFF_RULES.tender, cover);
  const site = (cover: number) => settingsFromRuleSet(DEFAULT_TAKEOFF_RULES.site, cover);
  const valueOf = (rows: ReturnType<typeof structuralTakeoff>["rows"], label: string) =>
    rows.find((r) => r.row.label.includes(label))!;

  it("คานช่วงเดียว: เหล็กพิเศษบน L/4 ที่ปลายทั้งสอง + ล่างกลางช่วงตัดห่างหน้าเสา L/5", () => {
    const { rows, errors } = structuralTakeoff({
      kind: "BEAM",
      label: "B4",
      count: 1,
      width: 0.2,
      depth: 0.4,
      length: 3.5,
      supports: { count: 2, width: 0.2 },
      extraTop: { count: 2, dia: 12, ratio: 0.25 },
      extraBottom: { count: 2, dia: 12, ratio: 0.2 },
      settings: tender(0.03),
    });
    expect(errors).toEqual([]);
    // ช่วงสุทธิ 3.5 − 2×0.2 = 3.1 · บน 3.1/4 = 0.775 × (2 เส้น × 2 ปลาย) · ล่าง 3.1 × 0.6 = 1.86
    expect(valueOf(rows, "เหล็กพิเศษบน").row).toMatchObject({ count: 4, length: 0.775, barDia: 12 });
    expect(valueOf(rows, "เหล็กพิเศษบน").explain).toContain("L/4");
    expect(valueOf(rows, "เหล็กพิเศษล่าง").row).toMatchObject({ count: 2, length: 1.86 });
  });

  it("คานต่อเนื่อง 2 ช่วง: จุดรองรับกลางยื่นสองข้าง · ล่างคิดทุกช่วง", () => {
    const { rows } = structuralTakeoff({
      kind: "BEAM",
      label: "B5",
      count: 1,
      width: 0.2,
      depth: 0.4,
      length: 7.2,
      supports: { count: 3, width: 0.2 },
      extraTop: { count: 2, dia: 12, ratio: 0.25 },
      extraBottom: { count: 2, dia: 12, ratio: 0.2 },
      settings: site(0.03),
    });
    // ช่วงสุทธิ 6.6 ÷ 2 ช่วง = 3.3 · ปลาย 0.825 · กลาง 1.65 · ล่าง 3.3 × 0.6 = 1.98 × 2 ช่วง
    expect(valueOf(rows, "เหล็กพิเศษบน 2-DB12 ปลาย").row).toMatchObject({ count: 4, length: 0.825 });
    expect(valueOf(rows, "เหล็กพิเศษบน 2-DB12 กลาง").row).toMatchObject({ count: 2, length: 1.65 });
    expect(valueOf(rows, "เหล็กพิเศษล่าง").row).toMatchObject({ count: 4, length: 1.98 });
  });

  it("เหล็กเดือยฐานราก: จำนวนต่อฐาน × ยาวตามแบบ (ไม่ขึ้นกับชุดกฎ)", () => {
    const input: StructuralInput = {
      kind: "FOOTING",
      label: "F1",
      count: 15,
      width: 0.9,
      depth: 0.5,
      length: 0.9,
      footingType: "PILE_CAP",
      mainBars: { count: 16, dia: 16 },
      dowels: { count: 4, dia: 20, length: 1 },
      settings: tender(0.075),
    };
    expect(valueOf(structuralTakeoff(input).rows, "เหล็กเดือย").row).toMatchObject({ count: 60, length: 1, barDia: 20 });
    expect(valueOf(structuralTakeoff({ ...input, settings: site(0.075) }).rows, "เหล็กเดือย").row.length).toBe(1);
  });

  it("บันได: คอนกรีตท้องเอียง + ขั้น · ไม้แบบท้อง/ลูกตั้ง/ข้าง · เหล็กหลัก/กันร้าว ตามชุดกฎ", () => {
    const stair = (settings: ReturnType<typeof tender>): StructuralInput => ({
      kind: "STAIR",
      label: "ST1",
      count: 1,
      width: 1,
      depth: 0.12,
      length: 2.5,
      stair: { rise: 1.7, steps: 10, main: { dia: 12, spacing: 0.15 }, distribution: { dia: 9, spacing: 0.25 } },
      settings,
    });
    const t = structuralTakeoff(stair(tender(0.02)));
    expect(t.errors).toEqual([]);
    const slope = Math.hypot(2.5, 1.7);
    expect(valueOf(t.rows, "ท้องบันได").value).toBeCloseTo(0.12 * slope, 6);
    // 10 ขั้น × ½ × 0.25 × 0.17 × 1
    expect(valueOf(t.rows, "ขั้นบันได").value).toBeCloseTo(0.2125, 6);
    expect(valueOf(t.rows, "แบบท้องบันได").value).toBeCloseTo(slope, 6);
    expect(valueOf(t.rows, "แบบลูกตั้ง").value).toBeCloseTo(1.7, 6);
    expect(valueOf(t.rows, "แบบข้างบันได").value).toBeCloseTo(2 * (0.12 * slope + 0.2125), 3);
    // ชุดเสนอราคา: ไม่หักระยะหุ้ม ไม่งอ — หลัก ⌈1/0.15⌉+1 = 8 เส้นยาวเอียงเต็ม · กันร้าว ⌈3.023/0.25⌉+1 = 14 เส้นยาว 1
    expect(valueOf(t.rows, "เหล็กหลัก").row).toMatchObject({ count: 8, length: 3.023, barDia: 12 });
    expect(valueOf(t.rows, "เหล็กกันร้าว").row).toMatchObject({ count: 14, length: 1, barDia: 9 });
    // ชุดสั่งตัด: หักหุ้ม 2 ซม. + งอ 2×12d
    const s = structuralTakeoff(stair(site(0.02)));
    expect(valueOf(s.rows, "เหล็กหลัก").row).toMatchObject({ count: 8, length: 3.271 });
    expect(valueOf(s.rows, "เหล็กกันร้าว").row).toMatchObject({ count: 13, length: 0.96 });
  });

  it("บันไดไม่กรอกความสูง/จำนวนขั้น = แจ้งเตือน ไม่คืนแถว", () => {
    const { rows, errors } = structuralTakeoff({
      kind: "STAIR",
      label: "ST1",
      count: 1,
      width: 1,
      depth: 0.12,
      length: 2.5,
      stair: { rise: 1.7, steps: 0, main: null, distribution: null },
      settings: tender(0.02),
    });
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("บันได");
  });
});
