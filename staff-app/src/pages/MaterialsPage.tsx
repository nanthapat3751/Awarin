import { Check, ChevronRight, Layers, Pencil, Power, PowerOff, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { roundTo, parseTileSize, type MaterialDto, type WorkCategoryDto } from "@systemboq/shared-types";

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
import { useToast } from "../lib/toast-context";
import { createMaterial, deleteMaterial, listMaterials, updateMaterial } from "../lib/materials-api";
import { restoreTrashItem } from "../lib/trash-api";
import { TableSkeleton } from "../components/Skeleton";
import { RecipeEmptyState, RecipeRows } from "../components/RecipeRows";
import { RowMenu } from "../components/RowMenu";

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
  // การสั่งซื้อ (ไม่บังคับ) — ใช้ปัดรายการสั่งซื้อของโครงการ ไม่กระทบราคาที่เสนอลูกค้า
  // ขนาดกระเบื้อง (มม.) — ตัวคิดกระเบื้องในบรรทัด BOQ หยิบไปใช้ · ว่าง = ไม่ใช่กระเบื้อง/ไม่ได้ตั้ง
  tileWidthMm: string;
  tileLengthMm: string;
  tileThicknessMm: string;
  tilePiecesPerBox: string;
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
  // ว่าง = 0 ตอนบันทึก — ไม่ใส่ "0" ไว้ก่อน เพราะดูเหมือนมีคนกรอกไว้แล้ว
  laborUnitPrice: "",
  wasteFactorPct: "",
  tileWidthMm: "",
  tileLengthMm: "",
  tileThicknessMm: "",
  tilePiecesPerBox: "",
  components: [],
};

/** ช่องตัวเลขที่ว่างได้ — ว่าง = null (ไม่ตั้ง) */
const numberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

/** ขนาดกระเบื้องที่ส่งไปเซิร์ฟเวอร์ — ว่างทั้งหมด = ล้าง (ไม่ใช่กระเบื้อง) */
function tilePayload(f: MaterialFormState) {
  return {
    tileWidthMm: numberOrNull(f.tileWidthMm),
    tileLengthMm: numberOrNull(f.tileLengthMm),
    tileThicknessMm: numberOrNull(f.tileThicknessMm),
    tilePiecesPerBox: numberOrNull(f.tilePiecesPerBox),
  };
}

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
  return roundTo(sum, 2);
}

// แถวสูตรที่กรอกครบพอส่งได้ (มีชื่อ/หน่วย/ปริมาณ>0)
function validComponentRows(rows: ComponentRow[]): ComponentRow[] {
  return rows.filter((r) => r.name.trim() && r.unit.trim() && Number(r.qtyPerUnit) > 0);
}

/** วัสดุจากเซิร์ฟเวอร์ → ค่าในฟอร์ม (ตัวเลขเก็บเป็น string ระหว่างแก้) */
function formFromMaterial(material: MaterialDto): MaterialFormState {
  return {
    categoryId: material.categoryId ?? "",
    name: material.name,
    spec: material.spec ?? "",
    unit: material.unit,
    supplier: material.supplier ?? "",
    materialUnitPrice: material.materialUnitPrice,
    laborUnitPrice: material.laborUnitPrice,
    wasteFactorPct: material.wasteFactorPct ?? "",
    tileWidthMm: material.tileWidthMm != null ? String(material.tileWidthMm) : "",
    tileLengthMm: material.tileLengthMm != null ? String(material.tileLengthMm) : "",
    tileThicknessMm: material.tileThicknessMm != null ? String(Number(material.tileThicknessMm)) : "",
    tilePiecesPerBox: material.tilePiecesPerBox != null ? String(material.tilePiecesPerBox) : "",
    components: material.components.map((c) => ({
      componentMaterialId: c.componentMaterialId ?? "",
      name: c.name,
      unit: c.unit,
      qtyPerUnit: c.qtyPerUnit,
      wasteFactorPct: c.wasteFactorPct ?? "",
      unitPrice: c.unitPrice,
    })),
  };
}

/**
 * ค่าที่ส่งเซิร์ฟเวอร์ ใช้ทั้งเพิ่มและแก้ — ค่าแรงว่าง = 0 · มีสูตร = ราคาวัสดุคิดจากผลรวมของสูตร
 * ส่งสูตรปัจจุบันทั้งชุดเสมอ (round-trip): [] = ล้างสูตรกลับเป็นวัสดุก้อนเดียว
 */
