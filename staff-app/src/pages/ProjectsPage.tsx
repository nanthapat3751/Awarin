import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { ProjectListPageDto, ProjectStatus, ProjectType } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { PeriodPicker } from "../components/PeriodPicker";
import { StatusChips } from "../components/StatusChips";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { createProject, deleteProject, listProjectsPage } from "../lib/projects-api";
import { useListParams } from "../lib/use-list-params";
import { restoreTrashItem } from "../lib/trash-api";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { badgeClass, type BadgeColor } from "../lib/status-badge";
import { TableSkeleton } from "../components/Skeleton";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคาแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

const STATUS_COLOR: Record<ProjectStatus, BadgeColor> = {
  DRAFT: "slate",
  QUOTED: "amber",
  REJECTED: "red",
  APPROVED: "blue",
  COMPLETED: "emerald",
  CANCELLED: "red",
};

const STATUSES = Object.keys(STATUS_LABEL) as ProjectStatus[];

/**
 * ข้อความตอนตารางว่าง — มีแต่โครงการที่ยกเลิก (ถูกซ่อนตอนไม่เลือกสถานะ) ต้องบอกว่ามีอยู่
 * ไม่งั้นคนเข้าใจว่าช่วงนั้นไม่มีงานเลย · กรองแล้วไม่เจอ · ยังไม่มีเลย
 */
function emptyListMessage(filtering: boolean, statusChosen: boolean, cancelledCount: number): string {
  if (!statusChosen && cancelledCount > 0) {
    return `ไม่มีโครงการที่ดำเนินการอยู่ — มีโครงการที่ยกเลิกแล้ว ${cancelledCount} รายการ ดูได้ที่ปุ่ม "ยกเลิก"`;
  }
  if (filtering) return "ไม่พบโครงการที่ตรงกับตัวกรอง";
  return "ยังไม่มีโครงการ — เริ่มสร้างโครงการใหม่ด้านบน";
}

