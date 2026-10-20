import type { Prisma } from "@prisma/client";
import { classifyIp, type CustomerDirectoryView } from "@systemboq/shared-types";

import { issueAccessTokenFor } from "../../lib/access-token";
import { isAnonymized } from "../../lib/anonymized";
import { billingPartyOf } from "../../lib/billing-party";
import { writeAuditLog } from "../../lib/audit-log";
import { prisma } from "../../lib/prisma";
import { purgeDateOf, REPLACEABLE_SIGNUP, UNVERIFIED_SIGNUP } from "../../lib/unverified-signups";
import { deviceLabel } from "../../lib/user-agent";
import { geoLookup } from "../../lib/geoip";
import type { SetCustomerActiveInput, UpdateCustomerInput } from "./customers.schemas";

/**
 * แฟ้มลูกค้า — รวมทุกอย่างของลูกค้าหนึ่งรายไว้ที่เดียว
 *
 * ทำไมต้องมี: ก่อนหน้านี้ระบบไม่มีหน้าลูกค้าเลย ข้อมูลของคนคนเดียวกระจายอยู่สามที่ — บัญชีอยู่ใน
 * หน้าจัดการผู้ใช้ (OWNER เท่านั้น), โครงการอยู่ในหน้าโครงการ, คำขอแรกอยู่ในหน้าคำขอลูกค้า และ
 * กิจกรรมที่เขาทำ (เข้าระบบ ส่งคำขอ เปิดดูใบเสนอราคา ตอบรับ) ไม่มีที่ไหนแสดงเลยทั้งที่ AuditLog
 * เก็บครบมาตลอด พนักงานจึงต้องปะติดปะต่อเองก่อนจะยกหูโทรหาลูกค้า
 */

export class CustomerFileError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CustomerFileError";
    this.status = status;
  }
}

/**
 * ไทม์ไลน์แบ่งหน้าที่เซิร์ฟเวอร์ ไม่ใช่ดึงมาทั้งก้อนแล้วตัดในเบราว์เซอร์
 *
 * ของเดิมดึงมา 200 แถวแล้วให้หน้าจอแบ่งหน้าเอง ซึ่งใช้ได้ตอนที่ลูกค้ารายที่คึกที่สุดมี 27 แถว
 * แต่เพดานนั้น **เงียบ**: พอชนเมื่อไร หน้าจะขึ้นว่า "200 รายการ" ทั้งที่จริงมีมากกว่านั้น และ
 * ไม่มีทางเลื่อนไปดูของเก่ากว่านั้นได้เลย — การขยายเลขไม่ได้แก้ปัญหา แค่เลื่อนวันที่จะโกหกออกไป
 */
export const ACTIVITY_PAGE_SIZE = 15;
const ACTIVITY_PAGE_SIZE_MAX = 200;

/**
 * ไทม์ไลน์ "ลูกค้ากับโครงการนี้" บนหน้ารายละเอียดโครงการยังไม่แบ่งหน้า — มันเป็นบล็อกพรีวิว
 * ที่ขอบเขตแคบอยู่แล้ว (แค่ใบเสนอราคาของโครงการเดียว) แต่ยังคืนยอดจริงมาด้วย เพื่อให้หน้าจอ
 * บอกได้ว่า "แสดง 200 จาก N" แทนที่จะตัดทิ้งเงียบ ๆ เหมือนเดิม
 */
const PROJECT_ACTIVITY_LIMIT = 200;

export interface PageRequest {
  page?: number;
  pageSize?: number;
}

export interface Paged<T> {
  items: T[];
  /** ยอดจริงทั้งหมดที่ตรงตัวกรอง — ไม่ใช่จำนวนที่ส่งมาในหน้านี้ */
  total: number;
  page: number;
  pageSize: number;
}

