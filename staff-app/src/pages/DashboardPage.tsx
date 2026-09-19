import { Banknote, FolderKanban, Inbox, TrendingUp, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type { DashboardSummaryDto, ProjectStatus } from "@systemboq/shared-types";

import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { getDashboardSummary } from "../lib/dashboard-api";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { badgeClass, type BadgeColor } from "../lib/status-badge";
import { useCountUp } from "../lib/use-count-up";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคาแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

const STATUS_ORDER: ProjectStatus[] = [
  "DRAFT",
  "QUOTED",
  "REJECTED",
  "APPROVED",
  "COMPLETED",
  "CANCELLED",
];

// ใช้สีเดียวกับรายการโปรเจกต์ เพื่อให้สถานะอ่านเหมือนกันไม่ว่าจะปรากฏที่ไหน
const STATUS_COLOR: Record<ProjectStatus, BadgeColor> = {
  DRAFT: "slate",
  QUOTED: "amber",
  REJECTED: "red",
  APPROVED: "blue",
  COMPLETED: "emerald",
  CANCELLED: "red",
};

// แต่งเพิ่ม: แถบสีบางบนหัวกล่องนับสถานะ ให้แต่ละสถานะแยกออกจากกันด้วยตา -- เขียนคลาสเต็ม ๆ
// เพราะ JIT ของ Tailwind อ่านได้เฉพาะ literal
const STATUS_ACCENT: Record<ProjectStatus, string> = {
  DRAFT: "border-t-slate-400",
  QUOTED: "border-t-amber-400",
  REJECTED: "border-t-red-400",
  APPROVED: "border-t-blue-500",
  COMPLETED: "border-t-emerald-500",
  CANCELLED: "border-t-red-400",
};

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// อัตราปิดงาน: คืน null เมื่อยังไม่เคยเสนอราคาให้ใครเลย -- โชว์ "—" ดีกว่าโชว์ 0% ซึ่งอ่านเหมือน
// ปิดงานไม่ได้สักงาน ทั้งที่ความจริงคือยังไม่มีข้อมูลพอจะคิด
function winRateOf(won: number, quoted: number): number | null {
  return quoted > 0 ? Math.round((won / quoted) * 100) : null;
}

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
}

