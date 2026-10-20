import { AlertTriangle, Banknote, CircleCheckBig, HandCoins, TrendingUp, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type {
  DashboardCashDto,
  DashboardPipelineDto,
  DashboardSummaryDto,
  ProjectStatus,
} from "@systemboq/shared-types";

import { DashboardPipeline } from "../components/DashboardPipeline";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { getContractCash, getDashboardSummary, getPipeline } from "../lib/dashboard-api";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { badgeClass, type BadgeColor } from "../lib/status-badge";
import { useCountUp } from "../lib/use-count-up";
import { SkeletonGroup } from "../components/Skeleton";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคาแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

// ใช้สีเดียวกับรายการโปรเจกต์ เพื่อให้สถานะอ่านเหมือนกันไม่ว่าจะปรากฏที่ไหน
const STATUS_COLOR: Record<ProjectStatus, BadgeColor> = {
  DRAFT: "slate",
  QUOTED: "amber",
  REJECTED: "red",
  APPROVED: "blue",
  COMPLETED: "emerald",
  CANCELLED: "red",
};

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// อัตราปิดงาน: คืน null เมื่อยังไม่เคยเสนอราคาให้ใครเลย -- โชว์ "—" ดีกว่าโชว์ 0% ซึ่งอ่านเหมือน
// ปิดงานไม่ได้สักงาน ทั้งที่ความจริงคือยังไม่มีข้อมูลพอจะคิด
function overdueTone(cash: DashboardCashDto | null): KpiTone {
  if (!cash) return "slate";
  return cash.totals.overdueAmount > 0 ? "rose" : "green";
}

function winRateOf(won: number, quoted: number): number | null {
  return quoted > 0 ? Math.round((won / quoted) * 100) : null;
}

/**
 * สีของการ์ดตัวเลข (ผู้ใช้เลือกแบบ "พื้นสีอ่อนตามความหมาย" จากหน้าต้นแบบ) — การ์ดหลักยังเป็นนาวีแบรนด์
 * สีต้องบอกความหมาย ไม่ใช่ไล่สีเรียงไปเรื่อย ๆ: ฟ้า = การขาย · เขียวหัวเป็ด = เงินตามสัญญา ·
 * เขียว = ไม่มีค้าง / แดงกุหลาบ = มีค้างจริง · เขียนคลาสเต็มเพราะ Tailwind อ่านได้เฉพาะ literal
 */
type KpiTone = "blue" | "teal" | "green" | "rose" | "slate";
const KPI_TONE: Record<KpiTone, { card: string; value: string; icon: string; bar: string }> = {
  blue: { card: "bg-blue-50", value: "text-blue-900", icon: "text-blue-600", bar: "bg-blue-600" },
  teal: { card: "bg-teal-50", value: "text-teal-900", icon: "text-teal-700", bar: "bg-teal-600" },
  green: { card: "bg-emerald-50", value: "text-emerald-900", icon: "text-emerald-700", bar: "bg-emerald-600" },
  rose: { card: "bg-rose-50", value: "text-rose-900", icon: "text-rose-700", bar: "bg-rose-600" },
  // ยังไม่รู้ (โหลดไม่สำเร็จ) — ไม่ใช้เขียว จะอ่านเหมือน "ไม่มีค้าง" ทั้งที่ไม่รู้
  slate: { card: "bg-slate-100", value: "text-slate-800", icon: "text-slate-500", bar: "bg-slate-500" },
};

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  /** null = ยังไม่มีข้อมูลพอจะคำนวณ -> แสดง "—" แทนเลข 0 ที่อ่านผิดความหมาย */
  value: number | null;
  format: (value: number) => string;
  sub?: ReactNode;
  /** ใส่เพื่อทำการ์ดให้กดไปหน้าที่กรองไว้ให้แล้ว */
  to?: string;
  /** การ์ดตัวเลขสำคัญที่สุดของหน้า = พื้นนาวีแบรนด์ (ที่เหลือเป็นการ์ดขาว) */
  primary?: boolean;
  /** วาดแถบความคืบหน้าใต้ตัวเลข โดยถือว่าค่าที่ได้คือเปอร์เซ็นต์ 0-100 */
  progress?: boolean;
  /** สีพื้นอ่อนของการ์ดที่ไม่ใช่การ์ดหลัก */
  tone?: KpiTone;
}

