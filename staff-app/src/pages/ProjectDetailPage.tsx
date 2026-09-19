import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Layers,
  Lock,
  Mail,
  Pencil,
  Phone,
  Send,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import type {
  BoqItemDto,
  ContractDto,
  ContractTemplateDto,
  CustomerAccessLinkResult,
  CustomerDto,
  LeadDto,
  MaterialDto,
  MaterialSummaryDto,
  ProjectDetailDto,
  ProjectStatus,
  ProjectVersionDto,
  QuoteDto,
  QuoteStatus,
  TemplateDto,
  WorkCategoryDto,
} from "@systemboq/shared-types";

// สูตรแยกค่าดำเนินการ/กำไร อยู่ใน shared-types เพราะทั้งเซิร์ฟเวอร์และหน้าจอต้องได้ตัวเลขเดียวกัน
import { marginAfterDiscount, splitOverheadProfit } from "@systemboq/shared-types";
import { BoqPriceDriftNotice } from "../components/BoqPriceDriftNotice";
import { ScrollableTabBar } from "../components/ScrollableTabBar";
import { BoqVersionCompare } from "../components/BoqVersionCompare";
import { Button, buttonClasses } from "../components/Button";
import { RebarCalculator } from "../components/RebarCalculator";
import { Layout } from "../components/Layout";
import { ProjectActivity } from "../components/ProjectActivity";
import { StickyPageHeader } from "../components/StickyPageHeader";
import { UnitSelect } from "../components/UnitSelect";
import { useStuckPastHeader } from "../lib/use-stuck-past-header";
import { UNIT_OPTIONS } from "../lib/units";
import {
  MaterialComponentsEditor,
  componentRowsToInput,
  deriveUnitPriceFromRows,
  validComponentRows,
  type ComponentRow,
} from "../components/MaterialComponentsEditor";
import { QuoteAttachmentsPanel } from "../components/QuoteAttachmentsPanel";
import { QuoteViewCell } from "../components/QuoteViewCell";
import { SearchableSelect, type SearchableOption } from "../components/SearchableSelect";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  addBoqItem,
  deleteBoqItem,
  getMaterialSummary,
  reorderBoqItems,
  updateBoqItem,
  type QtyBasis,
} from "../lib/boq-api";
import { listCategories } from "../lib/categories-api";
import { buildCategoryPath, categoryParts } from "../lib/category-path";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { ContractBodyEditor } from "../components/ContractBodyEditor";
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
const PROJECT_TABS = ["overview", "boq", "quotes", "contracts", "materials"] as const;
type ProjectTab = (typeof PROJECT_TABS)[number];

function isProjectTab(value: string | null): value is ProjectTab {
  return value != null && (PROJECT_TABS as readonly string[]).includes(value);
}

/** หัวข้อที่ปุ่มอื่นในหน้าเลื่อนไปหา อยู่แท็บไหน — ใช้สลับแท็บให้ก่อนเลื่อน ไม่งั้นเลื่อนไปหาของที่ไม่ได้เรนเดอร์ */
const SECTION_TAB: Record<string, ProjectTab> = {
  "project-details": "overview",
  "quotes-section": "quotes",
  "contracts-section": "contracts",
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
    }
  | { type: "item"; item: BoqItemDto };

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

