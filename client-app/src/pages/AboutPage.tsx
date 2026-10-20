import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  resolveSiteImageSlot,
  type PortfolioDto,
  type SiteImageKey,
} from "@systemboq/shared-types";

import { CtaBanner } from "../components/CtaBanner";
import { FadeImage } from "../components/FadeImage";
import { Reveal } from "../components/Reveal";
import { Skeleton, SkeletonGroup } from "../components/Skeleton";
import {
  cachedPublicSettings,
  getPublicSettings,
  listFeaturedPortfolio,
} from "../lib/public-api";
import { usePageMeta } from "../lib/page-meta";

/* ------------------------------------------------------------------ *
 * หน้าเกี่ยวกับเรา (/about) — ผู้ใช้เลือกแบบ A "Company profile" 13 ต.ค. 2026
 * + ยกส่วนพื้นเข้ม คำขวัญ + แถบรูปผลงาน (จากแบบ B) มาต่อท้าย "สิ่งที่เรายึดถือ"
 *
 * ข้อมูลบริษัททั้งหมดมาจากที่ผู้ใช้ให้มา (เพจ Facebook · หน้าเว็บเดิม · ข้อความเกี่ยวกับบริษัท)
 * **ห้ามเติมตัวเลข/คำอ้างที่ไม่มีที่มา** (ปีประสบการณ์ จำนวนผลงาน ผู้ติดตาม) — ดูกฎในหน้าแรกส่วนเกี่ยวกับเรา
 * คำอธิบายใต้ "สิ่งที่เรายึดถือ" และย่อหน้าพื้นเข้มเป็นข้อความร่าง แก้ได้ที่ค่าคงที่ด้านล่าง
 * ------------------------------------------------------------------ */
/**
 * ประวัติบริษัทแบบ "สองโทน" (ผู้ใช้เลือกแบบ I 15 ต.ค. 2026) — ข้อเท็จจริงเดิมจากย่อหน้าประวัติ
 * (ก่อตั้ง 2562 โดยทีมวิศวกร · ภาครัฐ+เอกชน · ประมูล/เจรจา · Main/Sub-Contractor · กิจการร่วมค้า)
 * แตกเป็นประโยคนำ + 3 บทบาท · คำอธิบายใต้บทบาทเป็นข้อความร่างที่อธิบายความหมายของคำ ไม่ใช่คำอ้างผลงาน
 */
const STORY_LEAD = ["ก่อตั้งปี พ.ศ. 2562 โดย", "ทีมวิศวกร"] as const;
// แยก "ทีมวิศวกร" / "ครบวงจร" ไว้ห้ามตัดบรรทัด — เบราว์เซอร์ตัดเป็น "ทีม / วิศวกร" (มือถือ) และ "ครบ / วงจร" (จอกว้าง)
const STORY_REST = ["รับเหมาก่อสร้าง", "ครบวงจร", " ทั้งงานภาครัฐและเอกชน ตั้งแต่บ้านหนึ่งหลังไปจนถึงอาคารและโรงงาน"] as const;

const ROLES = [
  {
    en: "Main Contractor",
    title: "ผู้รับเหมาหลัก",
    desc: "รับงานจากเจ้าของโครงการโดยตรง ทั้งจากการประมูลและการเจรจาต่อรอง",
  },
  {
    en: "Sub-Contractor",
    title: "ผู้รับเหมาช่วง",
    desc: "รับงานเฉพาะส่วน ร่วมกับผู้รับเหมาหลักของโครงการ",
  },
  {
    en: "Joint Venture",
    title: "กิจการร่วมค้า",
    desc: "ร่วมมือกับบริษัทอื่นในโครงการที่ต้องใช้กำลังหลายฝ่าย",
  },
];

// สามคำมาจากข้อความภาษาอังกฤษของบริษัทเอง (workmanship · innovative engineering · full service)
const VALUES = [
  {
    en: "Workmanship",
    title: "ฝีมือการก่อสร้าง",
    desc: "งานทุกชิ้นควบคุมโดยทีมช่างและวิศวกร ให้ตรงตามแบบและมาตรฐาน",
  },
  {
    en: "Innovative Engineering",
    title: "วิศวกรรมที่คิดมาอย่างดี",
    desc: "ทีมวิศวกรเลือกวิธีก่อสร้างและวัสดุที่เหมาะกับงานแต่ละแบบ",
  },
  {
    en: "Full Service",
    title: "บริการครบวงจร",
    desc: "ตั้งแต่ออกแบบ ประเมินราคา ก่อสร้าง ต่อเติม จนถึงรีโนเวท",
  },
];

