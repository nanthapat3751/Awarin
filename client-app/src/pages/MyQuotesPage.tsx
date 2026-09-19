import { useEffect, useState } from "react";

import type { CustomerQuoteSummaryDto, QuoteStatus } from "@systemboq/shared-types";

import { EmptyState } from "../components/EmptyState";
import { PortalPage, StatusCard } from "../components/PortalPage";
import { ApiError } from "../lib/api";
import { listMyQuotes } from "../lib/my-api";

// สไตล์ตามสถานะใบเสนอราคา: ป้ายสถานะ + แถบสีซ้าย
const STATUS_STYLE: Record<QuoteStatus, { label: string; badge: string; accent: string }> = {
  DRAFT: { label: "ร่าง", badge: "bg-slate-100 text-slate-600", accent: "bg-slate-400" },
  SENT: { label: "รอการตอบรับ", badge: "bg-amber-100 text-amber-700", accent: "bg-amber-400" },
  ACCEPTED: { label: "ยอมรับแล้ว", badge: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-400" },
  REJECTED: { label: "ปฏิเสธแล้ว", badge: "bg-rose-100 text-rose-700", accent: "bg-rose-400" },
  REVISED: { label: "ขอปรับแก้", badge: "bg-sky-100 text-sky-700", accent: "bg-sky-400" },
};

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("th-TH");
}

/**
 * วันตามปฏิทิน (YYYY-MM-DD) เช่น วันยืนราคา — ประกอบเป็นเที่ยงคืน "เวลาเครื่อง" ก่อนจัดรูป
 * ถ้าส่งสตริงตรง ๆ เข้า new Date() จะได้เที่ยงคืน UTC แล้ววันเลื่อนบนเครื่องที่เขตเวลาติดลบ
 */
function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH");
}

export function MyQuotesPage() {
  const [quotes, setQuotes] = useState<CustomerQuoteSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyQuotes()
      .then((res) => setQuotes(res.quotes))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "โหลดใบเสนอราคาไม่สำเร็จ");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalPage title="ใบเสนอราคาของฉัน" subtitle="เปิดดูรายละเอียดราคาและตอบรับใบเสนอราคาจากทีมงาน">
      {loading && <p className="text-slate-400">กำลังโหลด...</p>}
      {!loading && error && (
        <p className="text-sm text-red-600">{error} — กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง</p>
      )}
      {!loading && !error && quotes.length === 0 && (
        <EmptyState
          title="ยังไม่มีใบเสนอราคา"
          description="เมื่อทีมงานออกใบเสนอราคาให้โครงการของคุณ จะแสดงที่นี่ให้เปิดดูและตอบรับได้"
          ctaLabel="ส่งคำขอใหม่"
          ctaTo="/contact"
        />
      )}

      <div className="flex flex-col gap-3">
        {quotes.map((quote, i) => {
          // พ้นกำหนดยืนราคา = ยังรอคำตอบอยู่ก็จริง แต่กดยอมรับเองไม่ได้แล้ว — ป้าย "รอการตอบรับ" จะหลอก
          const s = quote.expired
            ? { label: "พ้นกำหนดยืนราคา", badge: "bg-slate-100 text-slate-600", accent: "bg-slate-400" }
            : STATUS_STYLE[quote.status];
          const validity =
            quote.status === "SENT" && quote.validUntil
              ? ` · ยืนราคาถึง ${formatDay(quote.validUntil)}`
              : "";
          return (
            <StatusCard
              key={quote.id}
              index={i}
              href={`/my/quotes/${quote.id}`}
              accent={s.accent}
              title={quote.project.name}
              meta={`ฉบับที่ ${quote.revisionNo} · เลขที่ ${quote.quoteNo} · ส่งเมื่อ ${formatDate(quote.sentAt)}${validity}`}
              badge={{ label: s.label, className: s.badge }}
            />
          );
        })}
      </div>
    </PortalPage>
  );
}
