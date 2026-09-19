import { Check, Layers, Pencil, Plus, Power, PowerOff, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { MaterialDto, WorkCategoryDto } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { UnitSelect } from "../components/UnitSelect";
import { UNIT_OPTIONS } from "../lib/units";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SearchableSelect } from "../components/SearchableSelect";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import { listCategories } from "../lib/categories-api";
import { buildCategoryPath, categoryParts } from "../lib/category-path";
import { useConfirm } from "../lib/confirm-context";
import { rowKey, sameRowKey } from "../lib/row-keys";
import { useToast } from "../lib/toast-context";
import { createMaterial, deleteMaterial, listMaterials, updateMaterial } from "../lib/materials-api";

// จานสีของ badge หมวดใหญ่ เขียนคลาสเต็ม ๆ เพราะ JIT ของ Tailwind อ่านได้เฉพาะ literal
// (อย่าประกอบสตริงสีจากตัวแปร) แต่ละหมวดใหญ่ (A, B, C, ...) จะได้สีต่างกันแบบคงที่
// จุดสีประจำหมวดใหญ่ — ใช้กวาดตาหาหมวดเดิมเร็ว ๆ แต่ "ไม่ใช่" ตัวบอกความหมายเพียงอย่างเดียว
// (ชื่อหมวดใหญ่ยังพิมพ์เป็นตัวหนังสือกำกับอยู่เสมอ คนตาบอดสีจึงไม่เสียข้อมูล)
// หมวดใหญ่จริงมี 6 หมวด (A-F) จานสีมี 8 จึงไม่มีสีชนกัน
const CATEGORY_DOT_PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];


// ป้ายหมวดใหญ่ตัดคำนำหน้า "หมวดงาน" ที่ซ้ำกันทุกใบออก (หมวดงานโครงสร้าง -> โครงสร้าง) เหลือเฉพาะส่วน
// ที่ต่างกันจริง ป้ายจึงสั้นพอให้หมวดย่อยมาอยู่บรรทัดเดียวกันได้ ชื่อเต็มยังดูได้จาก tooltip ของช่อง
function shortCategoryName(name: string): string {
  const short = name.replace(/^หมวดงาน\s*/, "").trim();
  return short || name;
}

// เลือกสีจากรหัสหมวดใหญ่ (A -> สีแรก, B -> สีถัดไป, ...) เพื่อให้หมวดเดิมได้สีเดิมเสมอ
function categoryDotClass(code: string | null): string {
  if (!code) return "bg-slate-300";
  const idx = ((code.codePointAt(0) ?? 65) - 65) % CATEGORY_DOT_PALETTE.length;
  return CATEGORY_DOT_PALETTE[(idx + CATEGORY_DOT_PALETTE.length) % CATEGORY_DOT_PALETTE.length];
}