function materialPayload(f: MaterialFormState) {
  const rows = validComponentRows(f.components);
  return {
    categoryId: f.categoryId || null,
    name: f.name.trim(),
    spec: f.spec.trim() || null,
    unit: f.unit.trim(),
    supplier: f.supplier.trim() || null,
    materialUnitPrice: rows.length > 0 ? deriveUnitPriceFromRows(rows) : Number(f.materialUnitPrice),
    laborUnitPrice: Number(f.laborUnitPrice || 0),
    wasteFactorPct: f.wasteFactorPct.trim() === "" ? null : Number(f.wasteFactorPct),
    ...tilePayload(f),
    components: rows.map((r, i) => ({
      componentMaterialId: r.componentMaterialId || null,
      name: r.name.trim(),
      unit: r.unit.trim(),
      qtyPerUnit: Number(r.qtyPerUnit),
      wasteFactorPct: r.wasteFactorPct.trim() === "" ? null : Number(r.wasteFactorPct),
      unitPrice: Number(r.unitPrice || 0),
      sortOrder: i,
    })),
  };
}

type FormErrorKey = "name" | "unit" | "materialUnitPrice" | "tile";

/**
 * ช่องที่ต้องแก้ก่อนบันทึก — เดิมกดบันทึกแล้วเงียบไปเฉย ๆ ไม่บอกว่าขาดอะไร
 * (tile มีข้อความแดงของตัวเองอยู่ในหัวข้อนั้นแล้ว ตรงนี้ใช้กันบันทึก + บังคับกางหัวข้อให้เห็น)
 */
function formErrors(f: MaterialFormState): Partial<Record<FormErrorKey, string>> {
  const errors: Partial<Record<FormErrorKey, string>> = {};
  if (!f.name.trim()) errors.name = "กรอกชื่อรายการ";
  if (!f.unit.trim()) errors.unit = "เลือกหน่วยนับ";
  const hasRecipe = validComponentRows(f.components).length > 0;
  if (!hasRecipe && f.materialUnitPrice.trim() === "") errors.materialUnitPrice = "กรอกราคาวัสดุ (ไม่มีค่าวัสดุใส่ 0)";
  if ((f.tileWidthMm.trim() === "") !== (f.tileLengthMm.trim() === "")) errors.tile = "ขนาดกระเบื้อง";
  return errors;
}

const INPUT = "w-full border border-slate-300 rounded-md px-2 py-1 text-sm";
const INPUT_INVALID = "border-red-400 focus:border-red-500 focus:ring-red-500";

/**
 * หัวข้อเสริมที่พับได้ในแผง — พับอยู่ = บอกค่าที่ตั้งไว้ (หรือคำใบ้สั้น ๆ ว่าข้างในมีอะไร) บรรทัดเดียว
 * กางแล้วค่อยขึ้นคำอธิบายเต็ม (description)
 */
