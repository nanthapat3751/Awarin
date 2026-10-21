import { prisma } from "../../src/lib/prisma";
import { TRASH_RETENTION_DAYS, sweepTrash } from "../../src/modules/trash/trash.service";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * ถังขยะครบทุกชนิด (trash.test.ts ครอบวัสดุ/โครงการ/ผลงานเป็นหลัก): รายการ · กู้คืน · ลบถาวร ·
 * guard ที่กันลบถาวร · ล้างอัตโนมัติ — ของที่ทดสอบสร้างตรงในฐานข้อมูลในสภาพ "อยู่ในถังขยะแล้ว"
 * เพราะสิ่งที่ทดสอบคือตัวถังขยะ ไม่ใช่ปุ่มลบของแต่ละโมดูล (ซึ่งมีเทสต์ของตัวเอง)
 */
describe("trash — every item type", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  const ids = {
    project: [] as string[],
    houseDesign: [] as string[],
    template: [] as string[],
    contractTemplate: [] as string[],
    lead: [] as string[],
  };
  const stamp = Date.now();
  const longAgo = new Date(Date.now() - (TRASH_RETENTION_DAYS + 5) * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-trash-types-owner");
    admin = await createAndLoginAdmin("test-trash-types-admin");
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: { in: ids.project } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids.lead } } });
    await prisma.template.deleteMany({ where: { id: { in: ids.template } } });
    await prisma.houseDesign.deleteMany({ where: { id: { in: ids.houseDesign } } });
    await prisma.contractTemplate.deleteMany({ where: { id: { in: ids.contractTemplate } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.userId, admin.userId] } } });
    await prisma.$disconnect();
  });

  const trashed = (deletedAt = new Date()) => ({ deletedAt, deletedById: owner.userId });

  async function trashedHouseDesign(name: string, deletedAt?: Date) {
    const d = await prisma.houseDesign.create({
      data: { name, createdById: owner.userId, exteriorImages: ["https://example.com/a.jpg"], ...trashed(deletedAt) },
    });
    ids.houseDesign.push(d.id);
    return d.id;
  }
  async function trashedTemplate(name: string, deletedAt?: Date) {
    const t = await prisma.template.create({ data: { name, structure: [], ...trashed(deletedAt) } });
    ids.template.push(t.id);
    return t.id;
  }
  async function trashedContractTemplate(name: string, deletedAt?: Date) {
    const t = await prisma.contractTemplate.create({
      data: { name, docTitle: "สัญญาทดสอบ", structure: {}, createdById: owner.userId, ...trashed(deletedAt) },
    });
    ids.contractTemplate.push(t.id);
    return t.id;
  }
  async function trashedLead(name: string, deletedAt?: Date) {
    const l = await prisma.lead.create({
      data: { name, phone: "0812345678", serviceType: "ก่อสร้าง", ...trashed(deletedAt) },
    });
    ids.lead.push(l.id);
    return l.id;
  }
  async function project(name: string, extra: Record<string, unknown> = {}) {
    const p = await prisma.project.create({
      data: { projectNo: `T-TR-${stamp}-${ids.project.length}`, name, createdById: owner.userId, ...extra },
    });
    ids.project.push(p.id);
    return p.id;
  }

  it("lists every trashed type with a label, the deleter's name and whether it can be purged", async () => {
    const hd = await trashedHouseDesign(`แบบบ้านถังขยะ ${stamp}`);
    const tpl = await trashedTemplate(`แม่แบบถังขยะ ${stamp}`);
    const ct = await trashedContractTemplate(`แม่แบบสัญญาถังขยะ ${stamp}`);
    const lead = await trashedLead(`คำขอถังขยะ ${stamp}`);
    const pr = await project(`โครงการถังขยะ ${stamp}`, trashed());

    // คำขอที่เป็นโครงการไปแล้ว → ลบถาวรไม่ได้
    const linkedLead = await trashedLead(`คำขอผูกโครงการ ${stamp}`);
    await project(`โครงการจากคำขอ ${stamp}`, { leadId: linkedLead });

    const res = await admin.agent.get("/api/trash");
    expect(res.status).toBe(200);
    expect(res.body.retentionDays).toBe(TRASH_RETENTION_DAYS);
    const byId = new Map(res.body.items.map((i: { id: string }) => [i.id, i]));

    expect(byId.get(hd)).toMatchObject({ type: "houseDesign", typeLabel: "แบบบ้าน", deletedByName: "Test Owner", blockReason: null });
    expect(byId.get(tpl)).toMatchObject({ type: "template", typeLabel: "แม่แบบ", blockReason: null });
    expect(byId.get(ct)).toMatchObject({ type: "contractTemplate", typeLabel: "แม่แบบสัญญา" });
    expect(byId.get(lead)).toMatchObject({ type: "lead", label: `คำขอถังขยะ ${stamp} · ก่อสร้าง`, blockReason: null });
    expect(byId.get(pr)).toMatchObject({ type: "project", blockReason: null });
    expect((byId.get(pr) as { label: string }).label).toContain(`โครงการถังขยะ ${stamp}`);
    expect(byId.get(linkedLead)).toMatchObject({ blockReason: "คำขอนี้ถูกสร้างเป็นโครงการแล้ว ลบถาวรไม่ได้" });

    // เรียงใหม่สุดก่อน
    const times = res.body.items.map((i: { deletedAt: string }) => new Date(i.deletedAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("404s an unknown type and an item that is not in the trash", async () => {
    expect((await owner.agent.post("/api/trash/widget/x/restore")).status).toBe(404);
    expect((await owner.agent.delete("/api/trash/widget/x")).status).toBe(404);

    const live = await prisma.template.create({ data: { name: `แม่แบบยังไม่ลบ ${stamp}`, structure: [] } });
    ids.template.push(live.id);
    const restore = await owner.agent.post(`/api/trash/template/${live.id}/restore`);
    expect(restore.status).toBe(404);
    expect(restore.body.error).toBe("ไม่พบรายการในถังขยะ");
    expect((await owner.agent.delete(`/api/trash/template/${live.id}`)).status).toBe(404);
  });

  it("restores a house design, a template, a contract template and a lead", async () => {
    const targets: [string, string][] = [
      ["houseDesign", await trashedHouseDesign(`กู้แบบบ้าน ${stamp}`)],
      ["template", await trashedTemplate(`กู้แม่แบบ ${stamp}`)],
      ["contractTemplate", await trashedContractTemplate(`กู้แม่แบบสัญญา ${stamp}`)],
      ["lead", await trashedLead(`กู้คำขอ ${stamp}`)],
    ];
    for (const [type, id] of targets) {
      const res = await admin.agent.post(`/api/trash/${type}/${id}/restore`);
      expect(res.status).toBe(204);
    }
    expect((await prisma.houseDesign.findUnique({ where: { id: targets[0][1] } }))!.deletedAt).toBeNull();
    expect((await prisma.template.findUnique({ where: { id: targets[1][1] } }))!.deletedAt).toBeNull();
    expect((await prisma.contractTemplate.findUnique({ where: { id: targets[2][1] } }))!.deletedAt).toBeNull();
    const lead = await prisma.lead.findUnique({ where: { id: targets[3][1] } });
    expect(lead!.deletedAt).toBeNull();
    expect(lead!.deletedById).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "RESTORE_CONTRACTTEMPLATE", entityId: targets[2][1] },
    });
    expect(audit?.userId).toBe(admin.userId);
  });

  it("permanently deletes a trashed house design, template, lead and project", async () => {
    const targets: [string, string, () => Promise<unknown>][] = [];
    const hd = await trashedHouseDesign(`ลบถาวรแบบบ้าน ${stamp}`);
    targets.push(["houseDesign", hd, () => prisma.houseDesign.findUnique({ where: { id: hd } })]);
    const tpl = await trashedTemplate(`ลบถาวรแม่แบบ ${stamp}`);
    targets.push(["template", tpl, () => prisma.template.findUnique({ where: { id: tpl } })]);
    const lead = await trashedLead(`ลบถาวรคำขอ ${stamp}`);
    targets.push(["lead", lead, () => prisma.lead.findUnique({ where: { id: lead } })]);
    const pr = await project(`ลบถาวรโครงการ ${stamp}`, trashed());
    targets.push(["project", pr, () => prisma.project.findUnique({ where: { id: pr } })]);

    for (const [type, id, find] of targets) {
      const res = await owner.agent.delete(`/api/trash/${type}/${id}`);
      expect(res.status).toBe(204);
      expect(await find()).toBeNull();
    }
    expect(await prisma.auditLog.count({ where: { action: "PURGE_HOUSEDESIGN", entityId: hd } })).toBe(1);
  });

  it("refuses to purge a house design still used by a live project, and a lead that became a project", async () => {
    const hd = await trashedHouseDesign(`แบบบ้านยังถูกใช้ ${stamp}`);
    await project(`โครงการใช้แบบบ้าน ${stamp}`, { houseDesignId: hd });
    const res = await owner.agent.delete(`/api/trash/houseDesign/${hd}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("ลบถาวรไม่ได้");

    const lead = await trashedLead(`คำขอเป็นโครงการ ${stamp}`);
    await project(`โครงการของคำขอ ${stamp}`, { leadId: lead });
    expect((await owner.agent.delete(`/api/trash/lead/${lead}`)).status).toBe(409);
  });

  it("purges a trashed contract template only while another live one remains", async () => {
    const ct = await trashedContractTemplate(`ลบถาวรแม่แบบสัญญา ${stamp}`);
    const live = await prisma.contractTemplate.count({ where: { deletedAt: null } });
    const res = await owner.agent.delete(`/api/trash/contractTemplate/${ct}`);
    if (live > 0) {
      expect(res.status).toBe(204);
      expect(await prisma.contractTemplate.findUnique({ where: { id: ct } })).toBeNull();
    } else {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("เป็นแม่แบบสัญญาอันสุดท้าย ลบถาวรไม่ได้");
    }
  });

  it("auto-purges expired items of every type and leaves blocked ones in the trash", async () => {
    const hd = await trashedHouseDesign(`หมดอายุแบบบ้าน ${stamp}`, longAgo);
    const tpl = await trashedTemplate(`หมดอายุแม่แบบ ${stamp}`, longAgo);
    const lead = await trashedLead(`หมดอายุคำขอ ${stamp}`, longAgo);
    const pr = await project(`หมดอายุโครงการ ${stamp}`, trashed(longAgo));
    // ยังผูกโครงการอยู่ → ต้องค้างในถังขยะ ไม่ถูกล้าง
    const blockedLead = await trashedLead(`หมดอายุแต่ผูกโครงการ ${stamp}`, longAgo);
    await project(`โครงการกันล้าง ${stamp}`, { leadId: blockedLead });

    const purged = await sweepTrash();
    expect(purged).toBeGreaterThanOrEqual(4);

    expect(await prisma.houseDesign.findUnique({ where: { id: hd } })).toBeNull();
    expect(await prisma.template.findUnique({ where: { id: tpl } })).toBeNull();
    expect(await prisma.lead.findUnique({ where: { id: lead } })).toBeNull();
    expect(await prisma.project.findUnique({ where: { id: pr } })).toBeNull();
    expect(await prisma.lead.findUnique({ where: { id: blockedLead } })).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({ where: { action: "AUTO_PURGE_TEMPLATE", entityId: tpl } });
    expect(audit).not.toBeNull();
    expect(audit!.userId).toBeNull();
  });
});
