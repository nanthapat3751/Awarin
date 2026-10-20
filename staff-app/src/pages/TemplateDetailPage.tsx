import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import type { TemplateDetailDto, TemplateItemDetailDto } from "@systemboq/shared-types";

import { Check, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Pencil, X } from "lucide-react";

import { Button, buttonClasses, iconButtonClasses } from "../components/Button";
import { Layout } from "../components/Layout";
import { Pagination } from "../components/Pagination";
import { ScrollableTabBar } from "../components/ScrollableTabBar";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import { useToast } from "../lib/toast-context";
import type { QtyBasis } from "../lib/boq-api";
import { createProject } from "../lib/projects-api";
import {
  applyTemplateToProject,
  getTemplate,
  updateTemplate,
  updateTemplateItemRecipe,
} from "../lib/templates-api";
import { DetailSkeleton } from "../components/Skeleton";

function money(value: string | number): string {
  return Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH");
}

// ป้ายกำกับฐานคำนวณถอดปริมาณ — MANUAL ไม่มี (ใช้จำนวนตายตัว); ฐานอื่นคิดปริมาณตามค่าวัดโครงการ
const BASIS_META: Record<string, { label: string; per: string } | undefined> = {
  PER_AREA: { label: "ต่อพื้นที่พื้น", per: "ตร.ม." },
  PER_WALL_AREA: { label: "ต่อพื้นที่ผนัง", per: "ตร.ม.ผนัง" },
  PER_PERIMETER: { label: "ต่อความยาวรอบรูป", per: "ม." },
  PER_VOLUME: { label: "ต่อปริมาตร", per: "ลบ.ม." },
  PER_FOOTPRINT: { label: "ต่อพื้นที่ตั้งอาคาร", per: "ตร.ม.ตั้งอาคาร" },
  PER_BATHROOM: { label: "ต่อห้องน้ำ", per: "ห้อง" },
  PER_FLOOR: { label: "ต่อชั้น", per: "ชั้น" },
};

function coeffText(value: string | null): string {
  return value != null ? Number(value).toLocaleString("th-TH") : "—";
}

// ฐานคำนวณที่เลือกได้ตอนแก้สูตรของบรรทัด + ป้ายช่องสัมประสิทธิ์ตามตัวขับ
const EDIT_BASES: { value: string; label: string; perLabel: string }[] = [
  { value: "MANUAL", label: "กรอกเอง", perLabel: "" },
  { value: "PER_AREA", label: "ต่อพื้นที่พื้น (× ตร.ม.)", perLabel: "ปริมาณต่อ 1 ตร.ม.พื้น" },
  { value: "PER_WALL_AREA", label: "ต่อพื้นที่ผนัง (× ตร.ม.)", perLabel: "ปริมาณต่อ 1 ตร.ม.ผนัง" },
  { value: "PER_PERIMETER", label: "ต่อความยาวรอบรูป (× ม.)", perLabel: "ปริมาณต่อ 1 เมตร" },
  { value: "PER_VOLUME", label: "ต่อปริมาตร (× ลบ.ม.)", perLabel: "ปริมาณต่อ 1 ลบ.ม." },
  { value: "PER_FOOTPRINT", label: "ต่อพื้นที่ตั้งอาคาร (× ตร.ม.)", perLabel: "ปริมาณต่อ 1 ตร.ม.ตั้งอาคาร" },
  { value: "PER_BATHROOM", label: "ต่อห้องน้ำ (× ห้อง)", perLabel: "ปริมาณต่อ 1 ห้องน้ำ" },
  { value: "PER_FLOOR", label: "ต่อชั้น (× ชั้น)", perLabel: "ปริมาณต่อ 1 ชั้น" },
];

interface CategoryGroup {
  code: string | null;
  name: string;
  items: TemplateItemDetailDto[];
}

interface SubRun {
  key: string;
  name: string | null;
  items: TemplateItemDetailDto[];
  /** ก้อนนี้เริ่มมาจากหน้าก่อน (หมวดย่อยถูกตัดข้ามหน้า) — หัวก้อนขึ้น "(ต่อ)" */
  continued?: boolean;
}

/** หมวดเดียวแบ่งหน้าละ 15 รายการ เท่าทุกตารางในระบบ (แท็บหมวด + เลขหน้า แบบหน้าหมวดงาน) */
const ITEMS_PAGE_SIZE = 15;

const groupKeyOf = (group: CategoryGroup) => group.code ?? group.name;