function FormSection({
  title,
  hint,
  description,
  summary,
  defaultOpen,
  forceOpen = false,
  children,
}: Readonly<{
  title: ReactNode;
  hint: ReactNode;
  description: ReactNode;
  summary?: ReactNode;
  defaultOpen: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}>) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = open || forceOpen;
  return (
    <section className="border-t border-slate-200 last:border-b">
      <button
        type="button"
        onClick={() => setOpen(!shown)}
        aria-expanded={shown}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-md px-2 py-3 text-left hover:bg-slate-50"
      >
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${shown ? "rotate-90" : ""}`}
          aria-hidden
        />
        <span className="shrink-0 text-sm font-medium text-slate-700">{title}</span>
        {!shown && (
          <span className={`ml-auto min-w-0 truncate text-xs ${summary ? "text-slate-600" : "text-slate-400"}`}>
            {summary || hint}
          </span>
        )}
      </button>
      {shown && (
        <div className="pb-4 pl-6">
          <p className="mb-3 text-xs text-slate-500">{description}</p>
          {children}
        </div>
      )}
    </section>
  );
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
  // ลิงก์จากหน้าหมวดงาน: ?q=รหัสวัสดุ (เปิดพร้อมคำค้น) · ?category=<รายการ> (ปุ่ม "แก้ราคา" — กรอง
  // เฉพาะวัสดุของรายการนั้น) · &add=1 (ปุ่ม "ตั้งราคา" — เปิดฟอร์มเพิ่มที่เติมหมวด/ชื่อรายการให้)
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const itemFilter = searchParams.get("category") ?? "";
  const [addFromLink, setAddFromLink] = useState(searchParams.get("add") === "1" && itemFilter !== "");
  // แสดงรายการที่ปิดใช้งานด้วยหรือไม่ (ค่าเริ่มต้น: ซ่อน — เหมือนถังเก็บของที่เลิกใช้)
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [jumpToLastPage, setJumpToLastPage] = useState(false);

  // ฟอร์มชุดเดียว: เพิ่ม = กางเหนือตาราง · แก้ = กางในแถวนั้น (ผู้ใช้ลองแผงเลื่อนจากขวาแล้วไม่ชอบ)
  const [editor, setEditor] = useState<{ mode: "add" } | { mode: "edit"; material: MaterialDto } | null>(null);
  const [form, setForm] = useState<MaterialFormState>(EMPTY_FORM);
  const [initialForm, setInitialForm] = useState<MaterialFormState>(EMPTY_FORM);
  // ขึ้นตัวแดงหลังกดบันทึกครั้งแรกเท่านั้น — ไม่ด่าตั้งแต่ยังไม่ได้เริ่มพิมพ์
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  // แถวที่เพิ่งบันทึก ไฮไลต์สั้น ๆ — รายการใหม่ไปอยู่หน้าสุดท้าย ต้องชี้ให้เห็นว่าไปอยู่ตรงไหน
  const [flashId, setFlashId] = useState<string | null>(null);

  const patchForm = (patch: Partial<MaterialFormState>) => setForm((f) => ({ ...f, ...patch }));

  function openEditor(next: { mode: "add" } | { mode: "edit"; material: MaterialDto }, values: MaterialFormState) {
    setForm(values);
    setInitialForm(values);
    setAttempted(false);
    setEditor(next);
  }

  /** ยกเลิก — มีอะไรเปลี่ยนจากตอนเปิดถามก่อน ของที่พิมพ์ไว้จะได้ไม่หายเพราะกดพลาด */
  async function cancelEditor() {
    const dirty = JSON.stringify(form) !== JSON.stringify(initialForm);
    if (dirty && !(await confirm("ทิ้งข้อมูลที่กรอกไว้?", { confirmLabel: "ทิ้ง", cancelLabel: "กลับไปกรอกต่อ" }))) return;
    setEditor(null);
  }

  useEffect(() => {
    if (!flashId) return;
    // รอหน้า/ตารางเปลี่ยนเสร็จก่อน (แถวใหม่อยู่หน้าสุดท้าย) แล้วค่อยเลื่อนให้แถวโผล่ในจอ
    const scroll = setTimeout(() => {
      document.querySelector(`[data-material-row="${flashId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
    const clear = setTimeout(() => setFlashId(null), 2500);
    return () => {
      clearTimeout(scroll);
      clearTimeout(clear);
    };
  }, [flashId]);

  /** หน่วยที่ถูกใช้จริงในแคตตาล็อกแล้ว — เอาไว้เลือกซ้ำได้แม้ไม่อยู่ในลิสต์มาตรฐาน */
  const unitsInUse = useMemo(
    () => [...new Set(materials.map((m) => m.unit).filter(Boolean))],
    [materials],
  );

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const itemCategories = useMemo(() => categories.filter((c) => c.level === "ITEM"), [categories]);
  // ชื่อที่เลือกเป็นของในสูตรได้ (ทุกวัสดุที่ยังใช้งาน) — เลือกแล้วเติมหน่วย/ราคาให้อัตโนมัติ
  const recipeMaterials = useMemo(() => new Map(materials.filter((m) => m.active).map((m) => [m.id, m])), [materials]);
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
      if (itemFilter && m.categoryId !== itemFilter) return false;
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
  }, [materials, search, filterTopId, showInactive, rootIdOf, itemFilter]);

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
  }, [search, filterTopId, showInactive, itemFilter]);

  // มาจากปุ่ม "ตั้งราคา" ของหน้าหมวดงาน: เปิดฟอร์มเพิ่มพร้อมหมวด+ชื่อรายการ (รอให้รายชื่อหมวดโหลดก่อน
  // ถึงจะรู้ชื่อ) — ทำครั้งเดียว แล้วล้าง add=1 ออกจาก URL ไม่ให้รีเฟรชแล้วเด้งฟอร์มซ้ำ
  useEffect(() => {
    if (!addFromLink) return;
    const item = categories.find((c) => c.id === itemFilter);
    if (!item) return;
    setAddFromLink(false);
    openEditor({ mode: "add" }, { ...EMPTY_FORM, categoryId: item.id, name: item.name });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("add");
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addFromLink, categories, itemFilter, setSearchParams]);

  function clearItemFilter() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("category");
      next.delete("add");
      return next;
    }, { replace: true });
  }

  useEffect(() => {
    if (!jumpToLastPage) return;
    setPage(pageCount);
    setJumpToLastPage(false);
  }, [jumpToLastPage, pageCount]);

  // silent = โหลดใหม่หลังบันทึก/สลับสถานะ: ไม่ขึ้น skeleton (ขึ้นเหนือตารางแล้วดันตารางลงชั่วครู่)
  async function refresh(silent = false) {
    if (!silent) setLoading(true);
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

  async function saveEditor() {
    if (!editor || saving) return;
    setAttempted(true);
    if (Object.keys(formErrors(form)).length > 0) {
      // พาไปช่องแรกที่ต้องแก้ (หัวข้อที่พับอยู่ถูกบังคับกางในรอบ render นี้ จึงรอหนึ่งจังหวะ)
      setTimeout(() => {
        const box = document.querySelector("[data-material-editor] [data-invalid]");
        const target =
          box?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? box?.querySelector<HTMLElement>("input:not([disabled])");
        target?.focus();
      }, 0);
      return;
    }
    setSaving(true);
    try {
      if (editor.mode === "add") {
        const { material } = await createMaterial(materialPayload(form));
        setEditor(null);
        toast.success(`เพิ่ม “${material.name}” แล้ว`);
        await refresh(true);
        // แถวใหม่ได้รหัส MAT- สูงสุด จึงไปอยู่หน้าสุดท้าย — ตามไปที่นั่นแทนที่จะค้างหน้าเดิม
        setJumpToLastPage(true);
        setFlashId(material.id);
      } else {
        const id = editor.material.id;
        await updateMaterial(id, materialPayload(form));
        setEditor(null);
        toast.success("บันทึกแล้ว");
        await refresh(true);
        setFlashId(id);
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : saveFailedText(editor.mode),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(m: MaterialDto) {
    try {
      await updateMaterial(m.id, { active: !m.active });
      await refresh(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm("ย้ายรายการนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", { confirmLabel: "ลบ" })))
      return;
    try {
      await deleteMaterial(id);
      toast.undo("ย้ายรายการไปถังขยะแล้ว", async () => {
        await restoreTrashItem("material", id);
        await refresh(true);
      });
      await refresh(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ย้ายไปถังขยะไม่สำเร็จ");
    }
  }

  // ช่องกรอกชุดเดียว ใช้ทั้งเพิ่มและแก้ (เป็นฟังก์ชันคืน JSX ไม่ใช่ component ย่อย เพื่อไม่ให้ช่องกรอก
  // โดน remount แล้วเสีย focus ระหว่างพิมพ์)
  //
  // บนสุด = 5 ช่องที่วัสดุทุกตัวต้องมี (ชื่อ หมวด หน่วย ราคาวัสดุ ค่าแรง) + ยอดรวมต่อหน่วย
  // ที่เหลือ (สเปก/ผู้จำหน่าย/เผื่อเสีย · การสั่งซื้อ · กระเบื้อง · สูตรวัสดุย่อย) พับเป็นหัวข้อ เปิดเฉพาะที่ใช้
  // หัวข้อที่มีค่าอยู่แล้วกางเองตอนเปิดแผง
  function materialFields(state: MaterialFormState, set: (patch: Partial<MaterialFormState>) => void) {
    const errors = attempted ? formErrors(state) : {};
    // ตัวเลือกหมวด = หมวดที่ใช้งานอยู่ + หมวดที่เลือกอยู่ปัจจุบัน (เผื่อกำลังแก้วัสดุที่หมวดถูก
    // เก็บเข้ากรุไปแล้ว จะได้ยังเห็นค่าเดิม)
    const catOptions = categoryChoices(activeItemCategories, categoryById, state.categoryId);
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

    const unitLabel = state.unit.trim() || "หน่วย";
    const matPrice = hasRecipe ? derived : Number(state.materialUnitPrice);
    const priceKnown = hasRecipe || (state.materialUnitPrice.trim() !== "" && !Number.isNaN(matPrice));
    const laborPrice = Number(state.laborUnitPrice || 0);

    // บรรทัดสรุปตอนหัวข้อพับอยู่ — บอกค่าที่ตั้งไว้จริง ไม่ต้องกางดู
    const detailSummary = detailSummaryOf(state);
    const tileFilled = [state.tileWidthMm, state.tileLengthMm, state.tileThicknessMm, state.tilePiecesPerBox].some(
      (v) => v.trim() !== "",
    );
    const tileSummary = tileSummaryOf(state);
    const recipeSummary = hasRecipe ? `${validRows.length} วัสดุ · ${money(derived)} บาท/${unitLabel}` : "";

    return (
      <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="col-span-2" data-invalid={errors.name ? "" : undefined}>
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>
                ชื่อรายการ <span className="text-red-500">*</span>
              </span>
              <input
                value={state.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="เช่น ปูกระเบื้องพื้น 60×60"
                autoFocus
                aria-invalid={errors.name ? true : undefined}
                className={`${INPUT} ${errors.name ? INPUT_INVALID : ""}`}
              />
            </label>
            {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
          </div>

          <div className="col-span-2 flex flex-col gap-1 text-xs text-slate-700">
            <span>
              หมวดงาน <span className="text-slate-400">(ไม่บังคับ)</span>
            </span>
            <SearchableSelect
              options={catSelectOptions}
              value={state.categoryId}
              onChange={(v) => set({ categoryId: v })}
              placeholder="ไม่ระบุ — พิมพ์เพื่อค้นหาหมวดงาน"
              clearable
            />
          </div>

            <div data-invalid={errors.unit ? "" : undefined}>
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>
                  หน่วยนับ <span className="text-red-500">*</span>
                </span>
                <UnitSelect
                  value={state.unit}
                  onChange={(unit) => set({ unit })}
                  options={UNIT_OPTIONS}
                  inUse={unitsInUse}
                  className={errors.unit ? "[&_input]:border-red-400" : ""}
                />
              </label>
              {errors.unit && <p className="mt-1 text-xs text-red-600">{errors.unit}</p>}
            </div>
            <MaterialPriceField
              state={state}
              set={set}
              error={errors.materialUnitPrice}
              hasRecipe={hasRecipe}
              derived={derived}
              unitLabel={unitLabel}
            />
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>ค่าแรง / {unitLabel}</span>
              <input
                type="number"
                min="0"
                step="any"
                value={state.laborUnitPrice}
                onChange={(e) => set({ laborUnitPrice: e.target.value })}
                placeholder="ว่าง = 0"
                className={`${INPUT} text-right tabular-nums`}
              />
            </label>
          <div className="flex flex-col gap-1 text-xs text-slate-700">
            <span>
              รวม / {unitLabel} <span className="text-slate-400">(วัสดุ + ค่าแรง)</span>
            </span>
            <div className="rounded-md bg-slate-100 px-2 py-1 text-right text-sm font-semibold tabular-nums text-slate-800">
              {priceKnown ? money(matPrice + laborPrice) : "—"}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <FormSection
            title="รายละเอียด"
            hint="สเปก · ผู้จำหน่าย · เผื่อเสีย"
            description="ไม่บังคับ — สเปกกับผู้จำหน่ายแสดงใต้ชื่อในตาราง"
            summary={detailSummary}
            defaultOpen={detailSummary !== ""}
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <label className="col-span-2 flex flex-col gap-1 text-xs text-slate-700">
                <span>สเปก / รายละเอียด</span>
                <input
                  value={state.spec}
                  onChange={(e) => set({ spec: e.target.value })}
                  placeholder="เช่น มอก. / ยี่ห้อ / ขนาด"
                  className={INPUT}
                />
              </label>
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  <span>ผู้จำหน่าย</span>
                  <input
                    value={state.supplier}
                    onChange={(e) => set({ supplier: e.target.value })}
                    className={INPUT}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  <span>เผื่อเสีย (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={state.wasteFactorPct}
                    onChange={(e) => set({ wasteFactorPct: e.target.value })}
                    placeholder="เช่น 5"
                    className={INPUT}
                  />
                </label>
            </div>
          </FormSection>

          <FormSection
            title="ขนาดกระเบื้อง"
            hint={!tileFilled && looksLikeTile(state.name) ? "ชื่อนี้ดูเป็นกระเบื้อง — ตั้งขนาดได้ที่นี่" : "ขนาดแผ่น · แผ่นต่อกล่อง"}
            description="เฉพาะวัสดุที่เป็นกระเบื้อง — ตัวคิดกระเบื้องในบรรทัด BOQ หยิบไปนับแผ่น/กล่อง"
            summary={tileSummary}
            defaultOpen={tileFilled || looksLikeTile(state.name)}
            forceOpen={!!errors.tile}
          >
            <TileSpecFields state={state} set={set} />
          </FormSection>

          <FormSection
            title="สูตรวัสดุย่อย"
            hint={`ของที่ใช้ต่อ 1 ${unitLabel}`}
            description="ไม่บังคับ — งานที่ผสมจากของหลายอย่าง ใส่สูตรแล้วระบบคิดราคาวัสดุให้"
            summary={recipeSummary}
            defaultOpen={state.components.length > 0}
          >
            {/* แบบ A (อ่านเป็นประโยค) + D (หน้าว่างบอกก่อนว่าต้องใส่ไหม) — ผู้ใช้เลือก 18 ต.ค. ชุดเดียวกับแผงบรรทัด BOQ */}
            {state.components.length > 0 ? (
              <RecipeRows
                rows={state.components}
                onChange={setRows}
                emptyRow={() => ({ ...EMPTY_COMPONENT })}
                unitLabel={unitLabel}
                materialById={recipeMaterials}
                renderUnit={(value, onUnit) => (
                  <UnitSelect value={value} onChange={onUnit} options={UNIT_OPTIONS} inUse={unitsInUse} />
                )}
                typedPrice={state.materialUnitPrice.trim() === "" ? null : Number(state.materialUnitPrice)}
              />
            ) : (
              <RecipeEmptyState unitLabel={unitLabel} onStart={() => setRows([{ ...EMPTY_COMPONENT }])} />
            )}
          </FormSection>
        </div>
      </>
    );
  }

  /** แถวที่กำลังแก้ — ฟอร์มกางในแถว */
  function renderEditorRow(m: MaterialDto) {
    return (
      <tr key={m.id} data-material-row={m.id} className="border-t border-slate-100 bg-slate-50">
        <td colSpan={8} className="px-3 py-4" data-material-editor>
      {materialFields(form, patchForm)}
      <div className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-3">
      <Button onClick={saveEditor}>
        <Check size={14} /> {saving ? "กำลังบันทึก…" : "บันทึก"}
      </Button>
      <Button variant="ghost" onClick={cancelEditor}>
        <X size={14} /> ยกเลิก
      </Button>
      <span className="ml-auto text-xs text-slate-400">
        <span className="text-red-500">*</span> ต้องกรอก
      </span>
      </div>
        </td>
      </tr>
    );
  }

  function renderMaterialRow(m: MaterialDto) {
    return (
      <tr
        key={m.id}
        data-material-row={m.id}
        className={`border-t border-slate-100 transition-colors duration-700 ${rowTone(m, flashId)}`}
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
          {m.tileWidthMm != null && m.tileLengthMm != null && (
            <span className="block text-xs text-slate-400">
              แผ่น {m.tileWidthMm}×{m.tileLengthMm} มม.
              {m.tilePiecesPerBox != null && ` · กล่องละ ${m.tilePiecesPerBox} แผ่น`}
            </span>
          )}
          {m.supplier && (
            <span className="block text-xs text-slate-400">ผู้จำหน่าย: {m.supplier}</span>
          )}
          {/* iPad: หมวดงานกับเผื่อเสียย้ายมาใต้ชื่อ (คอลัมน์ของมันซ่อนไว้) */}
          <div className="mt-1 xl:hidden">
            <CategoryCell categoryId={m.categoryId} byId={categoryById} />
            {m.wasteFactorPct !== null && (
              <span className="block pl-4 text-xs text-slate-500">เผื่อเสีย {Number(m.wasteFactorPct)}%</span>
            )}
          </div>
          {m.components.length > 0 && (
            <span
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-brand bg-brand/5 rounded-md px-1.5 py-0.5"
              title={`ราคาวัสดุคิดจากสูตรวัสดุย่อย ${m.components.length} รายการ`}
            >
              <Layers size={11} /> สูตร {m.components.length} วัสดุ
            </span>
          )}
        </td>
        <td className="hidden px-3 py-2 xl:table-cell">
          <CategoryCell categoryId={m.categoryId} byId={categoryById} />
        </td>
        <td className="px-3 py-2 text-slate-700">{m.unit}</td>
        <td className="px-3 py-2 text-right text-slate-800">{money(m.materialUnitPrice)}</td>
        <td className="px-3 py-2 text-right text-slate-800">{money(m.laborUnitPrice)}</td>
        <td className="hidden px-3 py-2 text-right text-slate-500 xl:table-cell">
          {m.wasteFactorPct === null ? "—" : `${Number(m.wasteFactorPct)}%`}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <div className="xl:hidden">
            <RowMenu
              label={`คำสั่งของ ${m.name}`}
              items={[
                { key: "edit", label: "แก้ไข", onSelect: () => openEditor({ mode: "edit", material: m }, formFromMaterial(m)) },
                { key: "active", label: m.active ? "ปิดใช้งาน" : "เปิดใช้งาน", onSelect: () => void toggleActive(m) },
                { key: "delete", label: "ลบ", danger: true, onSelect: () => void handleDelete(m.id) },
              ]}
            />
          </div>
          <div className="hidden gap-2 xl:flex">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openEditor({ mode: "edit", material: m }, formFromMaterial(m))}
            >
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
    );
  }

  return (
    <Layout>
      <PageHeader
        title="วัสดุ / ค่าแรง"
        action={<Button onClick={() => openEditor({ mode: "add" }, EMPTY_FORM)}>+ เพิ่มรายการ</Button>}
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
        {itemFilter && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white py-0.5 pl-3 pr-1 text-sm text-slate-700">
            เฉพาะรายการ{" "}
            <span className="font-medium">
              {categoryById.get(itemFilter)?.code ? `${categoryById.get(itemFilter)!.code} ` : ""}
              {categoryById.get(itemFilter)?.name ?? "ที่เลือก"}
            </span>
            <span className="text-slate-500">· {visibleMaterials.length} วัสดุ</span>
            <button
              type="button"
              onClick={clearItemFilter}
              aria-label="ล้างตัวกรองรายการ"
              className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          </span>
        )}
      </div>

      {editor?.mode === "add" && (
        <div data-material-editor className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-slate-800">เพิ่มวัสดุ / ค่าแรง</p>
          {materialFields(form, patchForm)}
          <div className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-3">
            <Button onClick={saveEditor}>
              <Check size={14} /> {saving ? "กำลังบันทึก…" : "บันทึก"}
            </Button>
            <Button variant="ghost" onClick={cancelEditor}>
              <X size={14} /> ยกเลิก
            </Button>
            <span className="ml-auto text-xs text-slate-400">
              <span className="text-red-500">*</span> ต้องกรอก
            </span>
          </div>
        </div>
      )}

      {loading && <TableSkeleton rows={10} cols={6} />}
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
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {/* iPad (<1280): ซ่อนหมวดงาน/เผื่อเสีย (ย้ายไปใต้ชื่อ) + ปุ่มประจำแถวรวมเป็น ⋯ — ตารางพอดีจอไม่ต้องปัดข้าง (ผู้ใช้สั่ง 18 ต.ค.) */}
        <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70 xl:min-w-[60rem]">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">รหัส</th>
              <th className="min-w-[13rem] px-3 py-2">ชื่อรายการ</th>
              <th className="hidden px-3 py-2 xl:table-cell">หมวดงาน</th>
              <th className="px-3 py-2">หน่วย</th>
              <th className="px-3 py-2 text-right">ราคาวัสดุ/หน่วย</th>
              <th className="px-3 py-2 text-right">ค่าแรง/หน่วย</th>
              <th className="hidden px-3 py-2 text-right xl:table-cell">เผื่อเสีย</th>
              <th className="px-3 py-2"><span className="sr-only">คำสั่ง</span></th>
            </tr>
          </thead>
          <tbody>
            {pageMaterials.map((m) =>
              editor?.mode === "edit" && editor.material.id === m.id ? renderEditorRow(m) : renderMaterialRow(m),
            )}
          </tbody>
        </table>
        </div>
      )}

      <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
    </Layout>
  );
}

function saveFailedText(mode: "add" | "edit") {
  return mode === "add" ? "เพิ่มรายการไม่สำเร็จ" : "แก้ไขไม่สำเร็จ";
}

/** สีพื้นของแถว: เพิ่งบันทึก = กะพริบเหลือง · ปิดใช้งาน = เทาจาง */
function rowTone(m: MaterialDto, flashId: string | null) {
  if (flashId === m.id) return "bg-amber-50";
  return m.active ? "" : "bg-slate-50/60";
}

/**
 * ตัวเลือกหมวด = หมวดที่ใช้งานอยู่ + หมวดที่เลือกอยู่ปัจจุบัน (เผื่อกำลังแก้วัสดุที่หมวดถูก
 * เก็บเข้ากรุไปแล้ว จะได้ยังเห็นค่าเดิม)
 */
function categoryChoices(active: WorkCategoryDto[], byId: Map<string, WorkCategoryDto>, currentId: string): WorkCategoryDto[] {
  if (!currentId || active.some((c) => c.id === currentId)) return [...active];
  const cur = byId.get(currentId);
  return cur ? [...active, cur] : [...active];
}

function detailSummaryOf(state: MaterialFormState) {
  const supplier = state.supplier.trim();
  return [
    state.spec.trim(),
    supplier && `ผู้จำหน่าย ${supplier}`,
    state.wasteFactorPct.trim() && `เผื่อเสีย ${Number(state.wasteFactorPct)}%`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function tileSummaryOf(state: MaterialFormState) {
  return [
    state.tileWidthMm.trim() && state.tileLengthMm.trim() && `${state.tileWidthMm}×${state.tileLengthMm} มม.`,
    state.tilePiecesPerBox.trim() && `กล่องละ ${state.tilePiecesPerBox} แผ่น`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** ราคาวัสดุ/หน่วย — มีสูตรวัสดุย่อย = ช่องอ่านอย่างเดียว (คิดจากผลรวมสูตร) · ไม่มี = กรอกเอง */
function MaterialPriceField({
  state,
  set,
  error,
  hasRecipe,
  derived,
  unitLabel,
}: Readonly<{
  state: MaterialFormState;
  set: (patch: Partial<MaterialFormState>) => void;
  error: string | undefined;
  hasRecipe: boolean;
  derived: number;
  unitLabel: string;
}>) {
  return (
    <div data-invalid={error ? "" : undefined}>
      <label className="flex flex-col gap-1 text-xs text-slate-700">
        <span>
          ราคาวัสดุ / {unitLabel} {!hasRecipe && <span className="text-red-500">*</span>}
        </span>
        {hasRecipe ? (
          <input
            type="text"
            readOnly
            value={money(derived)}
            title="คิดจากผลรวมของสูตรวัสดุย่อย"
            className={`${INPUT} border-slate-200 bg-slate-100 text-right tabular-nums text-slate-600`}
          />
        ) : (
          <input
            type="number"
            min="0"
            step="any"
            value={state.materialUnitPrice}
            onChange={(e) => set({ materialUnitPrice: e.target.value })}
            placeholder="0.00"
            aria-invalid={error ? true : undefined}
            className={`${INPUT} text-right tabular-nums ${error ? INPUT_INVALID : ""}`}
          />
        )}
      </label>
      {hasRecipe && <p className="mt-1 text-xs text-slate-500">คิดจากสูตรวัสดุย่อยด้านล่าง</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** ชื่อแบบนี้น่าจะเป็นงานกระเบื้อง (ไม่นับหลังคาลอน — มุงคิดคนละแบบ) */
const looksLikeTile = (name: string) => /กระเบื้อง|แกรนิต|เซรามิ|โมเสค|หินอ่อน/.test(name) && !/หลังคา|ลอน/.test(name);

/**
 * ขนาดกระเบื้อง — ตัวคิดกระเบื้องในบรรทัด BOQ หยิบไปเติมให้ (นับแผ่นตามแนวปู/กล่องที่ต้องสั่ง)
 * การพับ/กางอยู่ที่ FormSection ของแผงแล้ว (กางเองเมื่อมีค่าหรือชื่อดูเป็นกระเบื้อง)
 */
function TileSpecFields({
  state,
  set,
}: Readonly<{ state: MaterialFormState; set: (patch: Partial<MaterialFormState>) => void }>) {
  const filled = [state.tileWidthMm, state.tileLengthMm, state.tileThicknessMm, state.tilePiecesPerBox].some(
    (v) => v.trim() !== "",
  );
  const halfSize = (state.tileWidthMm.trim() === "") !== (state.tileLengthMm.trim() === "");
  const parsed = parseTileSize(state.name);
  const input = "mt-auto border border-slate-300 rounded-md px-2 py-1 text-sm";
  const field = (key: keyof MaterialFormState, label: string, placeholder: string, step = "1") => (
    <label className="flex flex-col gap-1 text-xs text-slate-700">
      <span>{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        value={state[key] as string}
        onChange={(e) => set({ [key]: e.target.value })}
        placeholder={placeholder}
        className={`${input} ${halfSize && (key === "tileWidthMm" || key === "tileLengthMm") ? "border-red-400" : ""}`}
      />
    </label>
  );
  return (
    <div data-invalid={halfSize ? "" : undefined}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {field("tileWidthMm", "กว้าง (มม.)", "เช่น 600")}
            {field("tileLengthMm", "ยาว (มม.)", "เช่น 600")}
            {field("tileThicknessMm", "หนา (มม.)", "เช่น 9", "0.5")}
            {field("tilePiecesPerBox", "แผ่นต่อกล่อง", "ดูที่ข้างกล่อง")}
          </div>
          {halfSize && <p className="mt-1.5 text-xs text-red-600">กรอกทั้งกว้างและยาว (หรือเว้นว่างทั้งคู่)</p>}
          {!filled && parsed && (
            <button
              type="button"
              onClick={() => set({ tileWidthMm: String(parsed.widthMm), tileLengthMm: String(parsed.lengthMm) })}
              className="link-pill -ml-2.5 mt-1 text-xs font-medium text-brand"
            >
              ใช้ขนาดจากชื่อ: {parsed.widthMm}×{parsed.lengthMm} มม.
            </button>
          )}
    </div>
  );
}
