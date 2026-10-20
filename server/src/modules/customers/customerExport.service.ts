import { IP_KIND_LABEL } from "@systemboq/shared-types";

import { isAnonymized } from "../../lib/anonymized";
import { billingPartyOf } from "../../lib/billing-party";
import { writeAuditLog } from "../../lib/audit-log";
import { csvDate, csvDateTime, toCsv } from "../../lib/csv";
import { prisma } from "../../lib/prisma";
import {
  CustomerFileError,
  getCustomerDetail,
  listAllCustomerActivity,
  listCustomers,
  type ActivityFilter,
  type CustomerDirectoryQuery,
} from "./customerFile.service";

/**
 * ส่งออกข้อมูลลูกค้าเป็นไฟล์
 *
 * มีสองเรื่องที่ดูคล้ายกันแต่คนละวัตถุประสงค์ และต้องคุมสิทธิ์คนละแบบ:
 *
 * 1. **ไฟล์ทำงาน (CSV)** — เอารายชื่อ/กิจกรรมที่กรองไว้บนหน้าจอไปทำต่อใน Excel
 *    (ทำรายงาน ส่งให้บัญชี ตรวจยอด) OWNER + ADMIN ใช้ได้ตามปกติ
 *
 * 2. **สำเนาข้อมูลส่วนบุคคล (JSON)** — ตอบคำขอตามสิทธิ์ใน พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล
 *    [หน้านโยบายข้อ 9](client-app/src/pages/PrivacyPage.tsx) ประกาศไว้กับลูกค้าแล้วว่า
 *    "ขอรับสำเนาข้อมูลที่เก็บไว้" และ "ขอให้โอนข้อมูลในรูปแบบที่อ่านได้ด้วยเครื่อง" ได้ภายใน
 *    30 วัน — ก่อนหน้านี้ระบบไม่มีเครื่องมือทำเรื่องนี้เลย คำสัญญาบนหน้าเว็บจึงยังทำไม่ได้จริง
 *    **OWNER เท่านั้น** เพราะไฟล์รวมหมายเลขไอพีทุกครั้งที่เข้าระบบ ซึ่งกฎของระบบไม่ให้ ADMIN เห็น
 */

/**
 * เพดานจำนวนแถวต่อไฟล์
 *
 * ชน = **ปฏิเสธพร้อมบอกวิธีแก้** ไม่ใช่ตัดท้ายทิ้งเงียบ ๆ ไฟล์ส่งออกที่ขาดหายโดยไม่มีใครรู้
 * อันตรายกว่าไฟล์ที่ดาวน์โหลดไม่ได้ เพราะมันถูกเอาไปใช้ต่อในฐานะ "ข้อมูลทั้งหมด"
 */
const EXPORT_ROW_LIMIT = 20_000;
const EXPORT_CHUNK = 500;

const TYPE_LABEL: Record<string, string> = {
  INDIVIDUAL: "บุคคลธรรมดา",
  COMPANY: "นิติบุคคล",
};

function statusLabel(row: { active: boolean; anonymized: boolean }): string {
  if (row.anonymized) return "ลบบัญชีแล้วตามคำขอของลูกค้า";
  return row.active ? "ใช้งานอยู่" : "ระงับการใช้งาน";
}

/** ดึงทุกแถวที่ตรงตัวกรอง โดยวนขอทีละหน้า — ไม่ยิงคำสั่งเดียวขนาดไม่จำกัดใส่ฐานข้อมูล */
async function collectAll<T>(
  total: (first: { total: number }) => number,
  fetchPage: (page: number) => Promise<{ items: T[]; total: number }>,
  what: string,
): Promise<T[]> {
  const first = await fetchPage(1);
  if (total(first) > EXPORT_ROW_LIMIT) {
    throw new CustomerFileError(
      `${what}มี ${first.total.toLocaleString("th-TH")} แถว เกินที่ส่งออกได้ครั้งละ ${EXPORT_ROW_LIMIT.toLocaleString("th-TH")} แถว — กรุณาแคบตัวกรอง (เช่น จำกัดช่วงวันที่) แล้วส่งออกทีละชุด`,
      400,
    );
  }

  const out = [...first.items];
  const pages = Math.ceil(first.total / EXPORT_CHUNK);
  for (let page = 2; page <= pages; page += 1) {
    out.push(...(await fetchPage(page)).items);
  }
  return out;
}

