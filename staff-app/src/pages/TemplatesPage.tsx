import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import type { TemplateDto } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { createProject } from "../lib/projects-api";
import { applyTemplateToProject, deleteTemplate, listTemplates } from "../lib/templates-api";
import { restoreTrashItem } from "../lib/trash-api";
import { ListSkeleton } from "../components/Skeleton";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH");
}

const PAGE_SIZE = 15;

export function TemplatesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  // หน้าละ 15 เท่าทุกรายการในระบบ · เลขหน้าใน URL (?page=2) เปิดแม่แบบแล้วย้อนกลับมาหน้าเดิม
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Math.floor(Number(searchParams.get("page"))) || 1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creatingFromId, setCreatingFromId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listTemplates();
      setTemplates(res.templates);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id: string) {
    if (!(await confirm("ย้ายแม่แบบนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", { confirmLabel: "ลบ" })))
      return;
    try {
      await deleteTemplate(id);
      toast.undo("ย้ายแม่แบบไปถังขยะแล้ว", async () => {
        await restoreTrashItem("template", id);
        await refresh();
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  async function submitCreateFromTemplate(templateId: string) {
    if (!newProjectName.trim()) return;
    setCreating(true);
    try {
      const { project } = await createProject({ name: newProjectName.trim() });
      await applyTemplateToProject(project.id, templateId);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "สร้างโครงการจากแม่แบบไม่สำเร็จ");
      setCreating(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(templates.length / PAGE_SIZE));
  // ลบแม่แบบใบสุดท้ายของหน้าท้าย → ถอยไปหน้าที่ยังมีอยู่
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageTemplates = templates.slice(pageStart, pageStart + PAGE_SIZE);

  function goPage(next: number) {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next <= 1) p.delete("page");
      else p.set("page", String(next));
      return p;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <Layout>
      <PageHeader
        title="แม่แบบโครงการ"
        subtitle='แม่แบบถูกบันทึกจากหน้าโครงการ (ปุ่ม "บันทึกเป็นแม่แบบ" เมื่อโครงการนั้นมีรายการ BOQ แล้ว) — ใช้ที่นี่เพื่อสร้างโครงการใหม่พร้อมรายการ BOQ ชุดเดิมได้ทันที แล้วค่อยปรับจำนวนตามหน้างานจริง'
      />

      {loading && <ListSkeleton rows={5} />}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && templates.length === 0 && (
        <p className="text-slate-500">
          ยังไม่มีแม่แบบ — เปิดโครงการที่มีรายการ BOQ แล้วกด "บันทึกเป็นแม่แบบ"
        </p>
      )}

      {templates.length > PAGE_SIZE && (
        <p className="text-xs text-slate-500 mb-2">
          แสดง {pageStart + 1}-{pageStart + pageTemplates.length} จาก {templates.length} แม่แบบ
        </p>
      )}

      {templates.length > 0 && (
        <div className="flex flex-col gap-3">
          {pageTemplates.map((t) => (
            <div
              key={t.id}
              className="relative bg-white border border-slate-200 rounded-lg p-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="min-w-0">
                  {/* ชื่อเป็นลิงก์จริง และขยายพื้นที่กดคลุมทั้งการ์ดด้วย after: — ปุ่มกับฟอร์มด้านล่างยกขึ้นเหนือมัน (relative z-10) */}
                  <Link
                    to={`/templates/${t.id}`}
                    className="font-medium text-slate-800 after:absolute after:inset-0 after:rounded-lg"
                  >
                    {t.name}
                  </Link>
                  {t.description && (
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{t.description}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    {t.itemCount} รายการ · บันทึกเมื่อ {formatDate(t.createdAt)}
                  </p>
                </div>
                <div className="relative z-10 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setCreatingFromId(creatingFromId === t.id ? null : t.id);
                      setNewProjectName("");
                    }}
                  >
                    + สร้างโครงการจากแม่แบบนี้
                  </Button>
                  <Button variant="dangerQuiet" size="sm" onClick={() => handleDelete(t.id)}>
                    <Trash2 size={14} /> ลบ
                  </Button>
                </div>
              </div>

              {creatingFromId === t.id && (
                <div className="relative z-10 mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                  <input
                    autoFocus
                    placeholder="ชื่อโครงการใหม่"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm flex-1"
                  />
                  <Button
                    size="sm"
                    onClick={() => submitCreateFromTemplate(t.id)}
                    disabled={creating || !newProjectName.trim()}
                  >
                    สร้าง
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCreatingFromId(null);
                      setNewProjectName("");
                    }}
                  >
                    ยกเลิก
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination page={safePage} pageCount={pageCount} onChange={goPage} />
    </Layout>
  );
}
