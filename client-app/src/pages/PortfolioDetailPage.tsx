import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { PortfolioDto, PortfolioType } from "@systemboq/shared-types";

import { Reveal } from "../components/Reveal";
import { getPortfolioItem } from "../lib/public-api";
import { useParallax } from "../lib/use-parallax";

const TYPE_LABEL: Record<PortfolioType, string> = {
  DESIGN: "งานออกแบบ",
  CONSTRUCTION: "งานก่อสร้าง",
};

/**
 * รูปปกที่มี parallax — แยกเป็นคอมโพเนนต์ย่อยเพราะหน้านี้ return ก่อนโหลดเสร็จ
 * ถ้าเรียกฮุกในหน้าหลัก ตอน effect ทำงานจะยังไม่มี <img> ให้ผูก (ref ว่าง) parallax จะไม่ทำงาน
 */
function CoverImage({ src, alt }: Readonly<{ src: string; alt: string }>) {
  // ค่าเบากว่าค่าเริ่มต้นของฮุก: กรอบปกสูงแค่ 320-460px (เตี้ยกว่าจอ) ถ้าเลื่อนแรงจะเห็นขอบว่าง
  // ที่หัว/ท้ายกรอบตอนสกรอลล์ — ใช้ระยะเลื่อน 0.06 คู่กับการขยายรูปเผื่อขอบ 1.16 จึงพอดีทุกขนาดจอ
  const ref = useParallax<HTMLImageElement>(0.06, 1.16);
  return <img ref={ref} src={src} alt={alt} className="h-full w-full object-cover" />;
}

export function PortfolioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<PortfolioDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    getPortfolioItem(id)
      .then((res) => setItem(res.item))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="min-h-[calc(100vh-4.5rem)] px-4 py-12 text-slate-400">กำลังโหลด...</div>;
  }

  if (notFound || !item) {
    return (
      <div className="min-h-[calc(100vh-4.5rem)] px-4 py-12 text-slate-400">
        ไม่พบผลงานที่ต้องการ
      </div>
    );
  }

  const cover = item.images?.[0];
  const gallery = (item.images ?? []).slice(1);

  return (
    <div className="min-h-[calc(100vh-4.5rem)]">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          to="/portfolio"
          className="hero-item group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-brand hover:text-brand hover:shadow"
          style={{ animationDelay: "0.05s" }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
            aria-hidden
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          ผลงานของเรา
        </Link>

        {/* ปกเต็มกว้างมีชื่อ/ประเภททับ (สไตล์นิตยสาร) */}
        {cover ? (
          <div
            className="hero-item relative mt-4 overflow-hidden rounded-2xl bg-slate-100"
            style={{ animationDelay: "0.15s" }}
          >
            <div className="h-80 overflow-hidden sm:h-115">
              <CoverImage src={cover} alt={item.title} />
            </div>
            <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
              <span
                className="hero-item inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                style={{ animationDelay: "0.42s" }}
              >
                {TYPE_LABEL[item.type]}
              </span>
              <h1
                className="hero-item mt-2 text-3xl font-semibold text-white sm:text-4xl"
                style={{ animationDelay: "0.54s" }}
              >
                {item.title}
              </h1>
            </div>
          </div>
        ) : (
          <div className="hero-item mt-4" style={{ animationDelay: "0.15s" }}>
            <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              {TYPE_LABEL[item.type]}
            </span>
            <h1 className="mt-2 text-3xl font-semibold text-slate-800">{item.title}</h1>
          </div>
        )}

        {/* คำบรรยายเป็นย่อหน้านำ (lead) ตัวใหญ่อ่านสบาย */}
        {item.description && (
          <Reveal>
            <p className="mt-8 max-w-3xl text-lg leading-relaxed text-slate-600">
              {item.description}
            </p>
          </Reveal>
        )}

        {/* รูปที่เหลือ — กริดเว้นช่องกว้างแบบนิตยสาร */}
        {gallery.length > 0 && (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {gallery.map((url, i) => (
              <Reveal key={url} delay={i * 90}>
                <div className="overflow-hidden rounded-xl border border-slate-100">
                  <img
                    src={url}
                    alt={item.title}
                    className="w-full transition-transform duration-500 hover:scale-105"
                  />
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
