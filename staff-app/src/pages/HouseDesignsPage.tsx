import { GripVertical, ImageOff, Star, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { FEATURED_HOUSE_DESIGN_LIMIT } from "@systemboq/shared-types";
import type { HouseDesignDto } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { ImageUploadField } from "../components/ImageUploadField";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { ApiError } from "../lib/api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import {
  createHouseDesign,
  deleteHouseDesign,
  listHouseDesigns,
  reorderFeaturedHouseDesigns,
  updateHouseDesign,
} from "../lib/houseDesigns-api";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { featuredStar, publishedBadgeClass } from "../lib/status-badge";

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

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  area: "",
  wallAreaSqm: "",
  perimeterM: "",
  concreteVolumeM3: "",
  footprintSqm: "",
  floors: "",
  bedrooms: "",
  bathrooms: "",
  exteriorImages: "",
  interiorImages: "",
  plans: "",
};

// ช่องสเปกที่ว่าง = ไม่ส่งค่า (undefined) ให้แบบบ้านนั้นไม่มีสเปกนั้น
function parseSpec(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

function parseImageList(value: string): string[] | undefined {
  const urls = value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return urls.length > 0 ? urls : undefined;
}

// ย้าย dragId ไปไว้ก่อน overId ในลิสต์ (ใช้ตอนลากจัดลำดับ)
function moveBefore(ids: string[], dragId: string, overId: string): string[] {
  const without = ids.filter((x) => x !== dragId);
  const idx = without.indexOf(overId);
  if (idx < 0) return ids;
  without.splice(idx, 0, dragId);
  return without;
}

export function HouseDesignsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const rowNav = useRowNav();
  const [designs, setDesigns] = useState<HouseDesignDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // ลำดับแบบบ้านแนะนำ (id เรียงตามที่ลาก) + ตัวที่กำลังลาก
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const byId = useMemo(() => new Map(designs.map((d) => [d.id, d])), [designs]);
  const featuredCount = useMemo(() => designs.filter((d) => d.featured).length, [designs]);
  const featuredItems = orderIds.map((id) => byId.get(id)).filter((x): x is HouseDesignDto => !!x);
  const atCap = featuredCount >= FEATURED_HOUSE_DESIGN_LIMIT;

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listHouseDesigns();
      setDesigns(res.houseDesigns);
      // ตั้งลำดับแบบบ้านแนะนำจากข้อมูลจริง (featuredOrder น้อยไปมาก)
      setOrderIds(
        res.houseDesigns
          .filter((d) => d.featured)
          .sort((a, b) => a.featuredOrder - b.featuredOrder)
          .map((d) => d.id),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function submitCreate() {
    if (!form.name.trim()) return;
    try {
      await createHouseDesign({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        area: form.area ? Number(form.area) : undefined,
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
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มแบบบ้านไม่สำเร็จ");
    }
  }

  async function togglePublish(design: HouseDesignDto) {
    try {
      await updateHouseDesign(design.id, { published: !design.published });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะเผยแพร่ไม่สำเร็จ");
    }
  }

  async function toggleFeatured(design: HouseDesignDto) {
    if (!design.featured && atCap) {
      toast.error(`เลือกแสดงในหน้าแรกได้สูงสุด ${FEATURED_HOUSE_DESIGN_LIMIT} แบบ กรุณาเอาบางแบบออกก่อน`);
      return;
    }
    try {
      await updateHouseDesign(design.id, { featured: !design.featured });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "อัปเดตสถานะหน้าแรกไม่สำเร็จ");
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm("ย้ายแบบบ้านนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", { confirmLabel: "ย้ายไปถังขยะ" })))
      return;
    try {
      await deleteHouseDesign(id);
      toast.success("ย้ายไปถังขยะแล้ว — กู้คืนได้ที่เมนูถังขยะ");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  // ---- ลากจัดลำดับแบบบ้านแนะนำ ----
  function onDragOver(overId: string) {
    if (!draggingId || draggingId === overId) return;
    setOrderIds((prev) => moveBefore(prev, draggingId, overId));
  }
  async function persistOrder() {
    setDraggingId(null);
    try {
      await reorderFeaturedHouseDesigns(orderIds);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "จัดลำดับไม่สำเร็จ");
      await refresh();
    }
  }

  return (
    <Layout>
      <PageHeader
        title="แบบบ้าน"
        action={<Button onClick={() => setShowAddForm((v) => !v)}>+ เพิ่มแบบบ้าน</Button>}
      />

      {/* ---------- โซนแบบบ้านแนะนำในหน้าแรก ---------- */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800">
            <Star className="w-4 h-4 text-amber-500" fill="currentColor" />
            แบบบ้านแนะนำในหน้าแรก
          </h2>
          <span className={`text-sm font-medium ${atCap ? "text-amber-600" : "text-slate-500"}`}>
            เลือกแล้ว {featuredCount}/{FEATURED_HOUSE_DESIGN_LIMIT}
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          ลากเพื่อจัดลำดับการแสดงในโซน “แบบบ้านแนะนำ” ของหน้าแรก · กดดาวในตารางด้านล่างเพื่อเพิ่ม/เอาออก
        </p>

        {featuredItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            ยังไม่ได้เลือกแบบบ้านแนะนำ
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {featuredItems.map((d, i) => {
              const cover = d.exteriorImages?.[0];
              const noImage = !cover;
              return (
                <li
                  key={d.id}
                  draggable
                  onDragStart={() => setDraggingId(d.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onDragOver(d.id);
                  }}
                  onDrop={persistOrder}
                  onDragEnd={persistOrder}
                  className={`flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-2 py-2 ${
                    draggingId === d.id ? "opacity-50" : ""
                  } ${!d.published ? "bg-slate-50" : ""}`}
                >
                  <GripVertical className="w-4 h-4 shrink-0 cursor-grab text-slate-400" />
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400 tabular-nums">
                    {i + 1}
                  </span>
                  {cover ? (
                    <img src={cover} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-500">
                      <ImageOff className="w-4 h-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">{d.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {d.area && <span className="text-xs text-slate-400">{d.area} ตร.ม.</span>}
                      {noImage && (
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                          ไม่มีรูป
                        </span>
                      )}
                      {!d.published && (
                        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                          ยังไม่เผยแพร่ · ลูกค้าไม่เห็น
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => toggleFeatured(d)}>
                    เอาออก
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showAddForm && (
        <div className="mb-4 grid grid-cols-2 gap-2 border border-dashed border-slate-300 rounded-md p-3 bg-white">
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ชื่อแบบบ้าน</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>พื้นที่ใช้สอย (ตร.ม.)</span>
            <input
              type="number"
              value={form.area}
              onChange={(e) => setForm((f) => ({ ...f, area: e.target.value }))}
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
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                <span>พื้นที่ผนัง (ตร.ม.)</span>
                <input
                  type="number"
                  value={form.wallAreaSqm}
                  onChange={(e) => setForm((f) => ({ ...f, wallAreaSqm: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                <span>รอบรูป (ม.)</span>
                <input
                  type="number"
                  value={form.perimeterM}
                  onChange={(e) => setForm((f) => ({ ...f, perimeterM: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                <span>ปริมาตรคอนกรีต (ลบ.ม.)</span>
                <input
                  type="number"
                  value={form.concreteVolumeM3}
                  onChange={(e) => setForm((f) => ({ ...f, concreteVolumeM3: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                <span>พื้นที่ตั้งอาคาร/หลังคา (ตร.ม.)</span>
                <input
                  type="number"
                  value={form.footprintSqm}
                  onChange={(e) => setForm((f) => ({ ...f, footprintSqm: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
            </div>
          </div>
          <div className="col-span-2 grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>จำนวนชั้น</span>
              <input
                type="number"
                min={1}
                value={form.floors}
                onChange={(e) => setForm((f) => ({ ...f, floors: e.target.value }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>ห้องนอน</span>
              <input
                type="number"
                min={0}
                value={form.bedrooms}
                onChange={(e) => setForm((f) => ({ ...f, bedrooms: e.target.value }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>ห้องน้ำ</span>
              <input
                type="number"
                min={0}
                value={form.bathrooms}
                onChange={(e) => setForm((f) => ({ ...f, bathrooms: e.target.value }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-700 col-span-2">
            <span>รายละเอียด</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              rows={2}
            />
          </label>
          <div className="col-span-2">
            <ImageUploadField
              label="ภาพภายนอก"
              value={form.exteriorImages}
              onChange={(v) => setForm((f) => ({ ...f, exteriorImages: v }))}
            />
          </div>
          <div className="col-span-2">
            <ImageUploadField
              label="ภาพภายใน"
              value={form.interiorImages}
              onChange={(v) => setForm((f) => ({ ...f, interiorImages: v }))}
            />
          </div>
          <div className="col-span-2">
            <ImageUploadField
              label="แปลนบ้าน"
              value={form.plans}
              onChange={(v) => setForm((f) => ({ ...f, plans: v }))}
            />
          </div>
          <div className="col-span-2 flex gap-2">
            <Button onClick={submitCreate}>บันทึก</Button>
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {loading && <p className="text-slate-500">กำลังโหลด...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && designs.length === 0 && (
        <p className="text-slate-500">ยังไม่มีแบบบ้าน</p>
      )}

      {designs.length > 0 && (
        <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">ชื่อแบบบ้าน</th>
              <th className="px-3 py-2">พื้นที่</th>
              <th className="px-3 py-2 text-center">หน้าแรก</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {designs.map((d) => {
              const blocked = !d.featured && atCap;
              const star = featuredStar(d.featured, blocked, "หน้าแรก", FEATURED_HOUSE_DESIGN_LIMIT);
              return (
                <tr
                  key={d.id}
                  {...rowNav(`/house-designs/${d.id}`)}
                  className={`border-t border-slate-100 ${rowNavClass}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/house-designs/${d.id}`}
                      onClick={stopRowNav}
                      className="font-medium text-slate-800"
                    >
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{d.area ? `${d.area} ตร.ม.` : "-"}</td>
                  <td className="px-3 py-2 text-center" onClick={stopRowNav}>
                    <button
                      type="button"
                      onClick={() => toggleFeatured(d)}
                      disabled={blocked}
                      title={star.title}
                      aria-label={d.featured ? "เอาออกจากหน้าแรก" : "แสดงในหน้าแรก"}
                      className={`inline-flex items-center justify-center rounded-md p-1 transition-colors ${star.className}`}
                    >
                      <Star className="w-5 h-5" fill={d.featured ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className={publishedBadgeClass(d.published)}>
                      {d.published ? "เผยแพร่แล้ว" : "ร่าง"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" onClick={stopRowNav}>
                    <div className="flex gap-2">
                      <Button
                        variant={d.published ? "ghost" : "primary"}
                        size="sm"
                        onClick={() => togglePublish(d)}
                      >
                        {d.published ? "ยกเลิกเผยแพร่" : "เผยแพร่"}
                      </Button>
                      <Button variant="dangerQuiet" size="sm" onClick={() => handleDelete(d.id)}>
                        <Trash2 size={14} /> ลบ
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Layout>
  );
}
