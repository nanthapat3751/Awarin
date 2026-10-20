import ExcelJS from "exceljs";

import { ImportFileError, parseBoqImport, type ImportCategory } from "../../src/lib/excel/boq-import";

/**
 * ตัวนำเข้ารู้จักหัวตารางหลายแบบ — ชื่อคอลัมน์ที่บริษัทใช้จริง + หัวสองชั้นแบบฟอร์ม BOQ ไทย (ปร.4)
 *
 * จุดที่ห้ามพัง: "จำนวนเงิน" ต้องไม่ถูกจับเป็นปริมาณ · คอลัมน์จำนวนเงินใต้ค่าวัสดุต้องไม่ถูกจับเป็นราคาต่อหน่วย ·
 * "ราคาต่อหน่วย" โดด ๆ (ราคาขาย) ยังต้องถูกปฏิเสธ
 */

const CATEGORY: ImportCategory = { id: "cat-1", code: "A-01-01", name: "ทดสอบ", usable: true };

async function fileOf(build: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  build(wb.addWorksheet("BOQ บริษัท"));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const parse = (buffer: Buffer) => parseBoqImport(buffer, [CATEGORY], CATEGORY.id);

describe("นำเข้า Excel — หัวตารางหลายรูปแบบ", () => {
  it("ชื่อคอลัมน์แบบอื่น: ลำดับที่ / รายการวัสดุ / Qty / Unit / ราคาวัสดุ / ราคาค่าแรง / Remark", async () => {
    const preview = await parse(
      await fileOf((ws) => {
        ws.addRow(["บริษัท ตัวอย่าง จำกัด"]);
        ws.addRow(["ลำดับที่", "รายการวัสดุ", "Qty", "Unit", "ราคาวัสดุ", "ราคาค่าแรง", "Remark"]);
        ws.addRow([1, "เทพื้นคอนกรีต", 12.5, "ลบ.ม.", 2400, 500, "ชั้น 1"]);
      }),
    );
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0]).toMatchObject({ name: "เทพื้นคอนกรีต", quantity: 12.5, unit: "ลบ.ม.", materialUnitPrice: 2400, laborUnitPrice: 500, note: "ชั้น 1", errors: [] });
  });

  it("ตัดวงเล็บหน่วยเงินและจุดท้ายได้: \"ค่าวัสดุต่อหน่วย (บาท)\" · \"No.\" · \"Quantity\"", async () => {
    const preview = await parse(
      await fileOf((ws) => {
        ws.addRow(["No.", "Description", "Quantity", "Unit", "ค่าวัสดุต่อหน่วย (บาท)", "ค่าแรงงานต่อหน่วย (บาท)"]);
        ws.addRow([1, "ก่ออิฐมอญ", 40, "ตร.ม.", 220, 180]);
      }),
    );
    expect(preview.rows[0]).toMatchObject({ name: "ก่ออิฐมอญ", quantity: 40, materialUnitPrice: 220, laborUnitPrice: 180 });
  });

  it("\"จำนวนเงิน\" ไม่ใช่ปริมาณ — ปริมาณมาจากคอลัมน์ปริมาณจริงแม้จำนวนเงินอยู่ก่อน", async () => {
    const preview = await parse(
      await fileOf((ws) => {
        ws.addRow(["รายการ", "จำนวนเงิน", "ปริมาณ", "หน่วย", "ค่าวัสดุ/หน่วย"]);
        ws.addRow(["เดินท่อ", 35000, 10, "ม.", 3500]);
      }),
    );
    expect(preview.rows[0]).toMatchObject({ quantity: 10, materialUnitPrice: 3500 });
  });

  it("หัวสองชั้นแบบ ปร.4 (ช่องผสาน): ค่าวัสดุ / ค่าแรงงาน → ราคาต่อหน่วย | จำนวนเงิน", async () => {
    const preview = await parse(
      await fileOf((ws) => {
        ws.addRow(["แบบ ปร.4 แผ่นที่ 1"]);
        ws.addRow(["ลำดับ", "รายการ", "จำนวน", "หน่วย", "ค่าวัสดุ", "", "ค่าแรงงาน", "", "รวม", "หมายเหตุ"]);
        ws.addRow(["", "", "", "", "ราคาต่อหน่วย", "จำนวนเงิน", "ราคาต่อหน่วย", "จำนวนเงิน", "", ""]);
        for (const range of ["A2:A3", "B2:B3", "C2:C3", "D2:D3", "E2:F2", "G2:H2", "I2:I3", "J2:J3"]) ws.mergeCells(range);
        ws.addRow([1, "งานขุดดิน", 24, "ลบ.ม.", 0, 0, 100, 2400, 2400, ""]);
        ws.addRow([2, "คอนกรีตหยาบ", 4.85, "ลบ.ม.", 2100, 10185, 450, 2182.5, 12367.5, "หนา 10 ซม."]);
        ws.addRow(["", "รวม", null, "", "", 10185, "", 4582.5, 14767.5, ""]);
      }),
    );
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({ name: "งานขุดดิน", quantity: 24, materialUnitPrice: 0, laborUnitPrice: 100, errors: [] });
    expect(preview.rows[1]).toMatchObject({ name: "คอนกรีตหยาบ", quantity: 4.85, materialUnitPrice: 2100, laborUnitPrice: 450, note: "หนา 10 ซม." });
    // เลขแถวชี้ไปแถวจริงใต้หัวสองชั้น (หัวกิน 2 แถว)
    expect(preview.rows.map((r) => r.rowNumber)).toEqual([4, 5]);
  });

  it("หัวสองชั้นไม่ผสานช่อง + ชั้นบน \"ราคาวัสดุ\": ช่องจำนวนเงินใต้มันต้องไม่ถูกจับเป็นราคาต่อหน่วย", async () => {
    const preview = await parse(
      await fileOf((ws) => {
        ws.addRow(["รายการ", "ปริมาณ", "หน่วย", "ราคาวัสดุ", "", "ราคาค่าแรง", ""]);
        ws.addRow(["", "", "", "จำนวนเงิน", "หน่วยละ", "จำนวนเงิน", "หน่วยละ"]);
        ws.addRow(["ฉาบปูน", 800, "ตร.ม.", 144000, 180, 104000, 130]);
      }),
    );
    expect(preview.rows[0]).toMatchObject({ name: "ฉาบปูน", quantity: 800, materialUnitPrice: 180, laborUnitPrice: 130 });
  });

  it("ยังไม่รับ \"ราคาต่อหน่วย\" โดด ๆ (ราคาขาย) — กันกำไรถูกบวกซ้ำ", async () => {
    const file = await fileOf((ws) => {
      ws.addRow(["ลำดับ", "รายการ", "จำนวน", "หน่วย", "ราคาต่อหน่วย", "จำนวนเงิน"]);
      ws.addRow([1, "งาน", 1, "งาน", 1000, 1000]);
    });
    await expect(parse(file)).rejects.toThrow(ImportFileError);
    await expect(parse(file)).rejects.toThrow("ราคาขาย");
  });

  it("หัวข้อกลุ่มกับยอดรวมของไฟล์บริษัทถูกข้าม ไม่ขึ้นเป็นข้อผิดพลาด · แถวงานที่กรอกไม่ครบยังฟ้อง", async () => {
    const preview = await parse(
      await fileOf((ws) => {
        ws.addRow(["ลำดับ", "รายการ", "จำนวน", "หน่วย", "ค่าวัสดุ/หน่วย", "ค่าแรง/หน่วย", "รวม"]);
        ws.addRow(["A", "งานหลังคารอบบ้าน"]); // หัวข้อ: มีแต่รหัส+ชื่อ
        ws.addRow([1, "มุงหลังคาเมทัลชีท", 120, "ตร.ม.", 250, 80, 39600]);
        ws.addRow([2, "ติดตั้งรางน้ำ", "", "", 300, 0, 0]); // งานจริงที่ลืมกรอกปริมาณ/หน่วย
        // ยอดรวมผสานช่องจากรายการยาวถึงค่าแรง — ช่องปริมาณ/หน่วยคือส่วนของช่องผสาน ไม่ใช่ข้อมูล
        const total = ws.addRow(["", "รวมมูลค่างานหลังคารอบบ้าน", "", "", "", "", 39600]);
        ws.mergeCells(total.number, 2, total.number, 6);
        ws.addRow(["B", "งานรั้ว"]);
        ws.addRow([1, "ก่ออิฐรั้ว", 30, "ตร.ม.", 220, 180, 12000]);
      }),
    );
    expect(preview.rows.map((r) => r.name)).toEqual(["มุงหลังคาเมทัลชีท", "ติดตั้งรางน้ำ", "ก่ออิฐรั้ว"]);
    expect(preview.rows[0].errors).toEqual([]);
    expect(preview.rows[1].errors).toEqual(["ไม่มีปริมาณ", "ไม่มีหน่วย"]);
    expect(preview.skippedRows).toEqual([
      { sheet: "BOQ บริษัท", rowNumber: 2, code: "A", name: "งานหลังคารอบบ้าน", kind: "heading" },
      { sheet: "BOQ บริษัท", rowNumber: 5, code: null, name: "รวมมูลค่างานหลังคารอบบ้าน", kind: "total" },
      { sheet: "BOQ บริษัท", rowNumber: 6, code: "B", name: "งานรั้ว", kind: "heading" },
    ]);
  });
});
