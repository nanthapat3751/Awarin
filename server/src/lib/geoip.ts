import { readFileSync, renameSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { classifyIp, type IpGeo, type GeoipStatusDto } from "@systemboq/shared-types";
import { Reader } from "mmdb-lib";

/**
 * ประเทศ + ผู้ให้บริการของไอพี จากฐานข้อมูลออฟไลน์ DB-IP Lite (สัญญาอนุญาต CC BY 4.0 — ต้องแสดงเครดิต)
 *
 * ค้นในเครื่องเซิร์ฟเวอร์เองทั้งหมด **ไม่ส่งไอพีลูกค้าไปเว็บค้นหาภายนอก** — นั่นคือการส่งข้อมูลส่วนบุคคล
 * ให้บุคคลที่สาม ขัดกับนโยบายความเป็นส่วนตัวที่ประกาศไว้
 *
 * ตั้งใจไม่ทำระดับจังหวัด: ไอพีของค่ายมือถือไทยส่วนใหญ่ถูกระบุเป็นกรุงเทพฯ ไม่ว่าลูกค้าอยู่ที่ไหน
 * ผู้ให้บริการกับประเทศแม่นกว่ามาก และประเทศคือสัญญาณที่ใช้จริง (บัญชีลูกค้าในไทยเข้าจากต่างประเทศ)
 *
 * ไม่มีไฟล์ = ฟีเจอร์นี้เงียบไปเฉย ๆ ส่วนอื่นทำงานปกติ · ไฟล์ถูกอัปเดตระหว่างรัน = โหลดใหม่เอง
 */
export const GEOIP_DIR = process.env.GEOIP_DIR ?? path.resolve(__dirname, "../../data/geoip");
const HOME_COUNTRY = (process.env.GEOIP_HOME_COUNTRY ?? "TH").toUpperCase();
const SOURCE_URL = "https://download.db-ip.com/free";
const FILES = { country: "country.mmdb", asn: "asn.mmdb" } as const;
const META_FILE = "meta.json";
// เช็คว่าไฟล์เปลี่ยนไหมไม่บ่อยกว่านี้ — ทุกแถวในตารางเรียกค้น จะ stat ไฟล์ทุกครั้งไม่ได้
const RELOAD_CHECK_MS = 10 * 60_000;

interface CountryRecord {
  country?: { iso_code?: string };
}
interface AsnRecord {
  autonomous_system_number?: number;
  autonomous_system_organization?: string;
}
interface Lookup<T> {
  get(ip: string): T | null;
}

interface State {
  country: Lookup<CountryRecord> | null;
  asn: Lookup<AsnRecord> | null;
  month: string | null;
  mtimes: string;
  checkedAt: number;
}

let state: State = { country: null, asn: null, month: null, mtimes: "", checkedAt: 0 };
/** เทสต์ใส่ตัวค้นปลอมแทนไฟล์จริง — ตั้งแล้วไม่โหลดจากดิสก์ */
let injected = false;

function fileMtimes(): string {
  return Object.values(FILES)
    .map((f) => {
      try {
        return String(statSync(path.join(GEOIP_DIR, f)).mtimeMs);
      } catch {
        return "-";
      }
    })
    .join("|");
}

function openReader<T>(file: string): Lookup<T> | null {
  try {
    return new Reader<T & object>(readFileSync(path.join(GEOIP_DIR, file))) as unknown as Lookup<T>;
  } catch {
    return null;
  }
}

function readMonth(): string | null {
  try {
    const meta = JSON.parse(readFileSync(path.join(GEOIP_DIR, META_FILE), "utf8")) as { month?: string };
    return typeof meta.month === "string" ? meta.month : null;
  } catch {
    return null;
  }
}

function ensureLoaded(): State {
  if (injected) return state;
  const now = Date.now();
  if (now - state.checkedAt < RELOAD_CHECK_MS) return state;
  const mtimes = fileMtimes();
  if (mtimes !== state.mtimes) {
    state = {
      country: openReader<CountryRecord>(FILES.country),
      asn: openReader<AsnRecord>(FILES.asn),
      month: readMonth(),
      mtimes,
      checkedAt: now,
    };
  } else {
    state.checkedAt = now;
  }
  return state;
}

// ชื่อบริษัทใน ASN ยาวและเป็นทางการ ("Advanced Wireless Network Company Limited") — ตัดคำนิติบุคคลท้ายชื่อ
// ออกให้สั้นพออ่านในตาราง ไม่แปลงเป็นชื่อแบรนด์เอง (เดาผิดแล้วจะชี้ผิดค่าย)
const LEGAL_SUFFIX =
  /[\s,.]*(public company limited|company limited|co\.?\s*,?\s*ltd\.?|corporation|limited|ltd\.?|inc\.?|corp\.?|plc\.?|llc\.?)\.?$/i;
function shortNetworkName(org: string | undefined): string | null {
  if (!org) return null;
  let name = org.trim();
  for (let i = 0; i < 3 && LEGAL_SUFFIX.test(name); i += 1) name = name.replace(LEGAL_SUFFIX, "").trim();
  return name || org.trim();
}

const regionNames = new Intl.DisplayNames(["th"], { type: "region" });
function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** ประเทศ/ผู้ให้บริการของไอพีสาธารณะ — ไอพีภายใน/ไม่มีฐานข้อมูล/หาไม่เจอ = null */
export function geoLookup(rawIp: string | null | undefined): IpGeo | null {
  const ip = classifyIp(rawIp);
  if (!ip || ip.kind !== "public") return null;
  const { country, asn } = ensureLoaded();
  if (!country && !asn) return null;

  let countryCode: string | null = null;
  let asnRecord: AsnRecord | null = null;
  try {
    countryCode = country?.get(ip.address)?.country?.iso_code?.toUpperCase() ?? null;
    asnRecord = asn?.get(ip.address) ?? null;
  } catch {
    return null;
  }
  if (!countryCode && !asnRecord) return null;

  return {
    countryCode,
    country: countryCode ? countryName(countryCode) : null,
    network: shortNetworkName(asnRecord?.autonomous_system_organization),
    asn: asnRecord?.autonomous_system_number ?? null,
    foreign: countryCode !== null && countryCode !== HOME_COUNTRY,
  };
}

export function geoipStatus(): GeoipStatusDto {
  const s = ensureLoaded();
  return {
    available: Boolean(s.country || s.asn),
    month: s.month,
    homeCountry: HOME_COUNTRY,
    autoUpdate: autoUpdateEnabled(),
  };
}

/** สำหรับเทสต์เท่านั้น — ใส่ตัวค้นปลอม หรือ null เพื่อกลับไปอ่านไฟล์จริง */
export function setGeoLookupForTest(
  readers: { country?: Lookup<CountryRecord> | null; asn?: Lookup<AsnRecord> | null; month?: string | null } | null,
): void {
  if (readers === null) {
    injected = false;
    state = { country: null, asn: null, month: null, mtimes: "", checkedAt: 0 };
    return;
  }
  injected = true;
  state = { country: readers.country ?? null, asn: readers.asn ?? null, month: readers.month ?? null, mtimes: "", checkedAt: 0 };
}

// ────────────────────────── ดาวน์โหลด / อัปเดตรายเดือน ──────────────────────────

/** "2026-10" ตามเวลาไทย — DB-IP ออกไฟล์ใหม่ต้นเดือน */
function monthOf(date: Date): string {
  const bkk = new Date(date.getTime() + 7 * 3_600_000);
  return `${bkk.getUTCFullYear()}-${String(bkk.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

async function fetchMmdb(kind: "country" | "asn", month: string): Promise<Buffer | null> {
  const res = await fetch(`${SOURCE_URL}/dbip-${kind}-lite-${month}.mmdb.gz`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ดาวน์โหลด ${kind} ${month} ไม่สำเร็จ (HTTP ${res.status})`);
  const data = gunzipSync(Buffer.from(await res.arrayBuffer()));
  // ตรวจว่าเปิดได้และค้นได้จริงก่อนเอาไปแทนของเดิม — ไฟล์เสียต้องไม่ทับไฟล์ที่ใช้งานได้
  const probe = new Reader<object>(data).get("1.1.1.1");
  if (!probe) throw new Error(`ไฟล์ ${kind} ${month} เปิดได้แต่ค้นไม่เจอ — ไม่ใช้ไฟล์นี้`);
  return data;
}