/** แปลงค่าที่ผู้เรียกส่งมาเป็นช่วงที่ใช้ได้จริง (กันขอ pageSize=100000 มาถล่มฐานข้อมูล) */
function resolvePage(req: PageRequest | undefined, fallbackSize: number, maxSize: number) {
  const pageSize = Math.min(Math.max(Math.trunc(req?.pageSize ?? fallbackSize), 1), maxSize);
  const page = Math.max(Math.trunc(req?.page ?? 1), 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

type ActivityKind =
  | "account"
  | "login"
  | "security"
  | "lead"
  | "view"
  | "file"
  | "accepted"
  | "rejected"
  | "revision"
  | "project"
  | "staff"
  | "other";

const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคาแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
  // เลิกใช้แล้วแต่ยังค้างในบันทึกย้อนหลัง — ต้องแปลไว้ ไม่งั้นโชว์ค่าดิบภาษาอังกฤษให้ผู้ใช้เห็น
  IN_PROGRESS: "กำลังก่อสร้าง",
};

type Details = Record<string, unknown>;

function str(details: Details, key: string): string | null {
  const value = details[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

interface Described {
  kind: ActivityKind;
  title: string;
  detail: string | null;
}

/**
 * แถวที่ "พนักงานทำกับลูกค้ารายนี้" (ไม่ใช่ลูกค้าทำเอง) — แก้ข้อมูลติดต่อ ระงับบัญชี ออกลิงก์เข้าใช้
 *
 * ต้องอยู่ในแฟ้มด้วย ไม่งั้นข้อมูลลูกค้าเปลี่ยนหรือบัญชีถูกปิดแล้วไม่มีร่องรอยให้เห็นที่ไหนเลย
 * ว่าใครทำเมื่อไร (บันทึกมีอยู่ใน AuditLog อยู่แล้ว แต่ไม่เคยถูกแสดง)
 */
function describeStaffAction(action: string, details: Details, actor: string): Described {
  const by = `โดย ${actor}`;
  switch (action) {
    case "UPDATE_CUSTOMER": {
      const fields = Array.isArray(details.fields) ? (details.fields as string[]) : [];
      const label: Record<string, string> = {
        fullName: "ชื่อ",
        phone: "เบอร์โทร",
        address: "ที่อยู่",
        customerType: "ประเภทผู้ว่าจ้าง",
        companyName: "ชื่อนิติบุคคล",
        taxId: "เลขประจำตัวผู้เสียภาษี",
        branch: "สำนักงาน/สาขา",
        contactPerson: "ผู้ประสานงาน",
      };
      const named = fields.map((f) => label[f] ?? f).join(" · ");
      return {
        kind: "staff",
        title: named ? `พนักงานแก้ไขข้อมูลติดต่อ (${named})` : "พนักงานแก้ไขข้อมูลติดต่อ",
        detail: by,
      };
    }
    case "SUSPEND_CUSTOMER": {
      const reason = str(details, "reason");
      return {
        kind: "staff",
        title: "พนักงานระงับบัญชีลูกค้า",
        detail: reason ? `${by} · เหตุผล: ${reason}` : by,
      };
    }
    case "RESTORE_CUSTOMER":
      return { kind: "staff", title: "พนักงานเปิดใช้งานบัญชีลูกค้าอีกครั้ง", detail: by };
    case "ISSUE_ACCESS_LINK":
      return { kind: "staff", title: "พนักงานออกลิงก์ตั้งรหัสผ่าน/เข้าใช้งานให้", detail: by };
    case "CREATE_CUSTOMER_FROM_LEAD":
      return { kind: "staff", title: "พนักงานสร้างบัญชีให้จากคำขอ", detail: by };
    case "CREATE_CUSTOMER_FOR_PROJECT":
      return { kind: "staff", title: "พนักงานสร้างบัญชีให้จากหน้าโครงการ", detail: by };
    default:
      return { kind: "staff", title: action, detail: by };
  }
}

/**
 * แปลงหนึ่งแถวของ AuditLog เป็นบรรทัดที่คนอ่านรู้เรื่อง
 *
 * ต่างจากไทม์ไลน์โครงการตรงที่ **ไม่คืน null ทิ้งแถวที่ไม่รู้จัก** — ที่นี่คือแฟ้มของคนคนหนึ่ง
 * ถ้ามีการกระทำใหม่เกิดขึ้นแล้วหายเงียบไปจากแฟ้ม จะไม่มีใครรู้ว่าหายไป จึงตกไปที่กรณีสุดท้าย
 * ที่แสดงชื่อ action ดิบ ๆ ให้เห็นแทน
 */
function describe(action: string, details: Details, quoteNo: string | null): Described {
  const quoteLabel = quoteNo ? `ใบเสนอราคา ${quoteNo}` : "ใบเสนอราคา";

  switch (action) {
    case "REGISTER":
      return { kind: "account", title: "สมัครบัญชีด้วยตัวเอง", detail: null };
    case "ACCESS_LINK_REDEEMED":
      return {
        kind: "account",
        title: "ตั้งรหัสผ่านจากลิงก์ที่พนักงานออกให้ และเข้าใช้งานครั้งแรก",
        detail: null,
      };
    case "UPDATE_PROFILE":
      return { kind: "account", title: "แก้ไขข้อมูลส่วนตัว", detail: null };
    case "DELETE_ACCOUNT":
      return { kind: "account", title: "ขอลบบัญชีของตัวเอง", detail: null };

    case "LOGIN_SUCCESS":
      return { kind: "login", title: "เข้าสู่ระบบ", detail: null };
    case "LOGIN_PENDING_2FA":
      return { kind: "login", title: "เข้าสู่ระบบ (รอยืนยันรหัสสองชั้น)", detail: null };

    case "LOGIN_FAILED":
      return { kind: "security", title: "กรอกรหัสผ่านผิด", detail: null };
    case "LOGIN_BLOCKED_LOCKED":
      return {
        kind: "security",
        title: "ถูกล็อกชั่วคราว เพราะกรอกรหัสผ่านผิดหลายครั้ง",
        detail: null,
      };
    case "CHANGE_PASSWORD":
      return { kind: "security", title: "เปลี่ยนรหัสผ่าน", detail: null };
    // เขียนโดย known-device.ts ตอนเข้าจากเครื่องที่บัญชีไม่เคยใช้ (เครื่องแรกของบัญชีไม่นับ)
    case "NEW_DEVICE_LOGIN":
      return { kind: "security", title: "เข้าสู่ระบบจากเครื่องใหม่", detail: str(details, "device") };

    case "CREATE_LEAD":
      return {
        kind: "lead",
        title: "ส่งคำขอเข้ามาทางเว็บไซต์",
        detail: str(details, "serviceType"),
      };

    // ระดับนาที -- แยกชนิดเพื่อให้อ่านเป็นเรื่องราวได้ "เปิดหน้า → เปิด PDF → โหลดแบบ → ตอบรับ"
    case "CUSTOMER_OPEN_QUOTE":
      return {
        kind: "view",
        title: `เปิดดู${quoteLabel}`,
        detail: details.firstView === true ? "ครั้งแรก" : null,
      };
    case "CUSTOMER_OPEN_QUOTE_PDF":
      return {
        kind: "view",
        title: `เปิดไฟล์ PDF ของ${quoteLabel}`,
        detail: details.firstView === true ? "ครั้งแรก" : null,
      };
    case "CUSTOMER_DOWNLOAD_ATTACHMENT":
      return {
        kind: "file",
        title: `ดาวน์โหลดไฟล์แนบของ${quoteLabel}`,
        detail: str(details, "fileName"),
      };

    case "CUSTOMER_RESPOND_QUOTE": {
      const to = str(details, "to");
      const note = str(details, "note");
      if (to === "ACCEPTED") return { kind: "accepted", title: `ยอมรับ${quoteLabel}`, detail: note };
      if (to === "REJECTED") {
        return {
          kind: "rejected",
          title: `ปฏิเสธ${quoteLabel}`,
          detail: note ?? "ไม่ได้ระบุเหตุผล",
        };
      }
      return { kind: "revision", title: `ขอปรับแก้${quoteLabel}`, detail: note };
    }

    case "TRANSITION_PROJECT": {
      const from = str(details, "from");
      const to = str(details, "to");
      return {
        kind: "project",
        title: `สถานะโครงการเปลี่ยนเป็น “${PROJECT_STATUS_LABEL[to ?? ""] ?? to}”`,
        detail: from ? `จาก “${PROJECT_STATUS_LABEL[from] ?? from}”` : null,
      };
    }

    default:
      return { kind: "other", title: action, detail: null };
  }
}

/**
 * ช่องทางเทคนิคของหนึ่งแถว: ไอพี (เฉพาะ OWNER) + ประเภทไอพี + อุปกรณ์ + เครื่องใหม่
 *
 * ไอพีถูกจัดประเภทก่อนส่ง — ไอพีของ Docker/proxy/เครื่องตัวเองต้องไม่ถูกอ่านเป็นไอพีของลูกค้า
 * อุปกรณ์เป็นแบบหยาบ ("Chrome · Windows") ไม่ระบุตัวคน จึงส่งให้พนักงานทุกคน
 */
function technicalFields(
  row: { action: string; ip: string | null; userAgent: string | null },
  includeIp: boolean,
) {
  const ip = includeIp ? classifyIp(row.ip) : null;
  return {
    ip: ip?.address ?? null,
    ipKind: ip?.kind ?? null,
    // ประเทศ/ผู้ให้บริการได้มาจากไอพี จึงเห็นได้เท่ากับไอพี (OWNER เท่านั้น)
    ipGeo: ip ? geoLookup(ip.address) : null,
    device: deviceLabel(row.userAgent),
    newDevice: row.action === "NEW_DEVICE_LOGIN",
  };
}

/**
 * รายชื่อลูกค้าทั้งหมด — สารบัญของแฟ้มลูกค้า
 *
 * ต้องมีเพราะหน้าจัดการผู้ใช้แสดงเฉพาะพนักงาน (OWNER/ADMIN) ลูกค้าจึงไม่เคยถูกลิสต์ที่ไหนเลย
 * ทางเดียวที่เข้าถึงลูกค้าได้คือผ่านโครงการ — ลูกค้าที่ยังไม่มีโครงการจะเข้าไม่ถึงเลยถ้าไม่มีหน้านี้
 * (ตอนเขียนมี 4 จาก 7 คนที่ยังไม่มีโครงการ)
 */
export type CustomerSort = "name" | "createdAt" | "lastLogin";

export interface CustomerDirectoryQuery extends PageRequest {
  q?: string;
  /** ค่าเริ่มต้น "verified" — บัญชีที่สมัครแล้วไม่ยืนยันอีเมลแยกไปอีกมุมมอง ไม่นับเป็นลูกค้า */
  view?: CustomerDirectoryView;
  sort?: CustomerSort;
  dir?: "asc" | "desc";
}

export const CUSTOMER_PAGE_SIZE = 15;
/** เพดานต่อหนึ่งคำขอ — การส่งออกไฟล์วนขอทีละหน้าจนครบ ไม่ใช่ขอก้อนเดียวขนาดไม่จำกัด */
const CUSTOMER_PAGE_SIZE_MAX = 500;

/**
 * ค้นหาที่ฐานข้อมูล ไม่ใช่กรองในเบราว์เซอร์
 *
 * ของเดิมโหลดลูกค้าทุกคนมาแล้วกรองในหน้าจอ ซึ่งทำงานได้ดีตอนมีลูกค้า 7 คน แต่เป็นการโหลด
 * ข้อมูลส่วนบุคคลของทุกคนลงเครื่องพนักงานทุกครั้งที่เปิดหน้า และจะหน่วงเมื่อถึงหลักพัน
 */
function customerWhere(q?: string, view: CustomerDirectoryView = "verified"): Prisma.UserWhereInput {
  const term = q?.trim();
  return {
    role: "CUSTOMER",
    // บัญชีที่สมัครแล้วยังไม่ยืนยันอีเมลอาจพิมพ์อีเมลผิด/อีเมลปลอม เข้าระบบก็ไม่ได้ — แยกออกจาก
    // รายชื่อหลัก (และ CSV ที่ใช้เงื่อนไขเดียวกัน) ไม่ให้พนักงานตามคนที่ไม่มีตัวตนหรือนับเป็นลูกค้า
    ...(view === "unverified" ? UNVERIFIED_SIGNUP : { NOT: UNVERIFIED_SIGNUP }),
    ...(term
      ? {
          OR: [
            { fullName: { contains: term, mode: "insensitive" as const } },
            { email: { contains: term, mode: "insensitive" as const } },
            { customerProfile: { phone: { contains: term } } },
            // ลูกค้านิติบุคคลมักถูกเรียกด้วยชื่อบริษัท ไม่ใช่ชื่อคนที่สมัคร
            { customerProfile: { companyName: { contains: term, mode: "insensitive" as const } } },
            { customerProfile: { taxId: { contains: term } } },
          ],
        }
      : {}),
  };
}

/**
 * ลำดับการเรียง — เรียงได้เฉพาะคอลัมน์ที่อยู่ในตาราง `User` จริง ๆ
 *
 * จำนวนโครงการ/ใบเสนอราคา **เรียงไม่ได้โดยตั้งใจ** เพราะเป็นค่าที่นับจากตารางอื่น การจะเรียง
 * ต้องรวมทั้งตารางก่อนแล้วค่อยตัดหน้า ซึ่งย้อนกลับไปหาปัญหาเดิม (โหลดทุกแถวมาก่อน) หน้าจอ
 * จึงไม่ทำหัวคอลัมน์สองช่องนั้นให้กดได้ แทนที่จะกดแล้วเงียบ
 */
function customerOrderBy(
  sort: CustomerSort | undefined,
  dir: "asc" | "desc" | undefined,
): Prisma.UserOrderByWithRelationInput[] {
  if (!sort) {
    // ค่าเริ่มต้นเดิม: บัญชีที่ยังใช้งานอยู่ก่อน แล้วเรียงคนใหม่สุดขึ้นก่อน
    return [{ active: "desc" }, { createdAt: "desc" }];
  }
  const direction = dir ?? (sort === "name" ? "asc" : "desc");
  if (sort === "name") return [{ fullName: direction }];
  if (sort === "lastLogin") {
    // คนที่ยังไม่เคยเข้าระบบต้องไปท้ายเสมอ ไม่ว่าจะเรียงขึ้นหรือลง — null ไม่ใช่ "เข้าเมื่อนานมาแล้ว"
    return [{ lastLoginAt: { sort: direction, nulls: "last" } }, { fullName: "asc" }];
  }
  return [{ createdAt: direction }, { fullName: "asc" }];
}

/**
 * รายชื่อลูกค้า — สารบัญของแฟ้มลูกค้า
 *
 * ต้องมีเพราะหน้าจัดการผู้ใช้แสดงเฉพาะพนักงาน (OWNER/ADMIN) ลูกค้าจึงไม่เคยถูกลิสต์ที่ไหนเลย
 * ทางเดียวที่เข้าถึงลูกค้าได้คือผ่านโครงการ — ลูกค้าที่ยังไม่มีโครงการจะเข้าไม่ถึงเลยถ้าไม่มีหน้านี้
 * (ตอนเขียนมี 4 จาก 7 คนที่ยังไม่มีโครงการ)
 */
export async function listCustomers(query: CustomerDirectoryQuery = {}) {
  const { page, pageSize, skip, take } = resolvePage(query, CUSTOMER_PAGE_SIZE, CUSTOMER_PAGE_SIZE_MAX);
  const where = customerWhere(query.q, query.view);

  const [total, unverifiedCount, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.count({ where: UNVERIFIED_SIGNUP }),
    prisma.user.findMany({
      where,
      orderBy: customerOrderBy(query.sort, query.dir),
      skip,
      take,
      include: {
        customerProfile: { select: { phone: true, customerType: true, companyName: true } },
      },
    }),
  ]);

  const ids = users.map((u) => u.id);
  if (ids.length === 0) return { items: [], total, unverifiedCount, page, pageSize };

  // นับของ "เฉพาะคนในหน้านี้" ไม่ใช่ของลูกค้าทุกคนในระบบเหมือนเดิม
  const [projects, quoteCounts, purgeable] = await Promise.all([
    prisma.project.findMany({
      where: { customerId: { in: ids }, deletedAt: null },
      select: { id: true, customerId: true },
    }),
    prisma.quote.groupBy({
      by: ["projectId"],
      where: { project: { customerId: { in: ids }, deletedAt: null } },
      _count: { _all: true },
    }),
    // คนในหน้านี้ที่งานล้างรายวันจะลบเมื่อครบกำหนด (ยังไม่ยืนยัน + ไม่มีของที่พนักงานผูกไว้)
    prisma.user.findMany({ where: { id: { in: ids }, ...REPLACEABLE_SIGNUP }, select: { id: true } }),
  ]);
  const purgeableIds = new Set(purgeable.map((u) => u.id));

  const ownerByProject = new Map(projects.map((p) => [p.id, p.customerId]));
  const projectCountByUser = new Map<string, number>();
  for (const row of projects) {
    if (!row.customerId) continue;
    projectCountByUser.set(row.customerId, (projectCountByUser.get(row.customerId) ?? 0) + 1);
  }
  const quoteCountByUser = new Map<string, number>();
  for (const row of quoteCounts) {
    const owner = ownerByProject.get(row.projectId);
    if (!owner) continue;
    quoteCountByUser.set(owner, (quoteCountByUser.get(owner) ?? 0) + row._count._all);
  }

  const items = users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    phone: u.customerProfile?.phone ?? null,
    active: u.active,
    anonymized: isAnonymized(u.email),
    emailVerified: u.emailVerifiedAt !== null,
    purgeAt: purgeableIds.has(u.id) ? purgeDateOf(u.createdAt) : null,
    customerType: u.customerProfile?.customerType ?? "INDIVIDUAL",
    companyName: u.customerProfile?.companyName ?? null,
    projectCount: projectCountByUser.get(u.id) ?? 0,
    quoteCount: quoteCountByUser.get(u.id) ?? 0,
    // อ่านจากคอลัมน์ ไม่ใช่ groupBy บน AuditLog เหมือนเดิม — AuditLog ถูกไล่ลบทุก 1 ปี
    // ค่าที่คำนวณจากมันจึงกลายเป็น "ยังไม่เคยเข้า" เองเมื่อเวลาผ่านไป ทั้งที่ลูกค้าเข้ามาจริง
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }));

  return { items, total, unverifiedCount, page, pageSize };
}

