import {
  DEFAULT_TAKEOFF_RULES,
  settingsFromRuleSet,
  structuralTakeoff,
  type StructuralInput,
} from "@systemboq/shared-types";

import ExcelJS from "exceljs";

import { prisma } from "../../src/lib/prisma";
import { TAKEOFF_RULES_KEY } from "../../src/lib/takeoff-rules";
import { sendQuote } from "../helpers/quote-send";
import { createAndLoginAdmin, createAndLoginOwner } from "../helpers/test-auth";

/**
 * "กรอกครั้งเดียว ได้สองผลลัพธ์" — ตัวคิดชิ้นส่วนเก็บขนาดไว้ (StructuralMember) BOQ ใช้ชุดเสนอราคา
 * แล้ว /boq/structural-compare คิดชิ้นส่วนเดิมด้วยชุดสั่งตัด
 *
 * เฝ้า: แถวผูกกับชิ้นส่วน · ชิ้นส่วนติดไปเวอร์ชันใหม่ · แถวกรอกเองไม่ปนการเทียบ · ชุดกฎแก้ได้เฉพาะเจ้าของ
 */
describe("ชิ้นส่วนโครงสร้าง + เทียบชุดกฎ", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let admin: Awaited<ReturnType<typeof createAndLoginAdmin>>;
  let itemCategoryId: string;
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdCategoryIds: string[] = [];

  beforeAll(async () => {
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
    owner = await createAndLoginOwner("test-structural-owner");
    admin = await createAndLoginAdmin("test-structural-admin");
    createdUserIds.push(owner.userId, admin.userId);
    const category = await owner.agent.post("/api/categories").send({ level: "CATEGORY", name: "หมวดทดสอบชิ้นส่วน" });
    createdCategoryIds.push(category.body.category.id);
    const subgroup = await owner.agent
      .post("/api/categories")
      .send({ level: "SUBGROUP", parentId: category.body.category.id, name: "กลุ่มทดสอบชิ้นส่วน" });
    createdCategoryIds.push(subgroup.body.category.id);
    const item = await owner.agent
      .post("/api/categories")
      .send({ level: "ITEM", parentId: subgroup.body.category.id, name: "งานเหล็กทดสอบ" });
    itemCategoryId = item.body.category.id;
    createdCategoryIds.push(itemCategoryId);
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
    await prisma.quote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.workCategory.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  async function newProject(name: string) {
    const res = await owner.agent.post("/api/projects").send({ name });
    createdProjectIds.push(res.body.project.id);
    return res.body.project.id as string;
  }

  // คาน B1 0.2×0.4×3 · 2+2-DB12 · RB6@0.15 ด้วยชุดเสนอราคา (แบบที่หน้าต่างส่งมา)
  const beam: StructuralInput = {
    kind: "BEAM",
    label: "B1",
    count: 1,
    width: 0.2,
    depth: 0.4,
    length: 3,
    topBars: { count: 2, dia: 12 },
    bottomBars: { count: 2, dia: 12 },
    ties: { dia: 6, spacing: 0.15 },
    endBends: true,
    settings: settingsFromRuleSet(DEFAULT_TAKEOFF_RULES.tender, 0.03),
  };

  /** แถวเหล็กของชิ้นส่วน แยกตามขนาด → สร้างบรรทัดใหม่ขนาดละบรรทัด (แบบหน้าต่าง "คำนวณโครงสร้าง") */
  function applyBody(member: StructuralInput) {
    const rebar = structuralTakeoff(member).rows.filter((r) => r.group === "REBAR");
    const dias = [...new Set(rebar.map((r) => r.row.barDia!))];
    return {
      member,
      targets: dias.map((dia) => ({
        newItem: { categoryId: itemCategoryId, name: `เหล็กเสริม ${dia} มม.`, unit: "กก.", materialUnitPrice: 34, laborUnitPrice: 5 },
        rows: rebar.filter((r) => r.row.barDia === dia).map((r) => r.row),
      })),
    };
  }

  it("ลงจากชิ้นส่วน: เก็บขนาดไว้ แถวผูก key · เผื่อเสียตั้งต้นตามขนาด · เทียบได้ตัวเลขชุดสั่งตัด", async () => {
    const projectId = await newProject("ชิ้นส่วน 1");
    const res = await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    expect(res.status).toBe(200);

    const members = await prisma.structuralMember.findMany({ where: { projectVersionId: res.body.version.id } });
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ kind: "BEAM", label: "B1", count: 1 });

    const items = (await owner.agent.get(`/api/projects/${projectId}/boq`)).body.items as {
      id: string;
      name: string;
      wasteFactorPct: string | null;
      takeoffRows: { memberKey: string | null }[];
    }[];
    const db12 = items.find((i) => i.name.includes("12"))!;
    const rb6 = items.find((i) => i.name.includes("6 มม"))!;
    expect(db12.takeoffRows.every((r) => r.memberKey === members[0].key)).toBe(true);
    // เผื่อเสียจากชุดเสนอราคา: DB12 9% · RB6 5%
    expect(Number(db12.wasteFactorPct)).toBe(9);
    expect(Number(rb6.wasteFactorPct)).toBe(5);

    const cmp = (await owner.agent.get(`/api/projects/${projectId}/boq/structural-compare`)).body.compare;
    const line = (id: string) => cmp.lines.find((l: { itemId: string }) => l.itemId === id);
    // เสนอราคา 4 × 3.0 × 0.8889 = 10.667 · สั่งตัด 4 × 3.228 × 0.8889 = 11.477
    expect(line(db12.id)).toMatchObject({ tenderNet: 10.667, siteNet: 11.477, manualRows: 0 });
    // ปลอก 21 วง: เสนอราคา × 1.2 ม. = 5.6 · สั่งตัด × 1.08 ม. = 5.04
    expect(line(rb6.id)).toMatchObject({ tenderNet: 5.6, siteNet: 5.04 });
    expect(cmp.members).toEqual([{ label: "B1", kind: "BEAM", count: 1 }]);
    expect(cmp.byDia.map((d: { dia: number }) => d.dia)).toEqual([6, 12]);
  });

  it("แตกเวอร์ชันหลังส่งใบเสนอราคา: ชิ้นส่วนติดไปด้วย key เดิม การเทียบยังครบ", async () => {
    const projectId = await newProject("ชิ้นส่วน 2");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);

    const res = await owner.agent
      .post(`/api/projects/${projectId}/boq/takeoff/apply`)
      .send(applyBody({ ...beam, label: "B2", count: 2 }));
    expect(res.body.version.versionNo).toBe(2);
    const v2 = await prisma.structuralMember.findMany({ where: { projectVersionId: res.body.version.id } });
    expect(v2.map((m) => m.label).sort()).toEqual(["B1", "B2"]);

    const cmp = (await owner.agent.get(`/api/projects/${projectId}/boq/structural-compare`)).body.compare;
    // B1 ×1 + B2 ×2 = 3 เท่าของคานเดียว
    const db12 = cmp.byDia.find((d: { dia: number }) => d.dia === 12);
    expect(db12.tenderNet).toBeCloseTo(3 * 10.667, 2);
    expect(db12.siteNet).toBeCloseTo(3 * 11.477, 2);
  });

  it("แถวกรอกเองไม่ปนการเทียบ · บรรทัดเหล็กที่ไม่มีชิ้นส่วน = ไม่มีข้อมูลเทียบ", async () => {
    const projectId = await newProject("ชิ้นส่วน 3");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const items = (await owner.agent.get(`/api/projects/${projectId}/boq`)).body.items;
    const db12 = items.find((i: { name: string }) => i.name.includes("12"));
    // เพิ่มแถวเองในบรรทัดเดิม (แถวเดิมส่งกลับพร้อม memberKey แบบที่หน้าจอใบถอดแบบทำ)
    const rows = db12.takeoffRows.map((r: Record<string, unknown>) => ({
      label: r.label,
      count: Number(r.count),
      length: r.length == null ? null : Number(r.length),
      barDia: r.barDia,
      memberKey: r.memberKey,
    }));
    const patch = await owner.agent
      .patch(`/api/projects/${projectId}/boq/items/${db12.id}`)
      .send({ takeoffRows: [...rows, { label: "เหล็กเสริมพิเศษ", count: 4, length: 1, barDia: 12 }] });
    expect(patch.status).toBe(200);
    const extra = await owner.agent.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: itemCategoryId,
      name: "เหล็กเดือย DB20",
      unit: "กก.",
      quantity: 60,
      materialUnitPrice: 34,
      laborUnitPrice: 5,
    });

    const cmp = (await owner.agent.get(`/api/projects/${projectId}/boq/structural-compare`)).body.compare;
    const line = cmp.lines.find((l: { itemId: string }) => l.itemId === db12.id);
    expect(line).toMatchObject({ tenderNet: 10.667, siteNet: 11.477, manualRows: 1 });
    expect(cmp.noDataItemIds).toEqual([extra.body.item.id]);
  });

  it("ชุดกฎ: อ่านได้ทุกคน · แก้ได้เฉพาะเจ้าของ · การเทียบใช้ชุดสั่งตัดที่บันทึก", async () => {
    const read = await admin.agent.get("/api/settings/takeoff-rules");
    expect(read.status).toBe(200);
    expect(read.body.rules).toEqual(DEFAULT_TAKEOFF_RULES);

    const next = { ...DEFAULT_TAKEOFF_RULES, site: { ...DEFAULT_TAKEOFF_RULES.site, hooks: false } };
    expect((await admin.agent.put("/api/settings/takeoff-rules").send({ rules: next })).status).toBe(403);
    const bad = await owner.agent
      .put("/api/settings/takeoff-rules")
      .send({ rules: { ...next, site: { ...next.site, stockLength: 0 } } });
    expect(bad.status).toBe(400);
    const saved = await owner.agent.put("/api/settings/takeoff-rules").send({ rules: next });
    expect(saved.status).toBe(200);
    expect(saved.body.rules.site.hooks).toBe(false);

    const projectId = await newProject("ชิ้นส่วน 4");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const cmp = (await owner.agent.get(`/api/projects/${projectId}/boq/structural-compare`)).body.compare;
    // ชุดสั่งตัดไม่มีขอปลอกแล้ว: 21 × 0.96 ม. × 0.2222 = 4.48
    expect(cmp.byDia.find((d: { dia: number }) => d.dia === 6).siteNet).toBeCloseTo(4.48, 2);
  });

  it("ชิ้นส่วนที่ตัวคิดรับไม่ได้ = ไม่เก็บอะไรเลย", async () => {
    const projectId = await newProject("ชิ้นส่วน 5");
    const body = applyBody(beam);
    const res = await owner.agent
      .post(`/api/projects/${projectId}/boq/takeoff/apply`)
      .send({ ...body, member: { ...beam, ties: { dia: 6, spacing: 0 } } });
    expect(res.status).toBe(400);
    expect(await prisma.structuralMember.count({ where: { projectVersion: { projectId } } })).toBe(0);
    expect(await prisma.boqItem.count({ where: { projectVersion: { projectId } } })).toBe(0);
  });

  // ---------- Phase 2 ข้อ 3c: รายการ · แก้ (ลงทับ) · ลบ ----------

  type Item = { id: string; name: string; quantity: string; takeoffRows: { label: string; memberKey: string | null }[] };
  const boqItems = async (projectId: string) =>
    (await owner.agent.get(`/api/projects/${projectId}/boq`)).body.items as Item[];
  const membersOf = async (projectId: string) =>
    (await owner.agent.get(`/api/projects/${projectId}/boq/structural-members`)).body.members as {
      key: string;
      label: string;
    }[];

  /** ปลายทางเป็นบรรทัดเดิมตามขนาดเหล็ก (แบบที่หน้าต่างแก้ไขเติมให้) — ขนาดที่ยังไม่มีบรรทัดสร้างใหม่ */
  function replaceBody(member: StructuralInput, items: Item[]) {
    const rebar = structuralTakeoff(member).rows.filter((r) => r.group === "REBAR");
    const dias = [...new Set(rebar.map((r) => r.row.barDia!))];
    return {
      member,
      targets: dias.map((dia) => {
        const rows = rebar.filter((r) => r.row.barDia === dia).map((r) => r.row);
        const existing = items.find((i) => i.name === `เหล็กเสริม ${dia} มม.`);
        return existing
          ? { itemId: existing.id, rows }
          : {
              newItem: { categoryId: itemCategoryId, name: `เหล็กเสริม ${dia} มม.`, unit: "กก.", materialUnitPrice: 34, laborUnitPrice: 5 },
              rows,
            };
      }),
    };
  }

  it("รายการชิ้นส่วน: ขนาดที่เก็บไว้ + บรรทัดที่มีแถวของแต่ละชิ้น", async () => {
    const projectId = await newProject("ชิ้นส่วน รายการ");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const res = await owner.agent.get(`/api/projects/${projectId}/boq/structural-members`);
    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(1);
    const m = res.body.members[0];
    expect(m).toMatchObject({ kind: "BEAM", label: "B1", count: 1 });
    expect(m.input.width).toBe(0.2);
    expect(m.lines.map((l: { name: string; barDias: number[] }) => [l.name, l.barDias])).toEqual(
      expect.arrayContaining([
        ["เหล็กเสริม 12 มม.", [12]],
        ["เหล็กเสริม 6 มม.", [6]],
      ]),
    );
  });

  it("แก้ชิ้นส่วน: แถวเดิมถูกแทน key เดิม · ชิ้นอื่นในบรรทัดเดียวกันไม่โดน · ปริมาณขยับตามขนาดใหม่", async () => {
    const projectId = await newProject("ชิ้นส่วน แก้");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    // B2 ลงบรรทัดเดียวกัน (ปลายทางเป็นบรรทัดเดิม)
    await owner.agent
      .post(`/api/projects/${projectId}/boq/takeoff/apply`)
      .send(replaceBody({ ...beam, label: "B2" }, await boqItems(projectId)));
    const b1 = (await membersOf(projectId)).find((m) => m.label === "B1")!;
    const before = (await boqItems(projectId)).find((i) => i.name === "เหล็กเสริม 12 มม.")!;
    expect(before.takeoffRows).toHaveLength(4);

    // B1 ยาวขึ้นเป็น 6 ม. → DB12 ของ B1 เพิ่มเท่าตัว ของ B2 เท่าเดิม
    const res = await owner.agent
      .put(`/api/projects/${projectId}/boq/structural-members/${b1.key}`)
      .send(replaceBody({ ...beam, length: 6 }, await boqItems(projectId)));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 0, removed: 0 });

    const after = (await boqItems(projectId)).find((i) => i.name === "เหล็กเสริม 12 มม.")!;
    expect(after.takeoffRows).toHaveLength(4);
    expect(after.takeoffRows.filter((r) => r.memberKey === b1.key)).toHaveLength(2);
    // ก่อน: (B1 + B2) เท่ากัน · หลัง: B1 ยาวเป็นสองเท่า → รวม 1.5 เท่า (เหล็กตรงตามความยาว)
    expect(Number(after.quantity)).toBeCloseTo(Number(before.quantity) * 1.5, 0);
    const stored = await prisma.structuralMember.findFirstOrThrow({ where: { key: b1.key } });
    expect((stored.input as { length: number }).length).toBe(6);
  });

  it("แก้ชิ้นส่วนจนขนาดเหล็กหาย: บรรทัดที่ไม่เหลือแถวถูกลบ · ขนาดใหม่สร้างบรรทัดใหม่", async () => {
    const projectId = await newProject("ชิ้นส่วน แก้ขนาด");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const key = (await membersOf(projectId))[0].key;
    // เปลี่ยนเหล็กบน/ล่างเป็น DB16 → บรรทัด DB12 ไม่เหลือแถว
    const next = { ...beam, topBars: { count: 2, dia: 16 }, bottomBars: { count: 2, dia: 16 } };
    const res = await owner.agent
      .put(`/api/projects/${projectId}/boq/structural-members/${key}`)
      .send(replaceBody(next, await boqItems(projectId)));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, removed: 1 });
    const names = (await boqItems(projectId)).map((i) => i.name).sort();
    expect(names).toEqual(["เหล็กเสริม 16 มม.", "เหล็กเสริม 6 มม."]);
  });

  it("ลบชิ้นส่วน: แถวหายทุกบรรทัด · บรรทัดที่เหลือแถวอื่นคงอยู่ · ชิ้นสุดท้ายลบบรรทัดไปด้วย", async () => {
    const projectId = await newProject("ชิ้นส่วน ลบ");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    await owner.agent
      .post(`/api/projects/${projectId}/boq/takeoff/apply`)
      .send(replaceBody({ ...beam, label: "B2" }, await boqItems(projectId)));
    const b1 = (await membersOf(projectId)).find((m) => m.label === "B1")!;

    const res = await owner.agent.delete(`/api/projects/${projectId}/boq/structural-members/${b1.key}`);
    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(0);
    const items = await boqItems(projectId);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.takeoffRows.every((r) => r.memberKey !== b1.key))).toBe(true);
    const left = await membersOf(projectId);
    expect(left.map((m) => m.label)).toEqual(["B2"]);

    const del2 = await owner.agent.delete(`/api/projects/${projectId}/boq/structural-members/${left[0].key}`);
    expect(del2.body.removed).toBe(2);
    expect(await boqItems(projectId)).toHaveLength(0);
    // ลบซ้ำ = ไม่พบ
    const again = await owner.agent.delete(`/api/projects/${projectId}/boq/structural-members/${left[0].key}`);
    expect(again.status).toBe(404);
  });

  it("ลบหลังส่งใบเสนอราคา: แตกเวอร์ชันใหม่ เวอร์ชันที่ส่งไปแล้วไม่ถูกแตะ", async () => {
    const projectId = await newProject("ชิ้นส่วน ลบหลังส่ง");
    const first = await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    const key = (await membersOf(projectId))[0].key;

    const res = await owner.agent.delete(`/api/projects/${projectId}/boq/structural-members/${key}`);
    expect(res.status).toBe(200);
    expect(res.body.newVersion).toBe(true);
    // เวอร์ชัน 1 (ส่งไปแล้ว) ยังมีชิ้นส่วนและบรรทัดครบ
    expect(await prisma.structuralMember.count({ where: { projectVersionId: first.body.version.id } })).toBe(1);
    expect(await prisma.boqItem.count({ where: { projectVersionId: first.body.version.id } })).toBe(2);
    expect(await boqItems(projectId)).toHaveLength(0);
  });

  it("แก้ชิ้นส่วน: ต้องส่งขนาด · key ผิดรูปแบบ = 400 · ADMIN ทำได้เหมือนเจ้าของ", async () => {
    const projectId = await newProject("ชิ้นส่วน ตรวจคำขอ");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const key = (await membersOf(projectId))[0].key;
    const items = await boqItems(projectId);
    const noMember = await owner.agent
      .put(`/api/projects/${projectId}/boq/structural-members/${key}`)
      .send({ targets: replaceBody(beam, items).targets });
    expect(noMember.status).toBe(400);
    const badKey = await owner.agent.delete(`/api/projects/${projectId}/boq/structural-members/not-a-key`);
    expect(badKey.status).toBe(400);
    const byAdmin = await admin.agent
      .put(`/api/projects/${projectId}/boq/structural-members/${key}`)
      .send(replaceBody({ ...beam, count: 3 }, items));
    expect(byAdmin.status).toBe(200);
  });

  // ---------- Phase 2 ข้อ 3b: คิดใหม่ทั้งโครงการด้วยชุดเสนอราคาปัจจุบัน ----------

  const recompute = (projectId: string, apply: boolean) =>
    owner.agent.post(`/api/projects/${projectId}/boq/structural-members/recompute`).send({ apply });

  it("คิดใหม่: ชุดกฎไม่เปลี่ยน = ไม่มีอะไรต้องแก้", async () => {
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
    const projectId = await newProject("คิดใหม่ ไม่เปลี่ยน");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const res = await recompute(projectId, false);
    expect(res.status).toBe(200);
    expect(res.body.recompute).toMatchObject({ members: 1, changedMembers: 0, lines: [], costDelta: 0, applied: false });
  });

  it("คิดใหม่หลังเปลี่ยนชุดเสนอราคา: พรีวิวไม่เขียน · ยืนยันแล้วปริมาณตรงกับพรีวิว · key เดิม", async () => {
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
    const projectId = await newProject("คิดใหม่ เปลี่ยนกฎ");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const key = (await membersOf(projectId))[0].key;
    const before = await boqItems(projectId);

    // บริษัทเปลี่ยนชุดเสนอราคาให้หักระยะหุ้ม → เหล็กบน/ล่างสั้นลง
    const tender = { ...DEFAULT_TAKEOFF_RULES.tender, deductCover: true };
    const saved = await owner.agent.put("/api/settings/takeoff-rules").send({ rules: { ...DEFAULT_TAKEOFF_RULES, tender } });
    expect(saved.status).toBe(200);

    const preview = await recompute(projectId, false);
    expect(preview.status).toBe(200);
    const pv = preview.body.recompute;
    expect(pv.changedMembers).toBe(1);
    const db12 = pv.lines.find((l: { name: string }) => l.name === "เหล็กเสริม 12 มม.");
    expect(db12.qtyAfter).toBeLessThan(db12.qtyBefore);
    expect(pv.costDelta).toBeLessThan(0);
    // พรีวิวไม่เขียนอะไร
    expect((await boqItems(projectId)).map((i) => i.quantity)).toEqual(before.map((i) => i.quantity));

    const applied = await recompute(projectId, true);
    expect(applied.body.recompute.applied).toBe(true);
    const after = await boqItems(projectId);
    const line = after.find((i) => i.name === "เหล็กเสริม 12 มม.")!;
    expect(Number(line.quantity)).toBeCloseTo(db12.qtyAfter, 3);
    expect(line.takeoffRows.every((r) => r.memberKey === key)).toBe(true);
    const stored = await prisma.structuralMember.findFirstOrThrow({ where: { key } });
    expect((stored.input as { settings: { rules?: { deductCover?: boolean } } }).settings.rules?.deductCover).toBe(true);
    // คิดซ้ำทันที = ไม่มีอะไรต้องแก้แล้ว
    expect((await recompute(projectId, false)).body.recompute.changedMembers).toBe(0);
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
  });

  it("คิดใหม่หลังส่งใบเสนอราคา: แตกเวอร์ชัน · ใบที่ส่งไปแล้วไม่เปลี่ยน · แถวกรอกเองในบรรทัดเดียวกันคงอยู่", async () => {
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
    const projectId = await newProject("คิดใหม่ หลังส่ง");
    const first = await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const items = await boqItems(projectId);
    const db12 = items.find((i) => i.name === "เหล็กเสริม 12 มม.")!;
    // แถวกรอกเองต่อท้ายในบรรทัดเดียวกัน
    await owner.agent
      .post(`/api/projects/${projectId}/boq/takeoff/apply`)
      .send({ targets: [{ itemId: db12.id, rows: [{ label: "เหล็กเผื่อหน้างาน", count: 1, length: 10, barDia: 12 }] }] });
    const quote = await owner.agent.post(`/api/projects/${projectId}/quotes`).send({});
    await sendQuote(owner.agent, projectId, quote.body.quote.id);
    const v1Qty = Number((await prisma.boqItem.findFirstOrThrow({ where: { projectVersionId: first.body.version.id, name: "เหล็กเสริม 12 มม." } })).quantity);

    await owner.agent
      .put("/api/settings/takeoff-rules")
      .send({ rules: { ...DEFAULT_TAKEOFF_RULES, tender: { ...DEFAULT_TAKEOFF_RULES.tender, deductCover: true } } });
    const pv = (await recompute(projectId, false)).body.recompute;
    expect(pv.willBranch).toBe(true);
    const applied = (await recompute(projectId, true)).body.recompute;
    expect(applied.versionNo).toBe(2);

    const v1Now = Number((await prisma.boqItem.findFirstOrThrow({ where: { projectVersionId: first.body.version.id, name: "เหล็กเสริม 12 มม." } })).quantity);
    expect(v1Now).toBe(v1Qty);
    const v2Line = (await boqItems(projectId)).find((i) => i.name === "เหล็กเสริม 12 มม.")!;
    expect(v2Line.takeoffRows.some((r) => r.label === "เหล็กเผื่อหน้างาน" && r.memberKey === null)).toBe(true);
    expect(Number(v2Line.quantity)).toBeLessThan(v1Qty);
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
  });

  // ---------- Phase 3: แผนตัด (3a) + Excel รายการสั่งเหล็ก (3d) ----------

  it("แผนตัด: แยกตามขนาด เทียบเส้น 10/12 ม. · ความยาวรวมเท่ากับชุดสั่งตัด · แนะนำเส้นที่ซื้อน้อยกว่า", async () => {
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
    const projectId = await newProject("แผนตัด");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody({ ...beam, count: 4 }));
    const res = await owner.agent.get(`/api/projects/${projectId}/boq/rebar-cutting`);
    expect(res.status).toBe(200);
    const { cutting } = res.body;
    expect(cutting.members).toBe(1);
    expect(cutting.byDia.map((d: { code: string }) => d.code)).toEqual(["RB6", "DB12"]);
    const db12 = cutting.byDia.find((d: { dia: number }) => d.dia === 12);
    expect(db12.plans.map((p: { stock: number }) => p.stock)).toEqual([10, 12]);
    // คาน 3 ม. ไม่ทาบ: 4 ชิ้น × 4 เส้น × 3.228 ม. (ชุดสั่งตัด) — ยาวรวมเท่ากันทั้งสองความยาวเส้น
    for (const plan of db12.plans) expect(plan.netLength).toBeCloseTo(16 * 3.228, 3);
    // 10 ม. ได้ 3 ชิ้น/เส้น → 6 เส้น (60 ม.) · 12 ม. ได้ 3 ชิ้น/เส้น → 6 เส้น (72 ม.) → แนะนำ 10
    expect(db12.plans[0].bars).toBe(6);
    expect(db12.recommended).toBe(10);
    // ทุกเส้นที่ซื้อ = ชิ้นที่ตัด + เศษ
    for (const plan of db12.plans) {
      expect(plan.netLength + plan.scrap + plan.offcut).toBeCloseTo(plan.bars * plan.stock, 3);
    }
  });

  it("Excel รายการสั่งเหล็ก: 3 ชีต สรุปขนาด/รายชิ้นส่วน/แผนตัด · ไม่มีชิ้นส่วน = 404", async () => {
    await prisma.setting.deleteMany({ where: { key: TAKEOFF_RULES_KEY } });
    const empty = await newProject("Excel เหล็ก ว่าง");
    const none = await owner.agent.get(`/api/projects/${empty}/boq/rebar-bbs.xlsx`);
    expect(none.status).toBe(404);

    const projectId = await newProject("Excel เหล็ก");
    await owner.agent.post(`/api/projects/${projectId}/boq/takeoff/apply`).send(applyBody(beam));
    const res = await owner.agent
      .get(`/api/projects/${projectId}/boq/rebar-bbs.xlsx`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["สรุปขนาด", "รายชิ้นส่วน", "แผนตัด"]);
    const values = (name: string) =>
      wb.getWorksheet(name)!.getSheetValues().flat().filter((v) => typeof v === "string" || typeof v === "number");
    expect(values("สรุปขนาด")).toEqual(expect.arrayContaining(["RB6", "DB12"]));
    expect(values("รายชิ้นส่วน").some((v) => typeof v === "string" && v.startsWith("B1 · คาน"))).toBe(true);
    expect(values("แผนตัด").some((v) => typeof v === "string" && v.startsWith("DB12 · เส้นยาว"))).toBe(true);
  });
});
