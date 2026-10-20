import {
  ArrowRight,
  BadgePercent,
  Banknote,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  Clock,
  FileSpreadsheet,
  FileText,
  Grid3x3,
  Layers,
  ListPlus,
  Lock,
  Mail,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Ruler,
  Scissors,
  Send,
  Trash2,
  TrendingUp,
  Upload,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import type {
  BoqItemDto,
  ContractDto,
  ContractTemplateDto,
  CustomerAccessLinkResult,
  CustomerDto,
  LeadDto,
  MaterialDto,
  ProjectDetailDto,
  ProjectOpeningDto,
  ProjectStatus,
  ProjectVersionDto,
  QuoteDto,
  TakeoffRowInput,
  QuoteStatus,
  TemplateDto,
  WorkCategoryDto,
} from "@systemboq/shared-types";

// สูตรแยกค่าดำเนินการ/กำไร อยู่ใน shared-types เพราะทั้งเซิร์ฟเวอร์และหน้าจอต้องได้ตัวเลขเดียวกัน
import {
  roundTo,
  applyNetRounding,
  marginAfterDiscount,
  ROUNDING_UNITS,
  roundingUnitLabel,
  splitOverheadProfit,
  sumTakeoffSheet,
  isAreaUnit,
  tileTakeoff,
} from "@systemboq/shared-types";
import { BoqPriceDriftNotice } from "../components/BoqPriceDriftNotice";
import { ScrollableTabBar } from "../components/ScrollableTabBar";
import { RowMenu } from "../components/RowMenu";
import { BoqVersionCompare } from "../components/BoqVersionCompare";
import { Button, buttonClasses, iconButtonClasses } from "../components/Button";
import { RebarCalculator } from "../components/RebarCalculator";
import { Layout } from "../components/Layout";
import { ProjectActivity } from "../components/ProjectActivity";
import { StickyPageHeader } from "../components/StickyPageHeader";
import { UnitSelect } from "../components/UnitSelect";
import { useStuckPastHeader } from "../lib/use-stuck-past-header";
import { UNIT_OPTIONS } from "../lib/units";
import {
  MaterialComponentsEditor,
  componentRowsFrom,
  type RecipeSource,
  componentRowsToInput,
  deriveUnitPriceFromRows,
  validComponentRows,
  type ComponentRow,
} from "../components/MaterialComponentsEditor";
import { QuoteAttachmentsPanel } from "../components/QuoteAttachmentsPanel";
import {
  QuoteApprovalControls,
  QuoteApprovalStatus,
  QuoteLockedNote,
  QuoteReturnNote,
} from "../components/QuoteApprovalControls";
import { QuoteViewCell } from "../components/QuoteViewCell";
import { SearchableSelect, type SearchableOption } from "../components/SearchableSelect";
import { CustomerPicker } from "../components/CustomerPicker";
import { Avatar } from "../components/Avatar";
import { BoqBulkAddDialog, type TopCategory } from "../components/BoqBulkAddDialog";
import { BoqImportDialog } from "../components/BoqImportDialog";
import { ChangeOrdersPanel } from "../components/ChangeOrdersPanel";
import { ProjectCostsPanel } from "../components/ProjectCostsPanel";
import { OpeningsDialog } from "../components/OpeningsDialog";
import { Pagination } from "../components/Pagination";
import { StructuralCalcDialog } from "../components/StructuralCalcDialog";
import { StructuralMembersPanel } from "../components/StructuralMembersPanel";
import { SheetQuantityBlock, TakeoffSheetDialog } from "../components/TakeoffSheetDialog";
import { TileCalcDialog, type TileCalcApply } from "../components/TileCalcDialog";
import { openingsTotal, takeoffInputsOf } from "../lib/takeoff";
import { RebarCompareBar, RebarCompareTag, SiteRebarCard } from "../components/StructuralCompare";
import { useRebarCutting, useStructuralCompare } from "../lib/use-structural-compare";
import { ApiError, downloadFile } from "../lib/api";
import { restoreTrashItem } from "../lib/trash-api";
import { useAuth } from "../lib/auth-context";
import {
  addBoqItem,
  deleteBoqItem,
  reorderBoqItems,
  updateBoqItem,
  type QtyBasis,
} from "../lib/boq-api";
import { listCategories } from "../lib/categories-api";
import { buildCategoryPath, categoryParts } from "../lib/category-path";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { ContractBodyEditor } from "../components/ContractBodyEditor";
import { ContractPaymentsPanel } from "../components/ContractPaymentsPanel";
import { ContractMoneySummary } from "../components/ProjectContractMoney";
import { useContractMoney } from "../lib/use-contract-money";
import { createContract, listContracts, signContract } from "../lib/contracts-api";
import { listContractTemplates } from "../lib/contract-templates-api";
import { pdfViewerPath } from "../lib/document-pdf";
import { searchCustomers } from "../lib/customers-api";
import { listLeads } from "../lib/leads-api";
import { listMaterials } from "../lib/materials-api";
import {
  type DiscountPatch,
  getProject,
  issueCustomerAccessLink,
  linkLeadToProject,
  setCustomPrice,
  transitionProject,
  updateProject,
  updateProjectRates,
} from "../lib/projects-api";
import {
  createQuote,
  deleteQuote,
  listQuotes,
  setQuoteValidity,
  transitionQuote,
} from "../lib/quotes-api";
import { badgeClass, type BadgeColor } from "../lib/status-badge";
import {
  applyTemplateToProject,
  deleteTemplate,
  listTemplates,
  saveProjectAsTemplate,
} from "../lib/templates-api";
import { DetailSkeleton, PanelSkeleton } from "../components/Skeleton";
import { DateInput } from "../components/DateInput";
import { NARROW_SCREEN, useMediaQuery } from "../lib/use-media-query";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคาแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

// สีของ badge สถานะ ให้ตรงกับที่ใช้ในรายการโครงการ/แดชบอร์ด (อ่านเป็นระบบเดียวกันทั้งแอป)
const STATUS_COLOR: Record<ProjectStatus, BadgeColor> = {
  DRAFT: "slate",
  QUOTED: "amber",
  REJECTED: "red",
  APPROVED: "blue",
  COMPLETED: "emerald",
  CANCELLED: "red",
};

// ชิปข้อมูลเล็ก ๆ (pill) สรุปข้อมูลจากคำขอลูกค้าให้อ่านเร็ว -- ขอบบางกว่า badge สถานะ
// เพื่อไม่ให้แย่งความเด่นกัน
function InfoChip({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">
      {children}
    </span>
  );
}

const NEXT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ["QUOTED", "CANCELLED"],
  QUOTED: ["APPROVED", "CANCELLED"],
  // "ลูกค้าปฏิเสธ" ตั้งเองไม่ได้ (ขยับตามใบเสนอราคาเท่านั้น) ทางไปต่อคือออกใบใหม่หรือปิดดีล
  REJECTED: ["CANCELLED"],
  APPROVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "ร่าง",
  SENT: "ส่งแล้ว",
  ACCEPTED: "ลูกค้ายอมรับ",
  REJECTED: "ลูกค้าปฏิเสธ",
  REVISED: "ขอปรับแก้",
};

// สถานะใบเสนอราคาเคยเป็นตัวหนังสือเทาล้วน "ลูกค้าปฏิเสธ" จึงหน้าตาเหมือน "ส่งแล้ว" เป๊ะ ทั้งที่
// เป็นสถานะเดียวที่ห้ามมองข้าม — ใช้ป้ายสีชุดเดียวกับที่เหลือทั้งแอป
const QUOTE_STATUS_COLOR: Record<QuoteStatus, BadgeColor> = {
  DRAFT: "slate",
  SENT: "amber",
  ACCEPTED: "emerald",
  REJECTED: "red",
  REVISED: "indigo",
};

// Verb labels for the transition BUTTONS — a button is a command, so it must read as an
// action ("ส่งใบเสนอราคา") not as the destination state ("ส่งแล้ว", which looks like it was
// already sent). The state labels above stay for the สถานะ column and confirm dialog.
const QUOTE_ACTION_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "ตีกลับเป็นร่าง",
  SENT: "ส่งใบเสนอราคา",
  ACCEPTED: "บันทึกว่าลูกค้ายอมรับ",
  REJECTED: "บันทึกว่าลูกค้าปฏิเสธ",
  REVISED: "บันทึกว่าขอปรับแก้",
};

const QUOTE_NEXT_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED", "REVISED"],
  ACCEPTED: [],
  REJECTED: [],
  REVISED: [],
};

const CONTRACT_ELIGIBLE_STATUSES: ReadonlySet<ProjectStatus> = new Set(["APPROVED", "COMPLETED"]);

/**
 * แท็บของหน้ารายละเอียดโครงการ
 *
 * ทำไมต้องมี: เดิมทุกอย่างเรียงต่อกันแนวตั้งจนหน้ายาว ~7,000px (เกือบ 8 หน้าจอ) โดยตาราง BOQ
 * กินไป 76% — "สรุปวัสดุ" ที่อยู่ท้ายสุดต้องเลื่อนผ่าน BOQ ทั้งหมดกว่าจะถึง
 */
// แท็บ "รายการซื้อของ" (materials) ถอดออก 18 ต.ค. ผู้ใช้สั่ง — งานจัดซื้อหลังได้งานอยู่นอกขอบเขต (ประเมินราคา + เว็บลูกค้า)
// ลิงก์เก่า ?tab=materials ตกไปแท็บแรกเอง · ฝั่งเซิร์ฟเวอร์ (สรุปวัสดุ · ของชิ้นเดียว · Excel ขอราคา) ยังอยู่ เปิดกลับได้
const PROJECT_TABS = ["overview", "boq", "quotes", "contract", "costs"] as const;
type ProjectTab = (typeof PROJECT_TABS)[number];

function isProjectTab(value: string | null): value is ProjectTab {
  return value != null && (PROJECT_TABS as readonly string[]).includes(value);
}

/**
 * มุมมองย่อยในแท็บ "สัญญาและการเงิน" — เรียงตามลำดับงานจริงหลังลงนาม
 * (เรื่องใหม่ในอนาคต เช่น ใบลดหนี้ เพิ่มเป็นมุมมองย่อยได้ ไม่ต้องเพิ่มแท็บ)
 */
const CONTRACT_VIEWS = ["payments", "changes", "documents"] as const;
type ContractView = (typeof CONTRACT_VIEWS)[number];
const isContractView = (v: string | null): v is ContractView => v != null && (CONTRACT_VIEWS as readonly string[]).includes(v);

/** ลิงก์เก่า ?tab=contracts / ?tab=payments (แดชบอร์ด บุ๊กมาร์ก) → แท็บรวม + มุมมองย่อยที่ตรงกัน */
const LEGACY_CONTRACT_TABS: Record<string, ContractView> = { contracts: "documents", payments: "payments" };

/** หัวข้อที่ปุ่มอื่นในหน้าเลื่อนไปหา อยู่แท็บไหน — ใช้สลับแท็บให้ก่อนเลื่อน ไม่งั้นเลื่อนไปหาของที่ไม่ได้เรนเดอร์ */
const SECTION_TAB: Record<string, ProjectTab> = {
  "project-details": "overview",
  "custom-price-section": "overview",
  "boq-section": "boq",
  "quotes-section": "quotes",
  "contracts-section": "contract",
};

/**
 * สิ่งที่ยังขาดจนทำขั้นตอนถัดไปไม่ได้ — null = พร้อมออกใบเสนอราคาแล้ว
 *
 * มีไว้เพราะการ์ด "ขั้นตอนถัดไป" เคยบอกให้ "ไปสร้างใบเสนอราคา" ทั้งที่ปุ่มนั้นกดไม่ได้
 * (โครงการกำหนดเองที่ยังไม่ใส่ราคา / โครงการประเมินราคาที่ยังไม่มีบรรทัด BOQ)
 * คนใช้จึงไปยืนอยู่หน้าปุ่มจางโดยไม่มีอะไรบอกว่าติดอะไรอยู่
 */
type QuoteBlocker = "PRICE" | "BOQ";

function quoteBlockerOf(isCustom: boolean, hasCustomPrice: boolean, itemCount: number): QuoteBlocker | null {
  if (isCustom) return hasCustomPrice ? null : "PRICE";
  return itemCount > 0 ? null : "BOQ";
}

const BLOCKER_TEXT: Record<QuoteBlocker, { title: string; detail: string; action: string; section: string }> = {
  PRICE: {
    title: "กำหนดราคาโครงการ",
    detail:
      "โครงการกำหนดเองต้องใส่ราคาก่อน จึงจะออกใบเสนอราคาและแนบไฟล์ BOQ/แบบที่ทำจาก Excel หรือ PDF ได้",
    action: "ไปกำหนดราคา",
    section: "custom-price-section",
  },
  BOQ: {
    title: "เพิ่มรายการ BOQ",
    detail:
      "โครงการนี้ยังไม่มีรายการ BOQ สักบรรทัด จึงยังไม่มีราคาให้เสนอ — เพิ่มเองทีละบรรทัดหรือดึงจากแม่แบบก็ได้",
    action: "ไปที่ BOQ",
    section: "boq-section",
  },
};

// จัดกลุ่มรายการ BOQ ตามรากหมวดงาน (งานโครงสร้าง/สถาปัตย์/ระบบ) + subtotal ต่อหมวด แทนการแบ่งหน้า
// เพื่อให้อ่านเป็นหมวดแบบเอกสาร BOQ จริง
interface BoqGroup {
  rootId: string;
  rootName: string;
  /** รหัสหมวดใหญ่ (A/B/C…) — null สำหรับหมวดที่ไม่มีรหัสหรือ "ไม่ระบุหมวดงาน" */
  code: string | null;
  /** ค่าใน ?cat= — ใช้รหัสถ้ามี ลิงก์จะอ่านรู้เรื่อง (?cat=C) */
  key: string;
  items: BoqItemDto[];
  subtotal: number;
}

/** รากหมวดงาน (เดินขึ้นสายพ่อแม่จนสุด) ของบรรทัด BOQ = หมวดที่เป็นแท็บ */
function boqRootOf(
  categoryId: string,
  categoryById: Map<string, { id: string; name: string; code: string | null; parentId: string | null }>,
): { id: string; name: string; code: string | null; key: string } {
  let cur = categoryById.get(categoryId);
  if (!cur) return { id: "__none__", name: "ไม่ระบุหมวดงาน", code: null, key: "none" };
  while (cur.parentId) {
    const parent = categoryById.get(cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return { id: cur.id, name: cur.name, code: cur.code, key: cur.code || cur.id };
}

/** ชื่อบนแท็บ — ตัดคำนำ "หมวดงาน" ที่ทุกหมวดมีเหมือนกันออก แท็บจะได้ไม่ยาวจนล้นจอ */
const shortCategoryName = (name: string) => name.replace(/^หมวดงาน\s*/, "") || name;

type BoqRenderRow =
  /** แถบคั่นหมวดย่อยภายในกลุ่ม — แทนคอลัมน์ "หมวดงาน" ที่เคยพิมพ์ path เต็มซ้ำทุกแถว
   *  count = 0 เมื่อกลุ่มมีหมวดย่อยเดียว (จำนวนจะซ้ำกับหัวหมวด จึงไม่โชว์ซ้ำ)
   *  กดยุบได้เพื่อพับเฉพาะก้อนย่อย โดยไม่ต้องยุบทั้งหมวดใหญ่ */
  | {
      type: "subheader";
      key: string;
      name: string;
      count: number;
      collapsed: boolean;
      /** id ของบรรทัดในก้อนนี้ — ใช้ปิดฟอร์มแก้ไขถ้ากำลังแก้บรรทัดที่กำลังจะถูกยุบ */
      itemIds: string[];
      /** ก้อนนี้ถูกแบ่งหน้าตัดกลาง: ลำดับบรรทัดแรก–สุดท้ายของชิ้นในหน้านี้ (นับจาก 1) */
      from?: number;
      to?: number;
      /** หัวซ้ำที่ต้นหน้าถัดไป — ก้อนเดียวกันต่อจากหน้าก่อน */
      continued?: boolean;
    }
  | { type: "item"; item: BoqItemDto };

/** ตาราง BOQ หน้าละกี่บรรทัด — ผู้ใช้ขอ 15 (เลือกแบบ 1: เท่ากันทุกหน้า ไม่มีตัวเลือกจำนวนต่อหน้า) */
const BOQ_PAGE_SIZE = 15;

/**
 * แบ่งแถวของหมวดที่เปิดเป็นหน้าละ `size` บรรทัด (ผู้ใช้เลือกแบบ 1 — 11 ต.ค. 2026)
 * วิธีตัดเหมือนหน้าหมวดงาน: นับเฉพาะบรรทัดรายการ (หมวดย่อยที่ยุบนับ 0 แต่หัวยังอยู่)
 * ก้อนหมวดย่อยที่ข้ามหน้า → หัวซ้ำ "(ต่อ)" ที่ต้นหน้าถัดไป และทุกชิ้นที่ถูกตัดบอกช่วง "3–5 จาก 8"
 * หัวหมวดย่อยที่ตกท้ายหน้าพอดีถูกยกไปหน้าถัดไปพร้อมบรรทัดของมัน ไม่ทิ้งหัวลอยไว้ท้ายหน้า
 */
function paginateBoqRows(rows: BoqRenderRow[], size: number): BoqRenderRow[][] {
  const pages: BoqRenderRow[][] = [];
  let page: BoqRenderRow[] = [];
  let count = 0;
  let sub: SubheaderRow | null = null;
  let head: SubheaderRow | null = null;
  let posInSub = 0;
  const flush = () => {
    pages.push(page);
    page = [];
    count = 0;
    head = null;
  };
  for (const row of rows) {
    if (row.type === "subheader") {
      if (count >= size) flush();
      sub = row;
      posInSub = 0;
      head = { ...row, from: 1, to: 0 };
      page.push(head);
      continue;
    }
    if (count >= size) {
      flush();
      if (sub && !sub.collapsed) {
        head = { ...sub, from: posInSub + 1, to: posInSub, continued: true };
        page.push(head);
      }
    }
    page.push(row);
    count++;
    posInSub++;
    if (head) head.to = posInSub;
  }
  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[]];
}

// เรียงตัวเลือก dropdown ตามรหัสงาน/วัสดุ เพื่อให้รายการอ่านตามลำดับหมวดงาน
// (A-01-01, A-01-02, … B-01-01, …) แทนลำดับจาก API ส่วน numeric:true ทำให้ 2 มาก่อน 10;
// รหัสที่ขาดหายจะตกไปอยู่ท้ายสุด
const byCode = (a: string | null, b: string | null) =>
  (a || "￿").localeCompare(b || "￿", "en", { numeric: true });

function money(value: string | number): string {
  return Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// กำหนดส่วนต่าง ๆ เองแทนค่าเริ่มต้นตาม locale ซึ่งจะต่อวินาทีมาด้วย -- พนักงานต้องการแค่วันที่
// และเวลาถึงระดับนาทีพอ
function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// วันที่อย่างเดียว (ไม่มีเวลา) สำหรับวันเริ่ม/วันคาดว่าแล้วเสร็จ
function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — เทียบกับวันยืนราคาที่เซิร์ฟเวอร์เก็บเป็นวันตามเวลาไทย */
function todayBangkok(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** วันยืนราคาแบบสั้น (17 ก.ย. 69) — อยู่ใต้วันที่ส่งในคอลัมน์แคบ ชื่อเดือนเต็มจะตกบรรทัด */
function formatShortDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  });
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// เส้นทางสถานะปกติ (happy path) สำหรับแถบขั้นตอน — CANCELLED อยู่นอกเส้นนี้ จึงแสดงแยก
const STATUS_FLOW: ProjectStatus[] = ["DRAFT", "QUOTED", "APPROVED", "COMPLETED"];
// ป้ายสั้นสำหรับแถบขั้นตอน (อ่านเป็นขั้นตอน ไม่ใช่สถานะเต็มแบบ badge)
const STEP_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคา",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติ",
  COMPLETED: "ส่งมอบ",
  CANCELLED: "ยกเลิก",
};

// (A) แถบขั้นตอน — เห็นภาพรวมว่าโครงการเดินมาถึงไหน + วันที่ของแต่ละขั้น (เท่าที่มีข้อมูล)
// ขั้นที่ผ่านมาแล้วติ๊กถูก ขั้นปัจจุบันไฮไลต์ ขั้นข้างหน้าเป็นสีจาง สถานะขยับเองเมื่อส่งใบเสนอราคา/
// ลูกค้าตอบรับ (ดู quotes.service / myQuotes.service) แล้ว poll เบื้องหลังจะดึงมาแสดงเอง
/** สถานะของหมุดแต่ละขั้นในแถบ: ผ่านแล้ว · อยู่ตรงนี้ · สะดุดตรงนี้ (ลูกค้าปฏิเสธ) · ยังไม่ถึง */
type StepState = "done" | "current" | "stopped" | "todo";

const STEP_DOT_CLASS: Record<StepState, string> = {
  done: "bg-brand text-white",
  stopped: "border-2 border-red-500 bg-white text-red-600",
  current: "border-2 border-brand bg-white text-brand",
  todo: "border border-slate-300 bg-white text-slate-400",
};

const STEP_LABEL_CLASS: Record<StepState, string> = {
  stopped: "font-semibold text-red-600",
  current: "font-semibold text-brand",
  done: "text-slate-700",
  todo: "text-slate-400",
};

function stepStateOf(index: number, currentIndex: number, rejected: boolean, finished: boolean): StepState {
  // ส่งมอบแล้ว = จบทุกขั้น — ขั้นสุดท้ายไม่ใช่ "งานที่ค้างอยู่" จึงติ๊กถูกด้วย
  if (finished || index < currentIndex) return "done";
  if (index > currentIndex) return "todo";
  return rejected ? "stopped" : "current";
}

function StepDotContent({ state, index }: Readonly<{ state: StepState; index: number }>) {
  if (state === "done") return <Check size={15} />;
  if (state === "stopped") return <X size={15} />;
  return <>{index + 1}</>;
}

