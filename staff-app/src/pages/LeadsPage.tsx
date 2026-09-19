import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { GENERAL_INQUIRY_SERVICE_TYPE, type LeadDto, type LeadStatus } from "@systemboq/shared-types";

import { Button, buttonClasses } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import {
  createProjectFromLead,
  deleteLead,
  listLeads,
  replyToLead,
  updateLeadStatus,
} from "../lib/leads-api";
import { badgeClass, type BadgeColor } from "../lib/status-badge";

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

const PAGE_SIZE = 15;

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
  if (lead.desiredStartDate) parts.push(`อยากเริ่ม ${formatDateOnly(lead.desiredStartDate)}`);
  return parts;
}

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
      <Link to={`/projects/${lead.projectId}`} className={buttonClasses("primary", "sm")}>
        ไปที่โครงการ
      </Link>
    );
  }
  return (
    <Button size="sm" disabled={creating} onClick={onCreate}>
      สร้างโครงการ
    </Button>
  );
}

export function LeadsPage() {
  const [leads, setLeads] = useState<LeadDto[]>([]);
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingProjectFor, setCreatingProjectFor] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyingLead, setReplyingLead] = useState<LeadDto | null>(null);
  const [replyText, setReplyText] = useState("");
  const [savingReply, setSavingReply] = useState(false);
  const [page, setPage] = useState(1);
  // ตัวกรอง: สถานะ + ค้นหาข้อความ (ชื่อ/เบอร์/อีเมล/บริการ/ข้อความ) — ทำฝั่ง client เพราะโหลดมาครบแล้ว
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");

  // นับจำนวนต่อสถานะจากชุดเต็ม (ไว้โชว์บนปุ่มกรอง)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: leads.length };
    for (const s of ALL_STATUSES) counts[s] = 0;
    for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;
    return counts;
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== "ALL" && l.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [l.name, l.phone, l.email ?? "", l.serviceType, l.message ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [leads, statusFilter, search]);

  // จำนวนหน้าวิ่งตามผลการกรอง สังเกตว่ารายการเรียงใหม่สุดก่อน และการ poll ทุก 30 วินาทีจะเติมด้าน
  // หน้าเท่านั้น พนักงานที่กำลังอ่านหน้า 3 จึงยังเห็นแถวเดิม
  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageLeads = filteredLeads.slice(pageStart, pageStart + PAGE_SIZE);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listLeads();
      setLeads(res.leads);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function silentRefresh() {
    try {
      const res = await listLeads();
      setLeads(res.leads);
    } catch {
      // เงียบไว้ -- การ poll เบื้องหลังที่ล้มเหลวไม่ควรรบกวนส่วนที่เหลือของหน้า
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const timer = setInterval(silentRefresh, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // กันกรณีที่แถวหายไป (เปลี่ยนตัวกรองสถานะที่อื่น หรือลบ) แล้วหน้าปัจจุบันไม่มีอยู่แล้ว
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  // กล่องตอบกลับเปิดอยู่ → Esc ปิดได้เหมือนกล่องยืนยัน
  useEffect(() => {
    if (!replyingLead) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReplyingLead(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [replyingLead]);

  // เปลี่ยนตัวกรอง/คำค้น → กลับไปหน้าแรกเสมอ (ไม่งั้นอาจค้างอยู่หน้าที่ไม่มีผลลัพธ์)
  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

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
      { confirmLabel: "ย้ายไปถังขยะ", variant: "danger" },
    );
    if (!ok) return;
    setDeletingId(lead.id);
    try {
      await deleteLead(lead.id);
      toast.success("ย้ายไปถังขยะแล้ว — กู้คืนได้ที่เมนูถังขยะ");
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

      {loading && <p className="text-slate-500">กำลังโหลด...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && leads.length === 0 && <p className="text-slate-500">ยังไม่มีคำขอ</p>}

      {leads.length > 0 && (
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* กรองตามสถานะ (พร้อมจำนวน) */}
          <div className="flex flex-wrap gap-1.5">
            {(["ALL", ...ALL_STATUSES] as const).map((s) => {
              const active = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "bg-brand text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {s === "ALL" ? "ทั้งหมด" : STATUS_LABEL[s]}
                  <span className={active ? "ml-1 text-white/80" : "ml-1 text-slate-400"}>
                    {statusCounts[s] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          {/* ค้นหา ชื่อ/เบอร์/อีเมล/ข้อความ */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ค้นหาชื่อ / เบอร์ / อีเมล / ข้อความ"
            className="w-full sm:w-64"
          />
        </div>
      )}

      {leads.length > 0 && (
        <p className="text-xs text-slate-500 mb-2">
          {filteredLeads.length === 0
            ? "ไม่พบคำขอที่ตรงกับตัวกรอง"
            : `แสดง ${pageStart + 1}-${pageStart + pageLeads.length} จาก ${filteredLeads.length} คำขอ`}
        </p>
      )}

      {filteredLeads.length > 0 && (
        <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">เบอร์โทร</th>
              <th className="px-3 py-2">บริการที่สนใจ</th>
              <th className="px-3 py-2">ข้อความ</th>
              <th className="px-3 py-2">วันที่</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2">ตอบกลับ</th>
              <th className="px-3 py-2">โครงการ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageLeads.map((lead) => (
              <tr key={lead.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium text-slate-800">{lead.name}</td>
                <td className="px-3 py-2 text-slate-700">{lead.phone}</td>
                <td className="px-3 py-2 text-slate-700">{lead.serviceType}</td>
                <td className="px-3 py-2 text-slate-700 max-w-xs">
                  <div className="truncate">{lead.message ?? "-"}</div>
                  {leadProjectInfo(lead).length > 0 && (
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {leadProjectInfo(lead).join(" · ")}
                    </div>
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
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => openReply(lead)}>
                      {lead.reply ? "แก้คำตอบ" : "ตอบกลับ"}
                    </Button>
                    {lead.reply && <span className="text-emerald-600 text-xs">✓ ตอบแล้ว</span>}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <LeadProjectCell
                    lead={lead}
                    creating={creatingProjectFor === lead.id}
                    onCreate={() => handleCreateProject(lead.id)}
                  />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
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
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />

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
