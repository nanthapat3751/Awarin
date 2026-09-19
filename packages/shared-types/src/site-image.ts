/**
 * ช่องรูปภาพของเว็บไซต์สาธารณะที่พนักงานเปลี่ยนเองได้จากหน้า "คลังรูปเว็บไซต์"
 *
 * ทะเบียนนี้เป็นแหล่งความจริงแหล่งเดียว — เซิร์ฟเวอร์ใช้เพื่อกำหนดคีย์ที่อนุญาตให้บันทึก
 * แอปพนักงานใช้เพื่อสร้างรายการช่องรูปพร้อมคำอธิบาย และ client ใช้ชื่อคีย์เดียวกันตอนอ่านค่า
 *
 * ค่าที่เก็บคือ URL ของรูปที่อัปโหลดผ่าน `POST /api/uploads` (หรือ URL ภายนอก)
 * ถ้าเว้นว่าง เว็บจะกลับไปใช้ `fallback` ตามที่ระบุไว้ในแต่ละช่อง
 *
 * **โลโก้ไม่ได้อยู่ในทะเบียนนี้โดยตั้งใจ** — โลโก้มีสองเวอร์ชัน (พื้นเข้ม/พื้นสว่าง) กระจาย 6 จุด
 * ทั้งฝั่งลูกค้าและฝั่งพนักงาน และหัวกระดาษ PDF ใช้ไฟล์คนละตัวที่ต้องแปลงเป็น data URI
 * (ดู `server/src/lib/pdf/letterhead.ts`) การเปลี่ยนโลโก้จึงเป็นงานแยกที่ต้องคิดครบทั้งชุด
 */
export interface SiteImageSlot {
  /** คีย์ใน Setting — ต้องขึ้นต้นด้วย site เพื่อให้แยกออกจากคีย์ข้อมูลบริษัท */
  key: SiteImageKey;
  /** ชื่อที่พนักงานเห็นในหน้าคลังรูป */
  label: string;
  /** ไปโผล่ที่หน้าไหนของเว็บลูกค้า (ข้อความอธิบายให้พนักงานอ่าน) */
  page: string;
  /**
   * เส้นทาง + จุดยึดของตำแหน่งรูปนั้นบนเว็บลูกค้า ใช้ทำปุ่ม "ดูหน้าจริง"
   * ต้องชี้ตรงจุดที่รูปอยู่จริง ไม่ใช่แค่ชื่อหน้า — ไม่งั้นกดแล้วไปโผล่บนสุดของหน้า
   * ต้องมี id ตรงกันอยู่ในหน้านั้นจริง และ element นั้นต้องมี scroll-mt-* กันแถบเมนูบัง
   */
  href: string;
  /** ขนาดที่แนะนำ (กว้าง×สูง) — บอกไว้กันอัปรูปเล็กเกินแล้วแตก */
  recommended: string;
  /** สัดส่วนกรอบที่ใช้แสดงตัวอย่างในหน้าคลังรูป */
  aspect: "wide" | "banner" | "portrait";
  /** รูปที่ใช้เมื่อยังไม่ได้ตั้งค่า — ว่าง = ไม่มีรูปเริ่มต้น (จะขึ้นกล่องว่าง) */
  fallback: string;
  /**
   * true = เมื่อไม่ได้ตั้งรูปไว้ เว็บจะไปหยิบรูปจากที่อื่นมาแสดงเอง (ไม่ใช่ช่องว่างเปล่า)
   * หน้าคลังรูปต้องไปดึงรูปนั้นมาโชว์ด้วย ไม่งั้นพรีวิวจะบอกว่า "ว่าง" ทั้งที่หน้าจริงมีรูปอยู่
   */
  autoFromContent?: boolean;
  /** อธิบายพฤติกรรมพิเศษให้พนักงานเข้าใจ (ไม่ใส่ก็ได้) */
  note?: string;
}

export type SiteImageKey =
  | "siteHeroHome"
  | "siteAboutHome"
  | "siteHeroServices"
  | "siteServiceDesign"
  | "siteServicePhase1"
  | "siteServicePhase2"
  | "siteServicePhase3";