/** "หมวดงานโครงสร้าง" → "โครงสร้าง" — ชื่อเต็มยาวเกินสำหรับแท็บ (ชื่อเต็มอยู่ใน title) */
const shortName = (name: string) => name.replace(/^หมวดงาน\s*/, "");

// แบ่งบรรทัดในหมวดใหญ่ออกเป็นช่วงตามหมวดย่อย โดยไม่จัดเรียงใหม่ (ขึ้นแถบใหม่เมื่อหมวดย่อยเปลี่ยน)
function subRunsOf(group: CategoryGroup): SubRun[] {
  const runs: SubRun[] = [];
  for (const item of group.items) {
    const name = item.subCategoryName;
    const last = runs.at(-1);
    if (last && last.name === name) last.items.push(item);
    else
      runs.push({
        key: `${groupKeyOf(group)}|${item.subCategoryCode ?? name ?? "-"}|${runs.length}`,
        name,
        items: [item],
      });
  }
  return runs;
}

/**
 * ก้อนหมวดย่อยเฉพาะช่วงบรรทัด [from, to) ของหน้าปัจจุบัน — คิดก้อนจากทั้งหมวดก่อนแล้วค่อยตัด
 * key ของก้อนจึงคงเดิมทุกหน้า (ยุบก้อนไว้แล้วเปลี่ยนหน้า ก้อนเดียวกันยังยุบอยู่)
 */
function pageRunsOf(group: CategoryGroup, from: number, to: number): SubRun[] {
  const out: SubRun[] = [];
  let offset = 0;
  for (const run of subRunsOf(group)) {
    const start = offset;
    const end = offset + run.items.length;
    offset = end;
    if (end <= from || start >= to) continue;
    out.push({
      ...run,
      items: run.items.slice(Math.max(0, from - start), Math.min(run.items.length, to - start)),
      continued: start < from,
    });
  }
  return out;
}

/** แก้ไขเมื่อ ≠ สร้างเมื่อ (เผื่อเวลาบันทึกห่างกันเสี้ยววินาทีตอนสร้าง) */
function wasEdited(detail: TemplateDetailDto): boolean {
  return new Date(detail.updatedAt).getTime() - new Date(detail.createdAt).getTime() > 1000;
}

function TemplateMetaEditor({
  name,
  description,
  saving,
  onName,
  onDescription,
  onSave,
  onCancel,
}: Readonly<{
  name: string;
  description: string;
  saving: boolean;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}>) {
  return (
    <div className="mt-3 mb-4 flex flex-col gap-2 border border-slate-200 rounded-lg p-3 bg-white max-w-xl">
      <label className="flex flex-col gap-1 text-xs text-slate-700">
        <span>ชื่อแม่แบบ</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => onName(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-700">
        คำอธิบาย <span className="text-slate-400">(ไม่บังคับ — ใช้กับงานแบบไหน)</span>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          className="border border-slate-300 rounded-md px-2 py-1 text-sm resize-y"
        />
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving || !name.trim()}>
          <Check size={14} /> บันทึก
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X size={14} /> ยกเลิก
        </Button>
      </div>
    </div>
  );
}

function TemplateTitle({
  detail,
  onEdit,
  onToggleCreate,
}: Readonly<{ detail: TemplateDetailDto; onEdit: () => void; onToggleCreate: () => void }>) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3 mt-3 mb-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold text-slate-800">{detail.name}</h1>
        {detail.description && (
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">{detail.description}</p>
        )}
        <p className="text-sm text-slate-500 mt-1">
          {detail.itemCount} รายการ · บันทึกเมื่อ {formatDate(detail.createdAt)}
          {wasEdited(detail) && <> · แก้ไขล่าสุด {formatDate(detail.updatedAt)}</>}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil size={14} /> แก้ไข
        </Button>
        <Button size="sm" onClick={onToggleCreate}>
          + สร้างโครงการจากแม่แบบนี้
        </Button>
      </div>
    </div>
  );
}