function ProjectStatusStepper({
  status,
  stepDates,
}: Readonly<{
  status: ProjectStatus;
  stepDates: Partial<Record<ProjectStatus, string | null>>;
}>) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        <X size={16} /> โครงการนี้ถูกยกเลิกแล้ว
      </div>
    );
  }

  // "ลูกค้าปฏิเสธ" ไม่ใช่ขั้นในเส้นทาง แต่เป็นการสะดุดที่ขั้น "เสนอราคา" — วางหมุดปัจจุบันไว้ที่
  // ขั้นนั้นแล้วทำเป็นสีแดงพร้อมกากบาท ดีกว่าซ่อนแถบทั้งอันเหมือนตอนยกเลิก เพราะดีลยังไปต่อได้
  const rejected = status === "REJECTED";
  const finished = status === "COMPLETED";
  const currentIndex = rejected ? STATUS_FLOW.indexOf("QUOTED") : STATUS_FLOW.indexOf(status);

  return (
    <ol className="flex items-start">
      {STATUS_FLOW.map((s, i) => {
        const state = stepStateOf(i, currentIndex, rejected, finished);
        const date = stepDates[s];
        return (
          <Fragment key={s}>
            <li className="flex w-16 shrink-0 flex-col items-center text-center">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${STEP_DOT_CLASS[state]}`}
              >
                <StepDotContent state={state} index={i} />
              </span>
              <span className={`mt-1.5 text-xs ${STEP_LABEL_CLASS[state]}`}>
                {state === "stopped" ? "ลูกค้าปฏิเสธ" : STEP_LABEL[s]}
              </span>
              {state !== "todo" && date && (
                <span className="mt-0.5 text-xs leading-tight text-slate-400">
                  {formatDateOnly(date)}
                </span>
              )}
            </li>
            {i < STATUS_FLOW.length - 1 && (
              <span
                className={`mt-3.5 h-0.5 flex-1 rounded-full ${i < currentIndex ? "bg-brand" : "bg-slate-200"}`}
              />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

// (B) การ์ด "ขั้นตอนถัดไป" — บอกพนักงานว่าควรทำอะไรต่อ + ปุ่มลงมือ และย้ำว่าสถานะที่ขยับเองจะ
// เกิดตอนไหน (ส่งใบเสนอราคา → เสนอราคาแล้ว, ลูกค้ายอมรับ → อนุมัติแล้ว) ที่ต้องคนตัดสินใจเอง
// (ส่งมอบ/ยกเลิก) จึงเป็นปุ่มชัด ๆ ที่นี่
/** ใบร่างล่าสุด (ถ้ามี) — การ์ดขั้นตอนถัดไปของโครงการร่างขึ้นอยู่กับว่าใบนี้อนุมัติไปถึงไหนแล้ว */
function latestDraftOf(quotes: QuoteDto[]): QuoteDto | null {
  return quotes.find((q) => q.status === "DRAFT") ?? null;
}

const DRAFT_STEP: Record<
  "NO_QUOTE" | "NEED_REQUEST" | "NEED_MY_APPROVAL" | "WAITING_OWNER" | "READY",
  { title: string; detail: string; action: string; tone: "brand" | "amber" }
> = {
  NO_QUOTE: {
    title: "ออกใบเสนอราคา",
    detail: "สร้างใบเสนอราคา ขออนุมัติจากเจ้าของ แล้วส่งให้ลูกค้า",
    action: "ไปสร้างใบเสนอราคา",
    tone: "brand",
  },
  NEED_REQUEST: {
    title: "ขออนุมัติใบเสนอราคา",
    detail: "ใบเสนอราคาต้องได้รับอนุมัติจากเจ้าของก่อนส่งให้ลูกค้า — ลายเซ็นของผู้ขอและผู้อนุมัติจะลงในใบให้เอง",
    action: "ไปที่ใบเสนอราคา",
    tone: "brand",
  },
  NEED_MY_APPROVAL: {
    title: "อนุมัติใบเสนอราคา",
    detail: "ตรวจราคาแล้วอนุมัติ หรือส่งกลับให้แก้พร้อมเหตุผล",
    action: "ไปที่ใบเสนอราคา",
    tone: "brand",
  },
  WAITING_OWNER: {
    title: "รอเจ้าของอนุมัติใบเสนอราคา",
    detail: "เจ้าของได้รับแจ้งเตือนแล้ว — อนุมัติเมื่อไรจะมีแจ้งเตือนกลับมา แล้วส่งให้ลูกค้าได้เลย",
    action: "ไปที่ใบเสนอราคา",
    tone: "amber",
  },
  READY: {
    title: "ส่งใบเสนอราคาให้ลูกค้า",
    detail: "อนุมัติแล้ว — เมื่อส่งให้ลูกค้า สถานะจะเปลี่ยนเป็น “เสนอราคาแล้ว” โดยอัตโนมัติ",
    action: "ไปที่ใบเสนอราคา",
    tone: "brand",
  },
};

function draftStepOf(draft: QuoteDto | null, isOwner: boolean): keyof typeof DRAFT_STEP {
  const state = draft?.approval?.state;
  if (!draft) return "NO_QUOTE";
  if (state === "APPROVED") return "READY";
  if (state === "PENDING") return isOwner ? "NEED_MY_APPROVAL" : "WAITING_OWNER";
  return isOwner ? "NEED_MY_APPROVAL" : "NEED_REQUEST";
}

function DraftNextAction({
  draft,
  isOwner,
  onGoQuotes,
}: Readonly<{ draft: QuoteDto | null; isOwner: boolean; onGoQuotes: () => void }>) {
  const step = DRAFT_STEP[draftStepOf(draft, isOwner)];
  const amber = step.tone === "amber";
  return (
    <div
      className={`rounded-lg border p-4 flex flex-col gap-2 ${
        amber ? "border-amber-200 bg-amber-50" : "border-brand/30 bg-brand/5"
      }`}
    >
      <div className={`flex items-center gap-2 text-sm font-semibold ${amber ? "text-amber-700" : "text-brand"}`}>
        {amber ? <Clock size={16} /> : <ArrowRight size={16} />} ขั้นตอนถัดไป: {step.title}
      </div>
      <p className="text-sm text-slate-500">{step.detail}</p>
      <Button size="sm" variant="ghost" className="self-start" onClick={onGoQuotes}>
        {step.action}
      </Button>
    </div>
  );
}

function ProjectNextAction({
  status,
  draftQuote,
  isOwner,
  blocker,
  rejectionReason,
  savingTransition,
  onGoQuotes,
  onGoSection,
  onGoContracts,
  onMarkDelivered,
  onCloseLost,
}: Readonly<{
  status: ProjectStatus;
  /** ใบร่างล่าสุด — การ์ดบอกขั้นอนุมัติตามใบนี้ (null = ยังไม่มีใบร่าง) */
  draftQuote: QuoteDto | null;
  isOwner: boolean;
  /** สิ่งที่ยังขาดจนออกใบเสนอราคาไม่ได้ — null = พร้อมแล้ว */
  blocker: QuoteBlocker | null;
  /** เหตุผลที่ลูกค้าให้ไว้ตอนปฏิเสธ (customerNote ของใบล่าสุด) — null ถ้าไม่ได้ระบุ */
  rejectionReason: string | null;
  savingTransition: boolean;
  onGoQuotes: () => void;
  onGoSection: (id: string) => void;
  onGoContracts: () => void;
  onMarkDelivered: () => void;
  onCloseLost: () => void;
}>) {
  const base = "rounded-lg border p-4 flex flex-col gap-2";

  // ยังติดอะไรอยู่ = บอกสิ่งนั้น ไม่ใช่บอกขั้นตอนที่ยังทำไม่ได้ (ต้องมาก่อนทุกสถานะ เพราะ
  // โครงการที่ถูกปฏิเสธแล้วออกใบใหม่ก็ติดเงื่อนไขเดียวกัน)
  if (blocker && (status === "DRAFT" || status === "REJECTED")) {
    const t = BLOCKER_TEXT[blocker];
    return (
      <div className={`${base} border-brand/30 bg-brand/5`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-brand">
          <ArrowRight size={16} /> ขั้นตอนถัดไป: {t.title}
        </div>
        <p className="text-sm text-slate-500">{t.detail}</p>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => onGoSection(t.section)}>
          {t.action}
        </Button>
      </div>
    );
  }

  if (status === "DRAFT") {
    return <DraftNextAction draft={draftQuote} isOwner={isOwner} onGoQuotes={onGoQuotes} />;
  }

  if (status === "QUOTED") {
    return (
      <div className={`${base} border-amber-200 bg-amber-50`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
          <Clock size={16} /> ส่งใบเสนอราคาแล้ว — รอลูกค้าตอบกลับ
        </div>
        <p className="text-sm text-slate-500">
          สถานะจะเปลี่ยนเป็น “อนุมัติแล้ว” โดยอัตโนมัติเมื่อลูกค้ากดยอมรับ
          หรือบันทึกการตอบกลับเองได้ที่ใบเสนอราคา
        </p>
        <Button variant="ghost" size="sm" className="self-start" onClick={onGoQuotes}>
          ไปที่ใบเสนอราคา
        </Button>
      </div>
    );
  }

  if (status === "REJECTED") {
    return (
      <div className={`${base} border-red-200 bg-red-50`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
          <X size={16} /> ลูกค้าปฏิเสธใบเสนอราคา — ตัดสินใจว่าจะไปต่อหรือปิดดีล
        </div>
        <p className="text-sm text-slate-500">
          {rejectionReason
            ? `เหตุผลที่ลูกค้าให้ไว้: “${rejectionReason}”`
            : "ลูกค้าไม่ได้ระบุเหตุผลไว้ — ลองติดต่อกลับเพื่อสอบถามก่อนตัดสินใจ"}
        </p>
        <p className="text-sm text-slate-500">
          ถ้าออกใบเสนอราคาฉบับใหม่แล้วส่งให้ลูกค้า สถานะจะกลับไปเป็น “เสนอราคาแล้ว” โดยอัตโนมัติ
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onGoQuotes}>
            ออกใบเสนอราคาฉบับใหม่
          </Button>
          <Button variant="danger" size="sm" disabled={savingTransition} onClick={onCloseLost}>
            ปิดดีล — ไม่สำเร็จ
          </Button>
        </div>
      </div>
    );
  }

  if (status === "APPROVED") {
    return (
      <div className={`${base} border-blue-200 bg-blue-50`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
          <Check size={16} /> ลูกค้าอนุมัติแล้ว — พร้อมออกสัญญา
        </div>
        <p className="text-sm text-slate-500">
          ออกสัญญาให้ลูกค้า และเมื่อส่งมอบงานเรียบร้อยแล้วให้ทำเครื่องหมายเพื่อปิดโครงการ
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onGoContracts}>
            ไปที่สัญญา
          </Button>
          <Button variant="brand" size="sm" disabled={savingTransition} onClick={onMarkDelivered}>
            ทำเครื่องหมายส่งมอบงาน
          </Button>
        </div>
      </div>
    );
  }

  if (status === "COMPLETED") {
    return (
      <div className={`${base} border-emerald-200 bg-emerald-50`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <CheckCircle2 size={16} /> ส่งมอบงานเรียบร้อย — โครงการเสร็จสมบูรณ์
        </div>
      </div>
    );
  }

  return null;
}

interface AddFormState {
  categoryId: string;
  materialId: string;
  name: string;
  unit: string;
  materialUnitPrice: string;
  laborUnitPrice: string;
  quantity: string;
  // การถอดปริมาณ: MANUAL กรอกปริมาณเอง / ที่เหลือคิดจากค่าวัด × ต่อ 1 หน่วย × (1+เผื่อเสีย)
  qtyBasis: QtyBasis;
  qtyCoefficient: string;
  wasteFactorPct: string;
  note: string;
}

const EMPTY_ADD_FORM: AddFormState = {
  categoryId: "",
  materialId: "",
  name: "",
  unit: "",
  materialUnitPrice: "",
  laborUnitPrice: "0",
  quantity: "1",
  qtyBasis: "MANUAL",
  qtyCoefficient: "1",
  wasteFactorPct: "0",
  note: "",
};

// ค่าวัดของโครงการที่ใช้เป็นตัวขับของแต่ละฐานคำนวณ
type DriverKey =
  | "floorArea"
  | "wallArea"
  | "perimeter"
  | "volume"
  | "footprint"
  | "bathrooms"
  | "floors";
type TakeoffDriversUi = Record<DriverKey, number | null>;

// นิยามฐานคำนวณปริมาณ (ป้าย + ตัวขับ + ป้ายช่องสัมประสิทธิ์) — ใช้ร่วมทั้งฟอร์มเพิ่มและแก้บรรทัด
const TAKEOFF_BASES: {
  value: QtyBasis;
  label: string;
  driver: DriverKey | null;
  perLabel: string;
  measureLabel: string;
}[] = [
  { value: "MANUAL", label: "กรอกเอง", driver: null, perLabel: "จำนวน", measureLabel: "" },
  { value: "SHEET", label: "ถอดจากแบบ (กรอกขนาดทีละชิ้น)", driver: null, perLabel: "ใบถอดแบบ", measureLabel: "" },
  { value: "PER_AREA", label: "ต่อพื้นที่พื้น (× ตร.ม.)", driver: "floorArea", perLabel: "ปริมาณต่อ 1 ตร.ม.พื้น", measureLabel: "พื้นที่ใช้สอย" },
  { value: "PER_WALL_AREA", label: "ต่อพื้นที่ผนัง (× ตร.ม.)", driver: "wallArea", perLabel: "ปริมาณต่อ 1 ตร.ม.ผนัง", measureLabel: "พื้นที่ผนัง" },
  { value: "PER_PERIMETER", label: "ต่อความยาวรอบรูป (× ม.)", driver: "perimeter", perLabel: "ปริมาณต่อ 1 เมตร", measureLabel: "ความยาวรอบรูป" },
  { value: "PER_VOLUME", label: "ต่อปริมาตร (× ลบ.ม.)", driver: "volume", perLabel: "ปริมาณต่อ 1 ลบ.ม.", measureLabel: "ปริมาตรคอนกรีต" },
  { value: "PER_FOOTPRINT", label: "ต่อพื้นที่ตั้งอาคาร (× ตร.ม.)", driver: "footprint", perLabel: "ปริมาณต่อ 1 ตร.ม.ตั้งอาคาร", measureLabel: "พื้นที่ตั้งอาคาร" },
  { value: "PER_BATHROOM", label: "ต่อห้องน้ำ (× ห้อง)", driver: "bathrooms", perLabel: "ปริมาณต่อ 1 ห้องน้ำ", measureLabel: "จำนวนห้องน้ำ" },
  { value: "PER_FLOOR", label: "ต่อชั้น (× ชั้น)", driver: "floors", perLabel: "ปริมาณต่อ 1 ชั้น", measureLabel: "จำนวนชั้น" },
];

type DiscountMode = "NONE" | "PERCENT" | "AMOUNT";

type RatesPatch = {
  overheadProfitPercent?: number;
  overheadPercent?: number | null;
  vatPercent?: number;
  discount?: DiscountPatch;
  contingencyPercent?: number;
  roundingUnit?: number | null;
};

/** ช่องตัวเลขที่เว้นว่างได้: ว่าง = null (ไม่แตะค่านี้) */
function optionalNumber(input: string): number | null {
  return input === "" ? null : Number(input);
}

/** ตรวจค่าในแผงแก้อัตรา — คืนข้อความผิดข้อแรกที่เจอ หรือ null ถ้าผ่านหมด */
function ratesInputError(
  inputs: { oh: number | null; overhead: number | null; vat: number | null },
  currentTotalPct: number,
  discMode: DiscountMode,
  discValue: number,
): string | null {
  for (const [value, label] of [
    [inputs.oh, "ค่าดำเนินการ+กำไร"],
    [inputs.overhead, "ค่าดำเนินการ"],
    [inputs.vat, "VAT"],
  ] as const) {
    if (value != null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      return `${label} ต้องเป็นตัวเลข 0-100`;
    }
  }
  // ค่าดำเนินการมากกว่าก้อนรวม = กำไรติดลบตั้งแต่ยังไม่เริ่มงาน ซึ่งเป็นการกรอกผิดเสมอ
  const effectiveTotal = inputs.oh ?? currentTotalPct;
  if (inputs.overhead != null && inputs.overhead > effectiveTotal) {
    return `ค่าดำเนินการ (${inputs.overhead}%) มากกว่าอัตรารวม (${effectiveTotal}%) ไม่ได้`;
  }
  if (discMode !== "NONE" && (!Number.isFinite(discValue) || discValue < 0)) {
    return "ส่วนลดต้องเป็นตัวเลขไม่ติดลบ";
  }
  if (discMode === "PERCENT" && discValue > 100) {
    return "ส่วนลดเป็นเปอร์เซ็นต์ต้องไม่เกิน 100";
  }
  return null;
}

/** ตรวจค่าเผื่อเหลือเผื่อขาด — แยกจาก ratesInputError เพื่อไม่ให้ฟังก์ชันเดียวบวมเกินอ่านไหว */
function contingencyError(contingency: number | null): string | null {
  if (contingency != null && (!Number.isFinite(contingency) || contingency < 0 || contingency > 100)) {
    return "ค่าเผื่อเหลือเผื่อขาด ต้องเป็นตัวเลข 0-100";
  }
  return null;
}

/** ค่าเผื่อเหลือเผื่อขาดในคำขอ — ส่งเฉพาะเมื่อเปลี่ยนจริง (ไม่งั้นไปสะกิดกฎสิทธิ์ของ ADMIN โดยไม่จำเป็น) */
function contingencyPatchOf(version: ProjectVersionDto, contingency: number | null): RatesPatch {
  if (contingency == null || contingency === Number(version.contingencyPct)) return {};
  return { contingencyPercent: contingency };
}

function discountPatchOf(discMode: DiscountMode, discValue: number, note: string): DiscountPatch {
  if (discMode === "NONE" || discValue === 0) return { mode: "NONE" };
  return { mode: discMode, value: discValue, note: note || undefined };
}

/** ส่วนลดใหม่ต่างจากของเวอร์ชันปัจจุบันไหม — ไม่ต่าง = ไม่ต้องยิงคำขอ (และไม่สร้างเวอร์ชันใหม่) */
function discountChanged(version: ProjectVersionDto, next: DiscountPatch, note: string): boolean {
  const currentPct = version.discountPct == null ? null : Number(version.discountPct);
  const currentAmt = Number(version.discountAmt);
  const currentNote = version.discountNote ?? "";
  if (next.mode === "NONE") return currentPct != null || currentAmt > 0;
  if (next.mode === "PERCENT") return currentPct !== next.value || currentNote !== note;
  return currentPct != null || currentAmt !== next.value || currentNote !== note;
}

/** ประกอบคำขอแก้อัตรา — ส่งเฉพาะค่าที่เปลี่ยนจริง ค่าที่ไม่ได้แตะไม่ต้องไปรบกวนฝั่งเซิร์ฟเวอร์ */
function ratesPatchOf(
  version: ProjectVersionDto,
  isCustomProject: boolean,
  inputs: { oh: number | null; overhead: number | null; vat: number | null },
  discount: DiscountPatch,
  discountNote: string,
): RatesPatch {
  const body: RatesPatch = {};
  const currentOverheadPct = version.overheadPct == null ? null : Number(version.overheadPct);
  if (!isCustomProject) {
    if (inputs.oh != null && inputs.oh !== Number(version.overheadProfitPct)) {
      body.overheadProfitPercent = inputs.oh;
    }
    // ลบช่องนี้ทิ้ง = ขอกลับไปเป็นก้อนรวมที่ไม่ได้แยก (อัตรารวมคงเดิม)
    if (inputs.overhead !== currentOverheadPct) body.overheadPercent = inputs.overhead;
  }
  if (inputs.vat != null && inputs.vat !== Number(version.vatPct)) body.vatPercent = inputs.vat;
  if (discountChanged(version, discount, discountNote)) body.discount = discount;
  return body;
}

/** ปริมาณที่ใช้คิดตัวอย่างราคา: กรอกเอง (ช่องว่าง = ยังไม่รู้) หรือถอดจากค่าวัดของโครงการ */
function previewQtyOf(
  basis: string,
  quantity: string,
  coefficient: string,
  waste: string,
  driverValue: number | null,
  sheet: { rows: TakeoffRowInput[]; unit: string },
): number | null {
  if (basis === "MANUAL") return quantity.trim() === "" ? null : Number(quantity);
  // ใบถอดแบบ: สูตรเดียวกับเซิร์ฟเวอร์ (shared-types) — ยังไม่มีแถว = ยังไม่รู้ปริมาณ
  if (basis === "SHEET") {
    return sheet.rows.length ? sumTakeoffSheet(sheet.rows, sheet.unit, Number(waste) || 0).quantity : null;
  }
  return previewTakeoffQty(Number(coefficient), Number(waste), driverValue);
}

/** บรรทัดใต้ส่วนลด: ส่วนลดกินกำไรไปเท่าไร หรือเกินกำไรที่มี (แดง) */
function DiscountMarginHint({ margin }: Readonly<{ margin: { remaining: number; eatenPct: number | null } }>) {
  if (margin.remaining < 0) {
    return <span className="text-red-600">เกินกำไรที่มี {money(String(-margin.remaining))}</span>;
  }
  return (
    <>
      กินกำไรไป {margin.eatenPct ?? 0}% · เหลือ {money(String(margin.remaining))}
    </>
  );
}

/**
 * ชื่อปุ่มในแถวสัญญา — หลังลงนามแล้ว สิ่งที่อยู่หลังปุ่มนี้คือการติดตามรับเงิน ไม่ใช่ถ้อยคำ
 * (ถ้อยคำแก้ไม่ได้แล้ว) ชื่อปุ่มต้องบอกสิ่งที่จะได้เจอจริง ๆ
 */
/** ชื่อของสิ่งที่อยู่ใต้แถว — ก่อนลงนามแก้ถ้อยคำ/แผนงวด · หลังลงนามคือการรับเงิน (ถ้อยคำแก้ไม่ได้แล้ว) */
function contractPanelLabel(open: boolean, signed: boolean): string {
  const what = signed ? "งวดและการรับเงิน" : "แก้ข้อความและงวด";
  return open ? `พับ${what}` : what;
}

function basisConfig(value: string) {
  return TAKEOFF_BASES.find((b) => b.value === value) ?? TAKEOFF_BASES[0];
}

// พรีวิวปริมาณ take-off ฝั่ง UI ให้ตรงกับสูตรฝั่งเซิร์ฟเวอร์ (effectiveQuantity)
function previewTakeoffQty(
  coefficient: number,
  wastePct: number,
  floorArea: number | null,
): number | null {
  if (floorArea == null || floorArea <= 0 || !Number.isFinite(coefficient) || coefficient <= 0) {
    return null;
  }
  const q = floorArea * coefficient * (1 + (Number.isFinite(wastePct) ? wastePct : 0) / 100);
  return roundTo(q, 3);
}

// รวมของบรรทัด = ปริมาณ × (ราคาวัสดุ + ค่าแรง) — ตรงกับ calculateLineAmounts ฝั่งเซิร์ฟเวอร์
function lineTotalOf(
  qty: number | null,
  materialUnitPrice: number,
  laborUnitPrice: number,
): number | null {
  if (qty == null || !Number.isFinite(qty)) return null;
  const mat = Number.isFinite(materialUnitPrice) ? materialUnitPrice : 0;
  const lab = Number.isFinite(laborUnitPrice) ? laborUnitPrice : 0;
  // ปัดค่าวัสดุกับค่าแรงแยกกันก่อนบวก เหมือน calculateLineAmounts เป๊ะ ๆ — ถ้าบวกก่อนปัด
  // ตัวอย่างที่ลงท้าย .005 ทั้งคู่จะได้ยอดต่างจากที่เซิร์ฟเวอร์บันทึกจริง 0.01 บาท
  const r2 = (v: number) => roundTo(v, 2);
  return r2(r2(qty * mat) + r2(qty * lab));
}

/** ส่วนลดที่มีผลกับยอดหนึ่ง ๆ — % คิดจากฐาน, จำนวนเงินคงที่ตัดไม่ให้เกินฐาน (สะท้อน resolveDiscountAmount) */
function previewDiscount(base: number, discount: PreviewDiscount | undefined): number {
  if (!discount) return 0;
  const round2 = (v: number) => roundTo(v, 2);
  if (discount.pct != null) return round2(base * (discount.pct / 100));
  return Math.min(round2(discount.amt), base);
}

interface PreviewDiscount {
  pct: number | null;
  amt: number;
}

// คิดราคาสุทธิใหม่จากต้นทุนตรงที่เปลี่ยนไป ตามอัตราของเวอร์ชันปัจจุบัน (สะท้อน calculatePricing)
// ลำดับต้องตรงกับฝั่งเซิร์ฟเวอร์เป๊ะ ๆ: ต้นทุน → +กำไร → −ส่วนลด → +VAT
function previewNetPrice(
  newDirectCost: number,
  overheadProfitPct: number,
  vatPct: number,
  discount?: PreviewDiscount,
  roundingUnit?: number | null,
): number {
  const round2 = (v: number) => roundTo(v, 2);
  const direct = round2(newDirectCost);
  const oh = round2(direct * (overheadProfitPct / 100));
  const beforeDiscount = round2(direct + oh);
  const beforeVat = round2(beforeDiscount - previewDiscount(beforeDiscount, discount));
  // ปัดยอดด้วยสูตรเดียวกับเซิร์ฟเวอร์ (shared-types) — พรีวิวต้องเท่ากับยอดที่จะบันทึกจริง
  return applyNetRounding(beforeVat, vatPct, roundingUnit).netPrice;
}

/** ส่วนลดของเวอร์ชันในรูปที่พรีวิวกิน — % คิดใหม่ตามยอด, จำนวนเงินคงที่ใช้ค่าเดิม */
function versionDiscount(version: ProjectVersionDto): PreviewDiscount {
  return version.discountPct != null
    ? { pct: Number(version.discountPct), amt: 0 }
    : { pct: null, amt: Number(version.discountAmt) };
}

/** state + ตัวจัดการทั้งหมดของหน้าโครงการ — ส่วนแสดงผลรับไปทั้งก้อนผ่าน ProjectVM */
function useProjectDetailState() {
  const confirm = useConfirm();
  const toast = useToast();
  const { id } = useParams<{ id: string }>();
  const projectId = id!;

  const [detail, setDetail] = useState<ProjectDetailDto | null>(null);
  const [categories, setCategories] = useState<WorkCategoryDto[]>([]);
  const [materials, setMaterials] = useState<MaterialDto[]>([]);
  const [quotes, setQuotes] = useState<QuoteDto[]>([]);
  // แก้วันยืนราคาของใบที่ส่งแล้ว — เปิดทีละใบเป็นแถวใต้ใบนั้น
  const [validityEdit, setValidityEdit] = useState<{ quoteId: string; value: string } | null>(null);
  const [savingValidity, setSavingValidity] = useState(false);
  // อัตรากำไรแก้ได้เฉพาะ OWNER (เซิร์ฟเวอร์ปฏิเสธด้วย) — ADMIN ยังแก้ VAT/ส่วนลดได้
  const { user } = useAuth();
  const canEditMargin = user?.role === "OWNER";
  const [contracts, setContracts] = useState<ContractDto[]>([]);
  // แม่แบบสัญญาที่เลือกได้ตอนออกสัญญา — เส้นทาง API รับ templateId อยู่แล้ว
  // แต่เดิมหน้านี้ไม่เคยส่งไป จึงใช้ตัวค่าเริ่มต้นเสมอ เลือกตัวอื่นไม่ได้เลย
  const [contractTemplates, setContractTemplates] = useState<ContractTemplateDto[]>([]);
  const [newContractTemplateId, setNewContractTemplateId] = useState("");
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  // รายงานสรุปวัสดุ (ถอดปริมาณ) — โหลดตอนเปิดการ์ด, รีเฟรชเมื่อ BOQ เปลี่ยน
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const [showSaveTemplateForm, setShowSaveTemplateForm] = useState(false);
  const [showVersionCompare, setShowVersionCompare] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDescription, setNewTemplateDescription] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);

  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerDto[]>([]);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [assigningCustomer, setAssigningCustomer] = useState(false);

  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [accessLinkForm, setAccessLinkForm] = useState({ email: "", fullName: "", phone: "" });
  const [issuingLink, setIssuingLink] = useState(false);
  // ลิงก์เข้าใช้ที่เพิ่งสร้าง — โชว์ให้พนักงานคัดลอกไปส่งลูกค้า
  const [accessLink, setAccessLink] = useState<CustomerAccessLinkResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [unlinkedLeads, setUnlinkedLeads] = useState<LeadDto[]>([]);
  // นับเฉพาะตอนโครงการยังไม่ผูกทั้งลูกค้าและคำขอ (การ์ดถามว่า "งานนี้ของลูกค้าคนไหน?") · null = ยังไม่รู้ ไม่โชว์ตัวเลข
  const [pendingLeadCount, setPendingLeadCount] = useState<number | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [linkingLead, setLinkingLead] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD_FORM);
  // สูตรวัสดุย่อยของบรรทัดที่กำลังเพิ่ม (ว่าง = วัสดุก้อนเดียว / ให้ระบบดึงจากแคตตาล็อกถ้ามี)
  const [addComponents, setAddComponents] = useState<ComponentRow[]>([]);
  // ใบถอดแบบของบรรทัดที่กำลังเพิ่ม (ฐาน "ถอดจากแบบ") — ส่งไปพร้อมบรรทัดตอนกดบันทึก
  const [addSheetRows, setAddSheetRows] = useState<TakeoffRowInput[]>([]);
  // ใบถอดแบบที่เปิดจากตาราง (กดที่ "ใบถอดแบบ N แถว") — บันทึกตรงไม่ต้องเข้าโหมดแก้ไข
  const [sheetItem, setSheetItem] = useState<BoqItemDto | null>(null);
  const [tileItem, setTileItem] = useState<BoqItemDto | null>(null);
  const [showStructural, setShowStructural] = useState(false);
  // เครื่องมือคิดน้ำหนักเหล็กเส้น (กก. = ความยาว × d²/162) สำหรับกรอกเป็นปริมาณของบรรทัดเหล็ก
  const [rebarOpen, setRebarOpen] = useState(false);
  const [rebarDia, setRebarDia] = useState("12");
  const [rebarLen, setRebarLen] = useState("");

  // บรรทัดที่ราคาในคลังเปลี่ยนหลังตั้งราคา (จากแถบเตือน) — ใช้ขึ้นจุดส้มบนแท็บหมวดที่มีบรรทัดพวกนี้
  const [driftItemIds, setDriftItemIds] = useState<Set<string>>(new Set());
  // ยุบ/กางหมวดย่อย (ระดับ 2) แยกจากหมวดใหญ่ — หมวดใหญ่บางหมวดมีหลายสิบบรรทัด
  const [collapsedSubs, setCollapsedSubs] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editMaterialPrice, setEditMaterialPrice] = useState("");
  const [editLaborPrice, setEditLaborPrice] = useState("");
  const [editNote, setEditNote] = useState("");
  // สลับวัสดุของบรรทัดในโหมดแก้ไข ("" = รายการกรอกเอง/ไม่ผูกวัสดุ)
  const [editMaterialId, setEditMaterialId] = useState("");
  const [editName, setEditName] = useState("");
  const [editUnit, setEditUnit] = useState("");
  // แก้ take-off ของบรรทัด PER_AREA (สัมประสิทธิ์ต่อ 1 ตร.ม. + เผื่อเสีย); MANUAL แก้ที่ editQuantity
  const [editBasis, setEditBasis] = useState<QtyBasis>("MANUAL");
  const [editCoefficient, setEditCoefficient] = useState("");
  const [editWaste, setEditWaste] = useState("");
  // เครื่องมือคิดน้ำหนักเหล็ก (กก. = ความยาว × d²/162) ในโหมดแก้บรรทัด MANUAL — เหมือนในฟอร์มเพิ่ม
  const [editRebarOpen, setEditRebarOpen] = useState(false);
  const [editRebarDia, setEditRebarDia] = useState("12");
  const [editRebarLen, setEditRebarLen] = useState("");
  // สูตรวัสดุย่อยของบรรทัดที่กำลังแก้ (โหลดจาก snapshot เดิมตอน startEdit; ส่งกลับทั้งชุดตอนบันทึก)
  const [editComponents, setEditComponents] = useState<ComponentRow[]>([]);
  const [editSheetRows, setEditSheetRows] = useState<TakeoffRowInput[]>([]);

  // ราคาโครงการกำหนดเอง (CUSTOM) — พนักงานกรอกยอดก่อน VAT
  const [customPriceInput, setCustomPriceInput] = useState("");
  const [savingCustomPrice, setSavingCustomPrice] = useState(false);
  // แผงแก้อัตราค่าดำเนินการ+กำไร / VAT (เดิมตั้งได้ครั้งเดียวตอนสร้างโครงการ แก้ทีหลังไม่ได้เลย)
  const [showRates, setShowRates] = useState(false);
  const [ohInput, setOhInput] = useState("");
  // ช่องใหม่: ในอัตรารวมข้างบน ส่วนไหนเป็นค่าดำเนินการ — ว่าง = ยังไม่แยก (กำไรคำนวณให้ดูสด ๆ)
  // จงใจไม่ทำเป็นสองช่อง "ค่าดำเนินการ/กำไร" แทนช่องรวม เพราะจะทำให้คนที่แค่อยากขยับอัตรารวม
  // จาก 10% เป็น 12% ต้องตัดสินใจเรื่องการแบ่งไปด้วยทุกครั้ง ทั้งที่เป็นคนละเรื่องกัน
  const [overheadInput, setOverheadInput] = useState("");
  const [vatInput, setVatInput] = useState("");
  // ค่าเผื่อเหลือเผื่อขาด % ของต้นทุนตรง — ว่าง = ไม่เผื่อ
  const [contingencyInput, setContingencyInput] = useState("");
  // ส่วนลดอยู่ในแผงเดียวกับอัตรา เพราะทั้งสามอย่างคือ "การต่อรองราคา" ครั้งเดียวกัน
  // กดบันทึกทีเดียวจบ ไม่ต้องแยกเป็นสองรอบให้เกิดสองเวอร์ชันโดยไม่จำเป็น (BR-07)
  const [discMode, setDiscMode] = useState<"NONE" | "PERCENT" | "AMOUNT">("NONE");
  const [discInput, setDiscInput] = useState("");
  const [discNote, setDiscNote] = useState("");
  // ปัดยอดสุทธิ — "" = ไม่ปัด, ไม่งั้นคือหน่วยบาทเป็นข้อความ ("1" / "100" / "1000" / "10000")
  const [roundInput, setRoundInput] = useState("");
  const [savingRates, setSavingRates] = useState(false);
  // สัญญาที่กำลังกางช่องแก้ข้อความอยู่ (ทีละฉบับ เพราะแผงสูงมาก)
  const [editingContractId, setEditingContractId] = useState<string | null>(null);

  // แก้ไขรายละเอียดโครงการ (ชื่อ/สถานที่ก่อสร้าง/พื้นที่/ช่วงเวลา/หมายเหตุ)
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  // ช่องเปิดประตู/หน้าต่างในฟอร์มแก้รายละเอียด — undefined = ยังไม่แตะ (ไม่ส่งไปแก้)
  const [infoOpenings, setInfoOpenings] = useState<ProjectOpeningDto[] | undefined>(undefined);
  const [showOpenings, setShowOpenings] = useState(false);
  const [infoForm, setInfoForm] = useState({
    name: "",
    siteAddress: "",
    areaSqm: "",
    wallAreaSqm: "",
    perimeterM: "",
    concreteVolumeM3: "",
    footprintSqm: "",
    bathrooms: "",
    floors: "",
    startDate: "",
    targetEndDate: "",
    description: "",
  });

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const itemCategories = useMemo(() => categories.filter((c) => c.level === "ITEM"), [categories]);
  // ตัวเลือก dropdown ที่ค้นหาได้ หมวดงานเก็บรหัส + เส้นทางเต็ม; วัสดุค้นทั้งแคตตาล็อก (ไม่ถูก
  // จำกัดด้วยหมวด) เพื่อให้เลือกวัสดุแล้วเติมค่าหมวดย้อนกลับได้
  const categoryOptions = useMemo<SearchableOption[]>(() => {
    // เฉพาะหมวดที่ยังใช้งานอยู่ (ทั้งตัวมันและบรรพบุรุษ) — หมวดที่เก็บเข้ากรุไม่ให้เพิ่มลง BOQ ใหม่
    const chainActive = (id: string): boolean => {
      let cur = categoryById.get(id);
      while (cur) {
        if (!cur.active) return false;
        if (!cur.parentId) break;
        cur = categoryById.get(cur.parentId);
      }
      return true;
    };
    return [...itemCategories]
      .filter((c) => chainActive(c.id))
      .sort((a, b) => byCode(a.code, b.code))
      .map((c) => {
        const path = buildCategoryPath(c.id, categoryById);
        return {
          value: c.id,
          label: c.code ? `${c.code} — ${path}` : path,
          keywords: `${c.code ?? ""} ${path}`,
        };
      });
  }, [itemCategories, categoryById]);
  // หมวดย่อยที่ใช้งานได้ — ที่วางรหัสงานใหม่ตอนนำเข้า Excel (รหัสในไฟล์ที่ระบบไม่รู้จัก)
  const subgroupOptions = useMemo<SearchableOption[]>(() => {
    const chainActive = (id: string): boolean => {
      for (let cur = categoryById.get(id); cur; cur = cur.parentId ? categoryById.get(cur.parentId) : undefined) {
        if (!cur.active) return false;
      }
      return true;
    };
    return categories
      .filter((c) => c.level === "SUBGROUP" && chainActive(c.id))
      .sort((a, b) => byCode(a.code, b.code))
      .map((c) => {
        const path = buildCategoryPath(c.id, categoryById);
        return { value: c.id, label: c.code ? `${c.code} — ${path}` : path, keywords: `${c.code ?? ""} ${path}` };
      });
  }, [categories, categoryById]);
  // หมวดระดับรายการ → หมวดบนสุด (A เตรียมการ / B โครงสร้าง …) ให้ปุ่มกรองในหน้าต่างเพิ่มหลายรายการ
  const topCategoryOf = useMemo(() => {
    const map = new Map<string, TopCategory>();
    for (const c of itemCategories) {
      let top = c;
      for (let parent = top.parentId ? categoryById.get(top.parentId) : undefined; parent; ) {
        top = parent;
        parent = top.parentId ? categoryById.get(top.parentId) : undefined;
      }
      const name = top.name.replace(/^หมวด(งาน)?\s*/, "") || top.name;
      map.set(c.id, { key: top.id, label: top.code ? `${top.code} ${name}` : name, sort: top.code ?? top.name });
    }
    return map;
  }, [itemCategories, categoryById]);
  // เฉพาะวัสดุที่ยังใช้งานอยู่ — ตัวที่ถูกปิดใช้งานไม่ควรถูกเลือกเข้า BOQ ใหม่ (แถวเก่าที่เคยใช้
  // ยังอยู่ได้เพราะราคาถูก snapshot ไว้แล้วในบรรทัด BOQ)
  const materialOptions = useMemo<SearchableOption[]>(
    () =>
      [...materials]
        .filter((m) => m.active)
        .sort((a, b) => byCode(a.code, b.code))
        .map((m) => ({
          value: m.id,
          label: m.code ? `${m.code} — ${m.name}` : m.name,
          keywords: `${m.code ?? ""} ${m.name}`,
        })),
    [materials],
  );
  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [
        projectRes,
        categoriesRes,
        materialsRes,
        quotesRes,
        contractsRes,
        templatesRes,
        contractTemplatesRes,
      ] = await Promise.all([
        getProject(projectId),
        listCategories(),
        listMaterials(),
        listQuotes(projectId),
        listContracts(projectId),
        listTemplates(),
        // ใส่รวมชุดเดียวกันได้ เพราะเส้นทางนี้ใช้ requireRole("OWNER","ADMIN") เหมือน
        // listContracts ที่อยู่ในชุดอยู่แล้ว — ไม่เพิ่มเงื่อนไขที่ทำให้ทั้งหน้าล้มใหม่
        listContractTemplates(),
      ]);
      setDetail(projectRes);
      setCategories(categoriesRes.categories);
      setMaterials(materialsRes.materials);
      setQuotes(quotesRes.quotes);
      setContracts(contractsRes.contracts);
      setTemplates(templatesRes.templates);
      setContractTemplates(contractTemplatesRes.templates);
      // คงตัวที่ผู้ใช้เลือกไว้ถ้ายังมีอยู่ ไม่งั้นตกกลับไปตัวค่าเริ่มต้น
      setNewContractTemplateId((cur) =>
        contractTemplatesRes.templates.some((t) => t.id === cur)
          ? cur
          : ((contractTemplatesRes.templates.find((t) => t.isDefault) ??
              contractTemplatesRes.templates[0])?.id ?? ""),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  // poll เบื้องหลัง เพื่อให้การตอบกลับของลูกค้า (ยอมรับ/ปฏิเสธ/ขอปรับแก้) ปรากฏโดยไม่ต้อง
  // โหลดใหม่เอง -- ข้ามการกะพริบของ loading-spinner ที่ `refresh()` ทำให้เกิด และดึงข้อมูลใหม่
  // เฉพาะส่วนที่การกระทำของลูกค้าเปลี่ยนได้จริง (ไม่ใช่แคตตาล็อกหมวด/วัสดุ/template ที่ใช้ร่วมกัน
  // ซึ่งไม่ขยับขณะเปิดหน้านี้อยู่)
  async function silentRefresh() {
    try {
      const [projectRes, quotesRes, contractsRes] = await Promise.all([
        getProject(projectId),
        listQuotes(projectId),
        listContracts(projectId),
      ]);
      setDetail(projectRes);
      setQuotes(quotesRes.quotes);
      setContracts(contractsRes.contracts);
    } catch {
      // เงียบไว้ -- การ poll เบื้องหลังที่ล้มเหลวไม่ควรรบกวนส่วนที่เหลือของหน้า
    }
  }

  // โหลดใบเสนอราคาใหม่อย่างเดียว (ใช้หลังจัดการไฟล์แนบ ไม่ต้องกะพริบทั้งหน้า)
  async function reloadQuotes() {
    try {
      const quotesRes = await listQuotes(projectId);
      setQuotes(quotesRes.quotes);
    } catch {
      /* เงียบไว้ */
    }
  }

  function openEditInfo() {
    if (!detail) return;
    const p = detail.project;
    setInfoForm({
      name: p.name,
      siteAddress: p.siteAddress ?? "",
      areaSqm: p.areaSqm ?? "",
      wallAreaSqm: p.wallAreaSqm ?? "",
      perimeterM: p.perimeterM ?? "",
      concreteVolumeM3: p.concreteVolumeM3 ?? "",
      footprintSqm: p.footprintSqm ?? "",
      bathrooms: p.bathrooms != null ? String(p.bathrooms) : "",
      floors: p.floors != null ? String(p.floors) : "",
      startDate: p.startDate ? p.startDate.slice(0, 10) : "",
      targetEndDate: p.targetEndDate ? p.targetEndDate.slice(0, 10) : "",
      description: p.description ?? "",
    });
    setInfoOpenings(undefined);
    setShowEditInfo(true);
  }

  async function handleSaveInfo() {
    if (!infoForm.name.trim()) return;
    setSavingInfo(true);
    // ค่าวัด: ว่าง = ล้างค่า (null), มีตัวเลข = ส่งเป็นตัวเลข
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    try {
      await updateProject(projectId, {
        name: infoForm.name.trim(),
        siteAddress: infoForm.siteAddress.trim() || null,
        areaSqm: num(infoForm.areaSqm),
        wallAreaSqm: num(infoForm.wallAreaSqm),
        perimeterM: num(infoForm.perimeterM),
        concreteVolumeM3: num(infoForm.concreteVolumeM3),
        footprintSqm: num(infoForm.footprintSqm),
        bathrooms: num(infoForm.bathrooms),
        floors: num(infoForm.floors),
        // ส่งเฉพาะเมื่อแก้รายการ — ไม่งั้นทุกการบันทึกรายละเอียดจะเขียนทับช่องเปิดเดิม
        ...(infoOpenings === undefined ? {} : { openings: infoOpenings }),
        startDate: infoForm.startDate || null,
        targetEndDate: infoForm.targetEndDate || null,
        description: infoForm.description.trim() || null,
      });
      setShowEditInfo(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกรายละเอียดไม่สำเร็จ");
    } finally {
      setSavingInfo(false);
    }
  }

  /** เปิดแผงแก้อัตรา — เติมค่าปัจจุบันไว้ให้ คนส่วนใหญ่แก้ตัวเดียวไม่ได้พิมพ์ใหม่ทั้งคู่ */
  function openRates() {
    const v = detail!.currentVersion;
    const split = splitOverheadProfit({
      directCost: Number(v.directCost),
      overheadProfitPct: Number(v.overheadProfitPct),
      overheadProfitAmt: Number(v.overheadProfitAmt),
      overheadPct: v.overheadPct != null ? Number(v.overheadPct) : null,
    });
    setOhInput(String(Number(v.overheadProfitPct)));
    // เวอร์ชันเก่าที่ยังไม่เคยแยก เปิดมาเป็นช่องว่าง — ไม่เติมตัวเลขเดาให้ เพราะการใส่ 0 ลงไป
    // เท่ากับประกาศว่า "ทั้งก้อนเป็นกำไร" ซึ่งเราไม่รู้ว่าจริงไหม
    setOverheadInput(split.known ? String(split.overheadPct) : "");
    setVatInput(String(Number(v.vatPct)));
    if (v.discountPct != null) {
      setDiscMode("PERCENT");
      setDiscInput(String(Number(v.discountPct)));
    } else if (Number(v.discountAmt) > 0) {
      setDiscMode("AMOUNT");
      setDiscInput(String(Number(v.discountAmt)));
    } else {
      setDiscMode("NONE");
      setDiscInput("");
    }
    setDiscNote(v.discountNote ?? "");
    setRoundInput(v.roundingUnit != null ? String(v.roundingUnit) : "");
    // 0% เผื่อเหลือเผื่อขาด = ไม่ได้เผื่อ ซึ่งเป็นค่าเดียวกับช่องว่าง — โชว์ว่างไว้จะอ่านง่ายกว่า
    setContingencyInput(Number(v.contingencyPct) > 0 ? String(Number(v.contingencyPct)) : "");
    setShowRates(true);
  }

  async function handleSaveRates() {
    if (!detail) return;
    const version = detail.currentVersion;
    const inputs = {
      oh: optionalNumber(ohInput),
      overhead: optionalNumber(overheadInput),
      vat: optionalNumber(vatInput),
    };
    // ส่วนลด: ค่าว่างในโหมด %/บาท = ยังไม่ได้กรอก ให้ถือว่าไม่มีส่วนลด
    const discValue = discInput === "" ? 0 : Number(discInput);
    const isCustomProject = detail.project.type === "CUSTOM";
    const contingency = optionalNumber(contingencyInput);
    const inputError =
      ratesInputError(inputs, Number(version.overheadProfitPct), discMode, discValue) ??
      (isCustomProject ? null : contingencyError(contingency));
    if (inputError) {
      toast.error(inputError);
      return;
    }
    const note = discNote.trim();
    const nextRounding = roundInput === "" ? null : Number(roundInput);
    const body = {
      ...ratesPatchOf(
        version,
        isCustomProject,
        inputs,
        discountPatchOf(discMode, discValue, note),
        note,
      ),
      ...(isCustomProject ? {} : contingencyPatchOf(version, contingency)),
      ...(nextRounding === (version.roundingUnit ?? null) ? {} : { roundingUnit: nextRounding }),
    };
    if (Object.keys(body).length === 0) {
      setShowRates(false);
      return;
    }

    // เวอร์ชันนี้ส่งใบเสนอราคาไปแล้ว = แก้ราคาจะกลายเป็นเวอร์ชันใหม่ ต้องบอกก่อน ไม่ใช่ให้รู้ทีหลัง
    if (!detail.editable) {
      const ok = await confirm(
        "เวอร์ชันนี้ส่งใบเสนอราคาไปแล้ว การแก้อัตราหรือส่วนลดจะสร้างเวอร์ชันใหม่ของโครงการ " +
          "(ใบเสนอราคาที่ส่งไปแล้วยังคงราคาเดิมไว้) ต้องการทำต่อหรือไม่?",
        { confirmLabel: "แก้ราคาและสร้างเวอร์ชันใหม่" },
      );
      if (!ok) return;
    }

    setSavingRates(true);
    try {
      await updateProjectRates(projectId, body);
      setShowRates(false);
      if (!detail.editable) {
        toast.info("ระบบสร้างเวอร์ชันใหม่ของโครงการแล้ว (เนื่องจากเวอร์ชันเดิมส่งใบเสนอราคาไปแล้ว)");
      }
      toast.success("บันทึกและคิดราคาใหม่แล้ว");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingRates(false);
    }
  }

  async function handleSetCustomPrice() {
    const subtotal = Number(customPriceInput);
    if (!Number.isFinite(subtotal) || subtotal < 0) return;
    setSavingCustomPrice(true);
    try {
      await setCustomPrice(projectId, subtotal);
      setCustomPriceInput("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกราคาไม่สำเร็จ");
    } finally {
      setSavingCustomPrice(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const timer = setInterval(silentRefresh, 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // โหลด/รีเฟรชสรุปวัสดุเมื่อเปิดการ์ด และเมื่อ BOQ เปลี่ยน (ต้นทุนตรงขยับ = เวอร์ชันถูกแก้)

  useEffect(() => {
    if (!showCustomerSearch) return;
    setSearchingCustomers(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchCustomers(customerQuery || undefined);
        setCustomerResults(res.customers);
      } finally {
        setSearchingCustomers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [customerQuery, showCustomerSearch]);

  async function handleAssignCustomer(next: CustomerDto | null) {
    const prev = detail?.project.customer ?? null;
    if (next && next.id === prev?.id) return;
    // ลูกค้าเห็นใบเสนอราคา/สัญญาผ่าน project.customerId — เปลี่ยน/เลิกผูกหลังส่งใบไปแล้ว
    // ลูกค้าเดิมจะมองไม่เห็นใบเหล่านั้นอีกทันที จึงถามก่อน (ยังไม่เคยส่ง = เปลี่ยนได้เลย)
    const sent = quotes.filter((q) => q.sentAt).length;
    if (prev && sent > 0) {
      const ok = await confirm(
        next
          ? `ใบเสนอราคาที่ส่งแล้ว ${sent} ใบ จะย้ายไปอยู่ในพอร์ทัลของ ${next.fullName} — ${prev.fullName} จะไม่เห็นใบเหล่านี้อีก`
          : `เลิกผูก ${prev.fullName}? ใบเสนอราคาที่ส่งแล้ว ${sent} ใบจะหายจากพอร์ทัลของลูกค้าคนนี้`,
        { confirmLabel: next ? "เปลี่ยนลูกค้า" : "เลิกผูกลูกค้า", variant: "danger" },
      );
      if (!ok) return;
    }
    setAssigningCustomer(true);
    try {
      await updateProject(projectId, { customerId: next?.id ?? null });
      setShowCustomerSearch(false);
      setCustomerQuery("");
      toast.success(next ? `ผูกกับลูกค้า ${next.fullName} แล้ว` : "เลิกผูกลูกค้าแล้ว");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกลูกค้าไม่สำเร็จ");
    } finally {
      setAssigningCustomer(false);
    }
  }

  // ไอเดียที่ 1: เติมอีเมลของ lead ล่วงหน้าในตัวเลือก (มีโอกาสตรงกับบัญชีที่ลงทะเบียนไว้มากสุด
  // เพราะอีเมลคือตัวตนที่ใช้ล็อกอิน) เพื่อให้ลูกค้าที่ตรงกันปรากฏขึ้นมาทันที
  // เปลี่ยนลูกค้า (ผูกอยู่แล้ว) ไม่เติม — เปิดมาเห็นลูกค้าล่าสุดเลย ไม่ใช่ค้นซ้ำหาคนเดิม
  function openCustomerSearch() {
    setCustomerQuery(detail?.project.customer ? "" : (detail?.lead?.email ?? detail?.lead?.name ?? ""));
    setShowCreateCustomer(false);
    setShowLeadPicker(false);
    setShowCustomerSearch((v) => !v);
  }

  // ไอเดียที่ 2: เปิดฟอร์ม "สร้างบัญชีจากคำขอ + ออกลิงก์" เติมรายละเอียดของ lead ไว้ล่วงหน้า
  function openCreateCustomer() {
    const lead = detail?.lead;
    setAccessLinkForm({
      email: lead?.email ?? "",
      fullName: lead?.name ?? "",
      phone: lead?.phone ?? "",
    });
    setAccessLink(null);
    setShowCustomerSearch(false);
    setShowLeadPicker(false);
    setShowCreateCustomer((v) => !v);
  }

  // ออกลิงก์เข้าใช้: fromForm=true ใช้ข้อมูลในฟอร์ม (สร้างบัญชีจากคำขอ); false = ลูกค้าผูกอยู่แล้ว
  // (ส่ง body ว่าง ให้ backend ใช้ลูกค้าเดิม เช่น ออกลิงก์ใหม่ตอนลูกค้าลืมรหัส)
  async function handleIssueAccessLink(fromForm: boolean) {
    // ลูกค้าใหม่ที่ไม่มีคำขอ: ไม่มีข้อมูลให้ดึง ต้องกรอกเองครบ (เซิร์ฟเวอร์ตรวจซ้ำอีกชั้น)
    if (fromForm && (!accessLinkForm.email.trim() || !accessLinkForm.fullName.trim())) {
      toast.error("กรอกอีเมลและชื่อ-นามสกุลของลูกค้า");
      return;
    }
    setIssuingLink(true);
    try {
      const res = await issueCustomerAccessLink(projectId, fromForm ? accessLinkForm : undefined);
      setAccessLink(res);
      setLinkCopied(false);
      setShowCreateCustomer(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "สร้างลิงก์เข้าใช้ไม่สำเร็จ");
    } finally {
      setIssuingLink(false);
    }
  }

  async function copyAccessLink() {
    if (!accessLink) return;
    try {
      await navigator.clipboard.writeText(accessLink.url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // เบราว์เซอร์บางตัวบล็อก clipboard — พนักงานเลือกคัดลอกเองจากช่องได้
    }
  }

  // ผูกย้อนหลัง: เปิดตัวเลือกรายการ lead ที่ยังไม่มีโปรเจกต์ (และยังไม่ถูกปิด/ปฏิเสธ) เพื่อให้
  // โปรเจกต์เปล่าถูกโยงกลับไปยังคำขอที่มันควรเป็นของได้
  async function openLeadPicker() {
    const next = !showLeadPicker;
    setShowCustomerSearch(false);
    setShowCreateCustomer(false);
    setShowLeadPicker(next);
    if (!next) return;
    setLoadingLeads(true);
    try {
      const res = await listLeads();
      setUnlinkedLeads(res.leads.filter(isOpenLead));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "โหลดคำขอไม่สำเร็จ");
    } finally {
      setLoadingLeads(false);
    }
  }

  // โครงการที่ยังไม่ผูกอะไรเลย: นับคำขอที่รอโครงการไว้โชว์บนทางเลือก "มาจากคำขอ"
  const needsOwner = Boolean(detail && !detail.project.customer && !detail.lead);
  useEffect(() => {
    if (!needsOwner) return;
    let stale = false;
    listLeads()
      .then((res) => {
        if (!stale) setPendingLeadCount(res.leads.filter(isOpenLead).length);
      })
      .catch(() => {
        if (!stale) setPendingLeadCount(null);
      });
    return () => {
      stale = true;
    };
  }, [needsOwner]);

  async function handleLinkLead(leadId: string) {
    setLinkingLead(true);
    try {
      await linkLeadToProject(projectId, leadId);
      setShowLeadPicker(false);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เลือกคำขอไม่สำเร็จ");
    } finally {
      setLinkingLead(false);
    }
  }

  async function handleTransition(toStatus: ProjectStatus) {
    if (!(await confirm(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[toStatus]}" ใช่หรือไม่?`, { confirmLabel: "เปลี่ยนสถานะ" })))
      return;
    setTransitioning(true);
    try {
      await transitionProject(projectId, toStatus);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setTransitioning(false);
    }
  }

  // เลื่อนไปยังส่วนใบเสนอราคา/สัญญา/รายละเอียดโครงการ จากปุ่มในส่วนอื่นของหน้า
  //
  // ตั้งแต่แบ่งแท็บ ปลายทางอาจอยู่คนละแท็บ = ยังไม่ถูกเรนเดอร์ ต้องสลับแท็บก่อนแล้วรอให้ React
  // วาดเสร็จค่อยเลื่อน (rAF ซ้อนสองชั้น: ชั้นแรกได้ commit ชั้นที่สองได้ layout จริง)
  function scrollToSection(id: string) {
    const target = SECTION_TAB[id];
    if (target && target !== tab) goTab(target);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    );
  }

  function selectMaterial(materialId: string) {
    // ถูกล้างค่า -> กลับไปใช้เส้นทางกรอกเอง โดยเก็บสิ่งที่พิมพ์ไว้
    if (!materialId) {
      setAddForm((f) => ({ ...f, materialId: "" }));
      return;
    }
    const material = materials.find((m) => m.id === materialId);
    setAddForm((f) => ({
      ...f,
      materialId,
      // Picking a material back-fills its หมวดงาน so the estimator doesn't hunt for it.
      categoryId: material?.categoryId ?? f.categoryId,
      name: material?.name ?? f.name,
      unit: material?.unit ?? f.unit,
      materialUnitPrice: material?.materialUnitPrice ?? f.materialUnitPrice,
      laborUnitPrice: material?.laborUnitPrice ?? f.laborUnitPrice,
    }));
    // สูตรของวัสดุในคลังโผล่เป็นแถวให้เห็น/แก้ได้เลย (เดิมซ่อนไว้แล้วให้เซิร์ฟเวอร์ดึงเองตอนบันทึก
    // ผู้ใช้จึงไม่รู้ว่าค่าวัสดุมาจากไหน) · วัสดุไม่มีสูตร = กลับเป็นใส่ราคาเอง
    if (material) setAddComponents(componentRowsFrom(material.components));
  }

  /** ตารางแสดงทีละหมวด — เปิดหมวดที่เพิ่งรับบรรทัดใหม่ ไม่งั้นบรรทัดใหม่มองไม่เห็นจนดูเหมือนหาย */
  function revealCategory(categoryId: string, focusId?: string) {
    openBoqGroup(boqRootOf(categoryId, categoryById).key);
    // หมวดยาวแบ่งหลายหน้า — พาไปหน้าที่บรรทัดใหม่อยู่ (เพิ่มหลายรายการไม่รู้ id = คงหน้าเดิม)
    if (focusId) setBoqFocusId(focusId);
    // หมวดย่อยที่รับบรรทัดใหม่อาจถูกยุบอยู่ — กางให้
    // (คีย์ของก้อนหมวดย่อย = rootId-subId-ลำดับก้อน จึงล้างทุกก้อนของหมวดย่อยนั้น)
    const addedRoot = boqRootOf(categoryId, categoryById).id;
    const addedSub = categoryParts(categoryId, categoryById).sub?.id;
    if (addedSub) {
      const prefix = `${addedRoot}-${addedSub}-`;
      setCollapsedSubs((prev) => new Set([...prev].filter((k) => !k.startsWith(prefix))));
    }
  }

  /** คืน true เมื่อบันทึกสำเร็จ · keepOpen = ล้างฟอร์มไว้กรอกบรรทัดถัดไป (หมวดงานเดิมคงไว้) */
  async function submitAdd(opts: { keepOpen?: boolean } = {}): Promise<boolean> {
    const usesSheet = addForm.qtyBasis === "SHEET";
    const usesDriver = addForm.qtyBasis !== "MANUAL" && !usesSheet;
    const material = addForm.materialId ? materials.find((m) => m.id === addForm.materialId) : undefined;
    // เดิมกดบันทึกแล้วเงียบไปเฉย ๆ เมื่อขาดช่อง — บอกให้รู้ว่าขาดอะไร
    const problem = (() => {
      if (!addForm.categoryId) return "เลือกหมวดงานก่อน";
      if (!material && !addForm.name.trim()) return "กรอกชื่อรายการ หรือเลือกวัสดุจากคลัง";
      if (!material && !addForm.unit.trim()) return "เลือกหน่วยนับ";
      if (usesSheet && addSheetRows.length === 0) return "กรอกใบถอดแบบก่อนบันทึก";
      if (usesDriver && !(Number(addForm.qtyCoefficient) > 0)) return "กรอกปริมาณต่อ 1 หน่วยของค่าวัด";
      if (!usesSheet && !usesDriver && !(Number(addForm.quantity) > 0)) return "กรอกจำนวน (มากกว่า 0)";
      return null;
    })();
    if (problem) {
      toast.error(problem);
      return false;
    }
    // สูตรที่พนักงานกรอกเอง: ถ้ามี ให้ส่งไป (ทับราคาวัสดุ); ถ้าไม่กรอกและเลือกวัสดุแคตตาล็อกที่มีสูตร
    // ปล่อยเป็น undefined เพื่อให้เซิร์ฟเวอร์ดึงสูตรจากแคตตาล็อกมาให้เอง
    const addRecipe = componentRowsToInput(addComponents);
    const hasRecipe = addRecipe.length > 0;
    // ผูกวัสดุในคลัง: ส่งราคาเฉพาะช่องที่แก้ทับราคาคลังจริง — เดิมไม่ส่งเลย ราคาที่พิมพ์แก้จึงหายเงียบ
    // (เซิร์ฟเวอร์ถือว่าค่าที่ส่งมาชนะค่าคลัง · ไม่ได้แก้ = ปล่อยให้ใช้ค่าคลังตามเดิม)
    const overrides = (field: "materialUnitPrice" | "laborUnitPrice") =>
      material !== undefined && Number(addForm[field] || 0) !== Number(material[field]);
    try {
      const added = await addBoqItem(projectId, {
        categoryId: addForm.categoryId,
        materialId: material?.id,
        name: material ? undefined : addForm.name.trim(),
        unit: material ? undefined : addForm.unit.trim(),
        materialUnitPrice:
          !material || (overrides("materialUnitPrice") && !hasRecipe) ? Number(addForm.materialUnitPrice || 0) : undefined,
        laborUnitPrice: !material || overrides("laborUnitPrice") ? Number(addForm.laborUnitPrice || 0) : undefined,
        qtyBasis: addForm.qtyBasis,
        quantity: usesDriver || usesSheet ? undefined : Number(addForm.quantity),
        qtyCoefficient: usesDriver ? Number(addForm.qtyCoefficient) : undefined,
        wasteFactorPct: usesDriver || usesSheet ? Number(addForm.wasteFactorPct || 0) : undefined,
        takeoffRows: usesSheet ? addSheetRows : undefined,
        note: addForm.note.trim() || undefined,
        // ผูกวัสดุคลัง: ส่งเสมอ — [] = ผู้ใช้เลือก "ใส่ราคาเอง" (เซิร์ฟเวอร์ถือว่าตั้งใจไม่แตกวัสดุ
        // ไม่ดึงสูตรคลังมาทับ) · กรอกเอง: ไม่มีสูตรก็ไม่ต้องส่ง
        components: material || hasRecipe ? addRecipe : undefined,
      });
      const addedCategoryId = addForm.categoryId;
      setAddForm(opts.keepOpen ? { ...EMPTY_ADD_FORM, categoryId: addedCategoryId } : EMPTY_ADD_FORM);
      setAddComponents([]);
      setAddSheetRows([]);
      setRebarOpen(false);
      if (!opts.keepOpen) setShowAddForm(false);
      // เพิ่มบรรทัดเปลี่ยนแค่ข้อมูลโครงการ — โหลดเงียบ ๆ ไม่ต้องขึ้นโครงร่างทั้งหน้า (ซึ่งถอดฟอร์มทิ้ง
      // แล้วสร้างใหม่ หน้ากระพริบ และโฟกัสของ "บันทึก + เพิ่มต่อ" หลุด)
      await silentRefresh();
      revealCategory(addedCategoryId, added.item.id);
      if (opts.keepOpen) toast.success("เพิ่มแล้ว — กรอกรายการถัดไปได้เลย");
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มรายการไม่สำเร็จ");
      return false;
    }
  }

  function startEdit(item: BoqItemDto) {
    setEditingId(item.id);
    setEditQuantity(item.quantity);
    setEditMaterialPrice(item.materialUnitPrice);
    setEditLaborPrice(item.laborUnitPrice);
    setEditNote(item.note ?? "");
    setEditBasis((item.qtyBasis as QtyBasis) ?? "MANUAL");
    setEditCoefficient(item.qtyCoefficient ?? "1");
    setEditWaste(item.wasteFactorPct ?? "0");
    setEditMaterialId(item.materialId ?? "");
    setEditName(item.name);
    setEditUnit(item.unit);
    setEditRebarOpen(false);
    setEditRebarLen("");
    setEditSheetRows(takeoffInputsOf(item.takeoffRows));
    setEditComponents(componentRowsFrom(item.components));
  }

  // สลับวัสดุของบรรทัดที่กำลังแก้ไข → ดึงชื่อ/หน่วย/ราคาของวัสดุใหม่มาแทน (แก้ราคาต่อทับได้)
  function selectEditMaterial(materialId: string) {
    setEditMaterialId(materialId);
    if (!materialId) return;
    const material = materials.find((m) => m.id === materialId);
    if (material) {
      setEditName(material.name);
      setEditUnit(material.unit);
      setEditMaterialPrice(material.materialUnitPrice);
      setEditLaborPrice(material.laborUnitPrice);
      // สลับวัสดุ → แทนสูตรวัสดุย่อยด้วยสูตรของวัสดุใหม่ (หรือล้างเป็นก้อนเดียวถ้าวัสดุใหม่ไม่มีสูตร)
      setEditComponents(componentRowsFrom(material.components));
    }
  }

  async function submitEdit(itemId: string) {
    const usesSheet = editBasis === "SHEET";
    const usesDriver = editBasis !== "MANUAL" && !usesSheet;
    if (usesSheet && editSheetRows.length === 0) {
      toast.error("กรอกใบถอดแบบก่อนบันทึก");
      return;
    }
    try {
      await updateBoqItem(projectId, itemId, {
        qtyBasis: editBasis,
        // ฐานอ้างค่าวัด: ส่งสัมประสิทธิ์ + เผื่อเสีย (เซิร์ฟเวอร์ถอดปริมาณจากค่าวัด); MANUAL: ส่งปริมาณ
        // ใบถอดแบบ: ส่งแถวทั้งชุด + เผื่อเสีย (เซิร์ฟเวอร์รวมเอง)
        quantity: usesDriver || usesSheet ? undefined : Number(editQuantity),
        qtyCoefficient: usesDriver ? Number(editCoefficient) : undefined,
        wasteFactorPct: usesDriver || usesSheet ? Number(editWaste || 0) : undefined,
        takeoffRows: usesSheet ? editSheetRows : undefined,
        // สลับวัสดุ + ชื่อ/หน่วยที่ตามมา ("" = ไม่ผูกวัสดุ → null)
        materialId: editMaterialId || null,
        name: editName.trim() || undefined,
        unit: editUnit.trim() || undefined,
        materialUnitPrice: Number(editMaterialPrice),
        laborUnitPrice: Number(editLaborPrice),
        note: editNote.trim() || null,
        // ส่งสูตรปัจจุบันทั้งชุด (round-trip): [] = ล้างสูตรกลับเป็นวัสดุก้อนเดียว; มีรายการ = แทนทั้งชุด
        components: componentRowsToInput(editComponents),
      });
      setEditingId(null);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.info("ระบบสร้างเวอร์ชันใหม่ของ BOQ แล้ว (เนื่องจากมีการส่งใบเสนอราคาไปก่อนหน้านี้) กรุณาลองแก้ไขอีกครั้ง");
        setEditingId(null);
        await refresh();
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "แก้ไขไม่สำเร็จ");
    }
  }

  /** บันทึกใบถอดแบบที่เปิดจากตาราง (หรือเลิกใช้ — ปริมาณล่าสุดกลายเป็นจำนวนที่กรอกเอง) */
  async function saveItemSheet(item: BoqItemDto, rows: TakeoffRowInput[] | null, waste: number | null) {
    if (
      !rows &&
      !(await confirm(`เลิกใช้ใบถอดแบบของ “${item.name}”? แถวในใบจะถูกลบ ส่วนจำนวน ${item.quantity} ${item.unit} ยังอยู่`, {
        confirmLabel: "เลิกใช้ใบถอดแบบ",
        variant: "danger",
      }))
    ) {
      return;
    }
    try {
      await updateBoqItem(
        projectId,
        item.id,
        rows ? { qtyBasis: "SHEET", takeoffRows: rows, wasteFactorPct: waste } : { qtyBasis: "MANUAL", quantity: Number(item.quantity) },
      );
      setSheetItem(null);
      await silentRefresh();
      toast.success(rows ? "บันทึกใบถอดแบบแล้ว" : "เลิกใช้ใบถอดแบบแล้ว — ปริมาณล่าสุดยังอยู่ แก้เป็นตัวเลขได้ตามปกติ");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.info("ระบบสร้างเวอร์ชันใหม่ของ BOQ แล้ว (เนื่องจากมีการส่งใบเสนอราคาไปก่อนหน้านี้) กรุณาเปิดใบถอดแบบอีกครั้ง");
        setSheetItem(null);
        await silentRefresh();
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "บันทึกใบถอดแบบไม่สำเร็จ");
    }
  }

  /** บันทึกตัวคิดกระเบื้อง (หรือเลิกใช้) — วัสดุย่อยคิดที่เซิร์ฟเวอร์ด้วยสูตรเดียวกับพรีวิว */
  async function saveItemTile(item: BoqItemDto, payload: TileCalcApply | null, fallbackPrice?: number) {
    if (
      !payload &&
      !(await confirm(`เลิกใช้ตัวคิดกระเบื้องของ “${item.name}”? ค่าที่กรอกในตัวคิดจะหายไป ส่วนปริมาณ ${item.quantity} ${item.unit} ยังอยู่`, {
        confirmLabel: "เลิกใช้ตัวคิด",
        variant: "danger",
      }))
    ) {
      return;
    }
    try {
      await updateBoqItem(
        projectId,
        item.id,
        payload ?? { tileCalc: null, ...(fallbackPrice === undefined ? {} : { materialUnitPrice: fallbackPrice }) },
      );
      setTileItem(null);
      await silentRefresh();
      toast.success(payload ? "บันทึกตัวคิดกระเบื้องแล้ว" : "เลิกใช้ตัวคิดกระเบื้องแล้ว");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.info("ระบบสร้างเวอร์ชันใหม่ของ BOQ แล้ว (เนื่องจากมีการส่งใบเสนอราคาไปก่อนหน้านี้) กรุณาเปิดตัวคิดอีกครั้ง");
        setTileItem(null);
        await silentRefresh();
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "บันทึกตัวคิดกระเบื้องไม่สำเร็จ");
    }
  }

  async function handleDelete(itemId: string) {
    if (!(await confirm("ยืนยันการลบรายการนี้?", { confirmLabel: "ลบ", variant: "danger" }))) return;
    try {
      await deleteBoqItem(projectId, itemId);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        toast.info("ระบบสร้างเวอร์ชันใหม่ของ BOQ แล้ว (เนื่องจากมีการส่งใบเสนอราคาไปก่อนหน้านี้) กรุณาลองอีกครั้ง");
        await refresh();
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function handleCreateQuote() {
    // ยืนยันก่อนสร้าง — กันเผลอกดปุ่มแล้วได้ใบเสนอราคาร่างเกินมา
    if (
      !(await confirm("สร้างใบเสนอราคาฉบับใหม่จากราคาปัจจุบันใช่หรือไม่?", {
        confirmLabel: "สร้าง",
      }))
    )
      return;
    try {
      await createQuote(projectId);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "สร้างใบเสนอราคาไม่สำเร็จ");
    }
  }

  // ส่งออก Excel — ชื่อไฟล์ตั้งฝั่งนี้ (header ของเซิร์ฟเวอร์ใช้กับการเปิดลิงก์ตรง)
  const [exportingExcel, setExportingExcel] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  async function exportExcel(key: string, path: string, fileName: string) {
    setExportingExcel(key);
    try {
      await downloadFile(path, fileName);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ส่งออก Excel ไม่สำเร็จ");
    } finally {
      setExportingExcel(null);
    }
  }

  function exportBoqExcel() {
    if (!detail) return;
    const v = detail.currentVersion;
    void exportExcel(
      "boq",
      `/api/projects/${detail.project.id}/boq/export.xlsx`,
      `BOQ-${detail.project.projectNo}-v${v.versionNo}-ภายใน.xlsx`,
    );
  }

  function exportQuoteExcel(quoteId: string, quoteNo: string) {
    if (!detail) return;
    void exportExcel(quoteId, `/api/projects/${detail.project.id}/quotes/${quoteId}/export.xlsx`, `${quoteNo}-BOQ.xlsx`);
  }

  async function handleDeleteQuote(quoteId: string, quoteNo: string) {
    if (
      !(await confirm(`ลบใบเสนอราคาฉบับร่าง ${quoteNo}? (ลบได้เฉพาะฉบับที่ยังไม่ส่ง)`, {
        confirmLabel: "ลบ",
        variant: "danger",
      }))
    )
      return;
    try {
      await deleteQuote(projectId, quoteId);
      await reloadQuotes();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    }
  }

  async function handleQuoteTransition(quoteId: string, toStatus: QuoteStatus) {
    if (
      !(await confirm(`เปลี่ยนสถานะใบเสนอราคาเป็น "${QUOTE_STATUS_LABEL[toStatus]}" ใช่หรือไม่?`, {
        confirmLabel: "เปลี่ยนสถานะ",
      }))
    )
      return;
    try {
      await transitionQuote(projectId, quoteId, toStatus);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  function openValidity(q: QuoteDto) {
    const today = todayBangkok();
    // พ้นกำหนดแล้วเสนอวันใหม่ให้เลย (อีก 7 วัน) — ยังไม่พ้นก็เริ่มจากวันเดิม
    const start = q.validUntil && q.validUntil >= today ? q.validUntil : addDaysIso(today, 7);
    setValidityEdit((cur) => (cur?.quoteId === q.id ? null : { quoteId: q.id, value: start }));
  }

  async function saveValidity() {
    if (!validityEdit?.value) return;
    setSavingValidity(true);
    try {
      await setQuoteValidity(projectId, validityEdit.quoteId, validityEdit.value);
      setValidityEdit(null);
      toast.success("บันทึกวันยืนราคาแล้ว — แจ้งลูกค้าให้แล้ว");
      await reloadQuotes();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกวันยืนราคาไม่สำเร็จ");
    } finally {
      setSavingValidity(false);
    }
  }

  async function handleCreateContract() {
    try {
      await createContract(projectId, newContractTemplateId || undefined);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "สร้างสัญญาไม่สำเร็จ");
    }
  }

  async function handleSignContract(contractId: string) {
    if (!(await confirm("ยืนยันการลงนามสัญญานี้?", { confirmLabel: "ลงนาม" }))) return;
    try {
      await signContract(projectId, contractId);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลงนามไม่สำเร็จ");
    }
  }

  /** Surfaces a readable message instead of dropping raw JSON into a new tab. */
  async function submitSaveTemplate() {
    if (!newTemplateName.trim()) return;
    setSavingTemplate(true);
    try {
      await saveProjectAsTemplate(projectId, newTemplateName.trim(), newTemplateDescription.trim());
      setNewTemplateName("");
      setNewTemplateDescription("");
      setShowSaveTemplateForm(false);
      await refresh();
      toast.success("บันทึกเป็นแม่แบบเรียบร้อยแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกแม่แบบไม่สำเร็จ");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleApplyTemplate(templateId: string) {
    if (!(await confirm("นำรายการจากแม่แบบนี้เข้าโครงการ ใช่หรือไม่?", { confirmLabel: "นำเข้า" }))) return;
    setApplyingTemplateId(templateId);
    try {
      const result = await applyTemplateToProject(projectId, templateId);
      await refresh();
      toast.success(
        result.skippedCount > 0
          ? `เพิ่มรายการจากแม่แบบสำเร็จ ${result.appliedCount} รายการ (ข้าม ${result.skippedCount} รายการที่อ้างอิงข้อมูลที่ไม่มีแล้ว)`
          : `เพิ่มรายการจากแม่แบบสำเร็จ ${result.appliedCount} รายการ`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ใช้แม่แบบไม่สำเร็จ");
    } finally {
      setApplyingTemplateId(null);
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    // ข้อความเดียวกับหน้าแม่แบบ — ที่นี่ก็เป็นการย้ายเข้าถังขยะ ไม่ใช่ลบทิ้งถาวร
    if (
      !(await confirm("ย้ายแม่แบบนี้ไปถังขยะ? กู้คืนได้ภายหลังที่เมนูถังขยะ", {
        confirmLabel: "ลบ",
      }))
    )
      return;
    try {
      await deleteTemplate(templateId);
      toast.undo("ย้ายแม่แบบไปถังขยะแล้ว", async () => {
        await restoreTrashItem("template", templateId);
        await refresh();
      });
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบแม่แบบไม่สำเร็จ");
    }
  }

  // หน่วยที่ระบบใช้อยู่จริง — รวมจากแคตตาล็อกวัสดุ และจากบรรทัด BOQ ของโครงการนี้เอง
  // (บรรทัดที่เคยกรอกหน่วยเองไว้ ควรเลือกซ้ำได้ ไม่ต้องพิมพ์ใหม่ให้เสี่ยงสะกดต่าง)
  // อ่านจาก detail ตรง ๆ เพราะ items ถูก destructure หลัง early return ซึ่ง hook ข้ามไม่ได้
  const unitsInUse = useMemo(
    () => [
      ...new Set(
        [...materials.map((m) => m.unit), ...(detail?.items ?? []).map((i) => i.unit)].filter(
          Boolean,
        ),
      ),
    ],
    [materials, detail],
  );

  // ต้องเรียกก่อน early return ทั้งหมด — hook ห้ามถูกข้าม
  const { sentinelRef, stuck } = useStuckPastHeader();

  // แท็บอยู่ใน query string เพื่อให้รีเฟรช/ส่งลิงก์แล้วยังอยู่แท็บเดิม
  // ใช้ replace ไม่ให้ทุกครั้งที่กดแท็บไปกองอยู่ในประวัติการกดย้อนกลับ
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const legacyContractView = rawTab ? LEGACY_CONTRACT_TABS[rawTab] : undefined;
  const tab: ProjectTab = legacyContractView ? "contract" : isProjectTab(rawTab) ? rawTab : "overview";
  // มุมมองย่อย/สัญญาที่เลือกในแท็บสัญญาและการเงิน อยู่ใน URL เหมือนแท็บ (รีเฟรช/ส่งลิงก์แล้วอยู่ที่เดิม)
  const rawView = searchParams.get("view");
  const requestedContractView: ContractView | null = isContractView(rawView) ? rawView : (legacyContractView ?? null);
  const selectedContractParam = searchParams.get("contract");
  function goTab(next: ProjectTab) {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }
  // หมวดที่เปิดในแท็บ BOQ ก็อยู่ใน query string เช่นกัน (?cat=C) — ไม่มี = หน้าสรุปยอดทุกหมวด
  const boqCatParam = searchParams.get("cat");
  // หน้าของตาราง BOQ (?page=) — ผูกกับหมวดที่เปิด เปลี่ยนหมวด = กลับหน้า 1
  const boqPageParam = Math.max(1, Math.floor(Number(searchParams.get("page"))) || 1);
  // บรรทัดที่ต้องพาไปให้เห็น (เพิ่งเพิ่ม/เลื่อนลำดับ/เปิดแก้จากแท็บอื่น) — ตารางหาหน้าของมันแล้วเปิดให้
  const [boqFocusId, setBoqFocusId] = useState<string | null>(null);

  /** กลับขึ้นไปที่แถบหมวด — กดจากท้ายตารางยาว ๆ แล้วเนื้อหาใหม่จะได้ไม่เริ่มกลางจอ */
  function scrollToBoqTop() {
    requestAnimationFrame(() => {
      // วัดจากหมุดที่ไม่ติดจอ — ตัวแถบเองติดจออยู่ ตำแหน่งของมันไม่บอกว่าเลื่อนมาไกลแค่ไหน
      const anchor = document.getElementById("boq-group-anchor");
      // 48 = แถบหัวโครงการที่ติดจออยู่ (StickyPageHeader h-12)
      const top = anchor ? anchor.getBoundingClientRect().top - 48 : 0;
      if (top < 0) window.scrollTo({ top: window.scrollY + top });
    });
  }

  function openBoqGroup(key: string | null, scroll = false) {
    // แผงแก้ไขเป็นแถวในตาราง สลับหมวดแล้วแถวหายไปทั้งที่ยังไม่บันทึก จึงปิดให้ก่อน
    setEditingId(null);
    setBoqFocusId(null);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        // หมวดใหม่เริ่มหน้า 1 · เปิดหมวดเดิมซ้ำ (เช่น หลังเพิ่มบรรทัด) คงหน้าเดิมไว้
        if (params.get("cat") !== key) params.delete("page");
        if (key) params.set("cat", key);
        else params.delete("cat");
        return params;
      },
      { replace: true },
    );
    if (scroll) scrollToBoqTop();
  }

  /** เปลี่ยนหน้าตาราง BOQ — แผงแก้ไขที่ค้างอยู่ปิดก่อน (แถวของมันจะหายไปกับหน้าเดิม)
      keepEditing = ตารางพาไปหน้าของบรรทัดที่กำลังเปิดแก้เอง (แผงต้องอยู่ต่อ) */
  function setBoqPage(page: number, scroll = true, keepEditing = false) {
    if (!keepEditing) setEditingId(null);
    setBoqFocusId(null);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (page > 1) params.set("page", String(page));
        else params.delete("page");
        return params;
      },
      { replace: true },
    );
    if (scroll) scrollToBoqTop();
  }

  /** จากแท็บอื่น (เช่น สั่งซื้อวัสดุ) → เปิดแท็บ BOQ ที่หมวดของบรรทัด แล้วกางแผงแก้ไขของบรรทัดนั้น
      เปลี่ยน tab + cat ในการอัปเดตเดียว — เรียก goTab แล้ว openBoqGroup ต่อกันจะทับกันเอง */
  function editBoqLine(item: BoqItemDto) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("tab", "boq");
        params.set("cat", boqRootOf(item.categoryId, categoryById).key);
        params.delete("page");
        return params;
      },
      { replace: true },
    );
    startEdit(item);
    // หมวดยาวแบ่งหลายหน้า — ให้ตารางเปิดหน้าที่บรรทัดนี้อยู่
    setBoqFocusId(item.id);
    // แถวแก้ไขขึ้นหลังแท็บ BOQ วาดเสร็จ — ลองหาซ้ำสั้น ๆ (rAF ไม่ทำงานตอนแถบเบราว์เซอร์ซ่อน)
    let tries = 0;
    const reveal = () => {
      const row = document.querySelector("[data-boq-edit-row]");
      if (!row) {
        if (++tries < 20) setTimeout(reveal, 50);
        return;
      }
      row.scrollIntoView({ block: "start" });
      // หัวโครงการ + แถบหมวด + หัวตารางติดจอซ้อนกันอยู่ — วัดขอบล่างหัวตารางแล้วเลื่อนถอยให้หัวแผงแก้ไขไม่จมใต้มัน
      const head = row.closest("table")?.querySelector("thead");
      const hidden = (head?.getBoundingClientRect().bottom ?? 0) + 8 - row.getBoundingClientRect().top;
      if (hidden > 0) window.scrollBy({ top: -hidden });
    };
    setTimeout(reveal, 0);
  }

  // สรุปวัสดุโหลดตอนถูกเปิดเท่านั้น — เดิมเป็นแผงพับได้ ตอนนี้แท็บทำหน้าที่เปิด/ปิดแทน
  useEffect(() => {
  }, [tab]);

  // เงินตามสัญญาของงานนี้ (ภาพรวม + หัวการ์ดสัญญา) — โหลดใหม่เมื่อสลับแท็บ/มุมมอง/สัญญา หรือปิดแผงแก้สัญญา
  // เพราะการบันทึกรับเงินและงานเพิ่ม-ลดเกิดในแผงข้างใน ตัวเลขที่อื่นต้องตามทัน
  const contractMoney = useContractMoney(
    projectId,
    contracts,
    `${editingContractId}|${tab}|${rawView}|${selectedContractParam}`,
  );

  /** สัญญาที่ลงนามแล้วที่แท็บสัญญาและการเงินแสดงอยู่ — ไม่ได้เลือก = ฉบับที่เก็บเงินได้ฉบับแรก */
  const signedContracts = contracts.filter((c) => c.signedAt);
  const isLegacyContract = (id: string) => {
    const v = contractMoney.get(id);
    return Boolean(v && !v.hasPlan && v.contractAmount == null);
  };
  const activeContract =
    signedContracts.find((c) => c.id === selectedContractParam) ??
    signedContracts.find((c) => !isLegacyContract(c.id)) ??
    signedContracts[0] ??
    null;
  // ยังไม่ลงนามสักฉบับ = มีแต่งานเอกสาร · ลงนามแล้ว = เปิดมาที่เรื่องเงินก่อน
  const contractView: ContractView = activeContract ? (requestedContractView ?? "payments") : "documents";

  function setContractParams(patch: { view?: ContractView; contract?: string | null }) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("tab", "contract");
        if (patch.view) params.set("view", patch.view);
        if (patch.contract !== undefined) {
          if (patch.contract) params.set("contract", patch.contract);
          else params.delete("contract");
        }
        return params;
      },
      { replace: true },
    );
  }

  /** ไปที่งวดและรับเงินของสัญญาฉบับนั้น — ใช้จากการ์ดภาพรวม (ลิงก์จากแดชบอร์ดใช้ URL ตรง) */
  function openContractPanel(contractId: string) {
    setContractParams({ view: "payments", contract: contractId });
    setTimeout(() => {
      const el = document.getElementById("contracts-section");
      if (!el) return;
      el.scrollIntoView({ block: "start" });
      window.scrollBy({ top: -56 }); // แถบหัวโครงการที่ติดจอ
    }, 0);
  }

  return {
    confirm,
    toast,
    id,
    projectId,
    detail,
    setDetail,
    categories,
    setCategories,
    materials,
    setMaterials,
    quotes,
    setQuotes,
    validityEdit,
    setValidityEdit,
    savingValidity,
    setSavingValidity,
    user,
    canEditMargin,
    contracts,
    setContracts,
    contractTemplates,
    setContractTemplates,
    newContractTemplateId,
    setNewContractTemplateId,
    templates,
    setTemplates,
    loading,
    setLoading,
    error,
    setError,
    transitioning,
    setTransitioning,
    showSaveTemplateForm,
    setShowSaveTemplateForm,
    showVersionCompare,
    setShowVersionCompare,
    reordering,
    setReordering,
    newTemplateName,
    setNewTemplateName,
    newTemplateDescription,
    setNewTemplateDescription,
    savingTemplate,
    setSavingTemplate,
    applyingTemplateId,
    setApplyingTemplateId,
    showCustomerSearch,
    setShowCustomerSearch,
    customerQuery,
    setCustomerQuery,
    customerResults,
    setCustomerResults,
    searchingCustomers,
    setSearchingCustomers,
    assigningCustomer,
    setAssigningCustomer,
    showCreateCustomer,
    setShowCreateCustomer,
    accessLinkForm,
    setAccessLinkForm,
    issuingLink,
    setIssuingLink,
    accessLink,
    setAccessLink,
    linkCopied,
    setLinkCopied,
    showLeadPicker,
    setShowLeadPicker,
    unlinkedLeads,
    pendingLeadCount,
    setUnlinkedLeads,
    loadingLeads,
    setLoadingLeads,
    linkingLead,
    setLinkingLead,
    showAddForm,
    setShowAddForm,
    addForm,
    setAddForm,
    addComponents,
    addSheetRows,
    setAddSheetRows,
    sheetItem,
    setSheetItem,
    saveItemSheet,
    tileItem,
    setTileItem,
    saveItemTile,
    showStructural,
    setShowStructural,
    setAddComponents,
    rebarOpen,
    setRebarOpen,
    rebarDia,
    setRebarDia,
    rebarLen,
    setRebarLen,
    driftItemIds,
    setDriftItemIds,
    collapsedSubs,
    setCollapsedSubs,
    editingId,
    setEditingId,
    editQuantity,
    setEditQuantity,
    editMaterialPrice,
    setEditMaterialPrice,
    editLaborPrice,
    setEditLaborPrice,
    editNote,
    setEditNote,
    editMaterialId,
    setEditMaterialId,
    editName,
    setEditName,
    editUnit,
    setEditUnit,
    editBasis,
    setEditBasis,
    editCoefficient,
    setEditCoefficient,
    editWaste,
    setEditWaste,
    editRebarOpen,
    setEditRebarOpen,
    editRebarDia,
    setEditRebarDia,
    editRebarLen,
    setEditRebarLen,
    editComponents,
    editSheetRows,
    setEditSheetRows,
    setEditComponents,
    customPriceInput,
    setCustomPriceInput,
    savingCustomPrice,
    setSavingCustomPrice,
    showRates,
    setShowRates,
    ohInput,
    setOhInput,
    overheadInput,
    setOverheadInput,
    vatInput,
    setVatInput,
    contingencyInput,
    setContingencyInput,
    discMode,
    setDiscMode,
    discInput,
    setDiscInput,
    discNote,
    setDiscNote,
    roundInput,
    setRoundInput,
    savingRates,
    setSavingRates,
    editingContractId,
    setEditingContractId,
    contractMoney,
    openContractPanel,
    signedContracts,
    activeContract,
    contractView,
    setContractParams,
    showEditInfo,
    setShowEditInfo,
    savingInfo,
    setSavingInfo,
    infoForm,
    setInfoForm,
    categoryById,
    itemCategories,
    categoryOptions,
    subgroupOptions,
    topCategoryOf,
    materialOptions,
    materialById,
    refresh,
    silentRefresh,
    reloadQuotes,
    openEditInfo,
    handleSaveInfo,
    infoOpenings,
    setInfoOpenings,
    showOpenings,
    setShowOpenings,
    openRates,
    handleSaveRates,
    handleSetCustomPrice,
    handleAssignCustomer,
    openCustomerSearch,
    openCreateCustomer,
    handleIssueAccessLink,
    copyAccessLink,
    openLeadPicker,
    handleLinkLead,
    handleTransition,
    scrollToSection,
    selectMaterial,
    submitAdd,
    startEdit,
    editBoqLine,
    selectEditMaterial,
    submitEdit,
    handleDelete,
    handleCreateQuote,
    handleDeleteQuote,
    exportingExcel,
    exportBoqExcel,
    showImport,
    setShowImport,
    showBulkAdd,
    setShowBulkAdd,
    revealCategory,
    exportQuoteExcel,
    handleQuoteTransition,
    openValidity,
    saveValidity,
    handleCreateContract,
    handleSignContract,
    submitSaveTemplate,
    handleApplyTemplate,
    handleDeleteTemplate,
    unitsInUse,
    sentinelRef,
    stuck,
    searchParams,
    setSearchParams,
    rawTab,
    tab,
    goTab,
    boqCatParam,
    openBoqGroup,
    boqPageParam,
    setBoqPage,
    boqFocusId,
    setBoqFocusId,
  };
}

