import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { HouseDesignDto } from "@systemboq/shared-types";

import { Button, buttonClasses } from "../components/Button";
import { ImageUploadField } from "../components/ImageUploadField";
import { Layout } from "../components/Layout";
import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { deleteHouseDesign, getHouseDesign, updateHouseDesign } from "../lib/houseDesigns-api";
import { publishedBadgeClass } from "../lib/status-badge";

interface FormState {
  name: string;
  description: string;
  area: string;
  wallAreaSqm: string;
  perimeterM: string;
  concreteVolumeM3: string;
  footprintSqm: string;
  floors: string;
  bedrooms: string;
  bathrooms: string;
  exteriorImages: string;
  interiorImages: string;
  plans: string;
}

function toFormState(d: HouseDesignDto): FormState {
  return {
    name: d.name,
    description: d.description ?? "",
    area: d.area ?? "",
    wallAreaSqm: d.wallAreaSqm ?? "",
    perimeterM: d.perimeterM ?? "",
    concreteVolumeM3: d.concreteVolumeM3 ?? "",
    footprintSqm: d.footprintSqm ?? "",
    floors: d.floors != null ? String(d.floors) : "",
    bedrooms: d.bedrooms != null ? String(d.bedrooms) : "",
    bathrooms: d.bathrooms != null ? String(d.bathrooms) : "",
    exteriorImages: (d.exteriorImages ?? []).join("\n"),
    interiorImages: (d.interiorImages ?? []).join("\n"),
    plans: (d.plans ?? []).join("\n"),
  };
}

// ช่องสเปกที่ว่าง = ล้างค่า (null) ให้แบบบ้านนั้นไม่มีสเปกนั้น
function parseSpec(value: string): number | null {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : null;
}

function parseImageList(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function ImageGallery({ title, urls }: Readonly<{ title: string; urls: string[] | null }>) {
  if (!urls || urls.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-slate-500 mb-2">{title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {urls.map((url) => (
          <img
            key={url}
            src={url}
            alt={title}
            className="w-full h-28 object-cover rounded-lg border border-slate-200"
          />
        ))}
      </div>
    </div>
  );
}

