import { LOGO_CID, escapeHtml, renderMailHtml, renderMailText, type MailBrand, type MailContent } from "../../src/lib/mail-template";
import { describeSmtpError } from "../../src/lib/mailer";

const BRAND: MailBrand = {
  name: "Awarin Engineering Co., Ltd.",
  address: "252/54 หมู่ 5 ตำบลธรรมศาลา",
  phone: "090 989 8342",
  email: null,
  taxId: null,
  branch: null,
  logo: { png: Buffer.from("fake"), width: 240, height: 128 },
};

function content(extra: Partial<MailContent> = {}): MailContent {
  return { preheader: "p", recipientName: "สมชาย ใจดี", topic: "คำขอตั้งรหัสผ่านใหม่", paragraphs: ["เนื้อความ"], ...extra };
}

describe("แม่แบบอีเมลแบบการ์ดกลางจอ", () => {
  it("escape ข้อความจากผู้ใช้ — ฝังแท็กหรือลิงก์หลอกลงในเมลของบริษัทไม่ได้", () => {
    const html = renderMailHtml(
      content({ recipientName: '<a href="https://evil.example">กดที่นี่</a>', paragraphs: ["<script>alert(1)</script>"] }),
      BRAND,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });

  it("หัวข้อ + อีเมลบัญชี + ทักชื่อ · ไม่มีชื่อ = ไม่ทัก · ไม่มีภาษาจดหมายราชการ", () => {
    const withAccount = content({ account: "somchai@gmail.com" });
    for (const out of [renderMailHtml(withAccount, BRAND), renderMailText(withAccount, BRAND)]) {
      expect(out).toContain("คำขอตั้งรหัสผ่านใหม่");
      expect(out).toContain("somchai@gmail.com");
      expect(out).toContain("สวัสดีคุณสมชาย ใจดี");
      expect(out).not.toContain("เรียน");
      expect(out).not.toContain("ขอแสดงความนับถือ");
    }
    expect(renderMailText(content({ recipientName: null }), BRAND)).not.toContain("สวัสดี");
    expect(renderMailText(content({ recipientName: "System Owner" }), BRAND)).toContain("สวัสดีคุณ System Owner");
  });

  it("โลโก้อ้างแบบ cid และรักษาสัดส่วนภาพ · ไม่มีโลโก้ = ไม่มีแท็กรูป", () => {
    const html = renderMailHtml(content(), BRAND);
    expect(html).toContain(`src="cid:${LOGO_CID}"`);
    expect(html).toMatch(/width="90" height="48"/);
    expect(renderMailHtml(content(), { ...BRAND, logo: null })).not.toContain("<img");
  });

  it("ท้ายจดหมายพิมพ์เฉพาะช่องที่กรอกไว้ — ไม่มีบรรทัดว่างหรือคำว่า null", () => {
    const text = renderMailText(content(), BRAND);
    expect(text).toContain("โทร 090 989 8342");
    expect(text).not.toContain("อีเมล null");
    expect(text).not.toContain("เลขประจำตัวผู้เสียภาษี");
    const withTax = renderMailText(content(), { ...BRAND, taxId: "0735561000123", branch: "สำนักงานใหญ่" });
    expect(withTax).toContain("เลขประจำตัวผู้เสียภาษี 0735561000123 (สำนักงานใหญ่)");
  });

  it("ปุ่มมีลิงก์สำรองแบบข้อความ และรับเฉพาะ http(s)", () => {
    const url = "http://localhost:5174/reset-password/abc?x=1&y=2";
    const html = renderMailHtml(content({ action: { label: "ตั้งรหัสผ่านใหม่", url } }), BRAND);
    expect(html.split(`href="${escapeHtml(url)}"`)).toHaveLength(3);
    expect(renderMailText(content({ action: { label: "ตั้งรหัสผ่านใหม่", url } }), BRAND)).toContain(url);

    const bad = renderMailHtml(content({ action: { label: "x", url: "javascript:alert(1)" } }), BRAND);
    expect(bad).not.toContain("javascript:");
    expect(bad).not.toContain("ถ้ากดปุ่มไม่ได้");
  });

  it("รหัสยืนยันเป็นตัวเลข 6 หลักชุดเดียวในข้อความล้วน (เทสต์และลูกค้าอ่านจากตรงนี้)", () => {
    const text = renderMailText(content({ code: "482913" }), { ...BRAND, taxId: "0735561000123" });
    expect(text.match(/\b\d{6}\b/g)).toEqual(["482913"]);
    expect(renderMailHtml(content({ code: "482913" }), BRAND)).toMatch(/letter-spacing:8px;[^>]*>482913</);
  });
});

describe("แปล error ของ SMTP เป็นวิธีแก้", () => {
  it.each([
    [{ code: "EAUTH", responseCode: 535, message: "Invalid login: 535-5.7.8 Username and Password not accepted" }, /App Password/],
    [{ responseCode: 534, message: "Application-specific password required" }, /App Password/],
    [{ code: "ESOCKET", message: "routines:ssl3_get_record:wrong version number" }, /SMTP_SECURE/],
    [{ code: "EDNS", message: "getaddrinfo ENOTFOUND smtp.gmial.com" }, /SMTP_HOST/],
    [{ code: "ETIMEDOUT", message: "Connection timeout" }, /SMTP_PORT/],
    [{ code: "ESOCKET", message: "connect ECONNREFUSED 127.0.0.1:1" }, /SMTP_PORT/],
    [{ code: "EENVELOPE", responseCode: 553, message: "Sender address rejected" }, /MAIL_FROM/],
  ])("%j", (err, hint) => {
    expect(describeSmtpError(err)).toMatch(hint);
  });

  it("กรณีที่ไม่รู้จักยังได้ข้อความดิบ (ตัดความยาว) ไม่ใช่ข้อความว่าง", () => {
    expect(describeSmtpError(new Error("x".repeat(500)))).toMatch(/^ส่งไม่สำเร็จ: x{200}$/);
  });
});
