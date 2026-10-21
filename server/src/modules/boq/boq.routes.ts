import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";

import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { sendXlsx } from "../../lib/excel/send-xlsx";
import { ImportFileError } from "../../lib/excel/boq-import";
import { rebarSchedule } from "../../lib/rebar-cutting";
import { structuralCompare } from "../../lib/structural-compare";
import { getTakeoffRules } from "../../lib/takeoff-rules";
import { exportInternalBoq, exportRebarBbs } from "./boq-export.service";
import { buildImportTemplate, commitBoqImport, commitBoqImportSchema, previewBoqImport } from "./boq-import.service";
import { applyCatalogPrices, compareVersions, getPriceDrift, keepCurrentPrices } from "./boq-review.service";
import {
  applyTakeoffSchema,
  createBoqItemSchema,
  createBoqItemsSchema,
  memberKeySchema,
  recomputeMembersSchema,
  replaceMemberSchema,
  updateBoqItemSchema,
} from "./boq.schemas";
import {
  BoqError,
  addBoqItem,
  addBoqItems,
  applyTakeoffRows,
  deleteBoqItem,
  deleteStructuralMember,
  getBoqState,
  getLatestVersion,
  listStructuralMembers,
  loadProjectOrThrow,
  recomputeStructuralMembers,
  replaceStructuralMember,
  reorderBoqItems,
  updateBoqItem,
} from "./boq.service";

type ProjectParams = { projectId: string };
type ItemParams = { projectId: string; itemId: string };
type MemberParams = { projectId: string; key: string };

export const boqRouter = Router({ mergeParams: true });

boqRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

boqRouter.get("/", async (req: Request<ProjectParams>, res) => {
  try {
    const state = await getBoqState(req.params.projectId);
    res.json(state);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// เทียบเหล็กเสริม ชุดเสนอราคา (ใน BOQ) กับชุดสั่งตัด ของเวอร์ชันล่าสุด — ฝั่ง staff เท่านั้น ไม่ออกไปเอกสารลูกค้า
boqRouter.get("/structural-compare", async (req: Request<ProjectParams>, res) => {
  try {
    await loadProjectOrThrow(req.params.projectId);
    const version = await getLatestVersion(req.params.projectId);
    res.json({ compare: await structuralCompare(version.id, await getTakeoffRules()) });
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Excel ฉบับภายใน (มีราคาทุน + รายการสั่งซื้อ) ของเวอร์ชันล่าสุด — สิทธิ์เดียวกับหน้า BOQ (OWNER/ADMIN)
boqRouter.get("/export.xlsx", async (req: Request<ProjectParams>, res) => {
  try {
    const file = await exportInternalBoq(req.params.projectId);
    sendXlsx(res, file.buffer, file.fileName);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ─────────────── นำเข้าจาก Excel (ดู boq-import.service.ts) ───────────────

// ไฟล์อยู่ในหน่วยความจำเท่านั้น ไม่เขียนลงดิสก์ — อ่านเสร็จทิ้ง · 5 MB พอสำหรับ BOQ หลายพันบรรทัด
// และกันไฟล์ zip ใหญ่ ๆ ที่แตกแล้วกินหน่วยความจำเซิร์ฟเวอร์
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("รองรับเฉพาะไฟล์ Excel นามสกุล .xlsx (ถ้าเป็น .xls ให้บันทึกเป็น .xlsx ก่อน)"));
  },
});

boqRouter.get("/import/template.xlsx", async (_req, res) => {
  sendXlsx(res, await buildImportTemplate(), "แม่แบบนำเข้า-BOQ.xlsx");
});

function importUploadError(err: unknown): string {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") return "ไฟล์ใหญ่เกิน 5 MB";
  return err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ";
}

/** ตัวเลือกจากหน้าพรีวิว (ช่องฟอร์ม): หมวดสำรอง · ชุดราคา · ชีตที่ติ๊กไว้ (JSON array ของชื่อชีต) — ผิดรูปแบบ = ใช้ที่ระบบเลือกให้ */
function previewOptions(raw: unknown): { defaultCategoryId: string | null; priceSet: number | undefined; sheets: string[] | null } {
  const body = (raw ?? {}) as { defaultCategoryId?: unknown; priceSet?: unknown; sheets?: unknown };
  const defaultCategoryId =
    typeof body.defaultCategoryId === "string" && body.defaultCategoryId.length > 0 ? body.defaultCategoryId : null;
  const priceSet = typeof body.priceSet === "string" && /^\d{1,2}$/.test(body.priceSet) ? Number(body.priceSet) : undefined;
  return { defaultCategoryId, priceSet, sheets: sheetList(body.sheets) };
}

function sheetList(raw: unknown): string[] | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 10_000) return null;
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) && list.every((x) => typeof x === "string") ? (list as string[]) : null;
  } catch {
    return null;
  }
}

boqRouter.post("/import/preview", (req: Request<ProjectParams>, res) => {
  importUpload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      res.status(400).json({ error: importUploadError(err) });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "ไม่พบไฟล์ที่อัปโหลด" });
      return;
    }
    const { defaultCategoryId, priceSet, sheets } = previewOptions(req.body);
    try {
      res.json(await previewBoqImport(req.params.projectId, req.file.buffer, defaultCategoryId, { priceSet, sheets }));
    } catch (e) {
      if (e instanceof ImportFileError) {
        res.status(400).json({ error: e.message });
        return;
      }
      if (e instanceof BoqError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      throw e;
    }
  });
});

