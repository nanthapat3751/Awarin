import {
  Check,
  Eye,
  FileText,
  LogIn,
  MessageSquare,
  Paperclip,
  Shield,
  UserCog,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { CustomerActivityDto, CustomerActivityKind } from "@systemboq/shared-types";

import { Pagination } from "./Pagination";

/** กี่รายการต่อหน้า — แถวตารางสูง ~34px 20 แถวจึงพอดีหนึ่งจอ */
const PAGE_SIZE_DEFAULT = 20;

// สีใช้เฉพาะเมื่อสื่อความหมาย (ยอมรับ/ปฏิเสธ/ความปลอดภัย) เหตุการณ์กลาง ๆ เป็นเทา
// ไม่งั้นตารางจะกลายเป็นพลุสี — กฎเดียวกับ ProjectActivity
const KIND_STYLE: Record<CustomerActivityKind, { Icon: LucideIcon; className: string }> = {
  account: { Icon: UserPlus, className: "text-slate-400" },
  login: { Icon: LogIn, className: "text-slate-400" },
  security: { Icon: Shield, className: "text-amber-600" },
  lead: { Icon: MessageSquare, className: "text-blue-600" },
  view: { Icon: Eye, className: "text-sky-600" },
  file: { Icon: Paperclip, className: "text-slate-400" },
  accepted: { Icon: Check, className: "text-emerald-600" },
  rejected: { Icon: X, className: "text-red-600" },
  revision: { Icon: MessageSquare, className: "text-amber-600" },
  project: { Icon: FileText, className: "text-slate-400" },
  // งานของพนักงาน ไม่ใช่สัญญาณจากลูกค้า — เป็นเทาเสมอ ไม่แย่งสายตาจากแถวที่ลูกค้าทำ
  staff: { Icon: UserCog, className: "text-slate-400" },
  other: { Icon: FileText, className: "text-slate-400" },
};

/** เวลาแบบละเอียดถึงนาที — ตารางนี้ต้องอ่านเป็น "10:32 → 10:35 → 10:41" ได้ */
function clockTime(value: string): string {
  return new Date(value).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfThatDay) / 86_400_000);
  if (diffDays <= 0) return "วันนี้";
  if (diffDays === 1) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

export interface ActivityRow extends CustomerActivityDto {
  /** มีเฉพาะในฟีดรวมทั้งบริษัท */
  customerId?: string | null;
  customerName?: string | null;
}

interface DayGroup {
  label: string;
  items: ActivityRow[];
}