async function getCustomerOrThrow(customerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: customerId },
    include: { customerProfile: true },
  });
  // ไม่ใช่ลูกค้า = ไม่พบ (ไม่บอกว่ามีบัญชีนี้อยู่แต่เป็นพนักงาน)
  if (user?.role !== "CUSTOMER") {
    throw new CustomerFileError("ไม่พบลูกค้าที่ระบุ", 404);
  }
  return user;
}

export async function getCustomerDetail(customerId: string) {
  const user = await getCustomerOrThrow(customerId);

  // ถังขยะ: โครงการที่ถูกลบไม่นับอยู่ในแฟ้ม
  const projects = await prisma.project.findMany({
    where: { customerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      // ราคาสุทธิ = เวอร์ชันล่าสุด (BR-07 ราคาถูก freeze ต่อเวอร์ชัน)
      versions: { orderBy: { versionNo: "desc" }, take: 1, select: { netPrice: true } },
    },
  });

  const quotes = await prisma.quote.findMany({
    where: { project: { customerId, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { project: { select: { id: true, name: true } } },
  });

  // สัญญาผูกกับโครงการ ไม่ได้ผูกกับลูกค้าโดยตรง — ไล่ผ่านโครงการของลูกค้าคนนี้
  const contracts = await prisma.contract.findMany({
    where: { project: { customerId, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      installments: { select: { id: true } },
    },
  });

  // ถังขยะ: คำขอที่ถูกลบไม่นับอยู่ในแฟ้ม
  const leads = await prisma.lead.findMany({
    where: { customerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      houseDesign: { select: { name: true } },
    },
  });

  const notes = await prisma.customerNote.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { id: true, fullName: true } } },
  });

  const lastLogin = await prisma.auditLog.findFirst({
    where: { userId: customerId, action: "LOGIN_SUCCESS" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  // ชื่อที่จะถูกพิมพ์ลงเอกสารจริง — คำนวณจากตัวเดียวกับที่ตัวสร้าง PDF ใช้ ไม่ใช่เดาซ้ำที่หน้าจอ
  // เพื่อให้แฟ้มบอกได้ตรง ๆ ว่า "ใบเสนอราคาจะออกในนามนี้" ก่อนจะกดออกเอกสาร
  const billing = billingPartyOf(user, user.customerProfile);

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    active: user.active,
    anonymized: isAnonymized(user.email),
    createdAt: user.createdAt,
    phone: user.customerProfile?.phone ?? null,
    address: user.customerProfile?.address ?? null,
    customerType: user.customerProfile?.customerType ?? "INDIVIDUAL",
    companyName: user.customerProfile?.companyName ?? null,
    taxId: user.customerProfile?.taxId ?? null,
    branch: user.customerProfile?.branch ?? null,
    contactPerson: user.customerProfile?.contactPerson ?? null,
    billingName: billing.name,
    lastLoginAt: user.lastLoginAt ?? lastLogin?.createdAt ?? null,
    projects: projects.map((p) => ({
      id: p.id,
      projectNo: p.projectNo,
      name: p.name,
      status: p.status,
      netPrice: p.versions[0]?.netPrice.toString() ?? null,
      createdAt: p.createdAt,
    })),
    quotes: quotes.map((q) => ({
      id: q.id,
      projectId: q.project.id,
      projectName: q.project.name,
      quoteNo: q.quoteNo,
      revisionNo: q.revisionNo,
      status: q.status,
      sentAt: q.sentAt,
      respondedAt: q.respondedAt,
      createdAt: q.createdAt,
      firstViewedAt: q.firstViewedAt,
      lastViewedAt: q.lastViewedAt,
      viewCount: q.viewCount,
    })),
    contracts: contracts.map((c) => ({
      id: c.id,
      projectId: c.project.id,
      projectName: c.project.name,
      contractNo: c.contractNo,
      // มูลค่าที่ตรึงไว้ตอนออกสัญญา (ห้ามอ่านจากเวอร์ชันล่าสุดของโครงการ ซึ่งขยับได้ทีหลัง)
      amount: c.amount?.toString() ?? null,
      signedAt: c.signedAt,
      createdAt: c.createdAt,
      // ระบบยังไม่ได้ติดตามการจ่ายเงินรายงวด — บอกได้แค่ "แผนมีกี่งวด" ห้ามแสดงว่าจ่ายไปกี่งวด
      installmentCount: c.installments.length,
    })),
    leads: leads.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      serviceType: l.serviceType,
      status: l.status,
      message: l.message,
      houseDesignName: l.houseDesign?.name ?? null,
      projectId: l.project?.id ?? null,
      projectName: l.project?.name ?? null,
      repliedAt: l.repliedAt,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      authorId: n.createdBy?.id ?? null,
      authorName: n.createdBy?.fullName ?? null,
    })),
  };
}

