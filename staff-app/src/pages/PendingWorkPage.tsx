import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { PendingWorkDto } from "@systemboq/shared-types";

import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { QuoteViewCell } from "../components/QuoteViewCell";
import { ApiError } from "../lib/api";
import { getPendingWork } from "../lib/dashboard-api";
import { quoteSignal, SIGNAL_CLASS, SIGNAL_ORDER } from "../lib/quote-signal";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";

// กำหนดส่วนต่าง ๆ เองแทนค่าเริ่มต้นตาม locale ซึ่งจะต่อวินาทีมาด้วย -- พนักงานต้องการแค่วันที่
// และเวลาถึงระดับนาทีพอ
function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** วันที่ล้วน (YYYY-MM-DD) — อ่านเป็น UTC ให้ตรงกับคอลัมน์ DATE ที่เซิร์ฟเวอร์เก็บ */
function formatIsoDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysSince(value: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / MS_PER_DAY));
}

// ยิ่งรอนานยิ่งต้องรีบตาม: เกิน 14 วัน = แดง, เกิน 7 วัน = เหลือง, ใหม่กว่านั้น = เทา
// (เขียนคลาสเต็มเพราะ Tailwind JIT อ่านเฉพาะ literal)
function waitingBadgeClass(days: number): string {
  if (days > 14) return "bg-red-100 text-red-700";
  if (days > 7) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-500";
}

