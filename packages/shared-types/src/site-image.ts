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
  aspect: "wide" | "banner" | "portrait" | "tall" | "hex" | "box";
  /** รูปที่ใช้เมื่อยังไม่ได้ตั้งค่า — ว่าง = ไม่มีรูปเริ่มต้น (จะขึ้นกล่องว่าง) */
  fallback: string;
  /**
   * true = เมื่อไม่ได้ตั้งรูปไว้ เว็บจะไปหยิบรูปจากที่อื่นมาแสดงเอง (ไม่ใช่ช่องว่างเปล่า)
   * หน้าคลังรูปต้องไปดึงรูปนั้นมาโชว์ด้วย ไม่งั้นพรีวิวจะบอกว่า "ว่าง" ทั้งที่หน้าจริงมีรูปอยู่
   */
  autoFromContent?: boolean;
  /** ป้ายบนพรีวิวหน้าคลังรูปเมื่อใช้รูปอัตโนมัติ (ช่อง autoFromContent) — บอกว่ารูปมาจากไหน */
  autoLabel?: string;
  /**
   * เมื่อไม่ได้ตั้งรูปไว้ ให้ใช้รูปของช่องนี้แทน (ก่อนตกไป `fallback`) — ใช้กับช่องที่เป็นรูปเรื่องเดียวกัน
   * คนละหน้า เช่น การ์ดบริการหน้าแรกยืมรูปจากหน้าบริการ จะได้ไม่ต้องอัปรูปเดิมซ้ำสองที่
   * ลำดับเต็ม (ต้องตรงกันทั้งเว็บลูกค้าและพรีวิวในหน้าคลังรูป) ดู `resolveSiteImageSlot`
   */
  fallbackKey?: SiteImageKey;
  /** อธิบายพฤติกรรมพิเศษให้พนักงานเข้าใจ (ไม่ใส่ก็ได้) */
  note?: string;
}

export type SiteImageKey =
  | "siteHeroHome"
  | "siteAboutHero"
  | "siteAboutStory"
  | "siteAboutGallery1"
  | "siteAboutGallery2"
  | "siteAboutGallery3"
  | "siteAboutGallery4"
  | "siteHomeServiceDesign"
  | "siteHomeServiceBuild"
  | "siteHomeServiceEngineering"
  | "siteHeroServices"
  | "siteServicesHexMid"
  | "siteServicesHexLow"
  | "siteServicesHexTopRight"
  | "siteServicesHexBottomRight"
  | "siteServiceDesign"
  | "siteServicePhase1"
  | "siteServicePhase2"
  | "siteServicePhase3";

