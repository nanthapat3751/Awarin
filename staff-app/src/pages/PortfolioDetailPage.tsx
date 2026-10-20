import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { PortfolioDto, PortfolioType } from "@systemboq/shared-types";

import { Button, buttonClasses } from "../components/Button";
import { ImageUploadField } from "../components/ImageUploadField";
import { Layout } from "../components/Layout";
import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { deletePortfolioItem, getPortfolioItem, updatePortfolioItem } from "../lib/portfolio-api";
import { restoreTrashItem } from "../lib/trash-api";
import { publishedBadgeClass } from "../lib/status-badge";
import { DetailSkeleton } from "../components/Skeleton";

const TYPE_LABEL: Record<PortfolioType, string> = {
  DESIGN: "งานออกแบบ",
  CONSTRUCTION: "งานก่อสร้าง",
};

interface FormState {
  title: string;
  type: PortfolioType;
  description: string;
  images: string;
}

function toFormState(item: PortfolioDto): FormState {
  return {
    title: item.title,
    type: item.type,
    description: item.description ?? "",
    images: (item.images ?? []).join("\n"),
  };
}

function parseImageList(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PortfolioDetailPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<PortfolioDto | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getPortfolioItem(id);
      setItem(res.item);
      setForm(toFormState(res.item));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave() {
    if (!id || !form) return;
    setSaving(true);
    try {
      await updatePortfolioItem(id, {
        title: form.title.trim(),
        type: form.type,
        description: form.description.trim() || null,
        images: parseImageList(form.images),
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish() {
    if (!id || !item) return;
    try {
      await updatePortfolioItem(id, { published: !item.published });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะเผยแพร่ไม่สำเร็จ");
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!(await confirm("ย้ายผลงานนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", { confirmLabel: "ลบ" })))
      return;
    try {
      await deletePortfolioItem(id);
      // กดเลิกทำแล้วพากลับมาหน้าเดิมของผลงานนั้น ไม่ใช่ทิ้งไว้ที่หน้ารายการ
      toast.undo("ย้ายผลงานไปถังขยะแล้ว", async () => {
        await restoreTrashItem("portfolio", id);
        navigate(`/portfolio/${id}`);
      });
      navigate("/portfolio");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  if (loading || !form) {
    return (
      <Layout>
        <DetailSkeleton stats={0} />
      </Layout>
    );
  }

  if (error || !item) {
    return (
      <Layout>
        <p className="text-red-600">{error ?? "ไม่พบผลงาน"}</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <Link to="/portfolio" className={buttonClasses("ghost", "sm")}>
        ← กลับไปผลงาน
      </Link>

      <div className="flex items-center justify-between mt-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">{item.title}</h1>
          <span className={`inline-block mt-1 ${publishedBadgeClass(item.published)}`}>
            {item.published ? "เผยแพร่แล้ว" : "ร่าง"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant={item.published ? "dangerQuiet" : "brand"}
            size="sm"
            onClick={handleTogglePublish}
          >
            {item.published ? "ยกเลิกเผยแพร่" : "เผยแพร่"}
          </Button>
          <Button variant="dangerQuiet" size="sm" onClick={handleDelete}>
            <Trash2 size={14} /> ลบ
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <h2 className="font-medium text-slate-800 mb-3">ภาพตัวอย่างที่ลูกค้าจะเห็น</h2>
        {!item.images?.length ? (
          <p className="text-sm text-slate-500">ยังไม่มีรูปภาพ</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {item.images.map((url) => (
              <img
                key={url}
                src={url}
                alt={item.title}
                className="w-full h-28 object-cover rounded-lg border border-slate-200"
              />
            ))}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
        <h2 className="font-medium text-slate-800">แก้ไขข้อมูล</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ชื่อผลงาน</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => f && { ...f, title: e.target.value })}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ประเภท</span>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => f && { ...f, type: e.target.value as PortfolioType })}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            >
              <option value="DESIGN">{TYPE_LABEL.DESIGN}</option>
              <option value="CONSTRUCTION">{TYPE_LABEL.CONSTRUCTION}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700 col-span-2">
            <span>รายละเอียด</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => f && { ...f, description: e.target.value })}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              rows={2}
            />
          </label>
          <div className="col-span-2">
            <ImageUploadField
              label="รูปภาพ"
              cover
              value={form.images}
              onChange={(v) => setForm((f) => f && { ...f, images: v })}
            />
          </div>
        </div>
        <div>
          <Button disabled={saving} onClick={handleSave}>
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
