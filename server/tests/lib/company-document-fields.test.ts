import fs from "node:fs";
import path from "node:path";

import {
  branchLabel,
  paymentAccountFrom,
  paymentAccountLine,
  signatoryFrom,
} from "../../src/lib/company-fields";
import { readPngSize } from "../../src/lib/company-logo";
import {
  buildContractVariables,
  DEFAULT_CONTRACT_TEMPLATE,
  describeContractVariables,
  fillVariables,
  renderStructure,
} from "../../src/lib/contract-template";
import { renderCompanySigner, renderPaymentAccount } from "../../src/lib/pdf/company-blocks";
import { buildContractPdfHtml } from "../../src/lib/pdf/contract-pdf";
import { buildCustomerQuotePdfHtml } from "../../src/lib/pdf/customer-quote-pdf";
import { documentChrome, renderLetterhead } from "../../src/lib/pdf/letterhead";
import { buildQuotePdfHtml } from "../../src/lib/pdf/quote-pdf";

const ACCOUNT_SETTINGS = {
  paymentBankName: "ธนาคารกสิกรไทย",
  paymentBankBranch: "บางแค",
  paymentAccountName: "บริษัท อวาริน เอ็นจิเนียริ่ง จำกัด",
  paymentAccountNo: "123-4-56789-0",
  paymentPromptPay: "",
};
const ACCOUNT = paymentAccountFrom(ACCOUNT_SETTINGS)!;

// โลโก้ปลอมที่ต่างจากไฟล์ตั้งต้นแน่ ๆ — ตัวสร้าง PDF ไม่ถอดรูป แค่ฝังสตริงนี้ลง <img>
const CUSTOM_LOGO = "data:image/png;base64,Q1VTVE9NLUxBUkdF";
const CUSTOM_LOGO_SMALL = "data:image/png;base64,Q1VTVE9NLVNNQUxM";

describe("บัญชีรับเงินจากหน้าตั้งค่า", () => {
  it("ต้องครบ ธนาคาร ชื่อบัญชี เลขที่บัญชี จึงถือว่ามี — ขาดอย่างเดียวก็ไม่พิมพ์", () => {
    expect(ACCOUNT).toEqual({
      bankName: "ธนาคารกสิกรไทย",
      branch: "บางแค",
      accountName: "บริษัท อวาริน เอ็นจิเนียริ่ง จำกัด",
      accountNo: "123-4-56789-0",
      promptPay: null,
    });
    expect(paymentAccountFrom({ ...ACCOUNT_SETTINGS, paymentBankName: "" })).toBeNull();
    expect(paymentAccountFrom({ ...ACCOUNT_SETTINGS, paymentAccountName: "  " })).toBeNull();
    expect(paymentAccountFrom({ ...ACCOUNT_SETTINGS, paymentAccountNo: undefined })).toBeNull();
    expect(paymentAccountFrom({})).toBeNull();
  });

  it("เป็นประโยคเดียวสำหรับตัวแปรในสัญญา และไม่ใส่คำว่า สาขา ซ้ำ", () => {
    expect(paymentAccountLine(ACCOUNT)).toBe(
      "ธนาคารกสิกรไทย สาขาบางแค ชื่อบัญชี บริษัท อวาริน เอ็นจิเนียริ่ง จำกัด เลขที่บัญชี 123-4-56789-0",
    );
    expect(branchLabel("สาขาบางแค")).toBe("สาขาบางแค");
    expect(paymentAccountLine({ ...ACCOUNT, branch: null })).toBe(
      "ธนาคารกสิกรไทย ชื่อบัญชี บริษัท อวาริน เอ็นจิเนียริ่ง จำกัด เลขที่บัญชี 123-4-56789-0",
    );
  });

  it("กล่องการชำระเงินบนใบเสนอราคา — ไม่มีบัญชีก็ไม่พิมพ์อะไรเลย", () => {
    expect(renderPaymentAccount(null)).toBe("");
    const html = renderPaymentAccount({ ...ACCOUNT, promptPay: "0105561234567" });
    expect(html).toContain("โอนเข้าบัญชี ธนาคารกสิกรไทย สาขาบางแค");
    expect(html).toContain("123-4-56789-0");
    expect(html).toContain("พร้อมเพย์");
    expect(html).toContain("0105561234567");
    expect(renderPaymentAccount(ACCOUNT)).not.toContain("พร้อมเพย์");
  });

  it("หนีอักขระ HTML ในค่าที่พนักงานพิมพ์เอง", () => {
    const html = renderPaymentAccount({ ...ACCOUNT, accountName: "<b>A&B</b>" });
    expect(html).toContain("&lt;b&gt;A&amp;B&lt;/b&gt;");
    expect(html).not.toContain("<b>A");
  });
});