/**
 * ไทม์ไลน์ของลูกค้ารายนี้ — อ่านจาก AuditLog ที่ระบบเขียนไว้อยู่แล้ว
 *
 * `includeIp` ต้องเป็น true เฉพาะ OWNER เท่านั้น ([[privacy-policy-page]] ประกาศกับลูกค้าว่า
 * เก็บหมายเลขไอพีไว้ตรวจจับการเดารหัสผ่านและตรวจสอบย้อนหลังเมื่อเกิดปัญหา ไม่ใช่ให้พนักงาน
 * ทุกคนเปิดดูได้ทั่วไป)
 */
/** ชนิดเหตุการณ์ที่ผู้ใช้เลือกกรองได้ → ชื่อ action จริงใน AuditLog */
const KIND_ACTIONS: Record<string, string[]> = {
  account: ["REGISTER", "ACCESS_LINK_REDEEMED", "UPDATE_PROFILE", "DELETE_ACCOUNT"],
  login: ["LOGIN_SUCCESS", "LOGIN_PENDING_2FA"],
  security: ["LOGIN_FAILED", "LOGIN_BLOCKED_LOCKED", "CHANGE_PASSWORD", "NEW_DEVICE_LOGIN"],
  lead: ["CREATE_LEAD"],
  view: ["CUSTOMER_OPEN_QUOTE", "CUSTOMER_OPEN_QUOTE_PDF"],
  file: ["CUSTOMER_DOWNLOAD_ATTACHMENT"],
  respond: ["CUSTOMER_RESPOND_QUOTE"],
  project: ["TRANSITION_PROJECT"],
  // งานที่พนักงานทำกับบัญชีลูกค้า — แสดงเฉพาะในแฟ้มรายคน ไม่อยู่ในฟีดรวม (ฟีดคือ "ลูกค้าทำอะไร")
  staff: [
    "UPDATE_CUSTOMER",
    "SUSPEND_CUSTOMER",
    "RESTORE_CUSTOMER",
    "ISSUE_ACCESS_LINK",
    "CREATE_CUSTOMER_FROM_LEAD",
    "CREATE_CUSTOMER_FOR_PROJECT",
  ],
};

