import { CircleCheckBig, FileText, Handshake, Inbox, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import {
  PIPELINE_STALE_DAYS,
  type DashboardPipelineDto,
  type PipelineStageDto,
  type PipelineStageKey,
} from "@systemboq/shared-types";

import { useCountUp } from "../lib/use-count-up";

// ขั้นตอนของงาน: งานค้างอยู่ขั้นไหน และเงินก้อนไหนใหญ่สุด — การ์ด 4 ใบเรียงซ้ายไปขวา
//
// ดีไซน์ (ผู้ใช้เลือกจากหน้าต้นแบบ): การ์ดพื้นสีอ่อนตามขั้น (แบบ 2) + วงแหวนสัดส่วนมูลค่า (แบบ 3)
// วงแหวน = มูลค่าขั้นนี้ ÷ มูลค่ารวมทุกขั้นที่มีราคา — หารด้วยผลรวมได้เพราะงานหนึ่งอยู่ได้ขั้นเดียว
// (ไม่มีขั้นลงนามแยกแล้ว ดู PipelineStageKey) วงทุกวงจึงรวมกันได้ 100% · ขั้นคำขอยังไม่มีราคาจึงไม่มีวง
//
// อนิเมชัน: ตัวเลขนับขึ้น + วงแหวนวิ่ง · ขั้นที่มีงานรอนานมีวงแสงสีส้ม (.pipeline-alert ใน index.css)
// ผู้ใช้ที่ตั้งเครื่องให้ลดการเคลื่อนไหว ได้ค่าสุดท้ายทันที (useCountUp + motion-reduce)

/** สีประจำขั้น — เขียนคลาสเต็มเพราะ Tailwind อ่านได้เฉพาะ literal */
const TONE: Record<PipelineStageKey, { card: string; count: string; ring: string; icon: string; Icon: LucideIcon }> = {
  lead: { card: "bg-slate-100", count: "text-slate-800", ring: "text-slate-500", icon: "text-slate-500", Icon: Inbox },
  quoted: { card: "bg-blue-50", count: "text-blue-900", ring: "text-blue-600", icon: "text-blue-600", Icon: FileText },
  accepted: { card: "bg-amber-50", count: "text-amber-900", ring: "text-amber-600", icon: "text-amber-700", Icon: Handshake },
  completed: { card: "bg-emerald-50", count: "text-emerald-900", ring: "text-emerald-600", icon: "text-emerald-700", Icon: CircleCheckBig },
};

/** 11.47 ล้าน บาท / 890,000 บาท — การ์ดแคบ ตัวเลขเต็มอยู่ใน title */
function shortMoney(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ล้าน บาท`;
  }
  return `${value.toLocaleString("th-TH", { maximumFractionDigits: 0 })} บาท`;
}

function fullMoney(value: number): string {
  return `${value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;
}

const RING_R = 28;
const RING_C = 2 * Math.PI * RING_R;

/** วงแหวนสัดส่วน — เริ่มว่างแล้ววิ่งไปค่าจริงหลัง mount (grown) */
function ShareRing({ share, grown, toneClass }: Readonly<{ share: number; grown: boolean; toneClass: string }>) {
  const pct = Math.round(share * 100);
  return (
    <svg
      viewBox="0 0 72 72"
      className={`h-[4.5rem] w-[4.5rem] shrink-0 ${toneClass}`}
      role="img"
      aria-label={`${pct}% ของมูลค่ารวมทุกขั้น`}
    >
      <circle cx="36" cy="36" r={RING_R} fill="none" strokeWidth="7" className="stroke-white/80" />
      <circle
        cx="36"
        cy="36"
        r={RING_R}
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={RING_C}
        strokeDashoffset={grown ? RING_C * (1 - share) : RING_C}
        transform="rotate(-90 36 36)"
        className={`transition-[stroke-dashoffset] duration-1000 ease-out motion-reduce:transition-none ${share === 0 ? "opacity-0" : ""}`}
      />
      <text x="36" y="41" textAnchor="middle" className="fill-slate-800 text-[15px] font-bold tabular-nums">
        {pct}%
      </text>
    </svg>
  );
}

function StageCard({ stage, share }: Readonly<{ stage: PipelineStageDto; share: number | null }>) {
  const count = useCountUp(stage.count);
  const value = useCountUp(stage.value ?? 0);
  // วงแหวนเริ่มที่ 0 แล้ววิ่งไปค่าจริงหลัง mount หนึ่งจังหวะ (ถ้าตั้งค่าตรง ๆ จะไม่มี transition ให้เห็น)
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 30);
    return () => clearTimeout(t);
  }, []);

  const tone = TONE[stage.key];
  const stale = stage.staleCount > 0;
  let valueText: ReactNode;
  if (stage.value == null) valueText = <span className="text-slate-500">ยังไม่มีราคา</span>;
  // ไม่มีงานในขั้นนี้ = ขีด ไม่ใช่ 0 บาท ซึ่งอ่านเหมือนมีงานแต่ไม่มีมูลค่า
  else if (stage.count === 0) valueText = <span className="text-slate-400">—</span>;
  else valueText = shortMoney(value);

  return (
    <Link
      to={stage.href}
      title={stage.value != null && stage.count > 0 ? fullMoney(stage.value) : undefined}
      className={`relative flex min-h-[7.5rem] items-center gap-3 overflow-hidden rounded-lg border p-4 transition hover:shadow-md motion-safe:hover:-translate-y-0.5 ${tone.card} ${
        stale ? "pipeline-alert border-amber-300" : "border-transparent"
      }`}
    >
      {/* วงกลมจาง ๆ มุมล่างขวา เป็นลวดลายของการ์ดสีอ่อน (แบบ 2) */}
      <span aria-hidden className={`pointer-events-none absolute -bottom-10 -right-8 h-28 w-28 rounded-full bg-current opacity-[0.06] ${tone.icon}`} />
      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm text-slate-600">{stage.label}</span>
        <span className={`text-2xl font-bold leading-tight tabular-nums ${tone.count}`}>{Math.round(count)}</span>
        <span className="text-sm tabular-nums text-slate-700">{valueText}</span>
        {stale && (
          <span
            className="mt-0.5 w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            title={`ใบเสนอราคาที่ส่งไปเกิน ${PIPELINE_STALE_DAYS} วันแล้วลูกค้ายังไม่ตอบ`}
          >
            รอนาน {stage.staleCount}
          </span>
        )}
      </div>
      {share == null ? (
        // ขั้นที่ยังไม่มีราคา (คำขอ) ไม่มีวงแหวน — วางไอคอนในวงกลมขนาดเท่ากันแทน การ์ดจะได้สมดุลกัน
        <span aria-hidden className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center rounded-full bg-white/70">
          <tone.Icon size={26} className={tone.icon} />
        </span>
      ) : (
        <span className="relative">
          <ShareRing share={share} grown={grown} toneClass={tone.ring} />
        </span>
      )}
    </Link>
  );
}