type ProjectState = ReturnType<typeof useProjectDetailState>;

/** ค่าวัดของโครงการ = ตัวขับของการถอดปริมาณแต่ละฐาน (null = ยังไม่ได้กรอกค่าวัดนั้น) */
function takeoffDriversOf(project: ProjectDetailDto["project"]): TakeoffDriversUi {
  const num = (v: string | null | undefined) => (v ? Number(v) : null);
  return {
    floorArea: num(project.areaSqm),
    // ผนังสุทธิ = ผนัง − ช่องเปิด (ประตู/หน้าต่าง) — ตรงกับ resolveDrivers ฝั่งเซิร์ฟเวอร์
    wallArea:
      project.wallAreaSqm == null
        ? null
        : Math.max(0, Math.round((Number(project.wallAreaSqm) - Number(project.openingAreaSqm ?? 0)) * 100) / 100),
    perimeter: num(project.perimeterM),
    volume: num(project.concreteVolumeM3),
    footprint: num(project.footprintSqm),
    bathrooms: project.bathrooms ?? null,
    floors: project.floors ?? null,
  };
}

/**
 * วันที่ของแต่ละขั้นสำหรับแถบขั้นตอน — ดึงจากเอกสารที่มีอยู่จริง (สร้างโครงการ, ใบเสนอราคาที่ส่ง
 * ครั้งแรก, ใบเสนอราคาที่ลูกค้ายอมรับ, วันที่กดส่งมอบ) — โครงการที่ส่งมอบก่อนระบบเก็บวันที่ไม่มีวันที่
 */
