import {
  buildContractVariables,
  DEFAULT_CONTRACT_TEMPLATE,
  renderStructure,
} from "../../src/lib/contract-template";
import { buildContractPdfHtml } from "../../src/lib/pdf/contract-pdf";

const VARS = buildContractVariables({
  customerName: "คุณปวีณา แสงกล้า",
  customerAddress: "หมู่ 7 ต.บ้านแพ้ว จ.สมุทรสาคร",
  companyName: "Awarin Engineering Co., Ltd.",
  companyAddress: "252/54 หมู่ 5 ตำบลธรรมศาลา",
  companyPhone: "090 989 8342",
  companyTaxId: null,
  projectName: "บ้านพักอาศัย 2 ชั้น",
  projectNo: "PRJ-2026-0001",
  siteAddress: "บ้านรางป่ากล้วย",
  contractNo: "CT-2026-0001",
  contractDate: new Date(2022, 4, 1),
  contractAmount: 2_600_000,
  startDate: new Date(2022, 4, 12),
  targetEndDate: new Date(2023, 1, 28),
});

const BASE = {
  companyName: "Awarin Engineering Co., Ltd.",
  companyAddress: "252/54 หมู่ 5 ตำบลธรรมศาลา",
  companyPhone: "090 989 8342",
  companyTaxId: null,
  contractNo: "CT-2026-0001",
  projectNo: "PRJ-2026-0001",
  projectName: "บ้านพักอาศัย 2 ชั้น",
  customerName: "คุณปวีณา แสงกล้า",
  customerAddress: "หมู่ 7 ต.บ้านแพ้ว จ.สมุทรสาคร",
  siteAddress: "บ้านรางป่ากล้วย",
  startDate: new Date(2022, 4, 12),
  targetEndDate: new Date(2023, 1, 28),
  date: new Date(2022, 4, 1),
  contractAmount: 2_600_000,
  signedAt: null,
  docTitle: DEFAULT_CONTRACT_TEMPLATE.docTitle,
};

const INSTALLMENTS = [
  { seq: 1, milestone: "เซ็นสัญญา แล้วเสร็จ", amount: 520_000 },
  { seq: 2, milestone: "ตอกเข็ม ทำฐานราก แล้วเสร็จ", amount: 390_000 },
  { seq: 3, milestone: "เก็บงานทั้งหมดพร้อมส่งงาน", amount: 1_690_000 },
];

const full = (over: Partial<Parameters<typeof buildContractPdfHtml>[0]> = {}) =>
  buildContractPdfHtml({
    ...BASE,
    body: renderStructure(DEFAULT_CONTRACT_TEMPLATE.structure, VARS),
    installments: INSTALLMENTS,
    ...over,
  });

describe("เอกสารสัญญาที่จะถูกพิมพ์เป็น PDF", () => {
  it("มีหน้าปก ข้อสัญญาครบ 9 ข้อ พยาน และปิดท้าย", () => {
    const html = full();
    expect(html).toContain('class="cover"');
    expect(html).toContain("สัญญาเหมาทำการก่อสร้าง");
    expect((html.match(/class="clause"/g) ?? [])).toHaveLength(9);
    expect(html).toContain("พยาน");
    expect(html).toContain("ทำขึ้นเป็นสองฉบับ");
  });

  it("วันที่เป็น พ.ศ. ทั้งฉบับ ไม่มี ค.ศ. ปนอยู่", () => {
    const html = full();
    expect(html).toContain("1 พฤษภาคม 2565");
    expect(html).not.toMatch(/วันที่ \d+\/\d+\/20\d\d/);
  });

  it("แทนโทเคน {{ตารางงวดงาน}} ด้วยตารางงวดจริง พร้อมช่องเซ็นรับงานทุกงวด", () => {
    const html = full();
    expect(html).not.toContain("{{ตารางงวดงาน}}");
    expect(html).toContain("งวดที่ 1 — ชำระเมื่อ เซ็นสัญญา แล้วเสร็จ");
    expect(html).toContain("520,000.00 บาท");
    expect(html).toContain("1,690,000.00 บาท");
    // ช่องลงชื่อ/วันที่ต้องมีครบทุกงวด
    expect((html.match(/class="inst-sign"/g) ?? [])).toHaveLength(3);
    // ยอดรวมท้ายตารางต้องตรงกับมูลค่าสัญญา
    expect(html).toContain("2,600,000.00 บาท");
  });

  it("ไม่มีงวดเงิน = ไม่พิมพ์ตาราง และไม่ทิ้งโทเคนโล่ง ๆ ไว้บนกระดาษ", () => {
    const html = full({ installments: [] });
    expect(html).not.toContain("{{ตารางงวดงาน}}");
    expect(html).not.toContain('class="inst-table"');
  });

  it("เนื้อความถูก escape — พิมพ์ HTML ลงแม่แบบต้องโผล่เป็นตัวอักษร ไม่ใช่กลายเป็นแท็ก", () => {
    const body = renderStructure(DEFAULT_CONTRACT_TEMPLATE.structure, VARS);
    body.clauses[0].body = "<b>ทดสอบ</b>";
    const html = full({ body });
    expect(html).toContain("&lt;b&gt;ทดสอบ&lt;/b&gt;");
  });

  it("สัญญาเก่าที่ไม่มีเนื้อ (bodyJson = null) ยังพิมพ์แบบย่อได้ ไม่ใช่หน้าเปล่า", () => {
    const html = full({ body: null });
    expect(html).not.toContain('class="cover"');
    expect(html).toContain("มูลค่าสัญญา");
    expect(html).toContain("2,600,000.00");
  });
});
