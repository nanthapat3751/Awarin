import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Pencil, Plus, Power, PowerOff, Tag, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { MaterialDto, WorkCategoryDto, WorkCategoryLevel } from "@systemboq/shared-types";

import { Button, buttonClasses } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { ScrollableTabBar } from "../components/ScrollableTabBar";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import { createCategory, deleteCategory, listCategories, updateCategory } from "../lib/categories-api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { listMaterials } from "../lib/materials-api";
import { TableSkeleton } from "../components/Skeleton";

const CHILD_LEVEL: Record<WorkCategoryLevel, WorkCategoryLevel | null> = {
  CATEGORY: "SUBGROUP",
  SUBGROUP: "ITEM",
  ITEM: null,
};

const LEVEL_LABEL: Record<WorkCategoryLevel, string> = {
  CATEGORY: "หมวดงาน",
  SUBGROUP: "กลุ่มงานย่อย",
  ITEM: "รายการ",
};

function money(value: string | number): string {
  return Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

/**
 * ราคา 0 ให้จางกว่าราคาจริง — ของจริงมีค่าแรง 0 อยู่ 45 รายการ (งานเหมาเก็บยอดไว้ฝั่งเดียว)
 * ถ้าพิมพ์ดำเท่ากันหมดจะแยกไม่ออกว่า "ราคาเป็นศูนย์จริง" หรือ "ยังไม่ได้กรอก"
 */
function MoneyCell({ value }: { value: string | number }) {
  const n = Number(value);
  return <span className={n === 0 ? "text-slate-400" : "text-slate-800"}>{money(n)}</span>;
}

/** เผื่อเสีย (%) — ว่าง = ยังไม่ได้ตั้ง แสดงเป็นขีดจาง ๆ เหมือนหน้าวัสดุ */
function WasteCell({ value }: { value: string | null }) {
  if (value === null) return <span className="text-slate-300">—</span>;
  return <span className="text-slate-700">{Number(value)}%</span>;
}

/** รายการต่อหน้าในแท็บหมวด — นับเฉพาะรายการ (ITEM) ที่กางอยู่ หัวกลุ่มงานย่อยไม่นับ */
const PAGE_SIZE = 15;

/**
 * ชิ้นของกลุ่มงานย่อยหนึ่งกลุ่มที่อยู่ในหน้าหนึ่ง — กลุ่มที่ยาวข้ามหน้าจะมีหลายชิ้น
 * from = ลำดับ (เริ่ม 0) ของรายการแรกในชิ้นนี้ · total = รายการที่กางอยู่ทั้งกลุ่ม
 */
interface PageSegment {
  sub: WorkCategoryDto;
  items: WorkCategoryDto[];
  from: number;
  total: number;
  continued: boolean;
}

/** How long a row stays ringed after being jumped to from a search result. */
const HIGHLIGHT_MS = 2500;

/**
 * คีย์เดิมที่เคยจำสถานะยุบข้ามการเปิดหน้า — เลิกใช้แล้ว (ผู้ใช้สั่ง 2026-09-19: เปิดหน้ามาต้องกางครบเสมอ
 * แบบหน้าแม่แบบ/BOQ โครงการ ไม่งั้นกลุ่มที่ยุบค้างไว้ดูเหมือนรายการหาย) · เก็บชื่อไว้เพื่อล้างของเก่าทิ้ง
 */
const LEGACY_COLLAPSED_STORAGE_KEY = "staffCategoryCollapsed";

/** ชื่อบนแท็บ — ตัดคำนำ "หมวดงาน" ที่ทุกหมวดมีเหมือนกันออก แท็บจะได้ไม่ยาวจนล้นจอ */
const shortCategoryName = (name: string) => name.replace(/^หมวดงาน\s*/, "") || name;

const DASH = <span className="text-slate-300">—</span>;

function ArchivedBadge() {
  return (
    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">ปิดใช้งาน</span>
  );
}

/** ช่องราคารวมของรายการ: วัสดุเดียว = ราคา · หลายวัสดุ = บอกจำนวน (กางบรรทัดย่อยข้างล่าง) · ไม่มี = เตือน */
function ItemTotalCell({ total, materialCount }: Readonly<{ total: number | null; materialCount: number }>) {
  if (total != null) {
    return (
      <span className="font-medium">
        <MoneyCell value={total} />
      </span>
    );
  }
  // หลายวัสดุ: ไม่ยัดราคาเดียวให้เข้าใจผิด — กางเป็นบรรทัดย่อยข้างล่างแทน
  if (materialCount > 1) return <span className="text-xs text-slate-500">{materialCount} วัสดุ</span>;
  return <span className="text-xs text-amber-600">ยังไม่มีราคา</span>;
}

type CategorySummary = { items: number; priced: number; units: Set<string>; min: number; max: number };

function emptySummary(): CategorySummary {
  return { items: 0, priced: 0, units: new Set<string>(), min: Infinity, max: -Infinity };
}

/** นับรายการหนึ่งชิ้นเข้าสรุป — ราคาต่อหน่วยรวมวัสดุ+ค่าแรงของทุกวัสดุที่ผูกไว้ */
function addItemToSummary(acc: CategorySummary, mats: MaterialDto[]): void {
  acc.items += 1;
  if (mats.length > 0) acc.priced += 1;
  for (const m of mats) {
    const total = Number(m.materialUnitPrice) + Number(m.laborUnitPrice);
    acc.units.add(m.unit);
    acc.min = Math.min(acc.min, total);
    acc.max = Math.max(acc.max, total);
  }
}

function mergeSummary(acc: CategorySummary, sub: CategorySummary): void {
  acc.items += sub.items;
  acc.priced += sub.priced;
  for (const u of sub.units) acc.units.add(u);
  acc.min = Math.min(acc.min, sub.min);
  acc.max = Math.max(acc.max, sub.max);
}

function bySortOrderThenName(a: WorkCategoryDto, b: WorkCategoryDto): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name, "th");
}

/**
 * ปุ่ม "ตั้งราคา / แก้ราคา" ของแถวรายการ — ราคาอยู่ที่หน้าวัสดุ/ค่าแรงที่เดียว ปุ่มนี้พาไปที่นั่น
 * กรองเฉพาะวัสดุของรายการนี้ · ยังไม่มีวัสดุ = เปิดฟอร์มเพิ่มที่เติมหมวด/ชื่อรายการให้แล้ว
 */
function PriceLink({ node, materialCount }: Readonly<{ node: WorkCategoryDto; materialCount: number }>) {
  const priced = materialCount > 0;
  return (
    <Link
      to={`/materials?category=${encodeURIComponent(node.id)}${priced ? "" : "&add=1"}`}
      className={`${buttonClasses("ghost", "sm")} shrink-0`}
      title={priced ? `แก้ราคาของ “${node.name}” ที่หน้าวัสดุ/ค่าแรง` : `ตั้งราคาให้ “${node.name}” ที่หน้าวัสดุ/ค่าแรง`}
    >
      <Tag size={14} /> {priced ? "แก้ราคา" : "ตั้งราคา"}
    </Link>
  );
}

