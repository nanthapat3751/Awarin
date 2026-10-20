import { Router } from "express";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { contentDisposition } from "../../lib/csv";
import {
  buildCustomerActivityCsv,
  buildCustomerDataPackage,
  buildCustomerDirectoryCsv,
} from "./customerExport.service";
import {
  addCustomerNote,
  CustomerFileError,
  deleteCustomerNote,
  getCustomerActivity,
  getCustomerDetail,
  issueAccessLinkForCustomer,
  listAllCustomerActivity,
  listCustomers,
  setCustomerActive,
  updateCustomerContact,
  updateCustomerNote,
  type ActivityFilter,
  type CustomerDirectoryQuery,
  type PageRequest,
} from "./customerFile.service";
import {
  customerDirectoryQuerySchema,
  customerNoteSchema,
  pageQuerySchema,
  setCustomerActiveSchema,
  updateCustomerSchema,
} from "./customers.schemas";
import { searchCustomers } from "./customers.service";

export const customersRouter = Router();

customersRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

customersRouter.get("/", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const customers = await searchCustomers(q);
  res.json({ customers });
});

/** ผู้ทำรายการ + ที่มาของคำขอ — แนบไปกับ AuditLog ทุกครั้งที่เขียนข้อมูล */
function actorMeta(req: import("express").Request) {
  return {
    actorId: req.user!.id,
    actorRole: req.user!.role,
    ip: req.ip ?? null,
    userAgent: req.headers["user-agent"] ?? null,
  };
}

function handle(err: unknown, res: import("express").Response): void {
  if (err instanceof CustomerFileError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  throw err;
}

/** อ่านตัวกรองจาก query string — ใช้ร่วมกันทั้งฟีดรวมและแฟ้มรายคน */
function readFilter(req: import("express").Request): ActivityFilter {
  const one = (k: string) => (typeof req.query[k] === "string" ? (req.query[k] as string) : undefined);
  const kinds = one("kinds");
  return {
    from: one("from"),
    to: one("to"),
    q: one("q"),
    kinds: kinds ? kinds.split(",").filter(Boolean) : undefined,
  };
}

/** หน้าที่เท่าไร หน้าละกี่แถว — ค่าที่ผิดรูปแบบตกกลับไปใช้ค่าเริ่มต้น ไม่ทำให้คำขอพัง */
function readPage(req: import("express").Request): PageRequest {
  return pageQuerySchema.parse(req.query);
}

/**
 * คำค้น/ตัวเรียงของสารบัญลูกค้า — ค่าที่ผิดกฎ (เช่น คำค้นยาวเกิน 200 ตัว) ตอบ 400 พร้อมเหตุผล
 * เดิมใช้ .parse() ซึ่งโยน ZodError ออกไปเป็น 500 "ระบบล่ม" (BUG-API-004) · คืน null = ตอบ 400 ไปแล้ว
 */
function readDirectoryQuery(
  req: import("express").Request,
  res: import("express").Response,
): CustomerDirectoryQuery | null {
  const parsed = customerDirectoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const tooLong = parsed.error.issues.some((i) => i.code === "too_big" && i.path[0] === "q");
    res.status(400).json({ error: tooLong ? "คำค้นยาวเกิน 200 ตัวอักษร" : "เงื่อนไขค้นหาไม่ถูกต้อง" });
    return null;
  }
  return parsed.data;
}