describe("ผู้มีอำนาจลงนาม", () => {
  it("ยังไม่ได้ตั้ง = null · ตำแหน่งไม่บังคับ", () => {
    expect(signatoryFrom({})).toBeNull();
    expect(signatoryFrom({ companySignatoryName: "  ", companySignatoryTitle: "กรรมการ" })).toBeNull();
    expect(signatoryFrom({ companySignatoryName: "นายสมชาย ใจดี" })).toEqual({
      name: "นายสมชาย ใจดี",
      title: null,
    });
  });

  it("ใต้เส้นเซ็น: ไม่มีผู้ลงนามพิมพ์ชื่อบริษัทแบบเดิม · มีแล้วบอกชื่อ ตำแหน่ง และในนามบริษัทไหน", () => {
    expect(renderCompanySigner("Awarin Co.", null)).toContain("( Awarin Co. )");
    const html = renderCompanySigner("Awarin Co.", { name: "นายสมชาย ใจดี", title: "กรรมการผู้จัดการ" });
    expect(html).toContain("( นายสมชาย ใจดี )");
    expect(html).toContain("กรรมการผู้จัดการ");
    expect(html).toContain("Awarin Co.");
    expect(html).not.toContain("( Awarin Co. )");
  });
});

describe("โลโก้ที่อัปโหลดเอง", () => {
  const asset = (name: string) => fs.readFileSync(path.resolve(__dirname, "../../src/assets", name));

  it("อ่านขนาดจาก header ของ PNG ได้ และปฏิเสธไฟล์ที่ไม่ใช่ PNG", () => {
    expect(readPngSize(asset("company-logo.png"))).toEqual({ width: 240, height: 128 });
    expect(readPngSize(asset("company-logo-small.png"))).toEqual({ width: 64, height: 34 });
    expect(readPngSize(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    // JPEG ขึ้นต้นด้วย FF D8 FF
    expect(readPngSize(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(40).fill(0)]))).toBeNull();
    expect(readPngSize(Buffer.alloc(4))).toBeNull();
  });

  const COMPANY = { companyName: "Awarin", companyAddress: "นครปฐม", companyPhone: "090 989 8342" };
  const DOC = { titleTh: "ใบเสนอราคา", titleEn: "QUOTATION", meta: [] };

  it("หัวจดหมายใช้โลโก้ที่ส่งมา · null = ไม่มีรูป · ไม่ส่ง = ไฟล์ตั้งต้น", () => {
    expect(renderLetterhead({ ...COMPANY, logo: CUSTOM_LOGO }, DOC)).toContain(`src="${CUSTOM_LOGO}"`);
    expect(renderLetterhead({ ...COMPANY, logo: null }, DOC)).not.toContain("<img");
    expect(renderLetterhead(COMPANY, DOC)).toContain("data:image/png;base64,");
  });

  it("แถบท้ายทุกหน้าใช้โลโก้ไฟล์เล็กที่ส่งมา", () => {
    const { footerTemplate } = documentChrome({ companyName: "Awarin", docLabel: "x", logoSmall: CUSTOM_LOGO_SMALL });
    expect(footerTemplate).toContain(`<img src="${CUSTOM_LOGO_SMALL}"`);
    expect(documentChrome({ companyName: "Awarin", docLabel: "x", logoSmall: null }).footerTemplate).not.toContain("<img");
  });

  it("อีเมลอยู่บรรทัดเดียวกับเบอร์โทร — หัวจดหมายต้องไม่สูงขึ้น", () => {
    const html = renderLetterhead({ ...COMPANY, companyEmail: "info@awarin.co.th" }, DOC);
    expect(html).toContain("<div>โทร. 090 989 8342 · อีเมล info@awarin.co.th</div>");
    expect(renderLetterhead(COMPANY, DOC)).not.toContain("อีเมล");
    expect(renderLetterhead({ ...COMPANY, companyPhone: "", companyEmail: "a@b.co" }, DOC)).toContain(
      "<div>อีเมล a@b.co</div>",
    );
  });
});

