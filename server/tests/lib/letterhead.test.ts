import {
  companyLogoDataUri,
  companyLogoSmallDataUri,
  documentChrome,
  renderLetterhead,
} from "../../src/lib/pdf/letterhead";

const COMPANY = {
  companyName: "Awarin Engineering Co., Ltd.",
  companyAddress: "252/54 หมู่ 5 ตำบลธรรมศาลา อำเภอเมืองนครปฐม จังหวัดนครปฐม",
  companyPhone: "090 989 8342",
};

const DOC = {
  titleTh: "ใบเสนอราคา",
  titleEn: "QUOTATION",
  meta: ["เลขที่ QT-2026-0342 (ฉบับที่ 1)", "วันที่ 20/8/2569"],
};

describe("หัวจดหมายบนเอกสาร (letterhead)", () => {
  it("พิมพ์ชื่อ ที่อยู่ และเบอร์โทรของบริษัทครบ", () => {
    const html = renderLetterhead(COMPANY, DOC);
    expect(html).toContain(COMPANY.companyName);
    // ที่อยู่เคยถูกส่งเข้ามาแล้วไม่ถูกพิมพ์ในใบเสนอราคา — เทสต์นี้กันไม่ให้หายไปอีก
    expect(html).toContain("ตำบลธรรมศาลา");
    expect(html).toContain("โทร. 090 989 8342");
  });

  it("พิมพ์ชื่อเอกสารและเลขที่/วันที่ฝั่งขวา", () => {
    const html = renderLetterhead(COMPANY, DOC);
    expect(html).toContain("ใบเสนอราคา");
    expect(html).toContain("QUOTATION");
    expect(html).toContain("เลขที่ QT-2026-0342 (ฉบับที่ 1)");
    expect(html).toContain("วันที่ 20/8/2569");
  });

  it("ไม่พิมพ์บรรทัดเลขประจำตัวผู้เสียภาษีถ้ายังไม่ได้ตั้งค่า", () => {
    expect(renderLetterhead(COMPANY, DOC)).not.toContain("เลขประจำตัวผู้เสียภาษี");
    expect(renderLetterhead({ ...COMPANY, companyTaxId: "" }, DOC)).not.toContain(
      "เลขประจำตัวผู้เสียภาษี",
    );
    expect(renderLetterhead({ ...COMPANY, companyTaxId: null }, DOC)).not.toContain(
      "เลขประจำตัวผู้เสียภาษี",
    );
  });

  it("พิมพ์เลขประจำตัวผู้เสียภาษีเมื่อมีค่า", () => {
    const html = renderLetterhead({ ...COMPANY, companyTaxId: "0-0000-00000-00-0" }, DOC);
    expect(html).toContain("เลขประจำตัวผู้เสียภาษี 0-0000-00000-00-0");
  });

  it("ฝังโลโก้เป็น data URI (ไม่ใช่ path ไฟล์)", () => {
    const logo = companyLogoDataUri();
    expect(logo).not.toBeNull();
    // PDF ถูกสร้างด้วย page.setContent() ที่ไม่มี base URL — ถ้าเป็น path ไฟล์ รูปจะไม่ขึ้น
    expect(logo).toMatch(/^data:image\/png;base64,/);
    expect(renderLetterhead(COMPANY, DOC)).toContain('<img class="letterhead-logo" src="data:image/png;base64,');
  });

  it("ไฟล์โลโก้ต้องเล็กพอจะฝังในเอกสารทุกใบ (ไม่เกิน 60KB)", () => {
    const logo = companyLogoDataUri();
    // ต้นฉบับ 307KB จะทำให้ PDF ทุกใบโตขึ้นเกิน 400KB โดยไม่จำเป็น จึงย่อไว้ที่ 240px
    expect(Buffer.byteLength(logo ?? "", "utf8")).toBeLessThan(60 * 1024);
  });

  it("หนีอักขระ HTML ในข้อมูลบริษัท (กันหัวเอกสารเพี้ยนจากค่าที่ผู้ใช้พิมพ์เอง)", () => {
    const html = renderLetterhead({ ...COMPANY, companyName: 'A & B <script>"x"' }, DOC);
    expect(html).toContain("A &amp; B &lt;script&gt;&quot;x&quot;");
    expect(html).not.toContain("<script>");
  });
});