// งานที่รับ — จากคำอธิบายเพจของบริษัท
const SCOPE = [
  "สร้างบ้าน",
  "อาคาร",
  "โรงงาน",
  "ต่อเติมซ่อมแซม",
  "Renovate",
  "ออกแบบสถาปัตย์",
  "วิศวกรรมโครงสร้าง",
];

/** รูปหนึ่งช่องในแถบรูป · href = ลิงก์ไปหน้าผลงาน (เฉพาะรูปที่ยืมมาจากผลงานเด่น) */
interface GalleryItem {
  key: SiteImageKey;
  src: string;
  alt: string;
  href: string | null;
}

const GALLERY_KEYS: SiteImageKey[] = [
  "siteAboutGallery1",
  "siteAboutGallery2",
  "siteAboutGallery3",
  "siteAboutGallery4",
];

/** หัวข้อเล็กตัวพิมพ์ใหญ่นำด้วยขีด (แบบหน้าโปรไฟล์บริษัท) — ใช้กับคำอังกฤษเท่านั้น: tracking กว้างทำอักษรไทยแตกห่าง */
function Eyebrow({
  children,
  light = false,
}: Readonly<{ children: string; light?: boolean }>) {
  return (
    <p
      className={`flex items-center gap-3 text-xs font-semibold tracking-[0.18em] uppercase ${
        light ? "text-slate-400" : "text-brand"
      }`}
    >
      <span aria-hidden className="h-px w-10 bg-current opacity-60" />
      {children}
    </p>
  );
}