function stepStateOf(index: number, currentIndex: number, rejected: boolean): StepState {
  if (index < currentIndex) return "done";
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
  const currentIndex = rejected ? STATUS_FLOW.indexOf("QUOTED") : STATUS_FLOW.indexOf(status);

  return (
    <ol className="flex items-start">
      {STATUS_FLOW.map((s, i) => {
        const state = stepStateOf(i, currentIndex, rejected);
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
function ProjectNextAction({
  status,
  hasQuote,
  rejectionReason,
  savingTransition,
  onGoQuotes,
  onGoContracts,
  onMarkDelivered,
  onCloseLost,
}: Readonly<{
  status: ProjectStatus;
  hasQuote: boolean;
  /** เหตุผลที่ลูกค้าให้ไว้ตอนปฏิเสธ (customerNote ของใบล่าสุด) — null ถ้าไม่ได้ระบุ */
  rejectionReason: string | null;
  savingTransition: boolean;
  onGoQuotes: () => void;
  onGoContracts: () => void;
  onMarkDelivered: () => void;
  onCloseLost: () => void;
}>) {
  const base = "rounded-lg border p-4 flex flex-col gap-2";

  if (status === "DRAFT") {
    return (
      <div className={`${base} border-brand/30 bg-brand/5`}>
        <div className="flex items-center gap-2 text-sm font-semibold text-brand">
          <ArrowRight size={16} /> ขั้นตอนถัดไป: ส่งใบเสนอราคาให้ลูกค้า
        </div>
        <p className="text-sm text-slate-500">
          เมื่อคุณส่งใบเสนอราคาให้ลูกค้า สถานะจะเปลี่ยนเป็น “เสนอราคาแล้ว” โดยอัตโนมัติ
        </p>
        <Button size="sm" className="self-start" onClick={onGoQuotes}>
          {hasQuote ? "ไปที่ใบเสนอราคา" : "ไปสร้างใบเสนอราคา"}
        </Button>
      </div>
    );
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
        <Button variant="secondary" size="sm" className="self-start" onClick={onGoQuotes}>
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
          <Button size="sm" onClick={onGoContracts}>
            ไปที่สัญญา
          </Button>
          <Button variant="secondary" size="sm" disabled={savingTransition} onClick={onMarkDelivered}>
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
): number | null {
  if (basis === "MANUAL") return quantity.trim() === "" ? null : Number(quantity);
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
function contractPanelLabel(open: boolean, signed: boolean): string {
  if (open) return "ปิด";
  return signed ? "งวดและการรับเงิน" : "แก้ข้อความ";
}

/** เนื้อแผงสรุปวัสดุ: กำลังโหลด · ยังไม่มีบรรทัดที่แตกวัสดุ · ตารางรวม */
function MaterialSummaryBody({ summary }: Readonly<{ summary: MaterialSummaryDto | null }>) {
  if (!summary) return <p className="text-sm text-slate-500 py-2">กำลังโหลด...</p>;
  if (summary.rows.length === 0) {
    return (
      <p className="text-sm text-slate-500 py-2">
        ยังไม่มีบรรทัดใดแตกวัสดุย่อย — ตั้งสูตรวัสดุในหน้า “วัสดุ / ค่าแรง” แล้วเลือกวัสดุนั้นในบรรทัด BOQ
        หรือกด “แก้ไข” บรรทัดแล้วเพิ่มวัสดุย่อยได้เลย
      </p>
    );
  }
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          แตกวัสดุย่อยแล้ว {summary.linesWithComponents} จาก {summary.totalLines} บรรทัด
        </p>
        <Button variant="ghost" size="sm" onClick={() => window.print()}>
          <Download size={13} /> พิมพ์ / บันทึก PDF
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              <th className="px-3 py-2">วัสดุ</th>
              <th className="px-3 py-2">หน่วย</th>
              <th className="px-3 py-2 text-right">ปริมาณรวม</th>
              <th className="px-3 py-2 text-right">ราคา/หน่วย</th>
              <th className="px-3 py-2 text-right">รวม</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r, i) => (
              <tr key={`${r.componentMaterialId ?? r.name}-${i}`} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-800">{r.name}</td>
                <td className="px-3 py-2 text-slate-500">{r.unit}</td>
                <td className="px-3 py-2 text-right text-slate-800">
                  {Number(r.totalQty).toLocaleString("th-TH", { maximumFractionDigits: 3 })}
                </td>
                <td className="px-3 py-2 text-right text-slate-500">{money(r.unitPrice)}</td>
                <td className="px-3 py-2 text-right text-slate-800 font-medium">{money(r.totalCost)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="px-3 py-2 font-semibold text-slate-800" colSpan={4}>
                รวมค่าวัสดุทั้งหมด (โดยประมาณเพื่อสั่งซื้อ)
              </td>
              <td className="px-3 py-2 text-right font-semibold text-brand">
                {money(summary.grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
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
  return Math.round(q * 1000) / 1000;
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
  return Math.round(qty * (mat + lab) * 100) / 100;
}

/** ส่วนลดที่มีผลกับยอดหนึ่ง ๆ — % คิดจากฐาน, จำนวนเงินคงที่ตัดไม่ให้เกินฐาน (สะท้อน resolveDiscountAmount) */
function previewDiscount(base: number, discount: PreviewDiscount | undefined): number {
  if (!discount) return 0;
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
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
): number {
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const direct = round2(newDirectCost);
  const oh = round2(direct * (overheadProfitPct / 100));
  const beforeDiscount = round2(direct + oh);
  const beforeVat = round2(beforeDiscount - previewDiscount(beforeDiscount, discount));
  const vat = round2(beforeVat * (vatPct / 100));
  return round2(beforeVat + vat);
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
  const [materialSummary, setMaterialSummary] = useState<MaterialSummaryDto | null>(null);
  const [showMaterialSummary, setShowMaterialSummary] = useState(false);
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
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [linkingLead, setLinkingLead] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_ADD_FORM);
  // สูตรวัสดุย่อยของบรรทัดที่กำลังเพิ่ม (ว่าง = วัสดุก้อนเดียว / ให้ระบบดึงจากแคตตาล็อกถ้ามี)
  const [addComponents, setAddComponents] = useState<ComponentRow[]>([]);
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
  // ส่วนลดอยู่ในแผงเดียวกับอัตรา เพราะทั้งสามอย่างคือ "การต่อรองราคา" ครั้งเดียวกัน
  // กดบันทึกทีเดียวจบ ไม่ต้องแยกเป็นสองรอบให้เกิดสองเวอร์ชันโดยไม่จำเป็น (BR-07)
  const [discMode, setDiscMode] = useState<"NONE" | "PERCENT" | "AMOUNT">("NONE");
  const [discInput, setDiscInput] = useState("");
  const [discNote, setDiscNote] = useState("");
  const [savingRates, setSavingRates] = useState(false);
  // สัญญาที่กำลังกางช่องแก้ข้อความอยู่ (ทีละฉบับ เพราะแผงสูงมาก)
  const [editingContractId, setEditingContractId] = useState<string | null>(null);

  // แก้ไขรายละเอียดโครงการ (ชื่อ/สถานที่ก่อสร้าง/พื้นที่/ช่วงเวลา/หมายเหตุ)
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
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

  async function loadMaterialSummary() {
    try {
      setMaterialSummary(await getMaterialSummary(projectId));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "โหลดสรุปวัสดุไม่สำเร็จ");
    }
  }

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
    const inputError = ratesInputError(inputs, Number(version.overheadProfitPct), discMode, discValue);
    if (inputError) {
      toast.error(inputError);
      return;
    }
    const note = discNote.trim();
    const body = ratesPatchOf(
      version,
      detail.project.type === "CUSTOM",
      inputs,
      discountPatchOf(discMode, discValue, note),
      note,
    );
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
    if (!showMaterialSummary) return;
    loadMaterialSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMaterialSummary, detail?.currentVersion?.id, detail?.currentVersion?.directCost]);

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

  async function handleAssignCustomer(customerId: string | null) {
    setAssigningCustomer(true);
    try {
      await updateProject(projectId, { customerId });
      setShowCustomerSearch(false);
      setCustomerQuery("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกลูกค้าไม่สำเร็จ");
    } finally {
      setAssigningCustomer(false);
    }
  }

  // ไอเดียที่ 1: เติมอีเมลของ lead ล่วงหน้าในตัวเลือก (มีโอกาสตรงกับบัญชีที่ลงทะเบียนไว้มากสุด
  // เพราะอีเมลคือตัวตนที่ใช้ล็อกอิน) เพื่อให้ลูกค้าที่ตรงกันปรากฏขึ้นมาทันที
  function openCustomerSearch() {
    setCustomerQuery(detail?.lead?.email ?? detail?.lead?.name ?? "");
    setShowCreateCustomer(false);
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
    setShowCreateCustomer((v) => !v);
  }

  // ออกลิงก์เข้าใช้: fromForm=true ใช้ข้อมูลในฟอร์ม (สร้างบัญชีจากคำขอ); false = ลูกค้าผูกอยู่แล้ว
  // (ส่ง body ว่าง ให้ backend ใช้ลูกค้าเดิม เช่น ออกลิงก์ใหม่ตอนลูกค้าลืมรหัส)
  async function handleIssueAccessLink(fromForm: boolean) {
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
    setShowLeadPicker(next);
    if (!next) return;
    setLoadingLeads(true);
    try {
      const res = await listLeads();
      setUnlinkedLeads(
        res.leads.filter(
          (l) => !l.projectId && l.status !== "CLOSED" && l.status !== "REJECTED",
        ),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "โหลดคำขอไม่สำเร็จ");
    } finally {
      setLoadingLeads(false);
    }
  }

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
  }

  async function submitAdd() {
    const usesDriver = addForm.qtyBasis !== "MANUAL";
    // MANUAL ต้องมีปริมาณ; ฐานอ้างค่าวัดต้องมีสัมประสิทธิ์ต่อ 1 หน่วย
    if (!addForm.categoryId) return;
    if (usesDriver ? !addForm.qtyCoefficient : !addForm.quantity) return;
    // สูตรที่พนักงานกรอกเอง: ถ้ามี ให้ส่งไป (ทับราคาวัสดุ); ถ้าไม่กรอกและเลือกวัสดุแคตตาล็อกที่มีสูตร
    // ปล่อยเป็น undefined เพื่อให้เซิร์ฟเวอร์ดึงสูตรจากแคตตาล็อกมาให้เอง
    const addRecipe = componentRowsToInput(addComponents);
    const hasRecipe = addRecipe.length > 0;
    // ตารางแสดงทีละหมวด — เพิ่มลงหมวดอื่นแล้วไม่สลับตาม บรรทัดใหม่จะมองไม่เห็นจนดูเหมือนหาย
    const addedTo = boqRootOf(addForm.categoryId, categoryById).key;
    try {
      await addBoqItem(projectId, {
        categoryId: addForm.categoryId,
        materialId: addForm.materialId || undefined,
        name: addForm.materialId ? undefined : addForm.name.trim(),
        unit: addForm.materialId ? undefined : addForm.unit.trim(),
        materialUnitPrice: addForm.materialId ? undefined : Number(addForm.materialUnitPrice),
        laborUnitPrice: addForm.materialId ? undefined : Number(addForm.laborUnitPrice || 0),
        qtyBasis: addForm.qtyBasis,
        quantity: usesDriver ? undefined : Number(addForm.quantity),
        qtyCoefficient: usesDriver ? Number(addForm.qtyCoefficient) : undefined,
        wasteFactorPct: usesDriver ? Number(addForm.wasteFactorPct || 0) : undefined,
        note: addForm.note.trim() || undefined,
        components: hasRecipe ? addRecipe : undefined,
      });
      setAddForm(EMPTY_ADD_FORM);
      setAddComponents([]);
      setShowAddForm(false);
      await refresh();
      openBoqGroup(addedTo);
      // หมวดย่อยที่รับบรรทัดใหม่อาจถูกยุบอยู่ — กางให้ ไม่งั้นบรรทัดที่เพิ่งเพิ่มมองไม่เห็นจนดูเหมือนหาย
      // (คีย์ของก้อนหมวดย่อย = rootId-subId-ลำดับก้อน จึงล้างทุกก้อนของหมวดย่อยนั้น)
      const addedRoot = boqRootOf(addForm.categoryId, categoryById).id;
      const addedSub = categoryParts(addForm.categoryId, categoryById).sub?.id;
      if (addedSub) {
        const prefix = `${addedRoot}-${addedSub}-`;
        setCollapsedSubs((prev) => new Set([...prev].filter((k) => !k.startsWith(prefix))));
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "เพิ่มรายการไม่สำเร็จ");
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
    setEditComponents(
      item.components.map((c) => ({
        componentMaterialId: c.componentMaterialId ?? "",
        name: c.name,
        unit: c.unit,
        qtyPerUnit: c.qtyPerUnit,
        wasteFactorPct: c.wasteFactorPct ?? "",
        unitPrice: c.unitPrice,
      })),
    );
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
      setEditComponents(
        material.components.map((c) => ({
          componentMaterialId: c.componentMaterialId ?? "",
          name: c.name,
          unit: c.unit,
          qtyPerUnit: c.qtyPerUnit,
          wasteFactorPct: c.wasteFactorPct ?? "",
          unitPrice: c.unitPrice,
        })),
      );
    }
  }

  async function submitEdit(itemId: string) {
    const usesDriver = editBasis !== "MANUAL";
    try {
      await updateBoqItem(projectId, itemId, {
        qtyBasis: editBasis,
        // ฐานอ้างค่าวัด: ส่งสัมประสิทธิ์ + เผื่อเสีย (เซิร์ฟเวอร์ถอดปริมาณจากค่าวัด); MANUAL: ส่งปริมาณ
        quantity: usesDriver ? undefined : Number(editQuantity),
        qtyCoefficient: usesDriver ? Number(editCoefficient) : undefined,
        wasteFactorPct: usesDriver ? Number(editWaste || 0) : undefined,
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
    if (!(await confirm("ลบแม่แบบนี้ใช่หรือไม่?", { confirmLabel: "ลบ", variant: "danger" }))) return;
    try {
      await deleteTemplate(templateId);
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
  const tab: ProjectTab = isProjectTab(rawTab) ? rawTab : "overview";
  function goTab(next: ProjectTab) {
    const params = new URLSearchParams(searchParams);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  }
  // หมวดที่เปิดในแท็บ BOQ ก็อยู่ใน query string เช่นกัน (?cat=C) — ไม่มี = หน้าสรุปยอดทุกหมวด
  const boqCatParam = searchParams.get("cat");
  function openBoqGroup(key: string | null, scroll = false) {
    // แผงแก้ไขเป็นแถวในตาราง สลับหมวดแล้วแถวหายไปทั้งที่ยังไม่บันทึก จึงปิดให้ก่อน
    setEditingId(null);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (key) params.set("cat", key);
        else params.delete("cat");
        return params;
      },
      { replace: true },
    );
    // กดจากท้ายตารางหมวดยาว ๆ → พากลับขึ้นมาที่แถบหมวด ไม่งั้นหมวดใหม่เริ่มกลางจอ
    if (scroll) {
      requestAnimationFrame(() => {
        // วัดจากหมุดที่ไม่ติดจอ — ตัวแถบเองติดจออยู่ ตำแหน่งของมันไม่บอกว่าเลื่อนมาไกลแค่ไหน
        const anchor = document.getElementById("boq-group-anchor");
        // 48 = แถบหัวโครงการที่ติดจออยู่ (StickyPageHeader h-12)
        const top = anchor ? anchor.getBoundingClientRect().top - 48 : 0;
        if (top < 0) window.scrollTo({ top: window.scrollY + top });
      });
    }
  }

  // สรุปวัสดุโหลดตอนถูกเปิดเท่านั้น — เดิมเป็นแผงพับได้ ตอนนี้แท็บทำหน้าที่เปิด/ปิดแทน
  useEffect(() => {
    if (tab === "materials") setShowMaterialSummary(true);
  }, [tab]);

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
    materialSummary,
    setMaterialSummary,
    showMaterialSummary,
    setShowMaterialSummary,
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
    discMode,
    setDiscMode,
    discInput,
    setDiscInput,
    discNote,
    setDiscNote,
    savingRates,
    setSavingRates,
    editingContractId,
    setEditingContractId,
    showEditInfo,
    setShowEditInfo,
    savingInfo,
    setSavingInfo,
    infoForm,
    setInfoForm,
    categoryById,
    itemCategories,
    categoryOptions,
    materialOptions,
    materialById,
    loadMaterialSummary,
    refresh,
    silentRefresh,
    reloadQuotes,
    openEditInfo,
    handleSaveInfo,
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
    selectEditMaterial,
    submitEdit,
    handleDelete,
    handleCreateQuote,
    handleDeleteQuote,
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
  };
}

type ProjectState = ReturnType<typeof useProjectDetailState>;

/** ค่าวัดของโครงการ = ตัวขับของการถอดปริมาณแต่ละฐาน (null = ยังไม่ได้กรอกค่าวัดนั้น) */
function takeoffDriversOf(project: ProjectDetailDto["project"]): TakeoffDriversUi {
  const num = (v: string | null | undefined) => (v ? Number(v) : null);
  return {
    floorArea: num(project.areaSqm),
    wallArea: num(project.wallAreaSqm),
    perimeter: num(project.perimeterM),
    volume: num(project.concreteVolumeM3),
    footprint: num(project.footprintSqm),
    bathrooms: project.bathrooms ?? null,
    floors: project.floors ?? null,
  };
}

/**
 * วันที่ของแต่ละขั้นสำหรับแถบขั้นตอน — ดึงจากเอกสารที่มีอยู่จริง (สร้างโครงการ, ใบเสนอราคาที่ส่ง
 * ครั้งแรก, ใบเสนอราคาที่ลูกค้ายอมรับ) ขั้น "ส่งมอบ" ไม่มี timestamp แยก จึงเว้นวันที่ไว้
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
    COMPLETED: null,
  };
}

/** เหตุผลที่ลูกค้าปฏิเสธ = หมายเหตุของใบเสนอราคาฉบับล่าสุดที่ถูกปฏิเสธ (ฉบับเลขสูงสุด) */
function rejectionReasonOf(quotes: QuoteDto[]): string | null {
  return (
    [...quotes].filter((q) => q.status === "REJECTED").sort((a, b) => b.revisionNo - a.revisionNo)[0]
      ?.customerNote ?? null
  );
}

/** จัดกลุ่ม BOQ ตามรากหมวดงาน (เดินขึ้นสายพ่อแม่จนสุด) เรียงตามลำดับที่พบครั้งแรก (= ตาม sortOrder) */
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
  return groups;
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
  return previewNetPrice(newDirect, Number(version.overheadProfitPct), Number(version.vatPct));
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
  if (editingItem) {
    const qty = previewQtyOf(s.editBasis, s.editQuantity, s.editCoefficient, s.editWaste, driverValueOf(s.editBasis));
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
    const qty = previewQtyOf(f.qtyBasis, f.quantity, f.qtyCoefficient, f.wasteFactorPct, driverValueOf(f.qtyBasis));
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
    // แสดงพรีวิวยอดสุทธิเฉพาะเมื่อค่าต่างจากของเดิมจริง (ไม่งั้นรก)
    showNetPreview: previewNet != null && previewNet !== Number(version.netPrice),
  };
}

/** แท็บที่โชว์จริงขึ้นกับชนิดโครงการ: โครงการกำหนดเองไม่มี BOQ/สรุปวัสดุ และสัญญาโผล่เมื่อถึงสถานะ */
function visibleTabsOf(
  project: ProjectDetailDto["project"],
  itemCount: number,
  quoteCount: number,
  contractCount: number,
): { key: ProjectTab; label: string; count?: number }[] {
  const isCustom = project.type === "CUSTOM";
  const tabs: { key: ProjectTab; label: string; count?: number }[] = [{ key: "overview", label: "ภาพรวม" }];
  if (!isCustom) tabs.push({ key: "boq", label: "BOQ", count: itemCount });
  tabs.push({ key: "quotes", label: "ใบเสนอราคา", count: quoteCount });
  if (CONTRACT_ELIGIBLE_STATUSES.has(project.status)) {
    tabs.push({ key: "contracts", label: "สัญญา", count: contractCount });
  }
  if (!isCustom && itemCount > 0) tabs.push({ key: "materials", label: "สรุปวัสดุ" });
  return tabs;
}

/**
 * ผู้ติดต่อของโครงการ — ยึดบัญชีลูกค้าเป็นหลัก ถ้ายังไม่มีค่อยใช้ข้อมูลจากคำขอ
 * เบอร์โทรมาจากคำขอเสมอ เพราะ CustomerDto มีแค่ id/email/fullName ไม่มีเบอร์
 */
function contactOf(project: ProjectDetailDto["project"], lead: ProjectDetailDto["lead"]) {
  return {
    contactName: project.customer?.fullName ?? lead?.name ?? null,
    contactEmail: project.customer?.email ?? lead?.email ?? null,
    contactPhone: lead?.phone ?? null,
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
function priceCellsOf(version: ProjectVersionDto, isCustom: boolean): PriceCell[] {
  const vatCell: PriceCell = { label: `VAT ${version.vatPct}%`, value: version.vatAmt, rate: true };
  if (isCustom) {
    return [{ label: "ยอดก่อน VAT", value: version.directCost, rate: false }, discountCell(version), vatCell];
  }
  const discountAmt = Number(version.discountAmt);
  const split = splitOverheadProfit({
    directCost: Number(version.directCost),
    overheadProfitPct: Number(version.overheadProfitPct),
    overheadProfitAmt: Number(version.overheadProfitAmt),
    overheadPct: version.overheadPct == null ? null : Number(version.overheadPct),
  });
  const margin = split.known ? marginAfterDiscount(split.profitAmt, discountAmt) : null;
  return [
    { label: "ต้นทุนตรง", value: version.directCost, rate: false },
    {
      label: `ค่าดำเนินการ+กำไร ${version.overheadProfitPct}%`,
      value: version.overheadProfitAmt,
      rate: true,
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
  return {
    ratesSplitPreview,
    ratesPreviewMargin:
      s.showRates && !isCustom && overheadOk && overhead <= totalPct && discount
        ? marginPreviewOf(version, totalPct, overhead, discount, s.discMode === "NONE")
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
) {
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const direct = Number(version.directCost);
  const totalAmt = round2(direct * (totalPct / 100));
  const profitAmt = round2(totalAmt - round2(direct * (overheadPct / 100)));
  const discountAmt = previewDiscount(round2(direct + totalAmt), discount);
  return marginAfterDiscount(profitAmt, noDiscount ? 0 : discountAmt);
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
  const next = previewNetPrice(Number(version.directCost), ohPct, vat, discount);
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
        .filter((i) => i.qtyBasis !== "MANUAL" && driverValueOf(i.qtyBasis) == null)
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
) {
  const boqGroups = groupBoqByRoot(items, categoryById);
  // แท็บ BOQ แสดงทีละหมวด (?cat=) — ไม่มี/ชี้หมวดที่ไม่มีแล้ว (เช่น ลบบรรทัดสุดท้ายของหมวด) = หน้าสรุป
  const activeBoqIndex = boqGroups.findIndex((g) => g.key === catParam);
  const activeBoqGroup = activeBoqIndex >= 0 ? boqGroups[activeBoqIndex] : null;
  const boqRenderRows = activeBoqGroup ? boqRenderRowsOf(activeBoqGroup, categoryById, collapsedSubs) : [];
  // ยุบ/กางทุกหมวดย่อยของหมวดที่เปิดอยู่ (ปุ่มปลายขวาแถบหมวด แบบเดียวกับหน้าหมวดงาน/แม่แบบ)
  // ไม่จำสถานะข้ามการเปิดหน้า — BOQ ต้องเห็นครบเสมอตอนเปิดมา
  const foldableSubs = boqRenderRows.filter((row): row is SubheaderRow => row.type === "subheader");
  return {
    boqGroups,
    activeBoqIndex,
    activeBoqGroup,
    boqRenderRows,
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
  const visibleTabs = visibleTabsOf(project, items.length, s.quotes.length, s.contracts.length);

  return {
    project,
    currentVersion,
    items,
    editable: detail.editable,
    lead: detail.lead,
    nextStatuses: NEXT_TRANSITIONS[project.status],
    isCustom,
    hasCustomPrice: Number(currentVersion.netPrice) > 0,
    floorArea: drivers.floorArea,
    drivers,
    driverValueOf,
    stepDates: stepDatesOf(project, s.quotes),
    rejectionReason: rejectionReasonOf(s.quotes),
    ...boqViewOf(items, s.categoryById, s.boqCatParam, s.collapsedSubs),
    editingItem,
    ...linePreviewOf(s, currentVersion, editingItem, driverValueOf),
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
        <p className="text-slate-500">กำลังโหลด...</p>
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

/** แผงแก้อัตรา ค่าดำเนินการ+กำไร / VAT / ส่วนลด พร้อมพรีวิวราคาสุทธิ */
function RatesPanel({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { showRates, isCustom, canEditMargin, ohInput, setOhInput, overheadInput, setOverheadInput, ratesSplitPreview, vatInput, setVatInput, discMode, setDiscMode, discInput, setDiscInput, discNote, setDiscNote, handleSaveRates, savingRates, setShowRates, ratesPreviewNet, ratesPreviewMargin, editable } = vm;
  return (
    <>
      {showRates && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
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

/** ฟอร์มเพิ่มบรรทัด BOQ (เลือกวัสดุ/หมวดงาน/ฐานคำนวณปริมาณ/ราคา + พรีวิวยอด) */
function BoqAddForm({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { showAddForm, setShowAddForm, submitAdd, materialOptions, addForm, selectMaterial, categoryOptions, setAddForm, unitsInUse, addHasRecipe, addDerivedPrice, driverValueOf, rebarOpen, setRebarOpen, rebarDia, setRebarDia, rebarLen, setRebarLen, addComponents, setAddComponents, materialById, editingItem, previewLineTotal, showNetPreview, previewNet } = vm;
  return (
    <>
      {showAddForm && (
        <div
          className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2 border border-dashed border-slate-300 rounded-md p-3 bg-white items-end"
          onKeyDown={(e) => {
            // Enter บนช่องกรอก = บันทึก (dropdown ค้นหาดัก Enter ไว้เองแล้ว), Esc = ปิดฟอร์ม
            if (e.key === "Escape") {
              setShowAddForm(false);
            } else if (
              e.key === "Enter" &&
              !e.defaultPrevented &&
              (e.target as HTMLElement).tagName === "INPUT"
            ) {
              e.preventDefault();
              submitAdd();
            }
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-slate-700 col-span-2">
            ค้นหาวัสดุ (เลือกแล้วเติมหมวดงาน/ราคาให้)
            <SearchableSelect
              options={materialOptions}
              value={addForm.materialId}
              onChange={selectMaterial}
              placeholder="พิมพ์รหัส/ชื่อวัสดุ หรือเว้นไว้เพื่อกรอกเอง"
              clearable
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-700 col-span-2">
            หมวดงาน (ระดับรายการ)
            <SearchableSelect
              options={categoryOptions}
              value={addForm.categoryId}
              onChange={(next) => setAddForm((f) => ({ ...f, categoryId: next, materialId: "" }))}
              placeholder="พิมพ์รหัส/ชื่อหมวดงาน"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ชื่อรายการ</span>
            <input
              value={addForm.name}
              disabled={Boolean(addForm.materialId)}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm disabled:bg-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            หน่วยนับ
            {/* ใช้ตัวเดียวกับหน้าวัสดุ/ค่าแรง — เลือกจากลิสต์ก็ได้ พิมพ์เองก็ได้ (แต่ต้องกดยืนยัน)
                เดิมเป็นช่องพิมพ์เปล่า ๆ ซึ่งเป็นต้นทางของหน่วยสะกดเพี้ยน เช่น "ตรม." กับ "ตร.ม." */}
            <UnitSelect
              value={addForm.unit}
              onChange={(unit) => setAddForm((f) => ({ ...f, unit }))}
              options={UNIT_OPTIONS}
              inUse={unitsInUse}
              disabled={Boolean(addForm.materialId)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            ราคาวัสดุ/หน่วย
            {addHasRecipe ? (
              <input
                type="text"
                readOnly
                value={money(addDerivedPrice)}
                title="คิดจากผลรวมของสูตรวัสดุย่อยด้านล่าง"
                className="border border-slate-200 bg-slate-100 text-slate-500 rounded-md px-2 py-1 text-sm"
              />
            ) : (
              <input
                type="number"
                value={addForm.materialUnitPrice}
                onChange={(e) => setAddForm((f) => ({ ...f, materialUnitPrice: e.target.value }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              />
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>ค่าแรง/หน่วย</span>
            <input
              type="number"
              value={addForm.laborUnitPrice}
              onChange={(e) => setAddForm((f) => ({ ...f, laborUnitPrice: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>

          <div className="col-span-2 grid grid-cols-2 sm:col-span-4 sm:grid-cols-4 items-end gap-2 rounded-md bg-slate-50 p-2">
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>ฐานคำนวณปริมาณ</span>
              <select
                value={addForm.qtyBasis}
                onChange={(e) => setAddForm((f) => ({ ...f, qtyBasis: e.target.value as QtyBasis }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-sm"
              >
                {TAKEOFF_BASES.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>

            {addForm.qtyBasis === "MANUAL" ? (
              <label className="flex flex-col gap-1 text-xs text-slate-700">
                <span>จำนวน</span>
                <input
                  type="number"
                  value={addForm.quantity}
                  onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                />
              </label>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  {basisConfig(addForm.qtyBasis).perLabel}
                  <input
                    type="number"
                    step="0.0001"
                    value={addForm.qtyCoefficient}
                    onChange={(e) => setAddForm((f) => ({ ...f, qtyCoefficient: e.target.value }))}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  <span>เผื่อเสีย (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    value={addForm.wasteFactorPct}
                    onChange={(e) => setAddForm((f) => ({ ...f, wasteFactorPct: e.target.value }))}
                    className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                  />
                </label>
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-500">ปริมาณที่คิดได้</span>
                  {(() => {
                    const dv = driverValueOf(addForm.qtyBasis);
                    if (dv == null) {
                      return (
                        <span className="text-amber-600">
                          ตั้ง “{basisConfig(addForm.qtyBasis).measureLabel}” ในรายละเอียดโครงการก่อน
                        </span>
                      );
                    }
                    const q = previewTakeoffQty(
                      Number(addForm.qtyCoefficient),
                      Number(addForm.wasteFactorPct),
                      dv,
                    );
                    return q == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-medium text-slate-800">
                        {dv} × {addForm.qtyCoefficient || 0} × (1+{addForm.wasteFactorPct || 0}%) ={" "}
                        {q.toLocaleString("th-TH")}
                      </span>
                    );
                  })()}
                </div>
              </>
            )}

            {/* เครื่องมือคิดน้ำหนักเหล็กอยู่ในกล่องเดียวกับช่อง "จำนวน" ที่มันเติมค่าให้ — เดิมลอยอยู่
                นอกกล่อง คนละแถวกับช่องปลายทาง เลยไม่มีอะไรบอกว่ากดแล้วตัวเลขไปโผล่ตรงไหน
                โชว์เฉพาะโหมด "กรอกเอง" เพราะโหมดอื่นปริมาณมาจากสูตร การใส่ทับจะล้างสูตรทิ้ง */}
            {addForm.qtyBasis === "MANUAL" && (
              <div className="col-span-2 sm:col-span-4">
                <RebarCalculator
                  open={rebarOpen}
                  onToggle={() => setRebarOpen((v) => !v)}
                  diameterMm={rebarDia}
                  onDiameterChange={setRebarDia}
                  lengthM={rebarLen}
                  onLengthChange={setRebarLen}
                  unit={addForm.unit}
                  // ผูกวัสดุจากแคตตาล็อกอยู่ = ช่องหน่วยนับถูกล็อก แก้ให้ไม่ได้ ได้แค่เตือน
                  onUnitChange={
                    addForm.materialId ? undefined : (unit) => setAddForm((f) => ({ ...f, unit }))
                  }
                  onInsert={(kg) => {
                    setAddForm((f) => ({ ...f, quantity: String(kg) }));
                    setRebarOpen(false);
                  }}
                />
              </div>
            )}
          </div>

          <label className="flex flex-col gap-1 text-xs text-slate-700 col-span-3">
            <span>หมายเหตุ</span>
            <input
              value={addForm.note}
              onChange={(e) => setAddForm((f) => ({ ...f, note: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>

          <div className="col-span-2 sm:col-span-4 border-t border-slate-200 pt-3">
            <MaterialComponentsEditor
              rows={addComponents}
              onChange={setAddComponents}
              materialOptions={materialOptions}
              materialById={materialById}
              unitLabel={addForm.unit}
              unitDatalistId="boq-units"
            />
          </div>

          <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={submitAdd}>
              <Check size={14} /> บันทึก
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
              <X size={14} /> ยกเลิก
            </Button>
            {!editingItem && previewLineTotal != null && (
              <span className="text-xs text-slate-500">
                รวมบรรทัดนี้ ≈{" "}
                <span className="font-medium text-slate-800">{money(previewLineTotal)}</span>
                {showNetPreview && (
                  <>
                    {" "}
                    · ราคาสุทธิใหม่ ≈{" "}
                    <span className="font-medium text-brand">{money(previewNet!)}</span>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** ตาราง BOQ ของหมวดที่เปิด (หรือหน้าสรุปทุกหมวด) + แถวแก้ไขในที่ */
function BoqTable({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { items, missingDriverLabels, openEditInfo, scrollToSection, boqGroups, activeBoqGroup, foldableSubs, toggleAllSubs, allSubsCollapsed, driftItemIds, openBoqGroup, currentVersion, boqRenderRows, toggleSub, editingId, setEditingId, submitEdit, categoryById, materialOptions, editMaterialId, selectEditMaterial, editName, editUnit, editHasRecipe, editDerivedPrice, editMaterialPrice, setEditMaterialPrice, editLaborPrice, setEditLaborPrice, editBasis, editCoefficient, setEditCoefficient, editWaste, setEditWaste, driverValueOf, editQuantity, setEditQuantity, editRebarOpen, setEditRebarOpen, editRebarDia, setEditRebarDia, editRebarLen, setEditRebarLen, editComponents, setEditComponents, materialById, previewLineTotal, positionInGroup, reordering, moveItem, startEdit, handleDelete, activeBoqIndex } = vm;
  return (
    <>
      {items.length > 0 && (
        <>
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
          {/* กับดัก sticky: overflow ใด ๆ บนตัวห่อทำให้หัวตารางเลิกติดจอ — ปล่อยล้นได้เฉพาะจอแคบ */}
          <div className="overflow-x-auto lg:overflow-x-visible">
          <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          {/* top-22 (88px) = แถบหัวโครงการ 48 + แถบหมวด 40 — เลื่อนลึกแค่ไหนก็เห็นหมวด ยอดหมวด และชื่อคอลัมน์ */}
          <thead className="sticky top-22 z-10 text-left text-xs font-medium text-slate-600">
            {/* ชื่อหมวดเป็นแถวแรกของหัวตาราง (แบบเดียวกับหน้าแม่แบบ) + ยอดรวมหมวดชิดขวาตรงคอลัมน์ "รวม" */}
            <tr>
              <th colSpan={6} scope="colgroup" className="bg-[#ececf7] px-3 py-2.5 font-normal shadow-[inset_0_-1px_0_0_rgb(203,213,225)]">
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
              <th className="px-3 py-2">หน่วย</th>
              <th className="px-3 py-2 text-right">ราคาวัสดุ/หน่วย</th>
              <th className="px-3 py-2 text-right">ค่าแรง/หน่วย</th>
              <th className="px-3 py-2 text-right">รวม</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {boqRenderRows.map((row) => {
              if (row.type === "subheader") {
                // แถบคั่นบาง ๆ บอกหมวดย่อย + จำนวนบรรทัด แล้วลากเส้นไปจนสุดขวา (อ่านเป็นชั้นเหมือนเอกสาร BOQ)
                return (
                  <tr key={`s-${row.key}`}>
                    <td colSpan={8} className="px-3 pt-3 pb-1">
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
                        {row.count > 0 && (
                          <span className="shrink-0 text-xs text-slate-400">
                            ({row.count} รายการ)
                          </span>
                        )}
                        <span className="h-px flex-1 bg-slate-200" />
                      </button>
                    </td>
                  </tr>
                );
              }
              const item = row.item;
              return editingId === item.id ? (
                <tr
                  key={item.id}
                  className="border-t border-brand/40 bg-brand/5"
                  onKeyDown={(e) => {
                    // Enter บนช่องกรอก = บันทึก, Esc = ยกเลิกการแก้ (dropdown ค้นหาดักคีย์ของตัวเองไว้แล้ว)
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
                  }}
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
                        {editBasis !== "MANUAL" ? (
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
                            <label className="flex flex-col gap-1 text-xs text-slate-700">
                              <span>จำนวน</span>
                              <input
                                type="number"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                className="w-32 border border-slate-300 rounded-md px-2 py-1 text-sm text-right"
                              />
                            </label>
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

                      {/* สูตรวัสดุย่อย (ถอดปริมาณวัสดุ) */}
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        <MaterialComponentsEditor
                          rows={editComponents}
                          onChange={setEditComponents}
                          materialOptions={materialOptions}
                          materialById={materialById}
                          unitLabel={editUnit}
                          unitDatalistId="boq-units"
                        />
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
              ) : (
                <tr key={item.id} className="border-t border-slate-100">
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
                    {item.qtyBasis !== "MANUAL" &&
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
                  <td className="px-3 py-2 text-slate-700">{item.unit}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{money(item.materialUnitPrice)}</td>
                  <td className="px-3 py-2 text-right text-slate-800">{money(item.laborUnitPrice)}</td>
                  <td className="px-3 py-2 text-right text-slate-800 font-medium">{money(item.lineTotal)}</td>
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
                      <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>
                        <Pencil size={14} /> แก้ไข
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
          {/* ยอดรวมทั้งโครงการอยู่ท้ายทุกหมวด — ดูทีละหมวดแต่ยังเห็นว่าหมวดนี้ขยับยอดรวมเท่าไร */}
          {boqGroups.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={6} className="px-3 py-2 text-right font-medium text-slate-700">
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
    </>
  );
}

/** รายละเอียดโครงการ: ดูอย่างเดียว หรือฟอร์มแก้ไข */
function ProjectInfoCard({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { showEditInfo, infoForm, setInfoForm, handleSaveInfo, savingInfo, setShowEditInfo, project } = vm;
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
          </div>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>วันเริ่มก่อสร้าง</span>
            <input
              type="date"
              value={infoForm.startDate}
              onChange={(e) => setInfoForm((f) => ({ ...f, startDate: e.target.value }))}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            <span>วันคาดว่าแล้วเสร็จ</span>
            <input
              type="date"
              value={infoForm.targetEndDate}
              onChange={(e) => setInfoForm((f) => ({ ...f, targetEndDate: e.target.value }))}
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
                    `ผนัง ${Number(project.wallAreaSqm).toLocaleString("th-TH")} ตร.ม.`,
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
  const { activeTab, handleCreateQuote, isCustom, hasCustomPrice, items, quotes, openValidity, handleQuoteTransition, projectId, handleDeleteQuote, validityEdit, setValidityEdit, saveValidity, savingValidity, reloadQuotes } = vm;
  return (
    <>
      {activeTab === "quotes" && (
        <>
      <div id="quotes-section" className="flex items-center justify-between mb-2 scroll-mt-16">
        <h2 className="text-lg font-medium text-slate-800">ใบเสนอราคา</h2>
        <button
          type="button"
          onClick={handleCreateQuote}
          disabled={isCustom ? !hasCustomPrice : items.length === 0}
          className="text-sm bg-slate-800 text-white rounded-md px-3 py-1.5 disabled:opacity-40"
        >
          + สร้างใบเสนอราคาใหม่
        </button>
      </div>

      {quotes.length === 0 && <p className="text-slate-500">ยังไม่มีใบเสนอราคา</p>}

      {quotes.length > 0 && (
        <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70 mb-8">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
            <tr>
              {/* whitespace-nowrap: พอเพิ่มคอลัมน์ "ลูกค้าเปิดดู" ที่เหลือถูกบีบจน "ตอบรับเมื่อ" ตกบรรทัด */}
              <th className="whitespace-nowrap px-3 py-2">ฉบับที่</th>
              <th className="whitespace-nowrap px-3 py-2">เลขที่</th>
              <th className="whitespace-nowrap px-3 py-2">สถานะ</th>
              <th className="whitespace-nowrap px-3 py-2">ส่งเมื่อ</th>
              <th className="whitespace-nowrap px-3 py-2">ลูกค้าเปิดดู</th>
              <th className="whitespace-nowrap px-3 py-2">ตอบรับเมื่อ</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <Fragment key={q.id}>
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">ฉบับที่ {q.revisionNo}</td>
                  <td className="px-3 py-2 text-slate-800">{q.quoteNo}</td>
                  <td className="px-3 py-2">
                    <span className={badgeClass(QUOTE_STATUS_COLOR[q.status])}>
                      {QUOTE_STATUS_LABEL[q.status]}
                    </span>
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
                  <td className="px-3 py-2 text-slate-700">{formatDateTime(q.respondedAt)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center flex-wrap gap-2">
                      {QUOTE_NEXT_TRANSITIONS[q.status].map((s) => (
                        <Button
                          key={s}
                          variant={s === "SENT" ? "secondary" : "ghost"}
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
                        className={buttonClasses("ghost", "sm")}
                      >
                        <FileText size={14} /> เปิด PDF
                      </a>
                      {q.status === "DRAFT" && (
                        <Button variant="dangerQuiet" size="sm" onClick={() => handleDeleteQuote(q.id, q.quoteNo)}>
                          <Trash2 size={14} /> ลบฉบับร่าง
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
                          <input
                            type="date"
                            min={todayBangkok()}
                            max={addDaysIso(todayBangkok(), 365)}
                            value={validityEdit.value}
                            onChange={(e) =>
                              setValidityEdit({ quoteId: q.id, value: e.target.value })
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
      )}

        </>
      )}
    </>
  );
}

/** แท็บสัญญา: ออกสัญญาจากแม่แบบ + รายการสัญญา + แผงแก้ข้อความ/งวดเงิน */
function ContractsTab({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { activeTab, contractTemplates, newContractTemplateId, setNewContractTemplateId, handleCreateContract, contracts, handleSignContract, setEditingContractId, editingContractId, projectId, silentRefresh } = vm;
  return (
    <>
      {activeTab === "contracts" && (
        <>
          <div
            id="contracts-section"
            className="mb-2 flex flex-wrap items-center justify-between gap-2 scroll-mt-16"
          >
            <h2 className="text-lg font-medium text-slate-800">สัญญา</h2>
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
            <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70">
              <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
                <tr>
                  <th className="px-3 py-2">เลขที่</th>
                  <th className="px-3 py-2">แม่แบบ</th>
                  <th className="px-3 py-2">ลงนามเมื่อ</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <Fragment key={c.id}>
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{c.contractNo}</td>
                      {/* สัญญาที่ออกก่อนมีระบบแม่แบบค่าเป็น null จริง — ขีดไว้ ไม่เดาชื่อใส่แทน */}
                      <td className="px-3 py-2 text-slate-600">{c.templateName ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{formatDateTime(c.signedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center flex-wrap gap-2">
                          {!c.signedAt && (
                            <Button variant="secondary" size="sm" onClick={() => handleSignContract(c.id)}>
                              <Check size={14} /> ลงนาม
                            </Button>
                          )}
                          {/* ทางเข้าเดียวของการเติมยอดงวดเงิน — แม่แบบใส่ยอดจริงไม่ได้
                              เพราะใช้ร่วมกันทุกโครงการ */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEditingContractId((id) => (id === c.id ? null : c.id))
                            }
                          >
                            <Pencil size={14} />{" "}
                            {/* หลังลงนามแล้ว สิ่งที่อยู่หลังปุ่มนี้คือการติดตามรับเงิน ไม่ใช่ถ้อยคำ
                                (ถ้อยคำแก้ไม่ได้แล้ว) ชื่อปุ่มต้องบอกสิ่งที่จะได้เจอจริง ๆ */}
                            {contractPanelLabel(editingContractId === c.id, Boolean(c.signedAt))}
                          </Button>
                          <a
                            href={pdfViewerPath("contract", projectId, c.id)}
                            target="_blank"
                            rel="noopener"
                            className={buttonClasses("ghost", "sm")}
                          >
                            <FileText size={14} /> เปิด PDF
                          </a>
                        </div>
                      </td>
                    </tr>
                    {editingContractId === c.id && (
                      <tr className="border-t border-slate-100">
                        <td colSpan={4} className="bg-slate-50 px-3 py-4">
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
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

/** แท็บสรุปวัสดุ (ถอดปริมาณ) สำหรับสั่งซื้อ */
function MaterialsTab({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { activeTab, isCustom, items, showMaterialSummary, materialSummary } = vm;
  return (
    <>
      {activeTab === "materials" && !isCustom && items.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg">
          {/* เดิมเป็นแผงพับได้ที่ท้ายหน้า ตอนนี้แท็บทำหน้าที่เปิด/ปิดแทน หัวข้อจึงเป็นแค่ป้ายชื่อ */}
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Layers size={16} className="text-brand" />
              สรุปวัสดุ (ถอดปริมาณ)
              <span className="font-normal text-slate-500">— ปริมาณวัสดุรวมทั้งโครงการสำหรับสั่งซื้อ</span>
            </span>
          </div>

          {showMaterialSummary && (
            <div className="border-t border-slate-100 px-4 py-3">
              <MaterialSummaryBody summary={materialSummary} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** หัวโครงการ: ชื่อ/สถานะ/ผู้ติดต่อ + ผูกลูกค้า/คำขอ/ออกลิงก์เข้าใช้ + ปุ่มยกเลิกโครงการ */
function ProjectTitleBlock({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { project, isCustom, currentVersion, editable, contactName, contactEmail, contactPhone, differentRequester, lead, openCustomerSearch, handleIssueAccessLink, issuingLink, openCreateCustomer, openLeadPicker, showLeadPicker, loadingLeads, unlinkedLeads, linkingLead, handleLinkLead, setShowLeadPicker, showCreateCustomer, accessLinkForm, setAccessLinkForm, setShowCreateCustomer, accessLink, copyAccessLink, linkCopied, showCustomerSearch, customerQuery, setCustomerQuery, searchingCustomers, customerResults, assigningCustomer, handleAssignCustomer, setShowCustomerSearch, nextStatuses, handleTransition, transitioning } = vm;
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
          {/* การ์ดผู้ติดต่อ: คนหนึ่งคน = กล่องเดียว
              เดิมแยกเป็น "การ์ดจากคำขอ" กับ "บรรทัดลูกค้า" คนละที่คนละหน้าตา ทั้งที่วัดจากข้อมูลจริง
              แล้วชื่อและอีเมลซ้ำกัน 3 ใน 3 โครงการที่มีทั้งสองอย่าง = พิมพ์คนเดิมสองรอบ */}
          <div className="mt-3 max-w-xl overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0">
                {contactName ? (
                  <p className="text-xs text-slate-500">
                    {project.customer ? "ลูกค้า" : "ผู้ยื่นคำขอ"}
                  </p>
                ) : (
                  <p className="text-slate-500">ยังไม่มีข้อมูลผู้ติดต่อ</p>
                )}

                {/* ชื่อกับช่องทางติดต่ออยู่บรรทัดเดียวกัน — เป็นข้อมูลชุดเดียวกันและประหยัดความสูง
                    ของหัวหน้าซึ่งอยู่เหนือแท็บ (ทุกแท็บต้องแบกความสูงนี้ร่วมกัน) */}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  {contactName && <span className="font-medium text-slate-800">{contactName}</span>}
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

                {/* คนยื่นคำขอไม่ใช่เจ้าของบัญชีลูกค้า — ต้องบอก ไม่งั้นข้อมูลหายไปตอนรวมการ์ด */}
                {differentRequester && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    ผู้ยื่นคำขอ: <span className="text-slate-700">{lead!.name}</span>
                    {lead!.email && lead!.email !== contactEmail ? ` (${lead!.email})` : ""}
                  </p>
                )}

                {!project.customer && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    ยังไม่ได้ระบุลูกค้า — ลูกค้าจะยังไม่เห็นโครงการนี้
                  </p>
                )}
              </div>

              <div className="flex shrink-0 flex-wrap gap-1">
                {project.customer ? (
                  <>
                    {/* ทางเข้าหลักของแฟ้มลูกค้า — จุดที่พนักงานกำลังมองชื่อลูกค้าอยู่พอดี */}
                    <Link
                      to={`/customers/${project.customer.id}`}
                      className={buttonClasses("ghost", "sm")}
                    >
                      <UserRound size={14} /> ดูแฟ้มลูกค้า
                    </Link>
                    <Button variant="ghost" size="sm" onClick={openCustomerSearch}>
                      เปลี่ยนลูกค้า
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleIssueAccessLink(false)}
                      disabled={issuingLink}
                    >
                      {issuingLink ? "กำลังสร้าง..." : "ออกลิงก์เข้าใช้"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={openCustomerSearch}>
                      เลือกลูกค้า
                    </Button>
                    {lead && (
                      <Button variant="ghost" size="sm" onClick={openCreateCustomer}>
                        สร้างบัญชีลูกค้าจากคำขอ
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* ที่มาของงาน: เดิมเป็น "หัวเรื่อง" ของการ์ด ทั้งที่เป็นข้อมูลประกอบ จึงย้ายลงมาเป็นแถบล่าง */}
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
              {lead ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                    <span>มาจากคำขอ</span>
                    <span>· สนใจ {lead.serviceType}</span>
                    {lead.houseDesignName && <span>· แบบ {lead.houseDesignName}</span>}
                  </div>
                  {lead.message && (
                    <p className="mt-1.5 text-slate-700">ข้อความ: “{lead.message}”</p>
                  )}
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>ยังไม่ได้ระบุว่ามาจากคำขอของลูกค้ารายใด</span>
                  <Button variant="ghost" size="sm" onClick={openLeadPicker}>
                    เลือกคำขอลูกค้า
                  </Button>
                </div>
              )}
            </div>
          </div>

          {showLeadPicker && (
            <div className="mt-2 max-w-sm border border-slate-200 rounded-lg p-3 bg-white">
              <p className="text-xs text-slate-700 mb-2">
                เลือกคำขอของลูกค้าที่ตรงกับโครงการนี้ — ระบบจะดึงชื่อลูกค้าและแบบบ้านมาให้อัตโนมัติ
              </p>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {loadingLeads && <p className="text-xs text-slate-500">กำลังโหลด...</p>}
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
                  ปิด
                </Button>
              </div>
            </div>
          )}
          {showCreateCustomer && !project.customer && (
            <div className="mt-2 max-w-sm border border-slate-200 rounded-lg p-3 bg-white flex flex-col gap-2">
              <p className="text-xs text-slate-700">
                สร้างบัญชีให้ลูกค้าจากข้อมูลในคำขอ แล้วออกลิงก์ให้ลูกค้าตั้งรหัสผ่านเอง (ถ้าอีเมลนี้มีบัญชีอยู่แล้วระบบจะผูกบัญชีเดิมให้)
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
                <Button size="sm" onClick={() => handleIssueAccessLink(true)} disabled={issuingLink}>
                  {issuingLink ? "กำลังสร้าง..." : "สร้างบัญชี + ลิงก์เข้าใช้"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateCustomer(false)}>
                  ปิด
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
          {showCustomerSearch && (
            <div className="mt-2 max-w-sm border border-slate-200 rounded-lg p-3 bg-white">
              <SearchInput
                autoFocus
                placeholder="ค้นหาจากชื่อหรืออีเมลลูกค้า"
                value={customerQuery}
                onChange={setCustomerQuery}
                inputClassName="py-1"
              />
              <div className="mt-2 flex flex-col gap-1 max-h-48 overflow-y-auto">
                {searchingCustomers && <p className="text-xs text-slate-500">กำลังค้นหา...</p>}
                {!searchingCustomers && customerResults.length === 0 && (
                  <p className="text-xs text-slate-500">ไม่พบลูกค้า (ต้องเป็นบัญชีที่สมัครแล้วเท่านั้น)</p>
                )}
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={assigningCustomer}
                    onClick={() => handleAssignCustomer(c.id)}
                    className="text-left text-sm px-2 py-1 rounded-md hover:bg-slate-100 disabled:opacity-50"
                  >
                    {c.fullName} <span className="text-slate-500">({c.email})</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
                {project.customer && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleAssignCustomer(null)}
                    disabled={assigningCustomer}
                  >
                    เลิกผูกลูกค้า
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setShowCustomerSearch(false)}>
                  ปิด
                </Button>
              </div>
            </div>
          )}
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

function ProjectDetailView({ vm }: Readonly<{ vm: ProjectVM }>) {
  const { stuck, project, currentVersion, showNetPreview, previewNet, isCustom, handleTransition, transitioning, priceCells, showRates, setShowRates, openRates, sentinelRef, visibleTabs, goTab, activeTab, stepDates, quotes, rejectionReason, scrollToSection, projectId, showEditInfo, openEditInfo, customPriceInput, setCustomPriceInput, handleSetCustomPrice, savingCustomPrice, hasCustomPrice, items, silentRefresh, detail, setShowVersionCompare, showVersionCompare, setShowSaveTemplateForm, setShowAddForm, setDriftItemIds, showSaveTemplateForm, newTemplateName, setNewTemplateName, newTemplateDescription, setNewTemplateDescription, submitSaveTemplate, savingTemplate, templates, handleApplyTemplate, applyingTemplateId, handleDeleteTemplate, showAddForm } = vm;
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
      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col lg:flex-row">
          {/* ตัวประกอบ: เส้นคั่นบาง ๆ เส้นเดียวเหมือนตารางไร้กรอบ (C1) — จอแคบพับเป็นแถวซ้อนกัน
              เส้นคั่นจึงต้องสลับจากแนวตั้งเป็นแนวนอนด้วย */}
          <div className="flex min-w-0 flex-1 flex-col divide-y divide-slate-200 lg:flex-row lg:divide-x lg:divide-y-0">
            {priceCells.map((cell) => (
              <div key={cell.label} className="min-w-0 flex-1 px-4 py-3">
                {/* ป้ายที่มี % กดได้ = ทางเข้าเดียวของการแก้อัตรา วางไว้ตรงเลขที่มันควบคุมอยู่
                    ไม่ต้องเพิ่มปุ่มใหม่เข้าหน้าที่มีปุ่มเยอะอยู่แล้ว */}
                {cell.rate ? (
                  <button
                    type="button"
                    onClick={() => (showRates ? setShowRates(false) : openRates())}
                    className="group inline-flex items-center gap-1 text-xs text-slate-500 transition-colors hover:text-brand"
                  >
                    <span className="underline decoration-slate-300 decoration-dotted underline-offset-2 group-hover:decoration-brand">
                      {cell.label}
                    </span>
                    <Pencil size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ) : (
                  <p className="text-xs text-slate-500">{cell.label}</p>
                )}
                {/* ส่วนลดเป็นตัว "หัก" — ถ้าโชว์เป็นเลขบวกเฉย ๆ คนไล่อ่านซ้ายไปขวาจะบวกทุกช่อง
                    แล้วได้ยอดไม่ตรงกับราคาสุทธิที่อยู่ข้าง ๆ กันนั่นเอง */}
                {cell.empty ? (
                  <p className="mt-0.5 text-lg font-medium text-slate-300">—</p>
                ) : (
                  <p className="mt-0.5 text-lg font-medium tabular-nums text-slate-800">
                    {cell.negative ? "−" : ""}
                    {money(cell.value)}
                  </p>
                )}
                {cell.hint && (
                  <p className="mt-0.5 text-xs tabular-nums text-slate-500">{cell.hint}</p>
                )}
              </div>
            ))}
          </div>

          {/* ช่องสุดท้ายถมสีชนขอบการ์ดพอดี (การ์ดมี overflow-hidden) จึงไม่เกิดกล่องซ้อนกล่อง
              ไล่เฉดจาก brand ไป brand-dark ให้มีมิติ โดยไม่ต้องเพิ่มสีใหม่เข้าระบบ */}
          <div className="shrink-0 bg-linear-to-br from-brand to-brand-dark px-5 py-3 text-white lg:min-w-56">
            <p className="text-xs text-white/70">ราคาสุทธิ</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums leading-tight">
              {money(currentVersion.netPrice)}
            </p>
            {showNetPreview && (
              <p className="mt-1 text-xs tabular-nums text-white/80">
                → หลังบันทึก ≈ {money(previewNet!)}
              </p>
            )}
          </div>
        </div>

        {/* แผงแก้อัตรา — อยู่ในการ์ดเดียวกับตัวเลขที่มันเปลี่ยน ไม่ใช่กล่องลอยที่อื่น
            เดิมอัตราทั้งสองตั้งได้ครั้งเดียวตอนสร้างโครงการ (VAT ตั้งไม่ได้ด้วยซ้ำ) พอต่อรอง
            ราคากับลูกค้าจึงต้องสร้างโครงการใหม่ทั้งใบ */}
        <RatesPanel vm={vm} />
      </div>

      {/* หมุดวัดว่าหัวเรื่อง (รวมตัวเลขเงิน) พ้นจอไปหรือยัง → ใช้สั่งให้แถบด้านบนโผล่
          ต้องอยู่ "ท้ายสุดของหัว" ไม่งั้นแถบจะโผล่ทั้งที่ราคาสุทธิของจริงยังเห็นอยู่ = โชว์ซ้ำ */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      {/* แถบแท็บถูกขนาบด้วยการ์ดตัวเลขเงินด้านบนและการ์ดแถบขั้นตอนด้านล่าง ของเดิมเป็นข้อความเปล่า
          ระยะห่างแค่ 4px จึงอ่านเป็นประโยคเรียงกันมากกว่าปุ่ม และตัวเลขนับจางถึงขั้นอ่านไม่ออก
          (วัดได้ 2.51:1 ต่ำกว่าเกณฑ์ 4.5:1) — เพิ่มน้ำหนัก/ความเข้ม/ระยะห่าง โดยคงรูปแบบเส้นใต้เดิม */}
      <div className="mb-6 flex gap-3 overflow-x-auto border-b border-slate-300">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => goTab(t.key)}
            aria-current={t.key === activeTab ? "page" : undefined}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${
              t.key === activeTab
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-900"
            }`}
          >
            {t.label}
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
      {/* (A) แถบขั้นตอน + (B) การ์ด "ขั้นตอนถัดไป" — ให้เห็นว่าสถานะเดินอัตโนมัติมาถึงไหน และควรทำอะไรต่อ */}
      <div className="mb-6 flex flex-col gap-5 rounded-lg border border-slate-200 bg-white p-5">
        <ProjectStatusStepper status={project.status} stepDates={stepDates} />
        <ProjectNextAction
          status={project.status}
          hasQuote={quotes.length > 0}
          rejectionReason={rejectionReason}
          savingTransition={transitioning}
          onGoQuotes={() => scrollToSection("quotes-section")}
          onGoContracts={() => scrollToSection("contracts-section")}
          onMarkDelivered={() => handleTransition("COMPLETED")}
          onCloseLost={() => handleTransition("CANCELLED")}
        />
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

      {isCustom && (
        <div className="mb-6 bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between flex-wrap gap-1 mb-3">
            <p className="text-sm font-medium text-slate-700">ราคาโครงการกำหนดเอง</p>
            <span className="text-xs text-slate-500">
              กรอกยอดก่อน VAT (กำไรรวมในนี้แล้ว) — ระบบบวก VAT {currentVersion.vatPct}% ให้
            </span>
          </div>
          {/* ตัวเลขทั้งสามย้ายขึ้นไปอยู่แถบเหนือแท็บแล้ว ตรงนี้เหลือเฉพาะช่องกรอก */}
          <div className="flex items-center flex-wrap gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="ยอดก่อน VAT (บาท)"
              value={customPriceInput}
              onChange={(e) => setCustomPriceInput(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm w-56"
            />
            <Button
              size="sm"
              onClick={handleSetCustomPrice}
              disabled={savingCustomPrice || customPriceInput === ""}
            >
              <Check size={14} /> บันทึกราคา
            </Button>
            {!hasCustomPrice && (
              <span className="text-xs text-amber-600">
                ยังไม่ได้กำหนดราคา — ต้องกำหนดก่อนออกใบเสนอราคา
              </span>
            )}
          </div>
        </div>
      )}

        </>
      )}

      <QuotesTab vm={vm} />

      <ContractsTab vm={vm} />

      {/* โครงการกำหนดเองไม่ใช้ตัวสร้าง BOQ — ซ่อนทั้งส่วนนี้ (ใช้ราคากรอกเอง + ไฟล์แนบแทน) */}
      {activeTab === "boq" && !isCustom && (
        <>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-medium text-slate-800">รายการ BOQ</h2>
        <div className="flex gap-2">
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
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setShowSaveTemplateForm((v) => !v)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800"
            >
              บันทึกเป็นแม่แบบ
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="text-sm bg-slate-800 text-white rounded-md px-3 py-1.5"
          >
            + เพิ่มรายการ
          </button>
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
            <Button size="sm" onClick={() => setShowAddForm(true)}>
              + เพิ่มรายการแรก
            </Button>
          </div>
        </div>
      )}

      <BoqTable vm={vm} />
        </>
      )}

      <MaterialsTab vm={vm} />
    </Layout>
  );
}
