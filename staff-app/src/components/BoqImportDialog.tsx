import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { ApiError, downloadFile } from "../lib/api";
import {
  commitBoqImport,
  previewBoqImport,
  type BoqImportCommitRow,
  type BoqImportPreview,
  type BoqImportRow,
} from "../lib/boq-api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { SearchableSelect, type SearchableOption } from "./SearchableSelect";

const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 3 }));

/** แต่ละแถวจะลงรหัสงานไหน — null = ยังไม่ได้เลือก (ต้องเลือกก่อนนำเข้า) */
type Target =
  | { kind: "existing"; categoryId: string }
  | { kind: "new"; parentId: string; code: string | null }
  | { kind: "skip" }
  | null;
/** คลังวัสดุ: ผูกกับวัสดุที่ชื่อตรง · เพิ่มเป็นวัสดุใหม่ · ไม่เกี่ยวกับคลัง (ใช้ครั้งเดียว) */
type LibraryChoice = "link" | "add" | "none";
interface Decision {
  target: Target;
  library: LibraryChoice;
}

const rowKey = (r: BoqImportRow) => `${r.sheet}:${r.rowNumber}`;

type ImportMode = "append" | "replace" | "sync";

const FIELD_LABEL: Record<string, string> = {
  name: "ชื่อ",
  quantity: "ปริมาณ",
  unit: "หน่วย",
  materialUnitPrice: "ค่าวัสดุ/หน่วย",
  laborUnitPrice: "ค่าแรง/หน่วย",
  note: "หมายเหตุ",
  category: "รหัสงาน",
};
function showValue(v: string | number | null) {
  if (v == null || v === "") return "—";
  return typeof v === "number" ? v.toLocaleString("th-TH", { maximumFractionDigits: 3 }) : v;
}

/** แถวที่แก้บรรทัดเดิม (โหมดอัปเดตตามไฟล์) — ไม่ต้องเลือกรหัส/คลัง เพราะเป็นบรรทัดที่มีอยู่แล้ว */
const isExistingLine = (r: BoqImportRow, mode: ImportMode) => mode === "sync" && !!r.sync?.lineId;

/** ปุ่มกรองแถวเหนือตาราง — เปิดมาเห็นแค่แถวที่ต้องตัดสินใจ ไม่ต้องไล่หาเองในไฟล์หลายร้อยแถว */
type RowFilter = "attention" | "ready" | "unchanged" | "skipped" | "all";
type RowGroup = Exclude<RowFilter, "all">;

/** ต้องให้คนดู: ข้อมูลเสีย · มีคำเตือน · ยังไม่ได้เลือกรหัสงาน */
function needsAttention(r: BoqImportRow, d: Decision | undefined, mode: ImportMode) {
  if (r.errors.length > 0 || r.warnings.length > 0) return true;
  return !isExistingLine(r, mode) && d?.target == null;
}

function groupOf(r: BoqImportRow, d: Decision | undefined, mode: ImportMode): RowGroup {
  if (needsAttention(r, d, mode)) return "attention";
  if (isExistingLine(r, mode) && r.sync?.status === "unchanged") return "unchanged";
  if (!isExistingLine(r, mode) && d?.target?.kind === "skip") return "skipped";
  return "ready";
}

/** "D-01-01 — หมวด > กลุ่ม > งาน" → "D-01-01" (ชื่อเต็มอยู่ใน tooltip) · ไม่มีรหัส = ชื่อชั้นสุดท้าย */
const shortLabel = (label: string) => (label.includes(" — ") ? label.split(" — ")[0] : label.split(" > ").at(-1) ?? label);

/** ตัวกรองตอนเปิดพรีวิว: มีแถวต้องดู → ต้องดู · ไม่มีแต่มีแถวพร้อม → พร้อม · นอกนั้นทั้งหมด */
function firstFilter(attentionCount: number, anyReady: boolean): RowFilter {
  if (attentionCount > 0) return "attention";
  return anyReady ? "ready" : "all";
}

/** แถวนี้อยู่ในตัวกรองที่เลือกไหม — "ต้องดู" ใช้ชุดที่จำไว้ตอนเปิดตัวกรอง (แก้แล้วไม่หายไปต่อหน้า) */
function inFilter(filter: RowFilter, inAttention: boolean, group: RowGroup) {
  if (filter === "all") return true;
  if (filter === "attention") return inAttention;
  return group === filter;
}

/** ช่องรหัสงานของแถวที่จะส่งไปนำเข้า */
function targetFields(t: NonNullable<Target>): Partial<BoqImportCommitRow> {
  if (t.kind === "existing") return { categoryId: t.categoryId };
  if (t.kind === "new") return { newCategory: { parentId: t.parentId, code: t.code } };
  return {};
}

function commitRowOf(r: BoqImportRow, d: Decision): BoqImportCommitRow {
  return {
    ...targetFields(d.target!),
    ...(d.library === "link" && r.materialMatch ? { materialId: r.materialMatch.id } : {}),
    ...(d.library === "add" ? { addToLibrary: true } : {}),
    name: r.name,
    quantity: r.quantity!,
    unit: r.unit,
    materialUnitPrice: r.materialUnitPrice,
    laborUnitPrice: r.laborUnitPrice,
    note: r.note,
  };
}

function updateRowOf(r: BoqImportRow): BoqImportCommitRow {
  return {
    lineId: r.sync!.lineId!,
    categoryId: r.categoryId!,
    name: r.name,
    quantity: r.quantity!,
    unit: r.unit,
    materialUnitPrice: r.materialUnitPrice,
    laborUnitPrice: r.laborUnitPrice,
    note: r.note,
  };
}

type CommitResult = Awaited<ReturnType<typeof commitBoqImport>>;

