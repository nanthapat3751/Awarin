import { classifyIp, normalizeIp } from "@systemboq/shared-types";

import { deviceLabel } from "../../src/lib/user-agent";
import { ipCheckVerdict } from "../../src/modules/system/ip-check.routes";

describe("จัดประเภทไอพี", () => {
  it("ตัด ::ffff: ของ IPv4 ที่ห่อมาใน IPv6 และ zone id", () => {
    expect(normalizeIp("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
    expect(normalizeIp("  ")).toBeNull();
    expect(normalizeIp(null)).toBeNull();
  });

  it.each([
    ["203.0.113.5", "public"],
    ["::ffff:1.1.1.1", "public"],
    ["2001:db8::1", "public"],
    ["127.0.0.1", "loopback"],
    ["::1", "loopback"],
    ["10.1.2.3", "private"],
    ["172.21.0.1", "private"], // ประตูเครือข่ายของ Docker — ภาพตัวอย่างที่ผู้ใช้ส่งมา
    ["172.15.0.1", "public"],
    ["172.32.0.1", "public"],
    ["192.168.1.10", "private"],
    ["fd12:3456::1", "private"],
    ["100.64.0.1", "cgnat"],
    ["100.128.0.1", "public"],
    ["169.254.1.1", "link-local"],
    ["fe80::abcd", "link-local"],
    ["999.1.1.1", "unknown"],
    ["not-an-ip", "unknown"],
  ])("%s → %s", (raw, kind) => {
    expect(classifyIp(raw)?.kind).toBe(kind);
  });
});

describe("อุปกรณ์จาก User-Agent", () => {
  it("เบราว์เซอร์ทั่วไปเป็น เบราว์เซอร์ · ระบบ", () => {
    expect(
      deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    ).toBe("Safari · iPhone");
    expect(
      deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36"),
    ).toBe("Chrome · Windows");
  });

  it("โปรแกรมยิงคำขอเองต้องไม่ถูกอ่านเป็นคนเปิดเบราว์เซอร์", () => {
    expect(deviceLabel("curl/8.4.0")).toBe("เครื่องมืออัตโนมัติ (curl)");
    expect(deviceLabel("PostmanRuntime/7.36.0")).toBe("เครื่องมืออัตโนมัติ (Postman)");
    expect(deviceLabel("python-requests/2.31.0")).toBe("เครื่องมืออัตโนมัติ (Python)");
    expect(
      deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0 Safari/537.36"),
    ).toBe("Chrome อัตโนมัติ (Headless)");
    expect(deviceLabel("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe("บอท/โปรแกรมเก็บข้อมูล");
    // คำว่า bot ต้องเป็นคำ ไม่ใช่ส่วนหนึ่งของคำอื่น
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14) Chrome/150.0 Mobile Safari/537.36 Robotics")).toBe("Chrome · Android");
    expect(deviceLabel(null)).toBeNull();
  });
});

describe("ผลตรวจการรับไอพี", () => {
  const ip = (raw: string) => classifyIp(raw)!;

  it("ได้ไอพีสาธารณะ = ใช้ได้", () => {
    expect(ipCheckVerdict({ seen: ip("203.0.113.5"), forwardedFor: [], trustProxy: null })).toBe("ok");
    expect(ipCheckVerdict({ seen: ip("203.0.113.5"), forwardedFor: [ip("203.0.113.5")], trustProxy: "1" })).toBe("ok");
  });

  it("proxy ส่งไอพีจริงมาแล้วแต่ระบบยังไม่เชื่อ → ต้องตั้ง TRUST_PROXY", () => {
    // nginx บนเครื่องเดียวกัน / Docker ส่งต่อพร้อม X-Forwarded-For
    expect(ipCheckVerdict({ seen: ip("127.0.0.1"), forwardedFor: [ip("203.0.113.5")], trustProxy: null })).toBe("proxy-untrusted");
    expect(ipCheckVerdict({ seen: ip("172.21.0.1"), forwardedFor: [ip("203.0.113.5")], trustProxy: null })).toBe("proxy-untrusted");
  });

  it("มาจาก Docker/proxy โดยไม่มีใครส่งไอพีต้นทางมา → ต้องตั้ง proxy ก่อน", () => {
    expect(ipCheckVerdict({ seen: ip("172.21.0.1"), forwardedFor: [], trustProxy: null })).toBe("proxy-no-forward");
  });

  it("เปิดจากเครื่องเดียวกับเซิร์ฟเวอร์ = ยังตอบไม่ได้ (ระหว่างพัฒนา)", () => {
    expect(ipCheckVerdict({ seen: ip("::1"), forwardedFor: [], trustProxy: null })).toBe("local");
  });

  it("ในวง LAN เดียวกัน = ให้ลองจากเน็ตข้างนอก", () => {
    expect(ipCheckVerdict({ seen: ip("192.168.1.20"), forwardedFor: [ip("192.168.1.20")], trustProxy: "1" })).toBe("local-network");
  });

  it("TRUST_PROXY=true เชื่อทุกชั้น — เตือนก่อนทุกอย่าง เพราะปลอมไอพีได้", () => {
    expect(ipCheckVerdict({ seen: ip("203.0.113.5"), forwardedFor: [ip("203.0.113.5")], trustProxy: "true" })).toBe("trust-all");
  });
});

describe("ประเทศ/ผู้ให้บริการของไอพี (ฐานข้อมูลออฟไลน์)", () => {
  const { geoLookup, setGeoLookupForTest } = jest.requireActual<typeof import("../../src/lib/geoip")>("../../src/lib/geoip");
  const fake = {
    country: { get: (ip: string) => ({ country: { iso_code: ip.startsWith("203.") ? "th" : "US" } }) },
    asn: {
      get: (ip: string) =>
        ip.startsWith("203.")
          ? { autonomous_system_number: 133481, autonomous_system_organization: "Advanced Wireless Network Company Limited" }
          : { autonomous_system_number: 15169, autonomous_system_organization: "Google LLC" },
    },
  };

  afterEach(() => setGeoLookupForTest(null));

  it("ไอพีในไทย: ชื่อประเทศภาษาไทย + ตัดคำนิติบุคคลท้ายชื่อ + ไม่ใช่ต่างประเทศ", () => {
    setGeoLookupForTest(fake);
    expect(geoLookup("::ffff:203.0.113.5")).toEqual({
      countryCode: "TH",
      country: "ไทย",
      network: "Advanced Wireless Network",
      asn: 133481,
      foreign: false,
    });
  });

  it("ไอพีต่างประเทศติดธง foreign", () => {
    setGeoLookupForTest(fake);
    expect(geoLookup("8.8.8.8")).toMatchObject({ countryCode: "US", country: "สหรัฐอเมริกา", network: "Google", foreign: true });
  });

  it("ไอพีภายใน/เครื่องตัวเองไม่ถูกค้น — ไม่มีความหมายทางภูมิศาสตร์", () => {
    setGeoLookupForTest(fake);
    expect(geoLookup("::1")).toBeNull();
    expect(geoLookup("172.21.0.1")).toBeNull();
    expect(geoLookup(null)).toBeNull();
  });

  it("ไม่มีฐานข้อมูล = null เงียบ ๆ ไม่พัง", () => {
    setGeoLookupForTest({ country: null, asn: null });
    expect(geoLookup("8.8.8.8")).toBeNull();
  });
});
