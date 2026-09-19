import { diffBoqItems, type DiffItem } from "../../src/lib/boq-diff";

let seq = 0;
function item(over: Partial<DiffItem>): DiffItem {
  seq += 1;
  return {
    id: `i${seq}`,
    lineage: null,
    categoryId: "cat",
    materialId: null,
    name: "รายการ",
    unit: "ตร.ม.",
    quantity: 1,
    materialUnitPrice: 100,
    laborUnitPrice: 50,
    lineTotal: 150,
    sortOrder: seq,
    ...over,
  };
}

describe("diffBoqItems", () => {
  it("จับคู่ตามสายคัดลอกก่อน — แก้ชื่อแล้วยังเป็น 'แก้ไข' ไม่ใช่ลบ+เพิ่ม", () => {
    const a = item({ name: "ผนังก่ออิฐ" });
    const b = item({ lineage: a.id, name: "ผนังก่ออิฐมวลเบา", quantity: 2 });
    const [r] = diffBoqItems([a], [b]);
    expect(r.kind).toBe("changed");
    expect(r.changed).toEqual(["name", "quantity"]);
  });

  it("ไม่มีสาย → จับด้วยวัสดุเดียวกันในหมวดเดียวกัน · ค่าเท่าเดิม = ไม่เปลี่ยน", () => {
    const a = item({ materialId: "m1", name: "เดิม" });
    const b = item({ materialId: "m1", name: "เดิม" });
    expect(diffBoqItems([a], [b])[0].kind).toBe("unchanged");
  });

  it("บรรทัดกรอกเองที่ไม่มีสาย จับด้วยชื่อ+หน่วย · ชื่อซ้ำหลายบรรทัดจับตามลำดับ", () => {
    const a1 = item({ name: "อื่น ๆ", quantity: 1 });
    const a2 = item({ name: "อื่น ๆ", quantity: 2 });
    const b1 = item({ name: "อื่น ๆ", quantity: 1 });
    const b2 = item({ name: "อื่น ๆ", quantity: 3 });
    const res = diffBoqItems([a1, a2], [b1, b2]);
    expect(res.map((r) => r.kind)).toEqual(["unchanged", "changed"]);
    expect(res[1].before).toBe(a2);
  });

  it("เพิ่ม/ลบ", () => {
    const gone = item({ name: "รื้อถอน" });
    const kept = item({ materialId: "m2" });
    const keptAfter = item({ materialId: "m2", lineage: kept.id });
    const fresh = item({ name: "งานใหม่" });
    const res = diffBoqItems([gone, kept], [keptAfter, fresh]);
    expect(res.map((r) => r.kind).sort()).toEqual(["added", "removed", "unchanged"]);
    expect(res.find((r) => r.kind === "removed")?.before).toBe(gone);
    expect(res.find((r) => r.kind === "added")?.after).toBe(fresh);
  });

  it("ราคาต่างกันแค่เศษทศนิยมของ floating point ไม่นับว่าเปลี่ยน", () => {
    const a = item({ materialUnitPrice: 0.1 + 0.2, quantity: 1.0005 });
    const b = item({ lineage: a.id, materialUnitPrice: 0.3, quantity: 1.0005 });
    expect(diffBoqItems([a], [b])[0].kind).toBe("unchanged");
  });

  it("สายที่ชี้ไปบรรทัดที่ถูกจับคู่ไปแล้ว ไม่จับซ้ำ", () => {
    const a = item({});
    const b1 = item({ lineage: a.id });
    const b2 = item({ lineage: a.id, name: "อีกบรรทัด" });
    const kinds = diffBoqItems([a], [b1, b2]).map((r) => r.kind);
    expect(kinds).toEqual(["unchanged", "added"]);
  });
});