export interface ActivityFilter {
  /** ISO date (รวมทั้งวัน) */
  from?: string;
  to?: string;
  /** ชนิดที่เลือก — ว่าง = เอาทั้งหมด */
  kinds?: string[];
  /** ค้นหาในเลขที่ใบเสนอราคา / ชื่อไฟล์ / ชื่อโครงการ */
  q?: string;
}

/** แปลงตัวกรองเป็นเงื่อนไข Prisma — ใช้ร่วมกันทั้งแฟ้มรายคนและฟีดรวมทั้งบริษัท */
function activityWhere(filter: ActivityFilter) {
  const actions = (filter.kinds ?? [])
    .flatMap((k) => KIND_ACTIONS[k] ?? [])
    .filter((a, i, all) => all.indexOf(a) === i);

  // "ถึงวันที่" ต้องครอบคลุมทั้งวันนั้น ไม่ใช่ตัดที่เที่ยงคืนต้นวัน (ไม่งั้นเลือกวันเดียวแล้วได้ 0 แถว)
  const to = filter.to ? new Date(`${filter.to}T23:59:59.999`) : undefined;
  const from = filter.from ? new Date(`${filter.from}T00:00:00.000`) : undefined;

  return {
    ...(actions.length > 0 ? { action: { in: actions } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
}

/**
 * ทุก action ที่ระบบรู้จัก พร้อมข้อความไทยที่ผู้ใช้เห็นจริง
 *
 * ตอนยังไม่แบ่งหน้า การค้นหาทำหลังแปลข้อความ (ดึงมาทั้งก้อนแล้ว filter ในหน่วยความจำ) ซึ่งพอ
 * ย้ายมาแบ่งหน้าที่เซิร์ฟเวอร์แล้วใช้ไม่ได้อีก — ถ้ากรองหลังตัดหน้า หน้าที่ 1 อาจเหลือ 2 แถวทั้งที่
 * ทั้งชุดมี 80 แถวที่ตรง และยอดรวมก็จะผิด **การค้นหาต้องเกิดในคำสั่ง SQL เดียวกับการตัดหน้า**
 *
 * ข้อความไทยไม่ได้ถูกเก็บในฐานข้อมูล (เก็บแค่ชื่อ action) จึงกลับทางกัน: แปลชื่อ action ทุกตัว
 * เป็นข้อความไทยไว้ก่อน แล้วหาว่าคำค้นตรงกับตัวไหน ได้เป็นรายชื่อ action ที่เอาไปกรองใน SQL ได้
 */
const SEARCHABLE_ACTIONS: { action: string; text: string }[] = (() => {
  const staff = new Set(KIND_ACTIONS.staff);
  const all = [...new Set(Object.values(KIND_ACTIONS).flat())];
  return all.map((action) => {
    const described = staff.has(action)
      ? describeStaffAction(action, {}, "")
      : describe(action, {}, null);
    return { action, text: `${described.title} ${described.detail ?? ""}`.toLowerCase() };
  });
})();

/** ช่องใน details ที่เก็บข้อความที่คนอ่านรู้เรื่อง (ที่เหลือเป็น id/ธง ค้นแล้วไม่มีความหมาย) */
const DETAIL_TEXT_KEYS = ["fileName", "quoteNo", "serviceType", "note", "reason"];

/**
 * เงื่อนไข OR สำหรับคำค้นหนึ่งคำ — ทุกข้อต่อไปนี้กรองได้ในฐานข้อมูลจริง
 *
 * ครอบคลุม: ชื่อกิจกรรมภาษาไทย · ชื่อ action ดิบ (เผื่อ action ใหม่ที่ยังไม่มีคำแปล) · เลขที่
 * ใบเสนอราคาและชื่อโครงการ (ต้องแปลงเป็น entityId ก่อน เพราะ AuditLog เก็บแค่ id) · ข้อความ
 * ที่ฝังอยู่ใน details (ชื่อไฟล์ / ประเภทบริการ / หมายเหตุ / เหตุผลที่ระงับบัญชี)
 */
async function textSearchOr(
  raw: string,
  scope: { customerId?: string; includeCustomerNames?: boolean },
): Promise<Prisma.AuditLogWhereInput[]> {
  const q = raw.trim();
  if (!q) return [];
  const lower = q.toLowerCase();

  const actions = SEARCHABLE_ACTIONS.filter((a) => a.text.includes(lower)).map((a) => a.action);

  // โครงการ/ใบเสนอราคาที่ชื่อหรือเลขที่ตรงกับคำค้น → เอา id ไปจับกับ entityId
  const projectScope = scope.customerId ? { customerId: scope.customerId } : {};
  const [projects, quotes] = await Promise.all([
    prisma.project.findMany({
      where: { ...projectScope, OR: [
        { name: { contains: q, mode: "insensitive" } },
        { projectNo: { contains: q, mode: "insensitive" } },
      ] },
      select: { id: true },
      take: 1000,
    }),
    prisma.quote.findMany({
      where: {
        project: projectScope,
        OR: [
          { quoteNo: { contains: q, mode: "insensitive" } },
          { project: { name: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: { id: true },
      take: 1000,
    }),
  ]);
  const entityIds = [...projects.map((r) => r.id), ...quotes.map((r) => r.id)];

  const or: Prisma.AuditLogWhereInput[] = [
    { action: { contains: q, mode: "insensitive" } },
    ...(actions.length > 0 ? [{ action: { in: actions } }] : []),
    ...(entityIds.length > 0 ? [{ entityId: { in: entityIds } }] : []),
    ...DETAIL_TEXT_KEYS.map((key) => ({
      details: { path: [key], string_contains: q },
    })) as Prisma.AuditLogWhereInput[],
  ];

  // ฟีดรวมเท่านั้น — ในแฟ้มรายคน ทุกแถวเป็นของคนเดียวกันอยู่แล้ว ค้นด้วยชื่อตัวเองไม่มีความหมาย
  if (scope.includeCustomerNames) {
    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER", fullName: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 1000,
    });
    if (customers.length > 0) or.push({ userId: { in: customers.map((c) => c.id) } });
  }

  return or;
}

/**
 * ฟีดกิจกรรมของลูกค้าทุกคนรวมกัน (ข้อ 2) — เปิดดูตอนเช้าว่าเมื่อคืนใครทำอะไรบ้าง
 *
 * ใช้เงื่อนไขกรองชุดเดียวกับแฟ้มรายคน แต่เพิ่มตัวกรอง "ลูกค้าคนไหน" และแนบชื่อลูกค้ามาทุกแถว
 * เพราะในฟีดรวมถ้าไม่บอกว่าใครทำ ก็อ่านไม่รู้เรื่อง
 */
export async function listAllCustomerActivity(opts: {
  includeIp: boolean;
  filter?: ActivityFilter & { customerId?: string };
  page?: PageRequest;
}) {
  const filter = opts.filter ?? {};
  const { page, pageSize, skip, take } = resolvePage(
    opts.page,
    ACTIVITY_PAGE_SIZE,
    ACTIVITY_PAGE_SIZE_MAX,
  );

  const textOr = await textSearchOr(filter.q ?? "", {
    customerId: filter.customerId,
    includeCustomerNames: !filter.customerId,
  });

  const where: Prisma.AuditLogWhereInput = {
    user: filter.customerId ? { id: filter.customerId, role: "CUSTOMER" } : { role: "CUSTOMER" },
    ...activityWhere(filter),
    ...(textOr.length > 0 ? { OR: textOr } : {}),
  };

  // นับยอดจริงในคำสั่งเดียวกับที่ตัดหน้า — ตัวเลข "N รายการ" บนหน้าจอจึงเป็นยอดทั้งหมดเสมอ
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { user: { select: { id: true, fullName: true } } },
    }),
  ]);

  const labelOf = await resolveEntityLabels(rows);

  const items = rows.map((row) => {
    const { quote, project } = labelOf(row);
    const details = (row.details ?? {}) as Details;
    const described = describe(row.action, details, quote?.quoteNo ?? str(details, "quoteNo"));
    return {
      id: row.id,
      at: row.createdAt,
      kind: described.kind,
      title: described.title,
      detail: described.detail,
      projectId: quote?.projectId ?? project?.id ?? null,
      projectName: quote?.project.name ?? project?.name ?? null,
      ...technicalFields(row, opts.includeIp),
      actor: { kind: "customer" as const, name: row.user?.fullName ?? null },
      customerId: row.user?.id ?? null,
      customerName: row.user?.fullName ?? null,
    };
  });

  return { items, total, page, pageSize };
}

/**
 * แปลง entityId ของแต่ละแถวเป็นชื่อโครงการ / เลขที่ใบเสนอราคา ด้วยคำสั่งเดียวต่อชนิด
 *
 * AuditLog ไม่มีความสัมพันธ์ไปยัง Quote/Project (เก็บแค่ entityType + entityId เป็นข้อความ)
 * จึง join ในคำสั่งเดียวไม่ได้ ถ้าวนถามทีละแถวจะเป็น N+1 ทันที
 */
async function resolveEntityLabels(rows: { entityType: string; entityId: string | null }[]) {
  const quoteIds = rows.filter((r) => r.entityType === "Quote").map((r) => r.entityId ?? "");
  const projectIds = rows.filter((r) => r.entityType === "Project").map((r) => r.entityId ?? "");

  const [quotes, projects] = await Promise.all([
    quoteIds.length
      ? prisma.quote.findMany({
          where: { id: { in: quoteIds } },
          select: { id: true, quoteNo: true, projectId: true, project: { select: { name: true } } },
        })
      : Promise.resolve([]),
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (row: { entityId: string | null }) => ({
    quote: row.entityId ? quoteById.get(row.entityId) : undefined,
    project: row.entityId ? projectById.get(row.entityId) : undefined,
  });
}

/**
 * "ลูกค้ารายนี้มีปฏิสัมพันธ์กับโครงการนี้ยังไงบ้าง" (ข้อ 3) — ใช้บนหน้ารายละเอียดโครงการ
 *
 * ต่างจากไทม์ไลน์โครงการเดิมตรงที่ **เอาเฉพาะสิ่งที่ลูกค้าทำ** ไม่ปนงานของพนักงาน และเห็นละเอียด
 * ทุกครั้งที่เปิด (ไทม์ไลน์รวมกรองเหลือแค่ครั้งแรก เพื่อไม่ให้กลบหมุดหมายของดีล)
 */
export async function getProjectCustomerActivity(projectId: string, opts: { includeIp: boolean }) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, customerId: true },
  });
  if (!project) throw new CustomerFileError("ไม่พบโครงการที่ระบุ", 404);
  if (!project.customerId) {
    return { customerId: null, customerName: null, activity: [], total: 0 };
  }

  const quotes = await prisma.quote.findMany({
    where: { projectId },
    select: { id: true, quoteNo: true },
  });
  const entityIds = [projectId, ...quotes.map((q) => q.id)];
  const quoteById = new Map(quotes.map((q) => [q.id, q]));

  const where = { userId: project.customerId, entityId: { in: entityIds } };

  // คืนยอดจริงมาด้วย เพื่อให้หน้าจอบอกได้ว่ากำลังแสดงไม่ครบ แทนที่จะตัดทิ้งเงียบ ๆ เหมือนเดิม
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PROJECT_ACTIVITY_LIMIT,
      include: { user: { select: { fullName: true } } },
    }),
  ]);

  return {
    customerId: project.customerId,
    customerName: rows[0]?.user?.fullName ?? null,
    total,
    activity: rows.map((row) => {
      const details = (row.details ?? {}) as Details;
      const quote = row.entityId ? quoteById.get(row.entityId) : undefined;
      const described = describe(row.action, details, quote?.quoteNo ?? str(details, "quoteNo"));
      return {
        id: row.id,
        at: row.createdAt,
        kind: described.kind,
        title: described.title,
        detail: described.detail,
        projectId: project.id,
        projectName: project.name,
        ...technicalFields(row, opts.includeIp),
        actor: { kind: "customer" as const, name: row.user?.fullName ?? null },
      };
    }),
  };
}

