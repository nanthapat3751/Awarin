import {
  billingPartyOf,
  splitWithholding,
  WITHHOLDING_TAX_PCT,
  withholdingFor,
} from "../../src/lib/billing-party";

describe("ผู้ว่าจ้างบนเอกสาร (billingPartyOf)", () => {
  const person = { fullName: "สมชาย ใจดี" };

  it("บุคคลธรรมดาใช้ชื่อเจ้าของบัญชี และไม่มีเลขภาษี/ผู้ประสานงาน", () => {
    const party = billingPartyOf(person, {
      customerType: "INDIVIDUAL",
      address: "1 ถนนทดสอบ",
      // ค่าที่ค้างอยู่จากตอนเคยเป็นนิติบุคคลต้องไม่หลุดขึ้นเอกสาร
      companyName: "บริษัท เก่า จำกัด",
      taxId: "0105500000001",
    });

    expect(party.isCompany).toBe(false);
    expect(party.name).toBe("สมชาย ใจดี");
    expect(party.taxId).toBeNull();
    expect(party.contactPerson).toBeNull();
    expect(party.address).toBe("1 ถนนทดสอบ");
  });

  it("นิติบุคคลใช้ชื่อบริษัทเป็นชื่อผู้ว่าจ้าง และใช้ชื่อเจ้าของบัญชีเป็นผู้ประสานงานโดยปริยาย", () => {
    const party = billingPartyOf(person, {
      customerType: "COMPANY",
      companyName: "บริษัท ทดสอบ จำกัด",
      taxId: "0105500000001",
      branch: "สำนักงานใหญ่",
    });

    expect(party.isCompany).toBe(true);
    expect(party.name).toBe("บริษัท ทดสอบ จำกัด");
    expect(party.taxId).toBe("0105500000001");
    expect(party.branch).toBe("สำนักงานใหญ่");
    expect(party.contactPerson).toBe("สมชาย ใจดี");
  });

  it("ระบุผู้ประสานงานคนอื่นได้ โดยชื่อผู้ว่าจ้างยังเป็นชื่อบริษัท", () => {
    const party = billingPartyOf(person, {
      customerType: "COMPANY",
      companyName: "บริษัท ทดสอบ จำกัด",
      contactPerson: "คุณมานี ฝ่ายจัดซื้อ",
    });
    expect(party.name).toBe("บริษัท ทดสอบ จำกัด");
    expect(party.contactPerson).toBe("คุณมานี ฝ่ายจัดซื้อ");
  });

  it("เป็นนิติบุคคลแต่ชื่อบริษัทว่าง ต้องตกกลับไปใช้ชื่อคน ไม่ใช่พิมพ์ช่องว่างลงสัญญา", () => {
    const party = billingPartyOf(person, { customerType: "COMPANY", companyName: "   " });
    expect(party.name).toBe("สมชาย ใจดี");
  });

  it("ไม่มีโปรไฟล์เลยก็ยังได้ชื่อคน", () => {
    expect(billingPartyOf(person, null).name).toBe("สมชาย ใจดี");
  });
});

describe("ภาษีหัก ณ ที่จ่าย (withholdingFor)", () => {
  it("บุคคลธรรมดาไม่ต้องหัก — ผู้มีหน้าที่หักคือผู้จ่ายเงินที่เป็นนิติบุคคล", () => {
    expect(withholdingFor({ isCompany: false }, 107_000, 7_000)).toBeNull();
  });

  it("คิดจากมูลค่างานก่อน VAT ไม่ใช่ยอดรวมทั้งสิ้น", () => {
    const w = withholdingFor({ isCompany: true }, 107_000, 7_000);
    expect(w).not.toBeNull();
    expect(w!.pct).toBe(WITHHOLDING_TAX_PCT);
    expect(w!.base).toBe(100_000);
    expect(w!.tax).toBe(3_000);
    // ยอดโอนสุทธิหักจาก "ยอดรวมทั้งสิ้น" เพราะ VAT ยังต้องจ่ายเต็ม
    expect(w!.netTransfer).toBe(104_000);
  });

  it("ไม่รู้ยอด VAT = ไม่พิมพ์ตัวเลข (ห้ามเดาว่า 7%)", () => {
    expect(withholdingFor({ isCompany: true }, 107_000, null)).toBeNull();
  });

  it("ยอดเป็นศูนย์หรือติดลบไม่คืนค่า", () => {
    expect(withholdingFor({ isCompany: true }, 0, 0)).toBeNull();
  });
});

describe("แบ่งภาษีหัก ณ ที่จ่ายรายงวด (splitWithholding)", () => {
  it("ผลรวมของทุกงวดต้องเท่ากับยอดหักทั้งสัญญาเป๊ะ ๆ แม้หารไม่ลงตัว", () => {
    const w = withholdingFor({ isCompany: true }, 107_000, 7_000)!;
    const installments = [{ amount: 35_666.67 }, { amount: 35_666.67 }, { amount: 35_666.66 }];

    const split = splitWithholding(w, 107_000, installments);
    const summed = split.reduce((sum, i) => sum + i.tax, 0);

    expect(split).toHaveLength(3);
    expect(Math.round(summed * 100) / 100).toBe(w.tax);
  });

  it("แต่ละงวดหักตามสัดส่วนของงวดนั้น และยอดโอนสุทธิ = ยอดงวด − ภาษีที่หัก", () => {
    const w = withholdingFor({ isCompany: true }, 107_000, 7_000)!;
    const split = splitWithholding(w, 107_000, [{ amount: 53_500 }, { amount: 53_500 }]);

    expect(split[0].tax).toBe(1_500);
    expect(split[0].netTransfer).toBe(52_000);
    expect(split[1].tax).toBe(1_500);
  });

  it("ไม่มีงวดเลยก็ไม่พัง", () => {
    const w = withholdingFor({ isCompany: true }, 107_000, 7_000)!;
    expect(splitWithholding(w, 107_000, [])).toEqual([]);
  });
});
