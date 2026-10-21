import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import {
  isPreviewableAttachment,
  type AttachmentKind,
  type CustomerAttachmentDto,
  type CustomerQuoteDetailDto,
  type QuoteStatus,
} from "@systemboq/shared-types";

import { PortalPage } from "../components/PortalPage";
import { ApiError } from "../lib/api";
import { pdfViewerPath } from "../lib/document-pdf";
import { useConfirm } from "../lib/confirm-context";
import {
  downloadMyAttachment,
  getMyQuote,
  myAttachmentPreviewUrl,
  respondToQuote,
} from "../lib/my-api";
import { DocumentSkeleton } from "../components/Skeleton";
import { usePageMeta } from "../lib/page-meta";

const ATTACH_KIND_LABEL: Record<AttachmentKind, string> = {
  DESIGN: "แบบ",
  QUOTE: "ใบเสนอราคา",
  OTHER: "เอกสาร",
};

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "ร่าง",
  SENT: "รอการตอบรับ",
  ACCEPTED: "ยอมรับแล้ว",
  REJECTED: "ปฏิเสธแล้ว",
  REVISED: "ขอปรับแก้",
};

// pill ที่ใช้สีบอกสถานะ เพื่อให้อ่านสถานะได้ในพริบตาแทนที่จะเป็นตัวอักษรเทาธรรมดา
const STATUS_BADGE: Record<QuoteStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  SENT: "bg-blue-50 text-blue-700 border-blue-200",
  ACCEPTED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  REVISED: "bg-amber-50 text-amber-700 border-amber-200",
};

// เหตุผลสำเร็จรูปตอนปฏิเสธ — ข้อมูลที่มีค่าที่สุดตอนเสียดีลคือ "ทำไม" เดิมฝั่งบริษัทเห็นแค่
// คำว่าปฏิเสธลอย ๆ เพราะช่องหมายเหตุถูกบังคับเฉพาะตอนขอปรับแก้เท่านั้น
const REJECT_REASONS = [
  "ราคาสูงเกินงบที่ตั้งไว้",
  "เลื่อนโครงการออกไปก่อน",
  "เลือกผู้รับเหมารายอื่น",
  "แบบ/รายละเอียดงานไม่ตรงกับที่ต้องการ",
] as const;
const OTHER_REASON = "อื่น ๆ";

const BACK_TO_QUOTES = { to: "/my/quotes", label: "ใบเสนอราคาทั้งหมด" };

