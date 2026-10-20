import type { Prisma } from "@prisma/client";
import { roundingUnitLabel } from "@systemboq/shared-types";

import { prisma } from "../../lib/prisma";

/**
 * ไทม์ไลน์กิจกรรมของโครงการ — อ่านจาก AuditLog ที่ระบบเขียนไว้อยู่แล้ว
 *
 * ทำไมต้องมี: เดิมเรื่องราวของดีลกระจายอยู่คนละที่ — วันที่สร้างอยู่บนแถบขั้นตอน, วันส่ง/วันตอบ
 * อยู่ในคอลัมน์ของตารางใบเสนอราคา, เหตุผลที่ลูกค้าปฏิเสธอยู่ในแถวสีแดงใต้ตาราง, การเปลี่ยน
 * สถานะโครงการไม่ได้แสดงที่ไหนเลย พนักงานต้องปะติดปะต่อเอง ทั้งที่ AuditLog เก็บครบมาตลอด
 */

/** ชนิดของเหตุการณ์ — ฝั่ง UI ใช้เลือกไอคอนกับสี */
export type ActivityKind =
  | "created"
  | "quote"
  | "sent"
  | "customer"
  | "accepted"
  | "rejected"
  | "contract"
  | "status"
  | "file";

export interface ProjectActivityItem {
  id: string;
  at: string;
  kind: ActivityKind;
  actor: string | null;
  title: string;
  detail: string | null;
}

/**
 * เหตุการณ์ที่เข้าไทม์ไลน์ — คัดเฉพาะหมุดหมายของดีล
 *
 * จงใจไม่เอา ADD/UPDATE/DELETE_BOQ_ITEM เข้ามา: ทั้งระบบมี AuditLog ของบรรทัด BOQ อยู่ 2,175
 * แถว (โครงการเดียวมีได้เป็นร้อย) ถ้าปล่อยเข้ามาจะกลบเรื่องราวจริงจนอ่านไม่ออก และตาราง BOQ
 * เองก็เป็นบันทึกว่ามีอะไรอยู่ในนั้นแล้ว — สิ่งที่ต้องรู้ระดับไทม์ไลน์คือ "เวอร์ชันใหม่ถูกสร้าง"
 * (CREATE_PROJECT_VERSION) กับ "ดึงแม่แบบมาลง" (APPLY_TEMPLATE) ซึ่งเก็บไว้แล้ว
 */
const TIMELINE_ACTIONS = new Set([
  "CREATE_PROJECT",
  "UPDATE_PROJECT",
  "TRANSITION_PROJECT",
  "LINK_LEAD_TO_PROJECT",
  "APPLY_TEMPLATE",
  "SET_CUSTOM_PRICE",
  "UPDATE_VERSION_RATES",
  "CREATE_PROJECT_VERSION",
  "CREATE_QUOTE",
  "TRANSITION_QUOTE",
  "CUSTOMER_OPEN_QUOTE",
  "CUSTOMER_OPEN_QUOTE_PDF",
  "CUSTOMER_DOWNLOAD_ATTACHMENT",
  "CUSTOMER_RESPOND_QUOTE",
  "DELETE_QUOTE",
  // ขั้นอนุมัติก่อนส่ง (quote-approval.service.ts)
  "QUOTE_APPROVAL_REQUESTED",
  "QUOTE_APPROVED",
  "QUOTE_APPROVAL_RETURNED",
  "QUOTE_APPROVAL_WITHDRAWN",
  "ADD_QUOTE_ATTACHMENT",
  "UPDATE_QUOTE_ATTACHMENT",
  "CREATE_CONTRACT",
  "SIGN_CONTRACT",
  "ISSUE_ACCESS_LINK",
  "ACCESS_LINK_REDEEMED",
  "CREATE_CUSTOMER_FROM_LEAD",
  "CREATE_CUSTOMER_FOR_PROJECT",
]);

const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคาแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
  // เลิกใช้ไปแล้ว (ไม่มีใน enum ปัจจุบัน) แต่ยังค้างอยู่ในบันทึกย้อนหลัง — ต้องแปลไว้
  // ไม่งั้นไทม์ไลน์จะโชว์ค่าดิบภาษาอังกฤษให้ผู้ใช้เห็น
  IN_PROGRESS: "กำลังก่อสร้าง",
};

const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  SENT: "ส่งแล้ว",
  ACCEPTED: "ลูกค้ายอมรับ",
  REJECTED: "ลูกค้าปฏิเสธ",
  REVISED: "ขอปรับแก้",
};

type Details = Record<string, unknown>;

