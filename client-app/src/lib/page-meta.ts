import { useEffect, useState } from "react";

import { getPublicSettings } from "./public-api";

/**
 * ชื่อแท็บ + คำอธิบายหน้า (meta description) รายหน้า
 *
 * ชื่อแท็บไปโผล่ทั้งแท็บเบราว์เซอร์ ประวัติ บุ๊กมาร์ก และเป็นบรรทัดสีน้ำเงินในผลค้นหา Google
 * คำอธิบายคือบรรทัดสีเทาข้างใต้ — ไม่มีคำอธิบาย Google หยิบข้อความในหน้ามาเอง ซึ่งมักได้แถวเมนู
 * Google รันโค้ดหน้าเว็บก่อนเก็บ ค่าที่ตั้งจากตรงนี้จึงไปถึง · ส่วนการ์ดตอนแชร์ลง LINE/Facebook ไม่รันโค้ด
 * ใช้ค่าตั้งต้นใน index.html แทน (ดู og:* ที่นั่น)
 *
 * ชื่อบริษัทต่อท้ายดึงจากค่าตั้ง "ชื่อบริษัท" — แก้ที่หน้าตั้งค่าแล้วชื่อแท็บเปลี่ยนตาม
 */
const FALLBACK_SITE_NAME = "Awarin Engineering";
export const DEFAULT_DESCRIPTION =
  "รับออกแบบและก่อสร้างบ้านครบวงจร ดูแบบบ้านพร้อมสเปก ผลงานที่ผ่านมา และขอประเมินราคาก่อสร้างฟรี พร้อมใบเสนอราคาแจกแจงทุกรายการ";

let siteName = FALLBACK_SITE_NAME;
let siteNamePromise: Promise<string> | null = null;

function loadSiteName(): Promise<string> {
  siteNamePromise ??= getPublicSettings()
    .then((res) => {
      siteName = res.settings.companyName?.trim() || FALLBACK_SITE_NAME;
      return siteName;
    })
    .catch(() => siteName);
  return siteNamePromise;
}

function setDescription(text: string) {
  let el = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!el) {
    el = document.createElement("meta");
    el.name = "description";
    document.head.appendChild(el);
  }
  el.content = text;
}

/** ตัดคำอธิบายให้ไม่เกินที่ Google แสดง (~155 ตัว) — ยาวกว่านี้ถูกตัดกลางคำพร้อม "…" อยู่ดี */
export function clampDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * `title` = ชื่อหน้า (null = หน้าแรก ใช้ชื่อบริษัทอย่างเดียว) · `description` ไม่ส่ง = คำอธิบายกลางของเว็บ
 * หน้าที่รอข้อมูล (รายละเอียดแบบบ้าน) ส่ง undefined ไว้ก่อนได้ — ตั้งใหม่เมื่อค่ามา
 */
export function usePageMeta(title: string | null | undefined, description?: string | null) {
  const [name, setName] = useState(siteName);

  useEffect(() => {
    let alive = true;
    void loadSiteName().then((n) => {
      if (alive) setName(n);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (title === undefined) return;
    document.title = title ? `${title} · ${name}` : name;
    setDescription(clampDescription(description || DEFAULT_DESCRIPTION));
  }, [title, description, name]);
}