function groupByDay(items: ActivityRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/**
 * ตารางกิจกรรมของลูกค้า — ใช้ร่วมกันสามที่ (แฟ้มลูกค้า · ฟีดรวมทั้งบริษัท · หน้ารายละเอียดโครงการ)
 *
 * เคยเป็นไทม์ไลน์แบบหมุดต่อเส้น แต่วัดแล้วข้อความกินความกว้างแค่ 618px จากพื้นที่ 1,152px
 * และแต่ละรายการกิน 3 บรรทัด (เฉลี่ย 49px) ทำให้ 20 รายการยาว 2 จอ — เปลี่ยนเป็นตารางแบบ
 * เดียวกับหน้าโครงการ/คำขอ/วัสดุ: บรรทัดเดียวจบ อ่านเป็นคอลัมน์ และหน้าตาเข้าชุดกับทั้งระบบ
 *
 * เวลายังอยู่คอลัมน์แรกเสมอ เพื่อให้กวาดตาลงมาแล้วอ่านเป็นลำดับเหตุการณ์ได้เหมือนเดิม
 * ส่วนวันที่กลายเป็นแถบคั่น (แพตเทิร์นเดียวกับแถบหมวดในตาราง BOQ)
 */
export function CustomerActivityList({
  items,
  showCustomer = false,
  showProject = true,
  pageSize = PAGE_SIZE_DEFAULT,
  framed = true,
}: Readonly<{
  items: ActivityRow[];
  /** ฟีดรวมทั้งบริษัทต้องบอกว่าใครทำ */
  showCustomer?: boolean;
  /** หน้าโครงการไม่ต้องบอกชื่อโครงการซ้ำ เพราะอยู่ในโครงการนั้นอยู่แล้ว */
  showProject?: boolean;
  /** ใส่ 0 เพื่อแสดงทั้งหมดในหน้าเดียว */
  pageSize?: number;
  /** false เมื่อวางในการ์ดอยู่แล้ว — ตีกรอบซ้อนกรอบทำให้หน้าดูเป็นกล่องซ้อนกล่อง */
  framed?: boolean;
}>) {
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);

  // ชุดข้อมูลเปลี่ยน (เปลี่ยนตัวกรอง/เปลี่ยนลูกค้า) ต้องกลับไปหน้าแรก ไม่งั้นจะค้างอยู่หน้าท้าย ๆ
  // ของผลลัพธ์ชุดเก่า แล้วเหมือนตัวกรองไม่ทำงาน
  useEffect(() => {
    setPage(1);
  }, [items]);

  const paged = pageSize > 0;
  const pageCount = paged ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount);
  const shown = paged ? items.slice((safePage - 1) * pageSize, safePage * pageSize) : items;

  // ไอพีส่งมาเฉพาะ OWNER (ADMIN ได้ null) — ไม่มีใครกรอกมาก็ไม่ต้องกินคอลัมน์
  const showIp = shown.some((i) => i.ip);
  const colCount = 2 + (showCustomer ? 1 : 0) + (showProject ? 1 : 0) + (showIp ? 1 : 0);

  function goPage(next: number) {
    setPage(next);
    // กดเปลี่ยนหน้าจากท้ายตารางแล้วต้องได้เริ่มอ่านจากหัวตาราง ไม่ใช่โผล่กลางแถว
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <div ref={topRef} className="scroll-mt-4">
        <table
          className={`w-full text-sm ${
            framed ? "overflow-hidden rounded-lg border border-slate-200 bg-white" : ""
          }`}
        >
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
            <tr>
              <th className="w-16 whitespace-nowrap px-3 py-2">เวลา</th>
              {showCustomer && <th className="whitespace-nowrap px-3 py-2">ลูกค้า</th>}
              <th className="px-3 py-2">กิจกรรม</th>
              {showProject && <th className="whitespace-nowrap px-3 py-2">โครงการ</th>}
              {/* ใช้ "IP" ไม่ใช่ "ไอพี" — คำทับศัพท์อ่านช้ากว่าตัวย่อที่คนไอทีเห็นจนชินแล้ว
                  (ในหน้านโยบายความเป็นส่วนตัวยังใช้ "หมายเลขไอพี" เพราะอยู่ในประโยคไทยเต็ม) */}
              {showIp && <th className="whitespace-nowrap px-3 py-2 text-right">IP</th>}
            </tr>
          </thead>
          <tbody>
            {groupByDay(shown).map((group) => (
              <Fragment key={group.label}>
                <tr className="border-t border-slate-200 bg-slate-100/70">
                  <td colSpan={colCount} className="px-3 py-1.5">
                    <span className="text-xs font-medium text-slate-600">{group.label}</span>
                    <span className="ms-2 text-xs text-slate-400">
                      {group.items.length} รายการ
                    </span>
                  </td>
                </tr>

                {group.items.map((item) => {
                  const style = KIND_STYLE[item.kind] ?? KIND_STYLE.other;
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-slate-100 hover:bg-slate-50/70"
                    >
                      <td className="whitespace-nowrap px-3 py-2 align-top tabular-nums text-slate-400">
                        {clockTime(item.at)}
                      </td>

                      {showCustomer && (
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          {item.customerId && item.customerName ? (
                            <Link
                              to={`/customers/${item.customerId}`}
                              className="text-slate-600 underline-offset-2 hover:underline"
                            >
                              {item.customerName}
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      <td className="px-3 py-2 align-top">
                        <span className="flex items-start gap-2">
                          <style.Icon
                            size={14}
                            aria-hidden
                            className={`mt-0.5 shrink-0 ${style.className}`}
                          />
                          <span className="text-slate-700">
                            {item.title}
                            {item.detail && (
                              <span className="text-slate-500"> · {item.detail}</span>
                            )}
                          </span>
                        </span>
                      </td>

                      {showProject && (
                        <td className="px-3 py-2 align-top">
                          {item.projectId && item.projectName ? (
                            <Link
                              to={`/projects/${item.projectId}`}
                              className="text-slate-600 underline-offset-2 hover:underline"
                            >
                              {item.projectName}
                            </Link>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      )}

                      {showIp && (
                        <td className="whitespace-nowrap px-3 py-2 text-right align-top text-xs tabular-nums text-slate-400">
                          {item.ip ?? "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={safePage} pageCount={pageCount} onChange={goPage} />
    </>
  );
}