export async function getCustomerActivity(
  customerId: string,
  opts: { includeIp: boolean; filter?: ActivityFilter; page?: PageRequest },
) {
  await getCustomerOrThrow(customerId);

  const filter = opts.filter ?? {};
  const { page, pageSize, skip, take } = resolvePage(
    opts.page,
    ACTIVITY_PAGE_SIZE,
    ACTIVITY_PAGE_SIZE_MAX,
  );
  const textOr = await textSearchOr(filter.q ?? "", { customerId });

  const where: Prisma.AuditLogWhereInput = {
    AND: [
      {
        OR: [
          // สิ่งที่ลูกค้าทำเอง
          { userId: customerId },
          // สิ่งที่พนักงานทำ "กับ" ลูกค้ารายนี้ (แก้ข้อมูล ระงับบัญชี ออกลิงก์) — ต้องเห็นในแฟ้มด้วย
          // ไม่งั้นข้อมูลเปลี่ยนหรือบัญชีถูกปิดแล้วไม่มีร่องรอยให้ตรวจสอบย้อนหลัง
          { entityType: "User", entityId: customerId, userId: { not: customerId } },
        ],
      },
      // คำค้นเป็นเงื่อนไขชุดที่สอง ต้อง AND กับชุดแรก ไม่ใช่เอาไปต่อท้าย OR ชุดเดียวกัน —
      // ไม่งั้นคำค้นจะกลายเป็น "หรือ" กับตัวกรองเจ้าของแฟ้ม แล้วลากกิจกรรมของคนอื่นเข้ามาด้วย
      ...(textOr.length > 0 ? [{ OR: textOr }] : []),
    ],
    ...activityWhere(filter),
  };

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { user: { select: { fullName: true } } },
    }),
  ]);

  const labelOf = await resolveEntityLabels(rows);

  const items = rows.map((row) => {
    const { quote, project } = labelOf(row);
    const details = (row.details ?? {}) as Details;
    // แถวที่ userId ไม่ใช่ลูกค้า = พนักงานเป็นคนทำ (ผู้ทำอยู่ใน row.user ไม่ใช่เจ้าของแฟ้ม)
    const described =
      row.userId === customerId
        ? describe(row.action, details, quote?.quoteNo ?? str(details, "quoteNo"))
        : describeStaffAction(row.action, details, row.user?.fullName ?? "พนักงาน");

    return {
      id: row.id,
      at: row.createdAt,
      kind: described.kind,
      title: described.title,
      detail: described.detail,
      projectId: quote?.projectId ?? project?.id ?? null,
      projectName: quote?.project.name ?? project?.name ?? null,
      ...technicalFields(row, opts.includeIp),
      actor: {
        kind: row.userId === customerId ? ("customer" as const) : ("staff" as const),
        name: row.user?.fullName ?? null,
      },
    };
  });

  return { items, total, page, pageSize };
}