function str(details: Details, key: string): string | null {
  const value = details[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

interface RatesSnapshot {
  overheadProfitPct?: number;
  overheadPct?: number | null;
  vatPct?: number;
  discountPct?: number | null;
  discountAmt?: number;
  contingencyPct?: number;
  roundingUnit?: number | null;
}

const baht = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "ไม่มีส่วนลด" / "ส่วนลด 5%" / "ส่วนลด 50,000.00 บาท" — ใช้บรรยายสถานะส่วนลดหนึ่งฝั่ง */
function discountLabel(snap: RatesSnapshot): string {
  const amt = snap.discountAmt ?? 0;
  if (amt <= 0 && snap.discountPct == null) return "ไม่มีส่วนลด";
  if (snap.discountPct != null) return `ส่วนลด ${snap.discountPct}%`;
  return `ส่วนลด ${baht(amt)} บาท`;
}

/** "ไม่ปัดยอด" / "ปัดยอดสุทธิ: ปัดลงหลักพัน" — สถานะการปัดหนึ่งฝั่ง */
function roundingLabel(snap: RatesSnapshot): string {
  return snap.roundingUnit == null ? "ไม่ปัดยอด" : `ปัดยอดสุทธิ: ${roundingUnitLabel(snap.roundingUnit)}`;
}

/** "ยังไม่ได้แยก" / "ค่าดำเนินการ 4% + กำไร 6%" — สถานะการแบ่งหนึ่งฝั่ง */
function splitLabel(snap: RatesSnapshot): string {
  if (snap.overheadPct == null) return "ยังไม่ได้แยกค่าดำเนินการกับกำไร";
  const total = snap.overheadProfitPct ?? 0;
  return `ค่าดำเนินการ ${snap.overheadPct}% + กำไร ${Math.round((total - snap.overheadPct) * 100) / 100}%`;
}

/**
 * ค่าเผื่อเหลือเผื่อขาดเปลี่ยน — ต้องอยู่ในไทม์ไลน์เพราะมันเปลี่ยนราคาทั้งใบ
 * (ของเก่าก่อนมีค่าเผื่อไม่มีคีย์นี้ใน details จึงต้องเช็ค undefined)
 */
function contingencyParts(before: RatesSnapshot, after: RatesSnapshot): string[] {
  if ((before.contingencyPct ?? 0) === (after.contingencyPct ?? 0)) return [];
  return [`เผื่อเหลือเผื่อขาด ${before.contingencyPct ?? 0}% → ${after.contingencyPct ?? 0}%`];
}

/** "ค่าดำเนินการ+กำไร 10% → 7%" — เขียนเฉพาะตัวที่เปลี่ยนจริง อีกตัวไม่ต้องรก */
function ratesDetail(details: Details): string | null {
  const before = details.before as RatesSnapshot | undefined;
  const after = details.after as RatesSnapshot | undefined;
  if (!before || !after) return null;
  const parts: string[] = contingencyParts(before, after);
  if (before.overheadProfitPct !== after.overheadProfitPct) {
    parts.push(`ค่าดำเนินการ+กำไร ${before.overheadProfitPct}% → ${after.overheadProfitPct}%`);
  }
  // การแบ่งในก้อนรวมเปลี่ยน = กำไรที่เหลือให้ต่อรองเปลี่ยนไปด้วย ต้องเห็นในไทม์ไลน์
  if ((before.overheadPct ?? null) !== (after.overheadPct ?? null)) {
    parts.push(`${splitLabel(before)} → ${splitLabel(after)}`);
  }
  if (before.vatPct !== after.vatPct) {
    parts.push(`VAT ${before.vatPct}% → ${after.vatPct}%`);
  }
  // ส่วนลดต้องเทียบทั้ง % และยอดบาท เพราะ "ลด 5%" ที่ยอดเปลี่ยนก็คือส่วนลดคนละก้อนกัน
  if (
    (before.discountPct ?? null) !== (after.discountPct ?? null) ||
    (before.discountAmt ?? 0) !== (after.discountAmt ?? 0)
  ) {
    parts.push(`${discountLabel(before)} → ${discountLabel(after)}`);
  }
  // ของเก่าก่อนมีการปัดยอดไม่มีคีย์นี้ — undefined กับ null คือ "ไม่ปัด" เหมือนกัน
  if ((before.roundingUnit ?? null) !== (after.roundingUnit ?? null)) {
    parts.push(`${roundingLabel(before)} → ${roundingLabel(after)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** หัวข้อไทม์ไลน์ต้องบอกว่าแก้อะไร — แก้ส่วนลดอย่างเดียวแล้วขึ้นว่า "แก้อัตรา VAT" คืออ่านแล้วหลงทาง */
function ratesTitle(details: Details): string {
  const RATES_ONLY = "แก้อัตราค่าดำเนินการ+กำไร / VAT";
  const before = details.before as RatesSnapshot | undefined;
  const after = details.after as RatesSnapshot | undefined;
  // ของเก่าก่อนมีส่วนลดไม่มีสองคีย์นี้ใน details — อ่านไม่ได้ก็ใช้หัวข้อเดิมไว้ก่อน
  if (!before || !after) return RATES_ONLY;

  const rateChanged =
    before.overheadProfitPct !== after.overheadProfitPct ||
    (before.overheadPct ?? null) !== (after.overheadPct ?? null) ||
    before.vatPct !== after.vatPct ||
    contingencyParts(before, after).length > 0;
  const discountChanged =
    (before.discountPct ?? null) !== (after.discountPct ?? null) ||
    (before.discountAmt ?? 0) !== (after.discountAmt ?? 0) ||
    (before.roundingUnit ?? null) !== (after.roundingUnit ?? null);

  if (!discountChanged) return RATES_ONLY;
  return rateChanged ? "แก้อัตราและส่วนลด" : "แก้ส่วนลด";
}

type ActivityLine = { kind: ActivityKind; title: string; detail: string | null };

/** พนักงานเปลี่ยนสถานะใบเสนอราคา — ส่งให้ลูกค้า หรือกรอกคำตอบของลูกค้าให้เอง (โทรคุยกันแล้ว) */
function describeQuoteTransition(to: string | null, quoteLabel: string): ActivityLine {
  if (to === "SENT") return { kind: "sent", title: `ส่ง${quoteLabel} ให้ลูกค้า`, detail: null };
  let kind: ActivityKind = "customer";
  if (to === "ACCEPTED") kind = "accepted";
  else if (to === "REJECTED") kind = "rejected";
  return {
    kind,
    title: `บันทึกคำตอบของลูกค้าให้${quoteLabel}`,
    detail: `พนักงานบันทึกเอง: ${QUOTE_STATUS_LABEL[to ?? ""] ?? to}`,
  };
}

/** ลูกค้าตอบใบเสนอราคาเองในพอร์ทัล */
function describeCustomerResponse(to: string | null, note: string | null, quoteLabel: string): ActivityLine {
  if (to === "ACCEPTED") return { kind: "accepted", title: `ลูกค้ายอมรับ${quoteLabel}`, detail: note };
  if (to === "REJECTED") {
    return { kind: "rejected", title: `ลูกค้าปฏิเสธ${quoteLabel}`, detail: note ?? "ไม่ได้ระบุเหตุผล" };
  }
  return { kind: "customer", title: `ลูกค้าขอปรับแก้${quoteLabel}`, detail: note };
}

function describeProjectTransition(from: string | null, to: string | null): ActivityLine {
  let kind: ActivityKind = "status";
  if (to === "APPROVED") kind = "accepted";
  else if (to === "REJECTED" || to === "CANCELLED") kind = "rejected";
  const fromLabel = from ? PROJECT_STATUS_LABEL[from] ?? from : null;
  return {
    kind,
    title: `สถานะโครงการเปลี่ยนเป็น “${PROJECT_STATUS_LABEL[to ?? ""] ?? to}”`,
    detail: fromLabel ? `จาก “${fromLabel}”` : null,
  };
}

/** แปลงหนึ่งแถวของ AuditLog เป็นบรรทัดที่คนอ่านรู้เรื่อง — คืน null ถ้าไม่ควรขึ้นไทม์ไลน์ */
function describe(
  action: string,
  details: Details,
  quoteNoById: Map<string, string>,
  entityId: string | null,
): { kind: ActivityKind; title: string; detail: string | null } | null {
  const quoteNo = (entityId ? quoteNoById.get(entityId) : null) ?? str(details, "quoteNo");
  const quoteLabel = quoteNo ? `ใบเสนอราคา ${quoteNo}` : "ใบเสนอราคา";

  switch (action) {
    case "CREATE_PROJECT":
      return { kind: "created", title: "สร้างโครงการ", detail: str(details, "name") };
    case "LINK_LEAD_TO_PROJECT":
      return { kind: "created", title: "ผูกโครงการเข้ากับคำขอของลูกค้า", detail: null };
    case "CREATE_CUSTOMER_FROM_LEAD":
      return { kind: "customer", title: "สร้างบัญชีลูกค้าจากคำขอ", detail: str(details, "email") };
    case "CREATE_CUSTOMER_FOR_PROJECT":
      return { kind: "customer", title: "สร้างบัญชีลูกค้าให้โครงการ", detail: str(details, "email") };
    case "ISSUE_ACCESS_LINK":
      return { kind: "customer", title: "ออกลิงก์เข้าใช้งานให้ลูกค้า", detail: null };
    case "ACCESS_LINK_REDEEMED":
      return { kind: "customer", title: "ลูกค้าตั้งรหัสผ่านและเข้าใช้งานแล้ว", detail: null };

    case "APPLY_TEMPLATE":
      return {
        kind: "quote",
        title: "ดึงแม่แบบมาลงในรายการ BOQ",
        detail: str(details, "templateName"),
      };
    case "SET_CUSTOM_PRICE":
      return { kind: "quote", title: "ตั้งราคาแบบกำหนดเอง", detail: null };
    case "UPDATE_VERSION_RATES":
      // ต้องบอกว่าเปลี่ยนจากเท่าไรเป็นเท่าไร — การแก้อัตราขยับราคาสุทธิทั้งใบ
      // ถ้าเขียนแค่ "แก้อัตรา" คนอ่านย้อนหลังจะไม่รู้ว่าเกิดอะไรขึ้นกับราคา
      return { kind: "quote", title: ratesTitle(details), detail: ratesDetail(details) };
    case "CREATE_PROJECT_VERSION":
      return {
        kind: "quote",
        title: "แก้ไข BOQ หลังส่งใบเสนอราคา จึงสร้างเวอร์ชันใหม่",
        detail: null,
      };
    case "UPDATE_PROJECT":
      return { kind: "status", title: "แก้ไขรายละเอียดโครงการ", detail: null };

    case "CREATE_QUOTE":
      return { kind: "quote", title: `ออก${quoteLabel}`, detail: null };
    case "DELETE_QUOTE":
      return { kind: "status", title: `ลบ${quoteLabel} (ฉบับร่าง)`, detail: null };

    case "TRANSITION_QUOTE":
      return describeQuoteTransition(str(details, "to"), quoteLabel);

    case "QUOTE_APPROVAL_REQUESTED":
      return { kind: "quote", title: `ขออนุมัติ${quoteLabel}`, detail: null };
    case "QUOTE_APPROVED":
      return {
        kind: "status",
        title: `อนุมัติ${quoteLabel}`,
        detail: details?.selfProposed === true ? "เจ้าของออกใบและอนุมัติเอง" : null,
      };
    case "QUOTE_APPROVAL_RETURNED":
      return { kind: "status", title: `ส่ง${quoteLabel} กลับให้แก้`, detail: str(details, "note") };
    case "QUOTE_APPROVAL_WITHDRAWN":
      return { kind: "status", title: `ถอนคำขออนุมัติ${quoteLabel}`, detail: null };

    // ลูกค้าเปิดอ่านซ้ำได้เรื่อย ๆ — ไทม์ไลน์ของโครงการจึงเอาเฉพาะ "ครั้งแรก" (recordQuoteView
    // ติดธง details.firstView ไว้ให้) ไม่งั้นการเปิดอ่านจะกลบหมุดหมายของดีลจนอ่านไม่ออก
    // เรื่องราวระดับนาทีอยู่ในแฟ้มลูกค้าแทน (customerFile.service.ts)
    case "CUSTOMER_OPEN_QUOTE":
    case "CUSTOMER_OPEN_QUOTE_PDF":
    case "CUSTOMER_DOWNLOAD_ATTACHMENT":
      if (details.firstView !== true) return null;
      return { kind: "customer", title: `ลูกค้าเปิดดู${quoteLabel} ครั้งแรก`, detail: null };

    case "CUSTOMER_RESPOND_QUOTE":
      return describeCustomerResponse(str(details, "to"), str(details, "note"), quoteLabel);

    case "ADD_QUOTE_ATTACHMENT":
      return {
        kind: "file",
        title: "แนบไฟล์เข้ากับใบเสนอราคา",
        detail: str(details, "fileName"),
      };
    case "UPDATE_QUOTE_ATTACHMENT":
      // สนใจเฉพาะตอนเปิดไฟล์ให้ลูกค้าเห็น — การสลับชนิดไฟล์ไม่ใช่หมุดหมายของดีล
      if (str(details, "visibility") !== "CUSTOMER") return null;
      return { kind: "file", title: "เปิดไฟล์แนบให้ลูกค้าเห็น", detail: null };

    case "CREATE_CONTRACT":
      return {
        kind: "contract",
        title: `ออกสัญญา ${str(details, "contractNo") ?? ""}`.trim(),
        detail: null,
      };
    case "SIGN_CONTRACT":
      return { kind: "contract", title: "บันทึกว่าลงนามสัญญาแล้ว", detail: null };

    case "TRANSITION_PROJECT":
      return describeProjectTransition(str(details, "from"), str(details, "to"));

    default:
      return null;
  }
}

export const ACTIVITY_PAGE_SIZE = 15;

// การเปิดดูซ้ำ/สลับชนิดไฟล์แนบไม่ขึ้นไทม์ไลน์ (ดู describe) — กรองที่ฐานข้อมูลด้วยเงื่อนไขเดียวกัน
// ไม่งั้นนับยอดรวมเกิน และแต่ละหน้าได้ไม่ครบ 15 แถวเพราะถูกตัดทิ้งหลังดึงมาแล้ว
const FIRST_VIEW_ONLY = ["CUSTOMER_OPEN_QUOTE", "CUSTOMER_OPEN_QUOTE_PDF", "CUSTOMER_DOWNLOAD_ATTACHMENT"];
const CUSTOMER_VISIBILITY_ONLY = ["UPDATE_QUOTE_ATTACHMENT"];
const ALWAYS_SHOWN = [...TIMELINE_ACTIONS].filter(
  (a) => !FIRST_VIEW_ONLY.includes(a) && !CUSTOMER_VISIBILITY_ONLY.includes(a),
);

export interface ProjectActivityPage {
  activity: ProjectActivityItem[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * เหตุการณ์ของโครงการ (รวมของใบเสนอราคา/สัญญา/เวอร์ชัน/ไฟล์แนบที่อยู่ใต้โครงการนี้)
 * เรียงใหม่สุดขึ้นก่อน แบ่งหน้าละ 15 ที่ฐานข้อมูล — งานที่เดินมาหลายเดือนมีหลายร้อยเหตุการณ์
 * ขอหน้าเกินหน้าสุดท้ายได้หน้าสุดท้าย
 */
export async function getProjectActivity(projectId: string, requestedPage = 1): Promise<ProjectActivityPage> {
  const empty = { activity: [], page: 1, pageSize: ACTIVITY_PAGE_SIZE, total: 0 };
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      quotes: { select: { id: true, quoteNo: true } },
      contracts: { select: { id: true } },
      versions: { select: { id: true } },
    },
  });
  if (!project) return empty;

  const quoteIds = project.quotes.map((q) => q.id);
  const quoteNoById = new Map(project.quotes.map((q) => [q.id, q.quoteNo]));

  // ไฟล์แนบผูกกับใบเสนอราคา ไม่ได้ผูกกับโครงการตรง ๆ จึงต้องดึง id มาก่อน
  const attachmentIds =
    quoteIds.length > 0
      ? (
          await prisma.quoteAttachment.findMany({
            where: { quoteId: { in: quoteIds } },
            select: { id: true },
          })
        ).map((a) => a.id)
      : [];

  const entityIds = [
    project.id,
    ...quoteIds,
    ...project.contracts.map((c) => c.id),
    ...project.versions.map((v) => v.id),
    ...attachmentIds,
  ];

  const where: Prisma.AuditLogWhereInput = {
    entityId: { in: entityIds },
    OR: [
      { action: { in: ALWAYS_SHOWN } },
      { action: { in: FIRST_VIEW_ONLY }, details: { path: ["firstView"], equals: true } },
      { action: { in: CUSTOMER_VISIBILITY_ONLY }, details: { path: ["visibility"], equals: "CUSTOMER" } },
    ],
  };
  const total = await prisma.auditLog.count({ where });
  const lastPage = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), lastPage);
  const rows = await prisma.auditLog.findMany({
    where,
    // id ต่อท้าย — เหตุการณ์เวลาเดียวกันต้องไม่สลับที่ข้ามหน้า
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ACTIVITY_PAGE_SIZE,
    take: ACTIVITY_PAGE_SIZE,
    include: { user: { select: { fullName: true } } },
  });

  const items: ProjectActivityItem[] = [];
  for (const row of rows) {
    const details = (row.details ?? {}) as Prisma.JsonObject as Details;
    const described = describe(row.action, details, quoteNoById, row.entityId);
    if (!described) continue;
    items.push({
      id: row.id,
      at: row.createdAt.toISOString(),
      kind: described.kind,
      actor: row.user?.fullName ?? null,
      title: described.title,
      detail: described.detail,
    });
  }
  return { activity: items, page, pageSize: ACTIVITY_PAGE_SIZE, total };
}