export function DashboardPipeline({ pipeline }: Readonly<{ pipeline: DashboardPipelineDto }>) {
  const totalValue = pipeline.stages.reduce((sum, s) => sum + (s.value ?? 0), 0);
  const { rejectedCount, cancelledCount } = pipeline.lost;

  return (
    <section aria-labelledby="dash-pipeline" className="mb-8">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dash-pipeline" className="text-lg font-medium text-slate-800">
          ขั้นตอนของงาน
        </h2>
        {/* กันการอ่านผิดที่พบบ่อยที่สุด: นึกว่าตัวเลขนับสะสมกันแบบกรวยขาย ทั้งที่แต่ละใบคือจำนวนงาน
            ที่ยืนอยู่ขั้นนั้น ณ ตอนนี้ · "ลูกค้ายอมรับ" รวมที่ลงนามสัญญาแล้ว (ไม่มีขั้นลงนามแยก) */}
        <p className="text-xs text-slate-500">
          งานหนึ่งอยู่ได้ขั้นเดียว · ลูกค้ายอมรับรวมที่ลงนามสัญญาแล้ว · วงแหวน = สัดส่วนจากมูลค่ารวมทุกขั้น
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pipeline.stages.map((stage) => (
          <StageCard
            key={stage.key}
            stage={stage}
            share={stage.value == null ? null : totalValue > 0 ? stage.value / totalValue : 0}
          />
        ))}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        หลุดไปแล้ว: ลูกค้าปฏิเสธ {rejectedCount} · ยกเลิก {cancelledCount} (ไม่นับรวมในการ์ดด้านบน)
      </p>
    </section>
  );
}
