import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { resolveSiteImage, type HouseDesignDto } from "@systemboq/shared-types";

import { CtaBanner } from "../components/CtaBanner";
import { Reveal } from "../components/Reveal";
import { SpecularButton } from "../components/SpecularButton";
import { useParallax } from "../lib/use-parallax";
import { getPublicSettings, listFeaturedHouseDesigns, listHouseDesigns } from "../lib/public-api";

// หัวข้อสั้น + คำขยายหนึ่งบรรทัด คั่นด้วยเส้นบาง ๆ — เดิมเป็นบรรทัดเดียวนำด้วยเครื่องหมายถูก
// ซึ่งไม่ได้บอกอะไร (เครื่องหมายถูกมีความหมายเมื่อคู่กับกากบาทในตารางเทียบแพ็กเกจเท่านั้น
// ที่นี่ทุกข้อเป็นถูกหมด) และเป็นจุดเดียวในเว็บทั้งฝั่งลูกค้าที่ใช้สัญลักษณ์นี้
const HIGHLIGHTS = [
  {
    title: "ประเมินราคาด้วยระบบ BOQ",
    desc: "แจกแจงค่าวัสดุและค่าแรงเป็นรายการ ให้เห็นต้นทุนก่อนตัดสินใจ",
  },
  {
    title: "มีแบบบ้านให้เลือก หรือออกแบบใหม่",
    desc: "เลือกจากแบบมาตรฐานที่มีอยู่ หรือเขียนแบบใหม่ตามที่ดินและงบประมาณ",
  },
  {
    title: "ดูแลครบตั้งแต่ออกแบบจนส่งมอบ",
    desc: "ทีมงานเดียวรับผิดชอบทั้งงานออกแบบและงานก่อสร้าง",
  },
  {
    title: "ติดตามงานและราคาได้ตลอดโครงการ",
    desc: "เข้าดูใบเสนอราคา สัญญา และสถานะงานได้จากหน้าเว็บ",
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
function EngineeringServiceIcon() {
  return (
    <svg {...iconProps}>
      <polygon points="13 2 4 14 11 14 11 22 20 10 13 10 13 2" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg {...iconProps} className="w-8 h-8">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/* การ์ดสามใบนี้คือตัวอย่างย่อของหน้า /services — **ชื่อบริการต้องตรงกับหัวข้อในหน้านั้นเสมอ**
   (งานออกแบบ · งานก่อสร้าง · งานระบบวิศวกรรม) ถ้าหน้าบริการเพิ่ม/เปลี่ยนหัวข้อ ต้องตามมาแก้ที่นี่
   แต่ละใบพาไปที่หัวข้อของตัวเองโดยตรงด้วย hash (ScrollOnNavigate ใน App.tsx เลื่อนให้เอง)

   "ประเมินราคาโปร่งใส" ไม่ได้เป็นการ์ด เพราะเป็นวิธีทำงานที่ครอบทุกบริการ ไม่ใช่บริการข้อที่สี่
   — ย้ายไปอยู่ในคำโปรยใต้หัวข้อส่วนแทน */
const SERVICES = [
  {
    title: "งานออกแบบ",
    desc: "เริ่มจากความต้องการของคุณ แปลงเป็นแบบที่ก่อสร้างได้จริง พร้อมแบบมาตรฐานให้เลือก",
    to: "/services#design",
    linkLabel: "เพิ่มเติม",
    Icon: DesignServiceIcon,
  },
  {
    title: "งานก่อสร้าง",
    desc: "ควบคุมงานตามแบบและมาตรฐาน แบ่งเป็น 3 ขั้นตอน ตรวจสอบได้ทุกช่วง",
    to: "/services#construction",
    linkLabel: "เพิ่มเติม",
    Icon: BuildServiceIcon,
  },
  {
    title: "งานระบบวิศวกรรม",
    desc: "ระบบไฟฟ้า ประปา-สุขาภิบาล ปรับอากาศ และห้องปลอดเชื้อ รองรับทั้งบ้านและงานอาคาร",
    to: "/services#engineering",
    linkLabel: "เพิ่มเติม",
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

export function HomePage() {
  const [companyName, setCompanyName] = useState("บริษัทรับออกแบบและสร้างบ้าน");
  // รูปที่พนักงานตั้งไว้จากหน้า "คลังรูปเว็บไซต์" — ว่าง = ใช้รูปเริ่มต้นตามเดิม
  const [siteImages, setSiteImages] = useState<Record<string, string>>({});
  const [designs, setDesigns] = useState<HouseDesignDto[]>([]);
  // แบบบ้านแนะนำที่ staff เลือก (โชว์เท่าที่เลือก) — แยกจาก designs ที่ใช้เป็นรูปพื้นหลังส่วนเกี่ยวกับเรา
  const [featured, setFeatured] = useState<HouseDesignDto[]>([]);

  useEffect(() => {
    getPublicSettings()
      .then((res) => {
        if (res.settings.companyName) setCompanyName(res.settings.companyName);
        setSiteImages(res.settings);
      })
      .catch(() => undefined);
    listHouseDesigns()
      .then((res) => setDesigns(res.houseDesigns))
      .catch(() => undefined);
    listFeaturedHouseDesigns()
      .then((res) => setFeatured(res.houseDesigns))
      .catch(() => undefined);
  }, []);
  // parallax เบา ๆ ที่รูป hero (section มี overflow-hidden อยู่แล้ว รูปถูก scale เผื่อขอบในฮุก)
  const heroImgRef = useParallax<HTMLImageElement>();
  const heroImage = resolveSiteImage(siteImages.siteHeroHome, "/web12.jpg");
  // ลำดับของภาพส่วนเกี่ยวกับเรา: รูปที่พนักงานตั้งไว้ > รูปแบบบ้านหลังแรกที่มีภาพ > รูปสำรอง
  const aboutImage = resolveSiteImage(
    siteImages.siteAboutHome,
    designs.find((d) => d.exteriorImages?.[0])?.exteriorImages?.[0] ?? "/web12.jpg",
  );
  const showViewAllCard = featured.length > 0 && featured.length < 3;
  const featuredCardCount = featured.length + (showViewAllCard ? 1 : 0);
  const featuredGridCols = featuredCardCount >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";

  return (
    <div>
      {/* Hero */}
      <section className="relative min-h-screen bg-black text-white overflow-hidden flex items-center">
        <img
          ref={heroImgRef}
          src={heroImage}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative w-full max-w-5xl mx-auto px-4 py-24 flex flex-col items-start gap-5 [text-shadow:0_2px_10px_rgba(0,0,0,0.6)]">
          <p
            className="hero-item text-sm tracking-wide text-slate-300 uppercase"
            style={{ animationDelay: "0.05s" }}
          >
            {companyName}
          </p>
          <h1
            className="hero-item text-3xl sm:text-5xl font-semibold leading-tight max-w-2xl"
            style={{ animationDelay: "0.18s" }}
          >
            บริการออกแบบและรับเหมาก่อสร้างบ้าน
          </h1>
          <p className="hero-item text-slate-200 max-w-xl" style={{ animationDelay: "0.34s" }}>
            เริ่มต้นโครงการบ้านของคุณไปด้วยกัน พร้อมประเมินราคาต้นทุนอย่างโปร่งใสทุกรายการ
          </p>
          <div className="hero-item flex flex-wrap gap-3 mt-2" style={{ animationDelay: "0.48s" }}>
            <SpecularButton href="#about">ดูเพิ่มเติม</SpecularButton>
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
            (รูป hero พนักงานเปลี่ยนเองได้จากหน้าคลังรูป จึงห้ามฝากความชัดไว้กับว่ารูปมืดพอไหม) */}
        <a
          href="#about"
          aria-label="เลื่อนลงดูเพิ่มเติม"
          className="absolute bottom-4 left-1/2 flex h-11 w-11 -translate-x-1/2 items-center justify-center text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] transition-opacity hover:opacity-80 animate-bounce"
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

      {/* About */}
      <section id="about" className="scroll-mt-20 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 md:items-stretch">
          {/* full-bleed image on the left */}
          <div className="h-64 md:h-auto md:min-h-96">
            <img src={aboutImage} alt="ผลงานบ้านของเรา" className="w-full h-full object-cover" />
          </div>
          {/* text on the right */}
          <div className="flex items-center px-4 py-14 md:py-20 md:px-12 lg:px-16">
            <Reveal className="max-w-xl">
              <p className="text-sm font-semibold text-brand uppercase tracking-wide mb-2">
                เกี่ยวกับเรา
              </p>
              <h2 className="text-2xl sm:text-3xl font-semibold text-black leading-snug mb-4">
                รับออกแบบและสร้างบ้าน ที่ให้คุณเห็นราคาจริงทุกขั้นตอน
              </h2>
              <p className="text-slate-600 leading-relaxed">
                {companyName} รับออกแบบและรับเหมาก่อสร้างบ้านครบวงจร ตั้งแต่เลือกแบบ ประเมินราคา
                ไปจนถึงส่งมอบ เราเชื่อว่าบ้านที่ดีเริ่มจากความเข้าใจตรงกันเรื่องราคา
                ลูกค้าจึงเห็นต้นทุนทุกรายการตั้งแต่ก่อนเริ่มงาน
              </p>
              <ul className="mt-8 divide-y divide-slate-200">
                {HIGHLIGHTS.map((h) => (
                  <li key={h.title} className="py-4 first:pt-0">
                    <p className="font-medium text-slate-900">{h.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{h.desc}</p>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="bg-slate-50 border-y border-slate-100">
        {/* เต็มความกว้างจอ ไม่มีเพดานความกว้างเหมือนส่วนอื่น — ระยะขอบซ้ายขวาไล่ตามขนาดจอ */}
        <div className="w-full px-4 py-20 sm:px-8 lg:px-12 2xl:px-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-semibold text-black text-center mb-2">
              บริการของเรา
            </h2>
            <p className="text-slate-500 text-center mb-12">
              ออกแบบ ก่อสร้าง และงานระบบวิศวกรรม พร้อมประเมินราคาอย่างโปร่งใสทุกโครงการ
            </p>
          </Reveal>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {SERVICES.map((s, i) => (
              <Reveal key={s.title} delay={i * 90} className="h-full">
                {/* กดได้ทั้งใบ: ชื่อบริการเป็นลิงก์จริง แล้วขยายพื้นที่กดคลุมการ์ดด้วย after: —
                    โปรแกรมอ่านหน้าจอได้ยิน "งานออกแบบ, ลิงก์" แทน "เพิ่มเติม" สามครั้งที่ไม่รู้ว่าไปไหน
                    และยังลากเลือกข้อความ/คลิกกลางเปิดแท็บใหม่ได้ ต่างจากการห่อทั้งการ์ดด้วย <a> */}
                <div className="group relative bg-white border border-slate-200 rounded-xl p-6 h-full flex flex-col gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all motion-reduce:transition-none motion-reduce:hover:translate-y-0 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand has-[a:focus-visible]:ring-offset-2">
                  <span className="w-12 h-12 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
                    <s.Icon />
                  </span>
                  <h3 className="text-lg font-semibold text-black transition-colors group-hover:text-brand">
                    <Link
                      to={s.to}
                      className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
                    >
                      {s.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed flex-1">{s.desc}</p>
                  {/* ตัวบอกว่ากดได้ ไม่ใช่ลิงก์แยก (ลิงก์จริงคือชื่อบริการด้านบน) */}
                  <span aria-hidden="true" className="text-sm font-medium text-brand inline-flex items-center gap-1">
                    {s.linkLabel}
                    <span className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none">→</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Featured house designs */}
      {featured.length > 0 && (
        <section className="bg-white">
          <div className="max-w-7xl mx-auto px-4 py-20">
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-semibold text-black text-center mb-2">
                แบบบ้านแนะนำ
              </h2>
              <p className="text-slate-500 text-center mb-12">
                เลือกแบบที่ใช่สำหรับคุณ หรือดูแบบทั้งหมดของเรา
              </p>
            </Reveal>
            <div className={`grid grid-cols-1 ${featuredGridCols} gap-6`}>
              {featured.map((d, i) => (
                <Reveal key={d.id} delay={i * 90} className="h-full">
                  <Link
                    to={`/house-designs/${d.id}`}
                    className="group h-full flex flex-col border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                  >
                    {d.exteriorImages?.[0] ? (
                      <div className="overflow-hidden">
                        <img
                          src={d.exteriorImages[0]}
                          alt={d.name}
                          className="w-full h-56 object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-56 bg-slate-100 flex items-center justify-center text-slate-300 text-sm">
                        ไม่มีรูปภาพ
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-semibold text-black">{d.name}</h3>
                      {d.area && <p className="text-sm text-slate-500 mt-1">{d.area} ตร.ม.</p>}
                    </div>
                  </Link>
                </Reveal>
              ))}
              {showViewAllCard && (
                <Reveal delay={featured.length * 90} className="h-full">
                  <Link
                    to="/house-designs"
                    className="h-full border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-brand hover:border-brand hover:bg-brand/5 transition-colors min-h-56"
                  >
                    <PlusIcon />
                    <span className="font-medium">ดูแบบบ้านทั้งหมด</span>
                  </Link>
                </Reveal>
              )}
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
