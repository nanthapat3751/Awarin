import {
  formatThaiMobile,
  isValidThaiMobile,
  normalizeThaiMobile,
  thaiMobileToE164,
} from "@systemboq/shared-types";

describe("Thai mobile normalization", () => {
  it("accepts the local 0XXXXXXXXX form", () => {
    expect(normalizeThaiMobile("0812345678")).toBe("0812345678");
    expect(normalizeThaiMobile("0612345678")).toBe("0612345678");
    expect(normalizeThaiMobile("0912345678")).toBe("0912345678");
  });

  it("accepts the +66XXXXXXXXX form and converts it to local", () => {
    expect(normalizeThaiMobile("+66812345678")).toBe("0812345678");
    expect(normalizeThaiMobile("+66912345678")).toBe("0912345678");
  });

  it("strips spaces, dashes and parentheses before validating", () => {
    expect(normalizeThaiMobile("081-234-5678")).toBe("0812345678");
    expect(normalizeThaiMobile("081 234 5678")).toBe("0812345678");
    expect(normalizeThaiMobile("(081) 234-5678")).toBe("0812345678");
    expect(normalizeThaiMobile(" +66 81-234 5678 ")).toBe("0812345678");
  });

  it("rejects landlines, wrong lengths and non-Thai input", () => {
    expect(normalizeThaiMobile("021234567")).toBeNull(); // Bangkok landline
    expect(normalizeThaiMobile("0212345678")).toBeNull(); // landline prefix, 10 digits
    expect(normalizeThaiMobile("081234567")).toBeNull(); // one digit short
    expect(normalizeThaiMobile("08123456789")).toBeNull(); // one digit long
    expect(normalizeThaiMobile("+6681234567")).toBeNull(); // +66 with 8 digits
    expect(normalizeThaiMobile("+1 415 555 2671")).toBeNull(); // not Thai
    expect(normalizeThaiMobile("081-234-56ab")).toBeNull(); // letters
    expect(normalizeThaiMobile("")).toBeNull();
    expect(normalizeThaiMobile("   ")).toBeNull();
  });

  it("exposes the same rule through isValidThaiMobile", () => {
    expect(isValidThaiMobile("081 234 5678")).toBe(true);
    expect(isValidThaiMobile("021234567")).toBe(false);
  });

  it("converts to E.164 for SMS gateways", () => {
    expect(thaiMobileToE164("081-234-5678")).toBe("+66812345678");
    expect(thaiMobileToE164("+66812345678")).toBe("+66812345678");
    expect(thaiMobileToE164("021234567")).toBeNull();
  });

  it("formats for display without changing what is stored", () => {
    expect(formatThaiMobile("0812345678")).toBe("081-234-5678");
    expect(formatThaiMobile("+66812345678")).toBe("081-234-5678");
    // อินพุตที่แปลงไม่ได้จะถูกส่งคืนกลับตามเดิม แทนที่จะถูกทำให้เพี้ยน
    expect(formatThaiMobile("ไม่ทราบ")).toBe("ไม่ทราบ");
  });
});