// ---------- งานที่พนักงานทำกับบัญชีลูกค้า ----------
//
// ก่อนหน้านี้โมดูลนี้เป็น GET ล้วน แฟ้มลูกค้าจึงดูได้อย่างเดียว: ลูกค้าโทรมาเปลี่ยนเบอร์ พนักงานทำ
// อะไรไม่ได้ · ลืมรหัสผ่านแล้วยังไม่มีโครงการก็ออกลิงก์ให้ไม่ได้ (ของเดิมผูกกับ /projects/:id) ·
// ระงับบัญชีก็ไม่ได้เพราะ setStaffActive กรองเฉพาะ OWNER/ADMIN เท่านั้น
//
// นโยบายความเป็นส่วนตัวที่ประกาศกับลูกค้าไว้แล้ว (ข้อ 9) สัญญาว่าลูกค้า "ขอให้แก้ไขข้อมูลที่ไม่ถูกต้อง"
// และ "ขอให้ระงับการใช้ข้อมูลชั่วคราว" ได้ภายใน 30 วัน — สามฟังก์ชันนี้คือเครื่องมือที่ทำให้ทำได้จริง

interface ActorMeta {
  actorId: string;
  /** ใช้ตัดสินว่าแก้/ลบบันทึกของคนอื่นได้ไหม (OWNER ได้ คนอื่นได้เฉพาะของตัวเอง) */
  actorRole: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * บัญชีที่ลูกค้าใช้สิทธิ์ขอลบข้อมูลไปแล้ว ห้ามแตะทุกกรณี
 *
 * เขียนข้อมูลติดต่อกลับเข้าไป = เอาข้อมูลส่วนบุคคลที่ลบไปแล้วกลับมา (ผิดเจตนาของคำขอลบ)
 * ออกลิงก์เข้าใช้ = ปลุกบัญชีที่เจ้าตัวสั่งปิดให้กลับมาใช้ได้อีก
 */
async function loadLiveCustomer(customerId: string) {
  const user = await getCustomerOrThrow(customerId);
  if (isAnonymized(user.email)) {
    throw new CustomerFileError("บัญชีนี้ถูกลบตามคำขอของลูกค้าแล้ว แก้ไขหรือเปิดใช้งานใหม่ไม่ได้", 400);
  }
  return user;
}

/** แก้ข้อมูลติดต่อ — ส่งมาเฉพาะช่องที่แก้ ("" = ล้างค่าให้ว่าง) */
export async function updateCustomerContact(
  customerId: string,
  input: UpdateCustomerInput,
  meta: ActorMeta,
) {
  const user = await loadLiveCustomer(customerId);
  const profile = user.customerProfile;

  const changed: string[] = [];
  if (input.fullName !== undefined && input.fullName !== user.fullName) changed.push("fullName");

  // ช่องว่างในโปรไฟล์เก็บเป็น null ไม่ใช่ "" — ส่ง "" มาแปลว่า "ล้างค่า" ส่วนไม่ส่งมาเลย = ไม่แตะ
  const blank = (value: string | undefined) => (value !== undefined ? value || null : undefined);
  const next = {
    phone: blank(input.phone),
    address: blank(input.address),
    customerType: input.customerType,
    companyName: blank(input.companyName),
    taxId: blank(input.taxId),
    branch: blank(input.branch),
    contactPerson: blank(input.contactPerson),
  };

  const current: Record<string, unknown> = {
    phone: profile?.phone ?? null,
    address: profile?.address ?? null,
    customerType: profile?.customerType ?? "INDIVIDUAL",
    companyName: profile?.companyName ?? null,
    taxId: profile?.taxId ?? null,
    branch: profile?.branch ?? null,
    contactPerson: profile?.contactPerson ?? null,
  };

  const profileData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) continue;
    profileData[key] = value;
    if (value !== current[key]) changed.push(key);
  }

  // ตรวจ "สถานะปลายทาง" ไม่ใช่ตรวจเฉพาะช่องที่ส่งมา — ติ๊กว่าเป็นนิติบุคคลได้ก็ต่อเมื่อผลลัพธ์
  // มีชื่อนิติบุคคลอยู่จริง ไม่งั้นเอกสารจะออกในนามชื่อคน ทั้งที่ระบบบอกว่าคู่สัญญาเป็นบริษัท
  const finalType = next.customerType ?? current.customerType;
  const finalCompanyName = next.companyName !== undefined ? next.companyName : current.companyName;
  if (finalType === "COMPANY" && !finalCompanyName) {
    throw new CustomerFileError("ผู้ว่าจ้างเป็นนิติบุคคล ต้องกรอกชื่อนิติบุคคลด้วย", 400);
  }

  if (changed.length === 0) return getCustomerDetail(customerId);

  await prisma.$transaction(async (tx) => {
    if (input.fullName !== undefined) {
      await tx.user.update({ where: { id: customerId }, data: { fullName: input.fullName } });
    }
    if (Object.keys(profileData).length > 0) {
      // ลูกค้าบางคนยังไม่มีแถวโปรไฟล์ (สมัครก่อนที่จะมีช่องที่อยู่) — upsert ไม่ใช่ update
      await tx.customerProfile.upsert({
        where: { userId: customerId },
        create: { userId: customerId, ...profileData },
        update: profileData,
      });
    }
  });

  // บันทึก "ช่องไหนถูกแก้" ไม่ใช่ "ค่าเก่า/ค่าใหม่" — AuditLog เก็บ 1 ปีและอ่านได้กว้างกว่าตัวโปรไฟล์
  // การยัดเบอร์โทรเก่าลงไปเท่ากับทำสำเนาข้อมูลส่วนบุคคลเพิ่มอีกชุดโดยไม่จำเป็น
  await writeAuditLog({
    userId: meta.actorId,
    action: "UPDATE_CUSTOMER",
    entityType: "User",
    entityId: customerId,
    details: { fields: changed },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return getCustomerDetail(customerId);
}

/**
 * ระงับ / เปิดใช้งานบัญชีลูกค้า
 *
 * ระงับแล้วต้องเตะออกจากระบบทันที ไม่ใช่รอ session หมดอายุเอง — ใช้วิธีเดียวกับบัญชีพนักงาน
 * (`sessionVersion` +1 ทำให้คุกกี้ที่ถืออยู่ใช้ไม่ได้ทุกเครื่อง) เปิดคืนไม่ต้องแตะ session
 */
export async function setCustomerActive(
  customerId: string,
  input: SetCustomerActiveInput,
  meta: ActorMeta,
) {
  const user = await loadLiveCustomer(customerId);
  if (user.active === input.active) return getCustomerDetail(customerId);

  await prisma.user.update({
    where: { id: customerId },
    data: {
      active: input.active,
      ...(input.active ? {} : { sessionVersion: { increment: 1 } }),
    },
  });

  await writeAuditLog({
    userId: meta.actorId,
    action: input.active ? "RESTORE_CUSTOMER" : "SUSPEND_CUSTOMER",
    entityType: "User",
    entityId: customerId,
    details: input.reason ? { reason: input.reason } : undefined,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return getCustomerDetail(customerId);
}

/**
 * ออกลิงก์ตั้งรหัสผ่าน/เข้าใช้งานให้ลูกค้า โดยไม่ต้องมีโครงการ
 *
 * ของเดิมออกได้ทางเดียวคือ `POST /api/projects/:id/customer-access-link` ซึ่งต้องมีโครงการก่อน
 * ลูกค้าที่ยังไม่มีโครงการแล้วลืมรหัสผ่านจึงช่วยอะไรไม่ได้เลย (ระบบยังไม่มี "ลืมรหัสผ่าน" ด้วยตัวเอง)
 *
 * ระบบไม่ส่งอีเมล — คืน url มาให้พนักงานคัดลอกส่งเองทาง LINE/โทร เหมือนทางเดิมทุกอย่าง
 */
export async function issueAccessLinkForCustomer(customerId: string, meta: ActorMeta) {
  const user = await loadLiveCustomer(customerId);
  if (!user.active) {
    throw new CustomerFileError("บัญชีนี้ถูกระงับอยู่ ต้องเปิดใช้งานก่อนจึงจะออกลิงก์ได้", 400);
  }

  const { url, expiresAt } = await issueAccessTokenFor(customerId, meta.actorId);

  await writeAuditLog({
    userId: meta.actorId,
    action: "ISSUE_ACCESS_LINK",
    entityType: "User",
    entityId: customerId,
    details: { fromCustomerFile: true },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { url, expiresAt };
}

// ---------- บันทึกการติดต่อ ----------
//
// สิ่งเดียวในแฟ้มที่ "คนพิมพ์เอง" — ที่เหลืออ่านจากสิ่งที่ระบบบันทึกไว้อยู่แล้ว
// ตัวเนื้อบันทึกไม่ลง AuditLog ด้วยเหตุผลเดียวกับเบอร์โทร: เป็นข้อมูลส่วนบุคคล และ AuditLog
// อ่านได้กว้างกว่า ลบไม่ได้ และเก็บ 1 ปี — บันทึกจึงลงแค่ว่า "ใครทำอะไรกับบันทึกไหน"

/** บันทึกที่มีอยู่จริง และเป็นของลูกค้ารายนี้ (กันยิง noteId ของคนอื่นมาที่ path ของเรา) */
async function loadNoteOrThrow(customerId: string, noteId: string) {
  const note = await prisma.customerNote.findUnique({ where: { id: noteId } });
  if (note?.customerId !== customerId) {
    throw new CustomerFileError("ไม่พบบันทึกที่ระบุ", 404);
  }
  return note;
}

/**
 * แก้/ลบได้เฉพาะคนเขียนเอง หรือ OWNER
 *
 * ไม่ให้แอดมินคนอื่นแก้ของกันเอง เพราะบันทึกเป็น "คำพูดของคนเขียน" — ถ้าใครก็แก้ได้
 * ก็อ่านไม่ได้อีกต่อไปว่าใครบันทึกอะไรไว้จริง
 */
function assertCanEditNote(note: { createdById: string | null }, meta: ActorMeta) {
  if (meta.actorRole === "OWNER") return;
  if (note.createdById && note.createdById === meta.actorId) return;
  throw new CustomerFileError("แก้ไขหรือลบได้เฉพาะบันทึกที่ตัวเองเขียน", 403);
}

export async function addCustomerNote(customerId: string, body: string, meta: ActorMeta) {
  await loadLiveCustomer(customerId);

  const note = await prisma.customerNote.create({
    data: { customerId, body, createdById: meta.actorId },
  });

  await writeAuditLog({
    userId: meta.actorId,
    action: "CREATE_CUSTOMER_NOTE",
    entityType: "User",
    entityId: customerId,
    details: { noteId: note.id },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return getCustomerDetail(customerId);
}

export async function updateCustomerNote(
  customerId: string,
  noteId: string,
  body: string,
  meta: ActorMeta,
) {
  await loadLiveCustomer(customerId);
  const note = await loadNoteOrThrow(customerId, noteId);
  assertCanEditNote(note, meta);

  await prisma.customerNote.update({ where: { id: noteId }, data: { body } });

  await writeAuditLog({
    userId: meta.actorId,
    action: "UPDATE_CUSTOMER_NOTE",
    entityType: "User",
    entityId: customerId,
    details: { noteId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return getCustomerDetail(customerId);
}

export async function deleteCustomerNote(customerId: string, noteId: string, meta: ActorMeta) {
  await loadLiveCustomer(customerId);
  const note = await loadNoteOrThrow(customerId, noteId);
  assertCanEditNote(note, meta);

  await prisma.customerNote.delete({ where: { id: noteId } });

  await writeAuditLog({
    userId: meta.actorId,
    action: "DELETE_CUSTOMER_NOTE",
    entityType: "User",
    entityId: customerId,
    details: { noteId },
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return getCustomerDetail(customerId);
}
