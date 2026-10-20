import { authenticator } from "otplib";

import {
  buildOtpAuthUri,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  normalizeBackupCode,
  totpStep,
} from "../../src/lib/totp";

describe("totp lib", () => {
  it("generates a secret and verifies a fresh token, rejects a wrong one", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(0);

    const now = Date.now();
    const token = authenticator.clone({ epoch: now }).generate(secret);
    expect(totpStep(token, secret, now)).toBe(Math.floor(now / 30_000));
    expect(totpStep("000000", secret, now)).toBeNull();
    expect(totpStep("abc", secret, now)).toBeNull();
    expect(totpStep("12345", secret, now)).toBeNull(); // สั้นไป
  });

  it("reports which 30-second step a code belongs to, within ±90 seconds only", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const at = (offsetMs: number) => authenticator.clone({ epoch: now + offsetMs }).generate(secret);
    const current = Math.floor(now / 30_000);

    // เวลามือถือช้าไป 60 วิ → รหัสเป็นของสองช่วงก่อน · เร็วไป 90 วิ → สามช่วงหลัง
    expect(totpStep(at(-60_000), secret, now)).toBe(current - 2);
    expect(totpStep(at(90_000), secret, now)).toBe(current + 3);
    // เกินหน้าต่างเวลา (ห้าช่วงก่อน) → ไม่รับ
    expect(totpStep(at(-150_000), secret, now)).toBeNull();
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
