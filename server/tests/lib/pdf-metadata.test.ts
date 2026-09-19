import { PDFDocument } from "pdf-lib";

import { applyPdfMetadata } from "../../src/lib/pdf/metadata";

/** PDF เปล่า ๆ ที่ไม่มี metadata อะไรเลย — จำลองไฟล์ที่ Chrome สร้างให้ */
async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]);
  return doc.save();
}

describe("applyPdfMetadata", () => {
  it("เขียนชื่อเอกสารภาษาไทยลงไฟล์แล้วอ่านกลับมาได้ตรงกัน", async () => {
    const out = await applyPdfMetadata(await blankPdf(), {
      title: "BOQ QT-2026-0342 · บ้านพักอาศัย 2 ชั้น",
      author: "Awarin Engineering Co., Ltd.",
      subject: "โครงการ PRJ-2026-0866 บ้านพักอาศัย 2 ชั้น",
    });

    const reread = await PDFDocument.load(out, { updateMetadata: false });
    expect(reread.getTitle()).toBe("BOQ QT-2026-0342 · บ้านพักอาศัย 2 ชั้น");
    expect(reread.getAuthor()).toBe("Awarin Engineering Co., Ltd.");
    expect(reread.getSubject()).toBe("โครงการ PRJ-2026-0866 บ้านพักอาศัย 2 ชั้น");
  });

  it("ยังเป็นไฟล์ PDF ที่ใช้ได้และหน้ากระดาษไม่หาย", async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 300]);
    source.addPage([300, 300]);

    const out = await applyPdfMetadata(await source.save(), { title: "สองหน้า" });

    expect(Buffer.from(out).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("ใส่แค่ title ได้ ไม่บังคับ author/subject", async () => {
    const out = await applyPdfMetadata(await blankPdf(), { title: "เฉพาะชื่อ" });
    const reread = await PDFDocument.load(out, { updateMetadata: false });
    expect(reread.getTitle()).toBe("เฉพาะชื่อ");
    expect(reread.getAuthor()).toBeUndefined();
  });

  // ชื่อเอกสารเป็นของประกอบ ไม่ใช่เนื้อหา — ไฟล์ต้องถึงมือผู้ใช้เสมอแม้เขียน metadata ไม่ได้
  it("ไฟล์ที่อ่านไม่ออก: คืนไฟล์ต้นฉบับแทนการโยน error", async () => {
    const broken = new Uint8Array([1, 2, 3, 4, 5]);
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    const out = await applyPdfMetadata(broken, { title: "ไม่มีทางเขียนได้" });

    expect(out).toBe(broken);
    expect(spy).toHaveBeenCalled(); // ต้องไม่หายเงียบ
    spy.mockRestore();
  });
});
