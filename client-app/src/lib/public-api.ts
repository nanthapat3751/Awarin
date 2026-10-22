import type { AreaRange, HouseDesignDto, PortfolioDto, PortfolioType } from "@systemboq/shared-types";

import { apiFetch } from "./api";

export function listHouseDesigns(): Promise<{ houseDesigns: HouseDesignDto[] }> {
  return apiFetch("/api/public/house-designs");
}

// แบบบ้านแนะนำสำหรับหน้าแรก (staff เลือกไว้ + จัดลำดับเอง) — โชว์เท่าที่เลือก
export function listFeaturedHouseDesigns(
  limit?: number,
): Promise<{ houseDesigns: HouseDesignDto[] }> {
  const query = limit ? `?limit=${limit}` : "";
  return apiFetch(`/api/public/house-designs/featured${query}`);
}

export function getHouseDesign(id: string): Promise<{ houseDesign: HouseDesignDto }> {
  return apiFetch(`/api/public/house-designs/${id}`);
}

export function listPortfolio(type?: PortfolioType): Promise<{ portfolio: PortfolioDto[] }> {
  const query = type ? `?type=${type}` : "";
  return apiFetch(`/api/public/portfolio${query}`);
}

// ผลงานเด่นสำหรับโซนสำรวจผลงานของหน้าบริการ (staff เลือกไว้ + เติมล่าสุดถ้าไม่ครบ)
// total = จำนวนผลงานที่เผยแพร่แล้วทั้งหมด (ตัวเลขจริงไว้โชว์ในหน้าบริการ)
export function listFeaturedPortfolio(
  limit?: number,
): Promise<{ portfolio: PortfolioDto[]; total: number }> {
  const query = limit ? `?limit=${limit}` : "";
  return apiFetch(`/api/public/portfolio/featured${query}`);
}

export function getPortfolioItem(id: string): Promise<{ item: PortfolioDto }> {
  return apiFetch(`/api/public/portfolio/${id}`);
}

/**
 * ค่าตั้งเว็บ (ชื่อบริษัท รูปในคลังรูป ฯลฯ) — ขอครั้งเดียวต่อการเปิดเว็บ ทุกส่วนใช้คำตอบเดียวกัน
 *
 * เดิมฟุตเตอร์ ชื่อแท็บ และตัวหน้าต่างคนต่างยิง หน้าแรกจึงขอซ้ำ 3 รอบ (บางรอบช้า 2–3 วิ)
 * คำตอบล่าสุดจำไว้ในเครื่องด้วย (cachedPublicSettings) ให้หน้าแรกรู้ทันทีว่าจะใช้รูปไหน
 * ไม่ต้องรอเครือข่าย — สคริปต์ใน index.html อ่านคีย์เดียวกันนี้เพื่อสั่งโหลดรูป hero ล่วงหน้า
 */
export const PUBLIC_SETTINGS_CACHE_KEY = "awarin:public-settings";
/** ระบบที่เซิร์ฟเวอร์เปิดอยู่จริง — ใช้ในหน้านโยบายความเป็นส่วนตัว */
export interface PublicFeatures {
  slipCheck: boolean;
}
type PublicSettingsResponse = { settings: Record<string, string>; features?: PublicFeatures };
let settingsPromise: Promise<PublicSettingsResponse> | null = null;

export function getPublicSettings(): Promise<PublicSettingsResponse> {
  settingsPromise ??= apiFetch<PublicSettingsResponse>("/api/public/settings").then(
    (res) => {
      try {
        localStorage.setItem(PUBLIC_SETTINGS_CACHE_KEY, JSON.stringify(res.settings));
      } catch {
        // โหมดส่วนตัว/บล็อกที่เก็บข้อมูล — ไม่เป็นไร แค่ครั้งหน้าต้องรอเครือข่ายเหมือนเดิม
      }
      return res;
    },
    (err: unknown) => {
      // ล้มเหลวแล้วต้องลองใหม่ได้ ไม่งั้นทั้งเว็บค้างคำตอบที่ล้มไว้จนกว่าจะรีเฟรช
      settingsPromise = null;
      throw err;
    },
  );
  return settingsPromise;
}

/** ค่าตั้งจากการเปิดเว็บครั้งก่อน — null = ไม่เคยมี/อ่านไม่ได้ (ใช้ระหว่างรอคำตอบจริงเท่านั้น) */
export function cachedPublicSettings(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(PUBLIC_SETTINGS_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function createLead(input: {
  name: string;
  phone: string;
  email?: string;
  serviceType: string;
  houseDesignId?: string;
  message?: string;
  // ข้อมูลโครงการเบื้องต้น (ถ้าลูกค้าทราบ) — ส่งเฉพาะช่องที่กรอก
  siteAddress?: string;
  areaSqm?: number;
  areaRange?: AreaRange;
  desiredStartDate?: string;
  // token จาก Cloudflare Turnstile (CAPTCHA) — เซิร์ฟเวอร์ตรวจก่อนสร้างคำขอ
  turnstileToken?: string;
}): Promise<{ lead: { id: string } }> {
  return apiFetch("/api/public/leads", { method: "POST", body: JSON.stringify(input) });
}