export function CategoriesPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const { categoryId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [categories, setCategories] = useState<WorkCategoryDto[]>([]);
  const [materials, setMaterials] = useState<MaterialDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // กลุ่มย่อยที่ยุบไว้ — อยู่แค่ในหน้าที่เปิดอยู่ ไม่จำข้ามการเปิดหน้า
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // แสดงหมวดที่ปิดใช้งานด้วยหรือไม่ — ค่าเริ่มต้น: ซ่อน
  const [showArchived, setShowArchived] = useState(false);

  // id ของหมวดที่กำลังเพิ่มลูก · "root" = กำลังเพิ่มหมวดหลัก · null = ไม่ได้เพิ่มอะไร
  const [addingChildFor, setAddingChildFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  // หน้านี้จัด "โครง" อย่างเดียว — ราคาอยู่ที่หน้าวัสดุ/ค่าแรงที่เดียว (เดิมมีช่องราคาตอนเพิ่มรายการ
  // และปุ่ม "+ วัสดุ" ที่แอบสร้างวัสดุให้ ผู้ใช้งงว่าของจริงอยู่ไหน เพราะเพิ่มได้สองที่แต่แก้ราคาได้ที่เดียว)

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingCode, setEditingCode] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const archivedCount = useMemo(() => categories.filter((c) => !c.active).length, [categories]);

  const childrenOf = useMemo(() => {
    const map = new Map<string, WorkCategoryDto[]>();
    for (const c of categories) {
      if (!c.parentId) continue;
      if (!map.has(c.parentId)) map.set(c.parentId, []);
      map.get(c.parentId)!.push(c);
    }
    for (const list of map.values()) list.sort(bySortOrderThenName);
    return map;
  }, [categories]);

  const topCategories = useMemo(
    () => categories.filter((c) => c.level === "CATEGORY").sort(bySortOrderThenName),
    [categories],
  );

  // กรองหมวดที่ปิดใช้งานออกเมื่อไม่ได้เปิด "แสดงที่ปิดใช้งาน"
  const passesArchive = (c: WorkCategoryDto) => showArchived || c.active;

  // แสดงทีละหมวดงานหลัก (แท็บ) แบบเดียวกับหน้าแม่แบบและหน้า BOQ ของโครงการ
  // ไม่มีหมวดใน URL = แท็บ "ภาพรวม" (รายชื่อหมวดหลัก) · ลิงก์ที่ชี้กลุ่มย่อย/รายการ พาไปหมวดหลักของมัน
  const requested = categoryId ? byId.get(categoryId) : undefined;
  const selected = requested
    ? requested.level === "CATEGORY"
      ? requested
      : topAncestorOf(requested.id)
    : undefined;
  // หมวดที่ปิดใช้งานซ่อนจากแถบ ยกเว้นหมวดที่เปิดอยู่ (เพิ่งกดปิดไป — ต้องยังเห็นว่าอยู่ตรงไหน)
  const tabCategories = topCategories.filter((c) => passesArchive(c) || c.id === selected?.id);
  const selectedIndex = selected ? tabCategories.indexOf(selected) : -1;

  /** "C > C-03 > C-03-01" — tells the reader where a search hit actually lives. */
  function pathOf(id: string): string {
    const parts: string[] = [];
    let current = byId.get(id);
    while (current) {
      parts.unshift(current.code ?? current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return parts.join(" > ");
  }

  function topAncestorOf(id: string): WorkCategoryDto | undefined {
    let current = byId.get(id);
    while (current?.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return categories
      .filter((c) => showArchived || c.active)
      .filter((c) => c.name.toLowerCase().includes(q) || (c.code ?? "").toLowerCase().includes(q))
      .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
  }, [categories, search, showArchived]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [catRes, matRes] = await Promise.all([listCategories(), listMaterials()]);
      setCategories(catRes.categories);
      setMaterials(matRes.materials);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (highlightId === null) return;
    const timer = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [highlightId]);

  // ล้างสถานะยุบที่เวอร์ชันก่อนจำไว้ในเบราว์เซอร์ — ไม่ได้อ่านแล้ว ไม่ต้องเก็บค้าง
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_COLLAPSED_STORAGE_KEY);
    } catch {
      // โหมดส่วนตัว/บล็อกที่เก็บข้อมูล — ไม่มีอะไรให้ล้าง
    }
  }, []);

  function open(ids: string[]) {
    setCollapsed((current) => {
      const next = new Set(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Opens every ancestor of a node so a jumped-to row is not hidden inside a closed group. */
  function expandAncestorsOf(id: string) {
    const ancestors: string[] = [];
    let node = byId.get(id);
    while (node?.parentId) {
      ancestors.push(node.parentId);
      node = byId.get(node.parentId);
    }
    open(ancestors);
  }

  // พี่น้องที่แสดงอยู่จริง (กรอง archived + เรียงแล้ว) ของ parent ที่ระบุ — ใช้คิดการจัดลำดับ
  function displayedSiblings(parentId: string | null): WorkCategoryDto[] {
    const base = parentId === null ? topCategories : childrenOf.get(parentId) ?? [];
    return base.filter(passesArchive);
  }

  /** เปลี่ยนแท็บ (null = ภาพรวม) — replace ไม่ให้ทุกการกดแท็บไปกองในประวัติปุ่มย้อนกลับ */
  function openTab(id: string | null, scroll = false) {
    setSearch("");
    setEditingId(null);
    setAddingChildFor((cur) => (cur === "root" ? cur : null));
    navigate(id ? `/categories/${id}` : "/categories", { replace: true });
    // กดจากท้ายหมวดยาว ๆ → พากลับขึ้นมาที่แถบ ไม่งั้นหมวดใหม่เริ่มกลางจอ
    if (scroll) {
      requestAnimationFrame(() => {
        const anchor = document.getElementById("category-tabs-anchor");
        const top = anchor?.getBoundingClientRect().top ?? 0;
        if (top < 0) window.scrollTo({ top: window.scrollY + top });
      });
    }
  }

  /** target = id ของหมวดแม่ หรือ "root" สำหรับหมวดหลัก */
  function startAdd(target: string) {
    setAddingChildFor(target);
    setNewName("");
    setNewCode("");
    setNewDescription("");
    // ฟอร์ม render อยู่ภายในกลุ่ม จึงต้องเปิดกลุ่มไว้ถึงจะเห็น
    if (target !== "root") open([target]);
  }

  /** พาไปดูของที่เพิ่งเพิ่ม — หมวดหลักใหม่มีแท็บของตัวเอง เปิดแท็บนั้นเลย ไม่ทิ้งผู้ใช้ไว้ที่เดิม */
  function showAdded(id: string, parentId: string | null, level: WorkCategoryLevel) {
    if (level === "CATEGORY") {
      navigate(`/categories/${id}`);
      return;
    }
    if (parentId) open([parentId]);
    setHighlightId(id);
  }

  async function submitAdd(parentId: string | null, level: WorkCategoryLevel) {
    if (!newName.trim()) return;

    try {
      const res = await createCategory({
        level,
        parentId,
        name: newName.trim(),
        code: newCode.trim() || undefined,
        description: newDescription.trim() || undefined,
      });

      setAddingChildFor(null);
      await refresh();
      showAdded(res.category.id, parentId, level);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มหมวดงานไม่สำเร็จ");
    }
  }

  function startEdit(node: WorkCategoryDto) {
    setEditingId(node.id);
    setEditingName(node.name);
    setEditingCode(node.code ?? "");
    setEditingDescription(node.description ?? "");
  }

  async function submitEdit(id: string) {
    if (!editingName.trim()) return;
    try {
      await updateCategory(id, {
        name: editingName.trim(),
        code: editingCode.trim() || null,
        description: editingDescription.trim() || null,
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "แก้ไขไม่สำเร็จ");
    }
  }

  /**
   * มีกลุ่มงานย่อย/รายการอยู่ข้างในกี่ตัว — ปิดหมวดแม่เท่ากับปิดทั้งกิ่ง (isCategoryChainActive
   * ฝั่งเซิร์ฟเวอร์) ผู้ใช้จึงควรเห็นขอบเขตนี้ก่อนกดยืนยัน
   */
  function descendantCount(id: string): number {
    let total = 0;
    for (const child of childrenOf.get(id) ?? []) total += 1 + descendantCount(child.id);
    return total;
  }

  async function toggleArchive(node: WorkCategoryDto) {
    if (node.active) {
      const inside = descendantCount(node.id);
      const scope = inside > 0 ? ` พร้อมทุกอย่างที่อยู่ข้างใน (${inside} รายการ)` : "";
      const ok = await confirm(
        `ปิดใช้งาน "${node.name}"${scope} ใช่หรือไม่? จะไม่ขึ้นให้เลือกตอนเพิ่มวัสดุหรือรายการ BOQ ใหม่ ส่วนของเดิมที่ใช้หมวดนี้อยู่ยังอยู่ครบ และเปิดกลับได้ทุกเมื่อ`,
        { confirmLabel: "ปิดใช้งาน" },
      );
      if (!ok) return;
    }
    const wasActive = node.active;
    try {
      await updateCategory(node.id, { active: !node.active });
      await refresh();
      // ปิดแล้วแถวจะหายไปจากหน้า (ค่าเริ่มต้นซ่อนที่ปิดไว้) — ต้องบอกว่ามันไปอยู่ไหน
      toast.success(
        wasActive
          ? `ปิดใช้งาน "${node.name}" แล้ว — ติ๊ก "แสดงที่ปิดใช้งาน" ด้านบนเพื่อดูหรือเปิดกลับ`
          : `เปิดใช้งาน "${node.name}" แล้ว`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function handleDelete(node: WorkCategoryDto) {
    // หมวดงานไม่ได้อยู่ในถังขยะ (soft-delete) — กดแล้วหายถาวร จึงต้องบอกให้ชัด + เสนอทางที่กู้คืนได้
    const ok = await confirm(
      `ลบ "${node.name}" ถาวรใช่หรือไม่? หมวดงานไม่เข้าถังขยะ กู้คืนไม่ได้ — ถ้าแค่ไม่อยากให้ใช้ต่อ ให้กด "ปิดใช้งาน" แทน`,
      { confirmLabel: "ลบถาวร", variant: "danger" },
    );
    if (!ok) return;
    try {
      await deleteCategory(node.id);
      await refresh();
      // Deleting the open หมวดงาน would leave the page pointing at nothing.
      if (node.level === "CATEGORY") navigate("/categories");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    }
  }

  function jumpToResult(node: WorkCategoryDto) {
    const top = topAncestorOf(node.id);
    setSearch("");
    expandAncestorsOf(node.id);
    setHighlightId(node.id);
    if (!top) return;
    // คิดหน้าปลายทางตรงนี้แล้วเปลี่ยน URL ครั้งเดียว (/categories/C?page=3) — ถ้าเปลี่ยนหมวดก่อนแล้วค่อย
    // ให้ effect ตั้ง ?page ตามทีหลัง React Router v7 จะเรียงสองการเปลี่ยนนี้เป็น transition แยกกัน
    // บางครั้ง URL ได้ ?page=3 แต่หน้าจอค้างหน้า 1 (เจอจริงในเทสต์ 1 ใน 2 รอบ)
    const expanded = new Set(collapsed);
    for (let cur = byId.get(node.id); cur?.parentId; cur = byId.get(cur.parentId)) expanded.delete(cur.parentId);
    const target = pageOfRow(buildCategoryPages(top.id, expanded), node.id);
    navigate(target > 1 ? `/categories/${top.id}?page=${target}` : `/categories/${top.id}`);
  }

  /** วัสดุ/ค่าแรงที่ผูกกับหมวดระดับ ITEM แต่ละอัน — ใช้เติมคอลัมน์ราคาในตาราง */
  const materialsByCategory = useMemo(() => {
    const map = new Map<string, MaterialDto[]>();
    for (const m of materials) {
      if (!m.categoryId) continue;
      if (!map.has(m.categoryId)) map.set(m.categoryId, []);
      map.get(m.categoryId)!.push(m);
    }
    return map;
  }, [materials]);

  const COL_COUNT = 8;

  /**
   * สรุปของทุกหมวดที่ไม่ใช่ระดับรายการ — จำนวนรายการข้างใน, ตั้งราคาแล้วกี่รายการ และช่วงราคา
   * ต่อหน่วย. ช่วงราคาจะโชว์เฉพาะตอนที่ของข้างในใช้ "หน่วยเดียวกันหมด" เพราะ 50,000/เหมา กับ
   * 34/กก. เอามาเทียบกันไม่ได้ (และห้ามบวกรวมกันเด็ดขาด)
   */
  const summaryByCategory = useMemo(() => {
    const map = new Map<string, CategorySummary>();
    const walk = (id: string): CategorySummary => {
      const acc = emptySummary();
      for (const child of childrenOf.get(id) ?? []) {
        if (child.level === "ITEM") addItemToSummary(acc, materialsByCategory.get(child.id) ?? []);
        else mergeSummary(acc, walk(child.id));
      }
      map.set(id, acc);
      return acc;
    };
    for (const c of categories) if (c.level === "CATEGORY") walk(c.id);
    return map;
  }, [categories, childrenOf, materialsByCategory]);

  /** สถานะราคาของหมวด: ยังตั้งไม่ครบ (ส้ม) · ช่วงราคาถ้าหน่วยเดียวกันหมด · ไม่งั้นบอกว่าครบแล้ว */
  function priceSummary(node: WorkCategoryDto) {
    const sum = summaryByCategory.get(node.id);
    if (!sum?.items) return null;
    const sameUnit = sum.units.size === 1 ? [...sum.units][0] : null;
    if (sum.priced < sum.items) {
      return <span className="text-xs text-amber-600">ตั้งราคาแล้ว {sum.priced}/{sum.items}</span>;
    }
    if (sameUnit) {
      return (
        <span className="text-xs text-slate-500">
          {money(sum.min)} – {money(sum.max)}
          <span className="text-slate-400"> /{sameUnit}</span>
        </span>
      );
    }
    return (
      <span className="text-xs text-emerald-600" title="ทุกรายการมีราคาแล้ว (หน่วยต่างกัน จึงไม่แสดงช่วงราคา)">
        ตั้งราคาแล้ว {sum.priced}/{sum.items}
      </span>
    );
  }

  /**
   * ปุ่มจัดการของหมวด · compact = ปุ่มประจำแถวในตาราง: ปุ่มเพิ่มลูกยังมีข้อความ (เป็นงานหลักของหน้า)
   * ส่วน แก้ไข/ปิดใช้งาน/ลบ เหลือแต่ไอคอน — เดิมทุกแถวมี 4 ปุ่มเต็ม กินคอลัมน์ 352px จนตาราง
   * กว้าง 1,180px เกินพื้นที่หน้า (1,104px) ทุกจอ หัวหมวดหลักใช้ปุ่มเต็มเพราะมีที่เหลือบนแถวชื่อหมวด
   */
  function actionButtons(node: WorkCategoryDto, compact = false) {
    const childLevel = CHILD_LEVEL[node.level];
    const isArchived = !node.active;
    const iconOnly = compact ? "px-2!" : "";
    const archiveLabel = isArchived ? "เปิดใช้งาน" : "ปิดใช้งาน";
    return (
      <div className="flex items-center justify-end gap-1.5">
        {childLevel && (
          <Button variant="ghost" size="sm" className="shrink-0" onClick={() => startAdd(node.id)}>
            <Plus size={14} /> {LEVEL_LABEL[childLevel]}
          </Button>
        )}
        {node.level === "ITEM" && <PriceLink node={node} materialCount={materialsByCategory.get(node.id)?.length ?? 0} />}
        <Button
          variant="ghost"
          size="sm"
          className={`shrink-0 ${iconOnly}`}
          onClick={() => startEdit(node)}
          title={compact ? `แก้ไข ${node.name}` : undefined}
          aria-label={compact ? `แก้ไข ${node.name}` : undefined}
        >
          <Pencil size={14} /> {!compact && "แก้ไข"}
        </Button>
        <Button
          variant={isArchived ? "ghost" : "dangerQuiet"}
          size="sm"
          className={`shrink-0 ${iconOnly}`}
          onClick={() => toggleArchive(node)}
          title={compact ? `${archiveLabel} ${node.name}` : undefined}
          aria-label={compact ? `${archiveLabel} ${node.name}` : undefined}
        >
          {isArchived ? <Power size={14} /> : <PowerOff size={14} />} {!compact && archiveLabel}
        </Button>
        <Button
          variant="dangerQuiet"
          size="sm"
          className={`shrink-0 ${iconOnly}`}
          onClick={() => handleDelete(node)}
          title={compact ? `ลบถาวร ${node.name}` : undefined}
          aria-label={compact ? `ลบถาวร ${node.name}` : undefined}
        >
          <Trash2 size={14} /> {!compact && "ลบถาวร"}
        </Button>
      </div>
    );
  }

  /** ฟอร์มแก้ไขชื่อ/รหัส — กินความกว้างทั้งแถวเพื่อไม่ให้ไปบีบคอลัมน์ราคา */
  function editRow(node: WorkCategoryDto) {
    return (
      <tr key={node.id} className="border-t border-slate-200 bg-slate-50">
        <td colSpan={COL_COUNT} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={editingCode}
              onChange={(e) => setEditingCode(e.target.value)}
              placeholder="รหัส"
              className="border border-slate-300 rounded-md px-2 py-1 text-sm w-28 font-mono"
            />
            <input
              autoFocus
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="ชื่อหมวดงาน"
              className="border border-slate-300 rounded-md px-2 py-1 text-sm flex-1 min-w-40"
            />
            <input
              value={editingDescription}
              onChange={(e) => setEditingDescription(e.target.value)}
              placeholder="คำอธิบาย (ไม่บังคับ)"
              className="border border-slate-300 rounded-md px-2 py-1 text-sm flex-1 min-w-40"
            />
            <Button size="sm" onClick={() => submitEdit(node.id)}>
              <Check size={14} /> บันทึก
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
              <X size={14} /> ยกเลิก
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  function addChildRow(node: WorkCategoryDto, childLevel: WorkCategoryLevel) {
    return (
      <tr key={`${node.id}-add`} className="border-t border-slate-200 bg-white">
        <td colSpan={COL_COUNT} className="px-3 py-2">
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                placeholder={`ชื่อ${LEVEL_LABEL[childLevel]}`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm flex-1"
              />
              <Button size="sm" onClick={() => submitAdd(node.id, childLevel)}>
                <Plus size={14} /> เพิ่ม
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAddingChildFor(null)}>
                <X size={14} /> ยกเลิก
              </Button>
            </div>
            <input
              placeholder="คำอธิบาย (ไม่บังคับ)"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
            {childLevel === "ITEM" && (
              <p className="text-xs text-slate-500">
                หน่วยและราคาตั้งที่หน้า “วัสดุ/ค่าแรง” — เพิ่มรายการแล้วกด “ตั้งราคา” ที่แถวนั้น
              </p>
            )}
          </div>
        </td>
      </tr>
    );
  }

  /**
   * แปลงต้นไม้หมวดงานเป็นแถวตารางแบน ๆ — ตารางซ้อนตารางไม่ได้ จึงเก็บระดับชั้นไว้ด้วยการ
   * เยื้อง (paddingLeft) และแถบคั่นสีพื้น แบบเดียวกับตาราง BOQ ในหน้าโครงการ
   */
  /** แถวของรายการ (ITEM) + บรรทัดวัสดุย่อยเมื่อผูกวัสดุหลายตัว */
  function itemRows(node: WorkCategoryDto, depth: number): ReactElement[] {
    const mats = materialsByCategory.get(node.id) ?? [];
    const one = mats.length === 1 ? mats[0] : null;
    const total = one ? Number(one.materialUnitPrice) + Number(one.laborUnitPrice) : null;
    const isArchived = !node.active;
    const highlighted = highlightId === node.id;
    const rows: ReactElement[] = [
      <tr
        key={node.id}
        data-row-id={node.id}
        className={`border-t border-slate-100 ${highlighted ? "bg-emerald-50" : "hover:bg-slate-50"} ${
          isArchived ? "opacity-60" : ""
        }`}
      >
        <td className="px-3 py-1.5 font-mono text-xs text-slate-500 whitespace-nowrap">{node.code}</td>
        <td className="px-3 py-1.5 text-slate-800" style={{ paddingLeft: 12 + depth * 18 }}>
          {node.name}
          {isArchived && <ArchivedBadge />}
          {node.description && <span className="block text-xs text-slate-500">{node.description}</span>}
        </td>
        <td className="px-3 py-1.5 text-slate-700 whitespace-nowrap">{one ? one.unit : DASH}</td>
        <td className="px-3 py-1.5 text-right whitespace-nowrap">
          {one ? <MoneyCell value={one.materialUnitPrice} /> : DASH}
        </td>
        <td className="px-3 py-1.5 text-right whitespace-nowrap">
          {one ? <MoneyCell value={one.laborUnitPrice} /> : DASH}
        </td>
        <td className="px-3 py-1.5 text-right whitespace-nowrap">
          <ItemTotalCell total={total} materialCount={mats.length} />
        </td>
        <td className="px-3 py-1.5 text-right whitespace-nowrap">
          {one ? <WasteCell value={one.wasteFactorPct} /> : DASH}
        </td>
        <td className="px-3 py-1.5">{actionButtons(node, true)}</td>
      </tr>,
    ];
    // รายการที่ผูกวัสดุหลายตัว: โชว์ทีละบรรทัดให้เห็นราคาจริงครบ และกดไปแก้ที่หน้าวัสดุได้
    if (mats.length > 1) rows.push(...mats.map((m) => materialSubRow(node, m, depth)));
    return rows;
  }

  function materialSubRow(node: WorkCategoryDto, m: MaterialDto, depth: number): ReactElement {
    return (
      <tr key={`${node.id}-m-${m.id}`} className="border-t border-slate-50 bg-slate-50/60 text-xs">
        <td className="px-3 py-1" />
        <td className="px-3 py-1 text-slate-500" style={{ paddingLeft: 24 + depth * 18 }}>
          <Link
            to={`/materials?q=${encodeURIComponent(m.code ?? m.name)}`}
            className="hover:text-brand hover:underline"
            title="เปิดที่หน้าวัสดุ/ค่าแรงเพื่อแก้ราคา"
          >
            ↳ {m.name}
          </Link>
        </td>
        <td className="px-3 py-1 text-slate-500 whitespace-nowrap">{m.unit}</td>
        <td className="px-3 py-1 text-right whitespace-nowrap">
          <MoneyCell value={m.materialUnitPrice} />
        </td>
        <td className="px-3 py-1 text-right whitespace-nowrap">
          <MoneyCell value={m.laborUnitPrice} />
        </td>
        <td className="px-3 py-1 text-right whitespace-nowrap">
          <MoneyCell value={Number(m.materialUnitPrice) + Number(m.laborUnitPrice)} />
        </td>
        <td className="px-3 py-1 text-right whitespace-nowrap">
          <WasteCell value={m.wasteFactorPct} />
        </td>
        <td className="px-3 py-1" />
      </tr>
    );
  }

  /** ข้อความนับใต้ชื่อกลุ่ม: กลุ่มที่ถูกตัดข้ามหน้าบอกช่วง "a–b จาก N" · ไม่งั้นบอกจำนวนลูก */
  function groupCountText(childLevel: WorkCategoryLevel | null, childCount: number, slice?: PageSegment) {
    // กลุ่มที่ถูกตัดข้ามหน้า: หัวซ้ำบนหน้าถัดไปพร้อม "(ต่อ)" และบอกช่วงรายการ
    const split = slice != null && slice.items.length > 0 && slice.items.length < slice.total;
    if (split && childLevel) {
      return `${slice.from + 1}–${slice.from + slice.items.length} จาก ${slice.total} ${LEVEL_LABEL[childLevel]}`;
    }
    return childLevel && childCount > 0 ? `${childCount} ${LEVEL_LABEL[childLevel]}` : null;
  }

  /** หัวหมวด (A) / หัวกลุ่มงานย่อย (A-01) — แถบคั่นเต็มความกว้าง */
  function groupHeaderRow(
    node: WorkCategoryDto,
    depth: number,
    group: { children: WorkCategoryDto[]; collapsible: boolean; isOpen: boolean; slice?: PageSegment },
  ): ReactElement {
    const { children, collapsible, isOpen, slice } = group;
    const continued = slice?.continued ?? false;
    const isTop = node.level === "CATEGORY";
    const isArchived = !node.active;
    const sum = summaryByCategory.get(node.id);
    return (
      <tr
        key={continued ? `${node.id}-cont-${slice!.from}` : node.id}
        data-row-id={continued ? undefined : node.id}
        className={`border-t border-slate-200 ${isTop ? "bg-slate-100" : "bg-slate-50"} ${
          highlightId === node.id ? "ring-2 ring-emerald-300" : ""
        } ${isArchived ? "opacity-60" : ""}`}
      >
        <td colSpan={3} className="px-3 py-1.5">
          <div className="flex items-center gap-2" style={{ paddingLeft: depth * 18 }}>
            {collapsible ? (
              <button
                type="button"
                onClick={() => toggleExpanded(node.id)}
                aria-expanded={isOpen}
                aria-label={isOpen ? "ยุบ" : "กาง"}
                className="shrink-0 text-slate-500 hover:text-slate-800"
              >
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              <span className={`${isTop ? "font-medium text-slate-800" : "text-slate-700"} text-sm`}>
                {node.code ? `${node.code} — ` : ""}
                {node.name}
                {continued && <span className="text-slate-500"> (ต่อ)</span>}
              </span>
              <span className="ml-2 text-xs text-slate-500">
                {groupCountText(CHILD_LEVEL[node.level], children.length, slice)}
                {/* หมวดใหญ่บอกจำนวนรายการรวมด้วย ไม่งั้นต้องกางถึงจะรู้ว่ามีของกี่ชิ้น */}
                {isTop && sum?.items ? ` · ${sum.items} รายการ` : null}
              </span>
              {isArchived && <ArchivedBadge />}
              {node.description && <span className="block text-xs text-slate-500">{node.description}</span>}
            </span>
          </div>
        </td>
        <td colSpan={4} className="px-3 py-1.5 text-right whitespace-nowrap">
          {priceSummary(node)}
        </td>
        <td className="px-3 py-1.5">{actionButtons(node, true)}</td>
      </tr>
    );
  }

  function pushRows(node: WorkCategoryDto, depth: number, out: ReactElement[], slice?: PageSegment) {
    const childLevel = CHILD_LEVEL[node.level];
    const children = displayedSiblings(node.id);
    const continued = slice?.continued ?? false;
    // หมวดที่กำลังเปิดอยู่ (จากตัวกรอง) คือตัวหน้าเอง จะยุบไม่ได้ ไม่งั้นหน้าจะว่าง
    const collapsible = children.length > 0 && !(node.level === "CATEGORY" && Boolean(selected));
    const isOpen = !collapsible || !collapsed.has(node.id);

    if (editingId === node.id && !continued) out.push(editRow(node));
    else if (node.level === "ITEM") out.push(...itemRows(node, depth));
    else out.push(groupHeaderRow(node, depth, { children, collapsible, isOpen, slice }));

    // ฟอร์มเพิ่ม/วัสดุอยู่ใต้หัวชิ้นแรกของกลุ่มเท่านั้น ไม่ซ้ำบนหัว "(ต่อ)"
    if (!continued && addingChildFor === node.id && childLevel) out.push(addChildRow(node, childLevel));

    if (isOpen) {
      for (const child of slice ? slice.items : children) pushRows(child, depth + 1, out);
      if (children.length === 0 && childLevel) {
        out.push(
          <tr key={`${node.id}-empty`} className="border-t border-slate-100">
            <td colSpan={COL_COUNT} className="px-3 py-2 text-sm text-slate-500" style={{ paddingLeft: 24 + depth * 18 }}>
              ยังไม่มี{LEVEL_LABEL[childLevel]}ในหมวดนี้ — กดปุ่ม “+ {LEVEL_LABEL[childLevel]}” ที่แถวด้านบน
            </td>
          </tr>,
        );
      }
    }
  }

  // แบ่งแท็บหมวดเป็นหน้าละ PAGE_SIZE รายการ — กลุ่มย่อยที่ข้ามหน้าถูกตัดเป็นชิ้น (หัวซ้ำ "(ต่อ)")
  // กลุ่มที่ยุบ/ว่างนับเป็น 0 รายการ แต่หัวยังอยู่ในหน้าที่มันเรียงถึง · ยุบกลุ่มใหญ่ = หน้าลดลง
  /** แบ่งหมวดหลักหนึ่งหมวดเป็นหน้า ตามสถานะยุบที่ให้มา (ใช้ตอน render และตอนคำนวณหน้าปลายทางล่วงหน้า) */
  function buildCategoryPages(topId: string, collapsedSet: Set<string>): PageSegment[][] {
    const pages: PageSegment[][] = [];
    let current: PageSegment[] = [];
    let count = 0;
    const nextPage = () => {
      pages.push(current);
      current = [];
      count = 0;
    };
    for (const sub of displayedSiblings(topId)) {
      const all = displayedSiblings(sub.id);
      const items = collapsedSet.has(sub.id) ? [] : all;
      if (items.length === 0) {
        if (count >= PAGE_SIZE) nextPage();
        current.push({ sub, items: [], from: 0, total: all.length, continued: false });
        continue;
      }
      for (let i = 0; i < items.length; ) {
        if (count >= PAGE_SIZE) nextPage();
        const take = Math.min(PAGE_SIZE - count, items.length - i);
        current.push({ sub, items: items.slice(i, i + take), from: i, total: items.length, continued: i > 0 });
        i += take;
        count += take;
      }
    }
    pages.push(current);
    return pages;
  }

  /** หน้าที่แถวนี้อยู่ (เริ่ม 1) · 0 = ไม่อยู่ในหมวดนี้ — หัวกลุ่มนับที่ชิ้นแรก ไม่ใช่หัว "(ต่อ)" */
  function pageOfRow(pages: PageSegment[][], id: string): number {
    return (
      pages.findIndex((segs) =>
        segs.some((sg) => (sg.sub.id === id && !sg.continued) || sg.items.some((it) => it.id === id)),
      ) + 1
    );
  }

  const categoryPages: PageSegment[][] = selected ? buildCategoryPages(selected.id, collapsed) : [];
  const pageCount = Math.max(1, categoryPages.length);
  const page = Math.min(Math.max(1, Number(searchParams.get("page")) || 1), pageCount);
  const pageSegments = categoryPages[page - 1] ?? [];
  const countItems = (segs: PageSegment[]) => segs.reduce((n, sg) => n + sg.items.length, 0);
  const itemsBeforePage = categoryPages.slice(0, page - 1).reduce((n, segs) => n + countItems(segs), 0);
  const itemsOnPage = countItems(pageSegments);
  const itemsTotal = categoryPages.reduce((n, segs) => n + countItems(segs), 0);

  function goPage(next: number, scroll = true) {
    setEditingId(null);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next <= 1) params.delete("page");
        else params.set("page", String(next));
        return params;
      },
      { replace: true },
    );
    if (scroll) {
      requestAnimationFrame(() => {
        const top = document.getElementById("category-tabs-anchor")?.getBoundingClientRect().top ?? 0;
        if (top < 0) window.scrollTo({ top: window.scrollY + top });
      });
    }
  }

  // ยุบ/กางทั้งหมด — เฉพาะกลุ่มย่อยของหมวดที่เปิดอยู่ที่มีรายการข้างใน (กลุ่มว่างไม่มีอะไรให้ยุบ)
  const foldableSubs = selected
    ? displayedSiblings(selected.id).filter((sub) => displayedSiblings(sub.id).length > 0)
    : [];
  const allSubsCollapsed = foldableSubs.length > 0 && foldableSubs.every((sub) => collapsed.has(sub.id));
  function toggleAllSubs() {
    const expanding = allSubsCollapsed;
    setCollapsed((current) => {
      const next = new Set(current);
      for (const sub of foldableSubs) {
        if (expanding) next.delete(sub.id);
        else next.add(sub.id);
      }
      return next;
    });
    // กางแล้วรายการในแต่ละหน้าเรียงใหม่หมด อยู่หน้าเดิมต่อจะไม่รู้ว่าดูตรงไหน · ยุบแล้วเหลือหน้าเดียวอยู่แล้ว
    // ฟอร์มแก้ไขที่เปิดค้างในกลุ่มที่ถูกยุบจะหายไปทั้งที่ยังไม่บันทึก จึงปิดให้ก่อน (goPage ปิดให้)
    goPage(1);
  }

  // แถวที่ถูกพามา (ผลค้นหา · เพิ่มใหม่ · เพิ่มวัสดุ) อยู่หน้าไหน → เปิดหน้านั้นแล้วเลื่อนไปหาแถว
  const highlightPage = highlightId ? pageOfRow(categoryPages, highlightId) : 0;
  useEffect(() => {
    if (!highlightId || highlightPage === 0) return;
    if (highlightPage !== page) goPage(highlightPage, false);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.querySelector(`[data-row-id="${highlightId}"]`)?.scrollIntoView({ block: "center" }),
      ),
    );
    // วิ่งเฉพาะตอนมีแถวถูกพามาใหม่ — ไม่ใช่ทุกครั้งที่ผู้ใช้เปลี่ยนหน้าเอง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, highlightPage]);

  return (
    <Layout>
      <PageHeader
        title="หมวดงาน"
        action={
          <Button onClick={() => startAdd("root")}>
            <Plus size={16} /> เพิ่มหมวดงานหลัก
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ค้นหาทุกหมวด ด้วยรหัส (B-02) หรือชื่องาน (คอนกรีต)"
          className="flex-1 min-w-48"
          inputClassName="py-2"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-500 select-none">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-brand"
          />
          แสดงที่ปิดใช้งาน{archivedCount > 0 ? ` (${archivedCount})` : ""}
        </label>
      </div>

      {addingChildFor === "root" && (
        <div className="mb-4 flex flex-col gap-2 border border-dashed border-slate-300 rounded-md px-3 py-2 bg-white">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              placeholder="รหัสหมวด (เว้นว่างให้ระบบตั้งให้)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm w-56"
            />
            <input
              placeholder="ชื่อหมวดงาน"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm flex-1"
            />
            <Button size="sm" onClick={() => submitAdd(null, "CATEGORY")}>
              <Plus size={14} /> เพิ่ม
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAddingChildFor(null)}>
              <X size={14} /> ยกเลิก
            </Button>
          </div>
          <input
            placeholder="คำอธิบาย (ไม่บังคับ)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="border border-slate-300 rounded-md px-2 py-1 text-sm"
          />
        </div>
      )}

      {loading && <TableSkeleton rows={10} cols={4} />}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && topCategories.length === 0 && (
        <p className="text-slate-500">ยังไม่มีหมวดงาน — เริ่มเพิ่มหมวดงานหลักด้านบน</p>
      )}

      {!loading && !error && topCategories.length > 0 && (
        <>
          {/* หมุดตำแหน่งจริงของแถบ (ตัวแถบติดจอ วัดจากมันไม่ได้) — ใช้เลื่อนกลับขึ้นมาตอนเปลี่ยนหมวด */}
          <div id="category-tabs-anchor" aria-hidden />
          {/* แถบหมวดงานหลัก — แทนช่องเลือก "ทุกหมวดงาน" เดิม ติดขอบบนจอ เปลี่ยนหมวดได้ตลอด */}
          <ScrollableTabBar
            id="category-tabs"
            ariaLabel="หมวดงานหลัก"
            selectedKey={search.trim() === "" ? selected?.id ?? null : null}
            className="sticky top-0 z-20 h-11"
            end={
              // ยุบ/กางทุกกลุ่มย่อยของหมวดที่เปิด — ปลายขวาของแถบที่ติดจอ กดได้ตลอดไม่ต้องเลื่อนกลับขึ้นไป
              // ปุ่มขอบบางแบบเดียวกับปุ่มอื่นในหน้า (ghost sm) — ผู้ใช้เลือกให้มีกรอบ แยกจากแท็บชัดเจน
              selected && search.trim() === "" && foldableSubs.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllSubs}
                  aria-label={allSubsCollapsed ? "กางกลุ่มงานย่อยทั้งหมด" : "ยุบกลุ่มงานย่อยทั้งหมด"}
                  className="shrink-0 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand"
                >
                  {allSubsCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
                  {allSubsCollapsed ? "กางทั้งหมด" : "ยุบทั้งหมด"}
                </Button>
              ) : null
            }
          >
            {[null, ...tabCategories].map((c) => {
              const isSelected = search.trim() === "" && (c ? selected === c : !selected);
              const items = c ? summaryByCategory.get(c.id)?.items ?? 0 : 0;
              return (
                <button
                  key={c?.id ?? "__overview__"}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  title={c ? c.name : "รายชื่อหมวดงานหลักทั้งหมด"}
                  onClick={() => openTab(c?.id ?? null, true)}
                  className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors ${
                    isSelected
                      ? "border-brand font-medium text-brand"
                      : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  } ${c && !c.active ? "opacity-60" : ""}`}
                >
                  {c ? (
                    <>
                      {c.code && (
                        <span className={`font-mono text-xs ${isSelected ? "text-brand" : "text-slate-400"}`}>
                          {c.code}
                        </span>
                      )}
                      {shortCategoryName(c.name)}
                      <span
                        className={`rounded-full px-1.5 text-xs tabular-nums ${
                          isSelected ? "bg-brand/10 text-brand" : "bg-slate-200/70 text-slate-500"
                        }`}
                      >
                        {items}
                      </span>
                    </>
                  ) : (
                    "ภาพรวม"
                  )}
                </button>
              );
            })}
          </ScrollableTabBar>

          {search.trim() !== "" ? (
            <div className="mt-4">
              <p className="text-sm text-slate-700 mb-2">พบ {searchResults.length} รายการ</p>
              {searchResults.length === 0 && <p className="text-slate-500">ไม่พบรายการที่ตรงกับคำค้น</p>}
              {searchResults.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => jumpToResult(node)}
                  className={`w-full text-left flex items-center gap-3 border border-slate-200 bg-white rounded-lg px-3 py-2 mt-2 hover:bg-slate-50 ${
                    node.active ? "" : "opacity-60"
                  }`}
                >
                  <span className="text-xs text-slate-500 w-24 shrink-0">{LEVEL_LABEL[node.level]}</span>
                  <span className="flex-1">
                    <span className="text-sm text-slate-800">
                      {node.code ? `${node.code} — ` : ""}
                      {node.name}
                      {!node.active && (
                        <span className="ml-2 text-xs font-medium text-slate-500 bg-slate-200 rounded-full px-2 py-0.5">
                          ปิดใช้งาน
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-slate-500">{pathOf(node.id)}</span>
                  </span>
                  <span className="text-sm text-slate-700">ไปที่หมวด →</span>
                </button>
              ))}
            </div>
          ) : !selected ? (
            // ภาพรวม — รายชื่อหมวดหลัก ไม่มีปุ่มจัดการประจำแถว (ย้ายไปอยู่บนหัวของแต่ละแท็บ) กดแถวเพื่อเปิด
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-200 text-left text-xs text-slate-600">
                  <tr>
                    <th className="w-20 px-3 py-2 font-medium">รหัส</th>
                    <th className="px-3 py-2 font-medium">หมวดงาน</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">กลุ่มงานย่อย</th>
                    <th className="px-3 py-2 text-right font-medium">รายการ</th>
                    <th className="px-3 py-2 text-right font-medium">ราคา</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tabCategories.map((c) => {
                    const sum = summaryByCategory.get(c.id);
                    return (
                      <tr
                        key={c.id}
                        onClick={() => openTab(c.id)}
                        className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                          c.active ? "" : "opacity-60"
                        }`}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{c.code ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTab(c.id);
                            }}
                            className="text-left font-medium text-slate-800 hover:text-brand"
                          >
                            {c.name}
                          </button>
                          {!c.active && (
                            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                              ปิดใช้งาน
                            </span>
                          )}
                          {c.description && <span className="block text-xs text-slate-500">{c.description}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">
                          {displayedSiblings(c.id).length}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{sum?.items ?? 0}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{priceSummary(c)}</td>
                        <td className="px-3 py-2.5 text-slate-400">
                          <ChevronRight size={16} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              {/* กับดัก sticky: overflow-x-auto ทำให้ overflow-y เป็น auto ตาม → กลายเป็น scroll
                  container → หัวตารางไม่ติดจอ จึงปล่อยเป็น visible เมื่อจอกว้างพอให้ตารางลงตัว
                  (พื้นที่เนื้อหาเต็มที่ 1,104px ≥ ตาราง 1,040px ตั้งแต่จอ ~1,330px) */}
              {pageCount > 1 && (
                <p className="mt-4 text-xs text-slate-500 tabular-nums">
                  แสดง {itemsOnPage > 0 ? `${itemsBeforePage + 1}-${itemsBeforePage + itemsOnPage}` : "—"} จาก {itemsTotal} รายการ
                </p>
              )}
              <div className={`${pageCount > 1 ? "mt-2" : "mt-4"} overflow-x-auto min-[1330px]:overflow-x-visible rounded-lg border border-slate-200 bg-white`}>
                <table className="w-full min-w-[1040px] table-fixed text-sm">
                  {/* ความกว้างตายตัว: ไม่งั้นเวลายุบ/กางหมวด ตารางจะคำนวณความกว้างใหม่จากเนื้อหา
                      ที่เห็นอยู่ แล้วคอลัมน์ขยับทั้งแถบ (วัดได้ถึง 194px) */}
                  <colgroup>
                    <col className="w-24" />
                    <col />
                    <col className="w-20" />
                    <col className="w-[104px]" />
                    <col className="w-[104px]" />
                    <col className="w-[104px]" />
                    <col className="w-20" />
                    <col className="w-[232px]" />
                  </colgroup>
                  {/* top-11 = ใต้แถบหมวดที่ล็อกสูง h-11 · เส้นคั่นเป็นเงา inset ไม่ใช่ border —
                      border ของเซลล์ไม่ติดจอไปกับหัวตาราง เหลือช่อง 1px ให้ปุ่มในแถวโผล่ */}
                  <thead className="sticky top-11 z-10 text-left text-xs text-slate-600">
                    {/* ชื่อหมวดเป็นแถวแรกของหัวตาราง + ปุ่มจัดการหมวดหลักรวมอยู่ที่นี่ที่เดียว */}
                    <tr>
                      <th
                        colSpan={COL_COUNT}
                        scope="colgroup"
                        className={`bg-[#ececf7] px-3 py-2 font-normal shadow-[inset_0_-1px_0_0_rgb(203,213,225)] ${
                          highlightId === selected.id ? "ring-2 ring-emerald-300 ring-inset" : ""
                        }`}
                      >
                        <div id="category-title" className="flex flex-wrap items-center gap-x-3 gap-y-2">
                          {selected.code && (
                            <span className="font-mono text-sm font-semibold text-brand">{selected.code}</span>
                          )}
                          <span className="text-sm font-semibold text-slate-900">{selected.name}</span>
                          <span className="text-xs text-slate-500">
                            {displayedSiblings(selected.id).length} กลุ่มงานย่อย ·{" "}
                            {summaryByCategory.get(selected.id)?.items ?? 0} รายการ
                          </span>
                          {!selected.active && (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                              ปิดใช้งาน
                            </span>
                          )}
                          <span className="whitespace-nowrap">{priceSummary(selected)}</span>
                          <div className="ml-auto">{actionButtons(selected)}</div>
                        </div>
                        {selected.description && (
                          <span className="mt-0.5 block text-xs text-slate-500">{selected.description}</span>
                        )}
                      </th>
                    </tr>
                    <tr className="[&_th]:bg-slate-200 [&_th]:shadow-[inset_0_-1px_0_0_rgb(203,213,225)]">
                      <th className="px-3 py-2 font-medium whitespace-nowrap">รหัส</th>
                      <th className="px-3 py-2 font-medium">ชื่อรายการ</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">หน่วย</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">ค่าวัสดุ/หน่วย</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">ค่าแรง/หน่วย</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">รวม/หน่วย</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">เผื่อเสีย</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const rows: ReactElement[] = [];
                      if (editingId === selected.id) rows.push(editRow(selected));
                      if (addingChildFor === selected.id) rows.push(addChildRow(selected, "SUBGROUP"));
                      for (const seg of pageSegments) pushRows(seg.sub, 0, rows, seg);
                      if (displayedSiblings(selected.id).length === 0) {
                        rows.push(
                          <tr key="empty" className="border-t border-slate-100">
                            <td colSpan={COL_COUNT} className="px-3 py-6 text-center text-sm text-slate-500">
                              ยังไม่มีกลุ่มงานย่อยในหมวดนี้ — กดปุ่ม “+ กลุ่มงานย่อย” ที่แถวชื่อหมวดด้านบน
                            </td>
                          </tr>,
                        );
                      }
                      return rows;
                    })()}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageCount={pageCount} onChange={(n) => goPage(n)} />
              {/* จบหมวดแล้วไปต่อได้เลย ไม่ต้องเลื่อนกลับขึ้นไปที่แถบ */}
              <nav aria-label="เปลี่ยนหมวด" className="mt-3 flex items-center justify-between gap-3 text-sm">
                {(() => {
                  const prev = selectedIndex > 0 ? tabCategories[selectedIndex - 1] : null;
                  const next = selectedIndex >= 0 ? tabCategories[selectedIndex + 1] ?? null : null;
                  const navBtn =
                    "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900";
                  return (
                    <>
                      <button type="button" onClick={() => openTab(prev?.id ?? null, true)} className={navBtn}>
                        <ChevronLeft size={16} />
                        {prev ? (
                          <>
                            {prev.code && <span className="font-mono text-xs text-slate-400">{prev.code}</span>}
                            {shortCategoryName(prev.name)}
                          </>
                        ) : (
                          "ภาพรวม"
                        )}
                      </button>
                      {next && (
                        <button type="button" onClick={() => openTab(next.id, true)} className={navBtn}>
                          {next.code && <span className="font-mono text-xs text-slate-400">{next.code}</span>}
                          {shortCategoryName(next.name)}
                          <ChevronRight size={16} />
                        </button>
                      )}
                    </>
                  );
                })()}
              </nav>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
