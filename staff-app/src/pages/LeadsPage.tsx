import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  areaRangeLabel,
  GENERAL_INQUIRY_SERVICE_TYPE,
  type LeadDto,
  type LeadListPageDto,
  type LeadStatus,
} from "@systemboq/shared-types";

import { Button, buttonClasses } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { PeriodPicker } from "../components/PeriodPicker";
import { StatusChips } from "../components/StatusChips";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import { restoreTrashItem } from "../lib/trash-api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import {
  createProjectFromLead,
  deleteLead,
  listLeadsPage,
  replyToLead,
  updateLeadStatus,
} from "../lib/leads-api";
import { badgeClass, type BadgeColor } from "../lib/status-badge";
import { useListParams } from "../lib/use-list-params";
import { TableSkeleton } from "../components/Skeleton";
import { RowMenu } from "../components/RowMenu";

const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "ใหม่",
  CONTACTED: "ติดต่อแล้ว",
  QUOTED: "เสนอราคาแล้ว",
  CLOSED: "ปิดงาน",
  REJECTED: "ปฏิเสธ",
};

const STATUS_COLOR: Record<LeadStatus, BadgeColor> = {
  NEW: "amber",
  CONTACTED: "blue",
  QUOTED: "indigo",
  CLOSED: "emerald",
  REJECTED: "red",
};

const ALL_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUOTED", "CLOSED", "REJECTED"];

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