function stepDatesOf(
  project: ProjectDetailDto["project"],
  quotes: QuoteDto[],
): Partial<Record<ProjectStatus, string | null>> {
  const firstSentAt = quotes
    .filter((q) => q.sentAt)
    .map((q) => q.sentAt as string)
    // ISO 8601 รูปเดียวกันทุกตัว — เทียบแบบสตริงได้ลำดับเวลาถูกต้อง
    .sort((a, b) => a.localeCompare(b))[0];
  const acceptedAt = quotes.find((q) => q.status === "ACCEPTED")?.respondedAt ?? null;
  return {
    DRAFT: project.createdAt,
    QUOTED: firstSentAt ?? null,
    APPROVED: acceptedAt,
    COMPLETED: project.completedAt ?? null,
  };
}

/** เหตุผลที่ลูกค้าปฏิเสธ = หมายเหตุของใบเสนอราคาฉบับล่าสุดที่ถูกปฏิเสธ (ฉบับเลขสูงสุด) */
function rejectionReasonOf(quotes: QuoteDto[]): string | null {
  return (
    [...quotes].filter((q) => q.status === "REJECTED").sort((a, b) => b.revisionNo - a.revisionNo)[0]
      ?.customerNote ?? null
  );
}

/**
 * จัดกลุ่ม BOQ ตามรากหมวดงาน (เดินขึ้นสายพ่อแม่จนสุด) แล้วเรียงหมวดตาม sortOrder ของหมวดเอง
 * — ต้องตรงกับ groupBoqItemsByTopCategory ฝั่งเซิร์ฟเวอร์ที่ PDF/Excel/หน้าลูกค้าใช้ เดิมเรียงตาม
 * "บรรทัดแรกที่พบ" แล้วโครงการที่เพิ่มหมวด E ก่อน B ขึ้นจอเป็น E F B C แต่ใบเสนอราคาพิมพ์ B C E F
 */
