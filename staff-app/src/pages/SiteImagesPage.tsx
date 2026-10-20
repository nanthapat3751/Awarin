import {
  SITE_IMAGE_PAGES,
  SITE_IMAGE_SLOTS,
  isSafeImageUrl,
  resolveSiteImageSlot,
  siteImagePageOf,
  type SiteImageSlot,
} from "@systemboq/shared-types";
import { AlertTriangle, ExternalLink, ImageOff, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { API_BASE, ApiError } from "../lib/api";
import { getSettings, updateSettings } from "../lib/settings-api";
import { useToast } from "../lib/toast-context";
import { uploadImage } from "../lib/uploads-api";
import { CardGridSkeleton } from "../components/Skeleton";

// เว็บลูกค้ารันคนละพอร์ตกับแอปพนักงาน — ใช้ลิงก์ไปดูหน้าจริงหลังเปลี่ยนรูป
const CLIENT_BASE = import.meta.env.VITE_CLIENT_BASE_URL ?? "http://localhost:5174";

/**
 * สัดส่วนที่ "เว็บจริง" ครอบรูปในแต่ละจุด ใช้วาดกรอบครอบชั้นในของพรีวิว
 * ทุกจุดบนเว็บลูกค้าใช้ object-cover ทั้งหมด พรีวิวจึงต้องครอบด้วยสัดส่วนเดียวกัน
 * ไม่งั้นพนักงานเห็นรูปเต็มใบในพรีวิวแล้วไปโดนตัดบนเว็บจริง
 *
 * banner = แบนเนอร์เต็มจอ (หน้าแรก/หน้าบริการ) · wide = ส่วนเกี่ยวกับเรา + ขั้นตอน 1-3 (aspect-16/10)
 * portrait = ส่วนงานออกแบบ (aspect-4/5) · tall = การ์ดบริการหน้าแรก (aspect-3/4 บนจอกว้าง)
 */
const CROP: Record<SiteImageSlot["aspect"], { className: string; ratio: number }> = {
  banner: { className: "aspect-16/9", ratio: 16 / 9 },
  wide: { className: "aspect-16/10", ratio: 16 / 10 },
  portrait: { className: "aspect-4/5", ratio: 4 / 5 },
  tall: { className: "aspect-3/4", ratio: 3 / 4 },
  hex: { className: "aspect-[23/20]", ratio: 1.15 },
  box: { className: "aspect-6/5", ratio: 6 / 5 },
};

/** เตือนเมื่อรูปที่อัปมาสัดส่วนเพี้ยนจากกรอบเกินเท่านี้ — ต่ำกว่านี้ครอบแล้วแทบไม่เสียอะไร */
const RATIO_TOLERANCE = 1.25;

/**
 * รูปในพรีวิวมาจากไหน — ลำดับเดียวกับเว็บลูกค้า:
 * ที่ตั้งไว้ > ที่เว็บหยิบมาเอง > รูปของช่องที่ยืมมา (fallbackKey) > รูปเริ่มต้นของช่อง
 */
type ImageSource = "custom" | "auto" | "borrowed" | "fallback" | "empty";

const SOURCE_BADGE: Record<ImageSource, { label: string; className: string }> = {
  custom: { label: "ใช้รูปที่อัปเอง", className: "bg-emerald-100 text-emerald-800" },
  auto: { label: "ใช้รูปแบบบ้านอัตโนมัติ", className: "bg-sky-100 text-sky-800" },
  // ข้อความจริงบอกชื่อช่องที่ยืมมา (badgeLabelOf) — ตรงนี้เป็นค่าสำรอง
  borrowed: { label: "ใช้รูปจากช่องอื่น", className: "bg-sky-100 text-sky-800" },
  fallback: { label: "ใช้รูปเริ่มต้น", className: "bg-slate-200 text-slate-600" },
  empty: { label: "ว่าง", className: "bg-slate-200 text-slate-600" },
};

function imageSourceOf(slot: SiteImageSlot, value: string, autoImage: string): ImageSource {
  if (isSafeImageUrl(value)) return "custom";
  if (slot.autoFromContent === true && isSafeImageUrl(autoImage)) return "auto";
  if (slot.fallbackKey && isSafeImageUrl(autoImage)) return "borrowed";
  return slot.fallback ? "fallback" : "empty";
}

/** เส้นทางรูปที่จะแสดงตามแหล่งที่มา (ยังไม่ต่อโดเมน) */
function rawImageOf(source: ImageSource, slot: SiteImageSlot, value: string, autoImage: string): string {
  if (source === "custom") return value.trim();
  if (source === "auto" || source === "borrowed") return autoImage;
  return slot.fallback;
}

/** คำเตือนเมื่อสัดส่วนรูปเพี้ยนจากกรอบที่เว็บจะครอบเกิน RATIO_TOLERANCE · null = ไม่ต้องเตือน */
function cropWarningOf(natural: { w: number; h: number } | null, cropRatio: number): string | null {
  if (!natural || natural.h <= 0) return null;
  const actual = natural.w / natural.h;
  const wider = actual > cropRatio;
  const off = wider ? actual / cropRatio : cropRatio / actual;
  if (off <= RATIO_TOLERANCE) return null;
  // ขนาดที่แนะนำบอกไว้บรรทัดบนแล้ว ไม่ต้องพูดซ้ำ — คำเตือนยาวเกินจะดันการ์ดสูงกว่าใบอื่นเกือบ 100px
  return `รูป ${natural.w} × ${natural.h} px จะถูกครอบ${wider ? "ซ้าย-ขวา" : "บน-ล่าง"}ออก`;
}

/** รูปที่เว็บใช้แทนเมื่อช่องนี้ยังไม่ได้ตั้ง: รูปผลงานเด่นอัตโนมัติ หรือรูปของช่องที่ยืมมา */
function autoImageOf(slot: SiteImageSlot, settings: Record<string, string>, featuredWorkImages: string[]): string {
  // แถบรูปหน้าเกี่ยวกับเรา: ว่าง = รูปแรกของผลงานเด่นลำดับเดียวกัน (ตรงกับที่ AboutPage ทำ)
  const gallery = /^siteAboutGallery(\d)$/.exec(slot.key);
  if (gallery) return featuredWorkImages[Number(gallery[1]) - 1] ?? "";
  // ไล่ตามทอดเดียวกับเว็บลูกค้า (resolveSiteImageSlot) — ยืมแค่ชั้นเดียวพรีวิวจะบอก "ว่าง" ทั้งที่หน้าจริงมีรูป
  return slot.fallbackKey ? resolveSiteImageSlot(settings, slot.fallbackKey) : "";
}

/** ป้ายบนพรีวิว — รูปที่ยืมมาบอกว่ายืมจากช่องไหน (มีหลายต้นทางแล้ว ไม่ใช่แค่หน้าบริการ) */
function badgeLabelOf(source: ImageSource, slot: SiteImageSlot): string {
  if (source === "auto" && slot.autoLabel) return slot.autoLabel;
  if (source !== "borrowed") return SOURCE_BADGE[source].label;
  // ชื่อช่องบอกแค่ตำแหน่งในหน้า (หัวกลุ่มบอกหน้า) — ยืมข้ามหน้าต้องบอกชื่อหน้าด้วย ไม่งั้นหาไม่เจอว่ามาจากไหน
  const from = SITE_IMAGE_SLOTS.find((s) => s.key === slot.fallbackKey);
  return from ? `ยืมรูป: ${siteImagePageOf(from).name} · ${from.label}` : SOURCE_BADGE.borrowed.label;
}

function uploadLabel(saving: boolean, usingCustom: boolean): string {
  if (saving) return "กำลังบันทึก...";
  return usingCustom ? "เปลี่ยนรูป" : "อัปโหลดรูป";
}

/** หนึ่งช่องรูปในคลัง — พรีวิว + ปุ่มอัปโหลด + ปุ่มเอารูปออก */
function SlotCard({
  slot,
  value,
  autoImage,
  saving,
  onPick,
  onClear,
}: Readonly<{
  slot: SiteImageSlot;
  value: string;
  /** รูปที่เว็บหยิบมาแสดงเองเมื่อยังไม่ได้ตั้งค่า (ช่องที่ autoFromContent หรือรูปของช่อง fallbackKey) */
  autoImage: string;
  saving: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [broken, setBroken] = useState(false);
  // ขนาดจริงของไฟล์ที่โหลดขึ้นมา ใช้เตือนเมื่อสัดส่วนไม่ตรงกับกรอบที่เว็บจะครอบ
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  // ลำดับเดียวกับที่เว็บลูกค้าใช้จริง: ค่าที่ตั้งไว้ (ถ้าปลอดภัย) > รูปที่เว็บหยิบมาเอง > รูปเริ่มต้นของช่อง
  // ถ้าไม่ไล่ตามลำดับนี้ พรีวิวจะบอกว่า "ว่าง" ทั้งที่หน้าจริงมีรูปแสดงอยู่
  const source = imageSourceOf(slot, value, autoImage);
  const usingCustom = source === "custom";
  const raw = rawImageOf(source, slot, value, autoImage);
  // รูปเริ่มต้นเป็นเส้นทางในเว็บลูกค้า (เช่น /web12.jpg) ซึ่งอยู่คนละพอร์ตกับแอปพนักงาน
  // ถ้าใส่ตรง ๆ เบราว์เซอร์จะไปหาที่ 5173 แล้วไม่เจอ พรีวิวจึงขึ้น "โหลดรูปไม่สำเร็จ"
  const shown = raw.startsWith("/") ? `${CLIENT_BASE}${raw}` : raw;

  useEffect(() => {
    setBroken(false);
    setNatural(null);
  }, [shown]);

  // เตือนเฉพาะรูปที่พนักงานอัปเอง — รูปเริ่มต้น/รูปอัตโนมัติไม่ใช่สิ่งที่เขาเพิ่งเลือก เตือนไปก็เป็นเสียงรบกวน
  const crop = CROP[slot.aspect];
  const cropWarning = usingCustom ? cropWarningOf(natural, crop.ratio) : null;
  const badge = SOURCE_BADGE[source];

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
      {/*
        กรอบพรีวิวสูงเท่ากันทุกใบ — รูปต้องวางแบบ absolute ทั้งหมด ห้ามปล่อยไว้ในสายธารเอกสาร
        เพราะการ์ดเป็น flex column กล่องลูกจึงมี min-height:auto ตามเนื้อหา รูปจะ "ดัน" กรอบให้สูง
        เกินสัดส่วนที่สั่งไว้ (วัดจริง: รูปแนวตั้ง 800×1400 ดันจาก 200px เป็น 622px แล้วลากทั้งแถวสูงตาม)
      */}
      <div className="relative aspect-16/9 w-full shrink-0 bg-slate-100">
        <div className="absolute inset-0 flex items-center justify-center">
          {shown && !broken ? (
            <div className={`relative h-full overflow-hidden ${crop.className}`}>
              <img
                src={shown}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onLoad={(e) =>
                  setNatural({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                onError={() => setBroken(true)}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <ImageOff size={22} aria-hidden />
              <span className="text-xs">{broken ? "โหลดรูปไม่สำเร็จ" : "ยังไม่มีรูป"}</span>
            </div>
          )}
        </div>
        <span
          title={badgeLabelOf(source, slot)}
          className={`absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badgeLabelOf(source, slot)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-medium text-slate-800">{slot.label}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {slot.page} · แนะนำ {slot.recommended}
          </p>
        </div>
        {cropWarning && (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-700">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>{cropWarning}</span>
          </p>
        )}
        {slot.note && <p className="text-xs leading-relaxed text-slate-500">{slot.note}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPick(file);
              e.target.value = "";
            }}
          />
          <Button size="sm" disabled={saving} onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> {uploadLabel(saving, usingCustom)}
          </Button>
          {usingCustom && (
            <Button size="sm" variant="dangerQuiet" disabled={saving} onClick={onClear}>
              เอารูปออก
            </Button>
          )}
          <a
            href={`${CLIENT_BASE}${slot.href}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            ดูหน้าจริง <ExternalLink size={12} aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * คลังรูปเว็บไซต์ — รวมทุกช่องรูปของเว็บลูกค้าที่พนักงานเปลี่ยนเองได้ไว้ที่เดียว
 *
 * ก่อนหน้านี้รูปพวกนี้ถูกฮาร์ดโค้ดไว้ในโค้ด (`/web12.jpg`, `/services-hero.jpg`) และบางช่องยัง
 * เป็นกล่องเปล่าที่ไม่เคยใส่รูปเลย การเปลี่ยนรูปจึงต้องแก้โค้ดหรือวางไฟล์ลงโฟลเดอร์เอง
 *
 * ทะเบียนช่องอยู่ที่ `@systemboq/shared-types` → `SITE_IMAGE_SLOTS` (แหล่งความจริงแหล่งเดียว
 * ที่เซิร์ฟเวอร์ใช้กำหนดคีย์ที่บันทึกได้ และเว็บลูกค้าใช้ตอนอ่านค่า)
 *
 * ไม่มีปุ่ม "บันทึก" — เลือกไฟล์แล้วอัปโหลดและบันทึกให้เลย เพราะหนึ่งช่องมีค่าเดียว
 * ไม่มีอะไรให้กรอกค้างไว้ ต่างจากหน้าตั้งค่าที่มีหลายช่องต้องกรอกพร้อมกัน
 */
export function SiteImagesPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  // รูปแรกของผลงานเด่น 4 ลำดับแรก — ค่าอัตโนมัติของแถบรูปหน้าเกี่ยวกับเรา (ยิง endpoint สาธารณะตัวเดียวกับเว็บลูกค้า)
  const [featuredWorkImages, setFeaturedWorkImages] = useState<string[]>([]);

  useEffect(() => {
    getSettings()
      .then((res) => setSettings(res.settings))
      .catch((err) => setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));

    fetch(`${API_BASE}/api/public/portfolio/featured?limit=4`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const list: { images?: string[] | null }[] = body?.portfolio ?? [];
        setFeaturedWorkImages(list.map((p) => p.images?.[0] ?? "").slice(0, 4));
      })
      .catch(() => undefined);
  }, []);

  async function save(key: string, url: string) {
    setSavingKey(key);
    try {
      const res = await updateSettings({ [key]: url });
      setSettings(res.settings);
      toast.success(url ? "เปลี่ยนรูปแล้ว" : "เอารูปออกแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingKey(null);
    }
  }

  async function pick(key: string, file: File) {
    setSavingKey(key);
    try {
      const { url } = await uploadImage(file);
      // อัปโหลดสำเร็จแล้วค่อยบันทึกค่า — ถ้าอัปไม่ผ่านจะไม่ไปแตะค่าเดิม
      const res = await updateSettings({ [key]: url });
      setSettings(res.settings);
      toast.success("เปลี่ยนรูปแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setSavingKey(null);
    }
  }

  const usedCount = SITE_IMAGE_SLOTS.filter((s) => isSafeImageUrl(settings[s.key])).length;
  // กลุ่มตามหน้า เรียงตามเมนูเว็บลูกค้า · ภายในกลุ่มเรียงตามทะเบียน (บนลงล่างของหน้านั้น)
  const groups = SITE_IMAGE_PAGES.map((pg) => {
    const slots = SITE_IMAGE_SLOTS.filter((s) => siteImagePageOf(s).id === pg.id);
    return { ...pg, slots, used: slots.filter((s) => isSafeImageUrl(settings[s.key])).length };
  }).filter((g) => g.slots.length > 0);

  return (
    <Layout>
      <PageHeader
        title="คลังรูปเว็บไซต์"
        subtitle="รูปภาพทุกจุดบนเว็บฝั่งลูกค้าที่เปลี่ยนได้จากที่นี่ — อัปโหลดแล้วเว็บจะเปลี่ยนทันที ไม่ต้องแก้โค้ด (รองรับ JPEG / PNG / WEBP ไม่เกิน 5 MB)"
      />

      {loading && <CardGridSkeleton count={6} />}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          {/* แบ่งตามหน้าเว็บ (ผู้ใช้สั่ง — เดิมการ์ด 20 ใบเรียงต่อกัน หาไม่เจอว่ารูปไหนอยู่หน้าไหน
              และ "ภาพส่วนเกี่ยวกับเรา" ของหน้าแรกชื่อชนกับหน้าเกี่ยวกับเรา) · ทางลัดด้านบนกระโดดไปทีละหน้า */}
          <nav aria-label="ไปที่หน้า" className="mb-5 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-slate-500">
              ตั้งรูปเองแล้ว {usedCount} จาก {SITE_IMAGE_SLOTS.length} จุด ·
            </span>
            {groups.map((g) => (
              <a
                key={g.id}
                href={`#page-${g.id}`}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                {g.name} <span className="text-xs text-slate-400 tabular-nums">{g.slots.length}</span>
              </a>
            ))}
          </nav>
          <div className="flex flex-col gap-10">
            {groups.map((g) => (
              <section key={g.id} id={`page-${g.id}`} aria-labelledby={`page-${g.id}-title`} className="scroll-mt-20">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
                  <h2 id={`page-${g.id}-title`} className="text-base font-semibold text-slate-900">
                    {g.name}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      · {g.slots.length} รูป · ตั้งเองแล้ว {g.used}
                    </span>
                  </h2>
                  <a
                    href={`${CLIENT_BASE}${g.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
                  >
                    เปิด{g.name} <ExternalLink size={12} aria-hidden />
                  </a>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {g.slots.map((slot) => (
                    <SlotCard
                      key={slot.key}
                      slot={slot}
                      value={settings[slot.key] ?? ""}
                      autoImage={autoImageOf(slot, settings, featuredWorkImages)}
                      saving={savingKey === slot.key}
                      onPick={(file) => pick(slot.key, file)}
                      onClear={() => save(slot.key, "")}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </Layout>
  );
}