/** รายชื่อลูกค้าตามตัวกรองเดียวกับที่เห็นบนหน้าจอ */
export async function buildCustomerDirectoryCsv(
  query: CustomerDirectoryQuery,
  actor: { actorId: string; ip?: string | null; userAgent?: string | null },
): Promise<string> {
  const rows = await collectAll(
    (first) => first.total,
    (page) => listCustomers({ ...query, page, pageSize: EXPORT_CHUNK }),
    "รายชื่อลูกค้าที่ตรงตัวกรอง",
  );

  // การส่งออกข้อมูลส่วนบุคคลออกนอกระบบต้องมีร่องรอยเสมอว่าใครเอาไปเมื่อไร กี่แถว
  // บันทึกเฉพาะ "จำนวนแถว + คำค้น" ไม่บันทึกตัวข้อมูล (กฎเดียวกับตอนแก้เบอร์โทร)
  await writeAuditLog({
    userId: actor.actorId,
    action: "EXPORT_CUSTOMERS",
    entityType: "User",
    details: { rows: rows.length, q: query.q?.trim() || null },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  return toCsv(
    [
      "ชื่อ-นามสกุล",
      "อีเมล",
      "เบอร์โทร",
      "ประเภทผู้ว่าจ้าง",
      "ชื่อนิติบุคคล",
      "สถานะบัญชี",
      "จำนวนโครงการ",
      "จำนวนใบเสนอราคา",
      "เข้าระบบล่าสุด",
      "เป็นลูกค้าตั้งแต่",
    ],
    rows.map((c) => [
      c.fullName,
      c.email,
      c.phone,
      TYPE_LABEL[c.customerType] ?? c.customerType,
      c.companyName,
      statusLabel(c),
      c.projectCount,
      c.quoteCount,
      csvDateTime(c.lastLoginAt),
      csvDate(c.createdAt),
    ]),
  );
}

/** ฟีดกิจกรรมตามตัวกรองเดียวกับที่เห็นบนหน้าจอ */
export async function buildCustomerActivityCsv(
  opts: {
    includeIp: boolean;
    filter: ActivityFilter & { customerId?: string };
  },
  actor: { actorId: string; ip?: string | null; userAgent?: string | null },
): Promise<string> {
  const rows = await collectAll(
    (first) => first.total,
    (page) =>
      listAllCustomerActivity({
        includeIp: opts.includeIp,
        filter: opts.filter,
        page: { page, pageSize: EXPORT_CHUNK },
      }),
    "กิจกรรมที่ตรงตัวกรอง",
  );

  await writeAuditLog({
    userId: actor.actorId,
    action: "EXPORT_CUSTOMER_ACTIVITY",
    entityType: "User",
    entityId: opts.filter.customerId ?? null,
    details: { rows: rows.length, withIp: opts.includeIp },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  // คอลัมน์ไอพีมีเฉพาะไฟล์ที่ OWNER เป็นคนโหลด — ADMIN ได้ไฟล์ที่ไม่มีคอลัมน์นั้นเลย
  // (ถ้าใส่คอลัมน์ว่างไว้ จะอ่านว่า "ไม่มีข้อมูลไอพี" ซึ่งไม่จริง)
  const headers = ["เวลา", "ลูกค้า", "กิจกรรม", "รายละเอียด", "โครงการ", "อุปกรณ์"];
  // ประเภทไอพีไปคู่กับไอพีเสมอ — ไม่งั้นไอพีของ Docker/เครื่องตัวเองในไฟล์จะถูกอ่านเป็นของลูกค้า
  if (opts.includeIp) headers.push("IP", "ประเภท IP", "ประเทศ", "ผู้ให้บริการ");

  return toCsv(
    headers,
    rows.map((r) => {
      const row: unknown[] = [
        csvDateTime(r.at),
        r.customerName,
        r.title,
        r.detail,
        r.projectName,
        r.newDevice ? `${r.device ?? "ไม่ทราบอุปกรณ์"} (เครื่องใหม่)` : r.device,
      ];
      if (opts.includeIp) {
        row.push(r.ip, r.ipKind ? (IP_KIND_LABEL[r.ipKind] ?? "สาธารณะ") : null, r.ipGeo?.country, r.ipGeo?.network);
      }
      return row;
    }),
  );
}

export interface DataPackageOptions {
  /**
   * รวมบันทึกการติดต่อที่พนักงานเขียนถึงลูกค้ารายนี้ไหม
   *
   * ค่าเริ่มต้นคือ **รวม** เพราะมันคือข้อมูลส่วนบุคคลของลูกค้าเช่นกัน การตัดออกเงียบ ๆ ทำให้
   * ไฟล์ที่ชื่อว่า "สำเนาข้อมูลของคุณ" ไม่จริง · กฎหมายเปิดช่องให้ปฏิเสธได้ถ้ากระทบสิทธิของ
   * คนอื่น การตัดออกจึงเป็นสิทธิ์ของเจ้าของระบบ แต่ **ไฟล์จะระบุไว้ตรง ๆ ว่าตัดออก**
   */
  includeNotes: boolean;
}

/**
 * สำเนาข้อมูลส่วนบุคคลของลูกค้าหนึ่งราย — JSON ที่ทั้งคนอ่านได้และเครื่องอ่านได้
 *
 * JSON ตอบโจทย์ "รูปแบบที่อ่านได้ด้วยเครื่อง" ในนโยบายตรง ๆ (CSV ตอบไม่ได้ เพราะข้อมูลชุดนี้
 * เป็นหลายตารางซ้อนกัน ไม่ใช่ตารางเดียว) ส่วนหัวข้อ `เกี่ยวกับไฟล์นี้` เขียนเป็นภาษาไทยไว้ให้
 * ลูกค้าที่เปิดอ่านเองรู้ว่ากำลังดูอะไร มีอะไร และ**ไม่มี**อะไร
 */
export async function buildCustomerDataPackage(
  customerId: string,
  options: DataPackageOptions,
  actor: { actorId: string; actorName: string; ip?: string | null; userAgent?: string | null },
) {
  const customer = await getCustomerDetail(customerId);

  const profile = await prisma.customerProfile.findUnique({ where: { userId: customerId } });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: customerId },
    select: { fullName: true, email: true, active: true, createdAt: true, lastLoginAt: true },
  });
  const billing = billingPartyOf(user, profile);

  // เอากิจกรรมทั้งหมดของลูกค้ารายนี้ รวมไอพี — เป็นไอพีของตัวเขาเอง การให้เจ้าตัวดูข้อมูลของ
  // ตัวเองคือจุดประสงค์ของสิทธิ์ข้อนี้ (ปลายทางถูกจำกัดไว้ที่ OWNER อยู่แล้วที่ชั้น route)
  const activity = await collectAll(
    (first) => first.total,
    (page) =>
      listAllCustomerActivity({
        includeIp: true,
        filter: { customerId },
        page: { page, pageSize: EXPORT_CHUNK },
      }),
    "กิจกรรมของลูกค้ารายนี้",
  );

  await writeAuditLog({
    userId: actor.actorId,
    action: "EXPORT_CUSTOMER_DATA",
    entityType: "User",
    entityId: customerId,
    details: { includeNotes: options.includeNotes, activityRows: activity.length },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });

  const excluded = [
    "รหัสผ่าน — ระบบเก็บไว้ในรูปที่ถอดกลับเป็นรหัสเดิมไม่ได้ จึงส่งสำเนาให้ไม่ได้",
    "ไฟล์แนบที่ทำเครื่องหมายว่าเป็นเอกสารภายในของบริษัท",
    "บันทึกการทำงานของพนักงานที่ไม่เกี่ยวกับข้อมูลของท่าน",
  ];
  if (!options.includeNotes) {
    excluded.push("บันทึกการติดต่อภายในของพนักงาน — ผู้ควบคุมข้อมูลเลือกไม่รวมในสำเนาฉบับนี้");
  }

  return {
    เกี่ยวกับไฟล์นี้: {
      คำอธิบาย:
        "สำเนาข้อมูลส่วนบุคคลที่บริษัทเก็บไว้เกี่ยวกับท่าน ออกตามสิทธิ์ในพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล",
      เจ้าของข้อมูล: user.fullName,
      อีเมล: user.email,
      ออกเมื่อ: new Date().toISOString(),
      ออกโดย: actor.actorName,
      รูปแบบ: "JSON (UTF-8) — เปิดอ่านได้ด้วยโปรแกรมอ่านข้อความทั่วไป และนำเข้าระบบอื่นได้",
      สิ่งที่ไม่รวมอยู่ในไฟล์นี้: excluded,
    },
    บัญชีผู้ใช้: {
      ชื่อ: user.fullName,
      อีเมล: user.email,
      สถานะ: statusLabel({ active: user.active, anonymized: isAnonymized(user.email) }),
      สมัครเมื่อ: user.createdAt.toISOString(),
      เข้าระบบล่าสุด: user.lastLoginAt?.toISOString() ?? null,
    },
    ข้อมูลติดต่อ: {
      เบอร์โทร: profile?.phone ?? null,
      ที่อยู่: profile?.address ?? null,
      ประเภทผู้ว่าจ้าง: TYPE_LABEL[profile?.customerType ?? "INDIVIDUAL"],
      ชื่อนิติบุคคล: profile?.companyName ?? null,
      เลขประจำตัวผู้เสียภาษี: profile?.taxId ?? null,
      สำนักงานสาขา: profile?.branch ?? null,
      ผู้ประสานงาน: profile?.contactPerson ?? null,
      ชื่อที่ใช้บนเอกสาร: billing.name,
    },
    คำขอที่ส่งเข้ามา: customer.leads,
    โครงการ: customer.projects,
    ใบเสนอราคา: customer.quotes,
    สัญญา: customer.contracts,
    บันทึกการติดต่อของพนักงาน: options.includeNotes ? customer.notes : null,
    ประวัติการใช้งาน: activity.map((a) => ({
      เวลา: a.at,
      เหตุการณ์: a.title,
      รายละเอียด: a.detail,
      โครงการ: a.projectName,
      หมายเลขไอพี: a.ip,
    })),
  };
}