export const SITE_IMAGE_SLOTS: readonly SiteImageSlot[] = [
  {
    key: "siteHeroHome",
    label: "ส่วนหัว · ภาพพื้นหลังเต็มจอ",
    page: "ส่วนหัว (บนสุดของหน้าแรก)",
    href: "/",
    recommended: "1920 × 1080 px",
    aspect: "banner",
    fallback: "/web12.webp",
    note: "ภาพเต็มจอด้านบนสุด มีตัวหนังสือสีขาวทับอยู่ ควรเลือกภาพที่ฝั่งซ้ายไม่สว่างจนอ่านไม่ออก",
  },
  {
    key: "siteAboutHero",
    label: "ส่วนหัว · ภาพด้านขวา",
    page: "ส่วนหัว (บนสุดของหน้าเกี่ยวกับเรา)",
    href: "/about",
    recommended: "1200 × 1000 px",
    aspect: "box",
    fallback: "",
    fallbackKey: "siteServicePhase2",
    note: "อยู่ขวาของหัวหน้า ฝั่งซ้ายของรูปจางหายเข้าพื้น และตัดส่วนล่างออก (กันลายน้ำมุมล่าง) · ถ้าเว้นว่าง ใช้รูปของ “หน้าบริการ · งานก่อสร้าง ขั้นตอนที่ 2”",
  },
  {
    key: "siteAboutStory",
    label: "ประวัติบริษัท · ภาพกว้างใต้หัวข้อ",
    page: "ส่วนประวัติบริษัท",
    href: "/about#story",
    recommended: "1920 × 1080 px",
    aspect: "banner",
    fallback: "",
    fallbackKey: "siteServiceDesign",
    note: "ถ้าเว้นว่าง ใช้รูปของ “หน้าบริการ · งานออกแบบ”",
  },
  {
    key: "siteAboutGallery1",
    label: "แถบรูปผลงาน · ช่องที่ 1 (ซ้ายสุด)",
    page: "ส่วนพื้นเข้มใต้คำขวัญ Building for Generations",
    href: "/about#gallery",
    autoFromContent: true,
    autoLabel: "ใช้รูปผลงานเด่นลำดับที่ 1",
    recommended: "1200 × 800 px",
    aspect: "wide",
    fallback: "",
    note: "ถ้าเว้นว่าง ใช้รูปแรกของผลงานเด่นลำดับที่ 1 (เลือกได้ที่หน้าผลงาน) และกดแล้วไปหน้าผลงานนั้น",
  },
  {
    key: "siteAboutGallery2",
    label: "แถบรูปผลงาน · ช่องที่ 2",
    page: "ส่วนพื้นเข้มใต้คำขวัญ Building for Generations",
    href: "/about#gallery",
    autoFromContent: true,
    autoLabel: "ใช้รูปผลงานเด่นลำดับที่ 2",
    recommended: "1200 × 800 px",
    aspect: "wide",
    fallback: "",
    note: "ถ้าเว้นว่าง ใช้รูปแรกของผลงานเด่นลำดับที่ 2 (เลือกได้ที่หน้าผลงาน) และกดแล้วไปหน้าผลงานนั้น",
  },
  {
    key: "siteAboutGallery3",
    label: "แถบรูปผลงาน · ช่องที่ 3",
    page: "ส่วนพื้นเข้มใต้คำขวัญ Building for Generations",
    href: "/about#gallery",
    autoFromContent: true,
    autoLabel: "ใช้รูปผลงานเด่นลำดับที่ 3",
    recommended: "1200 × 800 px",
    aspect: "wide",
    fallback: "",
    note: "ถ้าเว้นว่าง ใช้รูปแรกของผลงานเด่นลำดับที่ 3 (เลือกได้ที่หน้าผลงาน) และกดแล้วไปหน้าผลงานนั้น",
  },
  {
    key: "siteAboutGallery4",
    label: "แถบรูปผลงาน · ช่องที่ 4 (ขวาสุด)",
    page: "ส่วนพื้นเข้มใต้คำขวัญ Building for Generations",
    href: "/about#gallery",
    autoFromContent: true,
    autoLabel: "ใช้รูปผลงานเด่นลำดับที่ 4",
    recommended: "1200 × 800 px",
    aspect: "wide",
    fallback: "",
    note: "ถ้าเว้นว่าง ใช้รูปแรกของผลงานเด่นลำดับที่ 4 (เลือกได้ที่หน้าผลงาน) และกดแล้วไปหน้าผลงานนั้น",
  },
  {
    key: "siteHomeServiceDesign",
    label: "การ์ดบริการ · งานออกแบบ",
    page: "ส่วนบริการของเรา",
    href: "/#services",
    recommended: "900 × 1200 px (แนวตั้ง)",
    aspect: "tall",
    fallback: "",
    fallbackKey: "siteServiceDesign",
    note: "มีตัวหนังสือสีขาวทับด้านล่างของรูป · ถ้าเว้นว่าง ใช้รูปของ “หน้าบริการ · งานออกแบบ”",
  },
  {
    key: "siteHomeServiceBuild",
    label: "การ์ดบริการ · งานก่อสร้าง",
    page: "ส่วนบริการของเรา",
    href: "/#services",
    recommended: "900 × 1200 px (แนวตั้ง)",
    aspect: "tall",
    fallback: "",
    fallbackKey: "siteServicePhase2",
    note: "มีตัวหนังสือสีขาวทับด้านล่างของรูป · ถ้าเว้นว่าง ใช้รูปของ “หน้าบริการ · งานก่อสร้าง ขั้นตอนที่ 2”",
  },
  {
    key: "siteHomeServiceEngineering",
    label: "การ์ดบริการ · งานระบบวิศวกรรม",
    page: "ส่วนบริการของเรา",
    href: "/#services",
    recommended: "900 × 1200 px (แนวตั้ง)",
    aspect: "tall",
    fallback: "",
    note: "มีตัวหนังสือสีขาวทับด้านล่างของรูป · ถ้าเว้นว่าง การ์ดจะเป็นพื้นสีน้ำเงินของบริษัท",
  },
  {
    key: "siteHeroServices",
    label: "ส่วนหัว · หกเหลี่ยมบนซ้าย",
    page: "ส่วนหัว (บนสุดของหน้าบริการ)",
    href: "/services",
    recommended: "1200 × 1050 px",
    aspect: "hex",
    fallback: "",
    fallbackKey: "siteServiceDesign",
    note: "ครอปเป็นหกเหลี่ยมและตัดส่วนบนของรูปออก (กันลายน้ำมุมบน) · ถ้าเว้นว่าง ใช้รูปของ “หน้าบริการ · งานออกแบบ”",
  },
  {
    key: "siteServicesHexMid",
    label: "ส่วนหัว · หกเหลี่ยมกลางขวา",
    page: "ส่วนหัว (บนสุดของหน้าบริการ)",
    href: "/services",
    recommended: "1200 × 1050 px",
    aspect: "hex",
    fallback: "",
    fallbackKey: "siteHomeServiceBuild",
    note: "ครอปเป็นหกเหลี่ยมและตัดส่วนบนของรูปออก (กันลายน้ำมุมบน) · ถ้าเว้นว่าง ใช้รูปของ “หน้าแรก · การ์ดบริการ งานก่อสร้าง”",
  },
  {
    key: "siteServicesHexLow",
    label: "ส่วนหัว · หกเหลี่ยมล่างซ้าย",
    page: "ส่วนหัว (บนสุดของหน้าบริการ)",
    href: "/services",
    recommended: "1200 × 1050 px",
    aspect: "hex",
    fallback: "",
    fallbackKey: "siteHomeServiceEngineering",
    note: "ครอปเป็นหกเหลี่ยมและตัดส่วนบนของรูปออก (กันลายน้ำมุมบน) · ถ้าเว้นว่าง ใช้รูปของ “หน้าแรก · การ์ดบริการ งานระบบวิศวกรรม”",
  },
  {
    key: "siteServicesHexTopRight",
    label: "ส่วนหัว · หกเหลี่ยมมุมบนขวา",
    page: "ส่วนหัว (บนสุดของหน้าบริการ)",
    href: "/services",
    recommended: "1200 × 1050 px",
    aspect: "hex",
    fallback: "",
    note: "ช่องนี้ล้นขอบบนของหัวหน้า เห็นราวครึ่งล่างของรูป · ถ้าเว้นว่าง เป็นช่องสีฟ้าโปร่ง",
  },
  {
    key: "siteServicesHexBottomRight",
    label: "ส่วนหัว · หกเหลี่ยมมุมล่างขวา",
    page: "ส่วนหัว (บนสุดของหน้าบริการ)",
    href: "/services",
    recommended: "1200 × 1050 px",
    aspect: "hex",
    fallback: "",
    note: "ช่องนี้ล้นขอบล่างและถูกการ์ดบริการบังบางส่วน เห็นราวครึ่งบนของรูป · ถ้าเว้นว่าง เป็นช่องโปร่ง",
  },
  {
    key: "siteServiceDesign",
    label: "งานออกแบบ · ภาพด้านซ้าย",
    page: "ส่วนงานออกแบบ",
    href: "/services#design",
    recommended: "800 × 1000 px (แนวตั้ง)",
    aspect: "portrait",
    fallback: "",
  },
  {
    key: "siteServicePhase1",
    label: "งานก่อสร้าง · ขั้นตอนที่ 1 ก่อนเริ่มก่อสร้าง",
    page: "ส่วนงานก่อสร้าง",
    href: "/services#phase-1",
    recommended: "1280 × 800 px",
    aspect: "wide",
    fallback: "",
  },
  {
    key: "siteServicePhase2",
    label: "งานก่อสร้าง · ขั้นตอนที่ 2 ระหว่างก่อสร้าง",
    page: "ส่วนงานก่อสร้าง",
    href: "/services#phase-2",
    recommended: "1280 × 800 px",
    aspect: "wide",
    fallback: "",
  },
  {
    key: "siteServicePhase3",
    label: "งานก่อสร้าง · ขั้นตอนที่ 3 หลังก่อสร้างเสร็จ",
    page: "ส่วนงานก่อสร้าง",
    href: "/services#phase-3",
    recommended: "1280 × 800 px",
    aspect: "wide",
    fallback: "",
  },
];

