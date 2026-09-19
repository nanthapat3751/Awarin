import { Prisma } from "@prisma/client";

import { mapStrings, toPublicUploadUrl, toStoredUploadUrl } from "../../src/lib/upload-urls";

const OWN = new Set(["https://api.awarin.co.th", "http://localhost:4000", "http://127.0.0.1:4000"]);

describe("URL รูปที่อัปโหลด", () => {
  it("ขาเข้า: URL เต็มของเราเอง (ทั้งโดเมนจริงและ localhost เก่า) → /uploads/...", () => {
    expect(toStoredUploadUrl("https://api.awarin.co.th/uploads/1-a.jpg", OWN)).toBe("/uploads/1-a.jpg");
    expect(toStoredUploadUrl("http://localhost:4000/uploads/1-a.jpg", OWN)).toBe("/uploads/1-a.jpg");
  });

  it("ขาเข้า: ลิงก์เว็บอื่น path อื่น หรือข้อความทั่วไป ไม่ถูกแตะ", () => {
    for (const v of [
      "https://cdn.example.com/uploads/1-a.jpg",
      "https://api.awarin.co.th/api/uploads",
      "/images/hero.jpg",
      "https://api.awarin.co.th/uploads/../secret",
      "ราคานี้รวม /uploads/ แล้ว",
    ]) {
      expect(toStoredUploadUrl(v, OWN)).toBe(v);
    }
  });

  it("ขาออก: /uploads/... → โดเมนปัจจุบัน · ค่าอื่นคงเดิม", () => {
    expect(toPublicUploadUrl("/uploads/1-a.jpg", "https://api.awarin.co.th")).toBe(
      "https://api.awarin.co.th/uploads/1-a.jpg",
    );
    for (const v of ["/images/hero.jpg", "/uploads/", "/uploads/a/b.jpg", "https://x.com/uploads/1.jpg", ""]) {
      expect(toPublicUploadUrl(v, "https://api.awarin.co.th")).toBe(v);
    }
  });

  it("เดินทั้งโครงสร้าง แต่ไม่แตก Date / Decimal (ไม่งั้น JSON ผิดรูป)", () => {
    const date = new Date("2026-09-18T00:00:00Z");
    const price = new Prisma.Decimal("1234.50");
    const out = mapStrings(
      { images: ["/uploads/1.jpg", { url: "/uploads/2.png" }], date, price, n: 3, nil: null },
      (s) => `X${s}`,
    ) as Record<string, unknown>;
    expect(out.images).toEqual(["X/uploads/1.jpg", { url: "X/uploads/2.png" }]);
    expect(out.date).toBe(date);
    expect(out.price).toBe(price);
    expect(JSON.parse(JSON.stringify(out)).price).toBe("1234.5");
    expect(out.n).toBe(3);
    expect(out.nil).toBeNull();
  });
});