function formatDateOnly(value: string): string {
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

// ข้อมูลโครงการเบื้องต้นที่ลูกค้าให้มาในคำขอ (ถ้ามี) — พนักงานเห็นตั้งแต่ก่อนสร้างโครงการ และค่า
// เหล่านี้จะถูกเติมให้โครงการอัตโนมัติเมื่อกด "สร้างโครงการ"
function leadProjectInfo(lead: LeadDto): string[] {
  const parts: string[] = [];
  if (lead.siteAddress) parts.push(`ที่ตั้ง: ${lead.siteAddress}`);
  if (lead.areaSqm) parts.push(`~${Number(lead.areaSqm).toLocaleString("th-TH")} ตร.ม.`);
  // ช่วงที่ลูกค้าเลือก ("ยังไม่ทราบ" ไม่ต้องเขียน — ป้ายเตือนบอกอยู่แล้ว)
  else if (lead.areaRange && lead.areaRange !== "UNKNOWN") parts.push(`พื้นที่ ${areaRangeLabel(lead.areaRange)}`);
  if (lead.desiredStartDate) parts.push(`อยากเริ่ม ${formatDateOnly(lead.desiredStartDate)}`);
  return parts;
}

/**
 * งานออกแบบ/ก่อสร้างที่ยังไม่มีตัวเลขพื้นที่จริง (เลือกช่วง/ยังไม่ทราบ/คำขอเก่า) และยังไม่ได้สร้างโครงการ
 * — ช่วงไม่ถูกเติมลงโครงการ พนักงานต้องถามตัวเลขจริงตอนโทรกลับ (พื้นที่โครงการขับการถอดปริมาณ BOQ)
 */
function needsAreaAsk(lead: LeadDto): boolean {
  return lead.serviceType !== GENERAL_INQUIRY_SERVICE_TYPE && !lead.areaSqm && !lead.projectId;
}

// สั้นพอให้อยู่บรรทัดเดียวในคอลัมน์ข้อความ · คำอธิบายเต็มอยู่ใน title (ชี้ค้าง) และในหน้าต่างตอบกลับ
const AREA_ASK_LABEL = "ถามพื้นที่ตอนโทรกลับ";
const AREA_ASK_DETAIL = "ยังไม่มีตัวเลขพื้นที่จริง — ถามลูกค้าตอนโทรกลับ แล้วกรอกในหน้าโครงการ";

/** ช่อง "โครงการ" ของคำขอ: สอบถามทั่วไป = ไม่มี · เป็นโครงการแล้ว = ลิงก์ไป · ยังไม่เป็น = ปุ่มสร้าง */
function LeadProjectCell({
  lead,
  creating,
  onCreate,
}: Readonly<{ lead: LeadDto; creating: boolean; onCreate: () => void }>) {
  if (lead.serviceType === GENERAL_INQUIRY_SERVICE_TYPE) {
    return <span className="text-slate-300">—</span>;
  }
  if (lead.projectId) {
    return (
      <Link to={`/projects/${lead.projectId}`} className={`${buttonClasses("ghost", "sm")} whitespace-nowrap`}>
        ไปที่โครงการ
      </Link>
    );
  }
  return (
    <Button size="sm" disabled={creating} onClick={onCreate} className="whitespace-nowrap">
      สร้างโครงการ
    </Button>
  );
}

export function LeadsPage() {
  const [data, setData] = useState<LeadListPageDto | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingProjectFor, setCreatingProjectFor] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyingLead, setReplyingLead] = useState<LeadDto | null>(null);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  // ตัวกรอง (คำค้น/สถานะ/ช่วงเวลา/หน้า) อยู่ใน URL — ค้นหา กรอง นับ และแบ่งหน้าทำที่เซิร์ฟเวอร์ หน้าละ 15
  const list = useListParams(ALL_STATUSES);
  const { query } = list;
  // การ poll ทุก 30 วินาทีต้องขอ "หน้าที่กำลังดูอยู่" เสมอ ไม่ใช่ค่าตอนตั้งตัวจับเวลา
  const queryRef = useRef(query);
  queryRef.current = query;

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 15;
  const page = data?.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = (page - 1) * pageSize;
  const filtering = Boolean(list.q || list.status || list.period);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listLeadsPage(queryRef.current);
      setData(res);
      // ขอหน้าเกินมา (เช่น ลบแถวสุดท้ายของหน้าท้าย) เซิร์ฟเวอร์ให้หน้าสุดท้าย — ให้ URL ตามด้วย
      if (res.page !== queryRef.current.page) list.setPage(res.page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function silentRefresh() {
    try {
      setData(await listLeadsPage(queryRef.current));
    } catch {
      // เงียบไว้ -- การ poll เบื้องหลังที่ล้มเหลวไม่ควรรบกวนส่วนที่เหลือของหน้า
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const timer = setInterval(silentRefresh, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // กล่องตอบกลับเปิดอยู่ → Esc ปิดได้เหมือนกล่องยืนยัน
  useEffect(() => {
    if (!replyingLead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReplyingLead(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [replyingLead]);

  async function handleStatusChange(id: string, status: LeadStatus) {
    try {
      await updateLeadStatus(id, status);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function handleCreateProject(id: string) {
    setCreatingProjectFor(id);
    try {
      await createProjectFromLead(id);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "สร้างโครงการไม่สำเร็จ");
    } finally {
      setCreatingProjectFor(null);
    }
  }

  async function handleDelete(lead: LeadDto) {
    const ok = await confirm(
      `ย้ายคำขอจาก "${lead.name}" ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ`,
      { confirmLabel: "ลบ", variant: "danger" },
    );
    if (!ok) return;
    setDeletingId(lead.id);
    try {
      await deleteLead(lead.id);
      toast.undo("ย้ายคำขอไปถังขยะแล้ว", async () => {
        await restoreTrashItem("lead", lead.id);
        await refresh();
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบคำขอไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  }

  function openReply(lead: LeadDto) {
    setReplyingLead(lead);
    setReplyText(lead.reply ?? "");
  }

  async function submitReply() {
    if (!replyingLead || !replyText.trim()) return;
    setSavingReply(true);
    try {
      await replyToLead(replyingLead.id, replyText.trim());
      setReplyingLead(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ส่งคำตอบไม่สำเร็จ");
    } finally {
      setSavingReply(false);
    }
  }

  return (
    <Layout>
      <PageHeader title="คำขอจากลูกค้า" />

      <div className="mb-3 flex flex-wrap gap-2">
        {/* ค้นหา ชื่อ/เบอร์/อีเมล/บริการ/ข้อความ */}
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="ค้นหาชื่อ / เบอร์ / อีเมล / ข้อความ"
          className="min-w-60 flex-1"
        />
        <PeriodPicker value={list.period} onChange={list.setPeriod} noun="คำขอ" />
      </div>
      <StatusChips
        statuses={ALL_STATUSES}
        labels={STATUS_LABEL}
        counts={data?.counts}
        value={list.status}
        onChange={list.setStatus}
      />

      {loading && !data && <TableSkeleton rows={8} cols={7} />}
      {error && <p className="text-red-600">{error}</p>}
      {data && !error && leads.length === 0 && (
        <p className="text-slate-500">{filtering ? "ไม่พบคำขอที่ตรงกับตัวกรอง" : "ยังไม่มีคำขอ"}</p>
      )}

      {leads.length > 0 && (
        <p className="text-xs text-slate-500 mb-2">
          แสดง {pageStart + 1}-{pageStart + leads.length} จาก {total} คำขอ
        </p>
      )}

      {leads.length > 0 && (
        <div
          className={`overflow-x-auto rounded-lg border border-slate-200 bg-white transition-opacity ${loading ? "opacity-60" : ""}`}
          aria-busy={loading}
        >
        <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              {/* iPad (<1280): เบอร์/บริการ ไปใต้ชื่อ · ตอบกลับ/โครงการ/ลบ รวมเป็น ⋯ (ผู้ใช้สั่ง 18 ต.ค.) */}
              <th className="px-3 py-2">ชื่อ</th>
              <th className="hidden px-3 py-2 xl:table-cell">เบอร์โทร</th>
              <th className="hidden px-3 py-2 xl:table-cell">บริการที่สนใจ</th>
              <th className="px-3 py-2">ข้อความ</th>
              <th className="px-3 py-2">วันที่</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="hidden px-3 py-2 xl:table-cell">ตอบกลับ</th>
              <th className="hidden px-3 py-2 xl:table-cell">โครงการ</th>
              <th className="hidden px-3 py-2 xl:table-cell"></th>
              <th className="px-3 py-2 xl:hidden"><span className="sr-only">คำสั่ง</span></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">
                  {lead.name}
                  <span className="block text-xs font-normal text-slate-500 xl:hidden">
                    {lead.phone} · {lead.serviceType}
                  </span>
                </td>
                <td className="hidden px-3 py-2 xl:table-cell text-slate-700">{lead.phone}</td>
                <td className="hidden px-3 py-2 xl:table-cell text-slate-700">{lead.serviceType}</td>
                <td className="px-3 py-2 text-slate-700 max-w-xs">
                  <div className="truncate">{lead.message ?? "-"}</div>
                  {leadProjectInfo(lead).length > 0 && (
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {leadProjectInfo(lead).join(" · ")}
                    </div>
                  )}
                  {needsAreaAsk(lead) && (
                    <span title={AREA_ASK_DETAIL} className={`${badgeClass("amber")} mt-1 whitespace-nowrap`}>
                      {AREA_ASK_LABEL}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">{formatDateTime(lead.createdAt)}</td>
                <td className="px-3 py-2">
                  <select
                    value={lead.status}
                    onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                    className={`${badgeClass(STATUS_COLOR[lead.status])} cursor-pointer`}
                  >
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  {lead.reply && <span className="mt-1 block text-xs text-emerald-700 xl:hidden">✓ ตอบแล้ว</span>}
                </td>
                <td className="hidden px-3 py-2 xl:table-cell whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Button variant="brand" size="sm" onClick={() => openReply(lead)}>
                      {lead.reply ? "แก้คำตอบ" : "ตอบกลับ"}
                    </Button>
                    {lead.reply && <span className="text-emerald-600 text-xs">✓ ตอบแล้ว</span>}
                  </div>
                </td>
                <td className="hidden px-3 py-2 xl:table-cell">
                  <LeadProjectCell
                    lead={lead}
                    creating={creatingProjectFor === lead.id}
                    onCreate={() => handleCreateProject(lead.id)}
                  />
                </td>
                <td className="hidden px-3 py-2 xl:table-cell whitespace-nowrap text-right">
                  {/* ลบได้เฉพาะคำขอที่ยังไม่เป็นโครงการ — คำขอที่เป็นโครงการแล้วจัดการที่โครงการ */}
                  {!lead.projectId && (
                    <Button
                      variant="dangerQuiet"
                      size="sm"
                      title="ย้ายคำขอไปถังขยะ"
                      disabled={deletingId === lead.id}
                      onClick={() => handleDelete(lead)}
                    >
                      <Trash2 size={14} /> ลบ
                    </Button>
                  )}
                </td>
                <td className="px-3 py-2 text-right xl:hidden">
                  <RowMenu
                    label={`คำสั่งของคำขอ ${lead.name}`}
                    items={[
                      { key: "reply", label: lead.reply ? "แก้คำตอบ" : "ตอบกลับ", onSelect: () => openReply(lead) },
                      ...(lead.serviceType === GENERAL_INQUIRY_SERVICE_TYPE
                        ? []
                        : lead.projectId
                          ? [{ key: "project", label: "ไปที่โครงการ", onSelect: () => navigate(`/projects/${lead.projectId}`) }]
                          : [{ key: "create", label: "สร้างโครงการ", onSelect: () => void handleCreateProject(lead.id) }]),
                      ...(lead.projectId
                        ? []
                        : [{ key: "delete", label: "ลบ", danger: true, onSelect: () => void handleDelete(lead) }]),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onChange={list.setPage} />

      {replyingLead && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          {/* ฉากหลังเป็นปุ่มจริง (กดแล้วปิด) — ไม่ต้องดักคลิกบน div แล้วกันไม่ให้ลามเข้ากล่อง */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="ปิด"
            onClick={() => setReplyingLead(null)}
            className="absolute inset-0 h-full w-full cursor-default bg-black/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ตอบกลับคำขอ"
            className="relative bg-white rounded-lg shadow-xl w-full max-w-lg p-5"
          >
            <h2 className="text-lg font-semibold text-slate-800">ตอบกลับคำขอ</h2>
            <p className="text-sm text-slate-700 mt-1">
              {replyingLead.name} · {replyingLead.serviceType}
            </p>

            <div className="mt-3 text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
              <p className="text-slate-500">
                <span className="text-slate-500">ข้อความจากลูกค้า: </span>
                {replyingLead.message || "-"}
              </p>
              <p className="text-slate-500">
                <span className="text-slate-500">ติดต่อ: </span>
                {replyingLead.phone}
                {replyingLead.email ? ` · ${replyingLead.email}` : ""}
              </p>
              {leadProjectInfo(replyingLead).length > 0 && (
                <p className="text-slate-500">
                  <span className="text-slate-500">ข้อมูลโครงการ: </span>
                  {leadProjectInfo(replyingLead).join(" · ")}
                </p>
              )}
              {needsAreaAsk(replyingLead) && <p className="text-xs text-amber-700">{AREA_ASK_DETAIL}</p>}
            </div>

            {!replyingLead.customerId && (
              <p className="text-xs text-amber-600 mt-3">
                ลูกค้ารายนี้ไม่ได้สมัครบัญชี — คำตอบจะถูกบันทึกไว้ แต่ลูกค้าจะไม่เห็นในระบบ
                กรุณาติดต่อกลับทางเบอร์โทร/อีเมลข้างบน
              </p>
            )}

            <label className="flex flex-col gap-1 text-xs text-slate-700 mt-3">
              <span>ข้อความตอบกลับ</span>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={4}
                autoFocus
                className="border border-slate-300 rounded-md px-2 py-1 text-sm text-slate-800"
                placeholder="พิมพ์คำตอบถึงลูกค้า..."
              />
            </label>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setReplyingLead(null)}>
                ยกเลิก
              </Button>
              <Button disabled={savingReply || !replyText.trim()} onClick={submitReply}>
                {savingReply ? "กำลังส่ง..." : "ส่งคำตอบ"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