export const SITE_IMAGE_SLOTS: readonly SiteImageSlot[] = [
  {
    key: "siteHeroHome",
    label: "ภาพใหญ่หน้าแรก",
    page: "หน้าแรก",
    href: "/",
    recommended: "1920 × 1080 px",
    aspect: "banner",
    fallback: "/web12.jpg",
    note: "ภาพเต็มจอด้านบนสุด มีตัวหนังสือสีขาวทับอยู่ ควรเลือกภาพที่ฝั่งซ้ายไม่สว่างจนอ่านไม่ออก",
  },
  {
    key: "siteAboutHome",
    label: "ภาพส่วนเกี่ยวกับเรา",
    page: "หน้าแรก · ส่วนเกี่ยวกับเรา",
    href: "/#about",
    autoFromContent: true,
    recommended: "1200 × 900 px",
    aspect: "wide",
    fallback: "",
    note: "ถ้าเว้นว่าง เว็บจะหยิบรูปแบบบ้านหลังแรกที่มีภาพมาใช้เองอัตโนมัติ (พรีวิวด้านบนคือรูปที่หน้าเว็บใช้อยู่จริงตอนนี้)",
  },
  {
    key: "siteHeroServices",
    label: "ภาพใหญ่หน้าบริการ",
    page: "หน้าบริการ",
    href: "/services",
    recommended: "1920 × 1080 px",
    aspect: "banner",
    fallback: "",
  },
  {
    key: "siteServiceDesign",
    label: "ภาพงานออกแบบ",
    page: "หน้าบริการ · ส่วนงานออกแบบ",
    href: "/services#design",
    recommended: "800 × 1000 px (แนวตั้ง)",
    aspect: "portrait",
    fallback: "",
  },
  {
    key: "siteServicePhase1",
    label: "ภาพขั้นตอนที่ 1 — ก่อนเริ่มก่อสร้าง",
    page: "หน้าบริการ · ส่วนงานก่อสร้าง",
    href: "/services#phase-1",
    recommended: "1280 × 800 px",
    aspect: "wide",
    fallback: "",
  },
  {
    key: "siteServicePhase2",
    label: "ภาพขั้นตอนที่ 2 — ระหว่างก่อสร้าง",
    page: "หน้าบริการ · ส่วนงานก่อสร้าง",
    href: "/services#phase-2",
    recommended: "1280 × 800 px",
    aspect: "wide",
    fallback: "",
  },
  {
    key: "siteServicePhase3",
    label: "ภาพขั้นตอนที่ 3 — หลังก่อสร้างเสร็จ",
    page: "หน้าบริการ · ส่วนงานก่อสร้าง",
    href: "/services#phase-3",
    recommended: "1280 × 800 px",
    aspect: "wide",
    fallback: "",
  },
];

export const SITE_IMAGE_KEYS: readonly SiteImageKey[] = SITE_IMAGE_SLOTS.map((s) => s.key);

/**
 * ยอมรับเฉพาะ URL ที่ปลอดภัยจะเอาไปใส่ `<img src>` — http/https หรือเส้นทางในเว็บเอง (`/...`)
 * ค่าเหล่านี้ถูกตั้งจากหน้าตั้งค่าแล้วเสิร์ฟให้คนทั่วไป จึงต้องกัน `javascript:` / `data:`
 * ไม่ให้หลุดเข้าไปเป็นค่าที่เก็บไว้ (stored XSS) — เช็คทั้งฝั่งเซิร์ฟเวอร์ตอนบันทึกและฝั่ง
 * client ตอนอ่าน เพราะข้อมูลเดิมในฐานอาจถูกใส่ไว้ก่อนมีการตรวจนี้
 */
export function isSafeImageUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (trimmed === "") return false;
  return /^https?:\/\//i.test(trimmed) || /^\/[^/\\]/.test(trimmed);
}

/** คืน URL ที่ใช้ได้จริง: ค่าที่ตั้งไว้ (ถ้าปลอดภัย) ไม่งั้นใช้ค่าสำรองที่ส่งมา */
export function resolveSiteImage(
  value: string | undefined | null,
  fallback: string,
): string {
  return isSafeImageUrl(value) ? (value as string).trim() : fallback;
}