/** หน้าเว็บที่ช่องรูปอยู่ — เรียงตามเมนูของเว็บลูกค้า (หน้าแรก → เกี่ยวกับเรา → บริการ) */
export const SITE_IMAGE_PAGES = [
  { id: "home", name: "หน้าแรก", path: "/" },
  { id: "about", name: "หน้าเกี่ยวกับเรา", path: "/about" },
  { id: "services", name: "หน้าบริการ", path: "/services" },
] as const;

export type SiteImagePageId = (typeof SITE_IMAGE_PAGES)[number]["id"];

/** ช่องนี้อยู่หน้าไหน — ดูจาก path ของ href (ส่วนก่อน #) ไม่ต้องจดซ้ำในทุกช่อง */
export function siteImagePageOf(
  slot: SiteImageSlot,
): (typeof SITE_IMAGE_PAGES)[number] {
  const path = slot.href.split("#")[0] || "/";
  return SITE_IMAGE_PAGES.find((pg) => pg.path === path) ?? SITE_IMAGE_PAGES[0];
}

export const SITE_IMAGE_KEYS: readonly SiteImageKey[] = SITE_IMAGE_SLOTS.map(
  (s) => s.key,
);

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

/**
 * รูปที่ช่องหนึ่งใช้จริงบนเว็บ: ค่าที่ตั้งไว้ > รูปของช่อง `fallbackKey` > `fallback` ของช่อง
 * ("" = ไม่มีรูป) — หน้าคลังรูปฝั่งพนักงานต้องไล่ลำดับเดียวกันนี้ ไม่งั้นพรีวิวไม่ตรงหน้าจริง
 */
export function resolveSiteImageSlot(
  settings: Record<string, string | undefined> | null | undefined,
  key: SiteImageKey,
  depth = 0,
): string {
  const slot = SITE_IMAGE_SLOTS.find((s) => s.key === key);
  if (!slot) return "";
  const own = settings?.[key];
  if (isSafeImageUrl(own)) return (own as string).trim();
  // ยืมต่อเป็นทอด ๆ ได้ (หกเหลี่ยมกลาง → การ์ดงานก่อสร้าง → ภาพขั้นตอนที่ 2) · depth กันวนไม่รู้จบถ้าตั้งยืมกันเป็นวง
  const borrowed =
    slot.fallbackKey && depth < 5
      ? resolveSiteImageSlot(settings, slot.fallbackKey, depth + 1)
      : "";
  return borrowed || slot.fallback;
}
