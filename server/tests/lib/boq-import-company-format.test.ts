import ExcelJS from "exceljs";

import { parseBoqImport, type ImportCategory } from "../../src/lib/excel/boq-import";

/**
 * รูปแบบไฟล์ BOQ จริงของบริษัท (บ้านคุณก้อย Rev2) — จำลองโครงที่ทำให้ตัวนำเข้าเดิมพัง:
 * แถวเหนือหัวตาราง "โครงการ :" · หัวสองชั้น ราคาวัสดุ/ค่าแรงงาน + หน่วยละ/จำนวนเงิน (ผสานช่อง) ·
 * ราคาสองชุดข้างกัน (ซ้าย = ราคาในใบเสนอราคา · ขวา "ต้นทุน") · แถวหัวชั้นสองซ้ำ · ยอดรวมหมวด ·
 * รายการที่เว้นว่าง · ชีตสรุป · ชีต "BOQ (BackUp)"
 */
const categories: ImportCategory[] = [{ id: "cat", code: "X", name: "ทดสอบ", usable: true }];

function detailSheet(wb: ExcelJS.Workbook, name: string, lines: [string, number, string, number, number, number, number, number][]) {
  const ws = wb.addWorksheet(name);
  ws.getCell("A1").value = "บัญชีแสดงปริมาณงานและราคา";
  ws.getCell("A2").value = "โครงการ :";
  ws.getCell("B2").value = "บ้านพักอาศัย 2 ชั้น";
  ws.mergeCells("L2:R2");
  ws.getCell("L2").value = "ต้นทุน";
  const top = ["ลำดับที่", "รายการ", "จำนวน", "หน่วย", "ราคาวัสดุ", "ราคาวัสดุ", "ค่าแรงงาน", "ค่าแรงงาน", "รวมค่าวัสดุและ ค่าแรงงาน", "หมายเหตุ", "", "จำนวน", "หน่วย", "ราคาวัสดุ", "ราคาวัสดุ", "ค่าแรงงาน", "ค่าแรงงาน"];
  const sub = ["ลำดับที่", "รายการ", "จำนวน", "หน่วย", "หน่วยละ", "จำนวนเงิน", "หน่วยละ", "จำนวนเงิน", "รวมค่าวัสดุและ ค่าแรงงาน", "หมายเหตุ", "", "จำนวน", "หน่วย", "หน่วยละ", "จำนวนเงิน", "หน่วยละ", "จำนวนเงิน"];
  ws.getRow(3).values = top;
  ws.getRow(4).values = sub;
  // ช่องผสานแนวนอน (ราคาวัสดุ/ค่าแรงงาน) และแนวตั้ง (รายการ/จำนวน แถว 3–4)
  for (const r of ["E3:F3", "G3:H3", "N3:O3", "P3:Q3", "B3:B4", "C3:C4"]) ws.mergeCells(r);
  ws.getRow(6).values = [1, "หมวดงานเตรียมการ"];
  let r = 7;
  for (const [item, qty, unit, mat, lab, costQty, costMat, costLab] of lines) {
    ws.getRow(r++).values = [null, item, qty, unit, mat, qty * mat, lab, qty * lab, qty * (mat + lab), null, null, costQty, unit, costMat, costQty * costMat, costLab, costQty * costLab];
  }
  // รายการที่เว้นไว้ (มีหน่วย ไม่มีปริมาณ/ราคา) · ยอดรวมหมวด (ชื่อซ้ำหัวข้อ + "งาน" + ไม่มีราคาต่อหน่วย)
  ws.getRow(r++).values = [null, "เหล็กกล่อง 1-1/2\"", null, "ท่อน"];
  ws.getRow(r++).values = [null, "หมวดงานเตรียมการ", 1, "งาน", null, 70160, null, 11760, 81920];
  return ws;
}