function KpiCard({ icon: Icon, label, value, format, sub, to, primary, progress, tone = "blue" }: KpiCardProps) {
  const animated = useCountUp(value ?? 0);
  const hasValue = value !== null;
  const t = KPI_TONE[tone];

  const body = (
    <>
      {/* วงกลมจาง ๆ มุมล่างขวา เป็นลวดลายของการ์ด */}
      <span
        aria-hidden
        className={`pointer-events-none absolute -bottom-10 -right-8 h-28 w-28 rounded-full bg-current ${
          primary ? "text-white opacity-10" : `${t.icon} opacity-[0.07]`
        }`}
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className={`text-xs ${primary ? "text-slate-300" : "text-slate-600"}`}>{label}</p>
        <Icon size={18} className={primary ? "text-white/70" : t.icon} aria-hidden />
      </div>
      <p className={`relative text-xl font-semibold mt-1 tabular-nums ${primary ? "" : t.value}`}>
        {hasValue ? format(animated) : "—"}
      </p>
      {progress && (
        <div className={`relative mt-2 h-1.5 w-full rounded-full ${primary ? "bg-white/20" : "bg-white/80"}`} aria-hidden>
          <div
            className={`h-full rounded-full ${primary ? "bg-white" : t.bar}`}
            style={{ width: `${Math.min(100, Math.max(0, animated))}%` }}
          />
        </div>
      )}
      {sub && (
        <p className={`relative text-xs mt-0.5 ${primary ? "text-slate-400" : "text-slate-600"}`}>{sub}</p>
      )}
    </>
  );

  const base = primary
    ? "relative overflow-hidden bg-brand text-white rounded-lg p-4 shadow-sm"
    : `relative overflow-hidden ${t.card} border border-transparent rounded-lg p-4`;

  // ยกการ์ดตอน hover เฉพาะใบที่กดได้จริง -- การ์ดที่กดไม่ได้แต่ขยับจะหลอกให้คนพยายามกด
  //
  // การยกตัวต้องครอบด้วย motion-safe: เท่านั้น เคยเขียนเป็น motion-reduce:transform-none
  // ซึ่ง **ไม่มีผลเลยใน Tailwind v4** เพราะ v4 ขยับด้วยคุณสมบัติ translate ไม่ใช่ transform
  // แถมกฎที่มี :hover ยังมี specificity สูงกว่ากฎใน media query จึงสั่งทับไม่ได้อยู่ดี
  // (วัดจริงแล้ว: เปิดโหมดลดการเคลื่อนไหว การ์ดยังขยับ -2px เหมือนเดิม)
  return to ? (
    <Link
      to={to}
      className={`${base} block transition-all motion-safe:hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

// โครงกระดูกตอนโหลด: วางบล็อกเทาให้ตรงตำแหน่งของจริง หน้าจะได้ไม่กระตุกตอนข้อมูลมาถึง
/*
 * หน่วงของแต่ละชั้นบนแดชบอร์ด — ชั้นแรกไม่หน่วง (ตัวเลขสำคัญสุด ต้องมาก่อน)
 * ห่างชั้นละ 0.08 วิ รวมจบใน ~0.6 วิ ถ้าห่างกว่านี้จะรู้สึกว่าหน้ายังโหลดไม่เสร็จ
 */
const LAYER_2 = { animationDelay: "0.08s" };
const LAYER_3 = { animationDelay: "0.16s" };

function DashboardSkeleton() {
  return (
    <SkeletonGroup label="กำลังโหลดแดชบอร์ด...">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="h-3 w-24 rounded-md skeleton" />
            <div className="h-6 w-32 rounded-md skeleton mt-2" />
          </div>
        ))}
      </div>
      <div className="h-5 w-40 rounded-md skeleton mb-2" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="min-h-[7.5rem] bg-white border border-slate-200 rounded-lg p-4">
            <div className="h-3 w-20 rounded-md skeleton" />
            <div className="h-7 w-10 rounded-md skeleton mt-2" />
            <div className="h-3 w-28 rounded-md skeleton mt-2" />
          </div>
        ))}
      </div>
      <div className="h-5 w-24 rounded-md skeleton mb-2" />
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <div className="h-3 w-28 rounded-md skeleton" />
            <div className="h-2.5 flex-1 rounded-full skeleton" />
            <div className="h-3 w-24 rounded-md skeleton" />
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}

/** โหลดทุกก้อนพร้อมกัน — ก้อนไหนพังก็ยังแสดงก้อนที่เหลือได้ (แดชบอร์ดว่างทั้งหน้าเพราะก้อนเดียวพังคือแย่กว่า) */
function useDashboardData() {
  const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
  const [pipeline, setPipeline] = useState<DashboardPipelineDto | null>(null);
  const [cash, setCash] = useState<DashboardCashDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [summaryRes, pipelineRes, cashRes] = await Promise.allSettled([
        getDashboardSummary(),
        getPipeline(),
        getContractCash(),
      ]);
      if (!active) return;
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value.summary);
      if (pipelineRes.status === "fulfilled") setPipeline(pipelineRes.value.pipeline);
      if (cashRes.status === "fulfilled") setCash(cashRes.value.cash);
      const failed = [summaryRes, pipelineRes, cashRes].find((r) => r.status === "rejected");
      if (failed?.status === "rejected") {
        setError(failed.reason instanceof ApiError ? failed.reason.message : "โหลดข้อมูลบางส่วนไม่สำเร็จ");
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { summary, pipeline, cash, loading, error };
}

function KpiRow({
  summary,
  cash,
}: Readonly<{ summary: DashboardSummaryDto; cash: DashboardCashDto | null }>) {
  return (
    <div className="enter-rise grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <KpiCard
        primary
        icon={Banknote}
        label="มูลค่ารวมโครงการที่เสนอราคาแล้ว"
        value={summary.totalQuotedValue}
        format={(v) => `${money(v)} บาท`}
      />
      {/* อัตราปิดงาน -- ไม่ทำเป็นลิงก์เพราะยังไม่มีหน้ารายการที่กรองไว้ให้ตรงกับตัวเลขนี้ */}
      <KpiCard
        icon={TrendingUp}
        label="อัตราปิดงาน"
        value={winRateOf(summary.wonProjectCount, summary.quotedProjectCount)}
        format={(v) => `${Math.round(v)}%`}
        progress={summary.quotedProjectCount > 0}
        tone="blue"
        sub={
          summary.quotedProjectCount > 0
            ? `ปิดได้ ${summary.wonProjectCount} จาก ${summary.quotedProjectCount} โครงการที่เสนอราคา`
            : "ยังไม่มีโครงการที่เสนอราคา"
        }
      />
      {/* เงินตามสัญญา: null = โหลดก้อนนี้ไม่สำเร็จ แสดง "—" ไม่ใช่ 0 ที่อ่านเหมือนเก็บครบแล้ว */}
      <KpiCard
        icon={HandCoins}
        label="ยอดคงเหลือตามสัญญา"
        value={cash ? cash.totals.remaining : null}
        format={(v) => `${money(v)} บาท`}
        sub={cash ? `จากสัญญาที่ลงนามแล้ว ${cash.rows.length} ฉบับ` : "โหลดไม่สำเร็จ"}
        tone="teal"
      />
      {/* ไม่มีค้าง = เขียว + เครื่องหมายถูก · มีค้างจริงเท่านั้นถึงเป็นแดง (สีเตือนตลอดเวลาจะหมดความหมาย) */}
      <KpiCard
        icon={cash && cash.totals.overdueAmount === 0 ? CircleCheckBig : AlertTriangle}
        tone={overdueTone(cash)}
        label="ค้างชำระเกินกำหนด"
        value={cash ? cash.totals.overdueAmount : null}
        format={(v) => `${money(v)} บาท`}
        sub={
          cash && cash.totals.overdueAmount === 0
            ? "ยังไม่มีงวดที่เลยกำหนด"
            : "ทวงถามแล้วบันทึกเมื่อได้รับเงิน"
        }
      />
    </div>
  );
}

function RecentProjects({
  projects,
  rowNav,
}: Readonly<{
  projects: DashboardSummaryDto["recentProjects"];
  rowNav: ReturnType<typeof useRowNav>;
}>) {
  if (projects.length === 0) {
    return (
      <p className="enter-rise text-slate-500" style={LAYER_3}>
        ยังไม่มีโครงการ
      </p>
    );
  }
  return (
    <table
      className="enter-rise w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden"
      style={LAYER_3}
    >
      <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
        <tr>
          <th className="px-3 py-2">เลขที่โครงการ</th>
          <th className="px-3 py-2">ชื่อโครงการ</th>
          <th className="px-3 py-2">สถานะ</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => (
          <tr
            key={p.id}
            {...rowNav(`/projects/${p.id}`)}
            className={`border-t border-slate-100 ${rowNavClass}`}
          >
            <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-700">{p.projectNo}</td>
            <td className="px-3 py-2">
              <Link to={`/projects/${p.id}`} onClick={stopRowNav} className="font-medium text-slate-800">
                {p.name}
              </Link>
            </td>
            <td className="px-3 py-2">
              <span className={badgeClass(STATUS_COLOR[p.status])}>{STATUS_LABEL[p.status]}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const rowNav = useRowNav();
  // การ์ด "ต้องทำวันนี้" ถอดออกตามที่ผู้ใช้สั่ง (8 ต.ค. 2026) — รายการเดียวกันดูได้ที่หน้า
  // "งานที่รอดำเนินการ" (/pending-work) ในเมนูข้าง จึงไม่ต้องโหลด pending-work บนหน้านี้แล้ว
  const { summary, pipeline, cash, loading, error } = useDashboardData();

  return (
    <Layout>
      <PageHeader title="แดชบอร์ด" subtitle={<>ยินดีต้อนรับ {user?.fullName}</>} />

      {loading && <DashboardSkeleton />}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!loading && summary && (
        <>
          {/* ไล่ขึ้นทีละชั้นตอนข้อมูลมาถึง — เดิมโครงเทาสลับเป็นเนื้อหาจริงพร้อมกันทั้งหน้าในเฟรมเดียว */}
          <KpiRow summary={summary} cash={cash} />

          {pipeline && (
            <div className="enter-rise" style={LAYER_2}>
              <DashboardPipeline pipeline={pipeline} />
            </div>
          )}

          {/* ตาราง "เงินตามสัญญา" รายสัญญาถูกเอาออก (2026-10-10) — ดูรายโครงการที่แท็บ "รับเงิน" ของโครงการแทน
              ยอดรวมยังอยู่ในการ์ดตัวเลขด้านบน */}
          <h2 className="enter-rise text-lg font-medium text-slate-800 mb-2" style={LAYER_3}>
            โครงการล่าสุด
          </h2>
          <RecentProjects projects={summary.recentProjects} rowNav={rowNav} />
        </>
      )}
    </Layout>
  );
}