// ช่องหมวดงานในตาราง: หมวดย่อยเป็นตัวหลัก + หมวดใหญ่เป็นตัวรอง + จุดสีนำไว้กวาดตา
// ตัดงานย่อยล่างสุด (ITEM) ที่ซ้ำกับคอลัมน์ "ชื่อรายการ" ออก และมี title ให้ hover ดู path เต็มได้
//
// ทำไมหมวดย่อยต้องมาก่อน: ของเดิมให้หมวดใหญ่เป็นป้ายสีเด่น ส่วนหมวดย่อยเป็นตัวเล็กสีจาง
// ซึ่งกลับหัวกลับหาง — วัดจากหน้าจริงแล้วในหนึ่งหน้า (15 แถว) หมวดใหญ่ต่างกันแค่ 2 ค่าและซ้ำ
// ติดกันยาวสุด 11 แถว ส่วนหมวดย่อยต่างกัน 5 ค่า และเมื่อผู้ใช้กรองหมวดงาน (การใช้งานปกติ)
// หมวดใหญ่จะซ้ำกันทั้ง 15/15 แถว = ป้ายสีเด่น ๆ ที่ไม่ได้บอกอะไรใหม่เลยสักแถว
function CategoryCell({
  categoryId,
  byId,
}: Readonly<{
  categoryId: string | null;
  byId: Map<string, WorkCategoryDto>;
}>) {
  if (!categoryId) return <span className="text-slate-400">—</span>;
  const parts = categoryParts(categoryId, byId);
  const sub = parts.sub && parts.sub.id !== parts.top?.id ? parts.sub : null;
  const topName = parts.top ? shortCategoryName(parts.top.name) : null;
  // สองบรรทัดเสมอ ไม่ใช่บรรทัดเดียว — วัดความกว้างข้อความจริงแล้วบรรทัดเดียวเป็นไปไม่ได้:
  // หมวดย่อยยาวสุด 175px + หมวดใหญ่ยาวสุด 166px + จุด/ช่องไฟ = 365px แต่คอลัมน์กว้าง ~207px
  // เคยลองวางบรรทัดเดียวแบบ flex-wrap แล้ว ข้อความตกบรรทัดเองไม่เท่ากัน (2 บรรทัดบ้าง 3 บ้าง)
  // ทำให้ความสูงแถวกระโดด 55px/75px — วางเป็นสองบรรทัดตายตัวจึงคุมได้แน่นอนกว่า
  // pl-4 = ความกว้างจุด (8px) + ช่องไฟ (8px) เพื่อให้บรรทัดล่างตรงแนวตัวหนังสือบรรทัดบน
  return (
    <div className="leading-snug" title={buildCategoryPath(categoryId, byId)}>
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${categoryDotClass(parts.top?.code ?? null)}`}
          aria-hidden
        />
        {/* ถ้าไม่มีหมวดย่อย ให้หมวดใหญ่ขึ้นมาเป็นตัวหลักแทน ช่องจะได้ไม่ว่างเปล่า */}
        {/* whitespace-nowrap ทั้งสองบรรทัด (ของเดิมก็ล็อกไว้) — ถ้าปล่อยให้ตัดบรรทัดได้
            table-layout อัตโนมัติจะบีบคอลัมน์นี้ให้แคบลงแล้วยกความกว้างไปให้คอลัมน์อื่น
            ผลคือชื่อหมวดย่อยตกบรรทัดเอง ช่องกลายเป็น 3 บรรทัด ความสูงแถวกระโดด 52px/72px */}
        <span className="whitespace-nowrap text-slate-700">{sub ? sub.name : topName}</span>
      </div>
      {sub && topName && (
        <div className="whitespace-nowrap pl-4 text-xs text-slate-500">{topName}</div>
      )}
    </div>
  );
}

function money(value: string | number): string {
  return Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// หนึ่งแถวของสูตรวัสดุย่อย (เก็บเป็น string ระหว่างแก้ในฟอร์ม เหมือนช่องอื่น)
interface ComponentRow {
  componentMaterialId: string;
  name: string;
  unit: string;
  qtyPerUnit: string;
  wasteFactorPct: string;
  unitPrice: string;
}

interface MaterialFormState {
  categoryId: string;
  name: string;
  spec: string;
  unit: string;
  supplier: string;
  materialUnitPrice: string;
  laborUnitPrice: string;
  wasteFactorPct: string;
  // สูตรวัสดุย่อย (ว่าง = วัสดุก้อนเดียว); ถ้ามี ราคาวัสดุ/หน่วยจะคิดจากผลรวมของสูตร
  components: ComponentRow[];
}

const EMPTY_FORM: MaterialFormState = {
  categoryId: "",
  name: "",
  spec: "",
  unit: "",
  supplier: "",
  materialUnitPrice: "",
  laborUnitPrice: "0",
  wasteFactorPct: "",
  components: [],
};

const EMPTY_COMPONENT: ComponentRow = {
  componentMaterialId: "",
  name: "",
  unit: "",
  qtyPerUnit: "",
  wasteFactorPct: "",
  unitPrice: "",
};

// ราคาวัสดุต่อหน่วยจากสูตร = Σ (ปริมาณต่อหน่วย × (1+เผื่อเสีย%) × ราคาต่อหน่วย) — ตรงกับ deriveMaterialUnitPrice ฝั่ง server
function deriveUnitPriceFromRows(rows: ComponentRow[]): number {
  const sum = rows.reduce((acc, r) => {
    const qty = Number(r.qtyPerUnit);
    const price = Number(r.unitPrice);
    // ช่องที่ยังไม่ใช่ตัวเลข (NaN) ข้ามเหมือนค่าติดลบ/ศูนย์
    if (Number.isNaN(qty) || qty <= 0 || Number.isNaN(price) || price < 0) return acc;
    const waste = r.wasteFactorPct.trim() === "" ? 0 : Number(r.wasteFactorPct);
    return acc + qty * (1 + waste / 100) * price;
  }, 0);
  return Math.round((sum + Number.EPSILON) * 100) / 100;
}

// แถวสูตรที่กรอกครบพอส่งได้ (มีชื่อ/หน่วย/ปริมาณ>0)
function validComponentRows(rows: ComponentRow[]): ComponentRow[] {
  return rows.filter((r) => r.name.trim() && r.unit.trim() && Number(r.qtyPerUnit) > 0);
}

const PAGE_SIZE = 15;

export function MaterialsPage() {
  const confirm = useConfirm();
  const toast = useToast();
  const [materials, setMaterials] = useState<MaterialDto[]>([]);
  const [categories, setCategories] = useState<WorkCategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterTopId, setFilterTopId] = useState("");
  // ลิงก์จากหน้าหมวดงาน (?q=รหัสวัสดุ) มาเปิดหน้านี้พร้อมคำค้น เพื่อกดไปแก้ราคาได้ทันที
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  // แสดงรายการที่ปิดใช้งานด้วยหรือไม่ (ค่าเริ่มต้น: ซ่อน — เหมือนถังเก็บของที่เลิกใช้)
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [jumpToLastPage, setJumpToLastPage] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<MaterialFormState>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MaterialFormState>(EMPTY_FORM);

  const patchForm = (patch: Partial<MaterialFormState>) => setForm((f) => ({ ...f, ...patch }));
  const patchEdit = (patch: Partial<MaterialFormState>) => setEditForm((f) => ({ ...f, ...patch }));

  /** หน่วยที่ถูกใช้จริงในแคตตาล็อกแล้ว — เอาไว้เลือกซ้ำได้แม้ไม่อยู่ในลิสต์มาตรฐาน */
  const unitsInUse = useMemo(
    () => [...new Set(materials.map((m) => m.unit).filter(Boolean))],
    [materials],
  );

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const itemCategories = useMemo(() => categories.filter((c) => c.level === "ITEM"), [categories]);
  // ตัวเลือกวัสดุดิบสำหรับสูตร (ทุกวัสดุที่ยังใช้งาน) — เลือกแล้วเติมชื่อ/หน่วย/ราคาให้อัตโนมัติ
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const componentMaterialOptions = useMemo(
    () =>
      materials
        .filter((m) => m.active)
        .map((m) => ({
          value: m.id,
          label: [m.code, m.name, m.unit && `(${m.unit})`].filter(Boolean).join(" "),
          keywords: `${m.spec ?? ""} ${m.supplier ?? ""}`,
        })),
    [materials],
  );
  const inactiveCount = useMemo(() => materials.filter((m) => !m.active).length, [materials]);

  // หมวด (และบรรพบุรุษ) ยังใช้งานอยู่ไหม — หมวดที่เก็บเข้ากรุจะไม่ให้เลือกผูกวัสดุใหม่
  const isChainActive = useMemo(() => {
    return (id: string | null | undefined): boolean => {
      let cur = id ? categoryById.get(id) : undefined;
      while (cur) {
        if (!cur.active) return false;
        if (!cur.parentId) break;
        cur = categoryById.get(cur.parentId);
      }
      return true;
    };
  }, [categoryById]);
  const activeItemCategories = useMemo(
    () => itemCategories.filter((c) => isChainActive(c.id)),
    [itemCategories, isChainActive],
  );
  // กรองด้วยหมวดใหญ่ระดับบนสุดเท่านั้น — รายการ leaf ทั้งหมดจะอ่านไม่ไหวเมื่อแคตตาล็อกโตขึ้น
  // การจำกัดให้แคบลงกว่านี้ทำผ่านช่องค้นหา
  const topCategories = useMemo(
    () =>
      categories
        .filter((c) => c.level === "CATEGORY")
        .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? "", "en", { numeric: true })),
    [categories],
  );

  // ไล่หมวดขึ้นไปจนถึงหมวดใหญ่ราก เพื่อให้วัสดุ (ที่ผูกกับ ITEM ปลายกิ่ง) จับคู่กับหมวดบนสุด
  // ที่เลือกไว้ได้
  const rootIdOf = useMemo(() => {
    return (categoryId: string | null | undefined): string | null => {
      let cur = categoryId ? categoryById.get(categoryId) : undefined;
      while (cur?.parentId) {
        const parent = categoryById.get(cur.parentId);
        if (!parent) break;
        cur = parent;
      }
      return cur?.id ?? null;
    };
  }, [categoryById]);

  // พนักงานค้นหาแถวได้ทั้งจากรหัสแคตตาล็อก (MAT-0042), ชื่อ หรือสเปก
  const visibleMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (!showInactive && !m.active) return false;
      if (filterTopId && rootIdOf(m.categoryId) !== filterTopId) return false;
      if (
        q &&
        !(
          m.name.toLowerCase().includes(q) ||
          (m.code ?? "").toLowerCase().includes(q) ||
          (m.spec ?? "").toLowerCase().includes(q)
        )
      )
        return false;
      return true;
    });
  }, [materials, search, filterTopId, showInactive, rootIdOf]);

  // จำนวนหน้าวิ่งตามข้อมูล การเพิ่มแถวจึงทำให้มากขึ้นและการลบแถวทำให้น้อยลง โดยไม่มีอะไรอื่น
  // ต้องคอยซิงก์
  const pageCount = Math.max(1, Math.ceil(visibleMaterials.length / PAGE_SIZE));
  // กันช่วงหลังการลบหรือการค้นหาที่แคบลง: หน้า 7 จาก 9 ต้องไม่ render ตารางเปล่าต่อไป
  // เมื่อเหลือเพียง 3 หน้า
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageMaterials = visibleMaterials.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  // A new search / filter is a new result set — always start reading it from the top.
  useEffect(() => {
    setPage(1);
  }, [search, filterTopId, showInactive]);

  useEffect(() => {
    if (!jumpToLastPage) return;
    setPage(pageCount);
    setJumpToLastPage(false);
  }, [jumpToLastPage, pageCount]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [materialsRes, categoriesRes] = await Promise.all([listMaterials(), listCategories()]);
      setMaterials(materialsRes.materials);
      setCategories(categoriesRes.categories);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCreate() {
    const rows = validComponentRows(form.components);
    const hasRecipe = rows.length > 0;
    // มีสูตร → ราคาวัสดุคิดจากผลรวม (ไม่ต้องกรอกช่องราคาเอง); ไม่มีสูตร → ต้องกรอกราคา
    if (!form.name.trim() || !form.unit.trim() || (!hasRecipe && form.materialUnitPrice === "")) return;
    try {
      await createMaterial({
        categoryId: form.categoryId || null,
        name: form.name.trim(),
        spec: form.spec.trim() || null,
        unit: form.unit.trim(),
        supplier: form.supplier.trim() || null,
        materialUnitPrice: hasRecipe ? deriveUnitPriceFromRows(rows) : Number(form.materialUnitPrice),
        laborUnitPrice: Number(form.laborUnitPrice || 0),
        wasteFactorPct: form.wasteFactorPct.trim() === "" ? null : Number(form.wasteFactorPct),
        components: rows.map((r, i) => ({
          componentMaterialId: r.componentMaterialId || null,
          name: r.name.trim(),
          unit: r.unit.trim(),
          qtyPerUnit: Number(r.qtyPerUnit),
          wasteFactorPct: r.wasteFactorPct.trim() === "" ? null : Number(r.wasteFactorPct),
          unitPrice: Number(r.unitPrice || 0),
          sortOrder: i,
        })),
      });
      setForm(EMPTY_FORM);
      setShowAddForm(false);
      await refresh();
      // แถวใหม่จะได้รหัส MAT- สูงสุด จึงไปอยู่หน้าสุดท้าย — ตามไปที่นั่นแทนที่จะปล่อยให้ผู้ใช้
      // จ้องหน้าเดิมที่อยู่
      setJumpToLastPage(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มรายการไม่สำเร็จ");
    }
  }

  function startEdit(material: MaterialDto) {
    setEditingId(material.id);
    setEditForm({
      categoryId: material.categoryId ?? "",
      name: material.name,
      spec: material.spec ?? "",
      unit: material.unit,
      supplier: material.supplier ?? "",
      materialUnitPrice: material.materialUnitPrice,
      laborUnitPrice: material.laborUnitPrice,
      wasteFactorPct: material.wasteFactorPct ?? "",
      components: material.components.map((c) => ({
        componentMaterialId: c.componentMaterialId ?? "",
        name: c.name,
        unit: c.unit,
        qtyPerUnit: c.qtyPerUnit,
        wasteFactorPct: c.wasteFactorPct ?? "",
        unitPrice: c.unitPrice,
      })),
    });
  }

  async function submitEdit(id: string) {
    if (!editForm.name.trim() || !editForm.unit.trim()) return;
    const rows = validComponentRows(editForm.components);
    const hasRecipe = rows.length > 0;
    try {
      await updateMaterial(id, {
        categoryId: editForm.categoryId || null,
        name: editForm.name.trim(),
        spec: editForm.spec.trim() || null,
        unit: editForm.unit.trim(),
        supplier: editForm.supplier.trim() || null,
        materialUnitPrice: hasRecipe ? deriveUnitPriceFromRows(rows) : Number(editForm.materialUnitPrice),
        laborUnitPrice: Number(editForm.laborUnitPrice),
        wasteFactorPct: editForm.wasteFactorPct.trim() === "" ? null : Number(editForm.wasteFactorPct),
        // ส่งสูตรปัจจุบันทั้งชุดเสมอ (round-trip): [] = ล้างสูตรกลับเป็นวัสดุก้อนเดียว
        components: rows.map((r, i) => ({
          componentMaterialId: r.componentMaterialId || null,
          name: r.name.trim(),
          unit: r.unit.trim(),
          qtyPerUnit: Number(r.qtyPerUnit),
          wasteFactorPct: r.wasteFactorPct.trim() === "" ? null : Number(r.wasteFactorPct),
          unitPrice: Number(r.unitPrice || 0),
          sortOrder: i,
        })),
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "แก้ไขไม่สำเร็จ");
    }
  }

  async function toggleActive(m: MaterialDto) {
    try {
      await updateMaterial(m.id, { active: !m.active });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm("ย้ายรายการนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", { confirmLabel: "ย้ายไปถังขยะ" })))
      return;
    try {
      await deleteMaterial(id);
      toast.success("ย้ายไปถังขยะแล้ว — กู้คืนได้ที่เมนูถังขยะ");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  // ช่องกรอกชุดเดียว ใช้ทั้งฟอร์มเพิ่มและฟอร์มแก้ไข (เป็นฟังก์ชันคืน JSX ไม่ใช่ component ย่อย
  // เพื่อไม่ให้ช่องกรอกโดน remount แล้วเสีย focus ระหว่างพิมพ์)
  function formFields(state: MaterialFormState, set: (patch: Partial<MaterialFormState>) => void) {
    // ตัวเลือกหมวด = หมวดที่ใช้งานอยู่ + หมวดที่เลือกอยู่ปัจจุบัน (เผื่อกำลังแก้วัสดุที่หมวดถูก
    // เก็บเข้ากรุไปแล้ว จะได้ยังเห็นค่าเดิม)
    const catOptions = [...activeItemCategories];
    if (state.categoryId && !catOptions.some((c) => c.id === state.categoryId)) {
      const cur = categoryById.get(state.categoryId);
      if (cur) catOptions.push(cur);
    }
    // แปลงเป็นตัวเลือกแบบค้นหาได้ 2 บรรทัด: บรรทัดบน = รหัส + ชื่องานย่อย, บรรทัดล่าง = path หมวดแม่
    // (keywords รวม path เต็ม จึงพิมพ์ค้นได้ทั้งชื่อหมวดใหญ่/ย่อย/รหัส)
    const catSelectOptions = catOptions.map((c) => ({
      value: c.id,
      label: `${c.code ? c.code + " · " : ""}${c.name}${c.active ? "" : " (ปิดใช้งาน)"}`,
      sublabel: c.parentId ? buildCategoryPath(c.parentId, categoryById) : undefined,
      keywords: `${c.code ?? ""} ${buildCategoryPath(c.id, categoryById)}`,
    }));

    // สูตรวัสดุย่อย: ถ้ามีสูตรที่ใช้ได้ ราคาวัสดุ/หน่วยคิดจากผลรวม (ช่องราคาเป็น read-only)
    const validRows = validComponentRows(state.components);
    const hasRecipe = validRows.length > 0;
    const derived = deriveUnitPriceFromRows(validRows);
    const setRows = (rows: ComponentRow[]) => set({ components: rows });
    const patchRow = (idx: number, patch: Partial<ComponentRow>) =>
      setRows(state.components.map((r, i) => (i === idx ? sameRowKey(r, { ...r, ...patch }) : r)));
    // เลือกวัสดุดิบจากแคตตาล็อก → เติมชื่อ/หน่วย/ราคาต่อหน่วยให้อัตโนมัติ (ยังแก้ทับได้)
    const pickRowMaterial = (idx: number, materialId: string) => {
      const m = materialId ? materialById.get(materialId) : undefined;
      patchRow(idx, {
        componentMaterialId: materialId,
        ...(m ? { name: m.name, unit: m.unit, unitPrice: m.materialUnitPrice } : {}),
      });
    };

    return (
      <>
        <label className="flex flex-col gap-1 text-xs text-slate-700 col-span-2">
          <span>ชื่อรายการ</span>
          <input
            value={state.name}
            onChange={(e) => set({ name: e.target.value })}
            className="mt-auto border border-slate-300 rounded-md px-2 py-1 text-sm"
          />
        </label>
        <div className="flex flex-col gap-1 text-xs text-slate-700 col-span-2 sm:col-span-1 lg:col-span-2">
          <span>หมวดงาน (ระดับรายการ)</span>
          <SearchableSelect
            options={catSelectOptions}
            value={state.categoryId}
            onChange={(v) => set({ categoryId: v })}
            placeholder="ไม่ระบุ — พิมพ์เพื่อค้นหาหมวดงาน"
            clearable
            className="mt-auto"
          />
        </div>
        <label className="flex flex-col gap-1 text-xs text-slate-700 col-span-2 sm:col-span-1 lg:col-span-2">
          <span>สเปก / รายละเอียด <span className="text-slate-400">(ไม่บังคับ)</span></span>
          <input
            value={state.spec}
            onChange={(e) => set({ spec: e.target.value })}
            placeholder="เช่น มอก. / ยี่ห้อ / ขนาด"
            className="mt-auto border border-slate-300 rounded-md px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-700">
          <span>หน่วยนับ</span>
          <UnitSelect
            value={state.unit}
            onChange={(unit) => set({ unit })}
            options={UNIT_OPTIONS}
            inUse={unitsInUse}
            className="mt-auto"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-700">
          <span>ผู้จำหน่าย <span className="text-slate-400">(ไม่บังคับ)</span></span>
          <input
            value={state.supplier}
            onChange={(e) => set({ supplier: e.target.value })}
            className="mt-auto border border-slate-300 rounded-md px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-700 lg:col-span-2">
          <span>ราคาวัสดุ/หน่วย</span>
          {hasRecipe ? (
            <input
              type="text"
              readOnly
              value={money(derived)}
              title="คิดจากผลรวมของสูตรวัสดุย่อยด้านล่าง"
              className="mt-auto border border-slate-200 bg-slate-100 text-slate-500 rounded-md px-2 py-1 text-sm"
            />
          ) : (
            <input
              type="number"
              min="0"
              value={state.materialUnitPrice}
              onChange={(e) => set({ materialUnitPrice: e.target.value })}
              className="mt-auto border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-700">
          <span>ค่าแรง/หน่วย</span>
          <input
            type="number"
            min="0"
            value={state.laborUnitPrice}
            onChange={(e) => set({ laborUnitPrice: e.target.value })}
            className="mt-auto border border-slate-300 rounded-md px-2 py-1 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-700">
          <span>เผื่อเสีย (%) <span className="text-slate-400">(ไม่บังคับ)</span></span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={state.wasteFactorPct}
            onChange={(e) => set({ wasteFactorPct: e.target.value })}
            placeholder="เช่น 5"
            className="mt-auto border border-slate-300 rounded-md px-2 py-1 text-sm"
          />
        </label>

        {/* สูตรวัสดุย่อย (bill of materials) — ถอดวัสดุดิบของงานนี้ ต่อ 1 หน่วย */}
        <div className="col-span-2 sm:col-span-3 lg:col-span-4 border-t border-slate-200 pt-3 mt-1">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <Layers size={14} className="text-brand" />
              สูตรวัสดุย่อย (ถอดปริมาณวัสดุ)
              <span className="text-slate-400 font-normal">
                — ต่อ 1 {state.unit || "หน่วย"} ของรายการนี้ (ไม่บังคับ)
              </span>
            </div>
            {hasRecipe && (
              <span className="text-xs text-slate-500">
                ราคาวัสดุ/หน่วย = <span className="font-semibold text-brand">{money(derived)}</span>
              </span>
            )}
          </div>

          {state.components.length > 0 && (
            <div className="space-y-2">
              {state.components.map((row, idx) => {
                const rowQty = Number(row.qtyPerUnit);
                const rowPrice = Number(row.unitPrice);
                const rowWaste = row.wasteFactorPct.trim() === "" ? 0 : Number(row.wasteFactorPct);
                const rowCost =
                  rowQty > 0 && rowPrice >= 0 ? rowQty * (1 + rowWaste / 100) * rowPrice : 0;
                return (
                  <div
                    key={rowKey(row)}
                    className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end bg-slate-50 rounded-lg p-2"
                  >
                    <div className="col-span-2 sm:col-span-4">
                      <span className="block text-xs text-slate-500 mb-0.5">วัสดุดิบ</span>
                      <SearchableSelect
                        options={componentMaterialOptions}
                        value={row.componentMaterialId}
                        onChange={(v) => pickRowMaterial(idx, v)}
                        placeholder="เลือกจากแคตตาล็อก / พิมพ์เอง"
                        clearable
                      />
                    </div>
                    <label className="col-span-1 sm:col-span-2 flex flex-col gap-0.5 text-xs text-slate-500">
                      <span>ชื่อ</span>
                      <input
                        value={row.name}
                        onChange={(e) => patchRow(idx, { name: e.target.value })}
                        className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="col-span-1 sm:col-span-1 flex flex-col gap-0.5 text-xs text-slate-500">
                      หน่วย
                      <UnitSelect
                        value={row.unit}
                        onChange={(unit) => patchRow(idx, { unit })}
                        options={UNIT_OPTIONS}
                        inUse={unitsInUse}
                      />
                    </label>
                    <label className="col-span-1 sm:col-span-2 flex flex-col gap-0.5 text-xs text-slate-500">
                      <span>ปริมาณ/หน่วย</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.qtyPerUnit}
                        onChange={(e) => patchRow(idx, { qtyPerUnit: e.target.value })}
                        className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="col-span-1 sm:col-span-1 flex flex-col gap-0.5 text-xs text-slate-500">
                      <span>เผื่อ%</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={row.wasteFactorPct}
                        onChange={(e) => patchRow(idx, { wasteFactorPct: e.target.value })}
                        className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="col-span-1 sm:col-span-1 flex flex-col gap-0.5 text-xs text-slate-500">
                      <span>ราคา/หน่วย</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.unitPrice}
                        onChange={(e) => patchRow(idx, { unitPrice: e.target.value })}
                        className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                      />
                    </label>
                    <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-end gap-1">
                      <span className="text-xs text-slate-500 sm:hidden">= {money(rowCost)}</span>
                      <span className="hidden sm:inline text-xs text-slate-500" title="ต้นทุนวัสดุย่อยนี้ต่อ 1 หน่วยของรายการ">
                        {money(rowCost)}
                      </span>
                      <button
                        type="button"
                        aria-label="ลบวัสดุย่อย"
                        onClick={() => setRows(state.components.filter((_, i) => i !== idx))}
                        className="text-slate-400 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setRows([...state.components, { ...EMPTY_COMPONENT }])}
          >
            <Plus size={14} /> เพิ่มวัสดุย่อย
          </Button>
        </div>
      </>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="วัสดุ / ค่าแรง"
        action={<Button onClick={() => setShowAddForm((v) => !v)}>+ เพิ่มรายการ</Button>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filterTopId}
          onChange={(e) => setFilterTopId(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">ทุกหมวดงาน</option>
          {topCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} — ` : ""}
              {c.name}
            </option>
          ))}
        </select>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="ค้นหาด้วยรหัส (MAT-0042), ชื่อ หรือสเปก"
          className="w-80"
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-500 select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-brand"
          />
          แสดงที่ปิดใช้งาน{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
        </label>
        {search && <span className="text-xs text-slate-500">พบ {visibleMaterials.length} รายการ</span>}
      </div>

      {showAddForm && (
        <div className="mb-4 border border-dashed border-slate-300 rounded-md p-3 bg-white">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {formFields(form, patchForm)}
          </div>
          <div className="flex gap-2 mt-3 border-t border-slate-100 pt-3">
            <Button onClick={submitCreate}>
              <Check size={14} /> บันทึก
            </Button>
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>
              <X size={14} /> ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {loading && <p className="text-slate-500">กำลังโหลด...</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && materials.length === 0 && (
        <p className="text-slate-500">ยังไม่มีรายการวัสดุ/ค่าแรง</p>
      )}
      {!loading && !error && materials.length > 0 && visibleMaterials.length === 0 && (
        <p className="text-slate-500">ไม่พบรายการที่ตรงกับคำค้น</p>
      )}

      {visibleMaterials.length > 0 && (
        <p className="text-xs text-slate-500 mb-2">
          แสดง {pageStart + 1}-{pageStart + pageMaterials.length} จาก {visibleMaterials.length} รายการ
        </p>
      )}

      {visibleMaterials.length > 0 && (
        <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">รหัส</th>
              <th className="px-3 py-2">ชื่อรายการ</th>
              <th className="px-3 py-2">หมวดงาน</th>
              <th className="px-3 py-2">หน่วย</th>
              <th className="px-3 py-2 text-right">ราคาวัสดุ/หน่วย</th>
              <th className="px-3 py-2 text-right">ค่าแรง/หน่วย</th>
              <th className="px-3 py-2 text-right">เผื่อเสีย</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageMaterials.map((m) =>
              editingId === m.id ? (
                <tr key={m.id} className="border-t border-slate-100 bg-slate-50">
                  <td colSpan={8} className="px-3 py-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {formFields(editForm, patchEdit)}
                    </div>
                    <div className="flex gap-2 mt-3 border-t border-slate-100 pt-3">
                      <Button size="sm" onClick={() => submitEdit(m.id)}>
                        <Check size={14} /> บันทึก
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        <X size={14} /> ยกเลิก
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={m.id}
                  className={`border-t border-slate-100 ${m.active ? "" : "bg-slate-50/60"}`}
                >
                  <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">
                    {m.code ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${m.active ? "text-slate-800" : "text-slate-500"}`}>{m.name}</span>
                      {!m.active && (
                        <span className="text-xs font-medium text-slate-500 bg-slate-200 rounded-full px-2 py-0.5 whitespace-nowrap">
                          ปิดใช้งาน
                        </span>
                      )}
                    </div>
                    {m.spec && <span className="block text-xs text-slate-500">{m.spec}</span>}
                    {m.supplier && (
                      <span className="block text-xs text-slate-400">ผู้จำหน่าย: {m.supplier}</span>
                    )}
                    {m.components.length > 0 && (
                      <span
                        className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand bg-brand/5 rounded-md px-1.5 py-0.5"
                        title={`ราคาวัสดุคิดจากสูตรวัสดุย่อย ${m.components.length} รายการ`}
                      >
                        <Layers size={11} /> สูตร {m.components.length} วัสดุ
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <CategoryCell categoryId={m.categoryId} byId={categoryById} />
                  </td>
                  <td className="px-3 py-2 text-slate-700">{m.unit}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{money(m.materialUnitPrice)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{money(m.laborUnitPrice)}</td>
                  <td className="px-3 py-2 text-right text-slate-500">
                    {m.wasteFactorPct === null ? "—" : `${Number(m.wasteFactorPct)}%`}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(m)}>
                        <Pencil size={14} /> แก้ไข
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(m)}>
                        {m.active ? (
                          <>
                            <PowerOff size={14} /> ปิดใช้งาน
                          </>
                        ) : (
                          <>
                            <Power size={14} /> เปิดใช้งาน
                          </>
                        )}
                      </Button>
                      <Button variant="dangerQuiet" size="sm" onClick={() => handleDelete(m.id)}>
                        <Trash2 size={14} /> ลบ
                      </Button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </Layout>
  );
}
