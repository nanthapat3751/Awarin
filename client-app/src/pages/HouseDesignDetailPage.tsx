import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { HouseDesignDto } from "@systemboq/shared-types";

import { FadeImage } from "../components/FadeImage";
import { HouseSpecList } from "../components/HouseSpecChips";
import { NaturalImage } from "../components/NaturalImage";
import { Reveal } from "../components/Reveal";
import { getHouseDesign } from "../lib/public-api";
import { HouseDesignDetailSkeleton } from "../components/Skeleton";
import { usePageMeta } from "../lib/page-meta";

/** ป้ายเหนือชื่อแบบบ้าน จากจำนวนชั้นที่กรอกไว้ — ไม่กรอก = ไม่มีป้าย (ไม่เดา) */
function houseFloorsEyebrow(d: HouseDesignDto): string {
  if (d.floors == null || d.floors < 1) return "";
  return d.floors === 1 ? "แบบบ้านชั้นเดียว" : `แบบบ้าน ${d.floors} ชั้น`;
}

/** คำอธิบายหน้าเมื่อแบบบ้านไม่มีคำบรรยาย: "บ้านพักอาศัย 2 ชั้น · 2 ชั้น 4 ห้องนอน 3 ห้องน้ำ พื้นที่ใช้สอย 220 ตร.ม. ..." */
function designSummary(d: HouseDesignDto): string {
  const spec = [
    d.floors ? `${d.floors} ชั้น` : null,
    d.bedrooms ? `${d.bedrooms} ห้องนอน` : null,
    d.bathrooms ? `${d.bathrooms} ห้องน้ำ` : null,
    d.area ? `พื้นที่ใช้สอย ${Number(d.area).toLocaleString("th-TH")} ตร.ม.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return `${d.name}${spec ? ` · ${spec}` : ""} ดูภาพและแปลน ปรับแบบได้ และขอประเมินราคาก่อสร้างฟรี`;
}

export function HouseDesignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [design, setDesign] = useState<HouseDesignDto | null>(null);
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

  // ชื่อแท็บ/ผลค้นหา = ชื่อแบบบ้านจริง · ไม่มีคำบรรยาย = ประกอบจากสเปก (คนค้นหาอยากรู้ขนาดก่อนกดเข้า)
  usePageMeta(
    loading ? undefined : (design?.name ?? "ไม่พบแบบบ้าน"),
    design ? (design.description ?? designSummary(design)) : undefined,
  );

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4.5rem)]">
        <HouseDesignDetailSkeleton />
      </div>
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
  const eyebrow = houseFloorsEyebrow(design);

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
                <div className="hero-item group" style={{ animationDelay: "0.14s" }}>
                  {/* key = เปลี่ยนรูปแล้วเริ่มใหม่: แสงวิ่ง → จางเข้า (แทน img-swap เดิม) */}
                  <FadeImage
                    key={photos[active]}
                    src={photos[active]}
                    alt={design.name}
                    className="h-72 rounded-xl sm:h-105"
                    imgClassName="group-hover:scale-105"
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
                        <FadeImage src={url} alt="" className="h-full w-full" />
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
                      <NaturalImage src={url} alt="แปลนบ้าน" className="rounded-lg border border-slate-200" />
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
              {/* แบบ B ใบสเปก (ผู้ใช้เลือก 16 ต.ค. 2569): ป้ายประเภท · ชื่อ · รายการสเปก · ปุ่มหลัก
                  (ปุ่มคู่ โทร/ส่งข้อความ ผู้ใช้สั่งถอดออก — เบอร์โทรอยู่ที่ฟุตเตอร์และหน้าติดต่อเรา) */}
              {eyebrow && <p className="text-xs font-semibold tracking-wide text-brand">{eyebrow}</p>}
              <h1 className={`${eyebrow ? "mt-1" : ""} text-xl font-semibold text-slate-800`}>{design.name}</h1>
              <HouseSpecList d={design} />

              <Link
                to={`/contact?houseDesignId=${design.id}`}
                className="mt-4 flex h-12 w-full items-center justify-center rounded-lg bg-brand px-4 text-center font-medium text-white transition-colors hover:bg-brand-dark"
              >
                สนใจแบบนี้ · ขอประเมินราคา
              </Link>

              <p className="mt-3 text-center text-xs text-slate-400">ทีมงานยินดีให้คำปรึกษาฟรี ไม่มีค่าใช้จ่าย</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
