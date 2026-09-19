import {
  bodyPrintsInstallments,
  buildContractVariables,
  CONTRACT_VARIABLE_NAMES,
  type ContractStructure,
  DEFAULT_CONTRACT_TEMPLATE,
  describeContractVariables,
  fillVariables,
  renderStructure,
  thaiLongDate,
  unknownVariables,
} from "../../src/lib/contract-template";

const VARS = buildContractVariables({
  customerName: "คุณปวีณา แสงกล้า",
  customerAddress: "หมู่ 7 ต.บ้านแพ้ว อ.บ้านแพ้ว จ.สมุทรสาคร",
  companyName: "บริษัท เอวาริณ เอ็นจิเนียริ่ง จำกัด",
  companyAddress: "199/13 หมู่ 5 ต.นครปฐม อ.เมืองนครปฐม จ.นครปฐม",
  companyPhone: "090-9898342",
  companyTaxId: null,
  projectName: "บ้านพักอาศัย 2 ชั้น",
  projectNo: "PRJ-2026-0001",
  siteAddress: "บ้านรางป่ากล้วย",
  contractNo: "CT-2026-0001",
  contractDate: new Date(2022, 4, 1), // 1 พฤษภาคม 2565
  contractAmount: 2_600_000,
  startDate: new Date(2022, 4, 12),
  targetEndDate: null,
});

describe("ตัวแปรในแม่แบบสัญญา", () => {
  it("แทนค่าตัวแปรที่รู้จัก", () => {
    expect(fillVariables("ผู้ว่าจ้าง {{ชื่อผู้ว่าจ้าง}}", VARS)).toBe(
      "ผู้ว่าจ้าง คุณปวีณา แสงกล้า",
    );
    expect(fillVariables("{{มูลค่าสัญญา}} บาท ({{มูลค่าสัญญาตัวหนังสือ}})", VARS)).toBe(
      "2,600,000.00 บาท (สองล้านหกแสนบาทถ้วน)",
    );
  });

  it("ยอมให้มีช่องว่างรอบชื่อตัวแปร", () => {
    expect(fillVariables("{{ ชื่อโครงการ }}", VARS)).toBe("บ้านพักอาศัย 2 ชั้น");
  });

  it("ตัวแปรที่สะกดผิดถูกปล่อยไว้เหมือนเดิม ไม่ใช่กลายเป็นช่องว่าง", () => {
    // ช่องว่างเปล่า ๆ จะเนียนจนหลุดไปถึงลูกค้า ส่วน {{...}} ที่โผล่บนกระดาษคนเห็นแล้วรู้ทันที
    expect(fillVariables("เรียน {{ชื่อผู้วาจ้าง}}", VARS)).toBe("เรียน {{ชื่อผู้วาจ้าง}}");
  });

  it("ข้อมูลที่ยังไม่ได้กรอกกลายเป็นเส้นประให้เขียนเติมบนกระดาษ", () => {
    expect(VARS.วันแล้วเสร็จ).toMatch(/^\.+$/);
    expect(VARS.เลขภาษีผู้รับจ้าง).toMatch(/^\.+$/);
  });

  it("วันที่เป็น พ.ศ. แบบเต็ม ไม่ใช่ 1/5/2022", () => {
    expect(thaiLongDate(new Date(2022, 4, 1))).toBe("1 พฤษภาคม 2565");
    expect(VARS.วันเริ่มก่อสร้าง).toBe("12 พฤษภาคม 2565");
  });

  it("หาตัวแปรที่ระบบไม่รู้จักเจอ เพื่อเตือนตอนบันทึกแม่แบบ", () => {
    const s: ContractStructure = {
      coverSubtitle: "{{ชื่อโครงการ}}",
      preamble: "{{ชื่อผู้วาจ้าง}} กับ {{ชื่อผู้รับจ้าง}}",
      clauses: [{ heading: "ข้อ 1.", body: "{{ยอดเงิน}}" }],
      closing: "",
    };
    expect(unknownVariables(s).sort()).toEqual(["ชื่อผู้วาจ้าง", "ยอดเงิน"]);
    expect(unknownVariables(DEFAULT_CONTRACT_TEMPLATE.structure)).toEqual([]);
  });
});

