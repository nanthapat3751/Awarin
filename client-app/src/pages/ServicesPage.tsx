import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { resolveSiteImage, type PortfolioDto } from "@systemboq/shared-types";

import { CtaBanner } from "../components/CtaBanner";
import { Reveal } from "../components/Reveal";
import { PortfolioCarousel } from "../components/PortfolioCarousel";
import { getPublicSettings, listFeaturedPortfolio } from "../lib/public-api";
import { useParallax } from "../lib/use-parallax";

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
 * ถ้ายังไม่ได้ตั้ง (หรือรูปโหลดไม่ขึ้น) จะกลับไปเป็นกรอบเปล่าพร้อมป้ายชื่อเหมือนเดิม
 * เพื่อให้หน้าเว็บไม่พังตอนยังไม่มีรูป
 */
function SiteImage({
  src,
  label,
  className = "",
}: Readonly<{
  src: string;
  label: string;
  className?: string;
}>) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-300 text-sm select-none ${className}`}
      >
        {label}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={label}
      onError={() => setFailed(true)}
      className={`rounded-2xl object-cover ${className}`}
    />
  );
}

export function ServicesPage() {
  const [portfolio, setPortfolio] = useState<PortfolioDto[]>([]);
  const [heroImgError, setHeroImgError] = useState(false);
  // รูปที่พนักงานตั้งไว้จากหน้า "คลังรูปเว็บไซต์" — ว่าง = กลับไปเป็นกรอบเปล่าเหมือนเดิม
  const [siteImages, setSiteImages] = useState<Record<string, string>>({});
  // parallax เบา ๆ ที่รูปแบนเนอร์ hero (รูปถูก scale เผื่อขอบไว้ในฮุกแล้ว กล่องนอกมี overflow-hidden)
  const heroImgRef = useParallax<HTMLImageElement>();

  useEffect(() => {
    // ดึงเฉพาะผลงานเด่นที่ staff เลือก (เติมล่าสุดให้ถ้าไม่ครบ) — สูงสุด 8
    listFeaturedPortfolio()
      .then((res) => setPortfolio(res.portfolio))
      .catch(() => undefined);
    getPublicSettings()
      .then((res) => setSiteImages(res.settings))
      .catch(() => undefined);
  }, []);

  // ยังคงไฟล์ public/services-hero.jpg ไว้เป็นค่าสำรอง เผื่อยังไม่ได้ตั้งรูปจากหน้าคลังรูป
  const heroImage = resolveSiteImage(siteImages.siteHeroServices, "/services-hero.jpg");

  // ต้องล้างสถานะ "โหลดรูปไม่สำเร็จ" ทุกครั้งที่ URL เปลี่ยน — ตอนเรนเดอร์รอบแรกยังไม่มีค่า
  // จากเซิร์ฟเวอร์ รูปจึงชี้ไปที่ /services-hero.jpg ซึ่งไม่มีไฟล์จริง onError ยิงทันที
  // แล้ว <img> ถูกถอดออกจากดอม พอค่าจริงมาถึงทีหลังรูปที่พนักงานอัปจึงไม่เคยขึ้นเลย
  useEffect(() => {
    setHeroImgError(false);
  }, [heroImage]);

  return (
    <div>
      {/* ============================ HERO (เต็มจอ) ============================ */}
      {/* โทน navy เข้มนุ่ม (ประกาย navy บนพื้นเข้ม ไม่ใช่ดำล้วน) — navbar เป็นแถบขาวปกติ ไม่แก้เมนู */}
      <section className="relative min-h-[calc(100vh-4.6rem)] text-white flex flex-col">
        {/* แถบหัวเรื่อง */}
        <div className="relative overflow-hidden bg-neutral-900 px-6 pt-16 sm:pt-20 pb-10">
          {/* ประกาย navy มุมบนซ้าย ให้พื้นเป็นโทน navy เข้ม ไม่ใช่ดำล้วน */}
          <div className="absolute inset-0 bg-linear-to-br from-brand/40 via-neutral-900 to-neutral-900" />
          <div className="relative max-w-6xl mx-auto w-full">
            {/* eyebrow + เส้นขีด */}
            <div className="hero-item flex items-center gap-4 mb-5" style={{ animationDelay: "0.05s" }}>
              <span className="text-sm tracking-wide uppercase text-slate-300">บริการของเรา</span>
              <span className="h-px w-14 bg-slate-500" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-10 md:items-end">
              <h1
                className="hero-item text-5xl sm:text-7xl font-semibold leading-none"
                style={{ animationDelay: "0.18s" }}
              >
                บริการ
              </h1>
              <p className="hero-item text-slate-300 leading-relaxed md:pb-1.5" style={{ animationDelay: "0.34s" }}>
                บริการออกแบบและก่อสร้างแบบครบวงจร ดูแลคุณภาพ ความปลอดภัย และงานระบบวิศวกรรมในทุกโครงการ
                พร้อมประเมินราคาอย่างโปร่งใสให้เห็นต้นทุนทุกขั้นตอน
              </p>
            </div>
          </div>
        </div>

        {/* รูปแบนเนอร์เต็มความกว้าง — ตั้งได้จากหน้า "คลังรูปเว็บไซต์" ฝั่งพนักงาน
            (ถ้ายังไม่ตั้ง จะลองไฟล์ public/services-hero.jpg แล้วค่อยตกมาเป็นข้อความบอกทาง) */}
        <div
          className="hero-item flex-1 relative min-h-[42vh] overflow-hidden bg-neutral-900"
          style={{ animationDelay: "0.48s" }}
        >
          {heroImgError ? (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm select-none">
              ยังไม่ได้ตั้งภาพหน้าบริการ — ตั้งได้ที่หน้า "คลังรูปเว็บไซต์" ฝั่งพนักงาน
            </div>
          ) : (
            <img
              ref={heroImgRef}
              src={heroImage}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setHeroImgError(true)}
            />
          )}
        </div>
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
                src={resolveSiteImage(siteImages.siteServiceDesign, "")}
                label="ภาพงานออกแบบ"
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
                  src={resolveSiteImage(siteImages[`siteServicePhase${idx + 1}`], "")}
                  label={`ภาพ${phase.title}`}
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

          {portfolio.length > 0 ? (
            <PortfolioCarousel items={portfolio} />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-24 text-center">
              <p className="text-lg font-medium text-slate-500">ผลงานเร็ว ๆ นี้</p>
            </div>
          )}
        </div>
      </section>

      {/* ============================ CTA ============================ */}
      <CtaBanner title="พร้อมเริ่มโครงการของคุณแล้วหรือยัง?" />
    </div>
  );
}