export function PendingWorkPage() {
  const rowNav = useRowNav();
  const [data, setData] = useState<PendingWorkDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function silentRefresh() {
    try {
      const res = await getPendingWork();
      setData(res.pendingWork);
    } catch {
      // เงียบไว้ -- การ poll เบื้องหลังที่ล้มเหลวไม่ควรรบกวนส่วนที่เหลือของหน้า
    }
  }

  useEffect(() => {
    getPendingWork()
      .then((res) => setData(res.pendingWork))
      .catch((err) => setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const timer = setInterval(silentRefresh, 30_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Layout>
      <PageHeader
        title="งานที่รอดำเนินการ"
        subtitle="รวมทุกอย่างที่ค้างให้ทำ ไม่ต้องไล่เปิดทีละโครงการ"
      />

      {loading && <p className="text-slate-500">กำลังโหลด...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {data && (
        <>
          {/* วางไว้บนสุด: ดีลที่เสียแล้วคือเรื่องที่ต้องรีบตัดสินใจที่สุด และเดิมไม่มีหมวดนี้เลย
              งานจึงหายออกจากหน้านี้เงียบ ๆ เหลือร่องรอยแค่การแจ้งเตือนที่ไถผ่านไปก็หาย */}
          <h2 className="text-lg font-medium text-slate-800 mb-2">
            ใบเสนอราคาที่ลูกค้าปฏิเสธ ({data.rejectedQuotes.length})
          </h2>
          {data.rejectedQuotes.length === 0 && <p className="text-slate-500 mb-8">ไม่มีรายการค้าง</p>}
          {data.rejectedQuotes.length > 0 && (
            <table className="w-full text-sm bg-white border border-red-200 rounded-lg overflow-hidden mb-8">
              <thead className="bg-red-50 text-red-800 font-medium text-left">
                <tr>
                  <th className="px-3 py-2">โครงการ</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2">ใบเสนอราคา</th>
                  <th className="px-3 py-2">เหตุผลที่ปฏิเสธ</th>
                  <th className="px-3 py-2">ปฏิเสธเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {data.rejectedQuotes.map(({ project, quote }) => (
                  <tr
                    key={quote.id}
                    {...rowNav(`/projects/${project.id}`)}
                    className={`border-t border-slate-100 ${rowNavClass}`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        to={`/projects/${project.id}`}
                        onClick={stopRowNav}
                        className="font-medium text-slate-800"
                      >
                        {project.name}
                      </Link>
                      <p className="text-xs text-slate-500">{project.projectNo}</p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{project.customer?.fullName ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{quote.quoteNo}</td>
                    <td className="px-3 py-2 max-w-xs">
                      {quote.customerNote ? (
                        <span className="text-slate-700">{quote.customerNote}</span>
                      ) : (
                        <span className="text-slate-400">ไม่ได้ระบุ</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {quote.respondedAt ? formatDateTime(quote.respondedAt) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="text-lg font-medium text-slate-800 mb-2">
            ใบเสนอราคาที่ลูกค้าขอแก้ไข ({data.pendingRevisions.length})
          </h2>
          {data.pendingRevisions.length === 0 && (
            <p className="text-slate-500 mb-8">ไม่มีรายการค้าง</p>
          )}
          {data.pendingRevisions.length > 0 && (
            <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70 mb-8">
              <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
                <tr>
                  <th className="px-3 py-2">โครงการ</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2">ใบเสนอราคา</th>
                  <th className="px-3 py-2">รายละเอียดที่ลูกค้าขอแก้</th>
                  <th className="px-3 py-2">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {data.pendingRevisions.map(({ project, quote }) => (
                  <tr
                    key={quote.id}
                    {...rowNav(`/projects/${project.id}`)}
                    className={`border-t border-slate-100 ${rowNavClass}`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        to={`/projects/${project.id}`}
                        onClick={stopRowNav}
                        className="font-medium text-slate-800"
                      >
                        {project.name}
                      </Link>
                      <p className="text-xs text-slate-500">{project.projectNo}</p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{project.customer?.fullName ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{quote.quoteNo}</td>
                    <td className="px-3 py-2 text-slate-700 max-w-xs">{quote.customerNote ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {quote.respondedAt ? formatDateTime(quote.respondedAt) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="text-lg font-medium text-slate-800 mb-2">
            ใบเสนอราคาที่รอลูกค้าตอบ ({data.awaitingResponse.length})
          </h2>
          {data.awaitingResponse.length === 0 && (
            <p className="text-slate-500 mb-8">ไม่มีรายการค้าง</p>
          )}
          {data.awaitingResponse.length > 0 && (
            <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70 mb-8">
              <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
                <tr>
                  <th className="px-3 py-2">โครงการ</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2">ใบเสนอราคา</th>
                  <th className="px-3 py-2">ส่งเมื่อ</th>
                  <th className="px-3 py-2">ลูกค้าเปิดดู</th>
                  <th className="px-3 py-2">รอมาแล้ว</th>
                  <th className="px-3 py-2">ควรทำอะไร</th>
                </tr>
              </thead>
              <tbody>
                {[...data.awaitingResponse]
                  // เรียงตามความเร่งด่วนก่อน แล้วค่อยตามเวลาที่รอ -- เดิมเรียงตามวันที่ส่งอย่างเดียว
                  // ซึ่งดันใบที่ "รอนานแต่ลูกค้าอ่านแล้วกำลังคิดอยู่" ขึ้นเหนือใบที่ "ส่งไป 4 วัน
                  // ยังไม่เปิดเลย" ทั้งที่อย่างหลังคือเรื่องที่ต้องรีบเช็คกว่า
                  .sort((a, b) => {
                    const byLevel =
                      SIGNAL_ORDER[quoteSignal(a.quote).level] -
                      SIGNAL_ORDER[quoteSignal(b.quote).level];
                    if (byLevel !== 0) return byLevel;
                    return (a.quote.sentAt ? new Date(a.quote.sentAt).getTime() : 0) -
                      (b.quote.sentAt ? new Date(b.quote.sentAt).getTime() : 0);
                  })
                  .map(({ project, quote }) => {
                  const days = quote.sentAt ? daysSince(quote.sentAt) : null;
                  const signal = quoteSignal(quote);
                  return (
                    <tr
                      key={quote.id}
                      {...rowNav(`/projects/${project.id}`)}
                      className={`border-t border-slate-100 ${rowNavClass}`}
                    >
                      <td className="px-3 py-2">
                        <Link
                          to={`/projects/${project.id}`}
                          onClick={stopRowNav}
                          className="font-medium text-slate-800"
                        >
                          {project.name}
                        </Link>
                        <p className="text-xs text-slate-500">{project.projectNo}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{project.customer?.fullName ?? "-"}</td>
                      <td className="px-3 py-2 text-slate-700">{quote.quoteNo}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {quote.sentAt ? formatDateTime(quote.sentAt) : "-"}
                      </td>
                      {/* ส่งไปกี่วันแล้วอย่างเดียวไม่พอจะตัดสินใจ -- "ส่งไป 5 วัน ยังไม่เปิดเลย"
                          (ลิงก์ไม่ถึงมือ? ส่งผิดคน?) คนละเรื่องกับ "เปิดดู 4 ครั้งแล้วแต่ยังเงียบ"
                          (กำลังตัดสินใจ/เทียบราคาอยู่) สองอย่างนี้ตามงานคนละแบบกัน */}
                      <td className="px-3 py-2">
                        <QuoteViewCell quote={quote} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {days === null ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${waitingBadgeClass(days)}`}
                          >
                            {days === 0 ? "วันนี้" : `${days} วัน`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className={`text-sm ${SIGNAL_CLASS[signal.level]}`}>{signal.headline}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{signal.action}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/*
            งานที่ทำเสร็จแล้วแต่ยังไม่ได้เงิน — อยู่เหนือคำขอใหม่เพราะเป็นเงินที่หามาได้แล้ว
            เรียงจากค้างนานสุดมาจากเซิร์ฟเวอร์ (แพตเทิร์นเดียวกับใบเสนอราคาที่รอตอบ)
          */}
          <h2 className="text-lg font-medium text-slate-800 mb-2">
            งวดที่ถึงกำหนดแล้วแต่ยังไม่ได้รับเงิน ({data.awaitingPayment.length})
          </h2>
          {data.awaitingPayment.length === 0 && (
            <p className="text-slate-500 mb-8">ไม่มีรายการค้าง</p>
          )}
          {data.awaitingPayment.length > 0 && (
            <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70 mb-8">
              <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
                <tr>
                  <th className="px-3 py-2">โครงการ</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2">งวด</th>
                  <th className="px-3 py-2">ครบกำหนด</th>
                  <th className="px-3 py-2">ค้างมาแล้ว</th>
                  <th className="px-3 py-2 text-right">ยอดที่ยังไม่ได้รับ</th>
                </tr>
              </thead>
              <tbody>
                {data.awaitingPayment.map((row) => (
                  <tr
                    key={row.installment.id}
                    {...rowNav(`/projects/${row.project.id}`)}
                    className={`border-t border-slate-100 ${rowNavClass}`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        to={`/projects/${row.project.id}`}
                        onClick={stopRowNav}
                        className="font-medium text-slate-800"
                      >
                        {row.project.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {row.project.projectNo} · {row.contract.contractNo}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.project.customer?.fullName ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-700">
                      งวดที่ {row.installment.seq}
                      <p className="text-xs text-slate-500 max-w-xs truncate">
                        {row.installment.milestone}
                      </p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                      {formatIsoDate(row.installment.dueOn)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${waitingBadgeClass(row.daysOverdue)}`}
                      >
                        {row.daysOverdue === 0 ? "ครบกำหนดวันนี้" : `${row.daysOverdue} วัน`}
                      </span>
                    </td>
                    {/* ยอดที่ยังขาด ไม่ใช่ยอดเต็มของงวด -- บางงวดรับมาบางส่วนแล้ว */}
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                      {money(row.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="text-lg font-medium text-slate-800 mb-2">
            คำขอใหม่ที่ยังไม่ได้ติดต่อ ({data.newLeads.length})
          </h2>
          {data.newLeads.length === 0 && <p className="text-slate-500">ไม่มีรายการค้าง</p>}
          {data.newLeads.length > 0 && (
            <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70">
              <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
                <tr>
                  <th className="px-3 py-2">ชื่อ</th>
                  <th className="px-3 py-2">เบอร์โทร</th>
                  <th className="px-3 py-2">บริการที่สนใจ</th>
                  <th className="px-3 py-2">ข้อความ</th>
                  <th className="px-3 py-2">วันที่</th>
                </tr>
              </thead>
              <tbody>
                {data.newLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    {...rowNav("/leads")}
                    className={`border-t border-slate-100 ${rowNavClass}`}
                  >
                    <td className="px-3 py-2 text-slate-800">
                      <Link to="/leads" onClick={stopRowNav} className="font-medium">
                        {lead.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{lead.phone}</td>
                    <td className="px-3 py-2 text-slate-700">{lead.serviceType}</td>
                    <td className="px-3 py-2 text-slate-700 max-w-xs truncate">{lead.message ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{formatDateTime(lead.createdAt)}</td>
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
