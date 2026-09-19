/**
 * สร้างไฟล์ CSV ที่ "เปิดใน Excel แล้วอ่านออก" — ไม่ใช่แค่ข้อความคั่นด้วยจุลภาค
 *
 * มีสองกับดักที่ทำให้ไฟล์ส่งออกใช้งานจริงไม่ได้ ถ้าไม่จัดการตรงนี้:
 *
 * 1. **ภาษาไทยกลายเป็นตัวยึกยือ** — Excel บน Windows ไม่ได้เดาว่าไฟล์เป็น UTF-8 มันอ่านด้วย
 *    รหัสภาษาของเครื่อง เว้นแต่ไฟล์จะขึ้นต้นด้วย BOM
 * 2. **สูตรแฝง (CSV injection)** — ช่องที่ขึ้นต้นด้วย = + - @ หรือแท็บ Excel ถือเป็นสูตรและ
 *    รันให้ ชื่อลูกค้าหรือบันทึกที่พิมพ์ว่า `=HYPERLINK(...)` จึงกลายเป็นช่องทางโจมตีคนที่เปิดไฟล์
 *    ป้องกันด้วยการเติม `'` นำหน้า ซึ่ง Excel แสดงเป็นข้อความธรรมดาและไม่พิมพ์เครื่องหมายนั้นออกมา
 */

const BOM = "\uFEFF";
const RISKY_PREFIX = /^[=+\-@\t\r]/;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text: string;
  if (value instanceof Date) text = value.toISOString();
  // อ็อบเจ็กต์/อาร์เรย์เขียนเป็น JSON — String() จะได้ "[object Object]" ที่อ่านไม่ออก
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value as string | number | boolean | bigint | symbol);
  if (RISKY_PREFIX.test(text)) text = `'${text}`;
  // ตัด newline ในช่องให้เป็นช่องว่าง — หนึ่งแถวข้อมูลควรเป็นหนึ่งบรรทัดในไฟล์ ไม่งั้นเครื่องมือ
  // ที่อ่าน CSV แบบง่าย ๆ (รวมถึงการเปิดดูด้วยตาเปล่า) จะนับแถวเพี้ยน
  text = text.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
  return `"${text.replaceAll('"', '""')}"`;
}

/** แถวหัวตาราง + แถวข้อมูล → เนื้อไฟล์ CSV พร้อมส่ง (ใส่ BOM ให้แล้ว) */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(cell).join(","), ...rows.map((row) => row.map(cell).join(","))];
  // CRLF เพราะเป็นตัวจบบรรทัดที่ Excel คาดหวังตามสเปก RFC 4180
  return BOM + lines.join("\r\n") + "\r\n";
}

/**
 * ชื่อไฟล์ดาวน์โหลดที่ปลอดภัยกับ header — ส่งชื่อไทยผ่าน `filename*` แบบ RFC 5987
 * และคงชื่อ ASCII ไว้ใน `filename` ให้เบราว์เซอร์รุ่นเก่าที่อ่าน `filename*` ไม่เป็น
 */
export function contentDisposition(asciiName: string, utf8Name = asciiName): string {
  const safeAscii = asciiName.replace(/[^\w.-]/g, "_");
  return `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(utf8Name)}`;
}

/** วันที่แบบไทยสำหรับช่องในไฟล์ส่งออก — ว่าง = ไม่มีข้อมูล ไม่ใช่ขีดกลาง (ขีดกลางจะถูกอ่านเป็นค่า) */
export function csvDateTime(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function csvDate(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}