/** ส่งไฟล์ให้เบราว์เซอร์บันทึก พร้อมชื่อไฟล์ภาษาไทยที่อ่านออก */
function sendFile(
  res: import("express").Response,
  body: string,
  contentType: string,
  fileName: string,
): void {
  res.setHeader("Content-Type", `${contentType}; charset=utf-8`);
  res.setHeader("Content-Disposition", contentDisposition(fileName, fileName));
  res.send(body);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------- ปลายทางที่ต้องประกาศก่อน "/:id" ----------
//
// Express จับคู่ตามลำดับที่ประกาศ ถ้าปล่อยให้ "/:id" มาก่อน คำว่า "directory" หรือ "activity"
// จะถูกอ่านเป็นรหัสลูกค้าแล้วตอบ 404 เสมอ

// ฟีดกิจกรรมของลูกค้าทุกคนรวมกัน
customersRouter.get("/activity", async (req, res) => {
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  const result = await listAllCustomerActivity({
    includeIp: req.user!.role === "OWNER",
    filter: { ...readFilter(req), customerId },
    page: readPage(req),
  });
  // คงชื่อ `activity` ไว้เป็นตัวรายการ แล้วแนบยอดจริง/หน้าปัจจุบันมาด้วย
  res.json({ activity: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
});

// ฟีดกิจกรรมในรูปไฟล์ — ตัวกรองชุดเดียวกับที่เห็นบนหน้าจอเป๊ะ ๆ
customersRouter.get("/activity.csv", async (req, res) => {
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  try {
    const csv = await buildCustomerActivityCsv(
      {
        // คอลัมน์ไอพีมีเฉพาะไฟล์ที่ OWNER โหลด — กฎเดียวกับบนหน้าจอ
        includeIp: req.user!.role === "OWNER",
        filter: { ...readFilter(req), customerId },
      },
      actorMeta(req),
    );
    sendFile(res, csv, "text/csv", `กิจกรรมลูกค้า-${stamp()}.csv`);
  } catch (err) {
    handle(err, res);
  }
});

// รายชื่อลูกค้าทั้งหมด (สารบัญของแฟ้ม) — แบ่งหน้า/เรียง/ค้นหาที่เซิร์ฟเวอร์
customersRouter.get("/directory", async (req, res) => {
  const query = readDirectoryQuery(req, res);
  if (!query) return;
  const result = await listCustomers(query);
  res.json({
    customers: result.items,
    unverifiedCount: result.unverifiedCount,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
});

customersRouter.get("/directory.csv", async (req, res) => {
  try {
    const query = readDirectoryQuery(req, res);
    if (!query) return;
    const csv = await buildCustomerDirectoryCsv(query, actorMeta(req));
    sendFile(res, csv, "text/csv", `รายชื่อลูกค้า-${stamp()}.csv`);
  } catch (err) {
    handle(err, res);
  }
});

// แฟ้มลูกค้า — ข้อมูลติดต่อ + โครงการ + ใบเสนอราคาพร้อมสถานะการเปิดดู
customersRouter.get("/:id", async (req, res) => {
  try {
    const customer = await getCustomerDetail(req.params.id);
    res.json({ customer });
  } catch (err) {
    handle(err, res);
  }
});

// ไทม์ไลน์กิจกรรมของลูกค้ารายนี้
//
// หมายเลขไอพีส่งให้เฉพาะ OWNER — ADMIN ได้ null (ดูเหตุผลใน customerFile.service.ts)
customersRouter.get("/:id/activity", async (req, res) => {
  try {
    const result = await getCustomerActivity(req.params.id, {
      includeIp: req.user!.role === "OWNER",
      filter: readFilter(req),
      page: readPage(req),
    });
    res.json({
      activity: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  } catch (err) {
    handle(err, res);
  }
});

/**
 * สำเนาข้อมูลส่วนบุคคลของลูกค้ารายนี้ (PDPA) — **OWNER เท่านั้น**
 *
 * ไฟล์รวมหมายเลขไอพีทุกครั้งที่ลูกค้าเข้าระบบ ซึ่งเป็นข้อมูลที่ระบบตั้งใจไม่ให้ ADMIN เห็นบนหน้าจอ
 * ถ้าปล่อยให้ ADMIN โหลดไฟล์ได้ ก็เท่ากับเปิดทางอ้อมให้เห็นสิ่งเดียวกัน · และการตอบคำขอใช้สิทธิ์
 * ตามกฎหมายเป็นงานของผู้ควบคุมข้อมูล ไม่ใช่งานประจำวัน — กฎเดียวกับการระงับบัญชี
 */
customersRouter.get("/:id/export", requireRole("OWNER"), async (req, res) => {
  // ตัดบันทึกการติดต่อออกได้ แต่ไฟล์จะระบุไว้ว่าตัดออก — ค่าเริ่มต้นคือรวม
  const includeNotes = req.query.includeNotes !== "0";
  try {
    const pkg = await buildCustomerDataPackage(
      req.params.id,
      { includeNotes },
      { ...actorMeta(req), actorName: req.user!.fullName ?? req.user!.email },
    );
    sendFile(
      res,
      JSON.stringify(pkg, null, 2),
      "application/json",
      `ข้อมูลส่วนบุคคล-${pkg.บัญชีผู้ใช้.ชื่อ}-${stamp()}.json`,
    );
  } catch (err) {
    handle(err, res);
  }
});

// ---------- เขียนข้อมูล ----------
//
// ก่อนหน้านี้โมดูลนี้เป็น GET ล้วน แฟ้มลูกค้าจึงเปิดดูได้อย่างเดียว ทำอะไรกับลูกค้าไม่ได้เลย

/**
 * แก้ข้อมูลติดต่อของลูกค้า (ชื่อ / เบอร์โทร / ที่อยู่ / ข้อมูลนิติบุคคล)
 *
 * ที่อยู่สำคัญกว่าที่คิด — มันคือ "ที่อยู่ผู้ว่าจ้าง" ที่พิมพ์ลงใบเสนอราคาและสัญญา ก่อนหน้านี้ถ้า
 * ลูกค้าไม่กรอกเอง ก็ไม่มีใครเติมให้ได้ เอกสารจึงพิมพ์ออกไปโดยไม่มีที่อยู่
 */
customersRouter.patch("/:id", async (req, res) => {
  const parsed = updateCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const customer = await updateCustomerContact(req.params.id, parsed.data, actorMeta(req));
    res.json({ customer });
  } catch (err) {
    handle(err, res);
  }
});

/** ออกลิงก์ตั้งรหัสผ่าน/เข้าใช้งานให้ลูกค้า โดยไม่ต้องมีโครงการ */
customersRouter.post("/:id/access-link", async (req, res) => {
  try {
    const result = await issueAccessLinkForCustomer(req.params.id, actorMeta(req));
    res.status(201).json(result);
  } catch (err) {
    handle(err, res);
  }
});

/**
 * ระงับ / เปิดใช้งานบัญชีลูกค้า — **OWNER เท่านั้น**
 *
 * กฎเดียวกับบัญชีพนักงาน (`setStaffActive` ก็เป็น OWNER เท่านั้น): การเปิด-ปิดบัญชีใครก็ตาม
 * เป็นอำนาจของเจ้าของระบบ ไม่ใช่งานประจำวันของแอดมิน
 */
customersRouter.post("/:id/active", requireRole("OWNER"), async (req, res) => {
  const parsed = setCustomerActiveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const customer = await setCustomerActive(req.params.id, parsed.data, actorMeta(req));
    res.json({ customer });
  } catch (err) {
    handle(err, res);
  }
});

// ---------- บันทึกการติดต่อ ----------
//
// แก้/ลบได้เฉพาะคนเขียนเอง หรือ OWNER (ตรวจในเซอร์วิส) — บันทึกเป็น "คำพูดของคนเขียน"
// ถ้าใครก็แก้ได้ ก็อ่านไม่ได้อีกต่อไปว่าใครบันทึกอะไรไว้จริง

customersRouter.post("/:id/notes", async (req, res) => {
  const parsed = customerNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const customer = await addCustomerNote(req.params.id, parsed.data.body, actorMeta(req));
    res.status(201).json({ customer });
  } catch (err) {
    handle(err, res);
  }
});

customersRouter.patch("/:id/notes/:noteId", async (req, res) => {
  const parsed = customerNoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const customer = await updateCustomerNote(
      req.params.id,
      req.params.noteId,
      parsed.data.body,
      actorMeta(req),
    );
    res.json({ customer });
  } catch (err) {
    handle(err, res);
  }
});

customersRouter.delete("/:id/notes/:noteId", async (req, res) => {
  try {
    const customer = await deleteCustomerNote(req.params.id, req.params.noteId, actorMeta(req));
    res.json({ customer });
  } catch (err) {
    handle(err, res);
  }
});
