import { Router } from "express";

import {
  CONTRACT_BLOCK_TOKENS,
  CONTRACT_VARIABLE_NAMES,
  describeContractVariables,
} from "../../lib/contract-template";
import { getSettingsMap } from "../../lib/settings";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import {
  createContractTemplateSchema,
  updateContractTemplateSchema,
} from "./contractTemplates.schemas";
import {
  ContractTemplateError,
  createContractTemplate,
  deleteContractTemplate,
  getContractTemplateOrThrow,
  listContractTemplates,
  setDefaultContractTemplate,
  updateContractTemplate,
  warnUnknownVariables,
} from "./contractTemplates.service";

export const contractTemplatesRouter = Router();

contractTemplatesRouter.use(requireAuth, requireRole("OWNER", "ADMIN"));

function fail(err: unknown, res: import("express").Response) {
  if (err instanceof ContractTemplateError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

contractTemplatesRouter.get("/", async (req, res) => {
  const templates = await listContractTemplates(req.user!.id);
  // ส่งรายชื่อตัวแปรไปด้วย เพื่อให้หน้าจอมีปุ่มกดแทรกโดยไม่ต้องจำชื่อเอง
  // blockTokens แยกออกมาเพราะไม่ใช่ข้อความ แต่เป็นบล็อก (ตาราง) ที่ตัวพิมพ์วาดให้ตอนออก PDF
  // variableInfo = กลุ่ม + "จะพิมพ์ออกมาเป็นอะไร" ของแต่ละตัว (ฝั่งบริษัทเป็นค่าจริงจากหน้าตั้งค่า)
  res.json({
    templates,
    variables: CONTRACT_VARIABLE_NAMES,
    blockTokens: CONTRACT_BLOCK_TOKENS,
    variableInfo: describeContractVariables(await getSettingsMap()),
  });
});

contractTemplatesRouter.get("/:id", async (req, res) => {
  try {
    const template = await getContractTemplateOrThrow(req.params.id);
    res.json({
      template,
      variables: CONTRACT_VARIABLE_NAMES,
      blockTokens: CONTRACT_BLOCK_TOKENS,
      variableInfo: describeContractVariables(await getSettingsMap()),
    });
  } catch (err) {
    if (!fail(err, res)) throw err;
  }
});

contractTemplatesRouter.post("/", async (req, res) => {
  const parsed = createContractTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    const template = await createContractTemplate(parsed.data, req.user!.id);
    res.status(201).json({ template, unknownVariables: warnUnknownVariables(parsed.data.structure) });
  } catch (err) {
    if (!fail(err, res)) throw err;
  }
});

contractTemplatesRouter.patch("/:id", async (req, res) => {
  const parsed = updateContractTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" });
    return;
  }
  try {
    const template = await updateContractTemplate(req.params.id, parsed.data, req.user!.id);
    res.json({
      template,
      unknownVariables: parsed.data.structure ? warnUnknownVariables(parsed.data.structure) : [],
    });
  } catch (err) {
    if (!fail(err, res)) throw err;
  }
});

contractTemplatesRouter.post("/:id/default", async (req, res) => {
  try {
    const template = await setDefaultContractTemplate(req.params.id, req.user!.id);
    res.json({ template });
  } catch (err) {
    if (!fail(err, res)) throw err;
  }
});

contractTemplatesRouter.delete("/:id", async (req, res) => {
  try {
    await deleteContractTemplate(req.params.id, req.user!.id);
    res.status(204).end();
  } catch (err) {
    if (!fail(err, res)) throw err;
  }
});
