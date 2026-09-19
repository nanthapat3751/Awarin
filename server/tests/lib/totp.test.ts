import { authenticator } from "otplib";

import {
  buildOtpAuthUri,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  normalizeBackupCode,
  verifyTotp,
} from "../../src/lib/totp";

describe("totp lib", () => {
  it("generates a secret and verifies a fresh token, rejects a wrong one", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(0);

    const token = authenticator.generate(secret);
    expect(verifyTotp(token, secret)).toBe(true);
    expect(verifyTotp("000000", secret)).toBe(false);
    expect(verifyTotp("abc", secret)).toBe(false);
    expect(verifyTotp("12345", secret)).toBe(false); // สั้นไป
  });

  it("builds an otpauth URI with the issuer and account", () => {
    const uri = buildOtpAuthUri("staff@example.com", generateTotpSecret());
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("Awarin");
    expect(uri).toContain(encodeURIComponent("staff@example.com"));
  });

  it("generates 10 backup codes whose hash matches, ignoring case/hyphens", () => {
    const { plain, hashed } = generateBackupCodes();
    expect(plain).toHaveLength(10);
    expect(hashed).toHaveLength(10);
    expect(new Set(plain).size).toBe(10); // ไม่ซ้ำ

    plain.forEach((code, i) => {
      expect(hashBackupCode(code)).toBe(hashed[i]);
      // พิมพ์เล็ก + ตัดขีดออก ต้องได้แฮชเดียวกัน
      expect(hashBackupCode(code.toLowerCase().replace("-", ""))).toBe(hashed[i]);
    });
  });

  it("normalizes backup codes consistently", () => {
    expect(normalizeBackupCode("abcd-1234")).toBe("ABCD1234");
    expect(normalizeBackupCode("  ab cd 12 34 ")).toBe("ABCD1234");
  });
});
