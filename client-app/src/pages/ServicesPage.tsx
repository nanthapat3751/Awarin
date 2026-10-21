import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { resolveSiteImage, resolveSiteImageSlot, type PortfolioDto, type SiteImageKey } from "@systemboq/shared-types";

import { CtaBanner } from "../components/CtaBanner";
import { Reveal } from "../components/Reveal";
import { FadeImage } from "../components/FadeImage";
import { PortfolioCarousel } from "../components/PortfolioCarousel";
import { Skeleton, SkeletonGroup } from "../components/Skeleton";
import { cachedPublicSettings, getPublicSettings, listFeaturedPortfolio } from "../lib/public-api";
import { usePageMeta } from "../lib/page-meta";

/* ------------------------------------------------------------------ *
 * ไอคอน (inline SVG สไตล์เดียวกับหน้าแรก — ไม่มี lucide ใน client-app)
 * ------------------------------------------------------------------ */
const iconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  xmlns: "http://www.w3.org/2000/svg",
};

function CleanRoomIcon() {
  return (
    <svg {...iconProps} className="w-7 h-7">
      <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
function PlumbingIcon() {
  return (
    <svg {...iconProps} className="w-7 h-7">
      <path d="M12 2s6 5.5 6 10a6 6 0 0 1-12 0c0-4.5 6-10 6-10z" />
    </svg>
  );
}
function ElectricIcon() {
  return (
    <svg {...iconProps} className="w-7 h-7">
      <polygon points="13 2 4 14 11 14 11 22 20 10 13 10 13 2" />
    </svg>
  );
}
function HvacIcon() {
  return (
    <svg {...iconProps} className="w-7 h-7">
      <path d="M12 4a4 4 0 0 1 4 4c0 2-2 3-4 4M12 20a4 4 0 0 1-4-4c0-2 2-3 4-4M4 12a4 4 0 0 1 4-4c2 0 3 2 4 4M20 12a4 4 0 0 1-4 4c-2 0-3-2-4-4" />
      <circle cx="12" cy="12" r="1.4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * เนื้อหา (ร่างไว้ให้ — ปรับแก้ข้อความ/รูปภายหลังได้)
 * ------------------------------------------------------------------ */
const DESIGN_STEPS = [
  { title: "รับฟังความต้องการและงบประมาณ", desc: "พูดคุยเป้าหมายการใช้งาน ไลฟ์สไตล์ และกรอบงบประมาณของคุณ" },
  { title: "สำรวจพื้นที่และข้อมูลที่ดิน", desc: "ลงพื้นที่จริง เก็บข้อมูลขนาด ทิศทางแดด-ลม และข้อกำหนดของพื้นที่" },
  { title: "ออกแบบผังพื้นและฟังก์ชัน", desc: "จัดวางผังการใช้งาน (Floor Plan) ให้ตอบโจทย์และใช้พื้นที่คุ้มค่า" },
  { title: "ออกแบบรูปด้านและภาพ 3 มิติ", desc: "นำเสนอทัศนียภาพ 3D ให้เห็นภาพบ้านจริงก่อนตัดสินใจ" },
  { title: "เลือกวัสดุและรายละเอียดสถาปัตย์", desc: "กำหนดวัสดุ สี และรายละเอียดงานสถาปัตยกรรมร่วมกัน" },
  { title: "ออกแบบโครงสร้างและงานระบบ", desc: "วิศวกรออกแบบโครงสร้างและงานระบบให้ปลอดภัยได้มาตรฐาน" },
  { title: "จัดทำแบบก่อสร้างและรายการประกอบแบบ", desc: "เขียนแบบก่อสร้าง (Construction Drawing) พร้อมรายการประกอบแบบครบถ้วน" },
  { title: "ประเมินราคาและจัดทำ BOQ", desc: "สรุปปริมาณงานและราคาเป็น BOQ ให้เห็นต้นทุนทุกรายการ" },
];

const CONSTRUCTION_PHASES = [
  {
    tag: "ขั้นตอนที่ 1",
    title: "ก่อนเริ่มก่อสร้าง",
    desc: "เตรียมความพร้อมทุกด้านก่อนลงมือ เพื่อให้งานเดินหน้าได้ราบรื่นตามแผน",
    steps: [
      "ยื่นขออนุญาตก่อสร้างและจัดเตรียมเอกสาร",
      "เตรียมพื้นที่ ปรับระดับ และล้อมรั้วชั่วคราว",
      "วางแผนงานและกำหนดการ (Timeline) ร่วมกัน",
      "จัดเตรียมวัสดุ ทีมช่าง และเครื่องมือ",
    ],
  },
  {
    tag: "ขั้นตอนที่ 2",
    title: "ระหว่างก่อสร้าง",
    desc: "ลงมือก่อสร้างตามแบบ ควบคุมคุณภาพและรายงานความคืบหน้าอย่างต่อเนื่อง",
    steps: [
      "งานฐานราก เสาเข็ม และโครงสร้าง",
      "งานสถาปัตย์ ผนัง หลังคา และงานตกแต่ง",
      "งานระบบไฟฟ้า ประปา และสุขาภิบาล",
      "ควบคุมคุณภาพ ความปลอดภัย และรายงานความคืบหน้า",
    ],
  },
  {
    tag: "ขั้นตอนที่ 3",
    title: "หลังก่อสร้างเสร็จ",
    desc: "ตรวจรับ เก็บงาน และส่งมอบบ้านพร้อมการรับประกันที่ให้ความมั่นใจ",
    steps: [
      "ตรวจสอบและเก็บงานส่วนที่ต้องแก้ไข (Defect)",
      "ทำความสะอาดและเตรียมส่งมอบ",
      "ส่งมอบบ้านพร้อมเอกสารและคู่มือการดูแล",
      "รับประกันผลงานตามเงื่อนไข",
    ],
  },
];

const ENGINEERING = [
  {
    Icon: CleanRoomIcon,
    title: "งานห้องปลอดเชื้อ (Clean Room)",
    desc: "ออกแบบและติดตั้งห้องควบคุมความสะอาดตามมาตรฐาน สำหรับงานอุตสาหกรรมและการแพทย์",
  },
  {
    Icon: PlumbingIcon,
    title: "งานประปาและสุขาภิบาล",
    desc: "ระบบน้ำดี น้ำเสีย และสุขาภิบาลที่วางผังอย่างเป็นระบบ ใช้งานได้จริงและดูแลง่าย",
  },
  {
    Icon: ElectricIcon,
    title: "งานระบบไฟฟ้า",
    desc: "ออกแบบและติดตั้งระบบไฟฟ้ากำลังและแสงสว่างที่ปลอดภัย ได้มาตรฐานการไฟฟ้า",
  },
  {
    Icon: HvacIcon,
    title: "งานปรับอากาศและระบายอากาศ",
    desc: "ระบบปรับอากาศและระบายอากาศที่เหมาะกับการใช้งาน ประหยัดพลังงานและอยู่สบาย",
  },
];

/* ------------------------------------------------------------------ *
 * บล็อกย่อยที่ใช้ซ้ำ
 * ------------------------------------------------------------------ */
function SectionHeading({
  eyebrow,
  title,
  desc,
}: Readonly<{
  eyebrow: string;
  title: string;
  desc: string;
}>) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold text-brand uppercase tracking-wide mb-2">{eyebrow}</p>
      <h2 className="text-2xl sm:text-3xl font-semibold text-black leading-snug mb-3">{title}</h2>
      <p className="text-slate-600 leading-relaxed">{desc}</p>
    </div>
  );
}

/**
 * ช่องรูปในหน้าบริการ — แสดงรูปที่พนักงานตั้งไว้จากหน้า "คลังรูปเว็บไซต์"
 * `pending` (ยังไม่รู้ค่าตั้ง) = แสงวิ่ง · รูปกำลังโหลด = แสงวิ่งแล้วจางเข้า (FadeImage)
 * รู้แล้วว่ายังไม่ได้ตั้ง = กรอบเปล่าพร้อมป้ายชื่อเหมือนเดิม — เดิมป้ายนี้ขึ้นระหว่างรอค่าตั้งด้วย
 * คนเห็น "ภาพงานออกแบบ" แว้บหนึ่งเหมือนเว็บยังไม่มีรูป แล้วค่อยสลับเป็นรูปจริง
 */
function SiteImage({
  src,
  label,
  pending,
  className = "",
}: Readonly<{
  src: string;
  label: string;
  pending: boolean;
  className?: string;
}>) {
  if (!pending && !src) {
    return (
      <div
        className={`rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 text-sm select-none ${className}`}
      >
        {label}
      </div>
    );
  }
  return <FadeImage src={src} alt={label} pending={pending} className={`rounded-2xl ${className}`} />;
}

/* การ์ดสามบริการที่ลอยซ้อนขอบล่างของหัวหน้า (แบบ C — ผู้ใช้เลือก 13 ต.ค. 2026)
   รูปใช้ช่องเดียวกับการ์ดบริการหน้าแรก (ว่าง = ยืมรูปของหน้านี้ ดู SITE_IMAGE_SLOTS) จึงตรงกันทั้งเว็บ
   ไม่มีเลขลำดับ — สามบริการเป็นทางเลือกคู่ขนาน ไม่ใช่ขั้นตอน */
const HERO_SERVICES: { href: string; title: string; desc: string; imageKey: SiteImageKey }[] = [
  { href: "#design", title: "งานออกแบบ", desc: "แปลงความต้องการเป็นแบบที่ก่อสร้างได้จริง", imageKey: "siteHomeServiceDesign" },
  { href: "#construction", title: "งานก่อสร้าง", desc: "ควบคุมงาน 3 ช่วง ตรวจสอบได้ทุกขั้น", imageKey: "siteHomeServiceBuild" },
  {
    href: "#engineering",
    title: "งานระบบวิศวกรรม",
    desc: "ไฟฟ้า ประปา ปรับอากาศ และห้องปลอดเชื้อ",
    imageKey: "siteHomeServiceEngineering",
  },
];

/**
 * หกเหลี่ยมรังผึ้งทางขวาของหัวหน้า (แบบ D — ผู้ใช้เลือก 13 ต.ค. 2026 แทนรูปเต็มพื้น)
 * ตำแหน่งเป็น % ของกล่องคลัสเตอร์ (กว้าง 38% ของหัว แต่ไม่เกิน 34rem) — ช่องสีโปร่งสองช่องเป็นของตกแต่ง
 * ทุกช่องมีช่องรูปของตัวเองในหน้า "คลังรูปเว็บไซต์" (ผู้ใช้สั่ง — เดิมสองช่องกลาง/ล่างยืมรูปการ์ดหน้าแรก
 * และสองช่องมุมขวาเป็นของตกแต่งอัปไม่ได้) · ว่าง = ช่องบน/กลาง/ล่างยืมรูปตาม fallbackKey · ช่องมุมขวาเป็นสีโปร่ง
 */
const HERO_HEXES: { key: SiteImageKey; left: string; top: string; tint?: string }[] = [
  { key: "siteHeroServices", left: "8%", top: "6%" },
  { key: "siteServicesHexMid", left: "47%", top: "30%" },
  { key: "siteServicesHexLow", left: "8%", top: "54%" },
  { key: "siteServicesHexTopRight", left: "47%", top: "-18%", tint: "bg-sky-300/12" },
  { key: "siteServicesHexBottomRight", left: "47%", top: "78%", tint: "bg-white/6" },
];

/** หกเหลี่ยมหนึ่งช่อง — ไม่มีรูป/โหลดไม่ขึ้น = ช่องสีโปร่ง รูปทรงยังครบ คลัสเตอร์ไม่แหว่ง */
function HeroHex({
  src,
  left,
  top,
  tint,
  delay,
  pending,
}: Readonly<{ src: string; left: string; top: string; tint?: string; delay: number; pending: boolean }>) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // รูปในแคชอาจโหลดเสร็จก่อนผูก onLoad
    setState(imgRef.current?.complete ? "loaded" : "loading");
  }, [src]);
  const showPhoto = src !== "" && state !== "failed";
  // ยังไม่รู้ค่าตั้ง หรือรูปกำลังมา = แสงวิ่งบนพื้นนาวี (เดิมเป็นช่องสีโปร่งเปล่าแล้วรูปโผล่พรวด)
  // ช่องมุมขวาเป็นสีโปร่งตกแต่ง (มี tint) ไม่มีรูปมาแน่ ๆ ระหว่างรอค่าตั้งก็ไม่ต้องวิ่ง
  const shimmer = (pending && !tint) || (showPhoto && state === "loading");
  return (
    <div
      aria-hidden
      className={`hex hex-in absolute w-[52%] overflow-hidden ${showPhoto ? "" : (tint ?? "bg-white/10")}`}
      style={{ left, top, animationDelay: `${delay}s` }}
    >
      {shimmer && <div className="skeleton on-dark absolute inset-0 rounded-none" />}
      {showPhoto && (
        <img
          ref={imgRef}
          src={src}
          alt=""
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={`hex-photo transition-opacity duration-700 motion-reduce:transition-none ${
            state === "loaded" ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </div>
  );
}

/** รูปย่อในการ์ดบริการ — ยังไม่มีรูป/โหลดไม่ขึ้น = กล่องน้ำเงินอ่อนแทน (ไม่ทิ้งช่องว่างให้การ์ดเบี้ยว) */
function HeroServiceThumb({ src, pending }: Readonly<{ src: string; pending: boolean }>) {
  if (!pending && !src) return <span aria-hidden className="h-20 w-24 shrink-0 rounded-lg bg-brand/10" />;
  // ยังไม่รู้ค่าตั้ง/รูปกำลังมา = แสงวิ่งแล้วจางเข้า (เดิมเป็นกล่องฟ้าเปล่าแล้วรูปโผล่พรวด)
  return <FadeImage src={src} alt="" pending={pending} lazy className="h-20 w-24 shrink-0 rounded-lg" />;
}

export function ServicesPage() {
  usePageMeta(
    "บริการ",
    "ออกแบบบ้าน ก่อสร้าง และงานระบบวิศวกรรม (โครงสร้าง ไฟฟ้า ประปา) โดยทีมวิศวกร ดูแลตั้งแต่ปรึกษา ออกแบบ ประเมินราคา จนส่งมอบบ้าน",
  );
  const [portfolio, setPortfolio] = useState<PortfolioDto[]>([]);
  // เดิมระหว่างรอขึ้นกล่อง "ผลงานเร็ว ๆ นี้" เหมือนไม่มีผลงาน แล้วค่อยกลายเป็นแถบเลื่อน
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  // รูปที่พนักงานตั้งไว้จากหน้า "คลังรูปเว็บไซต์" — ว่าง = กลับไปเป็นกรอบเปล่าเหมือนเดิม
  // เริ่มจากค่าที่จำไว้จากการเปิดเว็บครั้งก่อน — ไม่งั้นรอบแรกยังไม่รู้รูป หัวหน้าขึ้นข้อความ "ยังไม่ได้ตั้งภาพ" แว้บหนึ่ง
  // null = ยังไม่รู้ค่าตั้งเลย (เปิดเว็บครั้งแรก) → พื้นเข้มเปล่าไว้ก่อน
  const [siteImages, setSiteImages] = useState<Record<string, string> | null>(cachedPublicSettings);

  useEffect(() => {
    // ดึงเฉพาะผลงานเด่นที่ staff เลือก (เติมล่าสุดให้ถ้าไม่ครบ) — สูงสุด 8
    listFeaturedPortfolio()
      .then((res) => setPortfolio(res.portfolio))
      .catch(() => undefined)
      .finally(() => setPortfolioLoading(false));
    getPublicSettings()
      .then((res) => setSiteImages(res.settings))
      .catch(() => setSiteImages((prev) => prev ?? {}));
  }, []);

  const images = siteImages ?? {};
  /** รูปของช่องในคลังรูป · ยังไม่รู้ค่าตั้ง (เปิดเว็บครั้งแรก) = "" ไว้ก่อน */
  const slotImage = (key: SiteImageKey) => (siteImages === null ? "" : resolveSiteImageSlot(images, key));
  const imagesPending = siteImages === null;

  return (
    <div>
      {/* ============================ HERO ============================ */}
      {/* แบบ D (ผู้ใช้เลือก 13 ต.ค. 2026): พื้นนาวี + ตารางพิมพ์เขียว · ข้อความซ้าย · หกเหลี่ยมรังผึ้งรูปสามช่องขวา (~35%)
          + การ์ดสามบริการลอยซ้อนขอบล่าง · แถบเมนูยังเป็นแถบขาวปกติ (ห้ามทำโปร่งทับหัว)
          จอเล็กกว่า lg ไม่มีที่ให้คลัสเตอร์ (จะทับข้อความ) จึงเหลือพื้นนาวี + ตาราง */}
      <section className="relative">
        <div className="relative h-[clamp(26rem,60vh,34rem)] overflow-hidden bg-linear-to-br from-brand via-brand-dark to-[#0b1040] text-white lg:h-[34rem]">
          <div aria-hidden className="blueprint-grid absolute inset-0" />
          <div aria-hidden className="absolute inset-y-0 right-0 hidden w-[38%] max-w-[34rem] lg:block">
            {HERO_HEXES.map((h, i) => (
              <HeroHex
                key={`${h.left}-${h.top}`}
                src={slotImage(h.key)}
                left={h.left}
                top={h.top}
                tint={h.tint}
                delay={0.2 + i * 0.15}
                pending={imagesPending}
              />
            ))}
          </div>
          {/* pb เผื่อที่ให้การ์ดที่ลอยขึ้นมาทับ — จอแคบการ์ดเรียงลง จึงซ้อนแค่ใบแรก */}
          <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-end px-6 pb-28 md:pb-36">
            <div className="hero-item flex items-center gap-4" style={{ animationDelay: "0.05s" }}>
              <span className="text-sm tracking-wide text-slate-300">บริการของเรา</span>
              <span className="h-px w-14 bg-slate-400/70" />
            </div>
            <h1
              className="hero-item mt-3 text-5xl font-semibold leading-tight sm:text-6xl"
              style={{ animationDelay: "0.18s" }}
            >
              บริการ
            </h1>
            {/* max-w-xl ที่จอกว้าง — ปลายบรรทัดต้องไม่วิ่งเข้าไปใต้หกเหลี่ยม */}
            <p
              className="hero-item mt-4 max-w-2xl leading-relaxed text-slate-200 sm:text-lg lg:max-w-xl"
              style={{ animationDelay: "0.34s" }}
            >
              บริการออกแบบและก่อสร้างแบบครบวงจร ดูแลคุณภาพ ความปลอดภัย และงานระบบวิศวกรรมในทุกโครงการ
              พร้อมประเมินราคาอย่างโปร่งใสให้เห็นต้นทุนทุกขั้นตอน
            </p>
          </div>
        </div>

        <ul className="relative mx-auto -mt-20 grid max-w-6xl grid-cols-1 gap-4 px-6 md:-mt-24 md:grid-cols-3 md:gap-5">
          {HERO_SERVICES.map((svc, i) => (
            <li key={svc.href} className="hero-item" style={{ animationDelay: `${0.48 + i * 0.09}s` }}>
              {/* ลิงก์เลื่อนในหน้าเดียวกัน — ScrollOnNavigate ใน App.tsx เลื่อนให้ตาม hash · ส่วนปลายทางมี scroll-mt-24 */}
              <Link
                to={`/services${svc.href}`}
                className="group flex h-full items-center gap-4 rounded-xl bg-white p-4 shadow-lg ring-1 ring-slate-200 transition-shadow hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
              >
                <HeroServiceThumb src={slotImage(svc.imageKey)} pending={imagesPending} />
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900 transition-colors group-hover:text-brand">
                    {svc.title}
                  </span>
                  <span className="mt-1 block text-sm leading-snug text-slate-500">{svc.desc}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand">
                    <span>ดูรายละเอียด</span>
                    <span
                      aria-hidden
                      className="transition-transform group-hover:translate-y-0.5 motion-reduce:transition-none"
                    >
                      ↓
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ========================== ออกแบบ ========================== */}
      <section id="design" className="scroll-mt-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-20">
          <Reveal>
          <SectionHeading
            eyebrow="งานออกแบบ"
            title="ออกแบบบ้านที่ตอบโจทย์ ทั้งการใช้งานและความคุ้มค่า"
            desc="เราเริ่มจากความต้องการของคุณเป็นหลัก แล้วแปลงเป็นแบบบ้านที่ใช้งานได้จริง สวยงาม และควบคุมงบประมาณได้ ผ่านขั้นตอนการทำงานที่ชัดเจน"
          />
          </Reveal>

          <Reveal className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-start">
            {/* รูป sticky ด้านซ้าย (เดสก์ท็อป) */}
            <div className="lg:sticky lg:top-24">
              <SiteImage
                src={resolveSiteImage(images.siteServiceDesign, "")}
                label="ภาพงานออกแบบ"
                pending={imagesPending}
                className="aspect-4/5 w-full"
              />
            </div>

            {/* รายการขั้นตอน 1–8 — เลข "ขั้นหลัก" ของหน้านี้: 18px มีเส้นคั่นใต้แต่ละข้อ
                ข้อย่อยในหมวดงานก่อสร้างใช้เลขชุดเดียวกันแต่ 13px และไม่มีเส้นคั่น (ดู CONSTRUCTION_PHASES)
                brand/70 ไม่ใช่ brand/40: ของเดิมวัดคอนทราสต์ได้ 2.35:1 ต่ำกว่าเกณฑ์ 4.5:1 มาก
                ตัวเลขเป็นเนื้อหาจริง (บอกลำดับขั้น) จึงลดความจางไปกว่านี้ไม่ได้ */}
            <ol className="space-y-7">
              {DESIGN_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-5">
                  <span className="text-lg font-semibold text-brand/70 tabular-nums shrink-0 pt-0.5">
                    {i + 1}
                  </span>
                  <div className="border-b border-slate-100 pb-6 flex-1">
                    <h3 className="font-semibold text-black">{step.title}</h3>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ======================== งานก่อสร้าง ======================== */}
      <section id="construction" className="scroll-mt-24 bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-20">
          <Reveal>
          <SectionHeading
            eyebrow="งานก่อสร้าง"
            title="ก่อสร้างอย่างเป็นระบบ ทุกขั้นตอนตรวจสอบได้"
            desc="ทีมงานควบคุมงานก่อสร้างตามแบบและมาตรฐาน แบ่งการทำงานเป็น 3 ช่วงชัดเจน ตั้งแต่การเตรียมงาน ระหว่างก่อสร้าง จนถึงส่งมอบ"
          />
          </Reveal>

          <div className="mt-12 space-y-8">
            {CONSTRUCTION_PHASES.map((phase, idx) => (
              <Reveal
                key={phase.title}
                // จุดยึดรายขั้นตอน — ปุ่ม "ดูหน้าจริง" ในหน้าคลังรูปฝั่งพนักงานลิงก์มาที่นี่
                // ของเดิมทั้งสามขั้นตอนชี้ไป #construction เหมือนกันหมด กดแล้วไปกองที่หัวข้อเดียว
                // scroll-mt-24 เท่ากับ section แม่ กันหัวข้อถูกแถบเมนู fixed บัง
                id={`phase-${idx + 1}`}
                className={`scroll-mt-24 grid grid-cols-1 md:grid-cols-2 gap-8 items-center ${
                  idx % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
                }`}
              >
                {/* รูป (สลับซ้าย-ขวา) */}
                <SiteImage
                  src={resolveSiteImage(images[`siteServicePhase${idx + 1}`], "")}
                  label={`ภาพ${phase.title}`}
                  pending={imagesPending}
                  className="aspect-16/10 w-full"
                />

                {/* เนื้อหา */}
                <div>
                  <span className="inline-block text-xs font-semibold text-brand bg-brand/10 rounded-full px-3 py-1 mb-3">
                    {phase.tag}
                  </span>
                  <h3 className="text-xl font-semibold text-black mb-2">{phase.title}</h3>
                  <p className="text-slate-600 leading-relaxed mb-5">{phase.desc}</p>
                  {/* ol ไม่ใช่ ul — ข้อย่อยพวกนี้เป็นลำดับขั้น ของเดิมเป็น ul แล้ววาดเลขเอง
                      โปรแกรมอ่านหน้าจอจึงไม่บอกว่าเรียงลำดับ
                      เลขใช้ชุดเดียวกับขั้นตอนหลักของหน้าออกแบบ ต่างแค่ขนาด (13px) และไม่มีเส้นคั่น
                      เพราะข้อย่อยเป็นบรรทัดเดียวสั้น ๆ — เดิมเป็นวงกลมนาวีทึบซึ่งหนักคนละเรื่องกัน
                      items-baseline: เลขกับข้อความคนละขนาด ถ้าใช้ items-start เลขจะลอยสูงกว่าบรรทัด */}
                  <ol className="space-y-2.5">
                    {phase.steps.map((s, si) => (
                      <li key={s} className="flex items-baseline gap-3 text-slate-700">
                        <span className="shrink-0 text-[13px] font-semibold text-brand/70 tabular-nums">
                          {si + 1}
                        </span>
                        <span className="text-sm leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== งานระบบวิศวกรรม ===================== */}
      <section id="engineering" className="scroll-mt-24 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-20">
          <Reveal>
          <SectionHeading
            eyebrow="งานระบบวิศวกรรม"
            title="งานระบบครบวงจร รองรับทั้งบ้านและงานอาคาร"
            desc="นอกจากงานบ้าน เรายังรับงานระบบวิศวกรรมที่ต้องการความแม่นยำและมาตรฐาน ดูแลโดยทีมวิศวกรเฉพาะทาง"
          />
          </Reveal>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {ENGINEERING.map((e, i) => (
              <Reveal key={e.title} className="h-full" delay={i * 90}>
              <div className="flex h-full gap-5 rounded-xl border border-slate-200 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <span className="w-12 h-12 shrink-0 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
                  <e.Icon />
                </span>
                <div>
                  <h3 className="font-semibold text-black">{e.title}</h3>
                  <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{e.desc}</p>
                </div>
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= ผลงานของเรา (เต็มจอ) ======================= */}
      <section
        id="portfolio"
        className="scroll-mt-24 bg-slate-50 border-y border-slate-100 min-h-screen flex flex-col justify-center py-16"
      >
        <div className="w-full max-w-7xl mx-auto px-4">
          <Reveal className="flex items-end justify-between gap-4 mb-3">
            <div>
              <p className="text-sm font-semibold text-brand uppercase tracking-wide mb-2">
                สำรวจผลงาน
              </p>
              <h2 className="text-3xl sm:text-4xl font-semibold text-black leading-snug">
                ผลงานของเรา
              </h2>
            </div>
            <Link
              to="/portfolio"
              className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-medium text-brand hover:text-brand-dark lg:min-h-0"
            >
              ดูผลงานทั้งหมด →
            </Link>
          </Reveal>

          {/* คำโปรยสั้น ๆ */}
          <p className="mb-10 max-w-2xl text-slate-600 leading-relaxed">
            รวมผลงานออกแบบและก่อสร้างที่เราภูมิใจนำเสนอ
          </p>

          <PortfolioStrip loading={portfolioLoading} items={portfolio} />
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      <CtaBanner title="พร้อมเริ่มโครงการของคุณแล้วหรือยัง?" />
    </div>
  );
}

/** แถบผลงานเด่น — ระหว่างโหลดเป็นการ์ดแนวตั้งขนาดเดียวกับแถบจริง (w-80/sm:w-96 · 4:5) ล้นขวาแบบแถบเลื่อน */
function PortfolioStrip({ loading, items }: Readonly<{ loading: boolean; items: PortfolioDto[] }>) {
  if (loading) {
    return (
      <SkeletonGroup label="กำลังโหลดผลงาน" className="flex gap-6 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-80 shrink-0 sm:w-96">
            <Skeleton className="aspect-4/5 w-full rounded-2xl" />
            <Skeleton className="mt-3.5 h-5 w-2/3" />
            <Skeleton className="mt-2 h-3.5 w-1/2" />
          </div>
        ))}
      </SkeletonGroup>
    );
  }
  if (items.length > 0) return <PortfolioCarousel items={items} />;
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-24 text-center">
      <p className="text-lg font-medium text-slate-500">ผลงานเร็ว ๆ นี้</p>
    </div>
  );
}