describe("แม่แบบมาตรฐาน (ถอดจากสัญญาจริง)", () => {
  it("มีครบ 9 ข้อเหมือนต้นฉบับ", () => {
    expect(DEFAULT_CONTRACT_TEMPLATE.structure.clauses).toHaveLength(9);
  });

  it("ข้อ 8 แก้ให้ 'ผู้ว่าจ้าง' เป็นคนจ่ายเงิน (ต้นฉบับพิมพ์เป็นผู้รับจ้าง)", () => {
    const clause8 = DEFAULT_CONTRACT_TEMPLATE.structure.clauses[7];
    expect(clause8.body).toContain("“ผู้ว่าจ้าง” จะต้องชำระเงินตามงวดงาน");
    expect(clause8.body).not.toContain("“ผู้รับจ้าง” จะต้องชำระเงินตามงวดงาน");
  });

  it("ไม่มีคำสะกดผิดที่ยกมาจากต้นฉบับ", () => {
    const all = JSON.stringify(DEFAULT_CONTRACT_TEMPLATE.structure);
    for (const typo of ["บงพร่อง", "เหตูให้", "ขำระ", "กีดกวาง", "มรการ", "สัญญานี่"]) {
      expect(all).not.toContain(typo);
    }
  });

  it("ยังมีเนื้อหาสำคัญของต้นฉบับครบ", () => {
    const all = JSON.stringify(DEFAULT_CONTRACT_TEMPLATE.structure);
    expect(all).toContain("เป็นระยะเวลา 1 ปี"); // ประกันผลงาน
    // งวดเงินเป็นข้อมูลของสัญญาแต่ละฉบับ ข้อ 7 จึงถือแค่โทเคนไว้ให้ตัวพิมพ์วาดตารางแทน
    expect(all).toContain("{{ตารางงวดงาน}}");
    expect(all).toContain("ไม่รวมถึงการขอใบอนุญาตก่อสร้าง");
    expect(all).toContain("ทำขึ้นเป็นสองฉบับ");
  });

  it("แทนค่าแล้วเหลือแค่โทเคนบล็อก ไม่มีตัวแปรข้อความค้าง", () => {
    const rendered = renderStructure(DEFAULT_CONTRACT_TEMPLATE.structure, VARS);
    const leftover = JSON.stringify(rendered).match(/\{\{[^}]+\}\}/g) ?? [];
    // {{ตารางงวดงาน}} ต้องค้างไว้โดยตั้งใจ — ตัวพิมพ์ PDF วาดตารางจากงวดเงินของสัญญาฉบับนั้น
    expect(leftover).toEqual(["{{ตารางงวดงาน}}"]);
    expect(rendered.preamble).toContain("คุณปวีณา แสงกล้า");
    expect(rendered.clauses[6].body).toContain("2,600,000.00");
    expect(rendered.clauses[6].body).toContain("สองล้านหกแสนบาทถ้วน");
  });

  it("รู้ว่าเนื้อสัญญาจะพิมพ์ตารางงวดออกมาไหม", () => {
    expect(bodyPrintsInstallments(DEFAULT_CONTRACT_TEMPLATE.structure)).toBe(true);
    expect(
      bodyPrintsInstallments({
        coverSubtitle: "",
        preamble: "{{ตารางงวดงาน}}",  // อยู่นอกข้อสัญญา ตัวพิมพ์ไม่แทนที่ให้
        clauses: [{ heading: "ข้อ 1.", body: "จ่ายตามที่ตกลงกัน" }],
        closing: "",
      }),
    ).toBe(false);
  });

  it("แทนค่าแล้วไม่แก้ของเดิม (แม่แบบต้องยังมีตัวแปรอยู่สำหรับสัญญาใบถัดไป)", () => {
    renderStructure(DEFAULT_CONTRACT_TEMPLATE.structure, VARS);
    expect(DEFAULT_CONTRACT_TEMPLATE.structure.preamble).toContain("{{ชื่อผู้ว่าจ้าง}}");
  });
});

/**
 * คำอธิบาย "ตัวแปรนี้จะพิมพ์ออกมาเป็นอะไร" ที่หน้าแก้แม่แบบแสดงข้างชื่อตัวแปร
 *
 * สิ่งที่ต้องไม่พัง: รายการต้องครบและตรงกับตัวแปรที่ใช้แทนค่าจริง ไม่งั้นหน้าจอจะเสนอตัวแปร
 * ที่ระบบไม่รู้จัก (ถูกพิมพ์ออกมาทั้งวงเล็บ) หรือซ่อนตัวที่ใช้ได้ไป
 */
