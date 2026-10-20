import { buildChangeOrderLines, changeOrderTotals, planInstallments } from "../../src/lib/change-order";

const line = (name: string, quantity: number, costUnitPrice: number) => ({ name, unit: "หน่วย", quantity, costUnitPrice });

/** ตัวเลขของใบงานเพิ่ม-ลด: ราคาขายรายบรรทัด · ยอดสุทธิจากสองเวอร์ชัน · เงินไปอยู่งวดไหน */
describe("ใบงานเพิ่ม-ลด", () => {
  it("แถวเป็นราคาขาย (ปัดราคาต่อหน่วยก่อนคูณ) และไม่เอาบรรทัดที่ไม่เปลี่ยน", () => {
    const lines = buildChangeOrderLines(
      [
        { kind: "added", categoryCode: "A-01", before: null, after: line("ปูกระเบื้องเพิ่ม", 10, 100) },
        { kind: "removed", categoryCode: "A-02", before: line("ฝ้าเดิม", 5, 200), after: null },
        { kind: "changed", categoryCode: "A-03", before: line("ทาสี", 10, 100), after: line("ทาสี", 12, 100) },
        { kind: "unchanged", categoryCode: "A-04", before: line("ก่ออิฐ", 3, 50), after: line("ก่ออิฐ", 3, 50) },
      ],
      1.1,
      1.1,
    );
    expect(lines.map((l) => [l.kind, l.delta])).toEqual([
      ["added", "1100.00"],
      ["removed", "-1100.00"],
      ["changed", "220.00"],
    ]);
    expect(lines[0]).toMatchObject({ afterUnitPrice: "110.00", beforeQty: null, beforeTotal: "0.00" });
  });

  it("อัตรากำไรเปลี่ยน → บรรทัดที่ไม่ได้แก้แต่ราคาขายขยับก็ต้องอยู่ในใบ", () => {
    const lines = buildChangeOrderLines(
      [{ kind: "unchanged", categoryCode: null, before: line("ก่ออิฐ", 10, 100), after: line("ก่ออิฐ", 10, 100) }],
      1.1,
      1.2,
    );
    expect(lines).toEqual([expect.objectContaining({ kind: "changed", beforeTotal: "1100.00", afterTotal: "1200.00", delta: "100.00" })]);
  });

  it("ยอดสุทธิมาจากสองเวอร์ชัน ส่วนต่างจากส่วนลด/ปัดเศษแสดงเป็นแถวปรับ", () => {
    const lines = buildChangeOrderLines(
      [{ kind: "added", categoryCode: null, before: null, after: line("งานเพิ่ม", 1, 1000) }],
      1.1,
      1.1,
    );
    // ราคาก่อน VAT 11,000 → 12,050 (ส่วนลด 5% ของส่วนที่เพิ่ม = −50) · VAT 7%
    const totals = changeOrderTotals(lines, { netPrice: 11770, vatAmt: 770 }, { netPrice: 12893.5, vatAmt: 843.5 });
    expect(totals).toEqual({
      addAmount: "1100.00",
      deductAmount: "0.00",
      adjustAmount: "-50.00",
      netBeforeVat: "1050.00",
      vatAmount: "73.50",
      totalAmount: "1123.50",
    });
  });

  describe("งวดเงิน", () => {
    const plan = [
      { id: "a", seq: 1, milestone: "มัดจำ", amount: 30000, paid: 30000, invoiced: false },
      { id: "b", seq: 2, milestone: "โครงสร้าง", amount: 40000, paid: 0, invoiced: true },
      { id: "c", seq: 3, milestone: "ส่งมอบ", amount: 30000, paid: 10000, invoiced: false },
    ];

    it("งานเพิ่ม = งวดใหม่ต่อท้าย", () => {
      expect(planInstallments(5000, "งานเพิ่ม-ลด ครั้งที่ 1", plan)).toEqual({
        kind: "create",
        seq: 4,
        milestone: "งานเพิ่ม-ลด ครั้งที่ 1",
        amount: 5000,
      });
    });

    it("งานลดหักงวดท้ายเฉพาะส่วนที่ยังไม่ได้รับ", () => {
      expect(planInstallments(-15000, "x", plan)).toEqual({
        kind: "reduce",
        changes: [{ id: "c", seq: 3, milestone: "ส่งมอบ", from: 30000, to: 15000 }],
      });
    });

    it("หักไม่พอ (งวดที่รับแล้ว/วางบิลแล้วแตะไม่ได้) → ไม่ทำ บอกเหตุผล", () => {
      const res = planInstallments(-25000, "x", plan);
      expect(res.kind).toBe("blocked");
      expect(res.kind === "blocked" && res.reason).toContain("20,000.00");
    });

    it("ไม่มีเงินเปลี่ยน = ไม่แตะงวด", () => {
      expect(planInstallments(0, "x", plan)).toEqual({ kind: "none" });
    });
  });
});