boqRouter.post("/import", async (req: Request<ProjectParams>, res) => {
  const parsed = commitBoqImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    res.status(201).json(await commitBoqImport(req.params.projectId, parsed.data, req.user!.id));
  } catch (e) {
    if (e instanceof BoqError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    throw e;
  }
});

// ราคาในคลังเปลี่ยนหลังตั้งราคาในโครงการ — ดู boq-review.service.ts
boqRouter.get("/price-drift", async (req: Request<ProjectParams>, res) => {
  try {
    res.json(await getPriceDrift(req.params.projectId));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const itemIdsSchema = z.object({ itemIds: z.array(z.string().min(1)).min(1).max(1000) });

boqRouter.post("/price-drift/apply", async (req: Request<ProjectParams>, res) => {
  const parsed = itemIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await applyCatalogPrices(req.params.projectId, parsed.data.itemIds, req.user!.id));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.post("/price-drift/keep", async (req: Request<ProjectParams>, res) => {
  const parsed = itemIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await keepCurrentPrices(req.params.projectId, parsed.data.itemIds, req.user!.id));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

const compareSchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

boqRouter.get("/versions/compare", async (req: Request<ProjectParams>, res) => {
  const parsed = compareSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "ต้องระบุเวอร์ชันที่จะเทียบ (from, to)" });
    return;
  }
  try {
    res.json(await compareVersions(req.params.projectId, parsed.data.from, parsed.data.to));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.post("/items", async (req: Request<ProjectParams>, res) => {
  const parsed = createBoqItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await addBoqItem(req.params.projectId, parsed.data, req.user!.id);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ปุ่ม "เพิ่มหลายรายการ" — ดู addBoqItems
boqRouter.post("/items/batch", async (req: Request<ProjectParams>, res) => {
  const parsed = createBoqItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง",
      details: parsed.error.flatten(),
    });
    return;
  }
  try {
    const result = await addBoqItems(req.params.projectId, parsed.data.items, req.user!.id);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ตัวคิดชิ้นส่วนโครงสร้าง: เติมแถวใบถอดแบบลงหลายบรรทัดพร้อมกัน — ดู applyTakeoffRows
boqRouter.post("/takeoff/apply", async (req: Request<ProjectParams>, res) => {
  const parsed = applyTakeoffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    const result = await applyTakeoffRows(req.params.projectId, parsed.data, req.user!.id);
    res.json(result);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// แผนตัดเหล็กหน้างาน (Phase 3 ข้อ 3a) — ชุดสั่งตัด เทียบเส้น 10/12 ม. · ฝั่ง staff เท่านั้น
boqRouter.get("/rebar-cutting", async (req: Request<ProjectParams>, res) => {
  try {
    await loadProjectOrThrow(req.params.projectId);
    const version = await getLatestVersion(req.params.projectId);
    res.json({ cutting: (await rebarSchedule(version.id, await getTakeoffRules())).cutting });
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// Excel รายการสั่งเหล็กหน้างาน (ข้อ 3d) — สรุปขนาด · รายชิ้นส่วน · แผนตัด
boqRouter.get("/rebar-bbs.xlsx", async (req: Request<ProjectParams>, res) => {
  try {
    const file = await exportRebarBbs(req.params.projectId);
    sendXlsx(res, file.buffer, file.fileName);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ชิ้นส่วนโครงสร้างที่ลงไว้ (Phase 2 ข้อ 3c) — รายการ · แก้ (ลงทับด้วย key เดิม) · ลบพร้อมแถวของมัน
boqRouter.get("/structural-members", async (req: Request<ProjectParams>, res) => {
  try {
    await loadProjectOrThrow(req.params.projectId);
    res.json({ members: await listStructuralMembers(req.params.projectId) });
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// คิดทุกชิ้นใหม่ด้วยชุดเสนอราคาปัจจุบัน (ข้อ 3b) — apply=false พรีวิวก่อน-หลัง ไม่เขียนอะไร
boqRouter.post("/structural-members/recompute", async (req: Request<ProjectParams>, res) => {
  const parsed = recomputeMembersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    res.json({ recompute: await recomputeStructuralMembers(req.params.projectId, parsed.data.apply, req.user!.id) });
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.put("/structural-members/:key", async (req: Request<MemberParams>, res) => {
  const key = memberKeySchema.safeParse(req.params.key);
  const parsed = replaceMemberSchema.safeParse(req.body);
  if (!key.success || !parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.success ? undefined : parsed.error.flatten() });
    return;
  }
  try {
    res.json(await replaceStructuralMember(req.params.projectId, key.data, parsed.data, req.user!.id));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.delete("/structural-members/:key", async (req: Request<MemberParams>, res) => {
  const key = memberKeySchema.safeParse(req.params.key);
  if (!key.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    res.json(await deleteStructuralMember(req.params.projectId, key.data, req.user!.id));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ส่งลำดับทั้งเวอร์ชัน — ดู reorderBoqItems
boqRouter.put("/items/order", async (req: Request<ProjectParams>, res) => {
  const parsed = itemIdsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await reorderBoqItems(req.params.projectId, parsed.data.itemIds, req.user!.id));
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.patch("/items/:itemId", async (req: Request<ItemParams>, res) => {
  const parsed = updateBoqItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const result = await updateBoqItem(
      req.params.projectId,
      req.params.itemId,
      parsed.data,
      req.user!.id,
    );
    res.json(result);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

boqRouter.delete("/items/:itemId", async (req: Request<ItemParams>, res) => {
  try {
    const result = await deleteBoqItem(req.params.projectId, req.params.itemId, req.user!.id);
    res.json(result);
  } catch (err) {
    if (err instanceof BoqError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