function money(value: string | number): string {
  return Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * วันตามปฏิทิน (YYYY-MM-DD) เช่น วันยืนราคา — ประกอบเป็นเที่ยงคืน "เวลาเครื่อง" ก่อนจัดรูป
 * ถ้าส่งสตริงตรง ๆ เข้า new Date() จะได้เที่ยงคืน UTC แล้ววันเลื่อนบนเครื่องที่เขตเวลาติดลบ
 */
function formatDay(iso: string): string {
  // รูปแบบเดียวกับ formatDate ("10 พ.ย. 2569") — สองบรรทัดนี้วางซ้อนกันในการ์ดราคา
  return new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── ไอคอน (inline SVG — client-app ไม่ได้ใช้ไลบรารีไอคอน) ──
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function DownloadIcon() {
  return (
    <svg {...iconProps} width="16" height="16">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg {...iconProps} width="16" height="16">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** ลูกศรขวาท้ายปุ่ม "ไปต่อ" — ขยับตามเมาส์เล็กน้อยให้รู้ว่าเป็นปุ่มพาไปหน้าอื่น */
function GoIcon() {
  return (
    <svg {...iconProps} width="16" height="16" className="transition-transform group-hover:translate-x-0.5">
      <path d="M5 12h14" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/** ไอคอนไฟล์แยกตามชนิด — รูปได้ไอคอนภาพ ที่เหลือได้ไอคอนเอกสาร */
function FileTypeIcon({ fileName, small = false }: Readonly<{ fileName: string; small?: boolean }>) {
  const isImage = /\.(jpe?g|png|webp)$/i.test(fileName);
  return (
    <span
      className={`flex shrink-0 items-center justify-center text-slate-500 ${
        small ? "h-5 w-5" : "h-9 w-9 rounded-lg bg-slate-100"
      }`}
    >
      {isImage ? (
        <svg {...iconProps} width="18" height="18">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      ) : (
        <svg {...iconProps} width="18" height="18">
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
          <path d="M9.5 12.5h5M9.5 16h5" />
        </svg>
      )}
    </span>
  );
}

/** ป้ายส่วนลด: "ส่วนลด (5%) — หมายเหตุ" */
function discountText(pct: string | number | null, note: string | null): string {
  const pctPart = pct == null ? "" : ` (${Number(pct)}%)`;
  const notePart = note ? ` — ${note}` : "";
  return `ส่วนลด${pctPart}${notePart}`;
}

/** ค้นรายการงาน: ชื่อหรือรหัสมีคำค้น (ไม่สนตัวพิมพ์เล็ก/ใหญ่ของอังกฤษ) */
function itemMatches(item: { name: string; code: string | null }, query: string): boolean {
  return item.name.toLowerCase().includes(query) || (item.code ?? "").toLowerCase().includes(query);
}

/** ไฮไลต์คำที่ค้นในชื่อรายการ — ตัดสตริงเอง ไม่ใช้ regex (คำค้นมีอักขระพิเศษได้ เช่น "300x600" หรือวงเล็บ) */
function Highlight({ text, query }: Readonly<{ text: string; query: string }>) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(query);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-amber-100 text-inherit">
        {text.slice(at, at + query.length)}
      </mark>,
    );
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

function SearchIcon() {
  return (
    <svg {...iconProps} width="16" height="16">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** เหตุผลที่ปฏิเสธ + รายละเอียด (ถ้ามี) รวมเป็นข้อความเดียวลงช่องหมายเหตุเดิม */
function rejectNoteOf(reason: string, detail: string): string {
  const trimmed = detail.trim();
  return trimmed ? `${reason}: ${trimmed}` : reason;
}

type QuoteGroup = CustomerQuoteDetailDto["groups"][number];

/** หมวดที่แสดง — ระหว่างค้น ยอดหัวหมวด = ผลรวมเฉพาะรายการที่เจอ (ยอดทั้งหมวดคู่กับ "พบ 3 รายการ" จะชวนเข้าใจผิด) */
function groupsShown(groups: QuoteGroup[], searchQuery: string) {
  if (searchQuery.length === 0) return groups.map((g) => ({ ...g, total: g.items.length }));
  return groups
    .map((g) => {
      const items = g.items.filter((it) => itemMatches(it, searchQuery));
      return { ...g, items, subtotal: String(items.reduce((sum, it) => sum + Number(it.lineTotal), 0)), total: g.items.length };
    })
    .filter((g) => g.items.length > 0);
}

/** ยืนราคาถึงเมื่อไร (เฉพาะใบที่ยังตอบได้) · ตอบกลับไปเมื่อไร */
function QuoteDates({ quote, showValidity }: Readonly<{ quote: CustomerQuoteDetailDto; showValidity: boolean }>) {
  const validUntil = showValidity ? quote.validUntil : null;
  if (!validUntil && !quote.respondedAt) return null;
  const validity = quote.expired
    ? { className: "font-medium text-red-600", label: "พ้นกำหนดยืนราคาเมื่อ" }
    : { className: "text-slate-500", label: "ยืนราคาถึง" };
  return (
    <p className="mt-2 flex flex-col items-end gap-0.5 text-xs">
      {validUntil && (
        <span className={validity.className}>
          {validity.label} {formatDay(validUntil)}
        </span>
      )}
      {quote.respondedAt && <span className="text-slate-500">คุณตอบกลับเมื่อ {formatDate(quote.respondedAt)}</span>}
    </p>
  );
}

/** ยอดก่อนลด + ส่วนลด + ส่วนลดปัดเศษ — ไม่มีส่วนลดเลยไม่แสดง (ใบธรรมดาไม่ต้องมีบรรทัดที่บวกแล้วได้เลขเดิม) */
function ReductionLines({ quote, beforeDiscount }: Readonly<{ quote: CustomerQuoteDetailDto; beforeDiscount: number }>) {
  const discountAmt = Number(quote.discountAmt);
  const roundingAmt = Number(quote.roundingAmt);
  if (discountAmt <= 0 && roundingAmt <= 0) return null;
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <dt>รวมมูลค่างาน</dt>
        <dd className="tabular-nums">{money(beforeDiscount)}</dd>
      </div>
      {/* ส่วนลดเป็นสีเขียวเพราะเป็นข่าวดีของลูกค้า แยกจากบรรทัดยอดอื่นได้ทันที
          (เขียวบนพื้นขาวต้องลงถึง 700 คอนทราสต์ถึงจะผ่าน) */}
      {discountAmt > 0 && (
        <div className="flex items-baseline justify-between gap-3 text-emerald-700">
          <dt>{discountText(quote.discountPct, quote.discountNote)}</dt>
          <dd className="tabular-nums">-{money(quote.discountAmt)}</dd>
        </div>
      )}
      {roundingAmt > 0 && (
        <div className="flex items-baseline justify-between gap-3 text-emerald-700">
          <dt>ส่วนลดปัดเศษ</dt>
          <dd className="tabular-nums">-{money(quote.roundingAmt)}</dd>
        </div>
      )}
    </>
  );
}

export function MyQuoteDetailPage() {
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<CustomerQuoteDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectDetail, setRejectDetail] = useState("");
  // id ของไฟล์ที่กำลังดาวน์โหลดอยู่ — ไฟล์แนบใหญ่ได้ถึง 20MB ถ้าไม่บอกอะไรเลยผู้ใช้จะกดซ้ำ
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  // กลุ่มเริ่มต้นแบบปิดไว้ เพื่อให้หน้าพอดีหนึ่งหน้าจอไม่ว่าใบเสนอราคาจะยาวแค่ไหน
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  // ค้นรายการงาน — ระหว่างค้นทุกหมวดที่มีรายการตรงจะกางเอง ล้างคำค้นแล้วกลับไปสภาพกาง/พับเดิม
  const [itemSearch, setItemSearch] = useState("");
  const itemsBoxRef = useRef<HTMLDivElement | null>(null);
  const priceBlockRef = useRef<HTMLDivElement | null>(null);
  const [priceBlockVisible, setPriceBlockVisible] = useState(true);

  const allGroupsOpen = (quote?.groups.length ?? 0) > 0 && quote!.groups.every((g) => openGroups.has(g.code));

  function toggleGroup(code: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleAllGroups() {
    setOpenGroups(allGroupsOpen ? new Set() : new Set((quote?.groups ?? []).map((g) => g.code)));
  }

  // แถบลอยจะปรากฏก็ต่อเมื่อบล็อกราคาจริงเลื่อนพ้นจอไปแล้ว ใบเสนอราคาสั้น ๆ จึงไม่แสดงตัวเลข
  // เดียวกันซ้ำสองครั้ง
  useEffect(() => {
    const el = priceBlockRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPriceBlockVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [quote]);

  async function handleDownloadAttachment(attachment: CustomerAttachmentDto) {
    if (!id) return;
    setDownloadingId(attachment.id);
    setAttachError(null);
    try {
      await downloadMyAttachment(id, attachment);
    } catch (err) {
      setAttachError(err instanceof ApiError ? err.message : "ดาวน์โหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setDownloadingId(null);
    }
  }

  async function refresh() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getMyQuote(id);
      setQuote(res.quote);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ไม่พบใบเสนอราคาที่ต้องการ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleRespond(action: "ACCEPT" | "REJECT" | "REQUEST_REVISION", note?: string) {
    if (!id) return;
    // ปฏิเสธมีฟอร์มเลือกเหตุผลเป็นด่านยืนยันอยู่แล้ว จึงไม่ต้องเด้งกล่องยืนยันซ้อนอีกชั้น
    if (action === "ACCEPT") {
      const confirmed = await confirm("ยืนยันการยอมรับใบเสนอราคานี้ใช่หรือไม่?", {
        confirmLabel: "ยอมรับ",
        variant: "success",
      });
      if (!confirmed) return;
    }

    setResponding(true);
    setActionError(null);
    try {
      await respondToQuote(id, action, note);
      setShowRevisionForm(false);
      setRevisionNote("");
      setShowRejectForm(false);
      setRejectReason("");
      setRejectDetail("");
      await refresh();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setResponding(false);
    }
  }

  usePageMeta(loading ? undefined : `ใบเสนอราคา ${quote?.quoteNo ?? ""}`.trim());

  if (loading) {
    return (
      // wide เหมือนหน้าจริง — เดิมตอนโหลดกว้างแค่ 640px แล้วกระโดดเป็น 1152px ตอนข้อมูลมา
      <PortalPage title="ใบเสนอราคา" subtitle="กำลังเปิดรายละเอียด" back={BACK_TO_QUOTES} wide>
        <DocumentSkeleton />
      </PortalPage>
    );
  }
  if (error || !quote) {
    return (
      <PortalPage title="ใบเสนอราคา" subtitle="ไม่สามารถเปิดรายละเอียดได้" back={BACK_TO_QUOTES}>
        <p className="text-red-600">{error ?? "ไม่พบใบเสนอราคา"}</p>
      </PortalPage>
    );
  }

  const subtotalBeforeVat = Number(quote.netPrice) - Number(quote.vatAmt);
  // ยอดก่อนลด = ยอดฐานภาษี + ส่วนลด ซึ่งตรงกับผลบวกราคาทุกบรรทัดในตารางด้านล่างพอดี
  // ไม่โชว์ตอนไม่มีส่วนลด เพื่อไม่ให้ใบธรรมดามีบรรทัดที่บวกแล้วได้เลขเดิม
  const discountAmt = Number(quote.discountAmt);
  // ส่วนลดปัดเศษ (ระบบปัดยอดสุทธิให้ลงตัว) หักก่อน VAT เหมือนส่วนลด — ต้องบวกกลับด้วย
  // ไม่งั้นยอดก่อนลดจะไม่เท่ากับผลบวกราคาทุกบรรทัดในตาราง
  const roundingAmt = Number(quote.roundingAmt);
  const beforeDiscount = subtotalBeforeVat + discountAmt + roundingAmt;
  const canRespond = quote.status === "SENT";
  // พ้นกำหนดยืนราคา — เซิร์ฟเวอร์ปฏิเสธการยอมรับอยู่แล้ว ปุ่มจึงไม่ควรโผล่มาให้กดแล้วเด้ง error
  const canAccept = canRespond && !quote.expired;
  // พ้นกำหนดยืนราคา = ป้าย "รอการตอบรับ" จะหลอก เพราะกดยอมรับเองไม่ได้แล้ว (ชุดเดียวกับหน้ารายการ)
  const badge = quote.expired
    ? { className: "border-slate-200 bg-slate-50 text-slate-600", label: "พ้นกำหนดยืนราคา" }
    : { className: STATUS_BADGE[quote.status], label: STATUS_LABEL[quote.status] };

  const itemCount = quote.groups.reduce((sum, g) => sum + g.items.length, 0);
  const searchQuery = itemSearch.trim().toLowerCase();
  const searching = searchQuery.length > 0;
  // ระหว่างค้น ยอดหัวหมวด = ผลรวมเฉพาะรายการที่เจอ (ยอดทั้งหมวดคู่กับ "พบ 3 รายการ" จะชวนเข้าใจผิด)
  const shownGroups = groupsShown(quote.groups, searchQuery);
  const foundCount = shownGroups.reduce((sum, g) => sum + g.items.length, 0);
  const formOpen = showRevisionForm || showRejectForm;

  return (
    <PortalPage
      title={quote.project.name}
      subtitle={`เลขที่ ${quote.quoteNo} · ฉบับที่ ${quote.revisionNo} · โครงการ ${quote.project.projectNo}`}
      back={BACK_TO_QUOTES}
      wide
    >
      {/* สองคอลัมน์ (ผู้ใช้เลือกแบบ A 11 ต.ค. 2026 — แบบหน้าชำระเงิน Shopify/Stripe):
          ซ้าย = เอกสารแนบ · เงื่อนไข · รายการงาน / ขวา = การ์ดราคา + ปุ่มตัดสินใจ ติดจอตอนเลื่อน
          ใน DOM การ์ดขวามาก่อน → จอแคบ (<1024) ราคากับปุ่มขึ้นก่อนรายการเหมือนเดิม
          (ใบยาว ๆ เคยฝังทั้งสองอย่างไว้ใต้รายการร้อยบรรทัด) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start lg:gap-8">
        <aside
          className={`flex flex-col gap-4 lg:col-span-4 lg:col-start-9 lg:row-start-1 ${
            // ฟอร์มปฏิเสธ/ขอปรับแก้สูงเกินจอได้ — ถ้ายังติดจออยู่ ส่วนล่างของฟอร์มจะเลื่อนไปไม่ถึง
            formOpen ? "" : "lg:sticky lg:top-[calc(var(--nav-h)+1rem)]"
          }`}
        >
          <div ref={priceBlockRef} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${badge.className}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                {badge.label}
              </span>
              {quote.sentAt && <span className="text-xs text-slate-500">ส่งเมื่อ {formatDate(quote.sentAt)}</span>}
            </div>
            <QuoteDates quote={quote} showValidity={canRespond} />

            <dl className="mt-5 flex flex-col gap-1.5 text-sm text-slate-600">
              <ReductionLines quote={quote} beforeDiscount={beforeDiscount} />
              <div className="flex items-baseline justify-between gap-3">
                <dt>รวมมูลค่าก่อนภาษีมูลค่าเพิ่ม</dt>
                <dd className="tabular-nums">{money(subtotalBeforeVat)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt>ภาษีมูลค่าเพิ่ม ({quote.vatPct}%)</dt>
                <dd className="tabular-nums">{money(quote.vatAmt)}</dd>
              </div>
              {/* แบบใบเสร็จ (ผู้ใช้เลือก A 11 ต.ค. 2026): ยอดสุดท้ายเป็นบรรทัดท้ายของรายการเดียวกัน เด่นด้วยตัวหนา+เส้นคั่น
                  เดิมแยกเป็นก้อนตัวเลข 30px ดูเป็นคนละเรื่องกับสองบรรทัดด้านบน ทั้งที่เป็นผลบวกของมันเอง */}
              <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2.5 text-base font-semibold text-slate-900">
                <dt>ราคาสุทธิ</dt>
                <dd className="tabular-nums">{money(quote.netPrice)} บาท</dd>
              </div>
            </dl>

            {/* พ้นกำหนดแล้วราคาในใบอาจไม่ใช่ราคาที่บริษัทยังรับได้ (วัสดุขึ้นราคา) — บอกทางไปต่อให้ชัด
                แทนที่จะปล่อยให้กดยอมรับแล้วเจอ error */}
            {canRespond && quote.expired && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">ใบเสนอราคานี้พ้นกำหนดยืนราคาแล้ว</p>
                <p className="mt-1 text-sm text-amber-700">
                  ราคาวัสดุอาจเปลี่ยนไปจากวันที่เสนอ กด “ขอปรับแก้รายละเอียด” เพื่อให้ทีมงานยืนยันราคาอีกครั้ง
                </p>
              </div>
            )}

            {canRespond && !formOpen && (
              <div className="mt-5 flex flex-col gap-2 sm:flex-row lg:flex-col">
                {canAccept && (
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => handleRespond("ACCEPT")}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-emerald-700 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
                  >
                    ยอมรับใบเสนอราคา
                  </button>
                )}
                <button
                  type="button"
                  disabled={responding}
                  onClick={() => setShowRevisionForm(true)}
                  className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50"
                >
                  ขอปรับแก้รายละเอียด
                </button>
                <button
                  type="button"
                  disabled={responding}
                  onClick={() => setShowRejectForm(true)}
                  className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  ปฏิเสธ
                </button>
              </div>
            )}

            {/* ฟอร์มกางในการ์ดเดียวกับปุ่มที่กด — เดิมไปโผล่ท้ายรายการงาน ห่างจากปุ่มเป็นจอ ๆ */}
            {canRespond && showRejectForm && (
              <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4">
                <div>
                  <p className="text-sm font-medium text-slate-800">ช่วยบอกเหตุผลที่ปฏิเสธหน่อยได้ไหม?</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    ทีมงานจะได้ปรับข้อเสนอให้ตรงกับที่คุณต้องการมากขึ้นในครั้งหน้า
                  </p>
                </div>

                <fieldset className="flex flex-col gap-1">
                  {[...REJECT_REASONS, OTHER_REASON].map((reason) => (
                    <label
                      key={reason}
                      className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <input
                        type="radio"
                        name="reject-reason"
                        value={reason}
                        checked={rejectReason === reason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="h-4 w-4 accent-red-600"
                      />
                      {reason}
                    </label>
                  ))}
                </fieldset>

                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  {rejectReason === OTHER_REASON ? "ระบุเหตุผล" : "รายละเอียดเพิ่มเติม (ถ้ามี)"}
                  <textarea
                    rows={3}
                    value={rejectDetail}
                    onChange={(e) => setRejectDetail(e.target.value)}
                    placeholder="เช่น งบอยู่ที่ประมาณ 2 ล้าน, ขอเลื่อนไปปีหน้า ฯลฯ"
                    className="rounded border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-slate-400 focus:outline-none"
                  />
                </label>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={
                      responding ||
                      rejectReason === "" ||
                      (rejectReason === OTHER_REASON && rejectDetail.trim().length === 0)
                    }
                    onClick={() =>
                      handleRespond(
                        "REJECT",
                        // ส่งเป็นข้อความเดียวลงช่องหมายเหตุเดิม — ไม่ต้องเพิ่มคอลัมน์ใหม่ในฐานข้อมูล
                        rejectNoteOf(rejectReason, rejectDetail),
                      )
                    }
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    ยืนยันการปฏิเสธ
                  </button>
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectReason("");
                      setRejectDetail("");
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}

            {canRespond && showRevisionForm && (
              <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4">
                <label className="flex flex-col gap-1 text-sm text-slate-600">
                  <span className="font-medium text-slate-800">อยากให้ปรับแก้อะไรบ้าง?</span>
                  <textarea
                    autoFocus
                    rows={4}
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    placeholder="เช่น อยากเปลี่ยนวัสดุพื้น, เพิ่มห้องน้ำอีก 1 จุด ฯลฯ"
                    className="rounded border border-slate-300 px-3 py-2 focus:ring-2 focus:ring-slate-400 focus:outline-none"
                  />
                </label>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    disabled={responding || revisionNote.trim().length === 0}
                    onClick={() => handleRespond("REQUEST_REVISION", revisionNote.trim())}
                    className="inline-flex min-h-11 items-center justify-center rounded-md bg-slate-800 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
                  >
                    ส่งคำขอปรับแก้
                  </button>
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => {
                      setShowRevisionForm(false);
                      setRevisionNote("");
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
            )}
            {actionError && <p className="mt-2 text-sm text-red-600">{actionError}</p>}

            {/* บอกให้ชัดว่าตอบไปแล้วจะเกิดอะไรต่อ — เดิมป้ายสถานะเปลี่ยนแล้วจบ ไม่มีทางไปต่อ */}
            {quote.status === "ACCEPTED" && (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-medium text-emerald-800">คุณยอมรับใบเสนอราคานี้แล้ว</p>
                <p className="mt-1 text-sm text-emerald-700">
                  ทีมงานจะจัดทำสัญญาและติดต่อกลับเพื่อนัดหมายขั้นตอนถัดไป
                </p>
                {/* ทางไปต่อของขั้นตอนถัดไป = ปุ่มจริง (เดิมเป็นข้อความขีดเส้นใต้ ดูไม่ออกว่ากดได้) */}
                <Link
                  to="/my/contracts"
                  className="group mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-800"
                >
                  ไปที่สัญญาของฉัน
                  <GoIcon />
                </Link>
              </div>
            )}
            {quote.status === "REVISED" && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">ส่งคำขอปรับแก้ให้ทีมงานแล้ว</p>
                <p className="mt-1 text-sm text-amber-700">
                  ทีมงานจะแก้ไขรายละเอียดแล้วส่งใบเสนอราคาฉบับใหม่มาให้ในหน้านี้
                </p>
              </div>
            )}
            {quote.status === "REJECTED" && (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">คุณปฏิเสธใบเสนอราคานี้แล้ว</p>
                <Link
                  to="/contact"
                  className="group mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-dark"
                >
                  ส่งคำขอใหม่อีกครั้ง
                  <GoIcon />
                </Link>
              </div>
            )}

            {quote.customerNote && (
              <p className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <span className="font-medium">ข้อความที่คุณส่งไป:</span> {quote.customerNote}
              </p>
            )}
          </div>

          {/* โครงการกำหนดเองไม่มี PDF ที่ระบบสร้าง — ลูกค้าโหลดไฟล์จริงจาก "เอกสารแนบ" แทน
              ลิงก์จริง ไม่ใช่ปุ่มที่ fetch แล้ว window.open — เปิดแท็บทันทีที่กด ไม่ต้องรอไฟล์สร้างเสร็จ
              และไม่โดนตัวบล็อกป๊อปอัปของ iOS Safari กินแท็บทิ้ง (แท็บเปิดหลัง await จะถูกบล็อก) */}
          {!quote.isCustom && (
            <a
              href={pdfViewerPath("quote", id ?? "")}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <FileTypeIcon fileName="quote.pdf" small />
              เปิดใบเสนอราคา (PDF)
            </a>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8 lg:row-start-1">
          {quote.attachments.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 font-semibold text-slate-900">เอกสารแนบจากทีมงาน</h2>
              <ul className="flex flex-col gap-2">
                {quote.attachments.map((a) => {
                  const canPreview = isPreviewableAttachment(a.fileName);
                  const busy = downloadingId === a.id;
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-slate-200 p-2.5"
                    >
                      <FileTypeIcon fileName={a.fileName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-800">{a.fileName}</p>
                        <p className="text-xs text-slate-400">
                          {ATTACH_KIND_LABEL[a.kind]} · {formatSize(a.sizeBytes)} · แนบเมื่อ{" "}
                          {formatDate(a.createdAt)}
                        </p>
                      </div>
                      <div className="flex w-full gap-2 sm:w-auto">
                        {canPreview && (
                          // ลิงก์จริง ไม่ใช่ปุ่มที่ fetch แล้วค่อย window.open — เปิดในจังหวะที่กดเลย
                          // ตัวบล็อกป๊อปอัปจึงไม่กินแท็บใหม่ทิ้ง (ดู myAttachmentPreviewUrl)
                          <a
                            href={myAttachmentPreviewUrl(id!, a.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 sm:flex-none"
                          >
                            <EyeIcon /> เปิดดู
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDownloadAttachment(a)}
                          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
                        >
                          <DownloadIcon /> {busy ? "กำลังโหลด..." : "ดาวน์โหลด"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {attachError && <p className="mt-2 text-sm text-red-600">{attachError}</p>}
            </div>
          )}

          {/* เงื่อนไขชุดเดียวกับที่พิมพ์ท้าย PDF — วางก่อนรายการงาน เพราะเป็นสิ่งที่ตกลงด้วยตอนกดยอมรับ */}
          {quote.terms.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">เงื่อนไข</h2>
              <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm text-slate-600">
                {quote.terms.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ol>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">
                รายละเอียดงาน
                {quote.groups.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-slate-400">
                    {quote.groups.length} หมวด · {itemCount} รายการ
                  </span>
                )}
              </h2>
              {quote.groups.length > 0 && !searching && (
                <button
                  type="button"
                  onClick={toggleAllGroups}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 lg:min-h-9"
                >
                  {allGroupsOpen ? "ซ่อนทั้งหมด" : "แสดงทั้งหมด"}
                </button>
              )}
            </div>

            {quote.groups.length === 0 &&
              (quote.isCustom ? (
                // เดิมข้อความนี้ชี้ไปที่ "ไฟล์เอกสารแนบด้านบน" เสมอ ทั้งที่บล็อกนั้นถูกซ่อนเมื่อยังไม่มีไฟล์
                <p className="mt-3 text-sm text-slate-500">
                  {quote.attachments.length > 0
                    ? "รายละเอียดงานทั้งหมดอยู่ในไฟล์เอกสารแนบด้านบน — กดเปิดดูหรือดาวน์โหลดเพื่อดูฉบับเต็ม"
                    : "ทีมงานยังไม่ได้แนบไฟล์รายละเอียดของโครงการนี้ — กรุณาติดต่อทีมงานเพื่อขอเอกสารฉบับเต็ม"}
                </p>
              ) : (
                <p className="mt-3 text-sm text-slate-400">ยังไม่มีรายการ</p>
              ))}

            {itemCount > 0 && (
              <div className="relative mt-3">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <SearchIcon />
                </span>
                <input
                  type="search"
                  value={itemSearch}
                  onChange={(e) => {
                    setItemSearch(e.target.value);
                    // ผลค้นใหม่เริ่มจากบนสุดของกล่องเสมอ ไม่ค้างตำแหน่งเลื่อนของผลเก่า
                    if (itemsBoxRef.current) itemsBoxRef.current.scrollTop = 0;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setItemSearch("");
                  }}
                  placeholder="ค้นหารายการ เช่น ประตู กระเบื้อง สี"
                  aria-label="ค้นหารายการงาน"
                  className={`min-h-11 w-full rounded-md border border-slate-300 py-2 pl-9 text-sm ${searching ? "pr-32" : "pr-3"} focus:ring-2 focus:ring-slate-400 focus:outline-none lg:min-h-10 [&::-webkit-search-cancel-button]:hidden`}
                />
                {searching && (
                  <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    <span className="text-xs text-slate-500" aria-live="polite">
                      พบ {foundCount} รายการ
                    </span>
                    <button
                      type="button"
                      onClick={() => setItemSearch("")}
                      aria-label="ล้างคำค้น"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            )}

            {searching && foundCount === 0 && (
              <p className="mt-4 text-sm text-slate-500">ไม่พบรายการที่มีคำว่า “{itemSearch.trim()}”</p>
            )}

            {/* กล่องเลื่อนในตัว (ผู้ใช้เลือกแบบ D 11 ต.ค. 2026): กาง 89 รายการแล้วหน้าไม่ยาวลงไปหลายจอ
                หัวหมวดติดบนกล่องตอนเลื่อน รู้ตลอดว่ากำลังดูหมวดไหน · overscroll-contain = เลื่อนสุดกล่องแล้วหน้าไม่ไหลตาม */}
            {shownGroups.length > 0 && (
              <div
                ref={itemsBoxRef}
                className="-mx-2 mt-2 max-h-[min(60vh,34rem)] overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
              >
                {shownGroups.map((group) => {
                  const isOpen = searching || openGroups.has(group.code);
                  const header = (
                    <>
                      <span
                        aria-hidden
                        className={`w-3 text-xs text-slate-400 transition-transform motion-reduce:transition-none ${
                          isOpen ? "rotate-90" : ""
                        }`}
                      >
                        ▸
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-slate-800">
                        <span className="mr-2 font-mono text-xs text-slate-400">{group.code}</span>
                        {group.name}
                        <span className="ml-2 text-xs text-slate-400">
                          ({searching ? `${group.items.length} จาก ${group.total}` : group.items.length} รายการ)
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-700">{money(group.subtotal)}</span>
                    </>
                  );
                  // หัวหมวดติดบนกล่อง — พื้นทึบไม่งั้นรายการที่เลื่อนผ่านจะทะลุขึ้นมาให้เห็น
                  const headerClass =
                    "sticky top-0 z-10 flex min-h-12 w-full items-center gap-2 border-b border-slate-100 bg-white px-2 py-2 text-left";
                  return (
                    <div key={group.code}>
                      {searching ? (
                        // ระหว่างค้น หมวดกางเองทั้งหมด หัวหมวดไม่ต้องกดได้
                        <div className={headerClass}>{header}</div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.code)}
                          aria-expanded={isOpen}
                          className={`${headerClass} transition-colors hover:bg-slate-50`}
                        >
                          {header}
                        </button>
                      )}

                      {isOpen && (
                        <ul className="flex flex-col gap-3 pt-2 pr-2 pb-4 pl-7">
                          {group.items.map((item) => (
                            <li key={item.id} className="flex flex-col gap-0.5">
                              <div className="flex justify-between gap-3 text-sm">
                                <span className="text-slate-700">
                                  {item.code && (
                                    <span className="mr-2 font-mono text-xs text-slate-400">
                                      <Highlight text={item.code} query={searchQuery} />
                                    </span>
                                  )}
                                  <Highlight text={item.name} query={searchQuery} />
                                </span>
                                <span className="shrink-0 tabular-nums text-slate-700">{money(item.lineTotal)}</span>
                              </div>
                              <span className="text-xs text-slate-400">
                                {item.quantity} {item.unit} × {money(item.unitPrice)} บาท
                              </span>
                              {item.note && <span className="text-xs text-slate-500">หมายเหตุ: {item.note}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {!priceBlockVisible && (
        <>
          {/* เว้นที่ท้ายหน้าเท่าความสูงแถบลอย ไม่งั้นแถบไปทับเนื้อหาบรรทัดสุดท้าย */}
          <div aria-hidden className="h-24 lg:hidden" />
          {/* จอกว้างไม่ต้องมีแถบนี้ — การ์ดราคาติดจออยู่ทางขวาตลอดแล้ว */}
          <div className="fixed inset-x-0 bottom-0 z-10 bg-slate-800 text-white shadow-lg lg:hidden">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <span className="text-sm">
                <span className="text-slate-300">ราคาสุทธิ </span>
                <span className="font-semibold">{money(quote.netPrice)} บาท</span>
              </span>
              {canRespond && !showRevisionForm && !showRejectForm && (
                <span className="flex gap-2">
                  {canAccept && (
                    <button
                      type="button"
                      disabled={responding}
                      onClick={() => handleRespond("ACCEPT")}
                      className="inline-flex min-h-11 items-center rounded-md bg-emerald-700 px-3 text-sm font-medium text-white disabled:opacity-50"
                    >
                      ยอมรับ
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={responding}
                    onClick={() => setShowRevisionForm(true)}
                    className="inline-flex min-h-11 items-center rounded-md border border-slate-500 px-3 text-sm text-slate-100 disabled:opacity-50"
                  >
                    ขอปรับแก้
                  </button>
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </PortalPage>
  );
}