function CreateFromTemplateForm({
  name,
  creating,
  onName,
  onCreate,
  onCancel,
}: Readonly<{
  name: string;
  creating: boolean;
  onName: (value: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}>) {
  return (
    <div className="mb-4 flex items-center gap-2 border border-slate-200 rounded-lg p-3 bg-white max-w-xl">
      <input
        autoFocus
        placeholder="ชื่อโครงการใหม่"
        value={name}
        onChange={(e) => onName(e.target.value)}
        className="border border-slate-300 rounded-md px-2 py-1 text-sm flex-1"
      />
      <Button size="sm" onClick={onCreate} disabled={creating || !name.trim()}>
        สร้าง
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        ยกเลิก
      </Button>
    </div>
  );
}

function TakeoffBanner() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-slate-700">
      <span className="mt-0.5 shrink-0 rounded-md bg-brand px-1.5 py-0.5 text-xs font-medium text-white">
        ถอดปริมาณอัตโนมัติ
      </span>
      <span>
        แม่แบบนี้มีรายการที่ผูกกับค่าวัดโครงการ — เมื่อสร้างโครงการจากแม่แบบแล้วกรอกพื้นที่/ค่าวัด
        ระบบจะ<strong>คิดปริมาณและราคาให้ใหม่ตามขนาดจริง</strong>โดยอัตโนมัติ (ตัวเลขด้านล่างเป็นสูตร ไม่ใช่จำนวนตายตัว)
      </span>
    </div>
  );
}

function FoldAllButton({ collapsed, onToggle }: Readonly<{ collapsed: boolean; onToggle: () => void }>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      aria-label={collapsed ? "กางกลุ่มย่อยทั้งหมด" : "ยุบกลุ่มย่อยทั้งหมด"}
      className="shrink-0 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand"
    >
      {collapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
      {collapsed ? "กางทั้งหมด" : "ยุบทั้งหมด"}
    </Button>
  );
}

function GroupTab({
  group,
  selected,
  count,
  disabled,
  onOpen,
}: Readonly<{ group: CategoryGroup; selected: boolean; count: number; disabled: boolean; onOpen: () => void }>) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      title={group.name}
      disabled={disabled}
      onClick={onOpen}
      className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-40 ${
        selected
          ? "border-brand font-medium text-brand"
          : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
      }`}
    >
      {group.code && (
        <span className={`font-mono text-xs ${selected ? "text-brand" : "text-slate-400"}`}>
          {group.code}
        </span>
      )}
      {shortName(group.name)}
      <span
        className={`rounded-full px-1.5 text-xs tabular-nums ${
          selected ? "bg-brand/10 text-brand" : "bg-slate-200/70 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/** ช่องจำนวน — บรรทัดที่ผูกค่าวัดโชว์สูตร (ปริมาณต่อหน่วยตัวขับ + เผื่อเสีย) แทนจำนวนตายตัว */
function QuantityCell({ item }: Readonly<{ item: TemplateItemDetailDto }>) {
  const basis = BASIS_META[item.qtyBasis];
  if (!basis) return <>{Number(item.quantity).toLocaleString("th-TH")}</>;
  const hasWaste = item.wasteFactorPct != null && Number(item.wasteFactorPct) > 0;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-medium text-brand">
        {coeffText(item.qtyCoefficient)}
        <span className="text-slate-500">
          {" "}
          /{basis.per}
        </span>
      </span>
      <span className="text-xs text-slate-500">
        {basis.label}
        {hasWaste && ` · เผื่อ ${coeffText(item.wasteFactorPct)}%`}
      </span>
    </span>
  );
}

function ItemRow({ item, onEdit }: Readonly<{ item: TemplateItemDetailDto; onEdit: () => void }>) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">
        {item.categoryCode ?? "—"}
      </td>
      <td className="px-4 py-2 text-slate-800">
        {item.name}
        {/* iPad: หมายเหตุอยู่ใต้ชื่อ (คอลัมน์ของมันซ่อนไว้) */}
        {item.note && <span className="block text-xs text-slate-500 xl:hidden">{item.note}</span>}
      </td>
      <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
        <QuantityCell item={item} />
        <span className="text-slate-600 xl:hidden"> {item.unit}</span>
      </td>
      <td className="hidden xl:table-cell px-4 py-2 text-slate-700">{item.unit}</td>
      <td className="px-4 py-2 text-right text-slate-800 whitespace-nowrap">
        {money(item.materialUnitPrice)}
        <span className="block text-xs text-slate-500 xl:hidden">แรง {money(item.laborUnitPrice)}</span>
      </td>
      <td className="hidden xl:table-cell px-4 py-2 text-right text-slate-800 whitespace-nowrap">
        {money(item.laborUnitPrice)}
      </td>
      <td className="hidden xl:table-cell px-4 py-2 text-slate-500">{item.note ?? ""}</td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={onEdit}
          className={iconButtonClasses()}
          title="แก้สูตรถอดปริมาณ"
        >
          <Pencil size={14} />
        </button>
      </td>
    </tr>
  );
}