async function book(withBackup = true) {
  const wb = new ExcelJS.Workbook();
  // ชีตสรุป: มีแต่บรรทัดระดับหมวด
  const sum = wb.addWorksheet("บัญชีสรุปรวมปริมาณงานและราคา ");
  sum.getRow(5).values = ["ลำดับ", "รายการ", "จำนวน", "หน่วย", "ราคาวัสดุ", "ราคาวัสดุ", "ค่าแรงงาน", "ค่าแรงงาน"];
  sum.getRow(6).values = ["ลำดับ", "รายการ", "จำนวน", "หน่วย", "หน่วยละ", "จำนวนเงิน", "หน่วยละ", "จำนวนเงิน"];
  sum.getRow(8).values = [1, "หมวดงานเตรียมการ", 1, "งาน", null, 70160, null, 11760];
  sum.getRow(9).values = [2, "หมวดงานโครงสร้าง", 1, "งาน", null, 527329.2, null, 185275];
  detailSheet(wb, "บัญชีแสดงปริมาณงานและราคา", [
    ["ที่พักคนงาน ไฟฟ้า ประปา ห้องน้ำ", 1, "งาน", 50000, 0, 1, 50000, 0],
    ["อุปกรณ์นั่งร้านค้ำยัน", 168, "ตร.ม.", 120, 70, 168, 110, 70],
    ["เสาเข็มตอก I-0.22x0.22", 19, "ต้น", 3200, 2000, 19, 2800, 1526.32],
    ["ตัดหัวสกัดเสาเข็ม", 19, "ต้น", 0, 250, 19, 0, 180],
    ["ขุดดิน", 35, "ลบ.ม.", 0, 250, 30.346, 0, 100],
  ]);
  if (withBackup) {
    detailSheet(wb, "BOQ (BackUp)", [
      ["รายการเก่า 1", 1, "งาน", 1000, 0, 1, 900, 0],
      ["รายการเก่า 2", 2, "งาน", 1000, 0, 2, 900, 0],
    ]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("นำเข้า: รูปแบบไฟล์ BOQ ของบริษัท", () => {
  it("ค่าแรงไม่หาย: หัวสองชั้นที่เริ่มแถวถัดไปถูกเลือก แม้แถวเหนือขึ้นไปจับคู่ได้ครบ", async () => {
    const p = await parseBoqImport(await book(), categories, "cat");
    const scaffold = p.rows.find((r) => r.name === "อุปกรณ์นั่งร้านค้ำยัน")!;
    expect(scaffold).toMatchObject({ quantity: 168, unit: "ตร.ม.", materialUnitPrice: 120, laborUnitPrice: 70 });
    expect(p.headerWarnings).toEqual([]);
  });

  it("ข้ามชีตสรุป + ชีตสำรอง · แถวหัวชั้นสอง ยอดหมวด รายการว่าง ไม่กลายเป็นงาน", async () => {
    const p = await parseBoqImport(await book(), categories, "cat");
    expect(p.sheets.map((s) => [s.name, s.selected])).toEqual([
      ["บัญชีสรุปรวมปริมาณงานและราคา ", false],
      ["บัญชีแสดงปริมาณงานและราคา", true],
      ["BOQ (BackUp)", false],
    ]);
    expect(p.sheets[0].reason).toContain("สรุป");
    expect(p.sheetNames).toEqual(["บัญชีแสดงปริมาณงานและราคา"]);
    expect(p.rows.map((r) => r.name)).toHaveLength(5);
    expect(p.rows.every((r) => r.errors.length === 0)).toBe(true);
    const kinds = Object.fromEntries(p.skippedRows.map((s) => [s.name, s.kind]));
    expect(kinds['เหล็กกล่อง 1-1/2"']).toBe("empty");
    expect(p.skippedRows.filter((s) => s.name === "หมวดงานเตรียมการ").map((s) => s.kind)).toEqual(["heading", "total"]);
  });

  it("ราคาสองชุด: ตั้งต้นชุดซ้าย · เลือกชุด 'ต้นทุน' ได้ ปริมาณ/ราคามาจากฝั่งขวา", async () => {
    const left = await parseBoqImport(await book(), categories, "cat");
    expect(left.priceSet).toBe(0);
    expect(left.priceSets.map((s) => s.label)).toEqual(["ชุดซ้าย · คอลัมน์ C–G", "ต้นทุน · คอลัมน์ L–P"]);
    const right = await parseBoqImport(await book(), categories, "cat", [], { priceSet: 1 });
    expect(right.priceSet).toBe(1);
    expect(right.rows.find((r) => r.name === "ขุดดิน")).toMatchObject({ quantity: 30.346, materialUnitPrice: 0, laborUnitPrice: 100 });
    expect(right.rows.find((r) => r.name === "อุปกรณ์นั่งร้านค้ำยัน")?.materialUnitPrice).toBe(110);
  });

  it("ติ๊กชีตเอง: เลือกชีตสำรองเพิ่มได้ · ไม่เลือกเลย = บอกเหตุผล", async () => {
    const both = await parseBoqImport(await book(), categories, "cat", [], {
      sheets: ["บัญชีแสดงปริมาณงานและราคา", "BOQ (BackUp)"],
    });
    expect(both.rows).toHaveLength(7);
    await expect(parseBoqImport(await book(), categories, "cat", [], { sheets: [] })).rejects.toThrow("ยังไม่ได้เลือกชีต");
  });

  it("หาคอลัมน์ค่าแรงไม่เจอ = เตือน ไม่ใช่เป็น 0 เงียบ ๆ", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("BOQ");
    ws.getRow(1).values = ["รายการ", "จำนวน", "หน่วย", "ราคาวัสดุ"];
    ws.getRow(2).values = ["ทรายถม", 10, "ลบ.ม.", 450];
    const p = await parseBoqImport(Buffer.from(await wb.xlsx.writeBuffer()), categories, "cat");
    expect(p.headerWarnings).toEqual(['ชีต "BOQ": ไม่พบคอลัมน์ค่าแรง — ค่าแรงทุกบรรทัดจะเป็น 0']);
    expect(p.rows[0]).toMatchObject({ materialUnitPrice: 450, laborUnitPrice: 0 });
  });
});
