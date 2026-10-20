import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { HouseDesignDto } from "@systemboq/shared-types";

import { CtaBanner } from "../components/CtaBanner";
import { HouseSpecChips } from "../components/HouseSpecChips";
import { Pagination } from "../components/Pagination";
import { ImagePeek } from "../components/ImagePeek";
import { Reveal } from "../components/Reveal";
import { cardGridClass } from "../lib/card-grid";
import { listHouseDesigns } from "../lib/public-api";
import { CardGridSkeleton } from "../components/Skeleton";
import { usePageMeta } from "../lib/page-meta";
import { useUrlPage } from "../lib/use-url-page";

// 12 การ์ด = ลงตัวทั้งตะแกรง 2 และ 3 คอลัมน์ ไม่เหลือช่องว่างในแถวสุดท้าย (เท่าหน้าผลงาน)
const PAGE_SIZE = 12;

function HouseDesignCard({ d }: Readonly<{ d: HouseDesignDto }>) {
  // ภาพถ่ายจริงทั้งชุด (ภายนอก + ภายใน) — ไม่รวมแปลนบ้าน เพราะเป็นภาพเชิงเทคนิค คนละเรื่องกับ
  // การดูบ้าน หน้ารายละเอียดก็แยกส่วนแปลนไว้ต่างหากอยู่แล้ว
  const photos = [...(d.exteriorImages ?? []), ...(d.interiorImages ?? [])];
  const detailHref = `/house-designs/${d.id}`;
  // ให้การ์ดเป็นคนจับการชี้ ไม่ใช่ตัวรูป เพราะ overlay ที่ทับอยู่บนรูปกินอีเวนต์เมาส์ไปหมด
  const [hover, setHover] = useState(false);
  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* รูป + action ดู: hover ซูม + overlay ปุ่ม "ดูรายละเอียด" (ไอเดีย A) ทั้งรูปคลิกไปหน้ารายละเอียด */}
      <Link to={detailHref} className="relative block aspect-4/3 overflow-hidden bg-slate-100">
        {photos.length > 0 ? (
          <ImagePeek images={photos} alt={d.name} active={hover} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">
            ไม่มีรูปภาพ
          </div>
        )}
        {d.featured && (
          <span className="absolute left-3 top-3 rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-white shadow-sm">
            แนะนำ
          </span>
        )}
        <div className="absolute inset-0 flex items-end bg-linear-to-t from-black/60 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="m-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-800">
            ดูรายละเอียด →
          </span>
        </div>
      </Link>

      {/* ข้อมูล + action ขอราคา (ไอเดีย B) */}
      <div className="flex flex-1 flex-col p-4">
        {/* ก้อนเนื้อหาเป็นตัวดูดพื้นที่ว่างที่เหลือของการ์ด (flex-1) ไม่ใช่ให้ปุ่มดันตัวเองด้วย
            mt-auto — การ์ดในแถวเดียวกันสูงเท่ากันตามใบที่เนื้อหายาวสุด ใบนั้นจึงไม่เหลือที่ว่าง
            ให้ mt-auto ดันเลย ช่องไฟเหนือปุ่มกลายเป็น 0 ไปชนแถวชิปพอดี ส่วนใบที่เนื้อหาสั้น
            ได้ 24px — ต่างกันคนละเรื่องทั้งที่อยู่ข้างกัน · แบบนี้ทุกใบได้ช่องไฟเท่ากันเสมอ
            และยังเรียงปุ่มชิดขอบล่างตรงแนวกันเหมือนเดิม */}
        <div className="flex-1">
          <Link
            to={detailHref}
            className="flex min-h-11 items-center font-medium text-slate-800 transition-colors hover:text-brand lg:block lg:min-h-0"
          >
            {d.name}
          </Link>
          {d.description && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{d.description}</p>
          )}

          <HouseSpecChips d={d} />
        </div>

        {/* ช่องไฟเหนือปุ่ม (20px) จงใจให้มากกว่าระยะขอบล่างการ์ด (p-4 = 16px) เล็กน้อย
            ปุ่มจะได้อ่านเป็นของที่อยู่ท้ายการ์ด ไม่ใช่ของที่ห้อยต่อจากแถวชิป */}
        <Link
          to={`/contact?houseDesignId=${d.id}`}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md border border-brand px-3 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
        >
          ขอประเมินราคาแบบนี้
        </Link>
      </div>
    </article>
  );
}