/** ข้อความแจ้งหลังนำเข้าสำเร็จ */
function importedMessage(res: CommitResult, syncing: boolean) {
  const extras = [
    res.updated ? `แก้ ${res.updated}` : "",
    res.createdCategories.length ? `สร้างรหัสงานใหม่ ${res.createdCategories.length}` : "",
    res.createdMaterials.length ? `เพิ่มเข้าคลัง ${res.createdMaterials.length}` : "",
    res.linkedMaterials ? `ผูกคลัง ${res.linkedMaterials}` : "",
    res.removed ? `ลบบรรทัดเดิม ${res.removed}` : "",
  ].filter(Boolean);
  if (syncing) {
    const parts = [`เพิ่ม ${res.imported}`, ...extras].join(" · ");
    return `อัปเดตตามไฟล์แล้ว — ${parts}`;
  }
  const tail = extras.length ? ` (${extras.join(" · ")})` : "";
  return `นำเข้า ${res.imported} บรรทัดแล้ว${tail}`;
}

/** ชื่อบรรทัดที่จะถูกลบ (3 ชื่อแรก) สำหรับกล่องยืนยัน */
function removalNames(removals: { name: string }[]) {
  const names = removals
    .slice(0, 3)
    .map((x) => x.name)
    .join(", ");
  return removals.length > 3 ? `${names} …` : names;
}

function commitLabel(saving: boolean, syncing: boolean, actionCount: number, importCount: number) {
  if (saving) return "กำลังนำเข้า...";
  return syncing ? `อัปเดต ${actionCount} รายการ` : `นำเข้า ${importCount} บรรทัด`;
}

function skippedKindLabel(kind: string) {
  if (kind === "heading") return "หัวข้อ";
  return kind === "total" ? "ยอดรวม" : "ว่าง";
}

function rowTone(bad: boolean, unresolved: boolean, skipped: boolean) {
  if (bad) return "bg-red-50";
  if (unresolved) return "bg-amber-50/70";
  return skipped ? "text-slate-400" : "";
}

function initialDecision(r: BoqImportRow): Decision {
  let target: Target = null;
  if (r.categoryId) target = { kind: "existing", categoryId: r.categoryId };
  else if (r.newCode) target = { kind: "new", parentId: r.newCode.parentId, code: r.newCode.code };
  return { target, library: r.materialMatch ? "link" : "none" };
}

/**
 * นำเข้า BOQ จาก Excel — เลือกไฟล์ → พรีวิวรายแถว (ยังไม่เขียนอะไร) → จัดการของที่ไม่รู้จัก → ยืนยัน
 *
 * ของที่ระบบไม่รู้จัก (เลือกได้ทีละแถว):
 * - รหัสงานไม่มีในระบบ แต่หมวดย่อยแม่มี → เสนอ "สร้างรหัสใหม่" ใต้หมวดย่อยนั้น · เปลี่ยนเป็นรหัสที่มีอยู่/ไม่นำเข้าได้
 * - ไม่มีรหัส/เดาไม่ได้ → ต้องเลือกเอง (ใช้รหัสที่มี หรือสร้างใหม่ใต้หมวดย่อย)
 * - ชื่อ + หน่วยตรงกับวัสดุในคลังเป๊ะ → ติ๊ก "ผูกกับคลัง" ไว้ให้ · อื่น ๆ ติ๊ก "เพิ่มเข้าคลัง" เองได้ (ค่าเริ่มต้น = ใช้ครั้งเดียว คลังไม่รก)
 * บรรทัดที่ข้อมูลเสีย (ปริมาณ/หน่วย/ราคา) ไม่ถูกนำเข้า ให้กลับไปแก้ในไฟล์ · ราคาตามไฟล์เสมอแม้ผูกคลัง
 *
 * ไฟล์ที่ส่งออกจากโครงการนี้ (มีรหัสบรรทัดซ่อน) → โหมด "อัปเดตตามไฟล์": แถวเดิมที่ถูกแก้ = แก้บรรทัดเดิม
 * (คงรหัสงาน/คลัง/ใบถอดแบบไว้) · แถวใหม่ = เพิ่ม · บรรทัดที่หายจากไฟล์ = ลบ (ติ๊กออกได้ทีละบรรทัด)
 */