export function ProjectsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const rowNav = useRowNav();
  const [data, setData] = useState<ProjectListPageDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ตัวกรองอยู่ใน URL — ลิงก์จากกล่องสถานะบนแดชบอร์ด (/projects?status=QUOTED) ใช้ได้ทันที
  const list = useListParams(STATUSES);
  const { query } = list;

  const [showCreateChoice, setShowCreateChoice] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<ProjectType>("ESTIMATE");
  const [newName, setNewName] = useState("");
  const [newOverheadProfitPercent, setNewOverheadProfitPercent] = useState("");
  // ตั้งอัตรากำไรเองตอนสร้าง = แก้อัตรากำไร ทำได้เฉพาะ OWNER — ADMIN สร้างด้วยค่าบริษัทเสมอ
  const { user } = useAuth();
  const canSetRate = user?.role === "OWNER";
  const [creating, setCreating] = useState(false);

  // โหลดหน้าที่ URL บอก — ครั้งแรกโชว์โครงกระดูก ครั้งถัดไปจางตารางเดิมไว้จนข้อมูลใหม่มา (หน้าไม่กระโดด)
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listProjectsPage(query);
      setData(res);
      // ขอหน้าเกินมา (เช่น ลบแถวสุดท้ายของหน้าท้าย) เซิร์ฟเวอร์ให้หน้าสุดท้าย — ให้ URL ตามด้วย
      if (res.page !== query.page) list.setPage(res.page);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function submitCreate() {
    // เดิม return เงียบ ๆ — กดแล้วไม่เกิดอะไรขึ้น ผู้ใช้ไม่รู้ว่าขาดอะไร (BUG-002)
    if (!newName.trim()) {
      toast.error("กรอกชื่อโครงการก่อน");
      return;
    }
    setCreating(true);
    try {
      await createProject({
        name: newName.trim(),
        type: newType,
        // โครงการกำหนดเองไม่ใช้ค่าดำเนินการ/กำไรอัตโนมัติ (กรอกราคาเองภายหลัง)
        overheadProfitPercent:
          newType === "CUSTOM" || !canSetRate || !newOverheadProfitPercent
            ? undefined
            : Number(newOverheadProfitPercent),
      });
      setNewName("");
      setNewOverheadProfitPercent("");
      setShowAddForm(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "สร้างโครงการไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !(await confirm("ย้ายโครงการนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", {
        confirmLabel: "ลบ",
      }))
    )
      return;
    try {
      await deleteProject(id);
      toast.undo("ย้ายโครงการไปถังขยะแล้ว", async () => {
        await restoreTrashItem("project", id);
        await refresh();
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  // เซิร์ฟเวอร์แบ่งหน้าละ 15 มาแล้ว · ไม่เลือกสถานะ = ซ่อนโครงการที่ยกเลิก (กดปุ่ม "ยกเลิก" เพื่อดู)
  const projects = data?.projects ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 15;
  const page = data?.page ?? 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = (page - 1) * pageSize;
  const filtering = Boolean(list.q || list.status || list.period);

  return (
    <Layout>
      <PageHeader
        title="โครงการ"
        action={
          <Button
            onClick={() => {
              setShowAddForm(false);
              setShowCreateChoice((v) => !v);
            }}
          >
            + สร้างโครงการใหม่
          </Button>
        }
      />

      {showCreateChoice && (
        <div className="mb-4 border border-slate-200 rounded-lg p-4 bg-white max-w-3xl">
          <p className="text-sm text-slate-700 mb-3">เลือกวิธีสร้างโครงการ</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => {
                setShowCreateChoice(false);
                navigate("/leads");
              }}
              className="text-left border border-emerald-200 bg-emerald-50 rounded-lg p-3 hover:bg-emerald-100"
            >
              <p className="text-sm font-medium text-emerald-800">สร้างจากคำขอลูกค้า (แนะนำ)</p>
              <p className="text-xs text-emerald-600 mt-1">
                ไปที่หน้าคำขอ กด "สร้างโครงการ" — ได้ลูกค้า แบบบ้าน และข้อมูลติดต่อมาให้อัตโนมัติ
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateChoice(false);
                setNewType("ESTIMATE");
                setShowAddForm(true);
              }}
              className="text-left border border-blue-200 bg-blue-50 rounded-lg p-3 hover:bg-blue-100"
            >
              <p className="text-sm font-medium text-blue-800">สร้างโครงการเปล่า (ประเมินจากระบบ)</p>
              <p className="text-xs text-blue-600 mt-1">
                กรอกชื่อเอง แล้วสร้าง BOQ ในระบบ — เหมาะกับแบบบ้านที่มีอยู่
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateChoice(false);
                setNewType("CUSTOM");
                setShowAddForm(true);
              }}
              className="text-left border border-indigo-200 bg-indigo-50 rounded-lg p-3 hover:bg-indigo-100"
            >
              <p className="text-sm font-medium text-indigo-800">โครงการกำหนดเอง (ออกแบบใหม่)</p>
              <p className="text-xs text-indigo-600 mt-1">
                ข้ามตัวประเมิน BOQ — กรอกราคาเอง แล้วแนบไฟล์ใบเสนอราคา/แบบจริงที่ทำจาก Excel/PDF
              </p>
            </button>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <SearchInput
          value={list.searchInput}
          onChange={list.setSearchInput}
          placeholder="ค้นหาจากชื่อโครงการ, เลขที่โครงการ หรือชื่อลูกค้า"
          className="min-w-60 flex-1"
        />
        <PeriodPicker value={list.period} onChange={list.setPeriod} noun="โครงการ" />
      </div>
      <StatusChips
        statuses={STATUSES}
        labels={STATUS_LABEL}
        counts={data?.counts}
        value={list.status}
        onChange={list.setStatus}
        allTitle="ทุกสถานะ ยกเว้นโครงการที่ยกเลิก"
      />

      {showAddForm && (
        <div className="mb-4 border border-dashed border-slate-300 rounded-md p-3 bg-white">
          <p className="text-xs text-slate-500 mb-2">
            {newType === "CUSTOM"
              ? "โครงการกำหนดเอง — กรอกราคาเองและแนบไฟล์จริงในหน้ารายละเอียดหลังสร้าง"
              : "โครงการประเมินจากระบบ — สร้าง BOQ ในระบบหลังสร้าง"}
          </p>
          <div className="flex items-center gap-2">
            <input
              autoFocus
              placeholder="ชื่อโครงการ"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm flex-1"
            />
            {newType === "ESTIMATE" && canSetRate && (
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="ค่าดำเนินการ+กำไร (%) — ไม่กรอกใช้ค่ามาตรฐาน"
                value={newOverheadProfitPercent}
                onChange={(e) => setNewOverheadProfitPercent(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm w-64"
              />
            )}
            <Button onClick={submitCreate} disabled={creating}>
              สร้าง
            </Button>
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {loading && !data && <TableSkeleton rows={8} cols={4} />}
      {error && <p className="text-red-600">{error}</p>}
      {data && !error && projects.length === 0 && (
        <p className="text-slate-500">{emptyListMessage(filtering, list.status != null, data.counts.CANCELLED)}</p>
      )}

      {projects.length > 0 && (
        <p className="text-xs text-slate-500 mb-2">
          แสดง {pageStart + 1}-{pageStart + projects.length} จาก {total} โครงการ
        </p>
      )}

      {projects.length > 0 && (
        <div
          className={`overflow-x-auto rounded-lg border border-slate-200 bg-white transition-opacity ${loading ? "opacity-60" : ""}`}
          aria-busy={loading}
        >
        <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">เลขที่โครงการ</th>
              <th className="px-3 py-2">ชื่อโครงการ</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2"></th>
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
                <td className="px-3 py-2 text-right" onClick={stopRowNav}>
                  {!p.quoteCount && (
                    <Button variant="dangerQuiet" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 size={14} /> ลบ
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <Pagination page={page} pageCount={pageCount} onChange={list.setPage} />
    </Layout>
  );
}