export function HouseDesignsPage() {
  usePageMeta(
    "แบบบ้าน",
    "รวมแบบบ้านพร้อมจำนวนชั้น ห้องนอน ห้องน้ำ และพื้นที่ใช้สอย ดูภาพภายนอก ภายใน และแปลน ปรับแบบได้ตามต้องการ และขอประเมินราคาก่อสร้างฟรี",
  );
  const [designs, setDesigns] = useState<HouseDesignDto[]>([]);
  const [loading, setLoading] = useState(true);

  const { page, setPage, topRef } = useUrlPage();

  useEffect(() => {
    listHouseDesigns()
      .then((res) => setDesigns(res.houseDesigns))
      .finally(() => setLoading(false));
  }, []);

  const pageCount = Math.max(1, Math.ceil(designs.length / PAGE_SIZE));
  // ลิงก์เก่า/แบบบ้านถูกถอดจนหน้านั้นไม่มีแล้ว → แสดงหน้าสุดท้ายแทนตะแกรงว่าง
  const safePage = Math.min(page, pageCount);
  const pageItems = useMemo(
    () => designs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [designs, safePage],
  );

  return (
    // สูงเต็มจอ + คอลัมน์ ดัน CtaBanner/footer ลงล่างสุดเมื่อแบบบ้านมีไม่มาก
    <div className="flex min-h-[calc(100vh-4.5rem)] flex-col">
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
        <Reveal>
          <h1 className="text-2xl font-semibold text-slate-800">แบบบ้าน</h1>
          <p className="mt-1 mb-6 text-sm text-slate-500">
            เลือกแบบบ้านที่ถูกใจ ดูรายละเอียด หรือขอประเมินราคากับทีมงานได้ทันที
          </p>
        </Reveal>

        {loading && <CardGridSkeleton count={6} label="กำลังโหลดแบบบ้าน..." />}
        {!loading && designs.length === 0 && (
          <p className="text-slate-400">ยังไม่มีแบบบ้านให้เลือกชม</p>
        )}

        <div ref={topRef} className={`grid gap-6 ${cardGridClass(pageItems.length)}`}>
          {pageItems.map((d, i) => (
            <Reveal key={d.id} className="h-full" delay={i * 90}>
              <HouseDesignCard d={d} />
            </Reveal>
          ))}
        </div>
        <Pagination page={safePage} pageCount={pageCount} onChange={(n) => setPage(n)} className="mt-10" />
      </div>

      {/* ต่อจากตะแกรง — ตอบคำถามที่คนดูแบบบ้านถามจริงก่อนตัดสินใจ ("ต่อไปต้องทำยังไง"
          กับ "ปรับแบบได้ไหม") ส่วนนี้ไม่ขึ้นกับจำนวนแบบบ้านที่มี จึงเติมเนื้อหาให้หน้าได้
          แม้ตอนนี้จะมีแค่ 2 แบบ ซ่อนเมื่อยังไม่มีแบบบ้านเลย เพราะพูดถึง "แบบเหล่านี้" */}
      {!loading && designs.length > 0 && <BeforeYouDecide />}

      <CtaBanner />
    </div>
  );
}

const ORDER_STEPS = [
  {
    title: "เลือกแบบที่ถูกใจ",
    desc: "เลือกจากแบบที่มี แล้วบอกสิ่งที่อยากปรับ เช่น จำนวนห้อง ขนาดที่ดิน หรือการจัดวางห้อง",
  },
  {
    title: "ขอประเมินราคา",
    desc: "ทีมงานถอดปริมาณงานและวัสดุออกมาเป็นใบเสนอราคา ให้คุณตรวจสอบได้ทีละรายการ",
  },
  {
    title: "เริ่มก่อสร้าง",
    desc: "เมื่อตกลงราคาและลงนามสัญญาแล้ว เริ่มงานตามกำหนดการที่วางร่วมกัน",
  },
];