describe("describeContractVariables", () => {
  const settings = {
    companyName: "Awarin Engineering Co., Ltd.",
    companyAddress: "252/54 หมู่ 5",
    companyPhone: "090 989 8342",
    companyTaxId: "",
  };

  it("ครบทุกตัวแปรที่ระบบแทนค่าได้ เรียงลำดับเดียวกัน", () => {
    const info = describeContractVariables(settings);
    expect(info.map((i) => i.name)).toEqual(CONTRACT_VARIABLE_NAMES);
    expect(Object.keys(VARS).sort()).toEqual([...CONTRACT_VARIABLE_NAMES].sort());
  });

  it("แยกฝั่งลูกค้ากับฝั่งเราเป็นคนละกลุ่ม — คำต่างกันแค่พยางค์เดียว สลับกันง่ายที่สุด", () => {
    const info = describeContractVariables(settings);
    const groupOf = (name: string) => info.find((i) => i.name === name)?.group;
    expect(groupOf("ที่อยู่ผู้ว่าจ้าง")).toBe("customer");
    expect(groupOf("ที่อยู่ผู้รับจ้าง")).toBe("company");
    expect(groupOf("เลขภาษีผู้ว่าจ้าง")).toBe("customer");
    expect(groupOf("เลขภาษีผู้รับจ้าง")).toBe("company");
  });

  it("ฝั่งบริษัทแสดงค่าจริงจากหน้าตั้งค่า ช่องที่ยังไม่ได้ตั้งถูกบอกว่าจะพิมพ์เป็นเส้นประ", () => {
    const info = describeContractVariables(settings);
    const address = info.find((i) => i.name === "ที่อยู่ผู้รับจ้าง")!;
    expect(address.preview).toBe("252/54 หมู่ 5");
    expect(address.missing).toBe(false);

    const taxId = info.find((i) => i.name === "เลขภาษีผู้รับจ้าง")!;
    expect(taxId.missing).toBe(true);
    expect(taxId.preview).toContain("เส้นประ");
  });

  /**
   * กับดักที่เจอจริง: ตัวเลขไม่มีคำว่าบาท แต่ตัวหนังสือมีบาทติดมาแล้ว — ดูจากชื่อไม่มีทางรู้
   * ตัวอย่างต้องมาจากตัวแปลงตัวเดียวกับที่พิมพ์ลงสัญญาจริง ไม่ใช่ข้อความที่พิมพ์ไว้เอง
   */
  it("บอกว่าตัวแปรเงินตัวไหนมีคำว่าบาทในตัว ตัวไหนต้องพิมพ์ต่อเอง", () => {
    const info = describeContractVariables(settings);
    const money = info.find((i) => i.name === "มูลค่าสัญญา")!;
    const words = info.find((i) => i.name === "มูลค่าสัญญาตัวหนังสือ")!;
    expect(money.preview).not.toContain("บาท");
    expect(money.note).toContain("พิมพ์ต่อเอง");
    expect(words.preview.endsWith("บาทถ้วน")).toBe(true);
    expect(words.note).toContain("ไม่ต้องพิมพ์ซ้ำ");
  });

  it("ตัวอย่างวันที่ใช้รูปแบบเดียวกับที่พิมพ์ลงสัญญา", () => {
    const today = new Date(2026, 8, 15);
    const info = describeContractVariables(settings, today);
    expect(info.find((i) => i.name === "วันที่ทำสัญญา")!.preview).toBe(`เช่น ${thaiLongDate(today)}`);
  });
});

/**
 * หน้าแก้แม่แบบไฮไลต์ตัวแปรด้วยตัวจับของตัวเอง (staff-app/src/lib/variable-highlight.ts)
 * เทสต์นี้ล็อกพฤติกรรมฝั่งเซิร์ฟเวอร์ที่หน้าจออ้างถึง — ถ้าฝั่งใดฝั่งหนึ่งเปลี่ยน หน้าจอจะบอกว่าถูก
 * ทั้งที่เอกสารออกมาผิด
 */
describe("กรณีที่หน้าแก้แม่แบบเตือนว่าจะพิมพ์ออกมาทั้งวงเล็บ", () => {
  it("ลืมปิด }} แล้วตัวแปรที่ตามมาถูกกลืน ทั้งก้อนไม่ถูกแทนค่า รวมตัวที่สะกดถูก", () => {
    const out = fillVariables("{{มูลค่าสัญญา{{วันที่ทำสัญญา}} บาท", VARS);
    expect(out).toBe("{{มูลค่าสัญญา{{วันที่ทำสัญญา}} บาท");
  });

  it("มีช่องว่างในวงเล็บยังแทนค่าได้ (หน้าจอจึงไม่ไฮไลต์เป็นตัวผิด)", () => {
    expect(fillVariables("{{ ชื่อโครงการ }}", VARS)).toBe(VARS.ชื่อโครงการ);
  });
});
