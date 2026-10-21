import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * อัปเดตฐานข้อมูล DB-IP รายเดือน (geoip.ts) โดยไม่ออกเน็ตจริง — fetch ถูกแทนด้วยตัวปลอมที่คืนไฟล์
 * .mmdb ของจริงในเครื่อง (server/data/geoip) ที่บีบอัดแบบเดียวกับที่ DB-IP ให้ดาวน์โหลด
 *
 * สิ่งที่ต้องไม่พัง: เดือนนี้ยังไม่ออก → ถอยไปเดือนก่อน · มีของเดือนนี้แล้ว → ไม่โหลดซ้ำ ·
 * ดาวน์โหลดพัง/ไม่มีทั้งสองเดือน → โยน error โดยไม่ทับไฟล์เดิม · ไม่มีไฟล์เลย → ฟีเจอร์เงียบ ไม่ล้ม
 *
 * ไฟล์ .mmdb ไม่อยู่ใน git (ใหญ่ + ดาวน์โหลดเองด้วย npm run geoip:update) — เครื่องที่ยังไม่มีไฟล์
 * จะข้ามเฉพาะเคสที่ต้องใช้ไฟล์จริง
 */
const REAL_DIR = path.resolve(__dirname, "../../data/geoip");
const haveRealDb = existsSync(path.join(REAL_DIR, "country.mmdb")) && existsSync(path.join(REAL_DIR, "asn.mmdb"));
const itReal = haveRealDb ? it : it.skip;

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "systemboq-geoip-"));
process.env.GEOIP_DIR = tmpDir;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const geoip = require("../../src/lib/geoip") as typeof import("../../src/lib/geoip");

type FetchResult = { status: number; ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> };

function respond(status: number, body: Buffer = Buffer.alloc(0)): FetchResult {
  return {
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  };
}

const gz = (file: string) => gzipSync(readFileSync(path.join(REAL_DIR, file)));

describe("geoip monthly database update", () => {
  const realFetch = global.fetch;
  let requested: string[];

  beforeEach(() => {
    requested = [];
  });

  afterAll(() => {
    global.fetch = realFetch;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function fakeFetch(handler: (url: string) => FetchResult) {
    global.fetch = jest.fn(async (url: string | URL | Request) => {
      requested.push(String(url));
      return handler(String(url));
    }) as unknown as typeof fetch;
  }

  it("stays quiet when no database files exist", () => {
    expect(geoip.geoipStatus()).toMatchObject({ available: false, month: null, homeCountry: "TH", autoUpdate: false });
    expect(geoip.geoLookup("1.1.1.1")).toBeNull();
    expect(geoip.geoLookup("192.168.1.10")).toBeNull();
  });

  it("gives up with a clear error when neither this month nor last month is published", async () => {
    fakeFetch(() => respond(404));
    await expect(geoip.updateGeoipDatabase({ now: new Date("2026-01-03T00:00:00Z") })).rejects.toThrow(
      "ยังไม่มีไฟล์ของเดือน 2026-01 และ 2025-12",
    );
    // ข้ามปีถูก: มกราคม → ธันวาคมปีก่อน
    expect(requested.some((u) => u.includes("dbip-country-lite-2025-12"))).toBe(true);
    expect(existsSync(path.join(tmpDir, "meta.json"))).toBe(false);
  });

  it("fails loudly on a server error instead of treating it as 'not published'", async () => {
    fakeFetch(() => respond(503));
    await expect(geoip.updateGeoipDatabase({ now: new Date("2026-10-10T00:00:00Z") })).rejects.toThrow("HTTP 503");
  });

  it("refuses a download that is not a readable database", async () => {
    fakeFetch(() => respond(200, gzipSync(Buffer.from("not an mmdb file"))));
    await expect(geoip.updateGeoipDatabase({ now: new Date("2026-10-10T00:00:00Z") })).rejects.toThrow();
    expect(existsSync(path.join(tmpDir, "country.mmdb"))).toBe(false);
  });

  itReal("falls back to last month when this month is not out yet, then looks IPs up from the new files", async () => {
    const country = gz("country.mmdb");
    const asn = gz("asn.mmdb");
    fakeFetch((url) => {
      if (url.includes("2026-10")) return respond(404);
      return respond(200, url.includes("country") ? country : asn);
    });

    const result = await geoip.updateGeoipDatabase({ now: new Date("2026-10-01T03:00:00Z") });
    expect(result).toEqual({ month: "2026-09", downloaded: true });
    expect(JSON.parse(readFileSync(path.join(tmpDir, "meta.json"), "utf8")).month).toBe("2026-09");
    expect(existsSync(path.join(tmpDir, "country.mmdb.tmp"))).toBe(false);

    expect(geoip.geoipStatus()).toMatchObject({ available: true, month: "2026-09" });
    const hit = geoip.geoLookup("1.1.1.1");
    expect(hit).not.toBeNull();
    expect(hit!.countryCode).toMatch(/^[A-Z]{2}$/);
    expect(hit!.foreign).toBe(hit!.countryCode !== "TH");
  });

  itReal("does not download again when the files are already from that month", async () => {
    fakeFetch(() => respond(500));
    // ไฟล์ที่มีอยู่เป็นของ 2026-09 แล้ว และวันนี้ก็ยังเป็นเดือน 09 → ไม่ต้องถามเซิร์ฟเวอร์เลย
    const sameMonth = await geoip.updateGeoipDatabase({ now: new Date("2026-09-20T00:00:00Z") });
    expect(sameMonth).toEqual({ month: "2026-09", downloaded: false });
    expect(requested).toEqual([]);
  });

  itReal("re-downloads when forced", async () => {
    const country = gz("country.mmdb");
    const asn = gz("asn.mmdb");
    fakeFetch((url) => respond(200, url.includes("country") ? country : asn));
    const forced = await geoip.updateGeoipDatabase({ force: true, now: new Date("2026-09-20T00:00:00Z") });
    expect(forced).toEqual({ month: "2026-09", downloaded: true });
    expect(requested).toHaveLength(2);
  });

  it("does not start the background updater under tests", () => {
    const stop = geoip.startGeoipUpdater();
    expect(typeof stop).toBe("function");
    stop();
  });

  it("runs the background updater outside tests and can be stopped", async () => {
    jest.useFakeTimers();
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const log = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      fakeFetch(() => respond(503));
      const stop = geoip.startGeoipUpdater();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(requested.length).toBeGreaterThan(0);
      expect(log).toHaveBeenCalledWith(expect.stringContaining("[geoip]"), expect.stringContaining("HTTP 503"));
      stop();
      const before = requested.length;
      await jest.advanceTimersByTimeAsync(13 * 3_600_000);
      expect(requested).toHaveLength(before);
    } finally {
      process.env.NODE_ENV = prevEnv;
      log.mockRestore();
      jest.useRealTimers();
    }
  });
});
