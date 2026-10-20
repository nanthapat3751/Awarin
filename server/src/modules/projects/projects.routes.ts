import { Router } from "express";

import { domainAcceptsMail } from "../../lib/email-domain";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  CustomerFileError,
  getProjectCustomerActivity,
} from "../customers/customerFile.service";
import { createdPeriod, searchText } from "../../lib/list-query";
import { getProjectActivity } from "./activity.service";
import {
  createProjectSchema,
  issueAccessLinkSchema,
  linkLeadToProjectSchema,
  setCustomPriceSchema,
  transitionProjectSchema,
  updateProjectSchema,
  updateVersionRatesSchema,
} from "./projects.schemas";
import {
  ProjectError,
  createProject,
  deleteProject,
  getProjectDetail,
  issueCustomerAccessLink,
  linkLeadToProject,
  listProjects,
  listProjectsPage,
  setCustomProjectPrice,
  transitionProject,
  updateProject,
  updateVersionRates,
} from "./projects.service";

export const projectsRouter = Router();

projectsRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

// ?page= มา = หน้ารายการแบบแบ่งหน้าที่เซิร์ฟเวอร์ (?q=&status=&year=&month=&page=)
// ไม่มี page = รายการเต็มแบบเดิม (ที่อื่นที่ยังต้องการทั้งชุด)
projectsRouter.get("/", async (req, res) => {
  if (req.query.page !== undefined) {
    res.json(
      await listProjectsPage({
        q: searchText(req.query.q),
        status: typeof req.query.status === "string" ? req.query.status : undefined,
        period: createdPeriod(req.query.year, req.query.month),
        page: req.query.page,
      }),
    );
    return;
  }
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
  const q = typeof req.query.q === "string" ? req.query.q : undefined;
  const projects = await listProjects({ status, customerId, q });
  res.json({ projects });
});

projectsRouter.post("/", async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const project = await createProject(parsed.data, req.user!.id, req.user!.role);
    res.status(201).json({ project });
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

projectsRouter.get("/:id", async (req, res) => {
  try {
    const detail = await getProjectDetail(req.params.id);
    res.json(detail);
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

projectsRouter.patch("/:id", async (req, res) => {
  const parsed = updateProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const project = await updateProject(req.params.id, parsed.data, req.user!.id);
    res.json({ project });
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

projectsRouter.delete("/:id", async (req, res) => {
  try {
    await deleteProject(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ไทม์ไลน์กิจกรรมของโครงการ (อ่านจาก AuditLog) — แยก endpoint จาก /:id เพราะเป็นข้อมูลคนละชุด
// และหน้ารายละเอียดโหลดมันทีหลังได้ ไม่ต้องถ่วงการแสดงผลส่วนหลัก
// "ลูกค้ารายนี้ทำอะไรกับโครงการนี้บ้าง" — แยกจากไทม์ไลน์รวมที่ปนงานของพนักงาน
projectsRouter.get("/:id/customer-activity", async (req, res) => {
  try {
    const result = await getProjectCustomerActivity(req.params.id, {
      includeIp: req.user!.role === "OWNER",
    });
    res.json(result);
  } catch (err) {
    if (err instanceof CustomerFileError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ?page=2 — หน้าละ 15 เหตุการณ์ ใหม่สุดก่อน
projectsRouter.get("/:id/activity", async (req, res) => {
  const page = typeof req.query.page === "string" ? Number(req.query.page) : 1;
  res.json(await getProjectActivity(req.params.id, page));
});

projectsRouter.post("/:id/customer-access-link", async (req, res) => {
  const parsed = issueAccessLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  // พนักงานพิมพ์อีเมลลูกค้าเองตรงนี้ — จับโดเมนที่พิมพ์ผิดก่อนจะออกลิงก์ไปให้ผิดคน
  if (parsed.data.email && !(await domainAcceptsMail(parsed.data.email))) {
    res.status(400).json({ error: "โดเมนของอีเมลนี้รับอีเมลไม่ได้ กรุณาตรวจสอบอีกครั้ง" });
    return;
  }

  try {
    const result = await issueCustomerAccessLink(req.params.id, parsed.data, req.user!.id);
    res.status(result.created ? 201 : 200).json(result);
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

projectsRouter.post("/:id/link-lead", async (req, res) => {
  const parsed = linkLeadToProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const project = await linkLeadToProject(req.params.id, parsed.data.leadId, req.user!.id);
    res.json({ project });
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// ตั้งราคาโครงการกำหนดเอง (CUSTOM) — กรอกยอดก่อน VAT ระบบบวก VAT ให้
projectsRouter.post("/:id/custom-price", async (req, res) => {
  const parsed = setCustomPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const version = await setCustomProjectPrice(req.params.id, parsed.data.subtotalBeforeVat, req.user!.id);
    res.json({ version });
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// แก้อัตราค่าดำเนินการ+กำไร / VAT ของโครงการที่สร้างไปแล้ว แล้วคิดราคาใหม่ทั้งชุด
// (ถ้าเวอร์ชันล่าสุดส่งใบเสนอราคาไปแล้ว จะ clone เป็นเวอร์ชันใหม่ให้ตาม BR-07)
projectsRouter.patch("/:id/rates", async (req, res) => {
  const parsed = updateVersionRatesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const version = await updateVersionRates(req.params.id, parsed.data, {
      id: req.user!.id,
      role: req.user!.role,
    });
    res.json({ version });
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

projectsRouter.post("/:id/transition", async (req, res) => {
  const parsed = transitionProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง", details: parsed.error.flatten() });
    return;
  }

  try {
    const project = await transitionProject(req.params.id, parsed.data.toStatus, req.user!.id);
    res.json({ project });
  } catch (err) {
    if (err instanceof ProjectError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});