export function BoqImportDialog({
  projectId,
  existingLines,
  versionQuoted,
  categoryOptions,
  subgroupOptions,
  onClose,
  onImported,
}: Readonly<{
  projectId: string;
  existingLines: number;
  /** เวอร์ชันปัจจุบันออกใบเสนอราคาแล้ว — นำเข้าจะกลายเป็นเวอร์ชันใหม่ */
  versionQuoted: boolean;
  categoryOptions: SearchableOption[];
  /** หมวดย่อยที่สร้างรหัสงานใหม่ใต้มันได้ */
  subgroupOptions: SearchableOption[];
  onClose: () => void;
  onImported: () => void;
}>) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [preview, setPreview] = useState<BoqImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ImportMode>("append");
  // โหมดอัปเดต: บรรทัดที่หายจากไฟล์ซึ่งจะถูกลบ (ค่าเริ่มต้น = ลบทุกบรรทัด ติ๊กออกได้)
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<RowFilter>("attention");
  // แถวที่ "ต้องดู" ณ ตอนเปิดตัวกรอง — แก้เสร็จแล้วยังอยู่ในรายการ (ไม่หายไปต่อหน้า) แค่หายจากสีเหลือง/แดง
  const [attentionKeys, setAttentionKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // ตัวเลือกการอ่านไฟล์ (ชุดราคา/ชีต) — null = ตามที่ระบบเลือกให้ · เปลี่ยนแล้วอ่านไฟล์เดิมใหม่
  const [readOptions, setReadOptions] = useState<{ priceSet?: number; sheets?: string[] | null }>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function runPreview(next: File, categoryId: string, options: { priceSet?: number; sheets?: string[] | null } = readOptions) {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const pv = await previewBoqImport(projectId, next, categoryId || null, options);
      const nextDecisions = Object.fromEntries(pv.rows.map((r) => [rowKey(r), initialDecision(r)]));
      const nextMode: ImportMode = pv.sync ? "sync" : "append";
      setPreview(pv);
      setDecisions(nextDecisions);
      setMode(nextMode);
      setRemoveIds(new Set(pv.sync?.removed.map((x) => x.lineId) ?? []));
      const attention = pv.rows.filter((r) => needsAttention(r, nextDecisions[rowKey(r)], nextMode)).map(rowKey);
      setAttentionKeys(new Set(attention));
      setFilter(firstFilter(attention.length, pv.rows.some((r) => groupOf(r, nextDecisions[rowKey(r)], nextMode) === "ready")));
      // แถวที่ยังต้องเลือกรหัสเปิดตัวเลือกไว้เลย
      setEditing(new Set(pv.rows.filter((r) => r.errors.length === 0 && r.needsCategory).map(rowKey)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "อ่านไฟล์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0];
    if (!next) return;
    setFile(next);
    // ไฟล์ใหม่ = เริ่มจากที่ระบบเลือกให้ (ชื่อชีต/ชุดราคาของไฟล์ก่อนไม่เกี่ยว)
    setReadOptions({});
    void runPreview(next, defaultCategoryId, {});
  }

  function changeReadOptions(next: { priceSet?: number; sheets?: string[] | null }) {
    const merged = { ...readOptions, ...next };
    setReadOptions(merged);
    if (file) void runPreview(file, defaultCategoryId, merged);
  }

  function onDefaultCategory(id: string) {
    setDefaultCategoryId(id);
    // หมวดสำรองเปลี่ยน = บรรทัดที่ยังไม่มีรหัสได้รหัสนี้ — พรีวิวใหม่ด้วยไฟล์เดิม
    if (file) void runPreview(file, id);
  }

  function showFilter(next: RowFilter, nextMode: ImportMode = mode) {
    if (next === "attention" && preview) {
      setAttentionKeys(new Set(preview.rows.filter((r) => needsAttention(r, decisions[rowKey(r)], nextMode)).map(rowKey)));
    }
    setFilter(next);
  }

  function changeMode(next: ImportMode) {
    setMode(next);
    // โหมดเปลี่ยน = แถวที่ต้องเลือกรหัสเปลี่ยน (แถวเดิมในโหมดอัปเดตไม่ต้องเลือก) — คำนวณชุด "ต้องดู" ใหม่
    if (filter === "attention") showFilter("attention", next);
  }

  const decide = (key: string, patch: Partial<Decision>) =>
    setDecisions((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
  const setEditingRow = (key: string, on: boolean) =>
    setEditing((cur) => {
      const next = new Set(cur);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const valid = useMemo(() => preview?.rows.filter((r) => r.errors.length === 0) ?? [], [preview]);
  const syncing = mode === "sync" && !!preview?.sync;
  // โหมดอัปเดต: แถวเดิมที่ไม่เปลี่ยนไม่ต้องส่ง · แถวเดิมที่แก้ส่งไปแก้ · แถวใหม่ผ่านการเลือกรหัส/คลังตามปกติ
  const updates = syncing ? valid.filter((r) => r.sync?.status === "changed") : [];
  const candidates = syncing ? valid.filter((r) => !r.sync?.lineId) : valid;
  const importable = candidates.filter((r) => {
    const t = decisions[rowKey(r)]?.target;
    return t != null && t.kind !== "skip";
  });
  const unresolved = candidates.filter((r) => decisions[rowKey(r)]?.target == null);
  const removals = syncing ? (preview?.sync?.removed ?? []).filter((x) => removeIds.has(x.lineId)) : [];
  const actionCount = importable.length + updates.length + removals.length;
  const counts = {
    newCode: importable.filter((r) => decisions[rowKey(r)].target?.kind === "new").length,
    link: importable.filter((r) => decisions[rowKey(r)].library === "link" && r.materialMatch).length,
    add: importable.filter((r) => decisions[rowKey(r)].library === "add").length,
    skip: valid.filter((r) => decisions[rowKey(r)]?.target?.kind === "skip").length,
  };
  const directCost = importable.reduce((s, r) => s + r.lineTotal, 0);
  const groupCount: Record<RowFilter, number> = { attention: 0, ready: 0, unchanged: 0, skipped: preview?.skippedRows.length ?? 0, all: (preview?.rows.length ?? 0) + (preview?.skippedRows.length ?? 0) };
  for (const r of preview?.rows ?? []) groupCount[groupOf(r, decisions[rowKey(r)], mode)]++;
  const visibleRows =
    preview?.rows.filter((r) => inFilter(filter, attentionKeys.has(rowKey(r)), groupOf(r, decisions[rowKey(r)], mode))) ?? [];
  const newCodeRows = importable.filter((r) => decisions[rowKey(r)].target?.kind === "new" && !r.materialMatch);

  function addAllNewToLibrary() {
    setDecisions((cur) => {
      const next = { ...cur };
      for (const r of newCodeRows) next[rowKey(r)] = { ...next[rowKey(r)], library: "add" };
      return next;
    });
  }

  function skipUnresolved() {
    setDecisions((cur) => {
      const next = { ...cur };
      for (const r of unresolved) next[rowKey(r)] = { ...next[rowKey(r)], target: { kind: "skip" } };
      return next;
    });
    setEditing(new Set());
  }

  /** ถามยืนยันก่อนลบบรรทัดเดิม (บรรทัดที่หายจากไฟล์ · โหมดแทนที่ทั้งหมด) — false = ผู้ใช้ยกเลิก */
  async function confirmDestructive() {
    if (removals.length > 0) {
      const ok = await confirm(`ลบ ${removals.length} บรรทัดที่ไม่มีในไฟล์แล้วออกจากระบบ? (${removalNames(removals)})`, {
        confirmLabel: `อัปเดตและลบ ${removals.length} บรรทัด`,
        variant: "danger",
      });
      if (!ok) return false;
    }
    if (mode === "replace") {
      return confirm(`ลบบรรทัด BOQ เดิมทั้งหมด ${existingLines} บรรทัด แล้วแทนที่ด้วย ${importable.length} บรรทัดจากไฟล์?`, {
        confirmLabel: "แทนที่ทั้งหมด",
        variant: "danger",
      });
    }
    return true;
  }

  async function commit() {
    if (actionCount === 0) return;
    if (unresolved.length > 0) {
      toast.error(`ยังไม่ได้เลือกรหัสงาน ${unresolved.length} บรรทัด — เลือกให้ครบ หรือกด "ไม่นำเข้าแถวที่ยังไม่เลือก"`);
      return;
    }
    if (!(await confirmDestructive())) return;
    setSaving(true);
    try {
      const rows = importable.map((r) => commitRowOf(r, decisions[rowKey(r)]));
      const res = await commitBoqImport(projectId, {
        mode,
        rows: [...updates.map(updateRowOf), ...rows],
        ...(syncing ? { removeLineIds: removals.map((x) => x.lineId) } : {}),
      });
      toast.success(importedMessage(res, syncing));
      onImported();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "นำเข้าไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function downloadTemplate() {
    try {
      await downloadFile(`/api/projects/${projectId}/boq/import/template.xlsx`, "แม่แบบนำเข้า-BOQ.xlsx");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ดาวน์โหลดแม่แบบไม่สำเร็จ");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="ปิด"
        onClick={() => !saving && onClose()}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <dialog open
        aria-modal="true"
        aria-labelledby="boq-import-title"
        className="relative flex max-h-[90vh] w-full max-w-6xl flex-col rounded-lg bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 id="boq-import-title" className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <FileSpreadsheet size={18} className="text-[#000099]" /> นำเข้า BOQ จาก Excel
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            ใช้ไฟล์ที่กด &quot;ส่งออก Excel&quot; (ฉบับภายใน) แล้วแก้ ไฟล์ BOQ ของบริษัท หรือ{" "}
            <button type="button" onClick={downloadTemplate} className="text-[#000099] underline underline-offset-2">
              ดาวน์โหลดแม่แบบนำเข้า
            </button>{" "}
            · ราคาในไฟล์ต้องเป็นราคาทุน (ยังไม่บวกกำไร)
          </p>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <input ref={fileRef} type="file" accept=".xlsx" onChange={onPick} className="sr-only" id="boq-import-file" />
              <Button variant="neutral" onClick={() => fileRef.current?.click()} disabled={loading || saving}>
                <Upload size={14} /> {file ? "เลือกไฟล์อื่น" : "เลือกไฟล์ .xlsx"}
              </Button>
              {file && <span className="ml-2 text-sm text-slate-600">{file.name}</span>}
            </div>
            <div className="min-w-72 flex-1 text-xs text-slate-600">
              <span className="mb-1 block">รหัสงานสำรอง สำหรับแถวที่ไม่มีรหัสและระบบเดาไม่ได้ (ไม่บังคับ)</span>
              <SearchableSelect
                options={categoryOptions}
                value={defaultCategoryId}
                onChange={onDefaultCategory}
                placeholder="ไม่ใช้ — เลือกทีละแถวในตารางด้านล่าง"
                clearable
              />
            </div>
          </div>

          {loading && <p className="text-sm text-slate-500">กำลังอ่านไฟล์...</p>}
          {error && <Notice tone="red">{error}</Notice>}

          {preview && (
            <>
              {preview.sync && (
                <div className="rounded-md border border-[#000099]/20 bg-[#000099]/[0.03] px-3 py-2 text-sm text-slate-700">
                  <b className="text-[#000099]">ไฟล์นี้ส่งออกจากโครงการนี้</b> (เวอร์ชัน {preview.sync.fileVersionNo}
                  {preview.sync.fileVersionNo !== preview.sync.currentVersionNo && ` · ตอนนี้เวอร์ชัน ${preview.sync.currentVersionNo}`})
                  — เทียบกับ BOQ ปัจจุบัน: แก้ <b>{preview.sync.counts.changed}</b> · เพิ่ม <b>{preview.sync.counts.added}</b> · ไม่มีในไฟล์{" "}
                  <b>{preview.sync.counts.removed}</b> · เหมือนเดิม {preview.sync.counts.unchanged}
                </div>
              )}
              {preview.fromOtherProject && (
                <Notice tone="amber">ไฟล์นี้ส่งออกจากโครงการอื่น — นำเข้าเป็นบรรทัดใหม่ทั้งหมด (ไม่เทียบ ไม่ลบอะไร)</Notice>
              )}
              <ImportTotals
                preview={preview}
                syncing={syncing}
                updateCount={updates.length}
                importCount={importable.length}
                removeCount={removals.length}
                directCost={directCost}
                counts={counts}
                onShowSkipped={() => showFilter("skipped")}
              />
              <ReadOptionsPanel preview={preview} disabled={loading || saving} onChange={changeReadOptions} />
              {preview.headerWarnings.length > 0 && (
                <Notice tone="amber">
                  <ul className="flex flex-col gap-0.5">
                    {preview.headerWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {unresolved.length > 0 && (
                <Notice tone="amber">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>ยังไม่ได้เลือกรหัสงาน {unresolved.length} บรรทัด (แถวสีเหลือง) — เลือกในคอลัมน์ &quot;รหัสงาน&quot;</span>
                    <button type="button" onClick={skipUnresolved} className="text-xs underline underline-offset-2">
                      ไม่นำเข้าแถวที่ยังไม่เลือก
                    </button>
                  </span>
                </Notice>
              )}
              {newCodeRows.some((r) => decisions[rowKey(r)].library !== "add") && (
                <p className="text-xs text-slate-500">
                  งานใหม่ {newCodeRows.length} บรรทัดยังไม่เข้าคลังวัสดุ (ใช้ในโครงการนี้อย่างเดียว) ·{" "}
                  <button type="button" onClick={addAllNewToLibrary} className="text-[#000099] underline underline-offset-2">
                    เพิ่มงานใหม่ทั้งหมดเข้าคลัง
                  </button>
                </p>
              )}
              {preview.skippedSheets.length > 0 && (
                <Notice tone="amber">
                  ไม่ได้อ่านชีต {preview.skippedSheets.map((n) => `"${n}"`).join(", ")} เพราะไม่มีคอลัมน์ค่าวัสดุ/ค่าแรงต่อหน่วย
                </Notice>
              )}
              <FilterChips
                filter={filter}
                counts={groupCount}
                syncing={syncing}
                onChange={(f) => showFilter(f)}
              />
              {filter === "attention" && groupCount.attention === 0 && attentionKeys.size > 0 && (
                <p className="text-xs text-emerald-700">จัดการแถวที่ต้องดูครบแล้ว</p>
              )}
              {visibleRows.length > 0 ? (
                <PreviewTable
                  rows={visibleRows}
                  mode={mode}
                  multiSheet={preview.sheetNames.length > 1}
                  decisions={decisions}
                  editing={editing}
                  categoryOptions={categoryOptions}
                  subgroupOptions={subgroupOptions}
                  onDecide={decide}
                  onEditing={setEditingRow}
                />
              ) : (
                !((filter === "skipped" || filter === "all") && preview.skippedRows.length > 0) && (
                  <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">ไม่มีแถวในกลุ่มนี้</p>
                )
              )}
              {(filter === "skipped" || filter === "all") && preview.skippedRows.length > 0 && (
                <SkippedFileRows rows={preview.skippedRows} multiSheet={preview.sheetNames.length > 1} />
              )}
              {syncing && preview.sync!.removed.length > 0 && (
                <RemovedLines removed={preview.sync!.removed} removeIds={removeIds} onChange={setRemoveIds} />
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4">
          {preview && (importable.length > 0 || preview.sync) && (
            <fieldset className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
              <legend className="sr-only">วิธีนำเข้า</legend>
              {preview.sync && (
                <label className="flex items-center gap-2">
                  <input type="radio" name="import-mode" checked={mode === "sync"} onChange={() => changeMode("sync")} />
                  <span>
                    อัปเดตตามไฟล์ <span className="text-slate-400">(แนะนำ — แก้/เพิ่ม/ลบตามที่เปลี่ยนในไฟล์)</span>
                  </span>
                </label>
              )}
              <label className="flex items-center gap-2">
                <input type="radio" name="import-mode" checked={mode === "append"} onChange={() => changeMode("append")} />
                {preview.sync ? "เพิ่มทุกแถวเป็นบรรทัดใหม่" : "ต่อท้ายบรรทัดเดิม"}
                {existingLines > 0 && ` (${existingLines} บรรทัดเดิมยังอยู่)`}
              </label>
              {existingLines > 0 && (
                <label className="flex items-center gap-2">
                  <input type="radio" name="import-mode" checked={mode === "replace"} onChange={() => changeMode("replace")} />
                  <span>แทนที่บรรทัดเดิมทั้งหมด</span>
                </label>
              )}
            </fieldset>
          )}
          {preview && versionQuoted && (
            <Notice tone="amber">
              เวอร์ชันนี้ออกใบเสนอราคาไปแล้ว — การนำเข้าจะสร้างเวอร์ชันใหม่ ใบเสนอราคาที่ส่งไปแล้วไม่เปลี่ยน
            </Notice>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="brand" onClick={commit} disabled={!preview || actionCount === 0 || saving || loading}>
              {commitLabel(saving, syncing, actionCount, importable.length)}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

/** แถบตัวเลขสรุปเหนือตาราง — จะแก้/เพิ่ม/ลบกี่บรรทัด สร้างรหัสใหม่ ผูกคลัง และอ่านจากชีตไหน */
function ImportTotals({
  preview,
  syncing,
  updateCount,
  importCount,
  removeCount,
  directCost,
  counts,
  onShowSkipped,
}: Readonly<{
  preview: BoqImportPreview;
  syncing: boolean;
  updateCount: number;
  importCount: number;
  removeCount: number;
  directCost: number;
  counts: { newCode: number; link: number; add: number; skip: number };
  onShowSkipped: () => void;
}>) {
  const sheets = preview.sheetNames;
  const sheetNote = sheets.length === 1 ? `จากชีต "${sheets[0]}"` : `จาก ${sheets.length} ชีต (${sheets.join(", ")})`;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-slate-700">
      {syncing ? (
        <span>
          จะแก้ <b className="text-amber-700">{updateCount}</b> · เพิ่ม <b className="text-emerald-700">{importCount}</b>{" "}
          · ลบ <b className="text-red-600">{removeCount}</b> บรรทัด
        </span>
      ) : (
        <span>
          พร้อมนำเข้า <b className="text-emerald-700">{importCount}</b> บรรทัด · ต้นทุนตรงรวม{" "}
          <b>{money(directCost)}</b> บาท
        </span>
      )}
      {counts.newCode > 0 && <span className="text-[#000099]">สร้างรหัสงานใหม่ {counts.newCode}</span>}
      {counts.link > 0 && <span className="text-slate-600">ผูกคลัง {counts.link}</span>}
      {counts.add > 0 && <span className="text-slate-600">เพิ่มเข้าคลัง {counts.add}</span>}
      {counts.skip > 0 && <span className="text-slate-500">ไม่นำเข้า {counts.skip}</span>}
      {preview.summary.withErrors > 0 && (
        <span className="text-red-600">ข้อมูลมีปัญหา {preview.summary.withErrors} (จะไม่ถูกนำเข้า)</span>
      )}
      {preview.skippedRows.length > 0 && (
        <button type="button" onClick={onShowSkipped} className="link-pill -mx-2.5 -my-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
          ข้ามหัวข้อ/ยอดรวม/รายการว่าง {preview.skippedRows.length} แถว
        </button>
      )}
      <span className="text-slate-400">{sheetNote}</span>
    </div>
  );
}

/** บรรทัดที่หายจากไฟล์ (โหมดอัปเดต) — ค่าเริ่มต้นลบทุกบรรทัด ติ๊กออกเพื่อเก็บไว้ */
function RemovedLines({
  removed,
  removeIds,
  onChange,
}: Readonly<{
  removed: NonNullable<BoqImportPreview["sync"]>["removed"];
  removeIds: Set<string>;
  onChange: (update: (cur: Set<string>) => Set<string>) => void;
}>) {
  return (
    <div className="shrink-0 rounded-md border border-red-200">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-red-100 bg-red-50/60 px-3 py-2 text-sm">
        <span className="font-medium text-red-800">บรรทัดที่ไม่มีในไฟล์แล้ว {removed.length} บรรทัด — จะลบออกจากระบบ</span>
        <span className="text-xs text-slate-500">ติ๊กออกถ้าต้องการเก็บไว้</span>
      </div>
      <ul className="divide-y divide-slate-100 text-sm">
        {removed.map((x) => (
          <li key={x.lineId}>
            <label className="flex items-center gap-2 px-3 py-1.5">
              <input
                type="checkbox"
                className="accent-red-600"
                checked={removeIds.has(x.lineId)}
                onChange={(e) =>
                  onChange((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(x.lineId);
                    else next.delete(x.lineId);
                    return next;
                  })
                }
              />
              <span className="w-20 shrink-0 text-xs text-slate-400">{x.code ?? "—"}</span>
              <span className={`flex-1 ${removeIds.has(x.lineId) ? "text-red-700 line-through" : "text-slate-700"}`}>{x.name}</span>
              <span className="whitespace-nowrap tabular-nums text-slate-500">
                {qty(x.quantity)} {x.unit}
              </span>
              <span className="w-28 text-right tabular-nums text-slate-600">{money(x.lineTotal)}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ช่องรหัสงานของแถว: บรรทัดเดิม = ป้ายรหัส · ข้อมูลเสีย = รหัสในไฟล์ · นอกนั้นเลือกได้ */
function RowTargetCell({
  row,
  existingLine,
  bad,
  ...cell
}: Readonly<
  {
    row: BoqImportRow;
    existingLine: boolean;
    bad: boolean;
  } & Omit<Parameters<typeof TargetCell>[0], "row">
>) {
  if (existingLine) {
    return <CodeLabel label={cell.categoryOptions.find((o) => o.value === row.categoryId)?.label ?? row.categoryName ?? row.code ?? "—"} />;
  }
  if (bad) return <span className="text-slate-500">{row.code ?? "—"}</span>;
  return <TargetCell row={row} {...cell} />;
}

function PreviewTable({
  rows,
  mode,
  multiSheet,
  decisions,
  editing,
  categoryOptions,
  subgroupOptions,
  onDecide,
  onEditing,
}: Readonly<{
  rows: BoqImportRow[];
  mode: ImportMode;
  multiSheet: boolean;
  decisions: Record<string, Decision>;
  editing: Set<string>;
  categoryOptions: SearchableOption[];
  subgroupOptions: SearchableOption[];
  onDecide: (key: string, patch: Partial<Decision>) => void;
  onEditing: (key: string, on: boolean) => void;
}>) {
  return (
    <div className="shrink-0 overflow-x-auto rounded-md border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left text-xs text-slate-600">
          <tr>
            <th className="px-2 py-1.5">แถว</th>
            <th className="w-56 px-2 py-1.5">รหัสงาน</th>
            <th className="px-2 py-1.5">รายการ</th>
            <th className="px-2 py-1.5 text-right">ปริมาณ</th>
            <th className="px-2 py-1.5 text-right">ค่าวัสดุ/หน่วย</th>
            <th className="px-2 py-1.5 text-right">ค่าแรง/หน่วย</th>
            <th className="px-2 py-1.5 text-right">รวม</th>
            <th className="px-2 py-1.5">คลังวัสดุ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = rowKey(r);
            const bad = r.errors.length > 0;
            const d = decisions[key];
            const existingLine = isExistingLine(r, mode);
            const unresolved = !bad && !existingLine && d?.target == null;
            const skipped = !existingLine && d?.target?.kind === "skip";
            const status = mode === "sync" ? r.sync?.status : null;
            return (
              <tr
                key={key}
                className={`border-t border-slate-100 align-top ${rowTone(bad, unresolved, skipped)}`}
              >
                <td className="px-2 py-1.5 tabular-nums text-slate-400">
                  {multiSheet && <span className="block whitespace-nowrap text-[11px]">{r.sheet}</span>}
                  {r.rowNumber}
                  {status && status !== "error" && <SyncBadge status={status} />}
                </td>
                <td className="px-2 py-1.5 text-xs">
                  <RowTargetCell
                    row={r}
                    existingLine={existingLine}
                    bad={bad}
                    decision={d}
                    editing={editing.has(key)}
                    categoryOptions={categoryOptions}
                    subgroupOptions={subgroupOptions}
                    onDecide={(patch) => onDecide(key, patch)}
                    onEditing={(on) => onEditing(key, on)}
                  />
                </td>
                <td className={`px-2 py-1.5 ${skipped ? "line-through" : "text-slate-800"}`}>
                  {r.name}
                  {mode === "sync" && r.sync && r.sync.changes.length > 0 && (
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {r.sync.changes.map((c, i) => (
                        <span key={c.field}>
                          {i > 0 && " · "}
                          {FIELD_LABEL[c.field]} <span className="text-slate-400 line-through">{showValue(c.before)}</span> →{" "}
                          <b className="font-medium text-amber-800">{showValue(c.after)}</b>
                        </span>
                      ))}
                    </span>
                  )}
                  {r.errors.map((e) => (
                    <span key={e} className="mt-0.5 flex items-start gap-1 text-xs text-red-700">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {e}
                    </span>
                  ))}
                  {r.warnings.map((w) => (
                    <span key={w} className="mt-0.5 block text-xs text-amber-700">
                      {w}
                    </span>
                  ))}
                </td>
                <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                  {qty(r.quantity)} {r.unit}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(r.materialUnitPrice)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(r.laborUnitPrice)}</td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">{bad ? "—" : money(r.lineTotal)}</td>
                <td className="px-2 py-1.5 text-xs">
                  {!bad && !skipped && !existingLine && d && (
                    <LibraryCell row={r} choice={d.library} onChange={(library) => onDecide(key, { library })} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** รหัสงานแบบสั้น — ชื่อเต็ม (ทั้งสายหมวด) ดูได้จาก tooltip */
function CodeLabel({ label }: Readonly<{ label: string }>) {
  return (
    <span className="font-medium text-slate-700" title={label}>
      {shortLabel(label)}
    </span>
  );
}

function FilterChips({
  filter,
  counts,
  syncing,
  onChange,
}: Readonly<{ filter: RowFilter; counts: Record<RowFilter, number>; syncing: boolean; onChange: (f: RowFilter) => void }>) {
  const chips: [RowFilter, string][] = [
    ["attention", "ต้องดู"],
    ["ready", syncing ? "จะแก้/เพิ่ม" : "พร้อมนำเข้า"],
    ...(syncing ? ([["unchanged", "ไม่เปลี่ยน"]] as [RowFilter, string][]) : []),
    ["skipped", "ข้าม"],
    ["all", "ทั้งหมด"],
  ];
  return (
    <fieldset aria-label="กรองแถว" className="min-w-0 flex flex-wrap items-center gap-1.5 text-xs">
      {chips
        .filter(([key]) => counts[key] > 0 || key === filter || key === "all")
        .map(([key, label]) => {
          const active = key === filter;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(key)}
              className={`rounded-full border px-2.5 py-1 ${
                active ? "border-[#000099]/30 bg-[#000099]/10 font-medium text-[#000099]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}{" "}
              <span className={`tabular-nums ${key === "attention" && counts.attention > 0 && !active ? "font-semibold text-amber-700" : ""}`}>
                {counts[key]}
              </span>
            </button>
          );
        })}
    </fieldset>
  );
}

/** หัวข้อกลุ่ม/ยอดรวมในไฟล์ที่ระบบข้าม — ให้เห็นว่าข้ามอะไร ถ้ามีงานจริงหลุดมาจะได้กลับไปเติมในไฟล์ */
function SkippedFileRows({ rows, multiSheet }: Readonly<{ rows: BoqImportPreview["skippedRows"]; multiSheet: boolean }>) {
  return (
    <div className="shrink-0 rounded-md border border-slate-200">
      <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        หัวข้อกลุ่มและยอดรวมในไฟล์ — ไม่ใช่บรรทัดงาน จึงไม่นำเข้า · ถ้าเป็นงานจริง ให้เติมปริมาณ หน่วย และราคาในไฟล์แล้วเลือกไฟล์ใหม่
      </p>
      <ul className="divide-y divide-slate-100 text-sm">
        {rows.map((x) => (
          <li key={`${x.sheet}:${x.rowNumber}`} className="flex items-baseline gap-3 px-3 py-1.5">
            <span className="w-16 shrink-0 tabular-nums text-xs text-slate-400">
              {multiSheet && <span className="block whitespace-nowrap text-[11px]">{x.sheet}</span>}
              แถว {x.rowNumber}
            </span>
            <span className="w-14 shrink-0 text-xs text-slate-500">{skippedKindLabel(x.kind)}</span>
            <span className="text-slate-700">
              {x.code && <span className="mr-1.5 text-slate-400">{x.code}</span>}
              {x.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ป้ายสถานะของแถวในโหมดอัปเดตตามไฟล์ */
function SyncBadge({ status }: Readonly<{ status: "changed" | "unchanged" | "added" }>) {
  const style = {
    changed: ["แก้", "bg-amber-100 text-amber-800"],
    added: ["เพิ่ม", "bg-emerald-100 text-emerald-800"],
    unchanged: ["เดิม", "bg-slate-100 text-slate-500"],
  }[status];
  return <span className={`mt-0.5 block w-fit rounded px-1 text-[11px] font-medium ${style[1]}`}>{style[0]}</span>;
}

/** ช่อง "รหัสงาน": แสดงที่ระบบเลือก/เสนอ + เปลี่ยนได้ (ใช้รหัสที่มี · สร้างใหม่ใต้หมวดย่อย · ไม่นำเข้า) */
function TargetCell({
  row,
  decision,
  editing,
  categoryOptions,
  subgroupOptions,
  onDecide,
  onEditing,
}: Readonly<{
  row: BoqImportRow;
  decision: Decision | undefined;
  editing: boolean;
  categoryOptions: SearchableOption[];
  subgroupOptions: SearchableOption[];
  onDecide: (patch: Partial<Decision>) => void;
  onEditing: (on: boolean) => void;
}>) {
  const t = decision?.target ?? null;
  // บอกใบ้หมวดบนสุดจากรหัสในไฟล์ (เช่น B) — เอาตัวเลือกในหมวดนั้นขึ้นก่อน
  const hintCode = row.hintTop?.label.split(" ")[0];
  const sortByHint = (options: SearchableOption[]) =>
    hintCode ? [...options].sort((a, b) => Number(!a.label.startsWith(`${hintCode}-`)) - Number(!b.label.startsWith(`${hintCode}-`))) : options;
  const [mode, setMode] = useState<"existing" | "new">(t?.kind === "new" || (!t && row.newCode) ? "new" : "existing");

  const summary = <TargetSummary row={row} target={t} categoryOptions={categoryOptions} subgroupOptions={subgroupOptions} />;

  if (!editing) {
    return (
      <div className="space-y-0.5">
        <div className="leading-snug">{summary}</div>
        <button type="button" onClick={() => onEditing(true)} className="text-[11px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">
          เปลี่ยน
        </button>
      </div>
    );
  }

  const tab = (value: "existing" | "new", label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`rounded px-2 py-0.5 ${mode === value ? "bg-[#000099]/10 font-medium text-[#000099]" : "text-slate-500 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-1.5">
      <div className="leading-snug">{summary}</div>
      <div className="flex flex-wrap items-center gap-1">
        {tab("existing", "ใช้รหัสที่มี")}
        {tab("new", "สร้างรหัสใหม่")}
        <button
          type="button"
          onClick={() => {
            onDecide({ target: { kind: "skip" } });
            onEditing(false);
          }}
          className="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100"
        >
          ไม่นำเข้า
        </button>
      </div>
      {mode === "existing" ? (
        <SearchableSelect
          options={sortByHint(categoryOptions)}
          value={t?.kind === "existing" ? t.categoryId : ""}
          onChange={(id) => {
            if (!id) return;
            onDecide({ target: { kind: "existing", categoryId: id } });
            onEditing(false);
          }}
          placeholder="พิมพ์รหัส/ชื่องาน"
        />
      ) : (
        <SearchableSelect
          options={sortByHint(subgroupOptions)}
          value={t?.kind === "new" ? t.parentId : ""}
          onChange={(id) => {
            if (!id) return;
            // หมวดย่อยเดียวกับที่ระบบเสนอ = ใช้รหัสจากไฟล์ · หมวดย่อยอื่น = ให้ระบบต่อเลขรหัสให้
            const code = row.newCode?.parentId === id ? row.newCode.code : null;
            onDecide({ target: { kind: "new", parentId: id, code } });
            onEditing(false);
          }}
          placeholder="สร้างใต้หมวดย่อย..."
        />
      )}
    </div>
  );
}

const labelOf = (options: SearchableOption[], id: string) => options.find((o) => o.value === id)?.label ?? id;

/** ข้อความสรุปว่าแถวนี้จะลงรหัสงานไหน */
function TargetSummary({
  row,
  target: t,
  categoryOptions,
  subgroupOptions,
}: Readonly<{ row: BoqImportRow; target: Target; categoryOptions: SearchableOption[]; subgroupOptions: SearchableOption[] }>) {
  if (t?.kind === "existing") return <CodeLabel label={labelOf(categoryOptions, t.categoryId)} />;
  if (t?.kind === "new") {
    const fromFile = row.newCode?.parentId === t.parentId ? row.newCode.parentLabel : t.parentId;
    const parentLabel = subgroupOptions.find((o) => o.value === t.parentId)?.label ?? fromFile;
    return (
      <span title={`สร้างรหัสงานใหม่ใต้ ${parentLabel}`}>
        <span className="mr-1 rounded bg-[#000099]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#000099]">ใหม่</span>
        <span className="font-medium text-slate-700">{t.code ?? "รหัสถัดไป"}</span>
        <span className="text-slate-500"> ใต้ {shortLabel(parentLabel)}</span>
      </span>
    );
  }
  if (t?.kind === "skip") return <span className="text-slate-500">ไม่นำเข้า</span>;
  const hint = row.hintTop ? ` (รหัสในไฟล์อยู่หมวด ${row.hintTop.label})` : "";
  return <span className="font-medium text-amber-800">ยังไม่ได้เลือกรหัสงาน{hint}</span>;
}

/** ช่อง "คลังวัสดุ": ชื่อตรงคลัง = ผูก (ติ๊กไว้ให้) · ไม่ตรง = เพิ่มเข้าคลังได้ถ้าต้องการ */
function LibraryCell({
  row,
  choice,
  onChange,
}: Readonly<{ row: BoqImportRow; choice: LibraryChoice; onChange: (c: LibraryChoice) => void }>) {
  if (row.materialMatch) {
    return (
      <label className="flex items-center gap-1.5 whitespace-nowrap text-slate-600" title={`ชื่อ+หน่วยตรงกับวัสดุในคลัง: ${row.materialMatch.name}`}>
        <input type="checkbox" className="accent-emerald-700" checked={choice === "link"} onChange={(e) => onChange(e.target.checked ? "link" : "none")} />
        {choice === "link" ? (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">✓ {row.materialMatch.code ?? "ในคลัง"}</span>
        ) : (
          <span>ผูกกับ {row.materialMatch.code ?? "วัสดุในคลัง"}</span>
        )}
      </label>
    );
  }
  return (
    <label className="flex items-start gap-1.5 whitespace-nowrap text-slate-600">
      <input type="checkbox" className="mt-0.5 accent-[#000099]" checked={choice === "add"} onChange={(e) => onChange(e.target.checked ? "add" : "none")} />
      <span>เพิ่มเข้าคลัง</span>
    </label>
  );
}

/**
 * อ่านอะไรจากไฟล์ — ชีต (ระบบไม่ติ๊กชีตสรุป/ชีตสำรองให้ บอกเหตุผล) และชุดราคา (ไฟล์บริษัทมีสองชุดข้างกัน)
 * แสดงเฉพาะเมื่อมีให้เลือกจริง · เปลี่ยนแล้วอ่านไฟล์เดิมใหม่ การเลือกรหัสในตารางเริ่มใหม่
 */
function ReadOptionsPanel({
  preview,
  disabled,
  onChange,
}: Readonly<{
  preview: BoqImportPreview;
  disabled: boolean;
  onChange: (next: { priceSet?: number; sheets?: string[] | null }) => void;
}>) {
  const multiSheet = preview.sheets.length > 1;
  const multiPrice = preview.priceSets.length > 1;
  if (!multiSheet && !multiPrice) return null;
  const selected = preview.sheets.filter((x) => x.selected).map((x) => x.name);
  const toggle = (name: string, on: boolean) => {
    const next = on ? [...selected, name] : selected.filter((n) => n !== name);
    // คงลำดับตามไฟล์
    onChange({ sheets: preview.sheets.map((x) => x.name).filter((n) => next.includes(n)) });
  };
  return (
    <div className="grid gap-3 rounded-md border border-slate-200 px-3 py-2.5 text-sm sm:grid-cols-2">
      {multiSheet && (
        <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-medium text-slate-600">อ่านจากชีต</legend>
          <div className="flex flex-col gap-1">
            {preview.sheets.map((x) => (
              <label key={x.name} className="flex items-start gap-2 text-slate-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={x.selected}
                  disabled={disabled || (x.selected && selected.length === 1)}
                  onChange={(e) => toggle(x.name, e.target.checked)}
                />
                <span className="min-w-0">
                  {x.name.trim()} <span className="text-xs text-slate-400">· {x.rows} บรรทัด</span>
                  {x.reason && <span className="block text-xs text-slate-500">ระบบไม่ได้เลือกให้: {x.reason}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {multiPrice && (
        <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-medium text-slate-600">ใช้ราคาชุดไหน</legend>
          <div className="flex flex-col gap-1">
            {preview.priceSets.map((x) => (
              <label key={x.index} className="flex items-center gap-2 text-slate-700">
                <input
                  type="radio"
                  name="boq-import-price-set"
                  checked={preview.priceSet === x.index}
                  disabled={disabled}
                  onChange={() => onChange({ priceSet: x.index })}
                />
                {x.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            ไฟล์ BOQ บริษัท: ชุดซ้าย = ราคาที่ทำใบเสนอราคา (บวกกำไรแล้วได้ยอดเดิม) · “ต้นทุน” = ต้นทุนคุมงบ
          </p>
        </fieldset>
      )}
      <p className="text-xs text-slate-400 sm:col-span-2">เปลี่ยนชีตหรือชุดราคาแล้ว ระบบอ่านไฟล์ใหม่ — การเลือกรหัสงานในตารางจะเริ่มใหม่</p>
    </div>
  );
}
