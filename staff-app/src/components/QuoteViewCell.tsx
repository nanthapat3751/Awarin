import type { QuoteDto } from "@systemboq/shared-types";

import { QUOTE_VIEW_TONE_CLASS, quoteViewStatus } from "../lib/quote-view";

// ช่อง "ลูกค้าเปิดดู" ในตารางใบเสนอราคา — จุดสีเล็ก ๆ กับข้อความ ไม่ใช้ pill เพราะคอลัมน์ข้าง ๆ
// เป็น pill สถานะอยู่แล้ว สอง pill ติดกันในแถวเดียวอ่านยากกว่าที่ควรจะเป็น
export function QuoteViewCell({
  quote,
}: Readonly<{
  quote: Pick<
    QuoteDto,
    "status" | "sentAt" | "createdAt" | "firstViewedAt" | "lastViewedAt" | "viewCount"
  >;
}>) {
  const view = quoteViewStatus(quote);
  return (
    <span className="inline-flex flex-col leading-tight" title={view.title}>
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap ${QUOTE_VIEW_TONE_CLASS[view.tone]}`}
      >
        {view.tone !== "none" && (
          <span
            aria-hidden
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              view.tone === "unopened" ? "bg-amber-500" : "bg-emerald-500"
            }`}
          />
        )}
        {view.label}
      </span>
      {view.hint && <span className="mt-0.5 text-xs text-slate-500">{view.hint}</span>}
    </span>
  );
}