describe("ตัวแปรฝั่งบริษัทที่เพิ่มเข้ามาในแม่แบบสัญญา", () => {
  const base = {
    customerName: "คุณปวีณา",
    customerAddress: null,
    companyName: "Awarin",
    companyAddress: "นครปฐม",
    companyPhone: "090",
    companyTaxId: null,
    projectName: "บ้าน 2 ชั้น",
    projectNo: "PRJ-2026-0001",
    siteAddress: null,
    contractNo: "CT-2026-0001",
    contractDate: new Date(2026, 8, 15),
    contractAmount: 1_000_000,
    startDate: null,
    targetEndDate: null,
  };

  it("ยังไม่ได้ตั้ง = เส้นประให้เขียนเติม ไม่ใช่ช่องว่างที่เนียนจนหลุดถึงลูกค้า", () => {
    const vars = buildContractVariables({ ...base, companyTaxId: "" });
    expect(vars.ผู้มีอำนาจลงนาม).toMatch(/^\.+$/);
    expect(vars.ตำแหน่งผู้มีอำนาจลงนาม).toMatch(/^\.+$/);
    expect(vars.บัญชีรับเงิน).toMatch(/^\.+$/);
    expect(vars.อีเมลผู้รับจ้าง).toMatch(/^\.+$/);
    // เดิม "" ถูกส่งต่อตรง ๆ แล้วสัญญาพิมพ์ช่องว่างเปล่า
    expect(vars.เลขภาษีผู้รับจ้าง).toMatch(/^\.+$/);
  });

  it("แทนค่าได้เมื่อตั้งไว้แล้ว", () => {
    const vars = buildContractVariables({
      ...base,
      signatoryName: "นายสมชาย ใจดี",
      signatoryTitle: "กรรมการผู้จัดการ",
      paymentAccount: paymentAccountLine(ACCOUNT),
      companyEmail: "info@awarin.co.th",
    });
    expect(
      fillVariables("โดย {{ผู้มีอำนาจลงนาม}} ตำแหน่ง {{ตำแหน่งผู้มีอำนาจลงนาม}} โอนเข้า {{บัญชีรับเงิน}}", vars),
    ).toBe(
      "โดย นายสมชาย ใจดี ตำแหน่ง กรรมการผู้จัดการ โอนเข้า ธนาคารกสิกรไทย สาขาบางแค ชื่อบัญชี บริษัท อวาริน เอ็นจิเนียริ่ง จำกัด เลขที่บัญชี 123-4-56789-0",
    );
    expect(vars.อีเมลผู้รับจ้าง).toBe("info@awarin.co.th");
  });

  it("หน้าแก้แม่แบบเห็นค่าจริงของบัญชีรับเงิน หรือถูกเตือนว่าจะพิมพ์เป็นเส้นประ", () => {
    const withAccount = describeContractVariables(ACCOUNT_SETTINGS);
    const account = withAccount.find((i) => i.name === "บัญชีรับเงิน")!;
    expect(account.group).toBe("company");
    expect(account.missing).toBe(false);
    expect(account.preview).toContain("123-4-56789-0");

    const incomplete = describeContractVariables({ ...ACCOUNT_SETTINGS, paymentAccountNo: "" });
    expect(incomplete.find((i) => i.name === "บัญชีรับเงิน")!.missing).toBe(true);
    expect(incomplete.find((i) => i.name === "ผู้มีอำนาจลงนาม")!.missing).toBe(true);
  });
});