/**
 * ส่วนใต้ตะแกรงแบบบ้าน: หัวข้อ + คำชวนอยู่คอลัมน์ซ้าย · ขั้นตอนสั่งสร้างเรียงลงมาทางขวา
 *
 * เดิมเป็นสามคอลัมน์ข้อความลอย ๆ แล้วต่อด้วยกล่อง "ไม่เจอแบบที่ใช่?" แยกอีกกล่อง
 * ปัญหาคือขั้นตอนไม่มีอะไรบอกว่าเป็นลำดับ และกล่องล่างทำให้ส่วนนี้อ่านเป็นสองก้อนไม่เกี่ยวกัน
 * แบบสองคอลัมน์ยุบคำชวนเข้ามาอยู่ใต้หัวข้อ เหลือก้อนเดียว และการเรียงขั้นตอนลงแนวตั้ง
 * ทำให้ 1 → 2 → 3 อ่านเป็นลำดับตามธรรมชาติของการกวาดสายตา
 *
 * คงความกว้าง max-w-5xl ไว้เท่าตะแกรงการ์ดด้านบน ขอบซ้ายของหัวข้อจะได้ตรงแนวกับการ์ด
 *
 * ตัวเลขใช้ชุดเดียวกับหน้าบริการ (ไม่มีวงกลม · brand/70 · ไม่มีศูนย์นำหน้า) เพื่อให้ทั้งเว็บ
 * พูดภาษาเดียวกัน — ดูเหตุผลเรื่องคอนทราสต์ที่ ServicesPage
 *
 * ปุ่มจงใจเป็นปุ่มขอบบาง ไม่ใช่ปุ่มทึบ เพราะใต้ส่วนนี้คือ CtaBanner ซึ่งเป็นแถบไล่เฉดนาวี
 * พร้อมปุ่มขาวทึบอยู่แล้ว ถ้าทำสองเสียงดังติดกันจะกลายเป็นตะโกนซ้อนกัน
 *
 * พื้นหลัง `border-y border-slate-100 bg-slate-50` — **ชุดเดียวกับส่วน "บริการของเรา" ในหน้าแรกเป๊ะ**
 * (ผู้ใช้สั่งให้ใช้สีเดียวกันทั้งเว็บ) ของเดิมใช้ bg-slate-50/60 ซึ่งวัดจากพิกเซลจริงได้ #fbfcfd
 * ต่างจากขาวแค่ 1.027:1 คือมองไม่เห็นว่ามีแถบอยู่เลย ทั้งส่วนจึงดูเป็นพื้นขาวโล่ง ๆ
 * ตัวเต็ม (ไม่ใส่ /60) บวกเส้นขอบบน-ล่างจึงเป็นตัวบอกขอบเขตของแถบ
 *
 * **เนื้อหาวางบนพื้นตรง ๆ ไม่มีกรอบ/การ์ดครอบ** — เคยลองใส่แผงขาวลอยแล้วผู้ใช้ให้เอาออก
 * ถ้าจะกลับไปใส่ ต้องถามก่อน
 */
function BeforeYouDecide() {
  return (
    <section className="border-y border-slate-100 bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-14">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5 lg:self-start">
            <h2 className="text-xl font-semibold text-slate-800">สั่งสร้างจากแบบเหล่านี้อย่างไร</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              ตั้งแต่เลือกแบบจนถึงวันเริ่มก่อสร้าง มี 3 ขั้นตอน และไม่มีค่าใช้จ่ายจนกว่าจะตกลงราคากัน
            </p>

            <p className="mt-8 text-sm leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">ไม่เจอแบบที่ใช่?</span>{" "}
              ทุกแบบปรับแก้ได้ตามการใช้งานและขนาดที่ดินของคุณ หรือถ้าอยากได้แบบใหม่ทั้งหมด
              ทีมสถาปนิกออกแบบเฉพาะให้คุณได้
            </p>
            {/* ไปหน้าติดต่อเปล่า ๆ ไม่ส่งชนิดบริการไปเลือกไว้ล่วงหน้า — ContactPage มีหมายเหตุ
                กำกับไว้ว่าจงใจให้ช่อง "บริการที่สนใจ" เริ่มเป็นค่าว่าง เพราะการเลือกไว้ให้
                ทำให้คนส่งตัวเลือกที่ไม่ได้อ่านจริง */}
            <Link
              to="/contact"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-brand px-5 text-sm font-medium text-brand transition-colors hover:bg-brand hover:text-white"
            >
              ขอออกแบบเฉพาะ
            </Link>
          </Reveal>

          <Reveal className="lg:col-span-7">
            {/* Tailwind v4: divide-y = เส้นล่างของทุกใบที่ไม่ใช่ใบสุดท้าย ไม่ใช่เส้นบน */}
            <ol className="divide-y divide-slate-200">
              {ORDER_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                  <span className="w-5 shrink-0 text-lg font-semibold text-brand/70 tabular-nums">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-800">{s.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