function groupBoqByRoot(items: BoqItemDto[], categoryById: Map<string, WorkCategoryDto>): BoqGroup[] {
  const groups: BoqGroup[] = [];
  const byRoot = new Map<string, BoqGroup>();
  for (const item of items) {
    const root = boqRootOf(item.categoryId, categoryById);
    let g = byRoot.get(root.id);
    if (!g) {
      g = { rootId: root.id, rootName: root.name, code: root.code, key: root.key, items: [], subtotal: 0 };
      byRoot.set(root.id, g);
      groups.push(g);
    }
    g.items.push(item);
    g.subtotal += Number(item.lineTotal);
  }
  // sort ของ JS คงลำดับเดิมเมื่อค่าเท่ากัน — หมวดที่ sortOrder ซ้ำกันจึงเรียงตามที่พบเหมือนฝั่งเซิร์ฟเวอร์
  const orderOf = (g: BoqGroup) => categoryById.get(g.rootId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  return groups.sort((a, b) => orderOf(a) - orderOf(b));
}

/**
 * แถวสำหรับ render ของหมวดที่เปิด: [แถบหมวดย่อย → บรรทัด]
 * แถบหมวดย่อยขึ้นเมื่อหมวดย่อยเปลี่ยนจากบรรทัดก่อนหน้า (ไม่จัดเรียงใหม่ ลำดับบรรทัดตรงกับที่พิมพ์ใน PDF)
 */
type SubRun = { sub: { id: string; name: string } | null; items: BoqItemDto[] };

/** หมวดย่อยของบรรทัด (null = อยู่ตรงหมวดใหญ่ ไม่มีหมวดย่อย) */
function subCategoryOf(
  item: BoqItemDto,
  g: BoqGroup,
  categoryById: Map<string, WorkCategoryDto>,
): { id: string; name: string } | null {
  const subCat = categoryParts(item.categoryId, categoryById).sub;
  return subCat && subCat.id !== g.rootId ? { id: subCat.id, name: subCat.name } : null;
}

/** ก้อนบรรทัดที่ติดกันและอยู่หมวดย่อยเดียวกัน — ขึ้นก้อนใหม่เมื่อหมวดย่อยเปลี่ยน */
function subRunsOf(g: BoqGroup, categoryById: Map<string, WorkCategoryDto>): SubRun[] {
  const runs: SubRun[] = [];
  for (const item of g.items) {
    const sub = subCategoryOf(item, g, categoryById);
    const last = runs.at(-1);
    if (last && (last.sub?.id ?? null) === (sub?.id ?? null)) last.items.push(item);
    else runs.push({ sub, items: [item] });
  }
  return runs;
}

function boqRenderRowsOf(
  g: BoqGroup,
  categoryById: Map<string, WorkCategoryDto>,
  collapsedSubs: Set<string>,
): BoqRenderRow[] {
  const runs = subRunsOf(g, categoryById);
  const rows: BoqRenderRow[] = [];
  for (const [runIndex, run] of runs.entries()) {
    let collapsed = false;
    if (run.sub) {
      const key = `${g.rootId}-${run.sub.id}-${runIndex}`;
      collapsed = collapsedSubs.has(key);
      rows.push({
        type: "subheader",
        key,
        name: run.sub.name,
        // กลุ่มที่มีหมวดย่อยเดียว จำนวนจะซ้ำกับหัวหมวด จึงไม่โชว์ซ้ำ
        count: runs.length > 1 ? run.items.length : 0,
        collapsed,
        itemIds: run.items.map((it) => it.id),
      });
    }
    if (!collapsed) rows.push(...run.items.map((item) => ({ type: "item" as const, item })));
  }
  return rows;
}

type SubheaderRow = Extract<BoqRenderRow, { type: "subheader" }>;

/** ราคาสุทธิโดยประมาณหลังเปลี่ยนต้นทุนตรง — null ถ้ายังคิดยอดบรรทัดไม่ได้ */
function netWithDirect(version: ProjectVersionDto, newDirect: number): number {
  return previewNetPrice(
    newDirect,
    Number(version.overheadProfitPct),
    Number(version.vatPct),
    versionDiscount(version),
    version.roundingUnit,
  );
}

/**
 * พรีวิวสด: ระหว่างแก้/เพิ่มบรรทัด คิด "รวมของบรรทัด" + "ราคาสุทธิใหม่โดยประมาณ" จาก state ที่กำลัง
 * พิมพ์ (ยังไม่บันทึก) เพื่อให้เห็นผลก่อนกดบันทึก — ค่าจริงมาจากเซิร์ฟเวอร์ตอนบันทึก
 */
function linePreviewOf(
  s: ProjectState,
  version: ProjectVersionDto,
  editingItem: BoqItemDto | null,
  driverValueOf: (basis: string) => number | null,
) {
  // ราคาวัสดุต่อหน่วยจากสูตรวัสดุย่อย (ถ้ามี) — ใช้ทั้งพรีวิว + ทำช่องราคาเป็น read-only
  const addValidComponents = validComponentRows(s.addComponents);
  const addHasRecipe = addValidComponents.length > 0;
  const addDerivedPrice = deriveUnitPriceFromRows(addValidComponents);
  const editValidComponents = validComponentRows(s.editComponents);
  const editHasRecipe = editValidComponents.length > 0;
  const editDerivedPrice = deriveUnitPriceFromRows(editValidComponents);

  let previewLineTotal: number | null = null;
  let previewNet: number | null = null;
  let previewQty: number | null = null;
  if (editingItem) {
    const qty = previewQtyOf(s.editBasis, s.editQuantity, s.editCoefficient, s.editWaste, driverValueOf(s.editBasis), {
      rows: s.editSheetRows,
      unit: s.editUnit,
    });
    previewQty = qty;
    const materialPrice = editHasRecipe ? editDerivedPrice : Number(s.editMaterialPrice);
    previewLineTotal = lineTotalOf(qty, materialPrice, Number(s.editLaborPrice));
    if (previewLineTotal != null) {
      previewNet = netWithDirect(
        version,
        Number(version.directCost) - Number(editingItem.lineTotal) + previewLineTotal,
      );
    }
  } else if (s.showAddForm) {
    const f = s.addForm;
    const qty = previewQtyOf(f.qtyBasis, f.quantity, f.qtyCoefficient, f.wasteFactorPct, driverValueOf(f.qtyBasis), {
      rows: s.addSheetRows,
      unit: f.unit,
    });
    previewQty = qty;
    const materialPrice = addHasRecipe ? addDerivedPrice : Number(f.materialUnitPrice);
    previewLineTotal = lineTotalOf(qty, materialPrice, Number(f.laborUnitPrice || 0));
    if (previewLineTotal != null) {
      previewNet = netWithDirect(version, Number(version.directCost) + previewLineTotal);
    }
  }
  return {
    addHasRecipe,
    addDerivedPrice,
    editHasRecipe,
    editDerivedPrice,
    previewLineTotal,
    previewNet,
    previewQty,
    // แสดงพรีวิวยอดสุทธิเฉพาะเมื่อค่าต่างจากของเดิมจริง (ไม่งั้นรก)
    showNetPreview: previewNet != null && previewNet !== Number(version.netPrice),
  };
}

/**
 * สูตรวัสดุที่มีอยู่แล้วให้คัดลอกเป็นจุดเริ่ม — วัสดุในคลังที่มีสูตร + บรรทัดในโครงการนี้ที่แตกวัสดุไว้
 * (บรรทัดที่ตัวคิดกระเบื้องตั้งราคาไม่นับ: วัสดุย่อยของมันคิดจากขนาดแผ่น ไม่ใช่สูตรที่ใช้ซ้ำได้)
 */
function recipeSourcesOf(materials: MaterialDto[], items: BoqItemDto[]): RecipeSource[] {
  const fromCatalog = materials
    .filter((m) => m.active && m.components.length > 0)
    .map((m) => ({
      value: `m:${m.id}`,
      label: `คลัง · ${m.code ? `${m.code} ` : ""}${m.name} (${m.components.length} วัสดุ)`,
      rows: componentRowsFrom(m.components),
    }));
  const fromProject = items
    .filter((i) => i.components.length > 0 && !i.tileCalc?.priced)
    .map((i) => ({
      value: `i:${i.id}`,
      label: `ในโครงการนี้ · ${i.name} (${i.components.length} วัสดุ)`,
      rows: componentRowsFrom(i.components),
    }));
  return [...fromProject, ...fromCatalog];
}

/** คำขอที่ยังรอโครงการ (ยังไม่ผูก และยังไม่ปิด/ปฏิเสธ) */
function isOpenLead(l: LeadDto): boolean {
  return !l.projectId && l.status !== "CLOSED" && l.status !== "REJECTED";
}

/** แท็บที่โชว์จริงขึ้นกับชนิดโครงการ: โครงการกำหนดเองไม่มี BOQ/สรุปวัสดุ และสัญญาโผล่เมื่อถึงสถานะ */
function visibleTabsOf(
  project: ProjectDetailDto["project"],
  itemCount: number,
  quoteCount: number,
  contractCount: number,
  signedContractCount: number,
): { key: ProjectTab; label: string; count?: number; badge?: string }[] {
  const isCustom = project.type === "CUSTOM";
  const tabs: { key: ProjectTab; label: string; count?: number; badge?: string }[] = [{ key: "overview", label: "ภาพรวม" }];
  if (!isCustom) tabs.push({ key: "boq", label: "BOQ", count: itemCount });
  tabs.push({ key: "quotes", label: "ใบเสนอราคา", count: quoteCount });
  if (CONTRACT_ELIGIBLE_STATUSES.has(project.status)) {
    // เรื่องของสัญญาทั้งหมดอยู่แท็บเดียว (เอกสาร · งวดรับเงิน · งานเพิ่ม-ลด) — เดิมแยก "สัญญา" กับ "รับเงิน"
    // แล้วงานเพิ่ม-ลดไปอยู่ใต้สัญญา ผู้ใช้สับสนว่าอะไรอยู่ไหน · นับเลขเฉพาะตอนยังไม่ลงนาม (ฉบับร่างที่รอเลือก)
    tabs.push({
      key: "contract",
      label: "สัญญาและการเงิน",
      count: signedContractCount === 0 && contractCount > 0 ? contractCount : undefined,
    });
    // ต้นทุนจริงเริ่มมีความหมายเมื่อลูกค้าตกลงราคาแล้ว (ก่อนนั้นยังไม่มีงานให้จ่าย)
    tabs.push({ key: "costs", label: "ต้นทุนจริง" });
  }
  return tabs;
}

/**
 * ผู้ติดต่อของโครงการ — ยึดบัญชีลูกค้าเป็นหลัก ถ้ายังไม่มีค่อยใช้ข้อมูลจากคำขอ
 * เบอร์โทรก็เช่นกัน: เบอร์ในโปรไฟล์ลูกค้าก่อน ไม่มีค่อยใช้เบอร์จากคำขอ
 */
function contactOf(project: ProjectDetailDto["project"], lead: ProjectDetailDto["lead"]) {
  return {
    contactName: project.customer?.fullName ?? lead?.name ?? null,
    contactEmail: project.customer?.email ?? lead?.email ?? null,
    contactPhone: project.customer?.phone ?? lead?.phone ?? null,
    // คนยื่นคำขออาจไม่ใช่เจ้าของบัญชี (เช่น ลูกชายยื่นแทนพ่อ) — ต้องโชว์แยกไว้ ไม่งั้นข้อมูลหาย
    differentRequester: Boolean(project.customer && lead && lead.name !== project.customer.fullName),
  };
}

type PriceCell = {
  label: string;
  value: string;
  rate: boolean;
  empty?: boolean;
  negative?: boolean;
  hint?: ReactNode;
  /** สีพื้นอ่อนของการ์ด (แบบเดียวกับการ์ดแดชบอร์ด) — ไม่ใส่ = เทา */
  tone?: PriceTone;
  icon?: LucideIcon;
};

/**
 * สีการ์ดตัวเลขเงินของโครงการ — ดีไซน์เดียวกับการ์ดแดชบอร์ด (ผู้ใช้ขอให้เหมือนกัน): พื้นสีอ่อนตามความหมาย
 * + วงกลมจางมุมล่างขวา · สีบอกบทบาทของตัวเลข: เทา = ต้นทุน · ฟ้า = ส่วนที่บวกเพิ่ม · อำพัน = ส่วนที่หัก ·
 * เขียวหัวเป็ด = ภาษี · เขียนคลาสเต็มเพราะ Tailwind อ่านได้เฉพาะ literal
 */
type PriceTone = "slate" | "blue" | "amber" | "teal";
const PRICE_TONE: Record<PriceTone, { card: string; value: string; icon: string }> = {
  slate: { card: "bg-slate-100", value: "text-slate-800", icon: "text-slate-500" },
  blue: { card: "bg-blue-50", value: "text-blue-900", icon: "text-blue-600" },
  amber: { card: "bg-amber-50", value: "text-amber-900", icon: "text-amber-700" },
  teal: { card: "bg-teal-50", value: "text-teal-900", icon: "text-teal-700" },
};

function discountCell(version: ProjectVersionDto, hint?: ReactNode): PriceCell {
  const hasDiscount = Number(version.discountAmt) > 0;
  return {
    label: hasDiscount && version.discountPct != null ? `ส่วนลด ${Number(version.discountPct)}%` : "ส่วนลด",
    value: version.discountAmt,
    rate: true,
    empty: !hasDiscount,
    negative: true,
    hint,
    // ยังไม่ลด = เทา (ไม่มีอะไรให้ดู) · ลดแล้ว = อำพัน (ส่วนที่หักออก)
    tone: hasDiscount ? "amber" : "slate",
    icon: BadgePercent,
  };
}

/**
 * ช่องตัวเลขที่ประกอบกันเป็นราคาสุทธิ — โครงการกำหนดเองไม่แยกต้นทุน/กำไร (กรอกยอดรวมมาเลย)
 * rate: true = ช่องที่กดป้ายเพื่อเปิดแผงแก้ราคาได้
 *
 * ช่อง "ส่วนลด" แสดงเสมอแม้ยังไม่ได้ลด (ขึ้นขีดจาง ๆ) เพราะเป็นทางเข้าเดียวที่ทำให้คนหาเจอ
 * ว่าระบบลดราคาได้ — ถ้าซ่อนตอนเป็นศูนย์ ฟีเจอร์นี้จะไม่มีใครรู้ว่ามีอยู่
 * แยกก้อน "ค่าดำเนินการ+กำไร" ออกเป็นสองส่วนเพื่อแสดงเป็นบรรทัดย่อย — ตัวเลขหลักยังเป็น
 * ก้อนรวมเหมือนเดิม เพราะมันคือสิ่งที่บวกเข้าไปในราคาจริง ๆ
 */
/**
 * ช่อง "ปัดเศษ" — โชว์เฉพาะเวอร์ชันที่หักจริง เพราะตัวเลขทุกช่องต้องบวก/ลบกันได้เท่าราคาสุทธิ
 * (ไม่ปัด = ไม่มีช่องนี้ ทางเข้าคือตัวเลือกในแผงแก้ราคา ซึ่งเปิดจากป้าย "ส่วนลด" อยู่แล้ว)
 */
function roundingCells(version: ProjectVersionDto): PriceCell[] {
  if (!(Number(version.roundingAmt) > 0)) return [];
  return [
    {
      label: "ปัดเศษ",
      value: version.roundingAmt,
      rate: true,
      negative: true,
      tone: "amber",
      icon: Scissors,
      hint: <span className="text-slate-400">{roundingUnitLabel(version.roundingUnit)}</span>,
    },
  ];
}

function priceCellsOf(version: ProjectVersionDto, isCustom: boolean): PriceCell[] {
  const vatCell: PriceCell = { label: `VAT ${version.vatPct}%`, value: version.vatAmt, rate: true, tone: "teal", icon: Receipt };
  if (isCustom) {
    return [
      { label: "ยอดก่อน VAT", value: version.directCost, rate: false, tone: "slate", icon: Wallet },
      discountCell(version),
      ...roundingCells(version),
      vatCell,
    ];
  }
  const discountAmt = Number(version.discountAmt);
  const split = splitOverheadProfit({
    directCost: Number(version.directCost),
    overheadProfitPct: Number(version.overheadProfitPct),
    overheadProfitAmt: Number(version.overheadProfitAmt),
    overheadPct: version.overheadPct == null ? null : Number(version.overheadPct),
  });
  const roundingAmt = Number(version.roundingAmt);
  const margin = split.known ? marginAfterDiscount(split.profitAmt, discountAmt + roundingAmt) : null;
  return [
    { label: "ต้นทุนตรง", value: version.directCost, rate: false, tone: "slate", icon: Wallet },
    {
      label: `ค่าดำเนินการ+กำไร ${version.overheadProfitPct}%`,
      value: version.overheadProfitAmt,
      rate: true,
      tone: "blue",
      icon: TrendingUp,
      // บรรทัดย่อยแทนการเพิ่มช่องที่ห้า — ตัวเลขที่ต้องอ่านเร็วยังเป็นก้อนรวม ส่วนการแบ่ง
      // เป็นข้อมูลประกอบที่ดูเมื่ออยากรู้ว่าเหลือกำไรให้ต่อรองเท่าไร
      hint: split.known ? (
        <>
          ดำเนินการ {money(String(split.overheadAmt))} · กำไร {money(String(split.profitAmt))}
        </>
      ) : (
        // แสดงตอนยังไม่แยกด้วย เพราะป้ายด้านบนกดได้ — เป็นทางเดียวที่ทำให้คนรู้ว่าแยกได้
        <span className="text-slate-400">ยังไม่ได้แยกค่าดำเนินการกับกำไร</span>
      ),
    },
    discountCell(version, margin && discountAmt > 0 ? <DiscountMarginHint margin={margin} /> : undefined),
    ...roundingCells(version),
    vatCell,
  ];
}

/** ส่วนลดตามที่กำลังพิมพ์ในแผงแก้อัตรา — null ถ้าช่องไม่ใช่ตัวเลข */
function typedDiscount(s: ProjectState): PreviewDiscount | null {
  const dv = s.discInput === "" ? 0 : Number(s.discInput);
  if (!Number.isFinite(dv)) return null;
  return { pct: s.discMode === "PERCENT" ? dv : null, amt: s.discMode === "AMOUNT" ? dv : 0 };
}

/** ตัวเลขพรีวิวในแผงแก้อัตรา ตามค่าที่กำลังพิมพ์ (ยังไม่บันทึก) */
function ratesPreviewOf(s: ProjectState, version: ProjectVersionDto, isCustom: boolean) {
  const oh = optionalNumber(s.ohInput);
  const totalPct = oh != null && Number.isFinite(oh) ? oh : Number(version.overheadProfitPct);
  const overhead = optionalNumber(s.overheadInput);
  const overheadOk = overhead != null && Number.isFinite(overhead);

  /** กำไรกี่ % ตามตัวเลขที่กำลังพิมพ์ — null = ยังไม่ได้แยก หรือกรอกเกินอัตรารวม */
  let ratesSplitPreview: number | null = null;
  if (overheadOk) {
    const rest = Math.round((totalPct - overhead) * 100) / 100;
    ratesSplitPreview = rest >= 0 ? rest : null;
  }

  const discount = typedDiscount(s);
  const contingency = s.contingencyInput === "" ? 0 : Number(s.contingencyInput);
  const contingencyOk = Number.isFinite(contingency) && contingency >= 0;
  return {
    ratesSplitPreview,
    ratesPreviewMargin:
      s.showRates && !isCustom && overheadOk && contingencyOk && overhead <= totalPct && discount
        ? marginPreviewOf(version, totalPct, overhead, discount, s.discMode === "NONE", contingency, {
            vatPct: Number(s.vatInput),
            roundingUnit: s.roundInput === "" ? null : Number(s.roundInput),
          })
        : null,
    ratesPreviewNet: s.showRates && discount ? netPreviewOf(s, version, isCustom ? 0 : totalPct, discount) : null,
  };
}

/**
 * กำไรขั้นต้นที่จะเหลือหลังให้ส่วนลด ตามตัวเลขที่กำลังพิมพ์อยู่
 *
 * นี่คือคำถามที่การแยกค่าดำเนินการกับกำไรมีไว้ตอบ — ลดให้ลูกค้าได้อีกเท่าไรถึงจะยังไม่เฉือนเนื้อ
 * ตัวเอง จึงต้องอยู่ตรงช่องที่กำลังพิมพ์ส่วนลด ไม่ใช่ให้ไปเปิดดูที่อื่นแล้วคำนวณเอง
 */
function marginPreviewOf(
  version: ProjectVersionDto,
  totalPct: number,
  overheadPct: number,
  discount: PreviewDiscount,
  noDiscount: boolean,
  contingencyPct: number,
  rounding: { vatPct: number; roundingUnit: number | null },
) {
  const round2 = (v: number) => roundTo(v, 2);
  // ฐานของกำไรคือ "ค่างานต้นทุน" = ต้นทุนตรง + เผื่อเหลือเผื่อขาด ตรงกับฝั่งเซิร์ฟเวอร์
  const direct = round2(Number(version.directCost) * (1 + contingencyPct / 100));
  const totalAmt = round2(direct * (totalPct / 100));
  const profitAmt = round2(totalAmt - round2(direct * (overheadPct / 100)));
  const beforeDiscount = round2(direct + totalAmt);
  const discountAmt = noDiscount ? 0 : previewDiscount(beforeDiscount, discount);
  // ส่วนลดปัดเศษก็กินกำไรเหมือนส่วนลด — ต้องรวมไว้ ไม่งั้นบอกว่ายังเหลือกำไรมากกว่าความจริง
  const vatPct = Number.isFinite(rounding.vatPct) ? rounding.vatPct : 0;
  const roundingAmt = applyNetRounding(
    round2(beforeDiscount - discountAmt),
    vatPct,
    rounding.roundingUnit,
  ).roundingAmount;
  return marginAfterDiscount(profitAmt, round2(discountAmt + roundingAmt));
}

/**
 * ราคาสุทธิถ้าใช้อัตราที่กำลังพิมพ์อยู่ในแผงแก้อัตรา — ให้เห็นผลก่อนกดบันทึก
 * โครงการกำหนดเองไม่มีค่าดำเนินการ+กำไร (เป็น 0 เสมอ) สูตรเดียวกันจึงใช้ได้ทั้งสองแบบ
 */
function netPreviewOf(
  s: ProjectState,
  version: ProjectVersionDto,
  ohPct: number,
  discount: PreviewDiscount,
): number | null {
  const vat = Number(s.vatInput);
  if (!Number.isFinite(ohPct) || !Number.isFinite(vat)) return null;
  const r2 = (v: number) => roundTo(v, 2);
  const contingency = s.contingencyInput === "" ? 0 : Number(s.contingencyInput);
  if (!Number.isFinite(contingency) || contingency < 0) return null;
  const baseCost = r2(Number(version.directCost) * (1 + contingency / 100));

  const roundingUnit = s.roundInput === "" ? null : Number(s.roundInput);
  const next = previewNetPrice(baseCost, ohPct, vat, discount, roundingUnit);
  return next === Number(version.netPrice) ? null : next;
}

/** ตำแหน่งของแต่ละบรรทัดในหมวดใหญ่ของมัน — ใช้ตัดสินว่าเลื่อนขึ้น/ลงได้ไหม */
function positionsInGroups(groups: BoqGroup[]): Map<string, { group: BoqGroup; index: number }> {
  const out = new Map<string, { group: BoqGroup; index: number }>();
  for (const g of groups) g.items.forEach((it, index) => out.set(it.id, { group: g, index }));
  return out;
}

/** ตัวขับที่บรรทัดใช้แต่โครงการยังไม่ได้ตั้งค่าวัดนั้น → บรรทัดพวกนั้นถอยไปใช้ปริมาณแช่แข็ง */
function missingDriverLabelsOf(items: BoqItemDto[], driverValueOf: (basis: string) => number | null): string[] {
  return [
    ...new Set(
      items
        .filter((i) => i.qtyBasis !== "MANUAL" && i.qtyBasis !== "SHEET" && driverValueOf(i.qtyBasis) == null)
        .map((i) => basisConfig(i.qtyBasis).measureLabel),
    ),
  ].filter(Boolean);
}

/** กัน ?tab= ที่ชี้ไปแท็บที่หน้านี้ไม่มี (เช่น ลิงก์ ?tab=boq ของโครงการกำหนดเอง) ให้ตกกลับภาพรวม */
function activeTabOf(visibleTabs: { key: ProjectTab }[], requested: ProjectTab): ProjectTab {
  return visibleTabs.some((t) => t.key === requested) ? requested : "overview";
}

/** แท็บ BOQ: กลุ่มตามหมวดใหญ่ + หมวดที่เปิด (?cat=) + แถวที่จะแสดง + หมวดย่อยที่ยุบได้ */
function boqViewOf(
  items: BoqItemDto[],
  categoryById: Map<string, WorkCategoryDto>,
  catParam: string | null,
  collapsedSubs: Set<string>,
  pageParam: number,
) {
  const boqGroups = groupBoqByRoot(items, categoryById);
  // แท็บ BOQ แสดงทีละหมวด (?cat=) — ไม่มี/ชี้หมวดที่ไม่มีแล้ว (เช่น ลบบรรทัดสุดท้ายของหมวด) = หน้าสรุป
  const activeBoqIndex = boqGroups.findIndex((g) => g.key === catParam);
  const activeBoqGroup = activeBoqIndex >= 0 ? boqGroups[activeBoqIndex] : null;
  const boqRenderRows = activeBoqGroup ? boqRenderRowsOf(activeBoqGroup, categoryById, collapsedSubs) : [];
  // ยุบ/กางทุกหมวดย่อยของหมวดที่เปิดอยู่ (ปุ่มปลายขวาแถบหมวด แบบเดียวกับหน้าหมวดงาน/แม่แบบ)
  // ไม่จำสถานะข้ามการเปิดหน้า — BOQ ต้องเห็นครบเสมอตอนเปิดมา
  const foldableSubs = boqRenderRows.filter((row): row is SubheaderRow => row.type === "subheader");
  // แบ่งหน้า — เลขหน้าเกินจำนวนหน้า (ลบบรรทัด/ยุบหมวดย่อย) = หน้าสุดท้าย
  const boqPages = paginateBoqRows(boqRenderRows, BOQ_PAGE_SIZE);
  const boqPageCount = boqPages.length;
  const boqPage = Math.min(Math.max(1, pageParam), boqPageCount);
  const boqPageRows = boqPages[boqPage - 1];
  const itemsIn = (rows: BoqRenderRow[]) => rows.filter((r) => r.type === "item").length;
  const boqShownCount = itemsIn(boqRenderRows);
  const boqPageFrom = boqPages.slice(0, boqPage - 1).reduce((n, pg) => n + itemsIn(pg), 0) + 1;
  const boqPageTo = boqPageFrom + itemsIn(boqPageRows) - 1;
  /** หน้าที่บรรทัดนี้อยู่ · 0 = ไม่อยู่ในหมวดที่เปิด หรือหมวดย่อยของมันถูกยุบ */
  const boqPageOfItem = (id: string) =>
    boqPages.findIndex((pg) => pg.some((r) => r.type === "item" && r.item.id === id)) + 1;
  return {
    boqGroups,
    activeBoqIndex,
    activeBoqGroup,
    boqRenderRows,
    boqPageRows,
    boqPage,
    boqPageCount,
    boqShownCount,
    boqPageFrom,
    boqPageTo,
    boqPageOfItem,
    positionInGroup: positionsInGroups(boqGroups),
    foldableSubs,
    allSubsCollapsed: foldableSubs.length > 0 && foldableSubs.every((row) => row.collapsed),
  };
}

/** ทุกค่าที่หน้าจอคำนวณจาก state (ไม่มี hook) — แยกจากตัวคอมโพเนนต์เพื่อให้อ่าน/ทดสอบได้ทีละเรื่อง */
function deriveProjectView(s: ProjectState, detail: ProjectDetailDto) {
  const { project, currentVersion, items } = detail;
  const isCustom = project.type === "CUSTOM";
  const drivers = takeoffDriversOf(project);
  // ค่าตัวขับของฐานที่เลือก (null = ยังไม่ได้กรอกค่าวัดนั้น)
  const driverValueOf = (basis: string): number | null => {
    const key = basisConfig(basis).driver;
    return key ? drivers[key] : null;
  };

  const editingItem = items.find((i) => i.id === s.editingId) ?? null;
  const visibleTabs = visibleTabsOf(
    project,
    items.length,
    s.quotes.length,
    s.contracts.length,
    s.contracts.filter((c) => c.signedAt).length,
  );

  return {
    project,
    currentVersion,
    items,
    editable: detail.editable,
    lead: detail.lead,
    nextStatuses: NEXT_TRANSITIONS[project.status],
    isCustom,
    hasCustomPrice: Number(currentVersion.netPrice) > 0,
    quoteBlocker: quoteBlockerOf(isCustom, Number(currentVersion.netPrice) > 0, items.length),
    floorArea: drivers.floorArea,
    drivers,
    driverValueOf,
    stepDates: stepDatesOf(project, s.quotes),
    rejectionReason: rejectionReasonOf(s.quotes),
    ...boqViewOf(items, s.categoryById, s.boqCatParam, s.collapsedSubs, s.boqPageParam),
    editingItem,
    ...linePreviewOf(s, currentVersion, editingItem, driverValueOf),
    recipeSources: recipeSourcesOf(s.materials, items),
    missingDriverLabels: missingDriverLabelsOf(items, driverValueOf),
    visibleTabs,
    activeTab: activeTabOf(visibleTabs, s.tab),
    ...contactOf(project, detail.lead),
    hasDiscount: Number(currentVersion.discountAmt) > 0,
    priceCells: priceCellsOf(currentVersion, isCustom),
    ...ratesPreviewOf(s, currentVersion, isCustom),
  };
}

type ProjectView = ReturnType<typeof deriveProjectView>;

/**
 * การกระทำที่ต้องใช้ทั้ง state และค่าที่คำนวณแล้ว (ตำแหน่งบรรทัด/หมวดย่อยที่ยุบได้)
 * แยกจาก deriveProjectView เพราะเป็นตัวสั่งงาน ไม่ใช่ค่าที่ใช้แสดงผล
 */
function projectViewActions(s: ProjectState, detail: ProjectDetailDto, v: ProjectView) {
  // เลื่อนบรรทัดขึ้น/ลงได้เฉพาะภายในหมวดใหญ่เดียวกัน — ใบเสนอราคาจัดกลุ่มตามหมวดใหญ่อยู่แล้ว
  // เลื่อนข้ามหมวดไปก็ถูกดึงกลับเข้ากลุ่มเดิมตอนพิมพ์ ปุ่มจึงหยุดที่ขอบหมวด
  async function moveItem(itemId: string, direction: -1 | 1) {
    const pos = v.positionInGroup.get(itemId);
    if (!pos || s.reordering) return;
    const target = pos.index + direction;
    if (target < 0 || target >= pos.group.items.length) return;
    const nextItems = v.boqGroups
      .map((g) => {
        if (g !== pos.group) return g.items;
        const list = [...g.items];
        [list[pos.index], list[target]] = [list[target], list[pos.index]];
        return list;
      })
      .flat();
    const previous = detail;
    // เลื่อนบนจอทันที ไม่ต้องรอเซิร์ฟเวอร์ — พลาดค่อยดึงของจริงกลับมา
    s.setDetail({ ...detail, items: nextItems });
    // บรรทัดแรก/ท้ายของหน้าเลื่อนข้ามขอบหน้า — ตามไปหน้าที่มันย้ายไป
    s.setBoqFocusId(itemId);
    s.setReordering(true);
    try {
      const res = await reorderBoqItems(
        s.projectId,
        nextItems.map((i) => i.id),
      );
      if (res.newVersion) {
        s.toast.info(`สร้างเวอร์ชันใหม่ (${res.version.versionNo}) สำหรับลำดับนี้ — ใบเสนอราคาที่ส่งไปแล้วไม่เปลี่ยน`);
      }
      await s.silentRefresh();
    } catch (err) {
      s.setDetail(previous);
      s.toast.error(err instanceof ApiError ? err.message : "เลื่อนลำดับไม่สำเร็จ");
      await s.silentRefresh();
    } finally {
      s.setReordering(false);
    }
  }

  const toggleAllSubs = () => {
    const collapsing = !v.allSubsCollapsed;
    // ยุบก้อนที่มีแถวกำลังแก้อยู่ = แผงแก้ไขหายทั้งที่ยังไม่บันทึก จึงปิดให้ก่อน
    const editingId = s.editingId;
    if (collapsing && editingId != null && v.foldableSubs.some((row) => row.itemIds.includes(editingId))) {
      s.setEditingId(null);
    }
    s.setCollapsedSubs((prev) => {
      const next = new Set(prev);
      for (const row of v.foldableSubs) {
        if (collapsing) next.add(row.key);
        else next.delete(row.key);
      }
      return next;
    });
  };

  const toggleSub = (key: string, itemIds: string[]) => {
    // ยุบก้อนที่กำลังแก้บรรทัดอยู่ = แผงแก้ไขหายทั้งที่ยังไม่บันทึก จึงปิดแผงให้ก่อน
    if (!s.collapsedSubs.has(key) && s.editingId != null && itemIds.includes(s.editingId)) {
      s.setEditingId(null);
    }
    s.setCollapsedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return { moveItem, toggleAllSubs, toggleSub };
}

/** ทุกอย่างที่ส่วนแสดงผลของหน้าโครงการใช้: state + ค่าที่คำนวณแล้ว + ตัวสั่งงาน (detail โหลดแล้วแน่นอน) */
type ProjectVM = Omit<ProjectState, "detail"> &
  ProjectView &
  ReturnType<typeof projectViewActions> & { detail: ProjectDetailDto };

export function ProjectDetailPage() {
  const s = useProjectDetailState();

  if (s.loading) {
    return (
      <Layout>
        <DetailSkeleton label="กำลังโหลดโครงการ..." />
      </Layout>
    );
  }

  if (s.error || !s.detail) {
    return (
      <Layout>
        <p className="text-red-600">{s.error ?? "ไม่พบโครงการ"}</p>
      </Layout>
    );
  }

  const detail = s.detail;
  const v = deriveProjectView(s, detail);
  const vm: ProjectVM = { ...s, ...v, ...projectViewActions(s, detail, v), detail };
  return <ProjectDetailView vm={vm} />;
}

/**
 * ค่าเผื่อเหลือเผื่อขาด (% ของต้นทุนตรง) — บวกเป็น "ค่างานต้นทุน" ก่อนคิดค่าดำเนินการ/กำไร
 * อยู่บนสุดของแผงเพราะเป็นฐานของทุกอัตราข้างล่าง · แก้ได้เฉพาะเจ้าของระบบ (ระดับเดียวกับอัตรากำไร)
 */
function ContingencyField({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { canEditMargin, contingencyInput, setContingencyInput } = vm;
  return (
    <div className="mb-3 flex flex-wrap items-end gap-3 border-b border-slate-200 pb-3">
      <label className="text-xs text-slate-600">
        <span>เผื่อเหลือเผื่อขาด (%)</span>
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={contingencyInput}
          onChange={(e) => setContingencyInput(e.target.value)}
          placeholder="ไม่เผื่อ"
          disabled={!canEditMargin}
          className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        />
      </label>
    </div>
  );
}

/**
 * ช่องกรอกราคาของโครงการกำหนดเอง
 *
 * ตำแหน่งขยับตามสถานะโดยตั้งใจ: **ยังไม่มีราคา = เด้งขึ้นไปอยู่บนสุดของแท็บภาพรวม** เพราะมันคือ
 * สิ่งเดียวที่ทำได้ตอนนั้น (ของเดิมอยู่ล่างสุดใต้จอ คนหาไม่เจอจนกดอะไรต่อไม่ได้เลย)
 * พอมีราคาแล้วจะตกลงไปอยู่ท้ายหน้าเหมือนเดิม เพราะการแก้ราคาเกิดขึ้นนาน ๆ ครั้ง
 */
function CustomPriceCard({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { currentVersion, customPriceInput, setCustomPriceInput, handleSetCustomPrice, savingCustomPrice, hasCustomPrice } = vm;
  const highlight = hasCustomPrice ? "border-slate-200" : "border-brand/40 ring-1 ring-brand/15";

  return (
    <div id="custom-price-section" className={`mb-6 scroll-mt-20 rounded-lg border bg-white p-4 ${highlight}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
        <p className="text-sm font-medium text-slate-700">ราคาโครงการกำหนดเอง</p>
        <span className="text-xs text-slate-500">
          กรอกยอดก่อน VAT (กำไรรวมในนี้แล้ว) — ระบบบวก VAT {currentVersion.vatPct}% ให้
        </span>
      </div>
      {!hasCustomPrice && (
        // บอกลำดับทั้งเส้นตั้งแต่ตรงนี้ เพราะเป็นจุดแรกที่คนเปิดโครงการกำหนดเองมาเจอ
        <p className="mb-3 text-sm text-slate-500">
          ใส่ราคาแล้วจะออกใบเสนอราคาได้ และ<strong className="font-medium text-slate-700">ช่องแนบไฟล์ BOQ/แบบ
          จะอยู่ใต้ใบเสนอราคาแต่ละใบ</strong> ในแท็บ “ใบเสนอราคา”
        </p>
      )}
      {/* ตัวเลขทั้งสามย้ายขึ้นไปอยู่แถบเหนือแท็บแล้ว ตรงนี้เหลือเฉพาะช่องกรอก */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="ยอดก่อน VAT (บาท)"
          value={customPriceInput}
          onChange={(e) => setCustomPriceInput(e.target.value)}
          className="w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
        <Button size="sm" onClick={handleSetCustomPrice} disabled={savingCustomPrice || customPriceInput === ""}>
          <Check size={14} /> บันทึกราคา
        </Button>
      </div>
    </div>
  );
}

/** แผงแก้อัตรา ค่าดำเนินการ+กำไร / VAT / ส่วนลด พร้อมพรีวิวราคาสุทธิ */
function RatesPanel({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { showRates, isCustom, canEditMargin, ohInput, setOhInput, overheadInput, setOverheadInput, ratesSplitPreview, vatInput, setVatInput, discMode, setDiscMode, discInput, setDiscInput, discNote, setDiscNote, roundInput, setRoundInput, handleSaveRates, savingRates, setShowRates, ratesPreviewNet, ratesPreviewMargin, editable } = vm;
  return (
    <>
      {showRates && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          {!isCustom && <ContingencyField vm={vm} />}
          <div className="flex flex-wrap items-end gap-3">
            {/* ค่าดำเนินการกับกำไรต่างกันตอนต่อรองราคา: ค่าดำเนินการเป็นเงินที่ต้องจ่ายออกไปจริง
                (ค่าคุมงาน สำนักงานสนาม ประกันผลงาน) ลดเข้าไปในส่วนนั้นคือเฉือนเนื้อตัวเอง
                ช่องที่สองจึงบอกว่า "ในก้อนรวมข้างซ้าย ส่วนไหนแตะไม่ได้" — กำไรคือส่วนที่เหลือ */}
            {!isCustom && (
              <>
                <label className="text-xs text-slate-600">
                  <span>ค่าดำเนินการ+กำไร (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    autoFocus={canEditMargin}
                    disabled={!canEditMargin}
                    value={ohInput}
                    onChange={(e) => setOhInput(e.target.value)}
                    className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
                <label className="text-xs text-slate-600">
                  <span>ในนั้นเป็นค่าดำเนินการ (%)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={overheadInput}
                    onChange={(e) => setOverheadInput(e.target.value)}
                    placeholder="ยังไม่แยก"
                    disabled={!canEditMargin}
                    className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums text-slate-800 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </label>
                <p className="pb-1 text-xs text-slate-500">
                  {/* คำแนะนำการกรอกไม่มีความหมายกับคนที่แก้ช่องนี้ไม่ได้ แต่ผลการแบ่ง (กำไรกี่ %) ยังควรเห็น */}
                  {ratesSplitPreview == null ? (
                    canEditMargin && (
                      <span className="text-slate-400">เว้นว่างไว้ = ไม่แยกค่าดำเนินการกับกำไร</span>
                    )
                  ) : (
                    <>
                      → กำไร{" "}
                      <span className="font-medium tabular-nums text-slate-700">
                        {ratesSplitPreview}%
                      </span>
                    </>
                  )}
                </p>
              </>
            )}
            {(
              <label className="text-xs text-slate-600">
                <span>VAT (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  autoFocus={isCustom || !canEditMargin}
                  value={vatInput}
                  onChange={(e) => setVatInput(e.target.value)}
                  className="mt-1 block w-28 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums text-slate-800"
                />
              </label>
            )}
          </div>

          {!isCustom && !canEditMargin && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Lock size={12} /> ค่าดำเนินการและกำไรแก้ได้เฉพาะเจ้าของระบบ — VAT และส่วนลดแก้ได้ตามปกติ
            </p>
          )}

          {/* ส่วนลดแยกแถวของตัวเอง ไม่ยัดต่อท้ายช่อง % — มันไม่ใช่ "อัตรา" และมีสามช่องของตัวเอง
              ถ้าเบียดรวมแถวเดียว พอจอแคบจะตัดบรรทัดจนอ่านไม่ออกว่าช่องไหนคู่กับอะไร */}
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3">
            <label className="text-xs text-slate-600">
              <span>ส่วนลด</span>
              <select
                value={discMode}
                onChange={(e) => setDiscMode(e.target.value as typeof discMode)}
                className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
              >
                <option value="NONE">ไม่มีส่วนลด</option>
                <option value="PERCENT">ลดเป็นเปอร์เซ็นต์</option>
                <option value="AMOUNT">ลดเป็นจำนวนเงิน</option>
              </select>
            </label>
            {discMode !== "NONE" && (
              <>
                <label className="text-xs text-slate-600">
                  {discMode === "PERCENT" ? "ลดกี่ % ของราคาก่อนส่วนลด" : "ลดกี่บาท"}
                  <input
                    type="number"
                    min="0"
                    max={discMode === "PERCENT" ? "100" : undefined}
                    step="0.01"
                    value={discInput}
                    onChange={(e) => setDiscInput(e.target.value)}
                    className="mt-1 block w-32 rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums text-slate-800"
                  />
                </label>
                <label className="min-w-0 flex-1 text-xs text-slate-600">
                  <span>เหตุผล (ไม่บังคับ — จะพิมพ์ในใบเสนอราคา)</span>
                  <input
                    type="text"
                    maxLength={200}
                    value={discNote}
                    onChange={(e) => setDiscNote(e.target.value)}
                    placeholder="เช่น ส่วนลดพิเศษลูกค้าเก่า"
                    className="mt-1 block w-full min-w-40 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800"
                  />
                </label>
              </>
            )}
          </div>

          {/* ปัดยอดสุทธิ — อยู่ใต้ส่วนลดเพราะคือส่วนลดอีกก้อนหนึ่ง (หักก่อน VAT) แค่ระบบคิดยอดให้เอง */}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600">
              <span>ปัดยอดสุทธิ (รวม VAT)</span>
              <select
                value={roundInput}
                onChange={(e) => setRoundInput(e.target.value)}
                className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
              >
                <option value="">ไม่ปัด</option>
                {ROUNDING_UNITS.map((u) => (
                  <option key={u} value={String(u)}>
                    {roundingUnitLabel(u)}
                  </option>
                ))}
              </select>
            </label>
            <p className="pb-1 text-xs text-slate-500">
              ปัดลงเสมอ ส่วนต่างหักเป็น &quot;ส่วนลดปัดเศษ&quot; ก่อนคิด VAT และพิมพ์ในใบเสนอราคา
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={handleSaveRates} disabled={savingRates}>
              <Check size={14} /> {savingRates ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowRates(false)}>
              ยกเลิก
            </Button>
            {ratesPreviewNet != null && (
              <span className="text-xs tabular-nums text-slate-600">
                ราคาสุทธิใหม่ ≈{" "}
                <span className="font-semibold text-brand">{money(ratesPreviewNet)}</span>
              </span>
            )}
          </div>

          {/* คำถามที่การแยกค่าดำเนินการ/กำไรมีไว้ตอบ: ลดได้อีกเท่าไรถึงจะยังไม่เฉือนเนื้อตัวเอง
              ต้องอยู่ตรงนี้ ตรงที่กำลังพิมพ์ส่วนลด ไม่ใช่ให้ไปเปิดดูที่อื่นแล้วคำนวณเอง */}
          {ratesPreviewMargin != null && (
            <p
              className={`mt-2 text-xs tabular-nums ${
                ratesPreviewMargin.remaining < 0 ? "text-red-600" : "text-slate-600"
              }`}
            >
              {ratesPreviewMargin.remaining < 0 ? (
                <>
                  ส่วนลดนี้เกินกำไรที่มีอยู่ {money(String(-ratesPreviewMargin.remaining))} บาท —
                  ราคานี้ต่ำกว่าต้นทุนบวกค่าดำเนินการ
                </>
              ) : (
                <>
                  กำไรขั้นต้นที่เหลือ{" "}
                  <span className="font-semibold">
                    {money(String(ratesPreviewMargin.remaining))}
                  </span>{" "}
                  บาท
                  {ratesPreviewMargin.eatenPct != null && ratesPreviewMargin.eatenPct > 0 && (
                    <span className="text-slate-500">
                      {" "}
                      (จาก {money(String(ratesPreviewMargin.before))} — ส่วนลดกินกำไรไป{" "}
                      {ratesPreviewMargin.eatenPct}%)
                    </span>
                  )}
                </>
              )}
            </p>
          )}
          {isCustom && (
            <p className="mt-2 text-xs text-slate-500">
              โครงการกำหนดเองแก้ได้เฉพาะ VAT และส่วนลด — กำไรรวมอยู่ในยอดก่อน VAT ที่กรอกไว้แล้ว
            </p>
          )}
          {!editable && (
            <p className="mt-2 text-xs text-amber-600">
              เวอร์ชันนี้ส่งใบเสนอราคาไปแล้ว — บันทึกแล้วระบบจะสร้างเวอร์ชันใหม่ให้
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** วิธีคิดปริมาณ 3 แบบที่คนคิดจริง — ฐาน "ต่อค่าวัด" ทั้ง 7 ตัวรวมเป็นแบบที่สาม แล้วเลือกตัวขับในนั้นอีกที */
type QtyMode = "MANUAL" | "SHEET" | "DRIVER";
const qtyModeOf = (basis: QtyBasis): QtyMode => (basis === "MANUAL" || basis === "SHEET" ? basis : "DRIVER");
const DRIVER_BASES = TAKEOFF_BASES.filter((b) => b.driver != null);

const addInputClass = "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-500 focus:outline-none";
const addLabelClass = "flex flex-col gap-1 text-xs text-slate-600";

function AddStep({ n, title, children }: Readonly<{ n: number; title: string; children: ReactNode }>) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[11px] font-medium text-white">
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * ฟอร์มเพิ่มบรรทัด BOQ — เรียงตามลำดับที่คิดจริง: ① รายการอะไร ② เท่าไร ③ ราคาเท่าไร
 * ยอดรวมของบรรทัดอยู่ข้างปุ่มบันทึก · หมายเหตุ/สูตรวัสดุย่อยพับไว้ (บรรทัดส่วนใหญ่ไม่ใช้)
 */
function BoqAddForm({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { showAddForm, setShowAddForm, submitAdd, materialOptions, addForm, selectMaterial, categoryOptions, setAddForm, unitsInUse, addHasRecipe, addDerivedPrice, driverValueOf, rebarOpen, setRebarOpen, rebarDia, setRebarDia, rebarLen, setRebarLen, addComponents, setAddComponents, materialById, editingItem, previewLineTotal, showNetPreview, previewNet, previewQty, recipeSources, addSheetRows, setAddSheetRows } = vm;
  const formRef = useRef<HTMLFormElement>(null);
  const [showNote, setShowNote] = useState(false);
  const [saving, setSaving] = useState(false);

  // Esc ปิดฟอร์ม — ฟังที่ document แทนการดักคีย์บนกล่อง (กล่องเปล่าไม่ใช่ตัวรับคีย์) แต่จำกัด
  // เฉพาะตอนโฟกัสอยู่ในฟอร์ม เท่ากับตอนที่ยังดักบนกล่อง · dropdown ค้นหาหยุด Esc ของมันเองไว้แล้ว
  useEffect(() => {
    if (!showAddForm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && formRef.current?.contains(e.target as Node)) setShowAddForm(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showAddForm, setShowAddForm]);

  if (!showAddForm) return null;

  const material = addForm.materialId ? materialById.get(addForm.materialId) : undefined;
  const priceLocked = addHasRecipe;
  const materialPrice = addHasRecipe ? addDerivedPrice : Number(addForm.materialUnitPrice || 0);
  const unitTotal = materialPrice + Number(addForm.laborUnitPrice || 0);
  const mode = qtyModeOf(addForm.qtyBasis);
  const noteOpen = showNote || addForm.note !== "";

  async function save(keepOpen: boolean) {
    setSaving(true);
    try {
      const ok = await submitAdd({ keepOpen });
      if (ok && keepOpen) {
        setShowNote(false);
        // กลับไปที่ช่องค้นหาวัสดุ (ปุ่มเปิดของ SearchableSelect ตัวแรก) พร้อมเลือกรายการถัดไปทันที
        // รอให้ฟอร์มที่ล้างแล้ว render ก่อน (ตอนยังผูกวัสดุ ปุ่มแรกคือปุ่ม × ล้างค่า ซึ่งจะหายไป)
        setTimeout(() => formRef.current?.querySelector<HTMLButtonElement>("label button")?.focus(), 0);
      }
    } finally {
      setSaving(false);
    }
  }

  const priceHint = (catalogValue: string | undefined, current: string, reset: () => void) => {
    if (catalogValue === undefined) return null;
    const differs = Number(current || 0) !== Number(catalogValue);
    return differs ? (
      <span className="text-[11px] text-amber-700">
        แก้จากราคาคลัง {money(catalogValue)} ·{" "}
        <button type="button" onClick={reset} className="underline underline-offset-2 hover:text-amber-900">
          คืนค่า
        </button>
      </span>
    ) : (
      <span className="text-[11px] text-slate-400">ราคาจากคลัง</span>
    );
  };

  return (
    // ฟอร์มจริง: Enter ในช่องกรอก = บันทึก ตามพฤติกรรมมาตรฐานของเบราว์เซอร์
    // (dropdown ค้นหากัน Enter ของมันเองไว้แล้ว) · ปุ่มข้างในทุกตัวเป็น type="button" จึงไม่ยิงบันทึก
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
      className="mb-4 flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">เพิ่มรายการ BOQ</h2>
        <button
          type="button"
          onClick={() => setShowAddForm(false)}
          aria-label="ปิดฟอร์ม"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X size={16} />
        </button>
      </div>

      <AddStep n={1} title="รายการ">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
          <label className={`${addLabelClass} sm:col-span-3`}>
            <span>
              วัสดุจากคลัง <span className="text-slate-400">(หรือเว้นว่างแล้วกรอกชื่อเอง)</span>
            </span>
            <SearchableSelect
              options={materialOptions}
              value={addForm.materialId}
              onChange={selectMaterial}
              placeholder="พิมพ์รหัส/ชื่อวัสดุ"
              clearable
            />
          </label>
          <label className={`${addLabelClass} sm:col-span-2`}>
            หมวดงาน
            <SearchableSelect
              options={categoryOptions}
              value={addForm.categoryId}
              onChange={(next) => setAddForm((f) => ({ ...f, categoryId: next }))}
              placeholder="พิมพ์รหัส/ชื่อหมวดงาน"
            />
          </label>
        </div>

        {material ? (
          // ผูกกับคลัง: ชื่อและหน่วยมาจากคลัง — โชว์เป็นข้อความแทนช่องสีเทาที่กดไม่ได้แต่ไม่บอกว่าทำไม
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-slate-600">
              หน่วย: <span className="font-medium text-slate-800">{material.unit}</span>
            </span>
            <button
              type="button"
              onClick={() => selectMaterial("")}
              title="เก็บชื่อ หน่วย และราคาที่เติมไว้ แต่บรรทัดนี้จะไม่ผูกกับคลังแล้ว (ไม่เตือนเมื่อราคาคลังเปลี่ยน)"
              className="text-slate-500 underline underline-offset-2 hover:text-slate-800"
            >
              แก้ชื่อ/หน่วยเอง (ไม่ผูกกับคลัง)
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <label className={`${addLabelClass} sm:col-span-3`}>
              ชื่อรายการ
              <input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="เช่น งานรื้อถอนผนังเดิม"
                className={addInputClass}
              />
            </label>
            <label className={`${addLabelClass} sm:col-span-2`}>
              หน่วยนับ
              {/* ใช้ตัวเดียวกับหน้าวัสดุ/ค่าแรง — กันหน่วยสะกดเพี้ยน เช่น "ตรม." กับ "ตร.ม." */}
              <UnitSelect
                value={addForm.unit}
                onChange={(unit) => setAddForm((f) => ({ ...f, unit }))}
                options={UNIT_OPTIONS}
                inUse={unitsInUse}
              />
            </label>
          </div>
        )}
      </AddStep>

      <AddStep n={2} title="ปริมาณ">
        <div role="radiogroup" aria-label="วิธีคิดปริมาณ" className="inline-flex w-fit overflow-hidden rounded-md border border-slate-300 text-sm">
          {(
            [
              ["MANUAL", "กรอกเอง"],
              ["SHEET", "ถอดจากแบบ"],
              ["DRIVER", "คิดจากค่าวัดโครงการ"],
            ] as [QtyMode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() =>
                setAddForm((f) => ({
                  ...f,
                  qtyBasis: value === "DRIVER" ? (qtyModeOf(f.qtyBasis) === "DRIVER" ? f.qtyBasis : "PER_AREA") : value,
                }))
              }
              className={`border-r border-slate-300 px-3 py-1.5 last:border-r-0 ${
                mode === value ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "MANUAL" && (
          <>
            <label className={`${addLabelClass} w-48`}>
              จำนวน{addForm.unit && ` (${addForm.unit})`}
              <input
                type="number"
                step="any"
                value={addForm.quantity}
                onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
                className={addInputClass}
              />
            </label>
            {/* เครื่องมือคิดน้ำหนักเหล็กอยู่ใต้ช่องจำนวนที่มันเติมค่าให้ — โชว์เฉพาะโหมดกรอกเอง
                เพราะโหมดอื่นปริมาณมาจากสูตร การใส่ทับจะล้างสูตรทิ้ง */}
            <RebarCalculator
              open={rebarOpen}
              onToggle={() => setRebarOpen((v) => !v)}
              diameterMm={rebarDia}
              onDiameterChange={setRebarDia}
              lengthM={rebarLen}
              onLengthChange={setRebarLen}
              unit={addForm.unit}
              // ผูกวัสดุจากแคตตาล็อกอยู่ = หน่วยนับมาจากคลัง แก้ให้ไม่ได้ ได้แค่เตือน
              onUnitChange={addForm.materialId ? undefined : (unit) => setAddForm((f) => ({ ...f, unit }))}
              onInsert={(kg) => {
                setAddForm((f) => ({ ...f, quantity: String(kg) }));
                setRebarOpen(false);
              }}
            />
          </>
        )}

        {mode === "SHEET" &&
          (addForm.unit ? (
            <SheetQuantityBlock
              lineName={addForm.name}
              unit={addForm.unit}
              rows={addSheetRows}
              waste={addForm.wasteFactorPct}
              onChange={(rows, waste) => {
                setAddSheetRows(rows);
                setAddForm((f) => ({ ...f, wasteFactorPct: waste }));
              }}
              onUseManual={(q) =>
                setAddForm((f) => ({ ...f, qtyBasis: "MANUAL", quantity: q == null ? f.quantity : String(q) }))
              }
            />
          ) : (
            <span className="text-xs text-amber-700">เลือกวัสดุหรือหน่วยนับในขั้นที่ 1 ก่อน แล้วค่อยเปิดใบถอดแบบ</span>
          ))}

        {mode === "DRIVER" && (
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4">
            <label className={addLabelClass}>
              คิดจาก
              <select
                value={addForm.qtyBasis}
                onChange={(e) => setAddForm((f) => ({ ...f, qtyBasis: e.target.value as QtyBasis }))}
                className={addInputClass}
              >
                {DRIVER_BASES.map((b) => {
                  const dv = driverValueOf(b.value);
                  return (
                    <option key={b.value} value={b.value}>
                      {b.measureLabel} {dv == null ? "(ยังไม่ได้ตั้ง)" : `= ${dv.toLocaleString("th-TH")}`}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className={addLabelClass}>
              {basisConfig(addForm.qtyBasis).perLabel}
              <input
                type="number"
                step="0.0001"
                value={addForm.qtyCoefficient}
                onChange={(e) => setAddForm((f) => ({ ...f, qtyCoefficient: e.target.value }))}
                className={addInputClass}
              />
            </label>
            <label className={addLabelClass}>
              เผื่อเสีย (%)
              <input
                type="number"
                step="0.01"
                value={addForm.wasteFactorPct}
                onChange={(e) => setAddForm((f) => ({ ...f, wasteFactorPct: e.target.value }))}
                className={addInputClass}
              />
            </label>
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-slate-600">ปริมาณที่คิดได้</span>
              {(() => {
                const dv = driverValueOf(addForm.qtyBasis);
                if (dv == null) {
                  return (
                    <span className="py-1.5 text-amber-700">
                      ตั้ง “{basisConfig(addForm.qtyBasis).measureLabel}” ในรายละเอียดโครงการก่อน
                    </span>
                  );
                }
                const q = previewTakeoffQty(Number(addForm.qtyCoefficient), Number(addForm.wasteFactorPct), dv);
                return q == null ? (
                  <span className="py-1.5 text-slate-400">—</span>
                ) : (
                  <span className="py-1.5 text-slate-500">
                    {dv} × {addForm.qtyCoefficient || 0} × (1+{addForm.wasteFactorPct || 0}%) ={" "}
                    <span className="font-semibold text-slate-800">
                      {q.toLocaleString("th-TH")} {addForm.unit}
                    </span>
                  </span>
                );
              })()}
            </div>
          </div>
        )}
      </AddStep>

      <AddStep n={3} title={`ราคาต่อหน่วย${addForm.unit ? ` (บาท/${addForm.unit})` : ""}`}>
        <MaterialComponentsEditor
          rows={addComponents}
          onChange={setAddComponents}
          materialById={materialById}
          unitLabel={addForm.unit}
          unitDatalistId="boq-units"
          lineQuantity={editingItem ? null : previewQty}
          copySources={recipeSources}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className={addLabelClass}>
            ค่าวัสดุ
            {priceLocked ? (
              <>
                <input type="text" readOnly value={money(materialPrice)} className={`${addInputClass} bg-slate-50 text-slate-500`} />
                <span className="text-[11px] text-slate-400">คิดจากสูตรวัสดุด้านบน</span>
              </>
            ) : (
              <>
                <input
                  type="number"
                  step="any"
                  value={addForm.materialUnitPrice}
                  onChange={(e) => setAddForm((f) => ({ ...f, materialUnitPrice: e.target.value }))}
                  className={addInputClass}
                />
                {priceHint(material?.materialUnitPrice, addForm.materialUnitPrice, () =>
                  setAddForm((f) => ({ ...f, materialUnitPrice: material!.materialUnitPrice })),
                )}
              </>
            )}
          </label>
          <label className={addLabelClass}>
            ค่าแรง
            <input
              type="number"
              step="any"
              value={addForm.laborUnitPrice}
              onChange={(e) => setAddForm((f) => ({ ...f, laborUnitPrice: e.target.value }))}
              className={addInputClass}
            />
            {priceHint(material?.laborUnitPrice, addForm.laborUnitPrice, () =>
              setAddForm((f) => ({ ...f, laborUnitPrice: material!.laborUnitPrice })),
            )}
          </label>
          <div className={addLabelClass}>
            รวมต่อหน่วย
            <span className="rounded-md border border-transparent px-2.5 py-1.5 text-sm font-medium text-slate-800 tabular-nums">
              {money(unitTotal)}
            </span>
          </div>
        </div>
      </AddStep>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-4 text-xs">
          {!noteOpen && (
            <button type="button" onClick={() => setShowNote(true)} className="link-pill -my-1 -ml-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              + หมายเหตุ
            </button>
          )}
        </div>
        {noteOpen && (
          <label className={addLabelClass}>
            หมายเหตุ
            <input
              autoFocus={showNote && addForm.note === ""}
              value={addForm.note}
              onChange={(e) => setAddForm((f) => ({ ...f, note: e.target.value }))}
              className={addInputClass}
            />
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <div className="text-sm text-slate-500">
          {!editingItem && previewLineTotal != null ? (
            <>
              รวมบรรทัดนี้{" "}
              <span className="ml-1 text-lg font-semibold text-slate-800 tabular-nums">{money(previewLineTotal)}</span>
              {showNetPreview && (
                <span className="ml-2 text-xs">
                  · ราคาสุทธิใหม่ ≈ <span className="font-medium text-brand">{money(previewNet!)}</span>
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400">กรอกปริมาณและราคาเพื่อดูยอดของบรรทัดนี้</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void save(true)}
            disabled={saving}
            title="บันทึกแล้วล้างฟอร์มไว้กรอกรายการถัดไป (หมวดงานเดิมยังอยู่)"
          >
            <Plus size={14} /> บันทึก + เพิ่มต่อ
          </Button>
          <Button size="sm" type="submit" disabled={saving}>
            <Check size={14} /> {saving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** ตาราง BOQ ของหมวดที่เปิด (หรือหน้าสรุปทุกหมวด) + แถวแก้ไขในที่ */
/** ชื่อแบบนี้น่าจะเป็นงานปูกระเบื้อง (ไม่นับหลังคาลอน — มุงคิดคนละแบบ) */
const looksLikeTile = (name: string) => /กระเบื้อง|แกรนิต|เซรามิ|โมเสค|หินอ่อน/.test(name) && !/หลังคา|ลอน/.test(name);

/**
 * ลิงก์ตัวคิดกระเบื้องใต้จำนวน — ใช้อยู่ = บอกจำนวนแผ่น/กล่องที่ได้ · ยังไม่ใช้ = ชวนเฉพาะบรรทัดที่ชื่อเป็นงานกระเบื้อง
 * (บรรทัด ตร.ม. อื่นเปิดได้จากแผงแก้ไข ไม่โชว์ทุกบรรทัดให้รก)
 */
function TileLink({ item, onOpen }: Readonly<{ item: BoqItemDto; onOpen: () => void }>) {
  if (!isAreaUnit(item.unit)) return null;
  const c = item.tileCalc;
  if (!c && !looksLikeTile(item.name)) return null;
  let label = "คิดจำนวนกระเบื้อง";
  if (c) {
    const r = tileTakeoff(c, {
      rows: item.qtyBasis === "SHEET" ? takeoffInputsOf(item.takeoffRows) : null,
      area: Number(item.quantity) / (1 + Number(item.wasteFactorPct ?? 0) / 100),
    });
    label = r.errors.length > 0 ? "ตัวคิดกระเบื้อง" : `${r.pieces.toLocaleString("th-TH")} แผ่น${r.boxes != null ? ` · ${r.boxes.toLocaleString("th-TH")} กล่อง` : ""}`;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title="ตัวคิดกระเบื้อง — นับแผ่นตามแนวปู กล่อง ปูนกาว ยาแนว"
      className={`link-pill -mb-1 -mr-2.5 -mt-0.5 ml-auto flex w-fit items-center gap-1 text-xs ${c ? "text-brand" : "text-slate-400 hover:text-brand"}`}
    >
      <Grid3x3 size={11} /> {label}
    </button>
  );
}

/** ข้อความจำนวนของหัวหมวดย่อย — ชิ้นที่ถูกแบ่งหน้าตัดบอกช่วง "(ต่อ) 3–5 จาก 8 รายการ" */
function subheaderCountText(row: SubheaderRow): string | null {
  const total = row.itemIds.length;
  const cut = !row.collapsed && row.from != null && row.to != null && (row.from > 1 || row.to < total);
  if (cut) return `${row.continued ? "(ต่อ) " : ""}${row.from}–${row.to} จาก ${total} รายการ`;
  return row.count > 0 ? `(${row.count} รายการ)` : null;
}

/** ท้ายตาราง BOQ: "รายการ 16–30 จาก 46" + เลขหน้า — หมวดที่มีหน้าเดียวไม่ต้องมีแถบนี้ */
function BoqPager({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { boqShownCount, boqPage, boqPageCount, setBoqPage, boqPageFrom, boqPageTo } = vm;
  if (boqPageCount <= 1) return null;
  return (
    <div className="border-t border-slate-200 px-3 py-3 text-center">
      <p className="text-xs text-slate-500 tabular-nums" aria-live="polite">
        รายการ {boqPageFrom}–{boqPageTo} จาก {boqShownCount}
      </p>
      <Pagination page={boqPage} pageCount={boqPageCount} onChange={(p) => setBoqPage(p)} className="mt-1.5" />
    </div>
  );
}

function BoqTable({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { items, missingDriverLabels, openEditInfo, scrollToSection, boqGroups, activeBoqGroup, foldableSubs, toggleAllSubs, allSubsCollapsed, driftItemIds, openBoqGroup, currentVersion, boqPageRows, toggleSub, editingId, categoryById, driverValueOf, positionInGroup, reordering, moveItem, startEdit, handleDelete, activeBoqIndex, sheetItem, setSheetItem, saveItemSheet } = vm;
  const { tileItem, setTileItem, saveItemTile, materials } = vm;
  const { boqFocusId, setBoqFocusId, boqPageOfItem, boqPage, setBoqPage } = vm;
  // iPad (<1280): หน่วยต่อท้ายจำนวน · วัสดุ/ค่าแรงซ้อนในคอลัมน์เดียว · แก้ไข/ลบ เป็น ⋯ — ตารางพอดีจอ หัวตารางติดจอได้
  // (ผู้ใช้สั่ง 18 ต.ค.) สลับคอลัมน์ใน JSX ไม่ใช่ซ่อนด้วย CSS เพราะแถบหมวด/ยอดรวมใช้ colSpan
  const narrow = useMediaQuery(NARROW_SCREEN);
  const cols = narrow ? 6 : 8;
  // เหล็กเสริม: ชุดเสนอราคา (ใน BOQ) เทียบชุดสั่งตัด — มีเฉพาะโครงการที่ใช้ตัวคิดชิ้นส่วน
  const rebarCompare = useStructuralCompare(vm.projectId, items);
  // รายการสั่งเหล็กหน้างาน กางใต้แถบเหล็ก (เดิมอยู่แท็บรายการซื้อของที่ถอดออก) — โหลดแผนตัดเฉพาะตอนกาง
  const [showSiteRebar, setShowSiteRebar] = useState(false);
  const rebarCutting = useRebarCutting(vm.projectId, showSiteRebar ? items : []);

  // พาไปหน้าที่บรรทัดเป้าหมายอยู่ (เพิ่งเพิ่ม/เลื่อนลำดับข้ามหน้า/เปิดแก้จากแท็บอื่น) แล้วเลื่อนให้เห็น
  const focusPage = boqFocusId ? boqPageOfItem(boqFocusId) : 0;
  useEffect(() => {
    if (!boqFocusId) return;
    if (focusPage === 0) {
      // ไม่อยู่ในหมวดที่เปิด/ถูกยุบ — เลิกตาม ไม่ค้างค่าไว้ไปกระโดดทีหลังโดยไม่ตั้งใจ
      setBoqFocusId(null);
      return;
    }
    if (focusPage !== boqPage) {
      setBoqPage(focusPage, false, true);
      setBoqFocusId(boqFocusId); // setBoqPage ล้างเป้าหมาย — ตามต่อเพื่อเลื่อนแถวเข้าจอในรอบถัดไป
      return;
    }
    document.querySelector(`[data-boq-row-id="${boqFocusId}"]`)?.scrollIntoView({ block: "nearest" });
    setBoqFocusId(null);
  }, [boqFocusId, focusPage, boqPage, setBoqFocusId, setBoqPage]);

  return (
    <>
      {items.length > 0 && (
        <>
          <RebarCompareBar compare={rebarCompare} siteOpen={showSiteRebar} onOpenSite={() => setShowSiteRebar((v) => !v)} />
          {showSiteRebar && (
            <SiteRebarCard compare={rebarCompare} cutting={rebarCutting} projectId={vm.projectId} projectNo={vm.project.projectNo} />
          )}
          <StructuralMembersPanel
            projectId={vm.projectId}
            items={items}
            materials={materials}
            categoryOptions={vm.categoryOptions}
            editable={vm.editable}
            onChanged={vm.silentRefresh}
          />
          {missingDriverLabels.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <span>
                ⚠ บางบรรทัดยังไม่ได้ตั้งค่าวัด:{" "}
                <span className="font-medium">{missingDriverLabels.join(" · ")}</span> — ปริมาณจะยังไม่คิด/ไม่สเกลจนกว่าจะกรอก
              </span>
              <button
                type="button"
                onClick={() => {
                  openEditInfo();
                  scrollToSection("project-details");
                }}
                className="ml-auto shrink-0 rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-700 hover:bg-amber-100"
              >
                ตั้งค่าวัด
              </button>
            </div>
          )}
          <p className="mb-2 text-xs text-slate-500">
            ทั้งหมด {items.length} รายการ · {boqGroups.length} หมวดงาน
          </p>
          {/* หมุดตำแหน่งจริงของแถบหมวด (ตัวแถบติดจอ วัดจากมันไม่ได้) — ใช้เลื่อนกลับขึ้นมาตอนเปลี่ยนหมวด */}
          <div id="boq-group-anchor" aria-hidden />
          {/* แถบหมวด — แท็บชั้นที่สองใต้แท็บของโครงการ จึงเตี้ยและเบากว่า (h-10, ตัวอักษรปกติ)
              top-12 = ใต้แถบหัวโครงการที่ติดจอ (StickyPageHeader h-12) */}
          <ScrollableTabBar
            id="boq-group-tabs"
            ariaLabel="หมวดงาน BOQ"
            selectedKey={activeBoqGroup?.key ?? null}
            className="sticky top-12 z-20 h-10"
            end={foldableSubs.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllSubs}
                  aria-label={allSubsCollapsed ? "กางกลุ่มย่อยทั้งหมด" : "ยุบกลุ่มย่อยทั้งหมด"}
                  className="shrink-0 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-brand"
                >
                  {allSubsCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
                  {allSubsCollapsed ? "กางทั้งหมด" : "ยุบทั้งหมด"}
                </Button>
            ) : null}
          >
            {[null, ...boqGroups].map((g) => {
              const selected = g ? activeBoqGroup === g : activeBoqGroup == null;
              const drifted = g ? g.items.some((it) => driftItemIds.has(it.id)) : false;
              return (
                <button
                  key={g?.key ?? "__summary__"}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={g ? g.rootName : "ยอดรวมทุกหมวด"}
                  onClick={() => openBoqGroup(g?.key ?? null, true)}
                  className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 text-sm whitespace-nowrap transition-colors ${
                    selected
                      ? "border-brand font-medium text-brand"
                      : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  {g ? (
                    <>
                      {g.code && (
                        <span className={`font-mono text-xs ${selected ? "text-brand" : "text-slate-400"}`}>
                          {g.code}
                        </span>
                      )}
                      {shortCategoryName(g.rootName)}
                      <span
                        className={`rounded-full px-1.5 text-xs tabular-nums ${
                          selected ? "bg-brand/10 text-brand" : "bg-slate-200/70 text-slate-500"
                        }`}
                      >
                        {g.items.length}
                      </span>
                      {drifted && (
                        <span
                          className="size-1.5 rounded-full bg-amber-500"
                          title="มีบรรทัดที่ราคาในคลังเปลี่ยนหลังตั้งราคา"
                        />
                      )}
                    </>
                  ) : (
                    "สรุป"
                  )}
                </button>
              );
            })}
          </ScrollableTabBar>

          {!activeBoqGroup ? (
            // หน้าสรุป — ยอดรวมทุกหมวดในที่เดียว (เดิมคือ "ยุบทั้งหมด") กดแถวเพื่อเปิดหมวดนั้น
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
                  <tr>
                    <th className="w-16 px-3 py-2">รหัส</th>
                    <th className="px-3 py-2">หมวดงาน</th>
                    <th className="px-3 py-2 text-right">รายการ</th>
                    <th className="px-3 py-2 text-right">รวม</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {boqGroups.map((g) => (
                    <tr
                      key={g.key}
                      onClick={() => openBoqGroup(g.key, true)}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{g.code ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openBoqGroup(g.key, true);
                          }}
                          className="inline-flex items-center gap-2 text-left font-medium text-slate-800 hover:text-brand"
                        >
                          {g.rootName}
                          {g.items.some((it) => driftItemIds.has(it.id)) && (
                            <span
                              className="size-1.5 rounded-full bg-amber-500"
                              title="มีบรรทัดที่ราคาในคลังเปลี่ยนหลังตั้งราคา"
                            />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-500 tabular-nums">{g.items.length}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-800 tabular-nums">
                        {money(g.subtotal)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50">
                    <td colSpan={3} className="px-3 py-2 text-right font-medium text-slate-700">
                      รวมต้นทุนตรงทั้งหมด
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 tabular-nums">
                      {money(currentVersion.directCost)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
          <>
          <div className="mt-4 rounded-lg border border-slate-200 bg-white">
          {/* กับดัก sticky: overflow ใด ๆ บนตัวห่อทำให้หัวตารางเลิกติดจอ (และหัวตารางเลื่อนลงไปทับแถว 88px)
              — ปล่อยเลื่อนข้างได้เฉพาะจอเล็กกว่า iPad · iPad ขึ้นไปตารางพอดีจอแล้ว (คอลัมน์ยุบด้านบน) */}
          <div className="overflow-x-auto md:overflow-x-visible">
          <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          {/* top-22 (88px) = แถบหัวโครงการ 48 + แถบหมวด 40 — เลื่อนลึกแค่ไหนก็เห็นหมวด ยอดหมวด และชื่อคอลัมน์ */}
          <thead className="sticky top-22 z-10 text-left text-xs font-medium text-slate-600">
            {/* ชื่อหมวดเป็นแถวแรกของหัวตาราง (แบบเดียวกับหน้าแม่แบบ) + ยอดรวมหมวดชิดขวาตรงคอลัมน์ "รวม" */}
            <tr>
              <th colSpan={cols - 2} scope="colgroup" className="bg-[#ececf7] px-3 py-2.5 font-normal shadow-[inset_0_-1px_0_0_rgb(203,213,225)]">
                <div id="boq-group-title" className="flex items-baseline gap-3">
                  {activeBoqGroup.code && (
                    <span className="font-mono text-sm font-semibold text-brand">{activeBoqGroup.code}</span>
                  )}
                  <span className="text-sm font-semibold text-slate-900">{activeBoqGroup.rootName}</span>
                  <span className="text-xs text-slate-500">{activeBoqGroup.items.length} รายการ</span>
                </div>
              </th>
              <th className="bg-[#ececf7] px-3 py-2.5 shadow-[inset_0_-1px_0_0_rgb(203,213,225)] text-right text-sm font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                {money(activeBoqGroup.subtotal)}
              </th>
              <th className="bg-[#ececf7] shadow-[inset_0_-1px_0_0_rgb(203,213,225)]" />
            </tr>
            {/* เส้นคั่นเป็นเงา ไม่ใช่ border — border ของเซลล์ไม่ติดจอไปกับหัวตาราง (border-collapse)
                เหลือช่อง 1px ให้ปุ่มในแถวที่เลื่อนผ่านโผล่ขึ้นมาให้เห็น */}
            <tr className="[&_th]:bg-slate-200 [&_th]:shadow-[inset_0_-1px_0_0_rgb(203,213,225)]">
              <th className="px-3 py-2">รหัส</th>
              <th className="px-3 py-2">รายการ</th>
              <th className="px-3 py-2 text-right">จำนวน</th>
              {!narrow && <th className="px-3 py-2">หน่วย</th>}
              <th className="px-3 py-2 text-right">{narrow ? "วัสดุ / ค่าแรง" : "ราคาวัสดุ/หน่วย"}</th>
              {!narrow && <th className="px-3 py-2 text-right">ค่าแรง/หน่วย</th>}
              <th className="px-3 py-2 text-right">รวม</th>
              <th className="px-3 py-2"><span className="sr-only">คำสั่ง</span></th>
            </tr>
          </thead>
          <tbody>
            {boqPageRows.map((row) => {
              if (row.type === "subheader") {
                const countText = subheaderCountText(row);
                // แถบคั่นบาง ๆ บอกหมวดย่อย + จำนวนบรรทัด แล้วลากเส้นไปจนสุดขวา (อ่านเป็นชั้นเหมือนเอกสาร BOQ)
                return (
                  <tr key={`s-${row.key}${row.continued ? "-cont" : ""}`}>
                    <td colSpan={cols} className="px-3 pt-3 pb-1">
                      <button
                        type="button"
                        onClick={() => toggleSub(row.key, row.itemIds)}
                        aria-expanded={!row.collapsed}
                        className="flex w-full items-center gap-2 pl-2 text-left"
                      >
                        <span className="w-3 shrink-0 text-xs text-slate-500">
                          {row.collapsed ? "▸" : "▾"}
                        </span>
                        <span className="text-xs font-medium text-slate-500">{row.name}</span>
                        {countText && <span className="shrink-0 text-xs text-slate-400">{countText}</span>}
                        <span className="h-px flex-1 bg-slate-200" />
                      </button>
                    </td>
                  </tr>
                );
              }
              const item = row.item;
              return editingId === item.id ? (
                <BoqEditRow key={item.id} vm={vm} item={item} />
              ) : (
                <tr key={item.id} data-boq-row-id={item.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">
                    {categoryById.get(item.categoryId)?.code ?? "—"}
                  </td>
                  <td
                    className="px-3 py-2 text-slate-800"
                    title={buildCategoryPath(item.categoryId, categoryById)}
                  >
                    {item.name}
                    {item.note && <span className="block text-xs text-slate-500">{item.note}</span>}
                    {item.components.length > 0 && (
                      <details className="mt-0.5 group">
                        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-brand">
                          <Layers size={11} /> วัสดุย่อย {item.components.length} รายการ
                        </summary>
                        <ul className="mt-1 ml-3 space-y-0.5 text-xs text-slate-500">
                          {item.components.map((c) => (
                            <li key={c.id}>
                              {c.name} — {Number(c.qtyPerUnit).toLocaleString("th-TH")} {c.unit}/หน่วย
                              {c.wasteFactorPct != null && Number(c.wasteFactorPct) > 0
                                ? ` (เผื่อ ${Number(c.wasteFactorPct)}%)`
                                : ""}{" "}
                              × {money(c.unitPrice)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-800">
                    {item.quantity}
                    {narrow && <span className="whitespace-nowrap text-slate-600"> {item.unit}</span>}
                    {item.qtyBasis === "SHEET" && (
                      <button
                        type="button"
                        onClick={() => setSheetItem(item)}
                        title="เปิดใบถอดแบบ — ดูว่าจำนวนนี้มาจากชิ้นไหนบ้าง และแก้ได้"
                        className="link-pill -mb-1 -mr-2.5 -mt-0.5 ml-auto flex w-fit items-center gap-1 text-xs text-brand"
                      >
                        <Ruler size={11} /> ใบถอดแบบ {item.takeoffRows.length} แถว
                      </button>
                    )}
                    <RebarCompareTag compare={rebarCompare} itemId={item.id} />
                    <TileLink item={item} onOpen={() => setTileItem(item)} />
                    {item.qtyBasis !== "MANUAL" &&
                      item.qtyBasis !== "SHEET" &&
                      (driverValueOf(item.qtyBasis) == null ? (
                        <span
                          className="mt-0.5 block text-xs text-amber-600"
                          title={`บรรทัดนี้คิดตาม${basisConfig(item.qtyBasis).measureLabel} แต่โครงการยังไม่ได้ตั้งค่านั้น จึงใช้ปริมาณที่แช่แข็งไว้ (ไม่สเกลตามค่าวัด)`}
                        >
                          ⚠ ยังไม่ตั้ง{basisConfig(item.qtyBasis).measureLabel}
                        </span>
                      ) : (
                        <span
                          className="mt-0.5 block text-xs text-brand"
                          title={`คิดจาก${basisConfig(item.qtyBasis).measureLabel}ของโครงการ × ${basisConfig(item.qtyBasis).perLabel} × (1 + เผื่อเสีย)`}
                        >
                          {basisConfig(item.qtyBasis).label.replace(/ \(.*\)$/, "")} ×
                          {Number(item.qtyCoefficient ?? 0)}
                          {Number(item.wasteFactorPct ?? 0) > 0 && ` +${Number(item.wasteFactorPct)}%`}
                        </span>
                      ))}
                  </td>
                  {!narrow && <td className="px-3 py-2 text-slate-700">{item.unit}</td>}
                  <td className="px-3 py-2 text-right text-slate-800 whitespace-nowrap">
                    {money(item.materialUnitPrice)}
                    {narrow && <span className="block text-xs text-slate-500">แรง {money(item.laborUnitPrice)}</span>}
                  </td>
                  {!narrow && <td className="px-3 py-2 text-right text-slate-800">{money(item.laborUnitPrice)}</td>}
                  <td className="px-3 py-2 text-right text-slate-800 font-medium whitespace-nowrap">{money(item.lineTotal)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const pos = positionInGroup.get(item.id);
                        const count = pos?.group.items.length ?? 0;
                        if (!pos || count < 2) return null;
                        const arrow =
                          "rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-800 disabled:pointer-events-none disabled:opacity-25";
                        return (
                          <div className="flex flex-col" role="group" aria-label="เลื่อนลำดับ">
                            <button
                              type="button"
                              className={arrow}
                              aria-label={`เลื่อน ${item.name} ขึ้น`}
                              title="เลื่อนขึ้น"
                              disabled={reordering || pos.index === 0}
                              onClick={() => moveItem(item.id, -1)}
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              type="button"
                              className={arrow}
                              aria-label={`เลื่อน ${item.name} ลง`}
                              title="เลื่อนลง"
                              disabled={reordering || pos.index === count - 1}
                              onClick={() => moveItem(item.id, 1)}
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                        );
                      })()}
                      {narrow ? (
                        <RowMenu
                          label={`คำสั่งของ ${item.name}`}
                          items={[
                            { key: "edit", label: "แก้ไข", onSelect: () => startEdit(item) },
                            { key: "delete", label: "ลบ", danger: true, onSelect: () => void handleDelete(item.id) },
                          ]}
                        />
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                            <Pencil size={14} /> แก้ไข
                          </Button>
                          <Button variant="dangerQuiet" size="sm" onClick={() => handleDelete(item.id)}>
                            <Trash2 size={14} /> ลบ
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* ยอดรวมทั้งโครงการอยู่ท้ายทุกหมวด — ดูทีละหมวดแต่ยังเห็นว่าหมวดนี้ขยับยอดรวมเท่าไร */}
          {boqGroups.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={cols - 2} className="px-3 py-2 text-right font-medium text-slate-700">
                  รวมต้นทุนตรงทั้งหมด
                </td>
                <td className="px-3 py-2 text-right font-semibold text-slate-800 tabular-nums">
                  {money(currentVersion.directCost)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
          </div>
          <BoqPager vm={vm} />
          </div>
          {/* อ่านหมวดยาวจบแล้วไปต่อได้เลย ไม่ต้องเลื่อนกลับขึ้นไปที่แถบ */}
          <nav aria-label="เปลี่ยนหมวด" className="mt-3 flex items-center justify-between gap-3 text-sm">
            {(() => {
              const prev = activeBoqIndex > 0 ? boqGroups[activeBoqIndex - 1] : null;
              const next = boqGroups[activeBoqIndex + 1] ?? null;
              const navBtn =
                "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900";
              return (
                <>
                  <button type="button" onClick={() => openBoqGroup(prev?.key ?? null, true)} className={navBtn}>
                    <ChevronLeft size={16} />
                    {prev ? (
                      <>
                        {prev.code && <span className="font-mono text-xs text-slate-400">{prev.code}</span>}
                        {shortCategoryName(prev.rootName)}
                      </>
                    ) : (
                      "สรุป"
                    )}
                  </button>
                  {next && (
                    <button type="button" onClick={() => openBoqGroup(next.key, true)} className={navBtn}>
                      {next.code && <span className="font-mono text-xs text-slate-400">{next.code}</span>}
                      {shortCategoryName(next.rootName)}
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
      {tileItem && (
        <TileCalcDialog
          item={tileItem}
          materials={materials}
          onApply={(payload) => saveItemTile(tileItem, payload)}
          onDetach={tileItem.tileCalc ? (price) => saveItemTile(tileItem, null, price) : undefined}
          onClose={() => setTileItem(null)}
        />
      )}
      {sheetItem && (
        <TakeoffSheetDialog
          lineName={sheetItem.name}
          unit={sheetItem.unit}
          initialRows={sheetItem.takeoffRows}
          initialWaste={sheetItem.wasteFactorPct ?? "0"}
          onApply={(rows, waste) => saveItemSheet(sheetItem, rows, waste)}
          onDetach={() => saveItemSheet(sheetItem, null, null)}
          onClose={() => setSheetItem(null)}
        />
      )}
    </>
  );
}

/** รายละเอียดโครงการ: ดูอย่างเดียว หรือฟอร์มแก้ไข */
function ProjectInfoCard({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { showEditInfo, infoForm, setInfoForm, handleSaveInfo, savingInfo, setShowEditInfo, project } = vm;
  const { infoOpenings, setInfoOpenings, showOpenings, setShowOpenings } = vm;
  // รายการที่จะบันทึก: ที่แก้ในฟอร์มนี้ ไม่งั้นของเดิมในโครงการ
  const openings = infoOpenings ?? project.openings ?? [];
  const wallInput = infoForm.wallAreaSqm.trim() === "" ? null : Number(infoForm.wallAreaSqm);
  return (
    <>
      {showEditInfo ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-700 sm:col-span-2">
            <span>ชื่อโครงการ</span>
            <input
              value={infoForm.name}
              onChange={(e) => setInfoForm((f) => ({ ...f, name: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700 sm:col-span-2">
            <span>สถานที่ก่อสร้าง / ที่อยู่หน้างาน</span>
            <input
              value={infoForm.siteAddress}
              onChange={(e) => setInfoForm((f) => ({ ...f, siteAddress: e.target.value }))}
              placeholder="เช่น 99/1 ต.ในเมือง อ.เมือง จ.ขอนแก่น"
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>พื้นที่ใช้สอย (ตร.ม.)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={infoForm.areaSqm}
              onChange={(e) => setInfoForm((f) => ({ ...f, areaSqm: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <div className="hidden sm:block" />
          {/* ค่าวัดสำหรับถอดปริมาณ (Phase 2) — ตัวขับของบรรทัด BOQ ที่ผูกกับผนัง/รอบรูป/ปริมาตร */}
          <div className="sm:col-span-2 rounded-md bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-xs font-medium text-slate-500 mb-2">
              ค่าวัดสำหรับถอดปริมาณ{" "}
              <span className="font-normal text-slate-400">(ใช้กับบรรทัด BOQ แบบ “ต่อผนัง/รอบรูป/ปริมาตร/ห้องน้ำ/ชั้น”)</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>พื้นที่ผนัง (ตร.ม.)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={infoForm.wallAreaSqm}
                  onChange={(e) => setInfoForm((f) => ({ ...f, wallAreaSqm: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>ความยาวรอบรูป (ม.)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={infoForm.perimeterM}
                  onChange={(e) => setInfoForm((f) => ({ ...f, perimeterM: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>ปริมาตรคอนกรีต (ลบ.ม.)</span>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={infoForm.concreteVolumeM3}
                  onChange={(e) => setInfoForm((f) => ({ ...f, concreteVolumeM3: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>พื้นที่ตั้งอาคาร/หลังคา (ตร.ม.)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={infoForm.footprintSqm}
                  onChange={(e) => setInfoForm((f) => ({ ...f, footprintSqm: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>จำนวนห้องน้ำ (ห้อง)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={infoForm.bathrooms}
                  onChange={(e) => setInfoForm((f) => ({ ...f, bathrooms: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>จำนวนชั้น (ชั้น)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={infoForm.floors}
                  onChange={(e) => setInfoForm((f) => ({ ...f, floors: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
            </div>
            {/* ช่องเปิดหักจากพื้นที่ผนัง — งานก่อ/ฉาบ/ทาสีทุกบรรทัดที่คิดต่อผนังลดตาม */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 pt-2 text-xs">
              <span className="text-slate-700">ช่องเปิดประตู/หน้าต่าง</span>
              <span className="text-slate-800 tabular-nums">
                {openings.length > 0
                  ? `${openingsTotal(openings).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ตร.ม. (${openings.reduce((n, o) => n + o.count, 0)} ช่อง)`
                  : "ยังไม่ได้ใส่ — ผนังคิดเต็มพื้นที่"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setShowOpenings(true)}>
                {openings.length > 0 ? "แก้รายการ" : "ใส่รายการช่องเปิด"}
              </Button>
              {showOpenings && (
                <OpeningsDialog
                  initial={openings}
                  wallArea={wallInput}
                  onApply={(next) => {
                    setInfoOpenings(next);
                    setShowOpenings(false);
                  }}
                  onClose={() => setShowOpenings(false)}
                />
              )}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>วันเริ่มก่อสร้าง</span>
            <DateInput
              value={infoForm.startDate}
              onChange={(v) => setInfoForm((f) => ({ ...f, startDate: v }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>วันคาดว่าแล้วเสร็จ</span>
            <DateInput
              value={infoForm.targetEndDate}
              onChange={(v) => setInfoForm((f) => ({ ...f, targetEndDate: v }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700 sm:col-span-2">
            <span>หมายเหตุ / ขอบเขตงาน</span>
            <textarea
              rows={2}
              value={infoForm.description}
              onChange={(e) => setInfoForm((f) => ({ ...f, description: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm resize-y"
            />
          </label>
          <div className="sm:col-span-2 flex gap-2 border-t border-slate-100 pt-3">
            <Button size="sm" onClick={handleSaveInfo} disabled={savingInfo || !infoForm.name.trim()}>
              <Check size={14} /> บันทึก
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowEditInfo(false)}>
              <X size={14} /> ยกเลิก
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500">สถานที่ก่อสร้าง</dt>
            <dd className="text-slate-800">{project.siteAddress || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">พื้นที่ใช้สอย</dt>
            <dd className="text-slate-800">
              {project.areaSqm
                ? `${Number(project.areaSqm).toLocaleString("th-TH")} ตร.ม.`
                : "—"}
            </dd>
          </div>
          {(project.wallAreaSqm ||
            project.perimeterM ||
            project.concreteVolumeM3 ||
            project.footprintSqm ||
            project.bathrooms != null ||
            project.floors != null) && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500">ค่าวัดถอดปริมาณ</dt>
              <dd className="text-slate-800">
                {[
                  project.wallAreaSqm &&
                    (project.openingAreaSqm
                      ? `ผนัง ${Number(project.wallAreaSqm).toLocaleString("th-TH")} − ช่องเปิด ${Number(project.openingAreaSqm).toLocaleString("th-TH")} = ${(Number(project.wallAreaSqm) - Number(project.openingAreaSqm)).toLocaleString("th-TH", { maximumFractionDigits: 2 })} ตร.ม.`
                      : `ผนัง ${Number(project.wallAreaSqm).toLocaleString("th-TH")} ตร.ม.`),
                  project.perimeterM &&
                    `รอบรูป ${Number(project.perimeterM).toLocaleString("th-TH")} ม.`,
                  project.concreteVolumeM3 &&
                    `ปริมาตร ${Number(project.concreteVolumeM3).toLocaleString("th-TH")} ลบ.ม.`,
                  project.footprintSqm &&
                    `ตั้งอาคาร ${Number(project.footprintSqm).toLocaleString("th-TH")} ตร.ม.`,
                  project.bathrooms != null && `ห้องน้ำ ${project.bathrooms} ห้อง`,
                  project.floors != null && `${project.floors} ชั้น`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-slate-500">วันเริ่มก่อสร้าง</dt>
            <dd className="text-slate-800">{formatDateOnly(project.startDate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">วันคาดว่าแล้วเสร็จ</dt>
            <dd className="text-slate-800">{formatDateOnly(project.targetEndDate)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-slate-500">หมายเหตุ / ขอบเขตงาน</dt>
            <dd className="text-slate-800 whitespace-pre-wrap">{project.description || "—"}</dd>
          </div>
        </dl>
      )}
    </>
  );
}

/** แท็บใบเสนอราคา: ตารางทุกฉบับ + เปลี่ยนสถานะ/แก้วันยืนราคา/ไฟล์แนบ */
function QuotesTab({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { activeTab, handleCreateQuote, quoteBlocker, scrollToSection, quotes, openValidity, handleQuoteTransition, projectId, handleDeleteQuote, validityEdit, setValidityEdit, saveValidity, savingValidity, reloadQuotes, exportingExcel, exportQuoteExcel } = vm;
  return (
    <>
      {activeTab === "quotes" && (
        <>
      <div id="quotes-section" className="flex items-center justify-between mb-2 scroll-mt-16">
        <h2 className="text-lg font-medium text-slate-800">ใบเสนอราคา</h2>
        <button
          type="button"
          onClick={handleCreateQuote}
          disabled={quoteBlocker != null}
          className="text-sm bg-slate-800 text-white rounded-md px-3 py-1.5 disabled:opacity-40"
        >
          + สร้างใบเสนอราคาใหม่
        </button>
      </div>

      {/* ปุ่มจางที่ไม่บอกเหตุผล = คนใช้ยืนงงอยู่ตรงนี้โดยไม่รู้ว่าต้องไปทำอะไรก่อน */}
      {quoteBlocker && (
        <p className="mb-2 text-sm text-amber-700">
          ยังสร้างใบเสนอราคาไม่ได้ — {BLOCKER_TEXT[quoteBlocker].detail}{" "}
          <button
            type="button"
            onClick={() => scrollToSection(BLOCKER_TEXT[quoteBlocker].section)}
            className="underline decoration-dotted underline-offset-2 hover:text-brand"
          >
            {BLOCKER_TEXT[quoteBlocker].action}
          </button>
        </p>
      )}

      {quotes.length === 0 && <p className="text-slate-500">ยังไม่มีใบเสนอราคา</p>}

      {/* ไฟล์แนบอยู่ใต้ใบแต่ละใบ ไม่ใช่ที่ตัวโครงการ — ไม่มีใบก็ไม่มีที่อัป ต้องบอกไว้ตรงนี้ */}
      {quotes.length === 0 && !quoteBlocker && (
        <p className="mt-1 text-sm text-slate-500">
          สร้างใบเสนอราคาก่อน แล้วช่องแนบไฟล์ BOQ/แบบ (Excel หรือ PDF) จะอยู่ใต้ใบนั้น
        </p>
      )}

      {quotes.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white mb-8">
        <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              {/* whitespace-nowrap: พอเพิ่มคอลัมน์ "ลูกค้าเปิดดู" ที่เหลือถูกบีบจน "ตอบรับเมื่อ" ตกบรรทัด */}
              {/* iPad (<1280): ฉบับที่ไปใต้เลขที่ · เวลาตอบรับไปใต้สถานะ — เลขที่ไม่ตกเป็นสามบรรทัด (ผู้ใช้สั่ง 18 ต.ค.) */}
              <th className="hidden whitespace-nowrap px-3 py-2 xl:table-cell">ฉบับที่</th>
              <th className="whitespace-nowrap px-3 py-2">เลขที่</th>
              <th className="whitespace-nowrap px-3 py-2">สถานะ</th>
              <th className="whitespace-nowrap px-3 py-2">ส่งเมื่อ</th>
              <th className="whitespace-nowrap px-3 py-2">ลูกค้าเปิดดู</th>
              <th className="hidden whitespace-nowrap px-3 py-2 xl:table-cell">ตอบรับเมื่อ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <Fragment key={q.id}>
                <tr className="border-t border-slate-100">
                  <td className="hidden px-3 py-2 text-slate-700 xl:table-cell">ฉบับที่ {q.revisionNo}</td>
                  <td className="px-3 py-2 text-slate-800">
                    <span className="whitespace-nowrap">{q.quoteNo}</span>
                    <span className="block text-xs text-slate-500 xl:hidden">ฉบับที่ {q.revisionNo}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={badgeClass(QUOTE_STATUS_COLOR[q.status])}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
                    <QuoteApprovalStatus quote={q} />
                    {q.respondedAt && (
                      <span className="mt-1 block text-xs text-slate-500 xl:hidden">
                        ตอบรับ {formatDateTime(q.respondedAt)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {formatDateTime(q.sentAt)}
                    {/* วันยืนราคามีความหมายเฉพาะใบที่ยังรอคำตอบ — กดที่วันเพื่อขยาย */}
                    {q.status === "SENT" && q.validUntil && (
                      <button
                        type="button"
                        onClick={() => openValidity(q)}
                        className={`mt-0.5 block whitespace-nowrap text-left text-xs underline decoration-dotted underline-offset-2 ${
                          q.validUntil < todayBangkok()
                            ? "text-red-600 decoration-red-300"
                            : "text-slate-500 decoration-slate-300 hover:text-brand hover:decoration-brand"
                        }`}
                      >
                        {q.validUntil < todayBangkok() ? "พ้นกำหนดยืนราคา " : "ยืนราคาถึง "}
                        {formatShortDay(q.validUntil)}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <QuoteViewCell quote={q} />
                  </td>
                  <td className="hidden px-3 py-2 text-slate-700 xl:table-cell">{formatDateTime(q.respondedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center flex-wrap gap-2">
                      {q.status === "DRAFT" && (
                        <QuoteApprovalControls
                          projectId={projectId}
                          quote={q}
                          onChanged={reloadQuotes}
                          onSend={() => handleQuoteTransition(q.id, "SENT")}
                        />
                      )}
                      {q.status !== "DRAFT" && QUOTE_NEXT_TRANSITIONS[q.status].map((s) => (
                        <Button
                          key={s}
                          variant={s === "SENT" ? "brand" : "ghost"}
                          size="sm"
                          onClick={() => handleQuoteTransition(q.id, s)}
                        >
                          {s === "SENT" && <Send size={14} />}
                          {QUOTE_ACTION_LABEL[s]}
                        </Button>
                      ))}
                      {/* ลิงก์จริง ไม่ใช่ปุ่มที่ fetch แล้ว window.open — เปิดแท็บได้ทันทีที่กด
                          (ไม่ต้องรอ Puppeteer สร้างไฟล์ก่อน) และกดกลางเมาส์/Ctrl+คลิกได้ตามปกติ */}
                      <a
                        href={pdfViewerPath("quote", projectId, q.id)}
                        target="_blank"
                        rel="noopener"
                        className={`${buttonClasses("ghost", "sm")} whitespace-nowrap`}
                      >
                        <FileText size={14} /> เปิด PDF
                      </a>
                      {/* ฉบับลูกค้า — ตัวเลขชุดเดียวกับ PDF ไม่มีราคาทุน ส่งต่อให้ลูกค้า/ผู้ควบคุมงานได้ */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => exportQuoteExcel(q.id, q.quoteNo)}
                        disabled={exportingExcel === q.id}
                        title="BOQ ราคาตามใบเสนอราคานี้ ไม่มีราคาทุน ส่งให้ลูกค้าได้"
                      >
                        <FileSpreadsheet size={14} /> {exportingExcel === q.id ? "กำลังสร้าง..." : "Excel"}
                      </Button>
                      {q.status === "DRAFT" && (
                        <Button variant="dangerQuiet" size="sm" onClick={() => handleDeleteQuote(q.id, q.quoteNo)}>
                          <Trash2 size={14} /> ลบฉบับร่างถาวร
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
                {validityEdit?.quoteId === q.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={7} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <span>ยืนราคาถึงวันที่</span>
                          <DateInput
                            min={todayBangkok()}
                            max={addDaysIso(todayBangkok(), 365)}
                            value={validityEdit.value}
                            onChange={(v) =>
                              setValidityEdit({ quoteId: q.id, value: v })
                            }
                            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
                          />
                        </label>
                        <Button
                          size="sm"
                          onClick={saveValidity}
                          disabled={savingValidity || !validityEdit.value}
                        >
                          <Check size={14} /> บันทึก
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setValidityEdit(null)}>
                          ยกเลิก
                        </Button>
                        <span className="text-xs text-slate-500">
                          ลูกค้าได้รับแจ้งเตือน และกดยอมรับได้ถึงวันที่เลือก
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {q.customerNote && (
                  <tr className={q.status === "REJECTED" ? "bg-red-50" : "bg-amber-50"}>
                    <td
                      colSpan={7}
                      className={`px-3 py-2 text-sm ${q.status === "REJECTED" ? "text-red-800" : "text-amber-800"}`}
                    >
                      <span className="font-medium">
                        {q.status === "REJECTED" ? "เหตุผลที่ปฏิเสธ:" : "หมายเหตุจากลูกค้า:"}
                      </span>{" "}
                      {q.customerNote}
                    </td>
                  </tr>
                )}
                <tr>
                  <td colSpan={7} className="px-3 pb-3 pt-0 bg-white">
                    <QuoteReturnNote quote={q} />
                    <QuoteLockedNote quote={q} />
                    <QuoteAttachmentsPanel
                      projectId={projectId}
                      quoteId={q.id}
                      attachments={q.attachments ?? []}
                      onChange={reloadQuotes}
                    />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        </div>
      )}

        </>
      )}
    </>
  );
}

/** แท็บสัญญา: ออกสัญญาจากแม่แบบ + รายการสัญญา + แผงแก้ข้อความ/งวดเงิน */
const money2 = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * แท็บ "สัญญาและการเงิน" — ทุกเรื่องของสัญญาอยู่ที่เดียว (แบบ Procore/Buildertrend)
 *
 * หัวการ์ด = สัญญาที่ลงนามแล้ว + มูลค่าเดิม → ปัจจุบัน (รวมงานเพิ่ม-ลด) · ข้างในแยกเป็น 3 มุมมองย่อย
 * งวดและรับเงิน (ค่าเริ่มต้น) → งานเพิ่ม-ลด → เอกสารสัญญา (ข้อความ/PDF/ฉบับร่าง)
 * ยังไม่ลงนามสักฉบับ = มีแต่งานเอกสาร จึงแสดงรายการสัญญาตรง ๆ ไม่มีหัวการ์ดกับมุมมองย่อย
 * มีสัญญาที่ลงนามหลายฉบับ (เช่น ออกแบบ + ก่อสร้างแยกกัน) = หัวการ์ดกลายเป็นช่องเลือกฉบับ
 */
function ContractFinanceTab({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { contracts, contractMoney, projectId, signedContracts, activeContract, contractView, setContractParams, silentRefresh, goTab } = vm;

  if (!activeContract) {
    return (
      <div id="contracts-section" className="scroll-mt-16">
        <ContractDocuments vm={vm} title="สัญญา" />
        <p className="mt-3 text-xs text-slate-500">ลงนามสัญญาแล้ว งวดรับเงินและงานเพิ่ม-ลดจะอยู่ในแท็บนี้</p>
      </div>
    );
  }

  const view = contractMoney.get(activeContract.id);
  const legacy = Boolean(view && !view.hasPlan && view.contractAmount == null);
  const original = activeContract.amount == null ? null : Number(activeContract.amount);
  // มูลค่าปัจจุบัน = ผลรวมแผนงวดหลังงานเพิ่ม-ลด (ระบบบังคับให้เท่ามูลค่าสัญญาเสมอ)
  const current = view?.hasPlan ? view.summary.planTotal : null;
  const delta = original != null && current != null ? Math.round((current - original) * 100) / 100 : 0;
  const drafts = contracts.filter((c) => !c.signedAt).length;
  const views: { key: ContractView; label: string }[] = [
    { key: "payments", label: "งวดและรับเงิน" },
    { key: "changes", label: "งานเพิ่ม-ลด" },
    { key: "documents", label: drafts > 0 ? `เอกสารสัญญา · ร่าง ${drafts}` : "เอกสารสัญญา" },
  ];

  return (
    <div id="contracts-section" className="scroll-mt-16">
      <div className="mb-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {signedContracts.length > 1 ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <span>สัญญา</span>
                <select
                  value={activeContract.id}
                  onChange={(e) => setContractParams({ contract: e.target.value })}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-800"
                >
                  {signedContracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contractNo}
                      {c.templateName ? ` · ${c.templateName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-sm text-slate-700">
                สัญญา <span className="font-semibold text-slate-800">{activeContract.contractNo}</span>
              </p>
            )}
            <p className="mt-0.5 text-xs text-slate-500">
              ลงนาม {formatDateTime(activeContract.signedAt)}
              {/* มีช่องเลือกฉบับ = ชื่อแม่แบบอยู่ในตัวเลือกแล้ว ไม่พิมพ์ซ้ำ */}
              {signedContracts.length === 1 && activeContract.templateName && ` · ${activeContract.templateName}`}
            </p>
          </div>
          <a
            href={pdfViewerPath("contract", projectId, activeContract.id)}
            target="_blank"
            rel="noopener"
            className="link-pill -mr-2.5 inline-flex items-center gap-1 text-xs font-medium text-brand"
          >
            <FileText size={13} /> เปิดสัญญา (PDF)
          </a>
        </div>
        <p className="mt-2 text-sm text-slate-700 tabular-nums">
          {original == null ? (
            <span className="text-slate-500">สัญญาเก่าที่ไม่ได้บันทึกมูลค่าไว้</span>
          ) : Math.abs(delta) >= 0.01 && current != null ? (
            <>
              มูลค่าตามสัญญา {money2(original)} → ปัจจุบัน <b className="font-semibold text-slate-800">{money2(current)}</b> บาท{" "}
              <span className={delta > 0 ? "text-emerald-700" : "text-red-700"}>
                (งานเพิ่ม-ลด {delta > 0 ? "+" : "−"}
                {money2(Math.abs(delta))})
              </span>
            </>
          ) : (
            <>
              มูลค่าสัญญา <b className="font-semibold text-slate-800">{money2(original)}</b> บาท
            </>
          )}
        </p>
      </div>

      {/* มุมมองย่อย — ปุ่มแคปซูล ไม่ใช่แท็บซ้อนแท็บ (เส้นใต้ซ้อนสองชั้นอ่านยาก) */}
      <div role="group" aria-label="เรื่องของสัญญา" className="mb-3 flex flex-wrap gap-1.5">
        {views.map((v) => {
          const on = v.key === contractView;
          return (
            <button
              key={v.key}
              type="button"
              aria-pressed={on}
              onClick={() => setContractParams({ view: v.key })}
              className={`rounded-full border px-3 py-1 text-sm ${
                on ? "border-brand/30 bg-brand/10 font-medium text-brand" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      {contractView === "payments" &&
        (legacy ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
            สัญญาเก่าที่ไม่ได้บันทึกมูลค่าและงวดเงินไว้ — ยังติดตามรับเงินในระบบไม่ได้
          </p>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <ContractPaymentsPanel key={activeContract.id} projectId={projectId} contractId={activeContract.id} />
          </div>
        ))}

      {/* งานเพิ่ม-ลด = บันทึกแนบท้ายสัญญาฉบับนี้ (เปลี่ยนมูลค่าและงวดเงิน) — มีได้เฉพาะสัญญาที่ลงนามแล้ว */}
      {contractView === "changes" && (
        <ChangeOrdersPanel
          key={activeContract.id}
          projectId={projectId}
          contract={activeContract}
          onChanged={() => void silentRefresh()}
          onGoToBoq={() => goTab("boq")}
        />
      )}

      {contractView === "documents" && <ContractDocuments vm={vm} title="เอกสารสัญญาทั้งหมด" />}
    </div>
  );
}

/** รายการสัญญาทุกฉบับ (ร่าง + ลงนามแล้ว) — ออกฉบับใหม่ · แก้ถ้อยคำ/แผนงวดก่อนลงนาม · ลงนาม · PDF */
function ContractDocuments({ vm, title }: Readonly<{ vm: ProjectVM; title: string }>) {
  const { contractTemplates, newContractTemplateId, setNewContractTemplateId, handleCreateContract, contracts, handleSignContract, setEditingContractId, editingContractId, projectId, silentRefresh } = vm;
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-slate-800">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* ช่องเลือกโผล่เฉพาะตอนมีให้เลือกจริง — มีแม่แบบเดียวหน้าตาเหมือนเดิมเป๊ะ */}
          {contractTemplates.length > 1 && (
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <span>ใช้แม่แบบ</span>
              <select
                value={newContractTemplateId}
                onChange={(e) => setNewContractTemplateId(e.target.value)}
                // คุมความกว้างไว้ ไม่งั้น <select> ขยายตามชื่อแม่แบบที่ยาวที่สุด
                // แล้วไปกินพื้นที่แถบหัวเกือบครึ่ง (ชื่อเต็มยังเห็นตอนกางรายการ)
                className="max-w-[240px] truncate rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
              >
                {contractTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? " (ค่าเริ่มต้น)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={handleCreateContract}
            className="text-sm bg-slate-800 text-white rounded-md px-3 py-1.5"
          >
            + สร้างสัญญาใหม่
          </button>
        </div>
      </div>

      {contracts.length === 0 && <p className="text-slate-500">ยังไม่มีสัญญา</p>}

      {contracts.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">เลขที่</th>
              <th className="px-3 py-2">แม่แบบ</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2 text-right">มูลค่าสัญญา</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => {
              const open = editingContractId === c.id;
              // แท็บสัญญา = งานเอกสารอย่างเดียว · เงินที่เก็บได้อยู่แท็บ "รับเงิน" ที่เดียว (ไม่โชว์ตัวเลขซ้ำตรงนี้)
              // กางได้เฉพาะสัญญาที่ยังไม่ลงนาม (แก้ถ้อยคำ/แผนงวด) — ลงนามแล้วถ้อยคำแก้ไม่ได้
              const expandable = !c.signedAt;
              const toggle = () => setEditingContractId((id) => (id === c.id ? null : c.id));
              return (
              <Fragment key={c.id}>
                {/* ทั้งแถวกดกาง/พับได้ (ปุ่มลงนามกับ PDF ในแถวไม่นับ) — ลูกศรท้ายแถวคือปุ่มจริงสำหรับคีย์บอร์ด */}
                <tr
                  id={`contract-row-${c.id}`}
                  onClick={(e) => {
                    if (!expandable || (e.target as HTMLElement).closest("a,button")) return;
                    toggle();
                  }}
                  className={`border-t border-slate-100 scroll-mt-14 ${expandable ? "cursor-pointer" : ""} ${open ? "bg-slate-50" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-slate-800">{c.contractNo}</td>
                  {/* สัญญาที่ออกก่อนมีระบบแม่แบบค่าเป็น null จริง — ขีดไว้ ไม่เดาชื่อใส่แทน */}
                  <td className="px-3 py-2 text-slate-600">{c.templateName ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {c.signedAt ? (
                      <>ลงนาม {formatDateTime(c.signedAt)}</>
                    ) : (
                      <span className="text-slate-500">ร่าง — ยังไม่ลงนาม</span>
                    )}
                  </td>
                  {/* มูลค่าที่ตรึงลงสัญญาตอนออก (ข้อมูลของตัวเอกสาร) · สัญญาเก่าก่อนระบบงวดเงินไม่มีค่า = ขีด ไม่เดา */}
                  <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                    {c.amount == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      Number(c.amount).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {!c.signedAt && (
                        <Button variant="brand" size="sm" onClick={() => handleSignContract(c.id)}>
                          <Check size={14} /> ลงนาม
                        </Button>
                      )}
                      <a
                        href={pdfViewerPath("contract", projectId, c.id)}
                        target="_blank"
                        rel="noopener"
                        title="เปิด PDF"
                        aria-label={`เปิด PDF สัญญา ${c.contractNo}`}
                        className={iconButtonClasses()}
                      >
                        <FileText size={16} />
                      </a>
                      {/* ทางเข้าเดียวของการเติมยอดงวดเงินก่อนลงนาม — แม่แบบใส่ยอดจริงไม่ได้เพราะใช้ร่วมกันทุกโครงการ */}
                      {expandable ? (
                        <button
                          type="button"
                          onClick={toggle}
                          aria-expanded={open}
                          aria-label={`${contractPanelLabel(open, Boolean(c.signedAt))} ${c.contractNo}`}
                          title={contractPanelLabel(open, Boolean(c.signedAt))}
                          className={iconButtonClasses()}
                        >
                          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                      ) : (
                        <span className="inline-block w-8" aria-hidden />
                      )}
                    </div>
                  </td>
                </tr>
                {open && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={5} className="bg-slate-50 px-3 py-4">
                      <ContractBodyEditor
                        projectId={projectId}
                        contract={c}
                        onSaved={async () => {
                          setEditingContractId(null);
                          await silentRefresh();
                        }}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

    </>
  );
}

const WARN_PILL = "inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200";

/** ทางเลือกหนึ่งในคำถาม "งานนี้ของลูกค้าคนไหน?" — บอกว่ากดแล้วได้อะไรก่อนกด */
function OwnerChoice({
  title,
  description,
  action,
  active,
  onClick,
}: Readonly<{ title: string; description: string; action: string; active: boolean; onClick: () => void }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
        active ? "border-slate-800 ring-1 ring-slate-800" : "border-slate-200 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      <span className="font-medium text-slate-800">{title}</span>
      <span className="text-xs text-slate-500">{description}</span>
      <span className="mt-auto pt-1 text-xs font-medium text-brand">{action} ›</span>
    </button>
  );
}

/** หัวโครงการ: ชื่อ/สถานะ/ผู้ติดต่อ + ผูกลูกค้า/คำขอ/ออกลิงก์เข้าใช้ + ปุ่มยกเลิกโครงการ */
function ProjectTitleBlock({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { project, isCustom, currentVersion, editable, contactName, contactEmail, contactPhone, differentRequester, lead, pendingLeadCount, openCustomerSearch, handleIssueAccessLink, issuingLink, openCreateCustomer, openLeadPicker, showLeadPicker, loadingLeads, unlinkedLeads, linkingLead, handleLinkLead, setShowLeadPicker, showCreateCustomer, accessLinkForm, setAccessLinkForm, setShowCreateCustomer, accessLink, copyAccessLink, linkCopied, showCustomerSearch, customerQuery, setCustomerQuery, searchingCustomers, customerResults, assigningCustomer, handleAssignCustomer, setShowCustomerSearch, nextStatuses, handleTransition, transitioning } = vm;
  // "สร้างลูกค้าใหม่" ใช้กับโครงการที่ยังไม่มีลูกค้าเท่านั้น (ออกลิงก์ตอนผูกอยู่ เซิร์ฟเวอร์ใช้ลูกค้าเดิม)
  const customerPicker = (embedded: boolean) => (
    <CustomerPicker
      embedded={embedded}
      className={embedded ? "" : "mt-2"}
      current={project.customer ?? null}
      query={customerQuery}
      onQuery={setCustomerQuery}
      results={customerResults}
      searching={searchingCustomers}
      busy={assigningCustomer}
      onPick={(c) => void handleAssignCustomer(c)}
      onUnlink={project.customer ? () => void handleAssignCustomer(null) : undefined}
      onCreateNew={project.customer ? undefined : openCreateCustomer}
      onClose={() => setShowCustomerSearch(false)}
    />
  );
  return (
    <>
      <div className="flex items-start justify-between mb-4 mt-3">
        <div>
          <p className="text-sm text-slate-500">{project.projectNo}</p>
          <h1 className="text-2xl font-semibold text-slate-800">{project.name}</h1>
          <div className="flex items-center flex-wrap gap-2 mt-1.5 text-sm text-slate-500">
            <span className={badgeClass(STATUS_COLOR[project.status])}>
              {STATUS_LABEL[project.status]}
            </span>
            {isCustom && <span className={badgeClass("indigo")}>กำหนดเอง</span>}
            <span>· เวอร์ชัน {currentVersion.versionNo}</span>
            {!editable && (
              <span className="text-slate-500">(ส่งใบเสนอราคาแล้ว — แก้ไขจะสร้างเวอร์ชันใหม่)</span>
            )}
          </div>
          {project.customer || lead ? (
            // E: ผูกแล้ว (หรือมีแค่คำขอ) — การ์ดคน: ชื่อเด่น ช่องทางติดต่อเป็นแถว ที่มาของงานเป็นบรรทัดเล็กล่าง
            <div className="mt-3 max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={contactName ?? ""} src={project.customer?.avatarUrl} size={36} />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      {project.customer ? "ลูกค้า" : "ผู้ยื่นคำขอ · ยังไม่มีบัญชีลูกค้า"}
                    </p>
                    <p className="truncate font-semibold text-slate-800">{contactName}</p>
                    {(contactEmail || contactPhone) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {contactEmail && (
                          <InfoChip>
                            <Mail size={12} className="text-brand" /> {contactEmail}
                          </InfoChip>
                        )}
                        {contactPhone && (
                          <InfoChip>
                            <Phone size={12} className="text-brand" /> {contactPhone}
                          </InfoChip>
                        )}
                      </div>
                    )}
                    {/* คนยื่นคำขอไม่ใช่เจ้าของบัญชีลูกค้า — ต้องบอก ไม่งั้นข้อมูลหายไปตอนรวมการ์ด */}
                    {differentRequester && (
                      <p className="mt-1.5 text-xs text-slate-500">
                        ผู้ยื่นคำขอ: <span className="text-slate-700">{lead!.name}</span>
                        {lead!.email && lead!.email !== contactEmail ? ` (${lead!.email})` : ""}
                      </p>
                    )}
                    {!project.customer && (
                      <p className="mt-1.5">
                        <span className={WARN_PILL}>ลูกค้ายังมองไม่เห็นโครงการนี้</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap gap-1">
                  {project.customer ? (
                    <>
                      {/* ทางเข้าหลักของแฟ้มลูกค้า — จุดที่พนักงานกำลังมองชื่อลูกค้าอยู่พอดี */}
                      <Link to={`/customers/${project.customer.id}`} className={buttonClasses("ghost", "sm")}>
                        <UserRound size={14} /> ดูแฟ้มลูกค้า
                      </Link>
                      <Button variant="ghost" size="sm" onClick={openCustomerSearch} aria-expanded={showCustomerSearch} data-customer-picker-trigger>
                        เปลี่ยนลูกค้า <ChevronDown size={14} className={`transition-transform ${showCustomerSearch ? "rotate-180" : ""}`} />
                      </Button>
                      <Button variant="brand" size="sm" onClick={() => handleIssueAccessLink(false)} disabled={issuingLink}>
                        {issuingLink ? "กำลังสร้าง..." : "ออกลิงก์เข้าใช้"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" size="sm" onClick={openCustomerSearch} aria-expanded={showCustomerSearch} data-customer-picker-trigger>
                        เลือกลูกค้าที่มีบัญชี <ChevronDown size={14} className={`transition-transform ${showCustomerSearch ? "rotate-180" : ""}`} />
                      </Button>
                      <Button variant="brand" size="sm" onClick={openCreateCustomer}>
                        สร้างบัญชีจากคำขอ
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* กล่องเลือกลูกค้ากางในการ์ด (ดันเนื้อหาข้างล่างลง) — แบบลอยเคยทับเมนูข้างและการ์ดราคา */}
              {showCustomerSearch && customerPicker(true)}

              {/* ที่มาของงาน: ข้อมูลประกอบ จึงเป็นบรรทัดเล็กล่างการ์ด */}
              <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
                {lead ? (
                  <>
                    <span>
                      มาจากคำขอ · สนใจ {lead.serviceType}
                      {lead.houseDesignName && ` · แบบ ${lead.houseDesignName}`}
                    </span>
                    {lead.message && (
                      <p className="mt-0.5 line-clamp-2 text-slate-600" title={lead.message}>
                        “{lead.message}”
                      </p>
                    )}
                  </>
                ) : (
                  <span className="flex flex-wrap items-center gap-x-2">
                    ไม่ได้มาจากคำขอ
                    <button type="button" onClick={openLeadPicker} className="text-brand underline-offset-2 hover:underline">
                      ผูกกับคำขอ
                    </button>
                  </span>
                )}
              </div>
            </div>
          ) : (
            // A: ยังไม่ผูกอะไรเลย — ถามคำถามเดียว แต่ละทางบอกว่ากดแล้วได้อะไร
            <div className="mt-3 max-w-2xl rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-800">งานนี้ของลูกค้าคนไหน?</p>
                <span className={WARN_PILL}>ลูกค้ายังมองไม่เห็นโครงการนี้</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <OwnerChoice
                  title="มาจากคำขอ"
                  description="ดึงชื่อ เบอร์ และแบบบ้านที่ลูกค้าส่งเข้ามาให้"
                  action={
                    pendingLeadCount == null
                      ? "เลือกคำขอ"
                      : pendingLeadCount > 0
                        ? `รอโครงการ ${pendingLeadCount} คำขอ`
                        : "ยังไม่มีคำขอที่รอโครงการ"
                  }
                  active={showLeadPicker}
                  onClick={openLeadPicker}
                />
                <OwnerChoice
                  title="ลูกค้าที่มีบัญชีแล้ว"
                  description="ค้นจากชื่อหรืออีเมล — ใบเสนอราคาที่ส่งจะเข้าพอร์ทัลของลูกค้าคนนี้"
                  action="ค้นหาลูกค้า"
                  active={showCustomerSearch}
                  onClick={openCustomerSearch}
                />
                <OwnerChoice
                  title="ลูกค้าใหม่ ไม่มีคำขอ"
                  description="ลูกค้าที่โทรมาหรือเดินเข้ามาเอง — กรอกชื่อ อีเมล แล้วออกลิงก์ให้ตั้งรหัสผ่าน"
                  action="สร้างบัญชีลูกค้า"
                  active={showCreateCustomer}
                  onClick={openCreateCustomer}
                />
              </div>
            </div>
          )}

          {showLeadPicker && (
            <div className="mt-2 max-w-sm border border-slate-200 rounded-lg p-3 bg-white">
              <p className="text-xs text-slate-700 mb-2">
                เลือกคำขอของลูกค้าที่ตรงกับโครงการนี้ — ระบบจะดึงชื่อลูกค้าและแบบบ้านมาให้อัตโนมัติ
              </p>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {loadingLeads && <PanelSkeleton lines={2} />}
                {!loadingLeads && unlinkedLeads.length === 0 && (
                  <p className="text-xs text-slate-500">ยังไม่มีคำขอที่ว่างให้เลือก</p>
                )}
                {unlinkedLeads.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    disabled={linkingLead}
                    onClick={() => handleLinkLead(l.id)}
                    className="text-left text-sm px-2 py-1 rounded-md hover:bg-slate-100 disabled:opacity-50"
                  >
                    {l.name} <span className="text-slate-500">· {l.phone} · {l.serviceType}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 border-t border-slate-100 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowLeadPicker(false)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          )}
          {showCreateCustomer && !project.customer && (
            <div className="mt-2 max-w-sm border border-slate-200 rounded-lg p-3 bg-white flex flex-col gap-2">
              <p className="text-xs text-slate-700">
                {lead
                  ? "สร้างบัญชีให้ลูกค้าจากข้อมูลในคำขอ แล้วออกลิงก์ให้ลูกค้าตั้งรหัสผ่านเอง"
                  : "สร้างบัญชีให้ลูกค้าใหม่ แล้วออกลิงก์ให้ลูกค้าตั้งรหัสผ่านเอง"}{" "}
                (ถ้าอีเมลนี้มีบัญชีอยู่แล้ว ระบบจะผูกบัญชีเดิมให้)
              </p>
              <input
                placeholder="อีเมล"
                value={accessLinkForm.email}
                onChange={(e) => setAccessLinkForm((f) => ({ ...f, email: e.target.value }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
              <input
                placeholder="ชื่อ-นามสกุล"
                value={accessLinkForm.fullName}
                onChange={(e) => setAccessLinkForm((f) => ({ ...f, fullName: e.target.value }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
              <input
                placeholder="เบอร์โทรศัพท์"
                value={accessLinkForm.phone}
                onChange={(e) => setAccessLinkForm((f) => ({ ...f, phone: e.target.value }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
              <div className="flex gap-2 border-t border-slate-100 pt-2">
                <Button variant="brand" size="sm" onClick={() => handleIssueAccessLink(true)} disabled={issuingLink}>
                  {issuingLink ? "กำลังสร้าง..." : "สร้างบัญชี + ลิงก์เข้าใช้"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateCustomer(false)}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          )}
          {accessLink && (
            <div className="mt-2 max-w-md border border-brand/30 rounded-lg p-3 bg-brand/5 flex flex-col gap-2">
              <p className="text-xs text-slate-700">
                {accessLink.created ? "สร้างบัญชีลูกค้าแล้ว — " : ""}
                ส่งลิงก์นี้ให้ลูกค้า ({accessLink.customer.email}) ทาง LINE หรือช่องที่คุยกัน
                ลูกค้าจะตั้งรหัสผ่านเองแล้วเข้าดูใบเสนอราคาได้ทันที
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={accessLink.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 border border-slate-300 rounded-md px-2 py-1 text-xs font-mono bg-white"
                />
                <Button size="sm" onClick={copyAccessLink}>
                  {linkCopied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                ลิงก์ใช้ได้ครั้งเดียว หมดอายุ{" "}
                {new Date(accessLink.expiresAt).toLocaleDateString("th-TH")}
              </p>
            </div>
          )}
          {showCustomerSearch && !project.customer && !lead && customerPicker(false)}
        </div>
        {/* การเดินหน้าสถานะทำผ่าน auto (ส่งใบเสนอราคา/ลูกค้ายอมรับ) + การ์ด "ขั้นตอนถัดไป" แล้ว
            จึงเหลือเฉพาะ "ยกเลิกโครงการ" ที่เป็นการตัดสินใจของคน — ทำให้เงียบ (danger เบา ๆ) */}
        {nextStatuses.includes("CANCELLED") && (
          <button
            type="button"
            onClick={() => handleTransition("CANCELLED")}
            disabled={transitioning}
            className="text-sm text-red-600 border border-red-200 rounded-md px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
          >
            ยกเลิกโครงการ
          </button>
        )}
      </div>
    </>
  );
}

/** แถวแก้ไขบรรทัด BOQ ในที่ — Enter ในช่องกรอก = บันทึก, Esc = ยกเลิก
    ฟังคีย์ที่ document แทนการดักบนแถวตาราง (แถวไม่ใช่ตัวรับคีย์) แต่จำกัดเฉพาะคีย์ที่เกิดในแถวนี้
    เท่ากับตอนที่ยังดักบนแถว · dropdown ค้นหาหยุดคีย์ของมันเองไว้แล้วจึงไม่รั่วมาถึงตรงนี้ */
function BoqEditRow({ vm, item }: Readonly<{ vm: ProjectVM; item: BoqItemDto }>) {
  const openTileFromEdit = (target: BoqItemDto) => {
    vm.setEditingId(null);
    vm.setTileItem(target);
  };
  const { setEditingId, submitEdit, categoryById, materialOptions, editMaterialId, selectEditMaterial, editName, editUnit, editHasRecipe, editDerivedPrice, editMaterialPrice, setEditMaterialPrice, editLaborPrice, setEditLaborPrice, editBasis, editCoefficient, setEditCoefficient, editWaste, setEditWaste, driverValueOf, editQuantity, setEditQuantity, editRebarOpen, setEditRebarOpen, editRebarDia, setEditRebarDia, editRebarLen, setEditRebarLen, editComponents, setEditComponents, materialById, previewLineTotal, previewQty, recipeSources, editSheetRows, setEditSheetRows, setEditBasis } = vm;
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) return;
      if (e.key === "Escape") {
        setEditingId(null);
      } else if (
        e.key === "Enter" &&
        !e.defaultPrevented &&
        (e.target as HTMLElement).tagName === "INPUT"
      ) {
        e.preventDefault();
        submitEdit(item.id);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [item.id, setEditingId, submitEdit]);

  return (
    <tr
      ref={rowRef}
      data-boq-edit-row
      className="border-t border-brand/40 bg-brand/5"
    >
      {/* แก้ไขแบบแผงขยายเต็มความกว้าง (Inline expand) — ใช้เลย์เอาต์การ์ดเหมือนฟอร์มเพิ่มรายการ
          แทนการยัดช่องกรอกลงในแต่ละคอลัมน์ (เดิมทำ dropdown ล้น/หมวดงานตัดบรรทัด/ปุ่มตกขอบ) */}
      <td colSpan={8} className="p-3">
        <div className="rounded-lg border border-brand/30 bg-white p-4 shadow-sm">
          {/* หัวการ์ด: รหัส + เส้นทางหมวดงาน (แนวนอน ไม่ตัดเป็นแนวตั้งแบบเดิม) */}
          <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-md bg-brand/10 px-2 py-0.5 font-mono text-xs font-medium text-brand">
              {categoryById.get(item.categoryId)?.code ?? "—"}
            </span>
            <span className="text-sm font-medium text-slate-700">แก้ไขรายการ</span>
            <span className="text-xs text-slate-500">
              {buildCategoryPath(item.categoryId, categoryById)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 items-start">
            <label className="col-span-2 sm:col-span-4 flex flex-col gap-1 text-xs text-slate-700">
              วัสดุ <span className="text-slate-400">(เลือกเพื่อสลับ — เว้นไว้เพื่อคงชื่อเดิม)</span>
              <SearchableSelect
                options={materialOptions}
                value={editMaterialId}
                onChange={selectEditMaterial}
                placeholder={editName || "เลือกวัสดุเพื่อสลับ"}
                clearable
              />
              {editName && (
                <span className="text-xs text-slate-500">
                  {editName}
                  {!editMaterialId && " (กรอกเอง)"} · หน่วย {editUnit || "—"}
                </span>
              )}
            </label>

            <label className="col-span-1 flex flex-col gap-1 text-xs text-slate-700">
              ราคาวัสดุ/หน่วย
              {editHasRecipe ? (
                <input
                  type="text"
                  readOnly
                  value={money(editDerivedPrice)}
                  title="คิดจากสูตรวัสดุย่อยด้านล่าง"
                  className="border border-slate-200 bg-slate-100 text-slate-500 rounded-md px-2 py-1 text-sm text-right"
                />
              ) : (
                <input
                  type="number"
                  value={editMaterialPrice}
                  onChange={(e) => setEditMaterialPrice(e.target.value)}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm text-right"
                />
              )}
            </label>

            <label className="col-span-1 flex flex-col gap-1 text-xs text-slate-700">
              <span>ค่าแรง/หน่วย</span>
              <input
                type="number"
                value={editLaborPrice}
                onChange={(e) => setEditLaborPrice(e.target.value)}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm text-right"
              />
            </label>
          </div>

          {/* บล็อกปริมาณ — ตามฐานคำนวณเดิมของบรรทัด (MANUAL = จำนวน + เครื่องมือเหล็ก;
              อื่น ๆ = สัมประสิทธิ์ + เผื่อเสีย + พรีวิวปริมาณสด) */}
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            {editBasis === "SHEET" ? (
              <SheetQuantityBlock
                lineName={editName}
                unit={editUnit}
                rows={editSheetRows}
                waste={editWaste}
                previousQuantity={item.qtyBasis === "MANUAL" ? item.quantity : null}
                onChange={(rows, waste) => {
                  setEditSheetRows(rows);
                  setEditWaste(waste);
                }}
                onUseManual={(q) => {
                  setEditBasis("MANUAL");
                  if (q != null) setEditQuantity(String(q));
                }}
              />
            ) : editBasis !== "MANUAL" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 items-end">
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  {basisConfig(editBasis).perLabel}
                  <input
                    type="number"
                    step="0.0001"
                    value={editCoefficient}
                    onChange={(e) => setEditCoefficient(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm text-right"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  <span>เผื่อเสีย (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editWaste}
                    onChange={(e) => setEditWaste(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm text-right"
                  />
                </label>
                <div className="col-span-2 flex flex-col gap-1 text-xs">
                  <span className="text-slate-500">ปริมาณที่คิดได้</span>
                  {(() => {
                    const dv = driverValueOf(editBasis);
                    if (dv == null) {
                      return (
                        <span className="text-amber-600">
                          ตั้ง “{basisConfig(editBasis).measureLabel}” ในรายละเอียดโครงการก่อน
                        </span>
                      );
                    }
                    const q = previewTakeoffQty(Number(editCoefficient), Number(editWaste), dv);
                    return q == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-medium text-slate-800">
                        {dv} × {editCoefficient || 0} × (1+{editWaste || 0}%) ={" "}
                        {q.toLocaleString("th-TH")} {editUnit}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ) : (
              // วางเรียงลงมาเป็นแถว ไม่ใช่วางข้าง ๆ กัน — กล่องเครื่องมือกว้างกว่าช่องจำนวนมาก
              // ถ้าวางข้างกันช่องจำนวนจะลอยอยู่ซ้ายห่างจากกล่อง จนดูเหมือนคนละเรื่อง
              <div className="flex flex-col items-start gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs text-slate-700">
                    <span>จำนวน</span>
                    <input
                      type="number"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className="w-32 border border-slate-300 rounded-md px-2 py-1 text-sm text-right"
                    />
                  </label>
                  {/* เปลี่ยนเป็นใบถอดแบบ: ใบเปิดขึ้นทันที ยกเลิกได้โดยไม่เสียจำนวนเดิม */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditSheetRows([]);
                      setEditWaste("0");
                      setEditBasis("SHEET");
                    }}
                    title="กรอกขนาดทีละชิ้นจากแบบ ระบบคูณและรวมเป็นจำนวนให้"
                  >
                    <Ruler size={14} /> ถอดจากแบบ
                  </Button>
                </div>
                {/* เครื่องมือเดียวกับฟอร์มเพิ่มบรรทัด (components/RebarCalculator)
                    แผงแก้ไขไม่มีช่องหน่วยนับให้แก้ จึงไม่ส่ง onUnitChange — ได้แค่เตือน */}
                <RebarCalculator
                  open={editRebarOpen}
                  onToggle={() => setEditRebarOpen((v) => !v)}
                  diameterMm={editRebarDia}
                  onDiameterChange={setEditRebarDia}
                  lengthM={editRebarLen}
                  onLengthChange={setEditRebarLen}
                  unit={editUnit}
                  onInsert={(kg) => {
                    setEditQuantity(String(kg));
                    setEditRebarOpen(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* สูตรวัสดุย่อย (ถอดปริมาณวัสดุ) — บรรทัดที่ตัวคิดกระเบื้องตั้งราคา วัสดุย่อยเป็นผลของตัวคิด
              แก้ที่นี่ไม่ได้ (เซิร์ฟเวอร์คิดทับทุกครั้งที่บันทึก) จึงพาไปแก้ที่ตัวคิดแทน */}
          <div className="mt-3 border-t border-slate-200 pt-3">
            {item.tileCalc?.priced ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <Layers size={14} className="text-brand" />
                วัสดุย่อย {item.components.length} รายการมาจากตัวคิดกระเบื้อง — เปลี่ยนขนาดแผ่น/ราคาที่ตัวคิด
                <button type="button" onClick={() => openTileFromEdit(item)} className="font-medium text-brand hover:underline">
                  เปิดตัวคิดกระเบื้อง
                </button>
              </p>
            ) : (
              <>
                <MaterialComponentsEditor
                  rows={editComponents}
                  onChange={setEditComponents}
                  materialById={materialById}
                  unitLabel={editUnit}
                  unitDatalistId="boq-units"
                  lineQuantity={previewQty}
                  copySources={recipeSources.filter((r) => r.value !== `i:${item.id}`)}
                />
                {isAreaUnit(editUnit) && (
                  <button
                    type="button"
                    onClick={() => openTileFromEdit(item)}
                    title="ปิดแผงแก้ไข (สิ่งที่ยังไม่บันทึกจะหาย) แล้วเปิดตัวคิดกระเบื้อง"
                    className="link-pill -ml-2.5 mt-1 flex w-fit items-center gap-1 text-xs font-medium text-brand"
                  >
                    <Grid3x3 size={12} /> {item.tileCalc ? "ตัวคิดกระเบื้อง (ใช้อยู่)" : "ตัวคิดกระเบื้อง — นับแผ่น/กล่อง ปูนกาว ยาแนว"}
                  </button>
                )}
              </>
            )}
          </div>

          {/* แถบล่าง: ยอดรวมสด + ปุ่มบันทึก/ยกเลิก (ชิดขวา) */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
            <span className="text-sm text-slate-500">
              รวมบรรทัด:{" "}
              <span className="font-semibold text-brand" title="ยอดสด (ยังไม่บันทึก)">
                {money(previewLineTotal ?? item.lineTotal)}
              </span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                <X size={14} /> ยกเลิก
              </Button>
              <Button size="sm" onClick={() => submitEdit(item.id)}>
                <Check size={14} /> บันทึก
              </Button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function ProjectDetailView({ vm }: Readonly<{ vm: ProjectVM }>) {
  // การ์ดขั้นตอนถัดไปของใบร่างต่างกันตามบทบาท: เจ้าของ = อนุมัติ · พนักงาน = ขออนุมัติ/รออนุมัติ
  const { user } = useAuth();
  const { stuck, project, currentVersion, showNetPreview, previewNet, isCustom, handleTransition, transitioning, priceCells, showRates, setShowRates, openRates, sentinelRef, visibleTabs, goTab, activeTab, stepDates, quotes, rejectionReason, quoteBlocker, scrollToSection, projectId, showEditInfo, openEditInfo, hasCustomPrice, items, silentRefresh, detail, setShowVersionCompare, showVersionCompare, setShowSaveTemplateForm, setShowAddForm, setDriftItemIds, showSaveTemplateForm, newTemplateName, setNewTemplateName, newTemplateDescription, setNewTemplateDescription, submitSaveTemplate, savingTemplate, templates, handleApplyTemplate, applyingTemplateId, handleDeleteTemplate, showAddForm, exportingExcel, exportBoqExcel, showImport, setShowImport, categoryOptions, subgroupOptions, topCategoryOf, showBulkAdd, setShowBulkAdd, revealCategory } = vm;
  const { showStructural, setShowStructural, materials } = vm;
  return (
    <Layout>
      {/* หน้านี้ยาวเกือบ 8 หน้าจอเมื่อ BOQ เยอะ — แถบนี้คือสิ่งเดียวที่บอกว่าอยู่โครงการไหน
          ตอนเลื่อนลงไปแก้ราคาลึก ๆ */}
      <StickyPageHeader show={stuck}>
        <span className="shrink-0 text-xs text-slate-500">{project.projectNo}</span>
        <span className="truncate text-sm font-medium text-slate-800">{project.name}</span>
        <span className={`ml-auto shrink-0 ${badgeClass(STATUS_COLOR[project.status])}`}>
          {STATUS_LABEL[project.status]}
        </span>
        {/* ราคาสุทธิตามลงมาด้วย — แท็บ BOQ ยาว 5,700px และเป็นที่เดียวที่ยอดนี้เปลี่ยนจริง
            ถ้าไม่ติดมากับแถบ คนแก้ราคาจะมองไม่เห็นผลของสิ่งที่ตัวเองทำเลย */}
        <span className="hidden shrink-0 whitespace-nowrap text-sm text-slate-500 sm:inline">
          สุทธิ{" "}
          <span className="font-semibold text-slate-800">{money(currentVersion.netPrice)}</span>
          {showNetPreview && (
            <span className="ml-1 font-semibold text-brand">→ {money(previewNet!)}</span>
          )}
        </span>
      </StickyPageHeader>

      <Link to="/projects" className={buttonClasses("ghost", "sm")}>
        ← กลับไปโครงการ
      </Link>
      <ProjectTitleBlock vm={vm} />

      {/* ตัวเลขเงินอยู่เหนือแท็บ ไม่ใช่ในแท็บใดแท็บหนึ่ง — มันคือตัวตนของโครงการเหมือนชื่อกับสถานะ
          เดิมกองอยู่ท้ายแท็บภาพรวม (ต้องเลื่อนลง 413px ถึงจะเห็น) และแท็บ BOQ ไม่มีเลขนี้เลย
          ย่อ 3 ตัวประกอบเป็นบรรทัดเดียว เหลือราคาสุทธิเป็นก้อนเด่นก้อนเดียวที่ต้องอ่านเร็ว */}
      {/* การ์ดแยกใบ พื้นสีอ่อนตามความหมาย + วงกลมจางมุมล่างขวา — ดีไซน์เดียวกับการ์ดแดชบอร์ด (ผู้ใช้ขอ)
          จอแคบเรียง 2 คอลัมน์ ราคาสุทธิกินเต็มแถวล่าง · จอกว้างเรียงแถวเดียว ราคาสุทธิกว้างกว่าเล็กน้อย */}
      <div className="mb-4">
        {/* iPad แนวนอน (1024–1279) ยังเรียง 2 คอลัมน์ — 5 ใบแถวเดียวบีบป้าย "ค่าดำเนินการ+กำไร" ตก 3 บรรทัด */}
        <div className="grid grid-cols-2 gap-3 xl:flex">
          {priceCells.map((cell) => {
            const tone = PRICE_TONE[cell.tone ?? "slate"];
            const Icon = cell.icon;
            return (
              <div key={cell.label} className={`relative min-w-0 overflow-hidden rounded-lg p-4 xl:flex-1 ${tone.card}`}>
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -bottom-10 -right-8 h-28 w-28 rounded-full bg-current opacity-[0.07] ${tone.icon}`}
                />
                <div className="relative flex items-start justify-between gap-2">
                  {/* ป้ายที่มี % กดได้ = ทางเข้าเดียวของการแก้อัตรา วางไว้ตรงเลขที่มันควบคุมอยู่
                      ไม่ต้องเพิ่มปุ่มใหม่เข้าหน้าที่มีปุ่มเยอะอยู่แล้ว */}
                  {cell.rate ? (
                    <button
                      type="button"
                      onClick={() => (showRates ? setShowRates(false) : openRates())}
                      className="group inline-flex min-w-0 items-center gap-1 text-left text-xs text-slate-600 transition-colors hover:text-brand"
                    >
                      <span className="underline decoration-slate-400 decoration-dotted underline-offset-2 group-hover:decoration-brand">
                        {cell.label}
                      </span>
                      <Pencil size={11} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 touch:opacity-100" />
                    </button>
                  ) : (
                    <p className="text-xs text-slate-600">{cell.label}</p>
                  )}
                  {Icon && <Icon size={18} className={`shrink-0 ${tone.icon}`} aria-hidden />}
                </div>
                {/* ส่วนลดเป็นตัว "หัก" — ถ้าโชว์เป็นเลขบวกเฉย ๆ คนไล่อ่านซ้ายไปขวาจะบวกทุกช่อง
                    แล้วได้ยอดไม่ตรงกับราคาสุทธิที่อยู่ข้าง ๆ กันนั่นเอง */}
                {cell.empty ? (
                  <p className="relative mt-1 text-xl font-semibold text-slate-400">—</p>
                ) : (
                  <p className={`relative mt-1 text-xl font-semibold tabular-nums ${tone.value}`}>
                    {cell.negative ? "−" : ""}
                    {money(cell.value)}
                  </p>
                )}
                {cell.hint && (
                  <p className="relative mt-0.5 text-xs tabular-nums text-slate-600">{cell.hint}</p>
                )}
              </div>
            );
          })}

          {/* ราคาสุทธิ = การ์ดหลักสีนาวีแบรนด์ (เหมือนการ์ดหลักของแดชบอร์ด) */}
          <div className="relative col-span-2 overflow-hidden rounded-lg bg-brand p-4 text-white shadow-sm xl:col-span-1 xl:flex-[1.25]">
            <span aria-hidden className="pointer-events-none absolute -bottom-10 -right-8 h-28 w-28 rounded-full bg-white opacity-10" />
            <div className="relative flex items-start justify-between gap-2">
              <p className="text-xs text-white/75">ราคาสุทธิ</p>
              <Banknote size={18} className="shrink-0 text-white/70" aria-hidden />
            </div>
            <p className="relative mt-1 text-2xl font-semibold leading-tight tabular-nums">
              {money(currentVersion.netPrice)}
            </p>
            {showNetPreview && (
              <p className="relative mt-1 text-xs tabular-nums text-white/80">
                → หลังบันทึก ≈ {money(previewNet!)}
              </p>
            )}
          </div>
        </div>

        {/* แผงแก้อัตรา — กางใต้การ์ดตัวเลขที่มันเปลี่ยน ไม่ใช่กล่องลอยที่อื่น
            เดิมอัตราทั้งสองตั้งได้ครั้งเดียวตอนสร้างโครงการ (VAT ตั้งไม่ได้ด้วยซ้ำ) พอต่อรอง
            ราคากับลูกค้าจึงต้องสร้างโครงการใหม่ทั้งใบ */}
        {showRates && (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white [&>div]:border-t-0">
            <RatesPanel vm={vm} />
          </div>
        )}
      </div>

      {/* หมุดวัดว่าหัวเรื่อง (รวมตัวเลขเงิน) พ้นจอไปหรือยัง → ใช้สั่งให้แถบด้านบนโผล่
          ต้องอยู่ "ท้ายสุดของหัว" ไม่งั้นแถบจะโผล่ทั้งที่ราคาสุทธิของจริงยังเห็นอยู่ = โชว์ซ้ำ */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      {/* แถบแท็บถูกขนาบด้วยการ์ดตัวเลขเงินด้านบนและการ์ดแถบขั้นตอนด้านล่าง ของเดิมเป็นข้อความเปล่า
          ระยะห่างแค่ 4px จึงอ่านเป็นประโยคเรียงกันมากกว่าปุ่ม และตัวเลขนับจางถึงขั้นอ่านไม่ออก
          (วัดได้ 2.51:1 ต่ำกว่าเกณฑ์ 4.5:1) — เพิ่มน้ำหนัก/ความเข้ม/ระยะห่าง โดยคงรูปแบบเส้นใต้เดิม */}
      {/* เส้นฐานเป็นเงาด้านใน (ไม่ใช่ border + แท็บ -mb-px) — แบบเดิมแท็บยื่นเลยกล่อง 1px บนจอแคบที่กล่อง
          เลื่อนแนวนอนได้ Windows เลยวาดแถบเลื่อนแนวตั้ง ▲●▼ ที่ปลายแถบ (ผู้ใช้ทัก 19 ต.ค.) */}
      <div className="mb-6 flex gap-3 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-slate-300)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => goTab(t.key)}
            aria-current={t.key === activeTab ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${
              t.key === activeTab
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-900"
            }`}
          >
            {t.label}
            {t.badge && (
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600">
                {t.badge}
              </span>
            )}
            {t.count != null && (
              <span
                className={`ml-1.5 text-xs tabular-nums ${
                  t.key === activeTab ? "text-brand/80" : "text-slate-500"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
      {/* ยังไม่มีราคา = สิ่งเดียวที่ทำได้ จึงต้องอยู่ก่อนทุกอย่าง ไม่ใช่ล่างสุดของหน้า */}
      {isCustom && !hasCustomPrice && <CustomPriceCard vm={vm} />}

      {/* (A) แถบขั้นตอน + (B) การ์ด "ขั้นตอนถัดไป" — ให้เห็นว่าสถานะเดินอัตโนมัติมาถึงไหน และควรทำอะไรต่อ */}
      <div className="mb-6 flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-5">
        <ProjectStatusStepper status={project.status} stepDates={stepDates} />
        <ProjectNextAction
          status={project.status}
          draftQuote={latestDraftOf(quotes)}
          isOwner={user?.role === "OWNER"}
          blocker={quoteBlocker}
          rejectionReason={rejectionReason}
          savingTransition={transitioning}
          onGoQuotes={() => scrollToSection("quotes-section")}
          onGoSection={scrollToSection}
          onGoContracts={() => scrollToSection("contracts-section")}
          onMarkDelivered={() => handleTransition("COMPLETED")}
          onCloseLost={() => handleTransition("CANCELLED")}
        />
        <ContractMoneySummary contracts={vm.contracts} views={vm.contractMoney} onOpen={vm.openContractPanel} />
        {/* ไทม์ไลน์อยู่การ์ดเดียวกับสถานะ คั่นด้วยเส้นบาง ๆ แทนการตีกรอบอีกใบ (ลดกล่องซ้อนกล่อง) */}
        <div className="border-t border-slate-100 pt-4">
          <ProjectActivity projectId={projectId} />
        </div>
      </div>


      {/* รายละเอียดโครงการ: สถานที่ก่อสร้าง / พื้นที่ / ช่วงเวลา / หมายเหตุ (+ แก้ไขชื่อโครงการ) */}
      <div id="project-details" className="mb-6 bg-white border border-slate-200 rounded-lg p-4 scroll-mt-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-700">รายละเอียดโครงการ</p>
          {!showEditInfo && (
            <Button variant="ghost" size="sm" onClick={openEditInfo}>
              <Pencil size={14} /> แก้ไข
            </Button>
          )}
        </div>

        <ProjectInfoCard vm={vm} />
      </div>

      {/* มีราคาแล้วค่อยตกลงมาอยู่ท้ายหน้า — ตอนยังไม่มีราคามันเด้งขึ้นไปอยู่บนสุดแทน */}
      {isCustom && hasCustomPrice && <CustomPriceCard vm={vm} />}

        </>
      )}

      <QuotesTab vm={vm} />

      {activeTab === "contract" && <ContractFinanceTab vm={vm} />}

      {/* โครงการกำหนดเองไม่ใช้ตัวสร้าง BOQ — ซ่อนทั้งส่วนนี้ (ใช้ราคากรอกเอง + ไฟล์แนบแทน) */}
      {activeTab === "boq" && !isCustom && (
        <>
      <div id="boq-section" className="mb-2 flex flex-wrap items-center justify-between gap-2 scroll-mt-16">
        <h2 className="text-lg font-medium text-slate-800">รายการ BOQ</h2>
        <div className="flex gap-2">
          {/* จอแคบกว่า 1180px (iPad แนวตั้ง/แนวนอนเล็ก) ปุ่มทั้งแถวบีบจนข้อความหัก 4 บรรทัด —
              เก็บปุ่มที่ใช้ไม่บ่อยเข้าเมนู "เพิ่มเติม" เหลือแต่ปุ่มเพิ่มบรรทัดที่ใช้ทุกวัน */}
          <span className="min-[1180px]:hidden">
            <RowMenu
              label="คำสั่ง BOQ เพิ่มเติม"
              text="เพิ่มเติม"
              triggerClassName="inline-flex h-full items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800"
              items={[
                ...(detail.versions.length > 1
                  ? [{ key: "compare", label: "เทียบเวอร์ชัน", onSelect: () => setShowVersionCompare((v) => !v) }]
                  : []),
                { key: "structural", label: "คำนวณโครงสร้าง", onSelect: () => setShowStructural(true) },
                { key: "import", label: "นำเข้า Excel", onSelect: () => setShowImport(true) },
                ...(items.length > 0
                  ? [
                      { key: "export", label: "ส่งออก Excel (ฉบับภายใน)", onSelect: () => void exportBoqExcel() },
                      { key: "template", label: "บันทึกเป็นแม่แบบ", onSelect: () => setShowSaveTemplateForm((v) => !v) },
                    ]
                  : []),
              ]}
            />
          </span>
          <span className="hidden gap-2 min-[1180px]:flex">
          {detail.versions.length > 1 && (
            <button
              type="button"
              onClick={() => setShowVersionCompare((v) => !v)}
              aria-expanded={showVersionCompare}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800"
            >
              เทียบเวอร์ชัน
            </button>
          )}
          {/* ฐานราก/เสา/คาน/พื้น → คอนกรีต + ไม้แบบ + เหล็ก ลงใบถอดแบบของแต่ละบรรทัดทีเดียว */}
          <button
            type="button"
            onClick={() => setShowStructural(true)}
            title="ใส่ขนาดและเหล็กของฐานราก/เสา/คาน/พื้น ได้คอนกรีต ไม้แบบ และเหล็กพร้อมกัน"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800"
          >
            <Boxes size={14} /> คำนวณโครงสร้าง
          </button>
          {/* นำเข้าโชว์เสมอ — โครงการว่างคือกรณีที่ใช้บ่อยที่สุด (ยก BOQ ที่ทำใน Excel มาทั้งชุด) */}
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800"
          >
            <Upload size={14} /> นำเข้า Excel
          </button>
          {items.length > 0 && (
            <button
              type="button"
              onClick={exportBoqExcel}
              disabled={exportingExcel === "boq"}
              title="ฉบับภายใน มีราคาทุนและรายการสั่งซื้อ — ห้ามส่งให้ลูกค้า (ฉบับลูกค้าอยู่ที่ใบเสนอราคาแต่ละใบ)"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            >
              <FileSpreadsheet size={14} /> {exportingExcel === "boq" ? "กำลังสร้าง..." : "ส่งออก Excel"}
            </button>
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSaveTemplateForm((v) => !v)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800"
            >
              บันทึกเป็นแม่แบบ
            </button>
          )}
          </span>
          {/* หน้าต่างอยู่นอกกล่องปุ่มที่ซ่อนบนจอแคบ — เปิดจากเมนู "เพิ่มเติม" แล้วต้องเห็น */}
          {showStructural && (
            <StructuralCalcDialog
              projectId={detail.project.id}
              items={items}
              materials={materials}
              categoryOptions={categoryOptions}
              onApplied={silentRefresh}
              onClose={() => setShowStructural(false)}
            />
          )}
          {showImport && (
            <BoqImportDialog
              projectId={detail.project.id}
              existingLines={items.length}
              versionQuoted={!detail.editable}
              categoryOptions={categoryOptions}
              subgroupOptions={subgroupOptions}
              onClose={() => setShowImport(false)}
              onImported={() => void silentRefresh()}
            />
          )}
          <button
            type="button"
            onClick={() => setShowBulkAdd(true)}
            title="ติ๊กวัสดุจากคลังทีละหลายตัว แล้วกรอกจำนวนครั้งเดียว"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800"
          >
            <ListPlus size={14} /> เพิ่มหลายรายการ
          </button>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="text-sm bg-slate-800 text-white rounded-md px-3 py-1.5"
          >
            + เพิ่มรายการ
          </button>
          {showBulkAdd && (
            <BoqBulkAddDialog
              projectId={detail.project.id}
              materials={materials}
              categoryOptions={categoryOptions}
              topCategoryOf={topCategoryOf}
              onAdded={async (categoryId) => {
                await silentRefresh();
                revealCategory(categoryId);
              }}
              onClose={() => setShowBulkAdd(false)}
            />
          )}
        </div>
      </div>

      <BoqPriceDriftNotice
        projectId={projectId}
        refreshKey={`${currentVersion.id}:${currentVersion.netPrice}:${items.length}`}
        onChanged={silentRefresh}
        onLines={setDriftItemIds}
      />

      {showVersionCompare && detail.versions.length > 1 && (
        <BoqVersionCompare
          projectId={projectId}
          versions={detail.versions}
          onClose={() => setShowVersionCompare(false)}
        />
      )}

      {showSaveTemplateForm && (
        <div className="mb-4 flex flex-col gap-2 border border-dashed border-slate-300 rounded-md p-3 bg-white max-w-xl">
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ชื่อแม่แบบ</span>
            <input
              autoFocus
              placeholder="เช่น บ้านเดี่ยวชั้นเดียว มาตรฐาน"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            คำอธิบาย <span className="text-slate-400">(ไม่บังคับ — ใช้กับงานแบบไหน)</span>
            <textarea
              rows={2}
              placeholder="เช่น สำหรับบ้านชั้นเดียว 2 ห้องนอน พื้นที่ราว 80 ตร.ม."
              value={newTemplateDescription}
              onChange={(e) => setNewTemplateDescription(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm resize-y"
            />
          </label>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={submitSaveTemplate}
              disabled={savingTemplate || !newTemplateName.trim()}
            >
              <Check size={14} /> บันทึก
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowSaveTemplateForm(false)}>
              <X size={14} /> ยกเลิก
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 && templates.length > 0 && (
        <div className="mb-4 border border-slate-200 rounded-lg p-3 bg-white">
          <h3 className="text-sm font-medium text-slate-500 mb-2">เริ่มจากแม่แบบ</h3>
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  {t.name} <span className="text-slate-500">({t.itemCount} รายการ)</span>
                </span>
                {/* ปุ่มคู่เดียวกับแถวในหน้าแม่แบบ (ใช้/ลบ) จึงใช้หน้าตาชุดเดียวกัน —
                    เดิมเป็นลิงก์ข้อความสีเขียว/แดงที่หลุดจากระบบปุ่มของแอปไปคนละแบบ */}
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleApplyTemplate(t.id)}
                    disabled={applyingTemplateId === t.id}
                  >
                    {applyingTemplateId === t.id ? "กำลังนำเข้า..." : "ใช้แม่แบบนี้"}
                  </Button>
                  <Button
                    variant="dangerQuiet"
                    size="sm"
                    onClick={() => handleDeleteTemplate(t.id)}
                  >
                    <Trash2 size={14} /> ลบ
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <BoqAddForm vm={vm} />

      {items.length === 0 && !showAddForm && (
        <div className="mb-4 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
          <p className="text-sm text-slate-500">ยังไม่มีรายการ BOQ ในโครงการนี้</p>
          <p className="mt-1 text-xs text-slate-500">
            {templates.length > 0
              ? "เริ่มเร็ว ๆ จากแม่แบบด้านบน หรือเพิ่มรายการเอง"
              : "เพิ่มรายการแรกเพื่อเริ่มถอดปริมาณและคิดราคา"}
          </p>
          <div className="mt-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={() => setShowAddForm(true)}>
                + เพิ่มรายการแรก
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowBulkAdd(true)}>
                <ListPlus size={14} /> เพิ่มหลายรายการจากคลัง
              </Button>
            </div>
          </div>
        </div>
      )}

      <BoqTable vm={vm} />
        </>
      )}

      {activeTab === "costs" && <ProjectCostsPanel projectId={projectId} onGoToContract={() => goTab("contract")} />}

    </Layout>
  );
}
