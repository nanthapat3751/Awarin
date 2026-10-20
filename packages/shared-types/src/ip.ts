/**
 * อ่านหมายเลขไอพีให้ถูกความหมาย — ใช้ทั้งเซิร์ฟเวอร์ (จัดประเภทก่อนส่งให้หน้าจอ) และหน้าตรวจการรับไอพี
 *
 * ไอพีที่เซิร์ฟเวอร์เห็นไม่ได้เป็นของคนใช้งานเสมอ: ถ้ามี Docker / nginx / load balancer คั่นอยู่
 * และยังไม่ได้ตั้ง TRUST_PROXY ทุกคำขอจะดูเหมือนมาจากไอพีเดียวกัน (เช่น 172.21.0.1 ของ Docker)
 * หน้าจอต้องบอกได้ว่าแถวไหน "ไม่ใช่ไอพีสาธารณะ" ไม่งั้นคนอ่านจะเข้าใจว่าเป็นไอพีของลูกค้า
 */
export type IpKind =
  /** ไอพีสาธารณะ — ใช้ระบุที่มาได้ */
  | "public"
  /** เครื่องเดียวกับเซิร์ฟเวอร์ (127.x / ::1) — ระหว่างพัฒนา หรือ proxy อยู่บนเครื่องเดียวกัน */
  | "loopback"
  /** วงภายใน (10.x · 172.16–31.x · 192.168.x · fc00::/7) — มักเป็น Docker / proxy / วง LAN */
  | "private"
  /** 100.64.0.0/10 — เครือข่ายภายในของผู้ให้บริการ ไม่ใช่ไอพีที่ระบุตัวคนได้ */
  | "cgnat"
  /** 169.254.x / fe80:: — ใช้ได้แค่ในสายเดียวกัน */
  | "link-local"
  /** อ่านรูปแบบไม่ออก */
  | "unknown";

export interface IpInfo {
  /** ไอพีในรูปที่อ่านง่าย (ตัด ::ffff: ของ IPv4 ที่ห่อมาใน IPv6 ออก) */
  address: string;
  kind: IpKind;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** "::ffff:203.0.113.5" → "203.0.113.5" · ตัด zone id (fe80::1%eth0) · ว่าง = null */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (!ip) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  const zone = ip.indexOf("%");
  if (zone > 0) ip = ip.slice(0, zone);
  return ip.toLowerCase();
}

function classifyV4(octets: number[]): IpKind {
  const [a, b] = octets;
  if (a === 127) return "loopback";
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return "private";
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";
  if (a === 169 && b === 254) return "link-local";
  if (a === 0) return "unknown";
  return "public";
}

function classifyV6(ip: string): IpKind {
  if (ip === "::1") return "loopback";
  if (ip === "::") return "unknown";
  if (/^f[cd][0-9a-f]{0,2}:/.test(ip)) return "private";
  if (/^fe[89ab][0-9a-f]?:/.test(ip)) return "link-local";
  return "public";
}

export function classifyIp(raw: string | null | undefined): IpInfo | null {
  const address = normalizeIp(raw);
  if (!address) return null;
  const v4 = IPV4.exec(address);
  if (v4) {
    const octets = v4.slice(1).map(Number);
    if (octets.some((o) => o > 255)) return { address, kind: "unknown" };
    return { address, kind: classifyV4(octets) };
  }
  if (address.includes(":") && /^[0-9a-f:.]+$/.test(address)) return { address, kind: classifyV6(address) };
  return { address, kind: "unknown" };
}

/** ชื่อประเภทไอพีที่แสดงในหน้าจอ — สาธารณะไม่ต้องติดป้าย (เป็นกรณีปกติ) */
export const IP_KIND_LABEL: Record<IpKind, string | null> = {
  public: null,
  loopback: "เครื่องเซิร์ฟเวอร์เอง",
  private: "เครือข่ายภายใน",
  cgnat: "เครือข่ายภายในผู้ให้บริการ",
  "link-local": "เครือข่ายภายใน",
  unknown: "อ่านไม่ออก",
};

/**
 * ประเทศ + ผู้ให้บริการของไอพีสาธารณะ จากฐานข้อมูลออฟไลน์ DB-IP Lite (ไม่ส่งไอพีออกไปค้นข้างนอก)
 * ไม่มีระดับจังหวัดโดยตั้งใจ — ไอพีมือถือไทยส่วนใหญ่ถูกระบุเป็นกรุงเทพฯ ไม่ว่าอยู่ที่ไหน
 */
export interface IpGeo {
  countryCode: string | null;
  /** ชื่อประเทศภาษาไทย */
  country: string | null;
  /** ชื่อผู้ให้บริการ/เครือข่าย (ตัดคำนิติบุคคลท้ายชื่อแล้ว) */
  network: string | null;
  asn: number | null;
  /** อยู่นอกประเทศหลักของบริษัท (ค่าตั้งต้น ไทย) — สัญญาณว่าบัญชีอาจถูกใช้โดยคนอื่น */
  foreign: boolean;
}

export interface GeoipStatusDto {
  /** มีไฟล์ฐานข้อมูลให้ค้นไหม */
  available: boolean;
  /** เดือนของข้อมูล เช่น "2026-10" */
  month: string | null;
  homeCountry: string;
  /** เซิร์ฟเวอร์อัปเดตไฟล์เองทุกเดือนไหม */
  autoUpdate: boolean;
}

/** เครดิตที่สัญญาอนุญาต CC BY 4.0 ของ DB-IP บังคับให้แสดงทุกที่ที่ใช้ข้อมูล */
export const GEOIP_ATTRIBUTION = { text: "IP Geolocation by DB-IP", url: "https://db-ip.com" } as const;
