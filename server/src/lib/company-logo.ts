import { writeAuditLog } from "./audit-log";
import { companyLogoDataUri, companyLogoSmallDataUri } from "./pdf/letterhead";
import { prisma } from "./prisma";

/**
 * โลโก้บนเอกสารที่บริษัทอัปโหลดเอง
 *
 * เก็บเป็น data URI ในตาราง Setting ไม่ใช่ไฟล์ในโฟลเดอร์ uploads — PDF ต้องการ data URI อยู่แล้ว
 * (page.setContent ไม่มี base URL ให้อ้างไฟล์) และไม่ต้องแปลงชื่อไฟล์จากค่าใน DB กลับเป็น path
 * บนดิสก์ ซึ่งเป็นช่องให้ path traversal ถ้าวันหนึ่งคีย์นี้ถูกเขียนผ่านทางอื่น
 *
 * ไม่มีแถว / ค่าว่าง = ใช้ไฟล์ตั้งต้นใน src/assets เหมือนก่อนมีฟีเจอร์นี้
 *
 * สองคีย์นี้ **ห้ามอยู่ใน EDITABLE_SETTING_KEYS** — เขียนได้ทางเดียวคือ saveCompanyLogo ที่ตรวจไฟล์ก่อน
 * และถูกกันออกจาก getSettingsMap ไม่ให้ก้อนรูปหลายสิบ KB ติดไปกับทุกคำขอที่อ่านค่าตั้ง
 */
export const LOGO_KEY = "companyLogoPng";
export const LOGO_SMALL_KEY = "companyLogoSmallPng";
export const LOGO_KEYS = [LOGO_KEY, LOGO_SMALL_KEY];

/**
 * หน้าจอย่อรูปให้ก่อนส่ง (ใหญ่ ≤ 240×130 · เล็กสูง 34px) เพดานตรงนี้จึงเผื่อไว้กว้างกว่านั้น
 * แต่ยังกันรูปที่ประกาศขนาดมหึมาใน header ได้ — Chrome จองหน่วยความจำตามขนาดที่ประกาศตอนถอดรูป
 * PNG ขนาด 20000×20000 ไฟล์เล็กนิดเดียวก็ทำให้ตัวสร้าง PDF ล้มได้
 */
export const LOGO_LIMITS = {
  large: { maxBytes: 200 * 1024, maxWidth: 480, maxHeight: 480 },
  small: { maxBytes: 40 * 1024, maxWidth: 320, maxHeight: 80 },
} as const;

export class LogoError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "LogoError";
    this.status = status;
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** ขนาดของรูปจาก chunk IHDR — คืน null ถ้าไม่ใช่ไฟล์ PNG */
export function readPngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) return null;
  }
  // IHDR ต้องเป็น chunk แรกเสมอตามสเปก PNG
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

function checkPng(buf: Buffer, kind: keyof typeof LOGO_LIMITS) {
  const limits = LOGO_LIMITS[kind];
  const size = readPngSize(buf);
  if (!size) throw new LogoError("ไฟล์โลโก้ต้องเป็นรูป PNG");
  if (buf.length > limits.maxBytes) {
    throw new LogoError(`ไฟล์โลโก้ใหญ่เกิน ${Math.round(limits.maxBytes / 1024)} KB`);
  }
  if (size.width > limits.maxWidth || size.height > limits.maxHeight) {
    throw new LogoError(
      `รูปโลโก้ใหญ่เกิน ${limits.maxWidth}×${limits.maxHeight} พิกเซล (ได้ ${size.width}×${size.height})`,
    );
  }
  return size;
}

/** โลโก้ที่ใช้พิมพ์จริงตอนนี้ — ของที่อัปโหลดไว้ ถ้าไม่มีก็ไฟล์ตั้งต้น */
export async function getCompanyLogos(): Promise<{
  logo: string | null;
  logoSmall: string | null;
  custom: boolean;
}> {
  const rows = await prisma.setting.findMany({ where: { key: { in: LOGO_KEYS } } });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const logo = byKey[LOGO_KEY];
  const logoSmall = byKey[LOGO_SMALL_KEY];
  // ต้องมีครบทั้งคู่ — ใช้ไฟล์ใหญ่ของบริษัทกับไฟล์เล็กตั้งต้นปนกันจะได้โลโก้คนละอันบนหน้าเดียวกัน
  if (logo && logoSmall) return { logo, logoSmall, custom: true };
  return { logo: companyLogoDataUri(), logoSmall: companyLogoSmallDataUri(), custom: false };
}

export async function saveCompanyLogo(large: Buffer, small: Buffer, actorId: string): Promise<void> {
  const largeSize = checkPng(large, "large");
  const smallSize = checkPng(small, "small");

  const values: [string, string][] = [
    [LOGO_KEY, `data:image/png;base64,${large.toString("base64")}`],
    [LOGO_SMALL_KEY, `data:image/png;base64,${small.toString("base64")}`],
  ];
  await prisma.$transaction(
    values.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        update: { value, updatedById: actorId },
        create: { key, value, updatedById: actorId },
      }),
    ),
  );

  await writeAuditLog({
    userId: actorId,
    action: "UPDATE_COMPANY_LOGO",
    entityType: "Setting",
    // ขนาดพอให้ย้อนดูได้ว่าเปลี่ยนเมื่อไร — ไม่ใส่ตัวรูปลงบันทึก (หลายสิบ KB ต่อแถว)
    details: {
      large: { ...largeSize, bytes: large.length },
      small: { ...smallSize, bytes: small.length },
    },
  });
}

/** กลับไปใช้โลโก้ตั้งต้น — เก็บเป็นค่าว่างไว้ ไม่ลบแถว เพื่อให้ยังรู้ว่าใครเป็นคนเปลี่ยนล่าสุด */
export async function resetCompanyLogo(actorId: string): Promise<void> {
  await prisma.$transaction(
    LOGO_KEYS.map((key) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: "", updatedById: actorId },
        create: { key, value: "", updatedById: actorId },
      }),
    ),
  );
  await writeAuditLog({
    userId: actorId,
    action: "RESET_COMPANY_LOGO",
    entityType: "Setting",
  });
}
