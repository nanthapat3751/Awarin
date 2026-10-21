import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { resolveSiteImage, resolveSiteImageSlot, type HouseDesignDto, type SiteImageKey } from "@systemboq/shared-types";

import { CtaBanner } from "../components/CtaBanner";
import { Reveal } from "../components/Reveal";
import { ServiceTile } from "../components/ServiceTile";
import { SpecularButton } from "../components/SpecularButton";
import { setHeroLoading } from "../lib/hero-loading";
import { useParallax } from "../lib/use-parallax";
import {
  cachedPublicSettings,
  getPublicSettings,
  listFeaturedHouseDesigns,
} from "../lib/public-api";
import { HouseSpecLine } from "../components/HouseSpecChips";
import { FadeImage } from "../components/FadeImage";
import { CardGridSkeleton } from "../components/Skeleton";
import { usePageMeta } from "../lib/page-meta";

// จุดขาย 4 ข้อของส่วน "ทำไมต้องเลือกเรา" (ชุดใหม่ 14 ต.ค. 2026 — ชุดเดิมซ้ำกับ "ขั้นตอนการสร้างบ้าน" 3 ใน 4 ข้อ
// ห้ามเขียนเป็นขั้นตอนอีก: ส่วนนี้ = สิ่งที่ลูกค้าได้ · ขั้นตอน = ทำอะไรก่อนหลัง · ทุกข้อต้องเป็นสิ่งที่ระบบ/บริษัททำจริง) — หัวข้อสั้น + คำขยายหนึ่งบรรทัด เดิมเป็นบรรทัดเดียวนำด้วยเครื่องหมายถูก
// ซึ่งไม่ได้บอกอะไร (เครื่องหมายถูกมีความหมายเมื่อคู่กับกากบาทในตารางเทียบแพ็กเกจเท่านั้น
// ที่นี่ทุกข้อเป็นถูกหมด) และเป็นจุดเดียวในเว็บทั้งฝั่งลูกค้าที่ใช้สัญลักษณ์นี้
const HIGHLIGHTS = [
  {
    title: "ราคาแยกทุกรายการ ไม่ใช่ราคาเหมา",
    desc: "เปิดดูทุกบรรทัดของใบเสนอราคาได้เองในพื้นที่ลูกค้า ก่อนตัดสินใจ",
  },
  {
    title: "ทีมวิศวกรดูแลงานเอง",
    desc: "บริษัทก่อตั้งโดยทีมวิศวกร ดูแลทั้งงานออกแบบและงานก่อสร้าง",
  },
  {
    title: "งานเพิ่ม-ลดต้องผ่านคุณก่อน",
    desc: "ทุกการเปลี่ยนแปลงคิดราคาจาก BOQ เดิม และต้องอนุมัติก่อนเริ่มทำ",
  },
  {
    title: "จ่ายตามงวดงาน ติดตามได้ออนไลน์",
    desc: "เรียกเก็บเมื่องานถึงงวด ดูงวดเงิน ใบเสร็จ และแจ้งโอนได้จากหน้าเว็บ",
  },
];

const iconProps = {
  className: "w-7 h-7",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
};

function ConsultIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function EstimateIcon() {
  return (
    <svg {...iconProps}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </svg>
  );
}
function ContractIcon() {
  return (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  );
}
function DeliverIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function DesignServiceIcon() {
  return (
    <svg {...iconProps}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function BuildServiceIcon() {
  return (
    <svg {...iconProps}>
      <path d="M3 21h18" />
      <path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" />
      <path d="M15 21V9h3a1 1 0 0 1 1 1v11" />
      <path d="M8 8h1M8 12h1M11 8h1M11 12h1" />
    </svg>
  );
}
// รูปสายฟ้าชุดเดียวกับ ElectricIcon ในหน้าบริการ — การ์ดใบนี้พาไปที่ส่วนงานระบบของหน้านั้น
// (ไอคอนบริการ 3 ตัวนี้ขึ้นเฉพาะการ์ดที่ยังไม่มีรูป เป็นลายจางบนพื้นน้ำเงิน)
function EngineeringServiceIcon() {
  return (
    <svg {...iconProps}>
      <polygon points="13 2 4 14 11 14 11 22 20 10 13 10 13 2" />
    </svg>
  );
}

/* การ์ดสามใบนี้คือตัวอย่างย่อของหน้า /services — **ชื่อบริการต้องตรงกับหัวข้อในหน้านั้นเสมอ**
   (งานออกแบบ · งานก่อสร้าง · งานระบบวิศวกรรม) ถ้าหน้าบริการเพิ่ม/เปลี่ยนหัวข้อ ต้องตามมาแก้ที่นี่
   แต่ละใบพาไปที่หัวข้อของตัวเองโดยตรงด้วย hash (ScrollOnNavigate ใน App.tsx เลื่อนให้เอง)

   "ประเมินราคาโปร่งใส" ไม่ได้เป็นการ์ด เพราะเป็นวิธีทำงานที่ครอบทุกบริการ ไม่ใช่บริการข้อที่สี่
   — ย้ายไปอยู่ในคำโปรยใต้หัวข้อส่วนแทน
   รูปของแต่ละใบตั้งได้จากหน้า "คลังรูปเว็บไซต์" (imageKey) ว่างไว้ = ยืมรูปจากหน้าบริการ ดู SITE_IMAGE_SLOTS */
const SERVICES: {
  title: string;
  desc: string;
  to: string;
  imageKey: SiteImageKey;
  Icon: () => React.JSX.Element;
}[] = [
  {
    title: "งานออกแบบ",
    desc: "เริ่มจากความต้องการของคุณ แปลงเป็นแบบที่ก่อสร้างได้จริง พร้อมแบบมาตรฐานให้เลือก",
    to: "/services#design",
    imageKey: "siteHomeServiceDesign",
    Icon: DesignServiceIcon,
  },
  {
    title: "งานก่อสร้าง",
    desc: "ควบคุมงานตามแบบและมาตรฐาน แบ่งเป็น 3 ขั้นตอน ตรวจสอบได้ทุกช่วง",
    to: "/services#construction",
    imageKey: "siteHomeServiceBuild",
    Icon: BuildServiceIcon,
  },
  {
    title: "งานระบบวิศวกรรม",
    desc: "ระบบไฟฟ้า ประปา-สุขาภิบาล ปรับอากาศ และห้องปลอดเชื้อ รองรับทั้งบ้านและงานอาคาร",
    to: "/services#engineering",
    imageKey: "siteHomeServiceEngineering",
    Icon: EngineeringServiceIcon,
  },
];

const STEPS = [
  {
    title: "ปรึกษาและเลือกแบบ",
    desc: "เลือกแบบบ้านที่ถูกใจ หรือแจ้งความต้องการออกแบบเฉพาะ",
    Icon: ConsultIcon,
  },
  {
    title: "ประเมินราคาและเสนอราคา",
    desc: "ทีมงานจัดทำ BOQ และใบเสนอราคาให้พิจารณา",
    Icon: EstimateIcon,
  },
  { title: "ทำสัญญา", desc: "ยืนยันราคาและลงนามสัญญาก่อนเริ่มงาน", Icon: ContractIcon },
  {
    title: "ก่อสร้างและส่งมอบ",
    desc: "ทีมงานดำเนินการก่อสร้างและส่งมอบบ้านให้ลูกค้า",
    Icon: DeliverIcon,
  },
];

/** รูป hero สำรอง (ยังไม่ได้ตั้งจากคลังรูป) — WebP ย่อจาก web12.jpg 670 KB เหลือราว 240 KB */
const HERO_FALLBACK = "/web12.webp";
/** รูปช้ากว่านี้ ข้อความ hero ขึ้นก่อนเลย ไม่ให้คนนั่งดูพื้นว่าง */
const HERO_TEXT_MAX_WAIT_MS = 800;
/** รูปมาเร็วกว่านี้ (อยู่ในแคช) = โผล่ทันที ไม่ต้องจางเข้า */
const HERO_INSTANT_MS = 150;

/** รูป hero: null = ยังไม่รู้ค่าตั้ง (รอก่อน ไม่โหลดรูปสำรองไปพลาง) · รูปที่ตั้งไว้เปิดไม่ได้ = รูปสำรอง */
function heroImageOf(siteImages: Record<string, string> | null, failed: boolean) {
  if (siteImages === null) return null;
  return failed ? HERO_FALLBACK : resolveSiteImage(siteImages.siteHeroHome, HERO_FALLBACK);
}

/**
 * คอลัมน์ตามจำนวนแบบ (ตั้งแนะนำได้ 1–6) ให้ไม่มีช่องโหว่ท้ายแถว: 1 = ใบเดียวไม่ยืดสุดจอ ·
 * 2/4 = สองคอลัมน์ · 3/5/6 = สามคอลัมน์จอใหญ่ (5 เหลือหนึ่งช่องก็ยังน้อยกว่าแบบอื่น)
 */
function featuredGridColsOf(count: number) {
  if (count === 1) return "max-w-2xl";
  if (count === 2 || count === 4) return "sm:grid-cols-2";
  return "sm:grid-cols-2 lg:grid-cols-3";
}

/** ก้อนแสงวิ่งระหว่างรอรูป hero — วางตรงตำแหน่งเนื้อหาจริง (ชื่อบริษัท · หัวข้อ · คำอธิบาย · ปุ่ม · กล่องมุมขวาล่าง) */
function HeroSkeleton() {
  return (
    <div aria-hidden className="skeleton-group absolute inset-0 flex items-center">
      <div className="w-full max-w-5xl mx-auto px-4 py-24 flex flex-col items-start gap-5">
        <div className="skeleton h-4 w-44" />
        <div className="flex w-full flex-col gap-3">
          <div className="skeleton h-8 sm:h-12 w-[min(40rem,90%)]" />
          <div className="skeleton h-8 sm:h-12 w-[min(20rem,60%)]" />
        </div>
        <div className="flex w-full flex-col gap-2">
          <div className="skeleton h-4 w-[min(36rem,95%)]" />
          {/* จอกว้างคำอธิบายจริงอยู่บรรทัดเดียว */}
          <div className="skeleton h-4 w-[min(26rem,70%)] sm:hidden" />
        </div>
        <div className="skeleton mt-2 h-11 w-32 rounded-lg" />
      </div>
      <div className="skeleton absolute bottom-0 right-0 h-40 sm:h-56 w-[82%] sm:w-136 rounded-none" />
    </div>
  );
}

export function HomePage() {
  usePageMeta(null);
  // ค่าตั้งจากการเปิดเว็บครั้งก่อน — รู้ทันทีว่า hero ใช้รูปไหน ไม่ต้องรอเครือข่าย
  const [cached] = useState(cachedPublicSettings);
  const [companyName, setCompanyName] = useState(cached?.companyName || "บริษัทรับออกแบบและสร้างบ้าน");
  // รูปที่พนักงานตั้งไว้จากหน้า "คลังรูปเว็บไซต์" · null = ยังไม่รู้ค่าตั้ง (ครั้งแรกที่เปิดเว็บ)
  // ต้องรอรู้ก่อนค่อยเลือกรูป hero ไม่งั้นโหลดรูปสำรองไปก่อนแล้วสลับเป็นรูปที่ตั้งไว้ = โหลดสองรอบ + ภาพกระพริบ
  const [siteImages, setSiteImages] = useState<Record<string, string> | null>(cached);
  // แบบบ้านแนะนำที่ staff เลือก (โชว์เท่าที่เลือก)
  const [featured, setFeatured] = useState<HouseDesignDto[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  useEffect(() => {
    getPublicSettings()
      .then((res) => {
        if (res.settings.companyName) setCompanyName(res.settings.companyName);
        setSiteImages(res.settings);
      })
      // ขอไม่สำเร็จ = ใช้ของเดิมในเครื่อง หรือรูปสำรอง (อย่าค้างแสงวิ่งไว้ตลอดไป)
      .catch(() => setSiteImages((prev) => prev ?? {}));
    listFeaturedHouseDesigns()
      .then((res) => setFeatured(res.houseDesigns))
      .catch(() => undefined)
      .finally(() => setFeaturedLoading(false));
  }, []);
  // parallax เบา ๆ ที่รูป hero (section มี overflow-hidden อยู่แล้ว รูปถูก scale เผื่อขอบในฮุก)
  const heroImgRef = useParallax<HTMLImageElement>();
  const [heroFailed, setHeroFailed] = useState(false);
  const heroImage = heroImageOf(siteImages, heroFailed);

  // ลำดับการโหลด hero ให้เหมือนส่วนอื่นของเว็บ: แสงวิ่ง (โทนเข้ม) ระหว่างรอ → รูปจางเข้า → ข้อความลอยขึ้น
  const mountedAt = useRef(performance.now());
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [heroInstant, setHeroInstant] = useState(false);
  const [heroTextReady, setHeroTextReady] = useState(false);
  function markHeroLoaded() {
    setHeroInstant(performance.now() - mountedAt.current < HERO_INSTANT_MS);
    setHeroLoaded(true);
    setHeroTextReady(true);
  }
  useEffect(() => {
    const timer = setTimeout(() => setHeroTextReady(true), HERO_TEXT_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  // ระหว่างรอรูป hero เป็นพื้นขาว (แสงวิ่งสีอ่อนเหมือนส่วนอื่นของเว็บ) แล้วค่อยเปลี่ยนเป็นพื้นมืดตอนรูปขึ้น
  // บอกแถบเมนูด้วย ให้เป็นแถบขาวทึบระหว่างนี้ · ออกจากหน้านี้ = ล้างค่า ไม่ให้ค้างไปหน้าอื่น
  const heroLight = !heroLoaded;
  useEffect(() => {
    if (!heroLight) {
      setHeroLoading(false);
      return;
    }
    // หน่วงเท่าแสงวิ่ง (0.15 วิ) — รูปในแคชขึ้นก่อนนั้น แถบเมนูจะไม่กะพริบขาวแว้บเดียว
    const t = setTimeout(() => setHeroLoading(true), 150);
    return () => clearTimeout(t);
  }, [heroLight]);
  useEffect(() => () => setHeroLoading(false), []);
  // รูปในแคชอาจโหลดเสร็จก่อน React ผูก onLoad — เช็คเองอีกรอบทุกครั้งที่เปลี่ยนรูป
  useEffect(() => {
    const img = heroImgRef.current;
    if (heroImage && img?.complete && img.naturalWidth > 0) markHeroLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- markHeroLoaded เปลี่ยนทุกเรนเดอร์ แต่ทำงานเหมือนเดิม
  }, [heroImage, heroImgRef]);

  // คอลัมน์ตามจำนวนแบบ (ตั้งแนะนำได้ 1–6) ให้ไม่มีช่องโหว่ท้ายแถว: 1 = ใบเดียวไม่ยืดสุดจอ ·
  // 2/4 = สองคอลัมน์ · 3/5/6 = สามคอลัมน์จอใหญ่ (5 เหลือหนึ่งช่องก็ยังน้อยกว่าแบบอื่น)
  const featuredGridCols = featuredGridColsOf(featured.length);

  return (
    <div>
      {/* Hero */}
      <section
        // เปลี่ยนเฉพาะสีพื้นแบบค่อย ๆ — สีตัวอักษรสลับทันที ไม่งั้นข้อความที่ลอยขึ้นตอนรูปขึ้นจะเป็นสีเข้มแล้วค่อยจางเป็นขาว
        className={`relative min-h-screen overflow-hidden flex items-center transition-[background-color] duration-700 motion-reduce:transition-none ${
          heroLight ? "bg-white text-slate-900" : "bg-black text-white"
        } ${heroTextReady ? "" : "hero-pending"}`}
      >
        {/* ระหว่างรอรูป: พื้นขาว + ก้อนเทาแสงวิ่งวางตรงตำแหน่งเนื้อหาจริง แบบเดียวกับส่วนอื่นของเว็บ
            (ชื่อบริษัท · หัวข้อ 2 บรรทัด · คำอธิบาย · ปุ่ม · กล่องเริ่มต้นโครงการมุมขวาล่าง) โผล่หลัง 0.15 วิ
            รูปในแคชจะไม่เห็นเลย · เดิมเป็นก้อนเดียวโทนเข้มเต็มจอ ผู้ใช้ขอให้เหมือนหน้าอื่น
            ก้อนข้อความหายเมื่อข้อความจริงพร้อม (รูปช้าเกิน HERO_TEXT_MAX_WAIT_MS ข้อความจะขึ้นเป็นสีเข้มบนพื้นขาว
            แทนที่ก้อน ไม่ซ้อนกัน) ส่วนก้อนกล่องมุมขวาล่างหายพร้อมกันเพราะกล่องจริงก็ขึ้นพร้อมข้อความ */}
        {heroLight && !heroTextReady && <HeroSkeleton />}
        <img
          ref={heroImgRef}
          src={heroImage ?? undefined}
          alt=""
          aria-hidden
          fetchPriority="high"
          onLoad={markHeroLoaded}
          onError={() => {
            // รูปที่ตั้งไว้เปิดไม่ได้ (ไฟล์หาย) → ตกไปรูปสำรอง · รูปสำรองเองก็พัง = เลิกรอ เหลือพื้นดำ
            if (heroImage !== HERO_FALLBACK) setHeroFailed(true);
            else markHeroLoaded();
          }}
          className={`absolute inset-0 w-full h-full object-cover ${
            heroInstant ? "" : "transition-opacity duration-700 ease-out motion-reduce:transition-none"
          } ${heroLoaded ? "opacity-100" : "opacity-0"}`}
        />
        <div
          className={`absolute inset-0 bg-black/25 ${
            heroInstant ? "" : "transition-opacity duration-700 motion-reduce:transition-none"
          } ${heroLight ? "opacity-0" : "opacity-100"}`}
        />
        <div
          className={`relative w-full max-w-5xl mx-auto px-4 py-24 flex flex-col items-start gap-5 ${
            heroLight ? "" : "[text-shadow:0_2px_10px_rgba(0,0,0,0.6)]"
          }`}
        >
          <p
            className={`hero-item text-sm tracking-wide uppercase ${heroLight ? "text-slate-500" : "text-slate-300"}`}
            style={{ animationDelay: "0.05s" }}
          >
            {/* ยังไม่รู้ค่าตั้ง (เปิดเว็บครั้งแรก + API ช้ากว่าข้อความ hero) = แสงวิ่ง ไม่ใช่ชื่อสำรอง
                "บริษัทรับออกแบบและสร้างบ้าน" ที่จะสลับเป็นชื่อจริงทีหลัง · ชื่อสำรองเหลือไว้ตอนโหลดไม่สำเร็จ */}
            {siteImages === null ? (
              <span className={`skeleton block h-4 w-44 ${heroLight ? "" : "on-dark"}`}>
                <span className="sr-only">กำลังโหลด</span>
              </span>
            ) : (
              companyName
            )}
          </p>
          <h1
            className="hero-item text-3xl sm:text-5xl font-semibold leading-tight max-w-2xl"
            style={{ animationDelay: "0.18s" }}
          >
            บริการออกแบบและรับเหมาก่อสร้างบ้าน
          </h1>
          <p className={`hero-item max-w-xl ${heroLight ? "text-slate-600" : "text-slate-200"}`} style={{ animationDelay: "0.34s" }}>
            เริ่มต้นโครงการบ้านของคุณไปด้วยกัน พร้อมประเมินราคาต้นทุนอย่างโปร่งใสทุกรายการ
          </p>
          <div className="hero-item flex flex-wrap gap-3 mt-2" style={{ animationDelay: "0.48s" }}>
            <SpecularButton href="#why-us">ดูเพิ่มเติม</SpecularButton>
          </div>
        </div>

        {/* CTA card — กล่องทึบดำชิดมุมขวาล่าง (ตามแบบอ้างอิง) คลิกทั้งกล่องเพื่อไปหน้าติดต่อ */}
        <Link
          to="/contact"
          style={{ animationDelay: "0.62s" }}
          className="hero-item group absolute bottom-0 right-0 z-10 bg-neutral-900/90 backdrop-blur-sm px-8 py-8 sm:px-14 sm:py-11 max-w-[82%] sm:w-136 hover:bg-neutral-900 transition-colors"
        >
          <p className="text-2xl sm:text-4xl font-medium leading-tight text-white">เริ่มต้นโครงการ</p>
          <p className="text-2xl sm:text-4xl font-medium leading-tight text-white flex items-center gap-4">
            <span>ไปด้วยกัน</span>
            <span className="hidden sm:block h-px flex-1 bg-white/70" />
          </p>
          <span className="mt-5 sm:mt-6 inline-block text-sm font-medium text-white/85 border-b border-transparent pb-0.5 transition-colors group-hover:border-white/60 group-hover:text-white">
            ติดต่อเรา
          </span>
        </Link>

        {/* ลูกศรเปล่า ๆ ไม่มีกรอบ — ความชัดมาจากเงาที่ตัวเส้นเอง (drop-shadow เกาะรูปทรง
            ไม่ใช่กล่อง) จึงอ่านออกทั้งบนใบไม้สว่างและบนพื้นมืด โดยไม่ต้องมีอะไรมาครอบ
            เดิมเป็น text-white/70 ไม่มีเงา วัดคอนทราสต์ได้ 4.37:1 จมหายไปกับสวนในรูป
            (รูป hero พนักงานเปลี่ยนเองได้จากหน้าคลังรูป จึงห้ามฝากความชัดไว้กับว่ารูปมืดพอไหม)
            ตำแหน่ง: กล่อง "เริ่มต้นโครงการ" กว้าง 82% (มือถือ) / 544px (sm+) ชิดขวา — จอแคบกว่า ~1090px มันทับกลางจอ
            ลูกศรกลางจอจึงถูกบังและกดแล้วไปหน้าติดต่อแทน · ต่ำกว่า xl ย้ายไปชิดซ้ายแนวเดียวกับตัวหนังสือ hero */}
        <a
          href="#why-us"
          aria-label="เลื่อนลงดูเพิ่มเติม"
          className={`absolute bottom-4 left-2 z-20 flex h-11 w-11 items-center justify-center xl:left-1/2 xl:-translate-x-1/2 transition-opacity hover:opacity-80 animate-bounce ${
            heroLight ? "text-slate-400" : "text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-7 h-7"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </a>
      </section>

      {/* ทำไมต้องเลือกเรา (ผู้ใช้เลือกแบบ A 14 ต.ค. 2026) — เดิมเป็น "เกี่ยวกับเรา" ย่อ + รูปซ้าย ซ้ำกับหน้า /about ที่มีในเมนูแล้ว
          เหลือเฉพาะจุดขาย 4 ข้อ ไม่มีรูป ไม่มีไอคอน ไม่มีตัวเลขสถิติ (ดู HIGHLIGHTS) · id "why-us" = ปลายทางปุ่ม "ดูเพิ่มเติม" ใน hero */}
      <section id="why-us" className="scroll-mt-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 py-20">
          <Reveal className="grid gap-4 lg:grid-cols-12 lg:items-end lg:gap-12">
            <div className="lg:col-span-5">
              <p className="mb-2 text-sm font-semibold text-brand">ทำไมต้องเลือกเรา</p>
              <h2 className="text-2xl sm:text-3xl font-semibold leading-snug text-black">
                เห็นราคาจริงทุกรายการ
                {/* ขึ้นบรรทัดใหม่ทุกจอ — ปล่อยตัดเองบนมือถือจะได้ "…รายการ ก่อน / ตัดสินใจสร้าง" */}
                <span className="block">ก่อนตัดสินใจสร้าง</span>
              </h2>
            </div>
            <p className="leading-relaxed text-slate-600 lg:col-span-7">
              ทุกโครงการเริ่มจากใบประเมินราคาที่แยกค่าวัสดุและค่าแรงเป็นรายการ คุณจึงรู้ว่าเงินแต่ละบาทไปอยู่ตรงไหน
              ตั้งแต่ก่อนเริ่มงาน แล้วติดตามต่อได้จนส่งมอบ
            </p>
          </Reveal>
          {/* แต่ละข้อมีเส้นบนของตัวเอง — จอแคบเรียงลงเป็นแถว จอกว้างเป็น 4 คอลัมน์ ไม่ต้องคุมเส้นคั่นแนวตั้งตามจำนวนคอลัมน์ */}
          <div className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {HIGHLIGHTS.map((h, i) => (
              <Reveal key={h.title} delay={i * 90} className="border-t border-slate-200 pt-5">
                <p className="text-sm tabular-nums text-slate-400">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 font-medium text-slate-900">{h.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{h.desc}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Services — รูปเต็มใบ ตัวหนังสือทับ (ผู้ใช้เลือกแบบ B จาก 5 แบบ 11 ต.ค. 2026 ไม่เอาปุ่ม "ดูบริการทั้งหมด")
          พื้นแถบชุดเดียวกับส่วนท้ายหน้าแบบบ้าน/ผลงาน (bg-slate-50 + border-y slate-100) ห้ามคิดค่าใหม่
          ความกว้าง max-w-7xl เท่าส่วนแบบบ้านแนะนำด้านล่าง ขอบซ้ายหัวข้อจะตรงแนวกัน */}
      <section id="services" className="scroll-mt-20 bg-slate-50 border-y border-slate-100">
        <div className="max-w-7xl mx-auto px-4 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-semibold text-black mb-2">บริการของเรา</h2>
            <p className="text-slate-500 mb-10">
              ออกแบบ ก่อสร้าง และงานระบบวิศวกรรม พร้อมประเมินราคาอย่างโปร่งใสทุกโครงการ
            </p>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SERVICES.map((s, i) => (
              <Reveal key={s.title} delay={i * 90}>
                <ServiceTile
                  title={s.title}
                  desc={s.desc}
                  to={s.to}
                  Icon={s.Icon}
                  image={siteImages === null ? null : resolveSiteImageSlot(siteImages, s.imageKey)}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* แบบบ้านแนะนำ (ผู้ใช้เลือกแบบ A 14 ต.ค. 2026) — หัวข้อชิดซ้าย + "ดูแบบบ้านทั้งหมด →" ที่หัว แทนการ์ดเส้นประ
          ที่ดูเหมือนช่องว่าง · การ์ดรูปใหญ่ + สเปก (ตร.ม./ชั้น/ห้องนอน/ห้องน้ำ) ให้เทียบแบบได้โดยไม่ต้องกดเข้าไป
          ระหว่างโหลดโชว์หัวข้อจริง + การ์ดโครงร่าง (ไม่งั้นการ์ดโผล่ทีหลังดันเนื้อหาข้างล่างกระโดด)
          โหลดแล้วไม่มีแบบแนะนำ = ซ่อนทั้งส่วน */}
      {(featuredLoading || featured.length > 0) && (
        <section className="bg-white">
          <div className="max-w-7xl mx-auto px-4 py-20">
            <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-black mb-2">แบบบ้านแนะนำ</h2>
                <p className="text-slate-500">เลือกแบบที่ใช่สำหรับคุณ หรือดูแบบทั้งหมดของเรา</p>
              </div>
              <Link
                to="/house-designs"
                className="group inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand"
              >
                <span>ดูแบบบ้านทั้งหมด</span>
                <span aria-hidden className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none">
                  →
                </span>
              </Link>
            </Reveal>
            {featuredLoading && (
              <CardGridSkeleton
                count={2}
                gridClass="grid-cols-1 sm:grid-cols-2"
                imageClass="aspect-[16/10]"
                lines={2}
                label="กำลังโหลดแบบบ้านแนะนำ..."
              />
            )}
            <div className={`grid grid-cols-1 gap-6 ${featuredGridCols}`}>
              {featured.map((d, i) => (
                <Reveal key={d.id} delay={i * 90} className="h-full">
                  <Link
                    to={`/house-designs/${d.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    {d.exteriorImages?.[0] ? (
                      // แสงวิ่งรองใต้รูประหว่างรอ แล้วจางเข้า — เดิมรูปโผล่พรวดหลังการ์ดขึ้นแล้ว
                      <FadeImage
                        src={d.exteriorImages[0]}
                        alt={d.name}
                        lazy
                        className="aspect-[16/10]"
                        imgClassName="group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex aspect-[16/10] items-center justify-center bg-slate-100 text-sm text-slate-300">
                        ไม่มีรูปภาพ
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="text-lg font-semibold text-black">{d.name}</h3>
                      <HouseSpecLine d={d} />
                      {/* ขึ้นตลอด (ไม่ใช่เฉพาะตอนชี้) — จอสัมผัสไม่มีสถานะชี้ ต้องเห็นว่ากดได้ */}
                      <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-brand">
                        <span>ดูรายละเอียด</span>
                        <span aria-hidden className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none">
                          →
                        </span>
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Process */}
      <section className="bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-semibold text-black text-center mb-2">
              ขั้นตอนการสร้างบ้าน
            </h2>
            <p className="text-slate-500 text-center mb-12">
              ตั้งแต่ปรึกษาจนส่งมอบบ้าน เราดูแลให้คุณครบทุกขั้นตอน
            </p>
          </Reveal>
          <div className="relative">
            {/* connector line behind the circles (desktop) */}
            <div
              aria-hidden
              className="hidden sm:block absolute top-8 left-[12.5%] right-[12.5%] h-0.5 bg-slate-200"
            />
            <div className="relative grid grid-cols-1 sm:grid-cols-4 gap-10 sm:gap-6">
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 110} className="flex flex-col items-center text-center">
                  <div className="relative mb-4">
                    <div className="w-16 h-16 rounded-full bg-brand text-white flex items-center justify-center shadow-sm">
                      <step.Icon />
                    </div>
                    <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white text-brand border-2 border-brand text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="font-semibold text-black">{step.title}</h3>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-60">
                    {step.desc}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA — แถบเต็มความกว้าง + เส้นทองคั่นก่อนถึง footer (component ใช้ซ้ำ) */}
      <CtaBanner />
    </div>
  );
}