export function HouseDesignDetailPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [design, setDesign] = useState<HouseDesignDto | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getHouseDesign(id);
      setDesign(res.houseDesign);
      setForm(toFormState(res.houseDesign));
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
      await updateHouseDesign(id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        area: form.area ? Number(form.area) : null,
        wallAreaSqm: parseSpec(form.wallAreaSqm),
        perimeterM: parseSpec(form.perimeterM),
        concreteVolumeM3: parseSpec(form.concreteVolumeM3),
        footprintSqm: parseSpec(form.footprintSqm),
        floors: parseSpec(form.floors),
        bedrooms: parseSpec(form.bedrooms),
        bathrooms: parseSpec(form.bathrooms),
        exteriorImages: parseImageList(form.exteriorImages),
        interiorImages: parseImageList(form.interiorImages),
        plans: parseImageList(form.plans),
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePublish() {
    if (!id || !design) return;
    try {
      await updateHouseDesign(id, { published: !design.published });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะเผยแพร่ไม่สำเร็จ");
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!(await confirm("ย้ายแบบบ้านนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", { confirmLabel: "ย้ายไปถังขยะ" })))
      return;
    try {
      await deleteHouseDesign(id);
      toast.success("ย้ายไปถังขยะแล้ว — กู้คืนได้ที่เมนูถังขยะ");
      navigate("/house-designs");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  if (loading || !form) {
    return (
      <Layout>
        <p className="text-slate-500">กำลังโหลด...</p>
      </Layout>
    );
  }

  if (error || !design) {
    return (
      <Layout>
        <p className="text-red-600">{error ?? "ไม่พบแบบบ้าน"}</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <Link to="/house-designs" className={buttonClasses("ghost", "sm")}>
        ← กลับไปแบบบ้าน
      </Link>

      <div className="flex items-center justify-between mt-3 mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">{design.name}</h1>
          <span className={`inline-block mt-1 ${publishedBadgeClass(design.published)}`}>
            {design.published ? "เผยแพร่แล้ว" : "ร่าง"}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            variant={design.published ? "ghost" : "primary"}
            size="sm"
            onClick={handleTogglePublish}
          >
            {design.published ? "ยกเลิกเผยแพร่" : "เผยแพร่"}
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete}>
            <Trash2 size={14} /> ลบ
          </Button>
        </div>
      </div>

      {design.standard && (
        <div className="bg-slate-800 text-white rounded-md p-4 mb-6">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-1">
            <div>
              <p className="text-xs text-slate-300">ราคามาตรฐาน (ประมาณ)</p>
              <p className="text-xl font-semibold">{money(design.standard.netPrice)} บาท</p>
            </div>
            {design.standard.pricePerSqm != null && (
              <div>
                <p className="text-xs text-slate-300">ราคาต่อ ตร.ม.</p>
                <p className="text-lg font-medium">{money(design.standard.pricePerSqm)} บาท/ตร.ม.</p>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            จากแม่แบบ “{design.standard.templateName}” · {design.standard.itemCount} รายการ ·
            เป็นราคาประเมินเบื้องต้น (ราคาจริงคำนวณตอนสร้างโครงการ)
          </p>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <h2 className="font-medium text-slate-800 mb-3">ภาพตัวอย่างที่ลูกค้าจะเห็น</h2>
        {!design.exteriorImages?.length && !design.interiorImages?.length && !design.plans?.length && (
          <p className="text-sm text-slate-500">ยังไม่มีรูปภาพ</p>
        )}
        <ImageGallery title="ภาพภายนอก" urls={design.exteriorImages} />
        <ImageGallery title="ภาพภายใน" urls={design.interiorImages} />
        <ImageGallery title="แปลนบ้าน" urls={design.plans} />
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
        <h2 className="font-medium text-slate-800">แก้ไขข้อมูล</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ชื่อแบบบ้าน</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => f && { ...f, name: e.target.value })}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>พื้นที่ใช้สอย (ตร.ม.)</span>
            <input
              type="number"
              value={form.area}
              onChange={(e) => setForm((f) => f && { ...f, area: e.target.value })}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-700">
              ค่าวัดถอดปริมาณ{" "}
              <span className="font-normal text-slate-400">
                (ไม่บังคับ — ใช้คิด BOQ ตอนสร้างโครงการจากแบบ สเกลตามพื้นที่อัตโนมัติ)
              </span>
            </span>
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                <span>พื้นที่ผนัง (ตร.ม.)</span>
                <input
                  type="number"
                  value={form.wallAreaSqm}
                  onChange={(e) => setForm((f) => f && { ...f, wallAreaSqm: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                <span>รอบรูป (ม.)</span>
                <input
                  type="number"
                  value={form.perimeterM}
                  onChange={(e) => setForm((f) => f && { ...f, perimeterM: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                <span>ปริมาตรคอนกรีต (ลบ.ม.)</span>
                <input
                  type="number"
                  value={form.concreteVolumeM3}
                  onChange={(e) => setForm((f) => f && { ...f, concreteVolumeM3: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                <span>พื้นที่ตั้งอาคาร/หลังคา (ตร.ม.)</span>
                <input
                  type="number"
                  value={form.footprintSqm}
                  onChange={(e) => setForm((f) => f && { ...f, footprintSqm: e.target.value })}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
            </div>
          </div>
          <div className="col-span-2 grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>จำนวนชั้น</span>
              <input
                type="number"
                min={1}
                value={form.floors}
                onChange={(e) => setForm((f) => f && { ...f, floors: e.target.value })}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>ห้องนอน</span>
              <input
                type="number"
                min={0}
                value={form.bedrooms}
                onChange={(e) => setForm((f) => f && { ...f, bedrooms: e.target.value })}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>ห้องน้ำ</span>
              <input
                type="number"
                min={0}
                value={form.bathrooms}
                onChange={(e) => setForm((f) => f && { ...f, bathrooms: e.target.value })}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
          </div>
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
              label="ภาพภายนอก"
              value={form.exteriorImages}
              onChange={(v) => setForm((f) => f && { ...f, exteriorImages: v })}
            />
          </div>
          <div className="col-span-2">
            <ImageUploadField
              label="ภาพภายใน"
              value={form.interiorImages}
              onChange={(v) => setForm((f) => f && { ...f, interiorImages: v })}
            />
          </div>
          <div className="col-span-2">
            <ImageUploadField
              label="แปลนบ้าน"
              value={form.plans}
              onChange={(v) => setForm((f) => f && { ...f, plans: v })}
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