/**
 * ดาวน์โหลดฐานข้อมูลเดือนล่าสุด (ยังไม่ออก = ใช้เดือนก่อน) แล้วแทนที่ไฟล์เดิมแบบไม่มีช่วงไฟล์ครึ่ง ๆ
 * คืนเดือนที่ได้ · มีเดือนนั้นอยู่แล้วและไม่ force = ไม่โหลดซ้ำ
 */
export async function updateGeoipDatabase(opts: { force?: boolean; now?: Date } = {}): Promise<{ month: string; downloaded: boolean }> {
  const current = monthOf(opts.now ?? new Date());
  const have = readMonth();
  if (!opts.force && have === current) return { month: current, downloaded: false };

  for (const month of [current, previousMonth(current)]) {
    if (!opts.force && have === month) return { month, downloaded: false };
    const country = await fetchMmdb("country", month);
    const asn = country ? await fetchMmdb("asn", month) : null;
    if (!country || !asn) continue;

    mkdirSync(GEOIP_DIR, { recursive: true });
    for (const [name, data] of [[FILES.country, country], [FILES.asn, asn]] as const) {
      const target = path.join(GEOIP_DIR, name);
      writeFileSync(`${target}.tmp`, data);
      renameSync(`${target}.tmp`, target);
    }
    writeFileSync(
      path.join(GEOIP_DIR, META_FILE),
      JSON.stringify({ month, source: "DB-IP Lite (CC BY 4.0)", downloadedAt: new Date().toISOString() }, null, 2),
    );
    state.checkedAt = 0; // ให้การค้นครั้งถัดไปโหลดไฟล์ใหม่ทันที
    return { month, downloaded: true };
  }
  throw new Error(`ยังไม่มีไฟล์ของเดือน ${current} และ ${previousMonth(current)} ที่ ${SOURCE_URL}`);
}