describe("สิ่งที่พิมพ์ลงเอกสารจริง", () => {
  const COMPANY = {
    companyName: "Awarin Engineering Co., Ltd.",
    companyAddress: "252/54 หมู่ 5 ตำบลธรรมศาลา",
    companyPhone: "090 989 8342",
    companyEmail: "info@awarin.co.th",
    logo: CUSTOM_LOGO,
    logoSmall: CUSTOM_LOGO_SMALL,
    signatory: { name: "นายสมชาย ใจดี", title: "กรรมการผู้จัดการ" },
  };
  const CUSTOMER = { customerName: "คุณปวีณา", customerAddress: null, siteAddress: null };

  it("สัญญา: ผู้ลงนามอยู่ใต้เส้นผู้รับจ้าง · อีเมลและโลโก้อยู่บนหน้าปก", () => {
    const vars = buildContractVariables({
      ...CUSTOMER,
      companyName: COMPANY.companyName,
      companyAddress: COMPANY.companyAddress,
      companyPhone: COMPANY.companyPhone,
      companyTaxId: null,
      projectName: "บ้าน",
      projectNo: "PRJ-2026-0001",
      contractNo: "CT-2026-0001",
      contractDate: new Date(2026, 8, 15),
      contractAmount: 1_000_000,
      startDate: null,
      targetEndDate: null,
    });
    const html = buildContractPdfHtml({
      ...COMPANY,
      ...CUSTOMER,
      contractNo: "CT-2026-0001",
      projectNo: "PRJ-2026-0001",
      projectName: "บ้าน",
      startDate: null,
      targetEndDate: null,
      date: new Date(2026, 8, 15),
      contractAmount: 1_000_000,
      signedAt: null,
      docTitle: DEFAULT_CONTRACT_TEMPLATE.docTitle,
      body: renderStructure(DEFAULT_CONTRACT_TEMPLATE.structure, vars),
      installments: [],
    });
    const signBlock = html.slice(html.indexOf('class="sign-block"'));
    expect(signBlock).toContain("( นายสมชาย ใจดี )");
    expect(signBlock).toContain("กรรมการผู้จัดการ");
    const cover = html.slice(html.indexOf('class="cover"'), html.indexOf("</section>"));
    expect(cover).toContain("อีเมล info@awarin.co.th");
    expect(cover).toContain(CUSTOM_LOGO);
  });

  const QUOTE_BASE = {
    ...CUSTOMER,
    quoteNo: "QT-2026-0001",
    revisionNo: 1,
    projectNo: "PRJ-2026-0001",
    projectName: "บ้าน",
    date: new Date(2026, 8, 15),
    groups: [],
    discountPct: null,
    discountAmt: 0,
    discountNote: null,
    vatPct: 7,
    vatAmt: 70,
    netPrice: 1070,
  };

  it("ใบเสนอราคาของลูกค้า: กล่องการชำระเงินอยู่ก่อนช่องเซ็น · ไม่มีบัญชีก็ไม่มีกล่อง", () => {
    const html = buildCustomerQuotePdfHtml({
      ...COMPANY,
      ...QUOTE_BASE,
      beforeDiscount: 1000,
      subtotalBeforeVat: 1000,
      paymentAccount: ACCOUNT,
    });
    expect(html).toContain('class="payment"');
    expect(html.indexOf('class="payment"')).toBeLessThan(html.indexOf('class="signature"'));
    expect(html).toContain("( นายสมชาย ใจดี )");

    const without = buildCustomerQuotePdfHtml({
      ...COMPANY,
      ...QUOTE_BASE,
      beforeDiscount: 1000,
      subtotalBeforeVat: 1000,
      paymentAccount: null,
    });
    expect(without).not.toContain('class="payment"');
  });

  it("BOQ ภายในมีผู้ลงนามเหมือนกัน แต่ไม่มีกล่องการชำระเงิน", () => {
    const html = buildQuotePdfHtml({
      ...COMPANY,
      ...QUOTE_BASE,
      directCost: 900,
      overheadProfitPct: 11.11,
      overheadProfitAmt: 100,
    });
    expect(html).toContain("( นายสมชาย ใจดี )");
    expect(html).not.toContain('class="payment"');
  });
});
