import { Check, GripVertical, ImageOff, Star, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { FEATURED_PORTFOLIO_LIMIT } from "@systemboq/shared-types";
import type { PortfolioDto, PortfolioType } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { ImageUploadField } from "../components/ImageUploadField";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { ApiError } from "../lib/api";
import { restoreTrashItem } from "../lib/trash-api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import {
  createPortfolioItem,
  deletePortfolioItem,
  listPortfolio,
  reorderFeaturedPortfolio,
  updatePortfolioItem,
} from "../lib/portfolio-api";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { featuredStar, publishedBadgeClass } from "../lib/status-badge";
import { TableSkeleton } from "../components/Skeleton";

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

const EMPTY_FORM: FormState = { title: "", type: "DESIGN", description: "", images: "" };

const PAGE_SIZE = 15;

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

export function PortfolioPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const rowNav = useRowNav();
  const [items, setItems] = useState<PortfolioDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // ขึ้นตัวแดงหลังกดบันทึกครั้งแรกเท่านั้น (เดิมกดบันทึกตอนไม่มีชื่อแล้วเงียบไปเฉย ๆ)
  const [attempted, setAttempted] = useState(false);
  const titleMissing = attempted && !form.title.trim();
  const [page, setPage] = useState(1);

  // ลำดับผลงานเด่น (id เรียงตามที่ลาก) + ตัวที่กำลังลาก
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageItems = items.slice(pageStart, pageStart + PAGE_SIZE);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const featuredCount = useMemo(() => items.filter((i) => i.featured).length, [items]);
  const featuredItems = orderIds.map((id) => byId.get(id)).filter((x): x is PortfolioDto => !!x);
  const atCap = featuredCount >= FEATURED_PORTFOLIO_LIMIT;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listPortfolio();
      setItems(res.portfolio);
      // ตั้งลำดับผลงานเด่นจากข้อมูลจริง (featuredOrder น้อยไปมาก)
      setOrderIds(
        res.portfolio
          .filter((p) => p.featured)
          .sort((a, b) => a.featuredOrder - b.featuredOrder)
          .map((p) => p.id),
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

  function openAddForm() {
    setForm(EMPTY_FORM);
    setAttempted(false);
    setShowAddForm((v) => !v);
  }

  async function submitCreate() {
    setAttempted(true);
    if (!form.title.trim()) {
      document.getElementById("portfolio-title")?.focus();
      return;
    }
    try {
      await createPortfolioItem({
        title: form.title.trim(),
        type: form.type,
        description: form.description.trim() || undefined,
        images: parseImageList(form.images),
      });
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      toast.success(`เพิ่ม “${form.title.trim()}” แล้ว`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มผลงานไม่สำเร็จ");
    }
  }

  async function togglePublish(item: PortfolioDto) {
    try {
      await updatePortfolioItem(item.id, { published: !item.published });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะเผยแพร่ไม่สำเร็จ");
    }
  }

  async function toggleFeatured(item: PortfolioDto) {
    if (!item.featured && atCap) {
      toast.error(`เลือกแสดงในหน้าบริการได้สูงสุด ${FEATURED_PORTFOLIO_LIMIT} ผลงาน กรุณาเอาบางรายการออกก่อน`);
      return;
    }
    try {
      await updatePortfolioItem(item.id, { featured: !item.featured });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "อัปเดตสถานะหน้าบริการไม่สำเร็จ");
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm("ย้ายผลงานนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", { confirmLabel: "ลบ" })))
      return;
    try {
      await deletePortfolioItem(id);
      toast.undo("ย้ายผลงานไปถังขยะแล้ว", async () => {
        await restoreTrashItem("portfolio", id);
        await refresh();
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  // ---- ลากจัดลำดับผลงานเด่น ----
  function onDragOver(overId: string) {
    if (!draggingId || draggingId === overId) return;
    setOrderIds((prev) => moveBefore(prev, draggingId, overId));
  }
  async function persistOrder() {
    setDraggingId(null);
    try {
      await reorderFeaturedPortfolio(orderIds);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "จัดลำดับไม่สำเร็จ");
      await refresh();
    }
  }

  return (
    <Layout>
      <PageHeader
        title="ผลงาน"
        action={<Button onClick={openAddForm}>+ เพิ่มผลงาน</Button>}
      />

      {/* ---------- โซนผลงานเด่นในหน้าบริการ ---------- */}
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800">
            <Star className="w-4 h-4 text-amber-500" fill="currentColor" />
            ผลงานเด่นในหน้าบริการ
          </h2>
          <span className={`text-sm font-medium ${atCap ? "text-amber-600" : "text-slate-500"}`}>
            เลือกแล้ว {featuredCount}/{FEATURED_PORTFOLIO_LIMIT}
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          ลากเพื่อจัดลำดับการแสดงในโซน “สำรวจผลงาน” ของหน้าบริการ · กดดาวในตารางด้านล่างเพื่อเพิ่ม/เอาออก
        </p>

        {featuredItems.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
            ยังไม่ได้เลือกผลงานเด่น
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {featuredItems.map((item, i) => {
              const cover = item.images?.[0];
              const noImage = !cover;
              return (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => setDraggingId(item.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onDragOver(item.id);
                  }}
                  onDrop={persistOrder}
                  onDragEnd={persistOrder}
                  className={`flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-2 py-2 ${
                    draggingId === item.id ? "opacity-50" : ""
                  } ${!item.published ? "bg-slate-50" : ""}`}
                >
                  <GripVertical className="w-4 h-4 shrink-0 cursor-grab text-slate-400" />
                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400 tabular-nums">
                    {i + 1}
                  </span>
                  {cover ? (
                    <img
                      src={cover}
                      alt=""
                      className="h-10 w-14 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-500">
                      <ImageOff className="w-4 h-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-800">{item.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-slate-400">{TYPE_LABEL[item.type]}</span>
                      {noImage && (
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                          ไม่มีรูป
                        </span>
                      )}
                      {!item.published && (
                        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                          ยังไม่เผยแพร่ · ลูกค้าไม่เห็น
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="dangerQuiet" size="sm" onClick={() => toggleFeatured(item)}>
                    เอาออกจากหน้าบริการ
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showAddForm && (
        <div className="mb-4 grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label htmlFor="portfolio-title" className="mb-1 block text-xs text-slate-700">
                ชื่อผลงาน <span className="text-red-500">*</span>
              </label>
              <input
                id="portfolio-title"
                autoFocus
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="เช่น บ้านเดี่ยว 2 ชั้น หมู่บ้านลัดดา"
                aria-invalid={titleMissing || undefined}
                className={`w-full rounded-md border px-2 py-1 text-sm ${titleMissing ? "border-red-400" : "border-slate-300"}`}
              />
              {titleMissing && <p className="mt-1 text-xs text-red-600">กรอกชื่อผลงาน</p>}
            </div>
            {/* มีแค่ 2 ตัวเลือก — ปุ่มสลับกดครั้งเดียว แทน dropdown ที่ต้องกดสองครั้ง */}
            <div>
              <span id="portfolio-type" className="mb-1 block text-xs text-slate-700">
                ประเภท
              </span>
              <div role="radiogroup" aria-labelledby="portfolio-type" className="inline-flex rounded-md border border-slate-300 p-0.5">
                {(Object.keys(TYPE_LABEL) as PortfolioType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={form.type === t}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`rounded px-3 py-1 text-sm transition-colors ${
                      form.type === t ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>
              รายละเอียด <span className="text-slate-400">(ไม่บังคับ)</span>
            </span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="พื้นที่ใช้สอย ทำเล จุดเด่นของงาน"
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              rows={3}
            />
          </label>
          <ImageUploadField
            label="รูปภาพ"
            cover
            value={form.images}
            onChange={(v) => setForm((f) => ({ ...f, images: v }))}
          />
          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <Button onClick={submitCreate}>
              <Check size={14} /> บันทึก
            </Button>
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>
              <X size={14} /> ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {loading && <TableSkeleton rows={6} cols={5} />}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && items.length === 0 && <p className="text-slate-500">ยังไม่มีผลงาน</p>}

      {items.length > 0 && (
        <p className="text-xs text-slate-500 mb-2">
          แสดง {pageStart + 1}-{pageStart + pageItems.length} จาก {items.length} ผลงาน
        </p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">ชื่อผลงาน</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2 text-center">หน้าบริการ</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => {
              const blocked = !item.featured && atCap;
              const star = featuredStar(item.featured, blocked, "หน้าบริการ", FEATURED_PORTFOLIO_LIMIT);
              return (
                <tr
                  key={item.id}
                  {...rowNav(`/portfolio/${item.id}`)}
                  className={`border-t border-slate-100 ${rowNavClass}`}
                >
                  <td className="px-3 py-2">
                    <Link
                      to={`/portfolio/${item.id}`}
                      onClick={stopRowNav}
                      className="font-medium text-slate-800"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{TYPE_LABEL[item.type]}</td>
                  <td className="px-3 py-2 text-center" onClick={stopRowNav}>
                    <button
                      type="button"
                      onClick={() => toggleFeatured(item)}
                      disabled={blocked}
                      title={star.title}
                      aria-label={item.featured ? "เอาออกจากหน้าบริการ" : "แสดงในหน้าบริการ"}
                      className={`inline-flex items-center justify-center rounded-md p-1 transition-colors ${star.className}`}
                    >
                      <Star className="w-5 h-5" fill={item.featured ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className={publishedBadgeClass(item.published)}>
                      {item.published ? "เผยแพร่แล้ว" : "ร่าง"}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" onClick={stopRowNav}>
                    <div className="flex gap-2">
                      <Button
                        variant={item.published ? "dangerQuiet" : "ghost"}
                        size="sm"
                        onClick={() => togglePublish(item)}
                      >
                        {item.published ? "ยกเลิกเผยแพร่" : "เผยแพร่"}
                      </Button>
                      <Button variant="dangerQuiet" size="sm" onClick={() => handleDelete(item.id)}>
                        <Trash2 size={14} /> ลบ
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </Layout>
  );
}
