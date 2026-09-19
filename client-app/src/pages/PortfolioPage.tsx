import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { PortfolioDto, PortfolioType } from "@systemboq/shared-types";

import { CtaBanner } from "../components/CtaBanner";
import { ImagePeek } from "../components/ImagePeek";
import { Reveal } from "../components/Reveal";
import { cardGridClass } from "../lib/card-grid";
import { listPortfolio } from "../lib/public-api";

const FILTERS: { label: string; value: PortfolioType | undefined }[] = [
  { label: "ทั้งหมด", value: undefined },
  { label: "งานออกแบบ", value: "DESIGN" },
  { label: "งานก่อสร้าง", value: "CONSTRUCTION" },
];

const TYPE_LABEL: Record<PortfolioType, string> = {
  DESIGN: "งานออกแบบ",
  CONSTRUCTION: "งานก่อสร้าง",
};

const PAGE_SIZE = 12;

function PortfolioCard({ item }: Readonly<{ item: PortfolioDto }>) {
  const photos = item.images ?? [];
  // ให้การ์ดเป็นคนจับการชี้ ไม่ใช่ตัวรูป เพราะ overlay ที่ทับอยู่บนรูปกินอีเวนต์เมาส์ไปหมด
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={`/portfolio/${item.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:-translate-y-1 hover:shadow-lg"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* รูป: hover ซูม + overlay ไล่ขึ้นพร้อมปุ่มดูผลงาน (แพทเทิร์นเดียวกับการ์ดแบบบ้าน) */}
      {/* aspect-video (16:9) ไม่ใช่ h-44: ความสูงคงที่ 176px เคยพอดีตอนการ์ดกว้าง 315px (3 คอลัมน์)
          แต่พอตะแกรงเหลือ 2 คอลัมน์ การ์ดกว้าง 488px รูปจะกลายเป็นแถบยาว 2.8:1 —
          16:9 ให้สัดส่วนเท่าของเดิมเป๊ะแต่ขยายตามความกว้างการ์ด */}
      <div className="relative aspect-video overflow-hidden bg-slate-100">
        {photos.length > 0 ? (
          <ImagePeek images={photos} alt={item.title} active={hover} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">
            ไม่มีรูปภาพ
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 flex items-end bg-linear-to-t from-black/60 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="m-3 inline-flex translate-y-2 items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-800 transition-transform duration-300 group-hover:translate-y-0">
            ดูผลงาน →
          </span>
        </div>
      </div>
      <div className="p-4">
        <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
          {TYPE_LABEL[item.type]}
        </span>
        <h2 className="mt-1.5 font-medium text-slate-800 transition-colors group-hover:text-brand">
          {item.title}
        </h2>
        {item.description && (
          <p className="mt-1 text-sm text-slate-500 line-clamp-2">{item.description}</p>
        )}
      </div>
    </Link>
  );
}

export function PortfolioPage() {
  const [items, setItems] = useState<PortfolioDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PortfolioType | undefined>(undefined);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    listPortfolio(filter)
      .then((res) => setItems(res.portfolio))
      .finally(() => setLoading(false));
  }, [filter]);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [items, safePage],
  );

  return (
    // สูงเต็มจอ + คอลัมน์ ดัน CtaBanner/footer ลงล่างสุดเมื่อผลงานมีไม่มาก (ไม่ให้ footer เด้งขึ้น)
    <div className="flex min-h-[calc(100vh-4.5rem)] flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
        <Reveal>
          <h1 className="text-2xl font-semibold text-slate-800">ผลงานของเรา</h1>
          <p className="mt-1 mb-6 text-sm text-slate-500">
            ตัวอย่างงานออกแบบและก่อสร้างที่เราภูมิใจนำเสนอ
          </p>
        </Reveal>

        <div className="mb-6 flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`inline-flex min-h-11 items-center rounded-full border px-4 py-1 text-sm transition-colors lg:min-h-0 ${
                filter === f.value
                  ? "border-brand bg-brand text-white"
                  : "border-slate-300 text-slate-600 hover:border-slate-400"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-slate-400">กำลังโหลด...</p>}
        {!loading && items.length === 0 && <p className="text-slate-400">ยังไม่มีผลงาน</p>}

        {pageItems.length > 0 && (
          <div className={`grid gap-6 ${cardGridClass(pageItems.length)}`}>
            {pageItems.map((item, i) => (
              <Reveal key={item.id} className="h-full" delay={i * 90}>
                <PortfolioCard item={item} />
              </Reveal>
            ))}
          </div>
        )}

        {pageCount > 1 && (
          <nav className="mt-10 flex items-center justify-center gap-1" aria-label="แบ่งหน้า">
            <button
              type="button"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 1}
              aria-label="หน้าก่อนหน้า"
              className="flex h-9 w-9 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              ‹
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                aria-current={n === safePage ? "page" : undefined}
                className={`h-9 w-9 rounded text-sm ${
                  n === safePage ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage === pageCount}
              aria-label="หน้าถัดไป"
              className="flex h-9 w-9 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              ›
            </button>
          </nav>
        )}
      </div>

      {/* ต่อจากตะแกรง — คนที่ดูผลงานจบแล้วมักอยากรู้ต่อว่า "แล้วรับทำอะไรบ้าง"
          พาไปยังส่วนที่ตรงเรื่องในหน้าบริการโดยตรง แทนที่จะปล่อยให้หน้าจบห้วน ๆ
          ส่วนนี้ไม่ขึ้นกับจำนวนผลงาน จึงเติมเนื้อหาให้หน้าได้แม้ผลงานยังมีไม่มาก */}
      <RelatedServices />

      <CtaBanner />
    </div>
  );
}

// ใช้ id เดียวกับที่ ServicesPage ตั้งไว้ (design / construction / engineering)
// การเลื่อนไปยัง #id จัดการโดย ScrollOnNavigate ใน App.tsx
const RELATED_SERVICES = [
  {
    to: "/services#design",
    title: "งานออกแบบ",
    desc: "ออกแบบจากความต้องการและที่ดินจริง พร้อมแบบก่อสร้างและราคาที่ตรวจสอบได้",
  },
  {
    to: "/services#construction",
    title: "งานก่อสร้าง",
    desc: "ควบคุมงานตามแบบและมาตรฐาน รายงานความคืบหน้าตลอดการก่อสร้าง",
  },
  {
    to: "/services#engineering",
    title: "งานระบบวิศวกรรม",
    desc: "ไฟฟ้า ประปา สุขาภิบาล และห้องปลอดเชื้อ ดูแลโดยทีมวิศวกรเฉพาะทาง",
  },
];

function ArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/**
 * ส่วนท้ายหน้าผลงาน — โครงเดียวกับส่วนท้ายหน้าแบบบ้าน (หัวข้ออยู่ซ้าย รายการเรียงลงมาทางขวา)
 * เพื่อให้สองหน้าที่อยู่ข้างกันบนเมนูมีน้ำหนักเท่ากัน เดิมหน้านี้เป็นการ์ดขาวสามใบ
 * ส่วนหน้าแบบบ้านเป็นข้อความลอย ทั้งที่อยู่ตำแหน่งเดียวกันในหน้า
 *
 * **จงใจไม่ใส่เลขลำดับที่นี่** — สามบริการเป็นทางเลือกคู่ขนาน ไม่ใช่ขั้นตอนที่ต้องทำเรียงกัน
 * ใส่เลขจะโกหกผู้อ่านว่าต้องเริ่มจากงานออกแบบก่อนเสมอ
 *
 * พื้นหลังใช้ชุดเดียวกับส่วน "บริการของเรา" ในหน้าแรกและส่วนท้ายหน้าแบบบ้านเป๊ะ
 * (`border-y border-slate-100 bg-slate-50`) เนื้อหาวางตรง ๆ ไม่มีกรอบครอบ — ดูเหตุผลที่ HouseDesignsPage
 */
function RelatedServices() {
  return (
    <section className="border-y border-slate-100 bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-14">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5 lg:self-start">
            <h2 className="text-xl font-semibold text-slate-800">บริการที่เกี่ยวข้อง</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              สนใจงานแบบไหน ดูขั้นตอนการทำงานของแต่ละบริการได้เลย
            </p>

            <p className="mt-8 text-sm leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">งานทุกชิ้นที่เห็นมาจากทีมเดียวกัน</span>{" "}
              ตั้งแต่เขียนแบบ ประเมินราคา จนถึงวันส่งมอบ ไม่ต้องประสานงานหลายเจ้า
            </p>
            <Link
              to="/services"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-brand px-5 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
            >
              ดูบริการทั้งหมด
            </Link>
          </Reveal>

          <Reveal className="lg:col-span-7">
            {/* Tailwind v4: divide-y = เส้นล่างของทุกใบที่ไม่ใช่ใบสุดท้าย ไม่ใช่เส้นบน */}
            <ul className="divide-y divide-slate-200">
              {RELATED_SERVICES.map((s) => (
                // ระยะห่างต้องอยู่ที่ li ไม่ใช่ที่ Link — Link เป็นลูกคนแรกของทุก li
                // ใส่ first:pt-0 ที่ Link จะมีผลกับทุกแถว ไม่ใช่แถวแรก
                <li key={s.to} className="py-5 first:pt-0 last:pb-0">
                  <Link to={s.to} className="group block">
                    <h3 className="font-semibold text-slate-800 transition-colors group-hover:text-brand">
                      {s.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.desc}</p>
                    <span className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                      ดูขั้นตอนการทำงาน
                      <ArrowIcon />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