describe("แถบท้ายที่วาดซ้ำทุกหน้า (documentChrome)", () => {
  const RUNNING = { companyName: "Awarin Engineering Co., Ltd.", docLabel: "ใบเสนอราคาเลขที่ QT-2026-0342" };

  it("แถบท้ายบอกได้ว่าเอกสารนี้ของใคร เลขที่อะไร พร้อมโลโก้", () => {
    const { footerTemplate } = documentChrome(RUNNING);
    expect(footerTemplate).toContain("Awarin Engineering Co., Ltd.");
    expect(footerTemplate).toContain("ใบเสนอราคาเลขที่ QT-2026-0342");
    expect(footerTemplate).toContain('<img src="data:image/png;base64,');
  });

  it("แถบท้ายใช้ตัวนับหน้าของ Chrome", () => {
    const { footerTemplate } = documentChrome(RUNNING);
    // เอกสารยาว 7 หน้าเคยไม่มีเลขหน้าเลย ถ้ากระดาษหล่นจะไม่มีใครรู้ว่าขาดหน้าไหน
    expect(footerTemplate).toContain('<span class="pageNumber"></span>');
    expect(footerTemplate).toContain('<span class="totalPages"></span>');
    expect(footerTemplate).toContain("หน้า");
  });

  it("หัวกระดาษต้องว่าง แต่ต้องส่งเทมเพลตมาด้วย", () => {
    // ถ้าไม่ส่ง headerTemplate มา Chrome จะใส่หัวมาตรฐานของตัวเอง (วันที่ + ชื่อไฟล์) ให้
    const { headerTemplate } = documentChrome(RUNNING);
    expect(headerTemplate.trim()).toBe("<div></div>");
    // แถบอยู่ท้ายหน้าเพื่อไม่ให้โลโก้ซ้ำกับหัวจดหมายบนหน้าแรก (Chrome ซ่อนเฉพาะหน้าแรกไม่ได้)
    expect(headerTemplate).not.toContain("Awarin");
  });

  it("ฝัง @font-face และกำหนด font-size เองในแถบ", () => {
    const { footerTemplate } = documentChrome(RUNNING);
    // เทมเพลตถูกเรนเดอร์คนละเอกสารกับตัวหน้า ไม่ได้รับฟอนต์/CSS จาก <style> ของหน้า
    // และ font-size เริ่มต้นของ Chrome คือ 0 (มองไม่เห็นอะไรเลย)
    expect(footerTemplate).toContain("@font-face");
    expect(footerTemplate).toContain("font-size:7pt");
  });

  it("เผื่อระยะขอบล่างให้แถบ และเคารพระยะขอบข้างที่ส่งเข้ามา", () => {
    expect(documentChrome(RUNNING).margin).toEqual({
      top: "15mm",
      bottom: "18mm",
      left: "15mm",
      right: "15mm",
    });
    expect(documentChrome(RUNNING, "20mm").margin.left).toBe("20mm");
  });

  it("ใช้โลโก้ไฟล์เล็กในแถบ ไม่ใช่ไฟล์ใหญ่ของหัวจดหมาย", () => {
    const small = companyLogoSmallDataUri();
    const big = companyLogoDataUri();
    expect(small).toMatch(/^data:image\/png;base64,/);
    // แถบถูกวาดซ้ำทุกหน้า ถ้าใช้ไฟล์ใหญ่ เอกสาร 7 หน้าจะบวมโดยไม่ได้อะไร (แสดงแค่สูง 13px)
    expect(Buffer.byteLength(small ?? "", "utf8")).toBeLessThan(Buffer.byteLength(big ?? "", "utf8") / 3);
    expect(documentChrome(RUNNING).footerTemplate).toContain(small ?? "ไม่มีโลโก้");
  });

  it("หนีอักขระ HTML ในป้ายเอกสาร", () => {
    const { footerTemplate } = documentChrome({ companyName: "A & B", docLabel: '<b>x"y</b>' });
    expect(footerTemplate).toContain("A &amp; B");
    expect(footerTemplate).toContain("&lt;b&gt;x&quot;y&lt;/b&gt;");
  });
});