export function AboutPage() {
  usePageMeta(
    "เกี่ยวกับเรา",
    "Awarin Engineering รับเหมาก่อสร้างครบวงจร ก่อตั้งปี 2562 โดยทีมวิศวกร รับงานสร้างบ้าน อาคาร โรงงาน ต่อเติมและรีโนเวท ทั้งภาคเอกชนและภาครัฐ",
  );
  // เริ่มจากค่าที่จำไว้จากการเปิดเว็บครั้งก่อน · null = ยังไม่รู้ค่าตั้ง (เปิดเว็บครั้งแรก)
  const [settings, setSettings] = useState<Record<string, string> | null>(
    cachedPublicSettings,
  );
  // ผลงานเด่นที่พนักงานเลือกเอง (หน้า "ผลงาน" ฝั่งบริษัท) · null = กำลังโหลด
  const [works, setWorks] = useState<PortfolioDto[] | null>(null);

  useEffect(() => {
    getPublicSettings()
      .then((res) => setSettings(res.settings))
      .catch(() => setSettings((prev) => prev ?? {}));
    // ไม่กรองตัวที่ไม่มีรูปออก — ลำดับต้องตรงกับพรีวิว "ผลงานเด่นลำดับที่ N" ในหน้าคลังรูป
    listFeaturedPortfolio(4)
      .then((res) => setWorks(res.portfolio.slice(0, 4)))
      .catch(() => setWorks([]));
  }, []);

  const slotImage = (key: SiteImageKey) =>
    settings === null ? "" : resolveSiteImageSlot(settings, key);
  const phone = settings?.companyPhone;

  // แถบรูป: ช่องที่อัปเอง > รูปผลงานเด่นลำดับเดียวกัน (ยังไม่รู้ค่าตั้ง/ยังโหลดผลงานไม่เสร็จ = แสงวิ่ง 4 ช่อง กันรูปสลับ)
  const galleryPending = settings === null || works === null;
  const gallery: GalleryItem[] =
    settings === null || works === null
      ? []
      : GALLERY_KEYS.flatMap((key, i): GalleryItem[] => {
          const own = slotImage(key);
          if (own)
            return [
              { key, src: own, alt: "ผลงานของ Awarin Engineering", href: null },
            ];
          const work = works[i];
          const src = work?.images?.[0];
          return src
            ? [{ key, src, alt: work.title, href: `/portfolio/${work.id}` }]
            : [];
        });

  return (
    <div>
      {/* ============================ HERO ============================ */}
      {/* พื้นสว่าง + ตารางเส้นจาง (แบบหน้าโปรไฟล์บริษัทวิศวกรรม) · รูปทางขวาจางเข้าพื้นทางซ้าย */}
      <section className="relative overflow-hidden border-b border-slate-100 bg-slate-50">
        <div aria-hidden className="blueprint-grid-light absolute inset-0" />
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 hidden w-[38%] md:block"
          style={{
            maskImage: "linear-gradient(90deg, transparent, #000 45%)",
            WebkitMaskImage: "linear-gradient(90deg, transparent, #000 45%)",
          }}
        >
          {/* ยึดขอบบน สูงเกินกล่อง — รูปถ่ายหน้างานมักมีลายน้ำชื่อบริษัทที่มุมล่าง ส่วนนั้นล้นออกไป
              ไม่มีรูปหัวหน้าเลย = ไม่มีทั้งแสงวิ่งและกล่อง (พื้นตารางเส้นเฉย ๆ เหมือนเดิม) */}
          {(settings === null || slotImage("siteAboutHero") !== "") && (
            <FadeImage
              src={slotImage("siteAboutHero")}
              alt=""
              pending={settings === null}
              className="absolute inset-x-0 top-0 h-[130%]"
              imgClassName="object-top"
            />
          )}
        </div>
        <div className="relative mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="hero-item" style={{ animationDelay: "0.05s" }}>
            <Eyebrow>Awarin / Company profile</Eyebrow>
          </div>
          <h1
            className="hero-item mt-5 max-w-2xl text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl"
            style={{ animationDelay: "0.15s" }}
          >
            บริษัทรับเหมาก่อสร้างครบวงจร
            <br />
            โดยทีมวิศวกร
          </h1>
          <p
            className="hero-item mt-5 max-w-xl text-lg leading-relaxed text-slate-600"
            style={{ animationDelay: "0.28s" }}
          >
            รับเหมาก่อสร้าง ต่อเติมซ่อมแซม ออกแบบสถาปัตย์ รีโนเวท สร้างบ้าน
            อาคาร และโรงงาน
          </p>
        </div>
      </section>

      {/* ========================= ประวัติบริษัท ========================= */}
      {/* แบบ I "สองโทน": ประโยคใหญ่ ส่วนแรกเข้ม ส่วนหลังจาง → รูปกว้างสูง → 3 บทบาท
          ไม่มี eyebrow "Our story" โดยตั้งใจ (ผู้ใช้สั่งถอดตั้งแต่ 13 ต.ค.) · รูปสูงขึ้นตามที่ผู้ใช้ขอ */}
      <section id="story" className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
          <Reveal>
            <h2 className="max-w-4xl text-2xl leading-snug font-semibold text-slate-900 sm:text-3xl sm:leading-snug">
              <span className="sr-only">ประวัติบริษัท: </span>
              {STORY_LEAD[0]}
              <span className="whitespace-nowrap">{STORY_LEAD[1]}</span>{" "}
              {/* #8a93a5 = จางที่สุดที่ยังผ่านคอนทราสต์ 3:1 ของตัวอักษรใหญ่บนพื้นขาว (slate-400 ได้แค่ ~2.6) */}
              <span className="text-[#8a93a5]">
                {STORY_REST[0]}
                <span className="whitespace-nowrap">{STORY_REST[1]}</span>
                {STORY_REST[2]}
              </span>
            </h2>
          </Reveal>
          <Reveal delay={100} className="mt-10 md:mt-12">
            <FadeImage
              src={slotImage("siteAboutStory")}
              alt="ผลงานของ Awarin Engineering"
              pending={settings === null}
              className="h-72 w-full rounded-2xl sm:h-[440px] lg:h-[600px]"
            />
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-10 md:mt-12">
            {ROLES.map((r, i) => (
              <Reveal key={r.en} delay={i * 90}>
                <div className="border-t border-slate-200 pt-5">
                  <p className="text-xs tracking-widest text-slate-500 uppercase">
                    {r.en}
                  </p>
                  <h3 className="mt-1.5 text-xl font-semibold text-slate-900">
                    {r.title}
                  </h3>
                  <p className="mt-2 leading-relaxed text-slate-500">{r.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== หลักการทำงานของเรา =====================
          เดิมชื่อ "สิ่งที่เรายึดถือ" ผู้ใช้ขอเปลี่ยน (เสนอ "วิสัยทัศน์") — สามข้อนี้คือวิธีทำงาน ไม่ใช่ภาพอนาคตของบริษัท
          จึงใช้ "หลักการทำงานของเรา" */}
      <section className="bg-slate-50 py-20 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="flex flex-col items-center text-center">
            <h2 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
              หลักการทำงานของเรา
            </h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {VALUES.map((v, i) => (
              <Reveal key={v.en} delay={i * 90} className="h-full">
                <div className="relative h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
                  <span
                    aria-hidden
                    className="absolute inset-x-7 top-0 h-0.5 bg-linear-to-r from-brand to-transparent"
                  />
                  <p className="text-xs font-semibold tracking-widest text-brand/70 uppercase">
                    {v.en}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">
                    {v.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {v.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ========================= งานที่รับ =========================
          ต่อจากหลักการทำงานทันที (ผู้ใช้สั่ง — เดิมอยู่ก่อนปุ่มติดต่อท้ายหน้า) */}
      <section
        aria-label="งานที่รับ"
        className="relative overflow-hidden bg-brand-dark"
      >
        <div aria-hidden className="blueprint-grid absolute inset-0" />
        <ul className="relative mx-auto flex max-w-6xl flex-wrap justify-center gap-3 px-6 py-10">
          {SCOPE.map((s) => (
            <li
              key={s}
              className="rounded-full border border-white/25 px-5 py-2 text-sm text-white"
            >
              {s}
            </li>
          ))}
        </ul>
      </section>

      {/* ================== แนวทางของเรา (พื้นเข้ม + คำขวัญ) ==================
          ข้อความไม่ซ้ำกับประวัติบริษัทด้านบน (เล่าวิธีทำงานแทน)
          แถบรูป 4 ช่อง = ช่อง "แถบรูปหน้าเกี่ยวกับเรา" ในคลังรูป · ช่องว่างใช้รูปแรกของผลงานเด่นลำดับเดียวกัน (กดไปหน้าผลงานนั้น)
          ไม่มีทั้งสองอย่าง = ข้ามช่องนั้น · ไม่มีเลยสักช่อง = ไม่มีแถบ (ไม่ใช่กล่องว่าง) · ไม่มีชื่อใต้รูปโดยตั้งใจ (ผู้ใช้สั่งเอาออก) */}
      <section className="bg-neutral-900 text-white">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center md:py-24">
          <Reveal className="flex flex-col items-center">
            <p className="text-lg leading-loose text-slate-200">
              ไม่ว่าจะเป็นบ้านหนึ่งหลัง อาคาร หรือโรงงาน
              ทุกโครงการเริ่มจากทีมวิศวกรที่ออกแบบให้ก่อสร้างได้จริง
              ประเมินราคาให้เห็นต้นทุนทุกรายการก่อนเริ่มงาน
              แล้วลงมือก่อสร้างตามแบบและมาตรฐาน เพราะสิ่งที่เราสร้าง
              ต้องอยู่ได้ดีไปอีกหลายรุ่น
            </p>
            <p className="mt-10 text-3xl font-semibold text-sky-300 sm:text-4xl">
              “Building for Generations”
            </p>
          </Reveal>
        </div>
        {galleryPending ? (
          // จองที่ 4 ช่องไว้ก่อน รูปทรงเดียวกับแถบจริง — สุดท้ายไม่มีผลงานเลยค่อยยุบ (อยู่ท้ายหน้า ไม่ดันอะไร)
          <SkeletonGroup
            label="กำลังโหลดรูปผลงาน"
            className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 pb-20 md:grid-cols-4 md:pb-24"
          >
            {GALLERY_KEYS.map((key, i) => (
              <Skeleton
                key={key}
                className={`on-dark h-40 rounded-lg sm:h-48 ${i % 2 === 1 ? "md:mt-8" : ""}`}
              />
            ))}
          </SkeletonGroup>
        ) : gallery.length > 0 && (
          <ul
            id="gallery"
            className="mx-auto grid max-w-6xl scroll-mt-24 grid-cols-2 gap-4 px-6 pb-20 md:grid-cols-4 md:pb-24"
          >
            {gallery.map((g, i) => {
              const img = (
                <FadeImage
                  src={g.src}
                  alt={g.alt}
                  dark
                  lazy
                  className="h-40 rounded-lg sm:h-48"
                  imgClassName="group-hover:scale-105"
                />
              );
              return (
                <li key={g.key} className={i % 2 === 1 ? "md:mt-8" : ""}>
                  <Reveal delay={i * 90}>
                    {g.href ? (
                      <Link
                        to={g.href}
                        aria-label={g.alt}
                        className="group block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
                      >
                        {img}
                      </Link>
                    ) : (
                      img
                    )}
                  </Reveal>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CtaBanner
        title="มีโครงการในใจแล้วใช่ไหม"
        subtitle={
          phone
            ? `โทร ${phone} หรือส่งรายละเอียดให้ทีมงานประเมินราคา`
            : "ส่งรายละเอียดให้ทีมงานประเมินราคา"
        }
      />
    </div>
  );
}