interface RecipeForm {
  basis: string;
  quantity: string;
  coefficient: string;
  waste: string;
  saving: boolean;
  setBasis: (value: string) => void;
  setQuantity: (value: string) => void;
  setCoefficient: (value: string) => void;
  setWaste: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/** แถวแก้สูตรถอดปริมาณ — กางใต้บรรทัดที่กำลังแก้ */
function RecipeEditorRow({ form }: Readonly<{ form: RecipeForm }>) {
  return (
    <tr className="bg-brand/5 border-b border-slate-100">
      <td colSpan={8} className="px-4 py-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ฐานคำนวณปริมาณ</span>
            <select
              value={form.basis}
              onChange={(e) => form.setBasis(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            >
              {EDIT_BASES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          {form.basis === "MANUAL" ? (
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>จำนวน</span>
              <input
                type="number"
                value={form.quantity}
                onChange={(e) => form.setQuantity(e.target.value)}
                className="w-32 border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                {EDIT_BASES.find((b) => b.value === form.basis)?.perLabel}
                <input
                  type="number"
                  step="0.0001"
                  value={form.coefficient}
                  onChange={(e) => form.setCoefficient(e.target.value)}
                  className="w-32 border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>เผื่อเสีย (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.waste}
                  onChange={(e) => form.setWaste(e.target.value)}
                  className="w-24 border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
            </>
          )}
          <Button size="sm" onClick={form.onSave} disabled={form.saving}>
            <Check size={14} /> บันทึก
          </Button>
          <Button variant="ghost" size="sm" onClick={form.onCancel}>
            <X size={14} /> ยกเลิก
          </Button>
        </div>
      </td>
    </tr>
  );
}

/** แถบคั่นหมวดย่อย — กดยุบเฉพาะก้อนนี้ได้ ไม่ต้องยุบทั้งหมวดใหญ่ */
function SubRunHeader({ run, collapsed, onToggle }: Readonly<{ run: SubRun; collapsed: boolean; onToggle: () => void }>) {
  return (
    <tr>
      <td colSpan={8} className="px-4 pt-3 pb-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-2 text-left"
        >
          <span className="w-3 shrink-0 text-xs text-slate-500">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="text-xs font-medium text-slate-500">
            {run.name}
            {run.continued && <span className="font-normal text-slate-400"> (ต่อ)</span>}
          </span>
          <span className="shrink-0 text-xs text-slate-400">
            ({run.items.length} รายการ)
          </span>
          <span className="h-px flex-1 bg-slate-200" />
        </button>
      </td>
    </tr>
  );
}

function GroupSection({
  group,
  range,
  searching,
  collapsedSubs,
  editIndex,
  recipeForm,
  onToggleSub,
  onEditItem,
}: Readonly<{
  group: CategoryGroup;
  /** ช่วงบรรทัดของหน้าที่เปิดอยู่ · null = ทั้งหมวด (ตอนค้นหา) */
  range: { from: number; to: number } | null;
  searching: boolean;
  collapsedSubs: Set<string>;
  editIndex: number | null;
  recipeForm: RecipeForm;
  onToggleSub: (key: string, items: TemplateItemDetailDto[]) => void;
  onEditItem: (item: TemplateItemDetailDto) => void;
}>) {
  const key = groupKeyOf(group);
  return (
    <section
      id={`group-${key}`}
      aria-labelledby={`group-title-${key}`}
      className="mt-5 scroll-mt-14"
    >
      <div className="bg-white border border-slate-200 rounded-lg">
        {/* iPad (<1280) ยุบหน่วย/ค่าแรง/หมายเหตุ ตารางพอดีจอ จึงไม่ต้องเลื่อนข้างตั้งแต่ md —
            ตัวห่อที่เลื่อนข้างได้ทำให้หัวตารางติดจอเลื่อนลงไปทับแถวแรก (ผู้ใช้สั่ง 18 ต.ค.) */}
        <div className="overflow-x-auto md:overflow-x-visible">
          <table className="w-full text-sm">
            {/* top-11 = ใต้แถบหมวดที่ล็อกความสูงไว้ h-11 พอดี เลื่อนลงลึกแค่ไหน
                ก็ยังเห็นว่าอยู่หมวดไหนและคอลัมน์ไหนคืออะไร */}
            <thead className="sticky top-11 z-10 bg-slate-200 text-left text-slate-600 border-b border-slate-300">
              {/* ชื่อหมวดเป็นแถวแรกของหัวตาราง — ติดจอไปพร้อมหัวคอลัมน์ ระหว่างค้นหาที่มีหลายหมวด
                  ต่อกันจึงรู้ตลอดว่ากำลังดูหมวดไหน · รหัสหมวดตรงแนวคอลัมน์ "รหัส" (px-4 เท่ากัน) */}
              <tr>
                <th colSpan={8} scope="colgroup" className="bg-[#ececf7] px-4 py-2.5 font-normal shadow-[inset_0_-1px_0_0_rgb(203,213,225)]">
                  <div id={`group-title-${key}`} className="flex items-baseline gap-3">
                    {group.code && (
                      <span className="font-mono text-sm font-semibold text-brand">{group.code}</span>
                    )}
                    <span className="font-semibold text-slate-900">{group.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-500 tabular-nums">
                      {searching ? `พบ ${group.items.length} รายการ` : `${group.items.length} รายการ`}
                    </span>
                  </div>
                </th>
              </tr>
              <tr>
                <th className="px-4 py-2 font-medium whitespace-nowrap">รหัส</th>
                <th className="px-4 py-2 font-medium">ชื่อรายการ</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">จำนวน</th>
                <th className="hidden xl:table-cell px-4 py-2 font-medium">หน่วย</th>
                <th className="px-4 py-2 font-medium text-right whitespace-nowrap">
                  <span className="xl:hidden">วัสดุ / ค่าแรง</span>
                  <span className="hidden xl:inline">วัสดุ/หน่วย</span>
                </th>
                <th className="hidden xl:table-cell px-4 py-2 font-medium text-right whitespace-nowrap">ค่าแรง/หน่วย</th>
                <th className="hidden xl:table-cell px-4 py-2 font-medium">หมายเหตุ</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {(range ? pageRunsOf(group, range.from, range.to) : subRunsOf(group)).map((run) => {
                // ระหว่างค้นหาให้กางเสมอ เช่นเดียวกับหมวดใหญ่
                const subCollapsed = !searching && run.name != null && collapsedSubs.has(run.key);
                return (
                  <Fragment key={run.key}>
                    {run.name && (
                      <SubRunHeader run={run} collapsed={subCollapsed} onToggle={() => onToggleSub(run.key, run.items)} />
                    )}
                    {!subCollapsed &&
                      run.items.map((item) => (
                        <Fragment key={`${item.categoryId}-${item.index}`}>
                          <ItemRow item={item} onEdit={() => onEditItem(item)} />
                          {editIndex === item.index && <RecipeEditorRow form={recipeForm} />}
                        </Fragment>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function NeighborGroupButton({
  group,
  direction,
  onOpen,
}: Readonly<{ group: CategoryGroup; direction: "prev" | "next"; onOpen: (key: string) => void }>) {
  return (
    <button
      type="button"
      onClick={() => onOpen(groupKeyOf(group))}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    >
      {direction === "prev" && <ChevronLeft size={16} />}
      {group.code && <span className="font-mono text-xs text-slate-400">{group.code}</span>}
      {shortName(group.name)}
      {direction === "next" && <ChevronRight size={16} />}
    </button>
  );
}

/** ไปหมวดก่อน/ถัดไปจากท้ายตาราง — อ่านจบหมวดยาว ๆ แล้วไม่ต้องเลื่อนกลับขึ้นไปหาแถบ */
function GroupPager({
  groups,
  activeIndex,
  onOpen,
}: Readonly<{ groups: CategoryGroup[]; activeIndex: number; onOpen: (key: string) => void }>) {
  const prev = activeIndex > 0 ? groups[activeIndex - 1] : null;
  const next = activeIndex < groups.length - 1 ? groups[activeIndex + 1] : null;
  return (
    <nav aria-label="หมวดก่อนหน้าและถัดไป" className="flex items-center justify-between gap-3 text-sm">
      {prev ? <NeighborGroupButton group={prev} direction="prev" onOpen={onOpen} /> : <span />}
      {next && <NeighborGroupButton group={next} direction="next" onOpen={onOpen} />}
    </nav>
  );
}

export function TemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const templateId = id!;
  const navigate = useNavigate();

  const [detail, setDetail] = useState<TemplateDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // แก้สูตรถอดปริมาณของบรรทัด (อ้างอิงด้วย index ใน structure)
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [itemBasis, setItemBasis] = useState("MANUAL");
  const [itemQuantity, setItemQuantity] = useState("");
  const [itemCoefficient, setItemCoefficient] = useState("");
  const [itemWaste, setItemWaste] = useState("");
  const [savingItem, setSavingItem] = useState(false);

  // แสดงทีละหมวดใหญ่ (แท็บ) — แม่แบบมาตรฐานมีเกือบร้อยบรรทัด แบ่งหน้าละ N รายการจะตัดหมวดขาด
  // กลางหน้า หมวดงานคือหน่วยที่คนทำ BOQ คิดอยู่แล้ว และตรงกับที่ใบเสนอราคาจัดกลุ่ม
  // เก็บใน URL (?cat=B) — กดย้อนกลับ/รีเฟรชแล้วกลับมาหมวดเดิม
  const [searchParams, setSearchParams] = useSearchParams();
  // ยุบ/กางหมวดย่อย (ระดับ 2) — หมวดใหญ่บางหมวดมีหลายสิบบรรทัด ยุบชั้นนี้ช่วยแบ่งเป็นก้อนเล็ก
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set());
  // ค้นหาในหน้า — หาบรรทัดในลิสต์ยาวได้เร็วกว่าเลื่อนหาทุกกรณี
  const [search, setSearch] = useState("");
  // หน้าในหมวดที่เปิดอยู่ (?page=2) — เปลี่ยนหมวดแล้วกลับไปหน้า 1
  const page = Math.max(1, Math.floor(Number(searchParams.get("page"))) || 1);

  function startEditItem(item: TemplateItemDetailDto) {
    setEditIndex(item.index);
    setItemBasis(item.qtyBasis);
    setItemQuantity(item.quantity);
    setItemCoefficient(item.qtyCoefficient ?? "1");
    setItemWaste(item.wasteFactorPct ?? "0");
  }

  async function saveItem() {
    if (editIndex == null) return;
    const usesDriver = itemBasis !== "MANUAL";
    if (usesDriver ? !itemCoefficient : !itemQuantity) return;
    setSavingItem(true);
    // ช่องเผื่อเสียว่าง = ไม่มีเผื่อ (null) · ใช้เฉพาะฐานที่คำนวณจากค่าวัด
    const waste = itemWaste ? Number(itemWaste) : null;
    try {
      const res = await updateTemplateItemRecipe(templateId, editIndex, {
        qtyBasis: itemBasis as QtyBasis,
        quantity: usesDriver ? undefined : Number(itemQuantity),
        qtyCoefficient: usesDriver ? Number(itemCoefficient) : undefined,
        wasteFactorPct: usesDriver ? waste : undefined,
      });
      setDetail(res.template);
      setEditIndex(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "แก้สูตรไม่สำเร็จ");
    } finally {
      setSavingItem(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await getTemplate(templateId);
        if (active) setDetail(res.template);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [templateId]);

  // จัดกลุ่มรายการตามหมวดใหญ่ (เรียงตามลำดับที่พบครั้งแรก) เพื่อแสดงเป็นส่วน ๆ อ่านง่าย
  const groups = useMemo<CategoryGroup[]>(() => {
    if (!detail) return [];
    const order: string[] = [];
    const map = new Map<string, CategoryGroup>();
    for (const item of detail.items) {
      const key = item.topCategoryCode ?? item.topCategoryName;
      if (!map.has(key)) {
        map.set(key, { code: item.topCategoryCode, name: item.topCategoryName, items: [] });
        order.push(key);
      }
      map.get(key)!.items.push(item);
    }
    return order.map((k) => map.get(k)!);
  }, [detail]);

  // ระหว่างค้นหาให้ตัดบรรทัดที่ไม่ตรงและหมวดที่ไม่เหลือรายการออก (หมวดที่ยังมีผลลัพธ์จะถูกกางให้เอง
  // ด้านล่าง เพื่อไม่ให้ผลการค้นหาไปซ่อนอยู่ในหมวดที่ผู้ใช้ยุบไว้ก่อนหน้า)
  const query = search.trim().toLowerCase();
  const visibleGroups = useMemo<CategoryGroup[]>(() => {
    if (!query) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) =>
          [item.name, item.categoryCode, item.categoryName, item.unit, item.note]
            .some((field) => field?.toLowerCase().includes(query)),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);
  const matchCount = visibleGroups.reduce((sum, g) => sum + g.items.length, 0);

  const requestedKey = searchParams.get("cat");
  const activeGroup = groups.find((g) => groupKeyOf(g) === requestedKey) ?? groups[0] ?? null;
  const activeIndex = activeGroup ? groups.indexOf(activeGroup) : -1;
  // จำนวนที่ตรงคำค้นต่อหมวด — โชว์บนแท็บระหว่างค้นหา
  const matchByKey = new Map(visibleGroups.map((g) => [groupKeyOf(g), g.items.length]));
  // ระหว่างค้นหา แสดงผลจากทุกหมวดต่อกัน (ค้นหาต้องไม่จำกัดอยู่แค่หมวดที่เปิดอยู่)
  const activeOnly = activeGroup ? [activeGroup] : [];
  const shownGroups = query ? visibleGroups : activeOnly;

  function openGroup(key: string) {
    if (query) {
      document.getElementById(`group-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    // เปลี่ยนหมวดขณะแก้สูตรค้างอยู่ = ฟอร์มหายไปทั้งที่ยังไม่บันทึก จึงปิดให้ก่อน
    setEditIndex(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("cat", key);
        next.delete("page");
        return next;
      },
      { replace: true },
    );
    // เลื่อนกลับขึ้นมาที่แถบหมวด ถ้าเลื่อนลงไปลึกแล้ว (กดหมวดถัดไปจากท้ายตาราง)
    const bar = document.getElementById("template-group-tabs");
    if (bar && bar.getBoundingClientRect().top <= 0) bar.scrollIntoView({ block: "start" });
  }

  function goPage(next: number) {
    setEditIndex(null);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next <= 1) p.delete("page");
      else p.set("page", String(next));
      return p;
    });
    // อ่านจบท้ายตารางแล้วกดหน้าถัดไป → เริ่มอ่านจากหัวตาราง
    document.getElementById("template-group-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleSub(key: string, items: TemplateItemDetailDto[]) {
    const collapsing = !collapsedSubs.has(key);
    if (collapsing && editIndex != null && items.some((it) => it.index === editIndex)) {
      setEditIndex(null);
    }
    setCollapsedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // ยุบ/กางทุกหมวดย่อยของหมวดที่เปิดอยู่ (ปุ่มปลายขวาแถบหมวด แบบเดียวกับหน้าหมวดงาน)
  // ไม่จำสถานะข้ามการเปิดหน้า — BOQ ต้องเห็นครบเสมอตอนเปิดมา · ระหว่างค้นหาทุกหมวดย่อยกางอยู่แล้ว จึงไม่มีปุ่ม
  const foldableRuns = !query && activeGroup ? subRunsOf(activeGroup).filter((run) => run.name != null) : [];
  const allRunsCollapsed = foldableRuns.length > 0 && foldableRuns.every((run) => collapsedSubs.has(run.key));
  function toggleAllRuns() {
    const collapsing = !allRunsCollapsed;
    // ยุบก้อนที่มีแถวกำลังแก้สูตรอยู่ = แผงแก้หายทั้งที่ยังไม่บันทึก จึงปิดให้ก่อน
    if (collapsing && editIndex != null && foldableRuns.some((run) => run.items.some((it) => it.index === editIndex))) {
      setEditIndex(null);
    }
    setCollapsedSubs((prev) => {
      const next = new Set(prev);
      for (const run of foldableRuns) {
        if (collapsing) next.add(run.key);
        else next.delete(run.key);
      }
      return next;
    });
  }

  // มีบรรทัดที่ผูกกับค่าวัดไหม — ถ้ามี แม่แบบนี้จะคิดปริมาณตามพื้นที่โครงการปลายทางเองตอนนำไปใช้
  const hasTakeoff = useMemo(
    () => Boolean(detail?.items.some((i) => i.qtyBasis && i.qtyBasis !== "MANUAL")),
    [detail],
  );

  function startEdit() {
    if (!detail) return;
    setEditName(detail.name);
    setEditDescription(detail.description ?? "");
    setEditing(true);
  }

  async function submitEdit() {
    if (!detail || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await updateTemplate(detail.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      // getTemplate ส่ง items มาด้วย แต่ updateTemplate คืนเฉพาะ meta — คงรายการเดิมไว้
      setDetail((prev) => (prev ? { ...prev, name: res.template.name, description: res.template.description, updatedAt: res.template.updatedAt } : prev));
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "แก้ไขแม่แบบไม่สำเร็จ");
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitCreate() {
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

  function cancelCreate() {
    setShowCreate(false);
    setNewProjectName("");
  }

  const recipeForm: RecipeForm = {
    basis: itemBasis,
    quantity: itemQuantity,
    coefficient: itemCoefficient,
    waste: itemWaste,
    saving: savingItem,
    setBasis: setItemBasis,
    setQuantity: setItemQuantity,
    setCoefficient: setItemCoefficient,
    setWaste: setItemWaste,
    onSave: saveItem,
    onCancel: () => setEditIndex(null),
  };

  const searching = Boolean(query);
  const summary = searching
    ? `พบ ${matchCount} รายการ ใน ${visibleGroups.length} หมวดงาน`
    : `ทั้งหมด ${detail?.items.length ?? 0} รายการ · ${groups.length} หมวดงาน`;
  const selectedTabKey = searching || !activeGroup ? null : groupKeyOf(activeGroup);
  const showPager = !searching && activeGroup != null && groups.length > 1;
  // แบ่งหน้าเฉพาะตอนดูทีละหมวด — ตอนค้นหาโชว์ผลจากทุกหมวดต่อกัน (ผลค้นหามักสั้นอยู่แล้ว)
  const activeTotal = activeGroup?.items.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(activeTotal / ITEMS_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRange = searching
    ? null
    : { from: (safePage - 1) * ITEMS_PAGE_SIZE, to: Math.min(safePage * ITEMS_PAGE_SIZE, activeTotal) };

  return (
    <Layout>
      <Link to="/templates" className={buttonClasses("ghost", "sm")}>
        ← กลับไปแม่แบบ
      </Link>

      {loading && <DetailSkeleton stats={0} />}
      {error && <p className="text-red-600 mt-4">{error}</p>}

      {detail && (
        <>
          {editing ? (
            <TemplateMetaEditor
              name={editName}
              description={editDescription}
              saving={savingEdit}
              onName={setEditName}
              onDescription={setEditDescription}
              onSave={submitEdit}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <TemplateTitle detail={detail} onEdit={startEdit} onToggleCreate={() => setShowCreate((v) => !v)} />
          )}

          {showCreate && (
            <CreateFromTemplateForm
              name={newProjectName}
              creating={creating}
              onName={setNewProjectName}
              onCreate={submitCreate}
              onCancel={cancelCreate}
            />
          )}

          {hasTakeoff && <TakeoffBanner />}

          {detail.items.length === 0 ? (
            <p className="text-slate-500">แม่แบบนี้ยังไม่มีรายการ</p>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="ค้นหารหัส ชื่อรายการ หรือหน่วย"
                  className="min-w-56 flex-1 sm:max-w-xs"
                />
                <span className="text-xs text-slate-500">{summary}</span>
              </div>

              {/* แถบหมวด — ติดขอบบนจอ เปลี่ยนหมวดได้ตลอดไม่ต้องเลื่อนกลับขึ้นไป */}
              <ScrollableTabBar
                id="template-group-tabs"
                ariaLabel="หมวดงาน"
                selectedKey={selectedTabKey}
                className="sticky top-0 z-20 -mb-5 h-11"
                end={foldableRuns.length > 0 ? <FoldAllButton collapsed={allRunsCollapsed} onToggle={toggleAllRuns} /> : null}
              >
                {groups.map((g) => {
                  const key = groupKeyOf(g);
                  const matches = matchByKey.get(key) ?? 0;
                  return (
                    <GroupTab
                      key={key}
                      group={g}
                      selected={!searching && activeGroup === g}
                      count={searching ? matches : g.items.length}
                      disabled={searching && matches === 0}
                      onOpen={() => openGroup(key)}
                    />
                  );
                })}
              </ScrollableTabBar>

              {searching && visibleGroups.length === 0 && (
                <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  ไม่พบรายการที่ตรงกับ &ldquo;{search.trim()}&rdquo;
                </p>
              )}
              {pageRange && pageCount > 1 && (
                <p className="-mb-3 mt-5 text-xs tabular-nums text-slate-500">
                  แสดง {pageRange.from + 1}-{pageRange.to} จาก {activeTotal} รายการ
                </p>
              )}
              {shownGroups.map((group) => (
                <GroupSection
                  key={groupKeyOf(group)}
                  group={group}
                  range={pageRange}
                  searching={searching}
                  collapsedSubs={collapsedSubs}
                  editIndex={editIndex}
                  recipeForm={recipeForm}
                  onToggleSub={toggleSub}
                  onEditItem={startEditItem}
                />
              ))}

              {pageRange && <Pagination page={safePage} pageCount={pageCount} onChange={goPage} className="-mt-1" />}
              {showPager && <GroupPager groups={groups} activeIndex={activeIndex} onOpen={openGroup} />}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