function KpiCard({ icon: Icon, label, value, format, sub, to, primary, progress }: KpiCardProps) {
  const animated = useCountUp(value ?? 0);
  const hasValue = value !== null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs ${primary ? "text-slate-300" : "text-slate-500"}`}>{label}</p>
        <Icon size={16} className={primary ? "text-white/70" : "text-brand"} aria-hidden />
      </div>
      <p className={`text-xl font-semibold mt-1 ${primary ? "" : "text-slate-800"}`}>
        {hasValue ? format(animated) : "—"}
      </p>
      {progress && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100" aria-hidden>
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${Math.min(100, Math.max(0, animated))}%` }}
          />
        </div>
      )}
      {sub && (
        <p className={`text-xs mt-0.5 ${primary ? "text-slate-400" : "text-slate-500"}`}>{sub}</p>
      )}
    </>
  );

  const base = primary
    ? "bg-brand text-white rounded-lg p-4 shadow-sm"
    : "bg-white border border-slate-200 rounded-lg p-4";

  // ยกการ์ดตอน hover เฉพาะใบที่กดได้จริง -- การ์ดที่กดไม่ได้แต่ขยับจะหลอกให้คนพยายามกด
  //
  // การยกตัวต้องครอบด้วย motion-safe: เท่านั้น เคยเขียนเป็น motion-reduce:transform-none
  // ซึ่ง **ไม่มีผลเลยใน Tailwind v4** เพราะ v4 ขยับด้วยคุณสมบัติ translate ไม่ใช่ transform
  // แถมกฎที่มี :hover ยังมี specificity สูงกว่ากฎใน media query จึงสั่งทับไม่ได้อยู่ดี
  // (วัดจริงแล้ว: เปิดโหมดลดการเคลื่อนไหว การ์ดยังขยับ -2px เหมือนเดิม)
  return to ? (
    <Link
      to={to}
      className={`${base} block transition-all motion-safe:hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md motion-reduce:transition-none`}
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
    <div className="animate-pulse" aria-hidden>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="h-3 w-24 rounded-md bg-slate-200" />
            <div className="h-6 w-32 rounded-md bg-slate-200 mt-2" />
          </div>
        ))}
      </div>
      <div className="h-5 w-40 rounded-md bg-slate-200 mb-2" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
            <div className="h-7 w-10 rounded-md bg-slate-200 mx-auto" />
            <div className="h-3 w-16 rounded-md bg-slate-200 mx-auto mt-2" />
          </div>
        ))}
      </div>
      <div className="h-5 w-32 rounded-md bg-slate-200 mb-2" />
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-3">
            <div className="h-3 w-28 rounded-md bg-slate-200" />
            <div className="h-3 flex-1 rounded-md bg-slate-200" />
            <div className="h-5 w-20 rounded-full bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const rowNav = useRowNav();
  const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardSummary()
      .then((res) => setSummary(res.summary))
      .catch((err) => setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <PageHeader title="แดชบอร์ด" subtitle={<>ยินดีต้อนรับ {user?.fullName}</>} />

      {loading && <DashboardSkeleton />}
      {error && <p className="text-red-600">{error}</p>}

      {summary && (
        <>
          {/* ไล่ขึ้นทีละชั้นตอนข้อมูลมาถึง — เดิมโครงเทาสลับเป็นเนื้อหาจริงพร้อมกันทั้งหน้าในเฟรมเดียว */}
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
              sub={
                summary.quotedProjectCount > 0
                  ? `ปิดได้ ${summary.wonProjectCount} จาก ${summary.quotedProjectCount} โครงการที่เสนอราคา`
                  : "ยังไม่มีโครงการที่เสนอราคา"
              }
            />
            <KpiCard
              icon={Inbox}
              label="คำขอใหม่ที่ยังไม่ติดต่อ"
              value={summary.newLeadsCount}
              format={(v) => String(Math.round(v))}
              to="/leads"
            />
            <KpiCard
              icon={FolderKanban}
              label="โครงการทั้งหมด"
              value={Object.values(summary.projectCounts).reduce((a, b) => a + b, 0)}
              format={(v) => String(Math.round(v))}
              to="/projects"
            />
          </div>

          <h2 className="enter-rise text-lg font-medium text-slate-800 mb-2" style={LAYER_2}>
            โครงการตามสถานะ
          </h2>
          <div
            className="enter-rise grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8"
            style={LAYER_2}
          >
            {/* กดกล่องสถานะ = เปิดรายการโครงการที่กรองสถานะนั้นไว้ให้แล้ว (ProjectsPage อ่าน ?status=) */}
            {STATUS_ORDER.map((status) => (
              <Link
                key={status}
                to={`/projects?status=${status}`}
                title={`ดูโครงการสถานะ "${STATUS_LABEL[status]}"`}
                className={`bg-white border border-slate-200 border-t-2 ${STATUS_ACCENT[status]} rounded-lg p-3 text-center block transition-all motion-safe:hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none`}
              >
                <p className="text-2xl font-semibold text-slate-800">
                  {summary.projectCounts[status]}
                </p>
                <p className="text-xs text-slate-500 mt-1">{STATUS_LABEL[status]}</p>
              </Link>
            ))}
          </div>

          <h2 className="enter-rise text-lg font-medium text-slate-800 mb-2" style={LAYER_3}>
            โครงการล่าสุด
          </h2>
          {summary.recentProjects.length === 0 && (
            <p className="enter-rise text-slate-500" style={LAYER_3}>
              ยังไม่มีโครงการ
            </p>
          )}
          {summary.recentProjects.length > 0 && (
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
                {summary.recentProjects.map((p) => (
                  <tr
                    key={p.id}
                    {...rowNav(`/projects/${p.id}`)}
                    className={`border-t border-slate-100 ${rowNavClass}`}
                  >
                    <td className="px-3 py-2 text-slate-700">{p.projectNo}</td>
                    <td className="px-3 py-2">
                      <Link
                        to={`/projects/${p.id}`}
                        onClick={stopRowNav}
                        className="font-medium text-slate-800"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <span className={badgeClass(STATUS_COLOR[p.status])}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </Layout>
  );
}
