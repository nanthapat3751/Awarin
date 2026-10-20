import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { areaRangeLabel, type CustomerLeadDto, type LeadStatus } from "@systemboq/shared-types";

import { PortalPage } from "../components/PortalPage";
import { RequestDetailSkeleton } from "../components/Skeleton";
import { ApiError } from "../lib/api";
import { LEAD_STATUS_STYLE } from "../lib/lead-status";
import { getMyLead } from "../lib/my-api";
import { usePageMeta } from "../lib/page-meta";
import { getPublicSettings } from "../lib/public-api";
import { lineHref as toLineHref, safeHttpUrl } from "../lib/safe-url";

const BACK_TO_REQUESTS = { to: "/my/requests", label: "คำขอทั้งหมด" };

// ลำดับปกติของคำขอ — ตำแหน่งในแถบมาจากสถานะปัจจุบันอย่างเดียว
// ระบบไม่ได้เก็บวันที่เปลี่ยนแต่ละสถานะ จึงใส่วันที่เฉพาะขั้นแรก (วันส่ง) ไม่เดาวันของขั้นอื่น
const STEPS = ["ส่งคำขอ", "ทีมงานติดต่อ", "เสนอราคา", "เสร็จสิ้น"] as const;
const STEP_INDEX: Record<Exclude<LeadStatus, "REJECTED">, number> = {
  NEW: 0,
  CONTACTED: 1,
  QUOTED: 2,
  CLOSED: 3,
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

/** วันตามปฏิทิน (YYYY-MM-DD) — ประกอบเป็นเที่ยงคืนเวลาเครื่อง ไม่งั้นวันเลื่อนบนเครื่องที่เขตเวลาติดลบ */
function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** ประโยคเดียวบอกว่าตอนนี้เรื่องอยู่ตรงไหน และรออะไรต่อ — ไม่สัญญาเวลาที่ระบบไม่รู้ */
function nextStepText(lead: CustomerLeadDto): string {
  switch (lead.status) {
    case "NEW":
      return "ทีมงานได้รับคำขอแล้ว และจะติดต่อกลับทางเบอร์โทรหรืออีเมลที่คุณให้ไว้";
    case "CONTACTED":
      return "ทีมงานกำลังเตรียมรายละเอียดงานและใบเสนอราคาให้คุณ";
    case "QUOTED":
      return lead.latestQuote
        ? "ใบเสนอราคาพร้อมให้ตรวจดูแล้ว คุณยอมรับ ขอปรับแก้ หรือปฏิเสธได้จากหน้าใบเสนอราคา"
        : "ทีมงานกำลังจัดทำใบเสนอราคาให้คุณ";
    case "CLOSED":
      return lead.hasContract
        ? "คำขอนี้ดำเนินการเสร็จสิ้นแล้ว ดูสัญญาและงวดชำระได้ที่หน้าสัญญาของฉัน"
        : "คำขอนี้ดำเนินการเสร็จสิ้นแล้ว";
    case "REJECTED":
      return "คำขอนี้ไม่ได้ดำเนินการต่อ หากต้องการเริ่มใหม่ ส่งคำขอใหม่ได้ทุกเมื่อ";
  }
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CheckIcon() {
  return (
    <svg {...iconProps} strokeWidth={2.5} className="h-3.5 w-3.5">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg {...iconProps} strokeWidth={2.5} className="h-3.5 w-3.5">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function GoIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4 transition-transform group-hover:translate-x-0.5">
      <path d="M5 12h14" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4">
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

function stepState(i: number, status: Exclude<LeadStatus, "REJECTED">): "done" | "current" | "todo" {
  const current = STEP_INDEX[status];
  if (i < current) return "done";
  if (i > current) return "todo";
  // ขั้นสุดท้ายที่ถึงแล้วคือ "เสร็จ" ไม่ใช่ "กำลังทำ" — ไม่มีอะไรรอต่อ
  return status === "CLOSED" ? "done" : "current";
}

/**
 * แถบขั้นตอน 4 ขั้น · ไม่ดำเนินการต่อ = เหลือ 2 ขั้น (ส่งคำขอ → ไม่ดำเนินการต่อ)
 * เพราะไม่รู้ว่าหยุดที่ขั้นไหน — ถ้าวาดขั้นกลางเป็นติ๊กถูก/ว่างไว้ก็เท่ากับเดา
 */
function StatusSteps({ lead }: Readonly<{ lead: CustomerLeadDto }>) {
  const rejected = lead.status === "REJECTED";
  const steps: { label: string; state: "done" | "current" | "todo" | "stopped"; sub?: string }[] = rejected
    ? [
        { label: STEPS[0], state: "done", sub: formatDate(lead.createdAt) },
        { label: "ไม่ดำเนินการต่อ", state: "stopped" },
      ]
    : STEPS.map((label, i) => ({
        label,
        state: stepState(i, lead.status as Exclude<LeadStatus, "REJECTED">),
        sub: i === 0 ? formatDate(lead.createdAt) : undefined,
      }));

  return (
    <ol className="flex items-start" aria-label="ขั้นตอนของคำขอ">
      {steps.map((step, i) => {
        const dot = {
          done: "bg-brand text-white",
          current: "bg-white text-brand ring-2 ring-brand",
          todo: "bg-white text-slate-300 ring-1 ring-slate-300",
          stopped: "bg-rose-600 text-white",
        }[step.state];
        const label = {
          done: "text-slate-700",
          current: "font-semibold text-brand",
          todo: "text-slate-400",
          stopped: "font-semibold text-rose-700",
        }[step.state];
        const lineDone = i > 0 && step.state !== "todo";
        return (
          <li
            key={step.label}
            className="relative flex flex-1 flex-col items-center text-center"
            aria-current={step.state === "current" ? "step" : undefined}
          >
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 ${
                  lineDone ? (step.state === "stopped" ? "bg-rose-300" : "bg-brand") : "bg-slate-200"
                }`}
              />
            )}
            <span className={`relative flex h-7 w-7 items-center justify-center rounded-full ${dot}`}>
              {step.state === "done" && <CheckIcon />}
              {step.state === "stopped" && <CrossIcon />}
              {step.state === "current" && <span className="h-2 w-2 rounded-full bg-brand" />}
            </span>
            <span className={`mt-2 px-1 text-xs leading-snug ${label}`}>{step.label}</span>
            {step.sub && <span className="mt-0.5 text-[11px] text-slate-400">{step.sub}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** แถว "หัวข้อ : ค่า" ของสิ่งที่ลูกค้าส่งมา — จอแคบเรียงบนล่าง จอกว้างสองคอลัมน์ */
function Field({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs text-slate-500 sm:text-sm">{label}</dt>
      <dd className="min-w-0 text-sm wrap-break-word text-slate-800">{children}</dd>
    </div>
  );
}

export function MyRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<CustomerLeadDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    getMyLead(id)
      .then((res) => setLead(res.lead))
      .catch((err) => setError(err instanceof ApiError ? err.message : "เปิดคำขอไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    getPublicSettings()
      .then((res) => setSettings(res.settings))
      .catch(() => undefined);
  }, []);

  usePageMeta(loading ? undefined : lead ? `คำขอ ${lead.serviceType}` : "คำขอของฉัน");

  if (loading) {
    return (
      <PortalPage title="คำขอของฉัน" subtitle="กำลังเปิดรายละเอียด" back={BACK_TO_REQUESTS}>
        <RequestDetailSkeleton />
      </PortalPage>
    );
  }
  if (error || !lead) {
    return (
      <PortalPage title="คำขอของฉัน" subtitle="ไม่สามารถเปิดรายละเอียดได้" back={BACK_TO_REQUESTS}>
        <p className="text-red-600">{error ?? "ไม่พบคำขอที่ระบุ"}</p>
      </PortalPage>
    );
  }

  const s = LEAD_STATUS_STYLE[lead.status];
  const phone = settings.companyPhone?.trim() ?? "";
  const lineHref = toLineHref(settings.companyLine);
  const attachments = lead.attachments.map(safeHttpUrl).filter(Boolean);
  const finished = lead.status === "CLOSED" || lead.status === "REJECTED";
  const secondaryBtn =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50";
  const primaryBtn =
    "group inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-dark";

  return (
    <PortalPage title={lead.serviceType} subtitle={`ส่งคำขอเมื่อ ${formatDate(lead.createdAt)}`} back={BACK_TO_REQUESTS}>
      <div className="flex flex-col gap-4">
        <section className="rounded-xl border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-800">สถานะ</h2>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${s.badge}`}>{s.label}</span>
          </div>
          <div className="mt-5">
            <StatusSteps lead={lead} />
          </div>
          <p className="mt-5 text-sm text-slate-600">{nextStepText(lead)}</p>

          {(lead.latestQuote || lead.hasContract) && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {lead.latestQuote && (
                <Link to={`/my/quotes/${lead.latestQuote.id}`} className={primaryBtn}>
                  ดูใบเสนอราคา เลขที่ {lead.latestQuote.quoteNo}
                  <GoIcon />
                </Link>
              )}
              {lead.hasContract && (
                <Link to="/my/contracts" className={lead.latestQuote ? secondaryBtn : primaryBtn}>
                  ดูสัญญา
                </Link>
              )}
            </div>
          )}
        </section>

        {lead.reply && (
          <section className="rounded-xl border border-brand/20 bg-brand/5 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-sm font-semibold text-brand">คำตอบจากทีมงาน</h2>
              {lead.repliedAt && <span className="text-xs text-slate-500">{formatDate(lead.repliedAt)}</span>}
            </div>
            <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{lead.reply}</p>
          </section>
        )}

        <Section title="สิ่งที่คุณส่งมา">
          <dl className="-my-2.5 divide-y divide-slate-100">
            <Field label="บริการ">{lead.serviceType}</Field>
            {lead.houseDesign && (
              <Field label="แบบบ้าน">
                <Link
                  to={`/house-designs/${lead.houseDesign.id}`}
                  className="link-pill -mx-2.5 -my-1 font-medium text-brand"
                >
                  {lead.houseDesign.name}
                </Link>
              </Field>
            )}
            {lead.message && (
              <Field label="รายละเอียด">
                <span className="whitespace-pre-line">{lead.message}</span>
              </Field>
            )}
            {lead.siteAddress && (
              <Field label="ที่อยู่หน้างาน">
                <span className="whitespace-pre-line">{lead.siteAddress}</span>
              </Field>
            )}
            {lead.areaSqm && (
              <Field label="พื้นที่โดยประมาณ">
                {Number(lead.areaSqm).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ม.
              </Field>
            )}
            {!lead.areaSqm && lead.areaRange && (
              <Field label="พื้นที่โดยประมาณ">{areaRangeLabel(lead.areaRange)}</Field>
            )}
            {lead.desiredStartDate && <Field label="อยากเริ่มงาน">{formatDay(lead.desiredStartDate)}</Field>}
            {attachments.length > 0 && (
              <Field label="ลิงก์แนบ">
                <ul className="flex flex-col gap-1">
                  {attachments.map((url) => (
                    <li key={url} className="truncate">
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-brand underline-offset-2 hover:underline"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </Field>
            )}
            <Field label="ผู้ติดต่อ">
              {lead.name}
              <span className="block text-slate-500">
                {lead.phone}
                {lead.email ? ` · ${lead.email}` : ""}
              </span>
            </Field>
          </dl>
        </Section>

        {(phone || lineHref || finished) && (
          <Section title={finished ? "ต้องการอะไรเพิ่มเติม" : "สอบถามเรื่องคำขอนี้"}>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {phone && (
                <a href={`tel:${phone.replace(/\s+/g, "")}`} className={secondaryBtn}>
                  <PhoneIcon /> โทร {phone}
                </a>
              )}
              {lineHref && (
                <a href={lineHref} target="_blank" rel="noopener noreferrer" className={secondaryBtn}>
                  <LineIcon /> แชท LINE
                </a>
              )}
              {finished && (
                <Link to="/contact" className={secondaryBtn}>
                  ส่งคำขอใหม่
                </Link>
              )}
            </div>
          </Section>
        )}
      </div>
    </PortalPage>
  );
}