function autoUpdateEnabled(): boolean {
  return process.env.GEOIP_AUTO_UPDATE !== "false" && process.env.NODE_ENV !== "test";
}

/**
 * อัปเดตเองทุกเดือน — เช็คหลังบูตและทุก 12 ชั่วโมง ทำจริงเมื่อไฟล์ไม่ใช่ของเดือนนี้
 * API แต่ละตัวมีดิสก์ของตัวเอง จึงอัปเดตของตัวเอง (ไม่จองรอบร่วมกันเหมือนงานรายวัน)
 * ปิดด้วย GEOIP_AUTO_UPDATE=false (เช่น เครื่องที่ออกเน็ตไม่ได้ ให้รัน npm run geoip:update เอง)
 */
export function startGeoipUpdater(): () => void {
  if (!autoUpdateEnabled()) return () => undefined;
  const run = () => {
    updateGeoipDatabase()
      .then((r) => {
        if (r.downloaded) console.log(`[geoip] อัปเดตฐานข้อมูลประเทศ/ผู้ให้บริการเป็นเดือน ${r.month}`);
      })
      .catch((err) => console.error("[geoip] อัปเดตไม่สำเร็จ (ใช้ไฟล์เดิมต่อ):", err instanceof Error ? err.message : err));
  };
  const first = setTimeout(run, 30_000);
  const timer = setInterval(run, 12 * 3_600_000);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
