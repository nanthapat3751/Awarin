import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { HouseDesignDto } from "@systemboq/shared-types";

import { HouseSpecChipsLarge } from "../components/HouseSpecChips";
import { Reveal } from "../components/Reveal";
import { getHouseDesign, getPublicSettings } from "../lib/public-api";
import { lineHref as toLineHref } from "../lib/safe-url";

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function LineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M12 3C6.48 3 2 6.58 2 11c0 2.53 1.5 4.78 3.86 6.25-.13.9-.6 2.2-.7 2.53-.13.42.16.42.33.31.13-.09 2.02-1.34 2.86-1.9.5.07 1.02.1 1.55.1 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
    </svg>
  );
}

export function HouseDesignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [design, setDesign] = useState<HouseDesignDto | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // รูปที่กำลังแสดงในแกลเลอรีหลัก (index ในลิสต์รูปภาพถ่ายจริง)
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!id) return;
    getHouseDesign(id)
      .then((res) => {
        setDesign(res.houseDesign);
        setActive(0);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    getPublicSettings()
      .then((res) => setSettings(res.settings))
      .catch(() => undefined);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4.5rem)] px-4 py-12 text-slate-400">กำลังโหลด...</div>
    );
  }

  if (notFound || !design) {
    return (
      <div className="min-h-[calc(100vh-4.5rem)] px-4 py-12 text-slate-400">
        ไม่พบแบบบ้านที่ต้องการ
      </div>
    );
  }

  // แกลเลอรีหลัก = ภาพถ่ายจริง (ภายนอก + ภายใน) — แปลนบ้านแยกโชว์ด้านล่างเพราะเป็นภาพเชิงเทคนิค
  const photos = [...(design.exteriorImages ?? []), ...(design.interiorImages ?? [])];
  const lineHref = toLineHref(settings.companyLine);

  return (
    <div className="min-h-[calc(100vh-4.5rem)]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          to="/house-designs"
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
          กลับไปหน้าแบบบ้าน
        </Link>

        <div className="mt-4 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* ---------- ซ้าย: แกลเลอรี + เนื้อหา ---------- */}
          <div className="lg:col-span-2">
            {photos.length > 0 ? (
              <>
                <div
                  className="hero-item group h-72 overflow-hidden rounded-xl bg-slate-100 sm:h-105"
                  style={{ animationDelay: "0.14s" }}
                >
                  <img
                    key={photos[active]}
                    src={photos[active]}
                    alt={design.name}
                    className="img-swap h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                </div>
                {photos.length > 1 && (
                  <div
                    className="hero-item mt-3 flex gap-2 overflow-x-auto pb-1"
                    style={{ animationDelay: "0.24s" }}
                  >
                    {photos.map((url, i) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setActive(i)}
                        aria-label={`ดูรูปที่ ${i + 1}`}
                        className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                          i === active
                            ? "border-brand"
                            : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div
                className="hero-item flex h-72 items-center justify-center rounded-xl bg-slate-100 text-slate-300 sm:h-105"
                style={{ animationDelay: "0.14s" }}
              >
                ไม่มีรูปภาพ
              </div>
            )}

            {design.description && (
              <Reveal>
                <section className="mt-8">
                  <h2 className="text-lg font-semibold text-slate-800">รายละเอียด</h2>
                  <p className="mt-2 leading-relaxed text-slate-600">{design.description}</p>
                </section>
              </Reveal>
            )}

            {design.plans && design.plans.length > 0 && (
              <section className="mt-8">
                <Reveal>
                  <h2 className="text-lg font-semibold text-slate-800">แปลนบ้าน</h2>
                </Reveal>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {design.plans.map((url, i) => (
                    <Reveal key={url} delay={i * 90}>
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <img
                          src={url}
                          alt="แปลนบ้าน"
                          className="w-full transition-transform duration-500 hover:scale-105"
                        />
                      </div>
                    </Reveal>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* ---------- ขวา: การ์ดสเปก + CTA (ติดขวาเมื่อเลื่อน) ---------- */}
          <aside className="lg:col-span-1">
            <div
              className="hero-item rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6"
              style={{ animationDelay: "0.3s" }}
            >
              <h1 className="text-xl font-semibold text-slate-800">{design.name}</h1>
              <HouseSpecChipsLarge d={design} />

              <div className="my-4 border-t border-slate-100" />

              <Link
                to={`/contact?houseDesignId=${design.id}`}
                className="flex w-full items-center justify-center rounded-lg bg-brand px-4 py-3 font-medium text-white transition-colors hover:bg-brand-dark"
              >
                สนใจแบบนี้ · ขอประเมินราคา
              </Link>

              {settings.companyPhone && (
                <a
                  href={`tel:${settings.companyPhone}`}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand hover:text-brand"
                >
                  <PhoneIcon /> โทร {settings.companyPhone}
                </a>
              )}
              {settings.companyLine && (
                <a
                  href={lineHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-500 hover:text-emerald-600"
                >
                  <LineIcon /> แชทผ่าน LINE
                </a>
              )}

              <p className="mt-3 text-center text-xs text-slate-400">
                ทีมงานยินดีให้คำปรึกษาฟรี ไม่มีค่าใช้จ่าย
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
