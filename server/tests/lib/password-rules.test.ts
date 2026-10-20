import {
  PASSWORD_MAX_LENGTH,
  hasThaiChars,
  passwordClasses,
  passwordProblemCode,
  passwordRuleStates,
  passwordStrength,
} from "@systemboq/shared-types";

/**
 * กฎรหัสผ่าน (packages/shared-types/src/password.ts)
 *
 * ไฟล์นี้เป็นด่านสุดท้ายที่ยืนยันว่ากฎยังทำงานตามที่ออกแบบ — ทั้งเบราว์เซอร์และเซิร์ฟเวอร์เรียก
 * ฟังก์ชันชุดเดียวกันนี้ ถ้ามันเพี้ยน ทั้งระบบเพี้ยนพร้อมกันโดยไม่มีอะไรจับได้
 *
 * เทียบด้วย "code" ไม่ใช่ข้อความ เพื่อให้แก้สำนวนข้อความไทยได้โดยไม่ต้องตามแก้เทสต์
 */
describe("กฎรหัสผ่าน", () => {
  describe("ความยาว", () => {
    it("สั้นกว่า 8 ตัวไม่ผ่าน แม้จะผสมอักขระครบทั้ง 4 ประเภท", () => {
      expect(passwordProblemCode("Ab1!")).toBe("TOO_SHORT");
      expect(passwordProblemCode("Abc12!x")).toBe("TOO_SHORT");
    });

    it("ยาวเกินเพดานไม่ผ่าน — เพดานมีไว้กัน argon2 ถูกยิงด้วยข้อมูลยาว ๆ ให้กิน CPU", () => {
      const tooLong = "Abcdefgh1!".repeat(9); // 90 ตัว
      expect(tooLong.length).toBeGreaterThan(PASSWORD_MAX_LENGTH);
      expect(passwordProblemCode(tooLong)).toBe("TOO_LONG");
    });

    it("ยาวพอดีที่เพดานยังผ่าน", () => {
      const exact = "Abcdefgh1!".repeat(7) + "Ab"; // 72 ตัว
      expect(exact).toHaveLength(PASSWORD_MAX_LENGTH);
      expect(passwordProblemCode(exact)).toBeNull();
    });
  });

  describe("ต้องมีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข อักขระพิเศษ (บังคับอักขระพิเศษตั้งแต่ 15 ต.ค. 2569)", () => {
    it("ผ่านเมื่อครบสี่อย่าง", () => {
      expect(passwordProblemCode("Kanoklak7!")).toBeNull();
    });

    it("บอกข้อที่ขาดทีละข้อ", () => {
      expect(passwordProblemCode("kanoklak7!")).toBe("NEEDS_UPPER");
      expect(passwordProblemCode("KANOKLAK7!")).toBe("NEEDS_LOWER");
      expect(passwordProblemCode("Kanoklakx!")).toBe("NEEDS_DIGIT");
      expect(passwordProblemCode("Kanoklak7")).toBe("NEEDS_SYMBOL");
    });

    it("ภาษาไทย สระ และวรรณยุกต์ไม่นับเป็นอักขระพิเศษ", () => {
      expect(passwordProblemCode("Kanoklak7สวัสดี")).toBe("NEEDS_SYMBOL");
    });

    it("อักขระพิเศษไม่ได้แทนข้อที่ขาด", () => {
      expect(passwordProblemCode("kanoklak7!")).toBe("NEEDS_UPPER");
    });

    it("วลียาวไม่ผสมอักขระไม่ผ่านแล้ว — ไม่มีทาง 16 ตัวอีก", () => {
      expect(passwordProblemCode("lanternriverbank")).toBe("NEEDS_UPPER");
      expect(passwordProblemCode("ลุงมาลีขับรถไปตลาดเช้านี้")).toBe("NEEDS_UPPER");
    });

    it("ภาษาไทยยังใส่ในรหัสได้ถ้ามีอังกฤษพิมพ์ใหญ่/เล็ก ตัวเลข และอักขระพิเศษครบ", () => {
      expect(passwordProblemCode("Rotfai7!ไปตลาดเช้า")).toBeNull();
    });
  });

  describe("ตัวอักษรซ้ำ", () => {
    it("ครบทุกประเภทแต่วนซ้ำรอบสั้น ๆ ไม่ผ่าน", () => {
      expect(passwordProblemCode("Aa1!Aa1!")).toBe("TOO_REPETITIVE");
      expect(passwordProblemCode("Aa1!Aa1!Aa1!")).toBe("TOO_REPETITIVE");
    });
  });

  describe("ลำดับเรียงต่อกัน", () => {
    it("ทั้งเส้นเป็นช่วงเรียงต่อกันไม่ผ่าน แม้จะครบพิมพ์ใหญ่ เล็ก ตัวเลข", () => {
      expect(passwordProblemCode("ABCDabcd1234#$%")).toBe("SEQUENTIAL");
      expect(passwordProblemCode("DCBAdcba4321%$#")).toBe("SEQUENTIAL");
    });

    it("คำปกติที่เผอิญมีสามตัวเรียงกันอยู่ข้างในยังผ่าน", () => {
      // ถ้าปัดทิ้งเพราะ "มีช่วงเรียงอยู่ข้างใน" กฎจะกลายเป็นสิ่งที่คาดเดาไม่ได้
      expect(passwordProblemCode("Riverstone4quiet!")).toBeNull();
    });
  });

  describe("บัญชีดำรหัสที่ถูกเดาบ่อย", () => {
    it("จับคำยอดนิยมที่ซ่อนอยู่หลังการเติมพิมพ์ใหญ่และตัวเลข", () => {
      expect(passwordProblemCode("Qwerty12!")).toBe("COMMON");
    });

    it("รหัสตัวเลขยอดนิยมไม่ผ่าน — ติดข้อที่แก้ง่ายกว่าก่อน", () => {
      expect(passwordProblemCode("12345678")).toBe("NEEDS_UPPER");
    });

    it("จับได้แม้เติมตัวเลขและอักขระพิเศษต่อท้าย", () => {
      expect(passwordProblemCode("Password123!")).toBe("COMMON");
    });

    it("จับได้แม้เปลี่ยนตัวอักษรเป็นตัวเลข/สัญลักษณ์แบบ leet", () => {
      expect(passwordProblemCode("P@ssw0rd")).toBe("COMMON");
    });

    it("จับคำไทยที่เขียนเป็นอังกฤษ และคำที่เกี่ยวกับบริษัทนี้", () => {
      expect(passwordProblemCode("Sawadee1!")).toBe("COMMON");
      expect(passwordProblemCode("Awarin2026!")).toBe("COMMON");
    });

    it("จับคำในบัญชีดำที่ถูกพิมพ์ซ้ำเพื่อให้ยาวพอ", () => {
      expect(passwordProblemCode("Qwerty1!Qwerty1!")).toBe("COMMON");
    });

    it("ไม่ปัดวลีที่ดีทิ้งเพียงเพราะมีคำในบัญชีดำอยู่กลางประโยค", () => {
      expect(passwordProblemCode("Ilovethisquietharbour7!")).toBeNull();
      expect(passwordProblemCode("Masterofthemoonlitcairn2!")).toBeNull();
    });
  });

  describe("ห้ามมีข้อมูลตัวเองอยู่ในรหัส", () => {
    it("จับชื่อจากส่วนหน้าของอีเมล", () => {
      expect(passwordProblemCode("Wanchai-2026!", ["wanchai@example.com"])).toBe("PERSONAL");
    });

    it("จับชื่อ-นามสกุล", () => {
      expect(passwordProblemCode("Kittisak-quiet-harbour1", ["Kittisak Preecha"])).toBe("PERSONAL");
    });

    it("จับเบอร์โทรจาก 6 หลักท้าย ไม่สนรูปแบบที่กรอกมา", () => {
      expect(passwordProblemCode("Secure-345678-phrase", ["081-234-5678"])).toBe("PERSONAL");
      expect(passwordProblemCode("Secure-345678-phrase", ["+66812345678"])).toBe("PERSONAL");
    });

    it("ไม่สนใจโดเมนของอีเมล — gmail.com ซ้ำกันทุกคน ไม่ใช่ข้อมูลเฉพาะตัว", () => {
      expect(passwordProblemCode("Gmail-quiet-lantern2", ["someone@gmail.com"])).toBeNull();
    });

    it("ข้ามคำที่สั้นกว่า 4 ตัว — คำสั้นไปโผล่ในรหัสที่ดีได้ง่าย", () => {
      expect(passwordProblemCode("Annualquietlantern3!", ["ann@example.com"])).toBeNull();
    });

    it("ไม่ส่งข้อมูลเจ้าของบัญชีมา ก็ข้ามข้อนี้ไป (ปลายทางที่ยังไม่รู้ว่าเป็นบัญชีของใคร)", () => {
      expect(passwordProblemCode("Wanchai-2026!")).toBeNull();
    });
  });

  describe("ประเภทอักขระ", () => {
    it("แยกครบทั้ง 4 ประเภท", () => {
      expect(passwordClasses("Ab1!")).toEqual(["lower", "upper", "digit", "other"]);
    });

    it("ภาษาไทยนับเป็น other เพราะไม่มีตัวพิมพ์เล็ก/ใหญ่", () => {
      expect(passwordClasses("สวัสดี")).toEqual(["other"]);
    });
  });

  describe("รายการเงื่อนไขที่โชว์ใต้ช่อง", () => {
    it("แยกทีละข้อ — อักขระพิเศษเป็นข้อบังคับเหมือนข้ออื่น ไม่มีคำว่าแนะนำ", () => {
      const rules = passwordRuleStates("Kanoklak7");
      expect(rules.map((r) => r.id)).toEqual(["length", "upper", "lower", "digit", "special"]);
      expect(rules.map((r) => r.ok)).toEqual([true, true, true, true, false]);
      expect(rules.some((r) => r.optional)).toBe(false);
      expect(rules.find((r) => r.id === "special")?.label).not.toContain("แนะนำ");
    });

    it("ยังไม่ครบก็ยังไม่ติ๊ก · ภาษาไทยไม่นับเป็นอักขระพิเศษ", () => {
      expect(passwordRuleStates("abc").map((r) => r.ok)).toEqual([false, false, true, false, false]);
      expect(passwordRuleStates("สวัสดี").find((r) => r.id === "special")?.ok).toBe(false);
      expect(passwordRuleStates("a!").find((r) => r.id === "special")?.ok).toBe(true);
    });
  });

  describe("เตือนแป้นภาษาไทย", () => {
    it("มีตัวอักษรไทย = เตือน", () => {
      expect(hasThaiChars("ฟหกด")).toBe(true);
      expect(hasThaiChars("Kanoklak7")).toBe(false);
    });
  });

  describe("แถบความแข็งแรง", () => {
    it("ยังไม่พิมพ์ = 0", () => {
      expect(passwordStrength("").score).toBe(0);
    });

    it("รหัสที่กดส่งไม่ผ่านได้ขีดเดียวเสมอ — โชว์ว่า 'ดี' ให้รหัสที่ส่งไม่ผ่านคือการโกหก", () => {
      expect(passwordStrength("abc").score).toBe(1);
      expect(passwordStrength("Password123!").score).toBe(1);
      expect(passwordStrength("Wanchai-2026!", ["wanchai@example.com"]).score).toBe(1);
    });

    it("ผ่านกฎแบบเฉียดฉิวได้ 2 ขีด · ยาว 12 ได้ 3 · ยาว 16 ได้ 4", () => {
      expect(passwordStrength("Kanoklak7!").score).toBe(2);
      expect(passwordStrength("Kanoklak7!bcd").score).toBe(3);
      expect(passwordStrength("Quiet-Lantern-42-Riverbank").score).toBe(4);
    });
  });
});
