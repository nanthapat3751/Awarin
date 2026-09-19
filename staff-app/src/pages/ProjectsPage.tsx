import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { ProjectDto, ProjectStatus, ProjectType } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { createProject, deleteProject, listProjects } from "../lib/projects-api";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { badgeClass, type BadgeColor } from "../lib/status-badge";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคาแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

const PAGE_SIZE = 15;

const STATUS_COLOR: Record<ProjectStatus, BadgeColor> = {
  DRAFT: "slate",
  QUOTED: "amber",
  REJECTED: "red",
  APPROVED: "blue",
  COMPLETED: "emerald",
  CANCELLED: "red",
};

/** ข้อความตอนตารางว่าง: ค้นหาแล้วไม่เจอ · มีแต่โครงการที่ยกเลิก (ถูกซ่อน) · ยังไม่มีเลย */
function emptyListMessage(filtering: boolean, hasHidden: boolean): string {
  if (filtering) return "ไม่พบโครงการที่ค้นหา";
  if (hasHidden) return 'ไม่มีโครงการที่แสดง — ลองติ๊ก "แสดงโครงการที่ยกเลิกแล้ว"';
  return "ยังไม่มีโครงการ — เริ่มสร้างโครงการใหม่ด้านบน";
}

export function ProjectsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const rowNav = useRowNav();
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");

  // มาจากกล่องสถานะบนแดชบอร์ด (/projects?status=QUOTED) -- ตรวจว่าเป็นสถานะที่รู้จักจริงก่อนใช้
  // กันค่ามั่วจาก URL ที่แก้เอง; ตัวกรองในหน้านี้ยังเปลี่ยนเองได้ตามปกติหลังเข้ามาแล้ว
  useEffect(() => {
    const fromUrl = searchParams.get("status");
    if (fromUrl && fromUrl in STATUS_LABEL) {
      setStatusFilter(fromUrl as ProjectStatus);
    }
  }, [searchParams]);
  const [showCancelled, setShowCancelled] = useState(false);
  const [page, setPage] = useState(1);

  const [showCreateChoice, setShowCreateChoice] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<ProjectType>("ESTIMATE");
  const [newName, setNewName] = useState("");
  const [newOverheadProfitPercent, setNewOverheadProfitPercent] = useState("");
  // ตั้งอัตรากำไรเองตอนสร้าง = แก้อัตรากำไร ทำได้เฉพาะ OWNER — ADMIN สร้างด้วยค่าบริษัทเสมอ
  const { user } = useAuth();
  const canSetRate = user?.role === "OWNER";
  const [creating, setCreating] = useState(false);

  async function refresh(q: string, status: ProjectStatus | "") {
    setLoading(true);
    setError(null);
    try {
      const res = await listProjects({ q: q || undefined, status: status || undefined });
      setProjects(res.projects);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => refresh(search, statusFilter), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  async function submitCreate() {
    if (!newName.trim()) return;
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
      await refresh(search, statusFilter);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "สร้างโครงการไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !(await confirm("ย้ายโครงการนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", {
        confirmLabel: "ย้ายไปถังขยะ",
      }))
    )
      return;
    try {
      await deleteProject(id);
      toast.success("ย้ายไปถังขยะแล้ว — กู้คืนได้ที่เมนูถังขยะ");
      await refresh(search, statusFilter);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  // โปรเจกต์ที่ยกเลิกทำให้มุมมองเริ่มต้นรก แต่ไม่ควรหายไปเลย (ไม่มีการลบถาวรสำหรับอะไรที่เคย
  // ออกใบเสนอราคาแล้ว) -- ซ่อนไว้เว้นแต่จะขอดู ยกเว้นตอนที่ตัวกรองสถานะเลือก "ยกเลิก" อยู่แล้ว
  const visibleProjects = projects.filter(
    (p) => statusFilter !== "" || showCancelled || p.status !== "CANCELLED",
  );

  // จำนวนหน้าวิ่งตามข้อมูล จึงเพิ่มและลดเองโดยอัตโนมัติ
  const pageCount = Math.max(1, Math.ceil(visibleProjects.length / PAGE_SIZE));
  // ให้มุมมองอยู่ในช่วงที่ถูกต้อง หลังการลบหรือตัวกรองที่แคบลงทำให้เหลือหน้าน้อยลง
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageProjects = visibleProjects.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  // Any change of filter is a new result set — start reading it from the top.
  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, showCancelled]);

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

      <div className="flex gap-2 mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ค้นหาจากชื่อโครงการ, เลขที่โครงการ หรือชื่อลูกค้า"
          className="flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | "")}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">ทุกสถานะ</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-700 whitespace-nowrap">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
          />
          <span>แสดงโครงการที่ยกเลิกแล้ว</span>
        </label>
      </div>

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

      {loading && <p className="text-slate-500">กำลังโหลด...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && visibleProjects.length === 0 && (
        <p className="text-slate-500">
          {emptyListMessage(Boolean(search || statusFilter), projects.length > 0)}
        </p>
      )}

      {visibleProjects.length > 0 && (
        <p className="text-xs text-slate-500 mb-2">
          แสดง {pageStart + 1}-{pageStart + pageProjects.length} จาก {visibleProjects.length} โครงการ
        </p>
      )}

      {visibleProjects.length > 0 && (
        <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">เลขที่โครงการ</th>
              <th className="px-3 py-2">ชื่อโครงการ</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageProjects.map((p) => (
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
      )}

      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </Layout>
  );
}
