import type { HouseDesignDto, PortfolioDto, PortfolioType } from "@systemboq/shared-types";

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

export function getPublicSettings(): Promise<{ settings: Record<string, string> }> {
  return apiFetch("/api/public/settings");
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
  desiredStartDate?: string;
  // token จาก Cloudflare Turnstile (CAPTCHA) — เซิร์ฟเวอร์ตรวจก่อนสร้างคำขอ
  turnstileToken?: string;
}): Promise<{ lead: { id: string } }> {
  return apiFetch("/api/public/leads", { method: "POST", body: JSON.stringify(input) });
}