/**
 * นับ element ระดับบนสุดของเทมเพลต (ไม่นับ <style>)
 * เขียนเองแทนที่จะลง DOM parser เพราะต้องการตอบคำถามเดียว: "มีรากกี่อัน"
 */
function countRootElements(template: string): number {
  const body = template.replace(/<style>[\s\S]*?<\/style>/g, "").trim();
  const VOID_TAGS = new Set(["img", "br", "hr", "input", "meta", "link"]);
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  let depth = 0;
  let roots = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(body)) !== null) {
    const isClosing = m[1] === "/";
    const isVoid = VOID_TAGS.has(m[2].toLowerCase()) || /\/\s*$/.test(m[3]);
    if (isClosing) {
      depth -= 1;
      continue;
    }
    if (depth === 0) roots += 1;
    if (!isVoid) depth += 1;
  }
  return roots;
}

describe("ช่องเซ็นกำกับรายหน้าในแถบท้ายกระดาษ", () => {
  const RUNNING = { companyName: "Awarin Engineering Co., Ltd.", docLabel: "สัญญาเลขที่ CT-2026-0099" };
  const INITIALS = { left: "………… “ผู้ว่าจ้าง”", right: "………… “ผู้รับจ้าง”" };

  it("เทมเพลตท้ายกระดาษต้องมีรากเดียวเสมอ แม้ตอนมีช่องเซ็นกำกับ", () => {
    // Chrome วางเทมเพลตท้ายกระดาษไว้ในกล่องที่เป็น flex — ถ้ามีสองราก มันจะเอาไป
    // "วางเรียงข้างกัน" ไม่ใช่ซ้อนกัน แล้วข้อความในแต่ละอันจะตกบรรทัดกลางคำ
    // (เคยเกิดจริงกับสัญญาที่ออกไปแล้ว: "ผู้ว่า / จ้าง" และ "CT-2026- / 0099")
    expect(countRootElements(documentChrome(RUNNING).footerTemplate)).toBe(1);
    expect(countRootElements(documentChrome(RUNNING, "20mm", INITIALS).footerTemplate)).toBe(1);
  });

  it("ช่องเซ็นกำกับเข้มและใหญ่กว่าแถบข้อมูลอ้างอิง", () => {
    const { footerTemplate } = documentChrome(RUNNING, "20mm", INITIALS);
    // ช่องเซ็น = ของที่คนต้องเขียนลงไปจริง / แถบข้อมูล = เลขหน้ากับเลขที่เอกสาร
    expect(footerTemplate).toContain("font-size:8pt");
    expect(footerTemplate).toContain("color:#333");
    expect(footerTemplate).toContain("font-size:7pt");
    expect(footerTemplate).toContain("color:#777");
    expect(footerTemplate).toContain("border-bottom");
  });

  it("เอกสารที่ไม่ต้องเซ็นกำกับไม่มีแถวนั้นและไม่โดนสไตล์ของมัน", () => {
    const { footerTemplate } = documentChrome(RUNNING);
    expect(footerTemplate).not.toContain("font-size:8pt");
    expect(footerTemplate).not.toContain("ผู้ว่าจ้าง");
  });

  it("มีช่องเซ็นกำกับต้องเผื่อขอบล่างเพิ่ม ไม่งั้นแถบทับเนื้อหา", () => {
    expect(documentChrome(RUNNING, "20mm", INITIALS).margin.bottom).toBe("26mm");
    expect(documentChrome(RUNNING, "20mm").margin.bottom).toBe("18mm");
  });

  it("หนีอักขระ HTML ในข้อความช่องเซ็นกำกับ", () => {
    const { footerTemplate } = documentChrome(RUNNING, "20mm", { left: "<b>ก</b>", right: "&x" });
    expect(footerTemplate).toContain("&lt;b&gt;");
    expect(footerTemplate).toContain("&amp;x");
  });
});
