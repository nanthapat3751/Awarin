// แพ็กเกจนี้ build ออกสองแบบ: CommonJS (dist/ สำหรับ Node server + jest) และ ESM จริง
// (dist/esm/ ให้ Vite หยิบไปใช้ผ่าน field "module") การ re-export แบบระบุชื่อ (ไม่ใช่
// `export *`) ช่วยให้กราฟ ESM ชัดเจนและ tree-shake ได้
export { EMAIL_ERROR_MESSAGE, looksLikeEmail } from "./email";
export {
  SITE_IMAGE_SLOTS,
  SITE_IMAGE_KEYS,
  isSafeImageUrl,
  resolveSiteImage,
  type SiteImageSlot,
  type SiteImageKey,
} from "./site-image";
export {
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
  NAME_REQUIRED_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
  NAME_CHARS_MESSAGE,
  NAME_FULL_MESSAGE,
  isValidFullName,
  normalizeFullName,
  validateFullName,
} from "./full-name";
export {
  THAI_MOBILE_ERROR_MESSAGE,
  formatThaiMobile,
  isValidThaiMobile,
  normalizeThaiMobile,
  stripPhoneSeparators,
  thaiMobileToE164,
} from "./thai-phone";
export { GENERAL_INQUIRY_SERVICE_TYPE, SERVICE_TYPES } from "./service-type";

export type Role = "OWNER" | "ADMIN" | "CUSTOMER";

export type ProjectStatus =
  | "DRAFT"
  | "QUOTED"
  // ลูกค้าปฏิเสธใบเสนอราคา — ยังไม่ปิดตาย ออกฉบับใหม่แล้วส่งจะกลับไปเป็น QUOTED เอง
  | "REJECTED"
  | "APPROVED"
  | "COMPLETED"
  | "CANCELLED";

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "REVISED";

export type LeadStatus = "NEW" | "CONTACTED" | "QUOTED" | "CLOSED" | "REJECTED";

// ESTIMATE = ราคาประเมินอัตโนมัติจาก BOQ, CUSTOM = ออกแบบใหม่/กำหนดเอง (กรอกราคาเอง + แนบไฟล์จริง)
export type ProjectType = "ESTIMATE" | "CUSTOM";

export type AttachmentKind = "DESIGN" | "QUOTE" | "OTHER";
export type AttachmentVisibility = "INTERNAL" | "CUSTOMER";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  // เปิดใช้ยืนยันตัวตน 2 ชั้น (2FA/TOTP) อยู่หรือไม่ — ใช้โชว์ป้ายสถานะในเมนูฝั่งพนักงาน
  twoFactorEnabled: boolean;
}

// บัญชีพนักงาน (OWNER/ADMIN) สำหรับหน้าจัดการผู้ใช้ของ OWNER — ไม่รวมลูกค้า และไม่ส่งรหัสผ่าน
export interface StaffUserDto {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export type WorkCategoryLevel = "CATEGORY" | "SUBGROUP" | "ITEM";

export interface WorkCategoryDto {
  id: string;
  parentId: string | null;
  level: WorkCategoryLevel;
  code: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  active: boolean;
}

// ฟิลด์ Decimal จะถูกแปลงเป็น string เมื่อส่งผ่าน JSON
// วัสดุย่อยหนึ่งบรรทัดในสูตรถอดปริมาณ (bill of materials) — ต่อ 1 หน่วยของรายการแม่.
// ใช้เป็นรูปร่างร่วมของทั้ง snapshot ในบรรทัด BOQ และในแม่แบบ (Decimal → string)
export interface MaterialComponentSnapshotDto {
  // อ้างวัสดุดิบจากแคตตาล็อก (null = กรอกชื่อ/หน่วย/ราคาเอง) — ใช้จับกลุ่มในรายงานสรุปวัสดุ
  componentMaterialId: string | null;
  name: string;
  unit: string;
  // ปริมาณวัสดุย่อยต่อ 1 หน่วยของรายการแม่ (เช่น ปูน 7 ถุง ต่อคอนกรีต 1 ม³)
  qtyPerUnit: string;
  wasteFactorPct: string | null;
  unitPrice: string;
  sortOrder: number;
}

// สูตรวัสดุย่อยที่เก็บในแคตตาล็อก Material (มี id ของแถวสูตร)
export interface MaterialComponentDto extends MaterialComponentSnapshotDto {
  id: string;
}

// สแนปช็อตวัสดุย่อยของบรรทัด BOQ (freeze ไว้กับเวอร์ชัน มี id ของแถว snapshot)
export interface BoqItemComponentDto extends MaterialComponentSnapshotDto {
  id: string;
}

export interface MaterialDto {
  id: string;
  categoryId: string | null;
  code: string | null;
  name: string;
  spec: string | null;
  unit: string;
  supplier: string | null;
  materialUnitPrice: string;
  laborUnitPrice: string;
  // ตัวคูณเผื่อเสีย (%) — Decimal จึงมาเป็น string; null = ไม่ได้ตั้ง
  wasteFactorPct: string | null;
  active: boolean;
  updatedAt: string;
  createdAt: string;
  // สูตรวัสดุย่อย (ว่าง = วัสดุก้อนเดียวแบบเดิม); ถ้ามี materialUnitPrice = ผลรวมของวัสดุย่อย
  components: MaterialComponentDto[];
}

export interface BoqItemDto {
  id: string;
  projectVersionId: string;
  categoryId: string;
  materialId: string | null;
  name: string;
  quantity: string;
  // การถอดปริมาณ: "MANUAL" = quantity กรอกเอง, "PER_AREA" = คิดจากพื้นที่ × qtyCoefficient × (1+เผื่อเสีย)
  qtyBasis: string;
  qtyCoefficient: string | null;
  wasteFactorPct: string | null;
  unit: string;
  materialUnitPrice: string;
  materialTotal: string;
  laborUnitPrice: string;
  laborTotal: string;
  lineTotal: string;
  sortOrder: number;
  note: string | null;
  // สแนปช็อตสูตรวัสดุย่อยของบรรทัดนี้ (ถอดปริมาณวัสดุ) — ว่าง = วัสดุก้อนเดียว ราคาพิมพ์เอง
  components: BoqItemComponentDto[];
  /** ราคาของบรรทัดถูกตั้ง/ยืนยันล่าสุดเมื่อไร — null = บรรทัดเก่าก่อนระบบเก็บเวลานี้ */
  pricedAt: string | null;
  /** บรรทัดในเวอร์ชันก่อนหน้าที่คัดลอกมาตอนแตกเวอร์ชัน — null = เพิ่มใหม่ในเวอร์ชันนี้ */
  sourceItemId: string | null;
}

// ---------- ราคาในคลังเปลี่ยนหลังตั้งราคาใน BOQ ----------

export interface BoqLinePriceDto {
  materialUnitPrice: string;
  laborUnitPrice: string;
  lineTotal: string;
}

export interface BoqPriceDriftComponentDto {
  name: string;
  unit: string;
  /** ราคาต่อหน่วยที่บรรทัดใช้อยู่ → ราคาในคลังตอนนี้ */
  from: string;
  to: string;
}

export interface BoqPriceDriftLineDto {
  itemId: string;
  name: string;
  unit: string;
  quantity: string;
  current: BoqLinePriceDto;
  catalog: BoqLinePriceDto;
  /** วัสดุย่อยที่ราคาในคลังเปลี่ยน (เฉพาะบรรทัดที่แตกสูตรวัสดุ) */
  components: BoqPriceDriftComponentDto[];
  /** ราคาในคลังของบรรทัดนี้ถูกแก้ล่าสุดเมื่อไร */
  catalogUpdatedAt: string;
  /** null = บรรทัดเก่า บอกได้แค่ว่าราคาต่างจากคลัง ไม่รู้ว่าอันไหนเปลี่ยนก่อน */
  pricedAt: string | null;
}

export interface BoqPriceDriftDto {
  /**
   * เตือนเฉพาะโครงการที่ยังตกลงราคากันไม่จบ (ร่าง · ส่งใบเสนอราคาแล้ว · ลูกค้าปฏิเสธ)
   * — อนุมัติ/เสร็จ/ยกเลิกแล้ว ราคาในคลังขยับก็ไม่ควรไปแตะ
   */
  applicable: boolean;
  /** เวอร์ชันล่าสุดส่งเป็นใบเสนอราคาแล้ว → อัปเดตราคาจะแตกเป็นเวอร์ชันใหม่ ใบที่ส่งไปไม่เปลี่ยน */
  versionQuoted: boolean;
  lines: BoqPriceDriftLineDto[];
  /** ต้นทุนตรงจะเปลี่ยนเท่าไรถ้าอัปเดตทุกบรรทัด (ก่อนบวกกำไร/VAT) */
  directCostDelta: string;
}

// ---------- เทียบสองเวอร์ชันของ BOQ ----------

export type BoqDiffKind = "added" | "removed" | "changed" | "unchanged";
export type BoqDiffField = "name" | "unit" | "quantity" | "materialUnitPrice" | "laborUnitPrice";

export interface BoqDiffLineValuesDto {
  name: string;
  unit: string;
  quantity: string;
  materialUnitPrice: string;
  laborUnitPrice: string;
  lineTotal: string;
}

export interface BoqDiffLineDto {
  kind: BoqDiffKind;
  categoryCode: string | null;
  categoryName: string;
  before: BoqDiffLineValuesDto | null;
  after: BoqDiffLineValuesDto | null;
  changed: BoqDiffField[];
  /** ยอดบรรทัดหลัง − ก่อน (บรรทัดที่ถูกลบ = ติดลบเต็มจำนวน) */
  lineTotalDelta: string;
}

export interface BoqVersionSummaryDto {
  versionNo: number;
  createdAt: string;
  directCost: string;
  overheadProfitPct: string;
  overheadProfitAmt: string;
  discountAmt: string;
  vatPct: string;
  vatAmt: string;
  netPrice: string;
  /** ใบเสนอราคาที่ออกจากเวอร์ชันนี้ (ไม่รวมฉบับร่าง) */
  quotes: { quoteNo: string; status: QuoteStatus }[];
}

export interface BoqVersionDiffDto {
  from: BoqVersionSummaryDto;
  to: BoqVersionSummaryDto;
  lines: BoqDiffLineDto[];
  counts: Record<BoqDiffKind, number>;
}

// รายงานสรุปปริมาณวัสดุรวมทั้งโครงการ (bill of materials/ลิสต์สั่งซื้อ) — รวมวัสดุย่อยข้ามทุกบรรทัด
// ของเวอร์ชันล่าสุด จัดกลุ่มตามวัสดุเดียวกัน (componentMaterialId หรือ name+unit). ฝั่ง staff เท่านั้น
export interface MaterialSummaryRowDto {
  componentMaterialId: string | null;
  name: string;
  unit: string;
  // ปริมาณรวมทั้งโครงการ = Σ (quantity ของบรรทัด × qtyPerUnit × (1+เผื่อเสีย)) — Decimal → string
  totalQty: string;
  unitPrice: string;
  totalCost: string;
}

export interface MaterialSummaryDto {
  rows: MaterialSummaryRowDto[];
  grandTotal: string;
  // บรรทัด BOQ ที่แตกวัสดุย่อยแล้วกี่บรรทัด จากทั้งหมดกี่บรรทัด — ให้ UI บอกความครอบคลุมของการถอดวัสดุ
  linesWithComponents: number;
  totalLines: number;
}

export interface ProjectVersionDto {
  id: string;
  projectId: string;
  versionNo: number;
  directCost: string;
  /** อัตรารวมที่บวกเข้ากับต้นทุนตรง — **ตัวนี้ตัวเดียวที่คุมราคา** ทุกยอดเงินคิดจากตัวนี้ */
  overheadProfitPct: string;
  /**
   * ส่วนที่เป็น "ค่าดำเนินการ" ภายในอัตรารวม — กำไรคือส่วนที่เหลือ
   * null = เวอร์ชันนี้ยังไม่ได้ระบุว่าแบ่งยังไง (ไม่ใช่ "ค่าดำเนินการเป็นศูนย์")
   */
  overheadPct: string | null;
  overheadProfitAmt: string;
  // ส่วนลดท้ายใบ หักหลังค่าดำเนินการ+กำไร และก่อน VAT
  // discountPct = null คือลดเป็นจำนวนเงินคงที่ (หรือไม่ลด) — discountAmt "0.00" คือไม่มีส่วนลด
  discountPct: string | null;
  discountAmt: string;
  discountNote: string | null;
  vatPct: string;
  vatAmt: string;
  netPrice: string;
  pricePerSqm: string | null;
  createdById: string;
  createdAt: string;
}

// ---------- แยกค่าดำเนินการกับกำไร ----------
//
// เดิมมีอัตราเดียวคือ "ค่าดำเนินการ+กำไร" ก้อนรวม ซึ่งตอบคำถามที่ต้องตอบตอนต่อรองราคาไม่ได้เลย:
// **ลดให้ลูกค้าได้อีกเท่าไรถึงจะยังไม่ขาดทุน** — ส่วนหนึ่งของก้อนนั้นเป็นค่าดำเนินการที่ต้องจ่ายจริง
// (ค่าคุมงาน สำนักงานสนาม ประกันผลงาน) ลดเข้าไปในส่วนนั้นคือเฉือนเนื้อตัวเอง
//
// สูตรอยู่ที่นี่ที่เดียวเพราะทั้งเซิร์ฟเวอร์และหน้าจอต้องได้ตัวเลขเดียวกัน — หน้าจอคิดสดตอนพิมพ์
// ในแผงแก้อัตรา ส่วนเซิร์ฟเวอร์ใช้ตอนตรวจความถูกต้องและตอนเขียนบันทึกกิจกรรม

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface OverheadProfitSplit {
  /** เวอร์ชันนี้ระบุไว้หรือยังว่าส่วนไหนเป็นค่าดำเนินการ — false = ตัวเลขข้างล่างไม่มีความหมาย */
  known: boolean;
  overheadPct: number;
  profitPct: number;
  overheadAmt: number;
  /** กำไรขั้นต้น "ตามที่ตั้งราคาไว้" ไม่ใช่กำไรจริง (ระบบยังไม่เก็บต้นทุนที่จ่ายออกไปจริง) */
  profitAmt: number;
}

/**
 * แยกก้อน "ค่าดำเนินการ+กำไร" ออกเป็นสองส่วน
 *
 * **เศษการปัดตกอยู่ที่กำไรเสมอ** (คิดค่าดำเนินการก่อน แล้วกำไร = ยอดรวม − ค่าดำเนินการ)
 * เพื่อให้สองส่วนบวกกันได้เท่ายอดรวมที่เก็บไว้เป๊ะ ๆ ไม่ว่าปัดยังไง
 */
export function splitOverheadProfit(input: {
  directCost: number;
  overheadProfitPct: number;
  overheadProfitAmt: number;
  overheadPct: number | null;
}): OverheadProfitSplit {
  const { overheadPct } = input;
  if (overheadPct == null || !Number.isFinite(overheadPct)) {
    return { known: false, overheadPct: 0, profitPct: 0, overheadAmt: 0, profitAmt: 0 };
  }
  const overheadAmt = round2(input.directCost * (overheadPct / 100));
  return {
    known: true,
    overheadPct,
    profitPct: round2(input.overheadProfitPct - overheadPct),
    overheadAmt,
    profitAmt: round2(input.overheadProfitAmt - overheadAmt),
  };
}

export interface MarginAfterDiscount {
  /** กำไรขั้นต้นก่อนให้ส่วนลด */
  before: number;
  /** เหลือเท่าไรหลังให้ส่วนลด — **ติดลบ = ขายต่ำกว่าต้นทุน + ค่าดำเนินการ** */
  remaining: number;
  /** ส่วนลดกินกำไรไปกี่เปอร์เซ็นต์ (null = ไม่มีกำไรตั้งต้นให้เทียบ) */
  eatenPct: number | null;
}

/**
 * ส่วนลดที่ให้ไป กินกำไรไปเท่าไร
 *
 * ส่วนลดหักจากยอด "ต้นทุน + ค่าดำเนินการ + กำไร" แต่สิ่งที่หายไปจริงคือกำไร เพราะอีกสองก้อน
 * เป็นเงินที่ต้องจ่ายออกไปอยู่ดี — ตัวเลขนี้จึงเป็นตัวเดียวที่บอกได้ว่ายังต่อรองไหวอีกแค่ไหน
 */
export function marginAfterDiscount(profitAmt: number, discountAmt: number): MarginAfterDiscount {
  const remaining = round2(profitAmt - discountAmt);
  return {
    before: round2(profitAmt),
    remaining,
    eatenPct: profitAmt > 0 ? round2((discountAmt / profitAmt) * 100) : null,
  };
}

export interface CustomerDto {
  id: string;
  email: string;
  fullName: string;
}

// ผลลัพธ์ตอนพนักงานสร้างบัญชีลูกค้าจากคำขอ + ออกลิงก์เข้าใช้ครั้งเดียว (ฝั่ง staff คัดลอก url ไปส่ง)
export interface CustomerAccessLinkResult {
  url: string;
  expiresAt: string;
  customer: CustomerDto;
  created: boolean; // true = สร้างบัญชีใหม่, false = ผูก/ออกลิงก์ให้บัญชีเดิม
}

// ข้อมูลย่อของบัญชีปลายทางที่หน้า /activate ฝั่งลูกค้าใช้ยืนยันก่อนตั้งรหัส
export interface AccessTokenInfo {
  email: string;
  fullName: string;
}

// ข้อมูลติดต่อลูกค้า (โปรไฟล์) — ที่อยู่ใช้พิมพ์ "ที่อยู่ผู้ว่าจ้าง" บนใบเสนอราคา/สัญญา
/**
 * ผู้ว่าจ้างเป็นใครในทางกฎหมาย
 *
 * ตัดสินทั้งชื่อที่พิมพ์ในช่อง "ผู้ว่าจ้าง" บนใบเสนอราคา/สัญญา และหน้าที่หักภาษี ณ ที่จ่าย 3%
 * (ผู้จ่ายเงินที่เป็นนิติบุคคลเท่านั้นที่มีหน้าที่หัก — บุคคลธรรมดาที่จ้างสร้างบ้านให้ตัวเองไม่ต้อง)
 */
export type CustomerType = "INDIVIDUAL" | "COMPANY";

/** ช่องข้อมูลนิติบุคคล — ว่างทั้งหมดเมื่อผู้ว่าจ้างเป็นบุคคลธรรมดา */
export interface CustomerCompanyFieldsDto {
  customerType: CustomerType;
  companyName: string | null;
  /** เลขประจำตัวผู้เสียภาษี 13 หลัก **ของลูกค้า** (คนละตัวกับเลขภาษีของบริษัทในหน้าตั้งค่า) */
  taxId: string | null;
  /** "สำนักงานใหญ่" หรือ "สาขา 00001" — ใบกำกับภาษีต้องระบุ */
  branch: string | null;
  /** ผู้ประสานงานฝั่งลูกค้า — ว่าง = ใช้ชื่อเจ้าของบัญชี */
  contactPerson: string | null;
}

export interface CustomerProfileDto extends CustomerCompanyFieldsDto {
  phone: string | null;
  address: string | null;
}

export interface ProjectDto {
  id: string;
  projectNo: string;
  name: string;
  description: string | null;
  siteAddress: string | null;
  // Decimal → string; null = ไม่ได้ตั้ง
  areaSqm: string | null;
  // ค่าวัดสำหรับถอดปริมาณ (Phase 2) — พื้นที่ผนัง / ความยาวรอบรูป / ปริมาตร (Decimal → string | null)
  wallAreaSqm: string | null;
  perimeterM: string | null;
  concreteVolumeM3: string | null;
  // พื้นที่ตั้งอาคาร/ปกคลุมดิน (ตร.ม.) — ตัวขับงานหลังคา/ฐานราก (Decimal → string | null)
  footprintSqm: string | null;
  // ตัวขับแบบนับ (จำนวนห้องน้ำ/ชั้น) — Int → number | null
  bathrooms: number | null;
  floors: number | null;
  // Date → ISO string (เก็บเฉพาะวันที่); null = ไม่ได้ตั้ง
  startDate: string | null;
  targetEndDate: string | null;
  type: ProjectType;
  customerId: string | null;
  // มีค่าเฉพาะ endpoint ที่ดึงมาให้ (listProjects, getProjectDetail) — จะไม่มีฟิลด์นี้เลย
  // (ไม่ใช่แค่ null) ใน response ของ create/update/transition ธรรมดา
  customer?: CustomerDto | null;
  houseDesignId: string | null;
  // ตั้งค่าเมื่อโปรเจกต์นี้ถูกสร้างจาก Lead -- ทำให้สถานะของ Lead วิ่งตามวงจรชีวิตของ
  // โปรเจกต์/ใบเสนอราคาอัตโนมัติ แทนที่พนักงานต้องมาอัปเดตทั้งสองเองด้วยมือ
  leadId: string | null;
  status: ProjectStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  // มีค่าเฉพาะจาก listProjects -- ใช้ตัดสินว่าจะแสดงปุ่มลบได้ไหม (โปรเจกต์ที่เคยออกใบเสนอราคา
  // แล้วทำได้แค่ยกเลิก ลบถาวรไม่ได้)
  quoteCount?: number;
}

// สแนปช็อตแบบอ่านอย่างเดียวของ Lead ที่โปรเจกต์นี้ถูกสร้างมา แสดงบนโปรเจกต์เพื่อให้พนักงาน
// เห็นว่าคำถามมาจากใคร (ชื่อ/เบอร์/อีเมล) แม้ยังไม่ได้ผูกบัญชีลูกค้า -- ดู getProjectDetail
export interface ProjectLeadInfoDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  serviceType: string;
  houseDesignName: string | null;
  message: string | null;
}

export interface ProjectDetailDto {
  project: ProjectDto;
  versions: ProjectVersionDto[];
  currentVersion: ProjectVersionDto;
  items: BoqItemDto[];
  editable: boolean;
  // มีค่าเมื่อโปรเจกต์ถูกสร้างจาก Lead (ผ่าน "สร้างโปรเจกต์จาก lead")
  lead: ProjectLeadInfoDto | null;
}

// ไฟล์จริงที่พนักงานแนบกับใบเสนอราคา (มุมมองพนักงาน — เห็นทั้ง INTERNAL และ CUSTOMER)
export interface QuoteAttachmentDto {
  id: string;
  quoteId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  visibility: AttachmentVisibility;
  createdAt: string;
}

export interface QuoteDto {
  id: string;
  projectId: string;
  projectVersionId: string;
  quoteNo: string;
  revisionNo: number;
  pdfUrl: string | null;
  status: QuoteStatus;
  sentAt: string | null;
  respondedAt: string | null;
  customerNote: string | null;
  createdAt: string;
  /**
   * วันสุดท้ายที่ยืนราคา (YYYY-MM-DD ตามเวลาไทย) ตรึงตอนกดส่ง · null = ไม่มีกำหนด
   * (ส่งก่อนมีฟีเจอร์นี้ หรือบริษัทยังไม่ได้ตั้งจำนวนวันในหน้าตั้งค่า)
   */
  validUntil: string | null;
  /** เงื่อนไขท้ายใบ ตรึงตอนกดส่ง (บรรทัดละข้อ) */
  terms: string | null;
  // ลูกค้าเปิดดูใบนี้หรือยัง — ฝั่งพนักงานเท่านั้น (DTO ของลูกค้าไม่ส่งฟิลด์ชุดนี้ออกไป)
  // null ทั้งคู่ = ยังไม่เคยเปิด. นับเฉพาะการเปิดผ่านช่องทางลูกค้า พนักงานเปิดดูไม่นับ
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  // มีค่าจาก listQuotes (หน้ารายละเอียดโปรเจกต์) — ไฟล์แนบทั้งหมดของใบเสนอราคานี้
  attachments?: QuoteAttachmentDto[];
}

export interface TemplateDto {
  id: string;
  name: string;
  description: string | null;
  houseDesignId: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

// รายการหนึ่งบรรทัดในแม่แบบ (จาก structure snapshot) พร้อมชื่อหมวดที่ resolve แล้ว
// เพื่อให้หน้ารายละเอียดแสดงเป็นกลุ่มตามหมวดงานได้ ราคาส่งมาเป็น string ให้เข้ากับ DTO อื่น
export interface TemplateItemDetailDto {
  // ตำแหน่งของบรรทัดใน structure array ของแม่แบบ — ใช้อ้างอิงตอนแก้สูตรบรรทัดนั้น
  index: number;
  categoryId: string;
  categoryCode: string | null;
  categoryName: string;
  topCategoryCode: string | null;
  topCategoryName: string;
  // หมวดย่อยระดับ 2 (ลูกของหมวดใหญ่) — null เมื่อหมวดลึกไม่ถึง 2 ชั้น; ใช้คั่น/ยุบกลุ่มย่อยในตาราง
  subCategoryCode: string | null;
  subCategoryName: string | null;
  name: string;
  unit: string;
  quantity: string;
  // สูตรถอดปริมาณที่ติดมากับแม่แบบ (Phase 3): MANUAL = ใช้ quantity ตายตัว; ฐานอื่นจะคิดปริมาณ
  // ใหม่ตามค่าวัดโครงการตอนนำแม่แบบไปใช้ (qtyCoefficient = ปริมาณต่อ 1 หน่วยของตัวขับ)
  qtyBasis: string;
  qtyCoefficient: string | null;
  wasteFactorPct: string | null;
  materialUnitPrice: string;
  laborUnitPrice: string;
  note: string | null;
  // สูตรวัสดุย่อยที่ติดมากับแม่แบบ (ว่าง = วัสดุก้อนเดียว) — snapshot ไม่มี id ของแถว
  components: MaterialComponentSnapshotDto[];
}

export interface TemplateDetailDto extends TemplateDto {
  items: TemplateItemDetailDto[];
}

export interface ContractDto {
  id: string;
  projectId: string;
  contractNo: string;
  pdfUrl: string | null;
  signedAt: string | null;
  createdAt: string;
  // แม่แบบที่ใช้ตอนออกสัญญาฉบับนี้ (null = สัญญาเก่าที่ออกก่อนมีระบบแม่แบบ)
  templateId: string | null;
  templateName: string | null;
  docTitle: string | null;
  /** เนื้อสัญญาที่แช่แข็งไว้กับฉบับนี้ — แทนค่าตัวแปรแล้ว แก้ได้จนกว่าจะลงนาม */
  bodyJson: ContractStructureDto | null;
  /** มูลค่าสัญญาที่ตรึงไว้ตอนออกฉบับนี้ — ยอดที่งวดเงินต้องรวมให้ได้ */
  amount: string | null;
}

/** งวดการชำระเงิน (ข้อ 7) — ยอดรวมทุกงวดต้องเท่ามูลค่าสัญญาพอดี ระบบบังคับไว้ */
export interface ContractInstallmentDto {
  id: string;
  contractId: string;
  seq: number;
  milestone: string;
  amount: string;
  /** วันที่ถึงกำหนดชำระ (YYYY-MM-DD) — null = ยังไม่ถึงงวด/ยังไม่ได้ระบุ */
  dueOn: string | null;
}

// ---------- ติดตามการจ่ายเงินรายงวด ----------
//
// แผนงวดบอกได้แค่ว่า "ตกลงกันว่าจะจ่ายกี่งวด งวดละเท่าไร" ซึ่งไม่ใช่คำถามที่ต้องตอบทุกวัน
// คำถามที่ต้องตอบคือ **"งวดไหนถึงกำหนดแล้วแต่เงินยังไม่เข้า และค้างมากี่วัน"**
//
// งวดหนึ่งมีสองเหตุการณ์คนละเวลา: งานถึงงวดแล้วจึงวางบิล (dueOn) กับเงินเข้า (แถวรับเงิน)
// ถ้าเก็บแค่ธง "จ่ายแล้วหรือยัง" จะแยกไม่ออกระหว่างงวดที่ยังไม่ถึงคิว กับงวดที่ทวงไปแล้วสามสัปดาห์

export type PaymentMethod = "TRANSFER" | "CASH" | "CHEQUE" | "OTHER";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  TRANSFER: "โอนเงิน",
  CASH: "เงินสด",
  CHEQUE: "เช็ค",
  OTHER: "อื่นๆ",
};

export interface InstallmentPaymentDto {
  id: string;
  installmentId: string;
  /** วันที่ได้รับเงินจริง (YYYY-MM-DD) ไม่ใช่วันที่นั่งบันทึก */
  paidOn: string;
  /** ยอดที่ถือว่าชำระหนี้งวดนี้แล้ว = ก่อนหักภาษี ณ ที่จ่าย */
  amount: string;
  /** ภาษีหัก ณ ที่จ่ายที่ผู้ว่าจ้างหักไว้ ("0.00" = ไม่ได้หัก) */
  withholdingAmount: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  /** null = บัญชีพนักงานที่บันทึกถูกลบไปแล้ว */
  recordedByName: string | null;
  recordedById: string | null;
  createdAt: string;
}

export type InstallmentStatus = "NOT_DUE" | "AWAITING" | "PARTIAL" | "PAID" | "OVERPAID";

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  NOT_DUE: "ยังไม่ถึงกำหนด",
  AWAITING: "รอรับเงิน",
  PARTIAL: "รับบางส่วน",
  PAID: "รับครบแล้ว",
  OVERPAID: "รับเกิน",
};

export interface InstallmentProgress {
  status: InstallmentStatus;
  statusLabel: string;
  /** ยอดที่ถือว่าชำระแล้ว (ก่อนหักภาษี ณ ที่จ่าย) */
  paidAmount: number;
  /** ยังขาดอีกเท่าไร — 0 เมื่อครบหรือเกิน (ส่วนที่เกินไปอยู่ที่ overpaidAmount) */
  remaining: number;
  /** รับเกินมาเท่าไร — **ไม่ตัดทิ้ง** เพราะการตัดทิ้งคือการซ่อนเงินที่เข้ามาจริง */
  overpaidAmount: number;
  /** ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้รวมทุกครั้ง */
  withheldAmount: number;
  /** เงินที่เข้าบัญชีจริงรวม = paidAmount − withheldAmount */
  receivedAmount: number;
  /** เกินกำหนดมากี่วัน — null = ยังไม่เกิน/ไม่ได้ตั้งวันครบกำหนด/รับครบแล้ว */
  daysOverdue: number | null;
}

/** จำนวนวันระหว่างสองวันที่รูปแบบ YYYY-MM-DD — อ่านเป็น UTC ทั้งคู่ เขตเวลาจึงไม่มีผล */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * สถานะของงวดหนึ่ง คำนวณจากรายการรับเงินทั้งหมดของงวดนั้น
 *
 * **ไม่เก็บสถานะลงฐานข้อมูล** — เก็บซ้ำเมื่อไรคือเปิดช่องให้สถานะขัดกับยอดจริงเมื่อนั้น
 *
 * **รับวันที่วันนี้เข้ามาเป็นพารามิเตอร์ ไม่เรียกนาฬิกาเอง** เพื่อให้ทั้งสองฝั่งได้คำตอบเดียวกัน
 * และเทสต์ยืนยันเรื่อง "เกินกำหนดกี่วัน" ได้โดยไม่ต้องรอเวลาเดินจริง
 */
function installmentStatusOf(
  paidAmount: number,
  target: number,
  dueOn: string | null,
  today: string,
): InstallmentStatus {
  if (paidAmount > target) return "OVERPAID";
  if (paidAmount === target) return "PAID";
  if (paidAmount > 0) return "PARTIAL";
  if (dueOn != null && daysBetween(dueOn, today) >= 0) return "AWAITING";
  return "NOT_DUE";
}

export function installmentProgress(input: {
  amount: number;
  payments: { amount: number; withholdingAmount: number }[];
  dueOn: string | null;
  /** วันนี้ในรูปแบบ YYYY-MM-DD */
  today: string;
}): InstallmentProgress {
  const paidAmount = round2(input.payments.reduce((sum, p) => sum + p.amount, 0));
  const withheldAmount = round2(input.payments.reduce((sum, p) => sum + p.withholdingAmount, 0));
  const target = round2(input.amount);
  const diff = round2(target - paidAmount);

  const status = installmentStatusOf(paidAmount, target, input.dueOn, input.today);

  // ค้างจริงต่อเมื่อเลยวันครบกำหนดมาแล้ว "และ" ยังได้ไม่ครบ — จ่ายครบแล้วไม่ถือว่าค้าง
  // แม้จะจ่ายช้ากว่ากำหนดก็ตาม (ประวัติการจ่ายช้าอยู่ในวันที่ของแถวรับเงิน)
  const overdueDays = input.dueOn != null ? daysBetween(input.dueOn, input.today) : 0;
  const daysOverdue = input.dueOn != null && overdueDays > 0 && diff > 0 ? overdueDays : null;

  return {
    status,
    statusLabel: INSTALLMENT_STATUS_LABELS[status],
    paidAmount,
    remaining: Math.max(diff, 0),
    overpaidAmount: diff < 0 ? round2(-diff) : 0,
    withheldAmount,
    receivedAmount: round2(paidAmount - withheldAmount),
    daysOverdue,
  };
}

/** งวดหนึ่งพร้อมรายการรับเงินทั้งหมดของงวดนั้น (มุมพนักงาน) */
export interface InstallmentWithPaymentsDto {
  id: string;
  seq: number;
  milestone: string;
  amount: string;
  dueOn: string | null;
  progress: InstallmentProgress;
  /**
   * ภาษีหัก ณ ที่จ่ายที่ "คาดว่า" จะถูกหักจากงวดนี้ — ใช้เติมค่าตั้งต้นในช่องกรอกเท่านั้น
   * null = ผู้ว่าจ้างเป็นบุคคลธรรมดา หรือไม่รู้ฐานภาษีของสัญญาฉบับนี้
   */
  expectedWithholding: number | null;
  payments: InstallmentPaymentDto[];
}

export interface ContractPaymentsViewDto {
  contractId: string;
  contractNo: string;
  signedAt: string | null;
  /** null = สัญญาเก่าที่ไม่มีมูลค่าตรึงไว้ */
  contractAmount: number | null;
  /** false = ยังไม่มีแผนงวด — ห้ามอ่านยอดสรุปว่า "เก็บครบแล้ว" */
  hasPlan: boolean;
  /** วันนี้ตามเวลาไทยที่เซิร์ฟเวอร์ใช้คำนวณสถานะ — หน้าจอใช้ค่าเดียวกันเพื่อไม่ให้ตัวเลขขัดกัน */
  today: string;
  installments: InstallmentWithPaymentsDto[];
  summary: ContractPaymentSummary;
}

export interface ContractPaymentSummary {
  /** ยอดรวมของทุกงวดในแผน — เท่ามูลค่าสัญญาเสมอ เพราะระบบบังคับไว้ตอนบันทึกแผน */
  planTotal: number;
  paidAmount: number;
  remaining: number;
  overpaidAmount: number;
  withheldAmount: number;
  receivedAmount: number;
  /** งวดที่รับครบแล้ว (รวมที่รับเกิน) จากทั้งหมดกี่งวด */
  paidCount: number;
  totalCount: number;
  /** งวดที่เลยกำหนดแล้วยังได้ไม่ครบ + ยอดที่ยังขาดของงวดเหล่านั้น */
  overdueCount: number;
  overdueAmount: number;
}

/**
 * สรุปภาพรวมการรับเงินของสัญญาหนึ่งฉบับ
 *
 * **สัญญาที่ยังไม่มีแผนงวดจะได้ totalCount = 0 ทุกยอดเป็นศูนย์** — ผู้เรียกต้องแยกกรณีนี้ออกไป
 * แสดงว่า "ยังไม่มีแผนงวด" ห้ามปล่อยให้อ่านว่า "เก็บครบแล้ว" ซึ่งเป็นคนละเรื่องกันสิ้นเชิง
 */
export function contractPaymentSummary(
  installments: {
    amount: number;
    dueOn: string | null;
    payments: { amount: number; withholdingAmount: number }[];
  }[],
  today: string,
): ContractPaymentSummary {
  const rows = installments.map((i) => ({
    amount: round2(i.amount),
    progress: installmentProgress({ ...i, today }),
  }));
  const sum = (pick: (r: (typeof rows)[number]) => number) => round2(rows.reduce((s, r) => s + pick(r), 0));
  const overdue = rows.filter((r) => r.progress.daysOverdue != null);

  return {
    planTotal: sum((r) => r.amount),
    paidAmount: sum((r) => r.progress.paidAmount),
    remaining: sum((r) => r.progress.remaining),
    overpaidAmount: sum((r) => r.progress.overpaidAmount),
    withheldAmount: sum((r) => r.progress.withheldAmount),
    receivedAmount: sum((r) => r.progress.receivedAmount),
    paidCount: rows.filter((r) => r.progress.status === "PAID" || r.progress.status === "OVERPAID").length,
    totalCount: rows.length,
    overdueCount: overdue.length,
    overdueAmount: round2(overdue.reduce((s, r) => s + r.progress.remaining, 0)),
  };
}

// ---------- แม่แบบสัญญา ----------

export interface ContractClauseDto {
  heading: string;
  body: string;
}

export interface ContractStructureDto {
  coverSubtitle: string;
  preamble: string;
  clauses: ContractClauseDto[];
  closing: string;
}

export interface ContractTemplateDto {
  id: string;
  name: string;
  description: string | null;
  /** ชื่อเอกสารบนหน้าปก เช่น "สัญญาเหมาทำการก่อสร้าง" */
  docTitle: string;
  structure: ContractStructureDto;
  /** แม่แบบที่ระบบหยิบมาใช้เมื่อออกสัญญาโดยไม่ระบุ — มีได้ตัวเดียว */
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * กลุ่มของตัวแปรในแม่แบบสัญญา
 *
 * แยก "ฝั่งลูกค้า" กับ "ฝั่งเรา" ให้เห็นเป็นหัวข้อ เพราะคำว่า ผู้ว่าจ้าง / ผู้รับจ้าง ต่างกันแค่
 * พยางค์เดียว และมีหลายคู่ที่ชื่อเกือบซ้ำกัน (ชื่อ/ที่อยู่/เลขภาษีของทั้งสองฝ่าย) — การใส่คู่สัญญา
 * สลับฝั่งคือความผิดที่แพงที่สุดในเอกสารนี้ และเคยเกิดจริงในข้อ 8 ของสัญญาต้นฉบับ
 */
export type ContractVariableGroup = "customer" | "company" | "project" | "contract" | "schedule";

export const CONTRACT_VARIABLE_GROUP_LABELS: Record<ContractVariableGroup, string> = {
  customer: "ฝั่งลูกค้า (ผู้ว่าจ้าง)",
  company: "ฝั่งเรา (ผู้รับจ้าง)",
  project: "โครงการ",
  contract: "สัญญาและเงิน",
  schedule: "ระยะเวลา",
};

/** ตัวแปรหนึ่งตัวพร้อมคำอธิบายว่า "จะพิมพ์ออกมาเป็นอะไร" */
export interface ContractVariableInfo {
  name: string;
  group: ContractVariableGroup;
  /**
   * สิ่งที่จะถูกพิมพ์ลงเอกสาร — ฝั่งบริษัทเป็นค่าจริงจากหน้าตั้งค่า ส่วนที่ต่างกันทุกสัญญา
   * (ลูกค้า/โครงการ/วันที่/เงิน) เป็นรูปแบบหรือที่มาของค่า
   */
  preview: string;
  /** คำเตือนสั้น ๆ เช่น "ไม่มีคำว่า บาท — พิมพ์ต่อเอง" */
  note: string | null;
  /** ค่าฝั่งบริษัทที่ยังไม่ได้ตั้ง = สัญญาทุกฉบับที่ใช้ตัวแปรนี้จะพิมพ์เป็นเส้นประ */
  missing: boolean;
}

/** โครงเปล่าไว้ให้หน้าจอ "สร้างแม่แบบใหม่" เริ่มต้น โดยไม่ต้องเดารูปทรงของ structure เอง */
export const EMPTY_CONTRACT_STRUCTURE: ContractStructureDto = {
  coverSubtitle: "{{ชื่อโครงการ}}",
  preamble: "",
  clauses: [{ heading: "ข้อ 1.", body: "" }],
  closing: "",
};

/** ราคาประเมินเบื้องต้นของแบบบ้านทั้งหลัง คำนวณจาก template BOQ มาตรฐานของแบบนั้น */
export interface HouseDesignStandardEstimate {
  templateName: string;
  itemCount: number;
  directCost: number;
  netPrice: number;
  pricePerSqm: number | null;
}

export interface HouseDesignDto {
  id: string;
  name: string;
  description: string | null;
  area: string | null;
  // ค่าวัดถอดปริมาณของแบบบ้าน (Decimal→string) ใช้ prefill ลงโครงการตอนสร้างจากแบบ
  wallAreaSqm: string | null;
  perimeterM: string | null;
  concreteVolumeM3: string | null;
  footprintSqm: string | null;
  // สเปกบ้าน (จำนวนเต็ม) โชว์เป็นชิปไอคอนฝั่งลูกค้า — null ได้ทั้งหมด
  floors: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  exteriorImages: string[] | null;
  interiorImages: string[] | null;
  plans: string[] | null;
  published: boolean;
  // แสดงในโซน "แบบบ้านแนะนำ" ของหน้าแรก + ลำดับการแสดง (น้อยไปมาก)
  featured: boolean;
  featuredOrder: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  // มีค่าเฉพาะจาก getHouseDesign (หน้ารายละเอียด); เป็น null เมื่อแบบบ้านไม่มี template มาตรฐาน
  standard?: HouseDesignStandardEstimate | null;
}

// จำนวนแบบบ้านสูงสุดที่โชว์ในโซนแบบบ้านแนะนำของหน้าแรก
export const FEATURED_HOUSE_DESIGN_LIMIT = 6;

// ---------- สูตรถอดปริมาณเหล็กเส้น (rebar take-off) ----------
// น้ำหนักต่อความยาวของเหล็กเส้นกลม (กก./ม.) = d² / 162 เมื่อ d = ขนาดเส้นผ่านศูนย์กลาง (มม.)
// เป็นสูตรมาตรฐานงานก่อสร้าง (มาจากความหนาแน่นเหล็ก 7850 กก./ลบ.ม. × พื้นที่หน้าตัดวงกลม)
// ใช้แปลง "ความยาวเหล็ก (ม.)" จาก bar schedule → "น้ำหนัก (กก.)" สำหรับกรอกเป็นปริมาณ BOQ
export function rebarUnitWeightKgPerM(diameterMm: number): number {
  return (diameterMm * diameterMm) / 162;
}

export function rebarWeightKg(lengthM: number, diameterMm: number): number {
  return lengthM * rebarUnitWeightKgPerM(diameterMm);
}

// ขนาดเหล็กเส้นมาตรฐานไทย: RB = เหล็กกลมผิวเรียบ (SR24), DB = เหล็กข้ออ้อย (SD40)
export interface StandardRebar {
  code: string; // เช่น "DB12"
  diameterMm: number;
  round: boolean; // true = RB ผิวเรียบ, false = DB ข้ออ้อย
}

export const STANDARD_REBARS: StandardRebar[] = [
  { code: "RB6", diameterMm: 6, round: true },
  { code: "RB9", diameterMm: 9, round: true },
  { code: "DB10", diameterMm: 10, round: false },
  { code: "DB12", diameterMm: 12, round: false },
  { code: "DB16", diameterMm: 16, round: false },
  { code: "DB20", diameterMm: 20, round: false },
  { code: "DB25", diameterMm: 25, round: false },
  { code: "DB28", diameterMm: 28, round: false },
  { code: "DB32", diameterMm: 32, round: false },
];

export type PortfolioType = "DESIGN" | "CONSTRUCTION";

export interface PortfolioDto {
  id: string;
  title: string;
  type: PortfolioType;
  images: string[] | null;
  description: string | null;
  published: boolean;
  publishedAt: string | null;
  // แสดงในโซน "สำรวจผลงาน" ของหน้าบริการ + ลำดับการแสดง (น้อยไปมาก)
  featured: boolean;
  featuredOrder: number;
  createdById: string;
  createdAt: string;
}

// จำนวนผลงานสูงสุดที่โชว์ในโซนสำรวจผลงานของหน้าบริการ
export const FEATURED_PORTFOLIO_LIMIT = 8;

export interface LeadDto {
  id: string;
  customerId: string | null;
  name: string;
  phone: string;
  email: string | null;
  serviceType: string;
  houseDesignId: string | null;
  message: string | null;
  // ข้อมูลโครงการเบื้องต้นที่ลูกค้าให้มา (ถ้ามี) — ใช้เติม Project อัตโนมัติตอนสร้างโครงการจากคำขอ
  siteAddress: string | null;
  areaSqm: string | null;
  desiredStartDate: string | null;
  attachments: string[] | null;
  status: LeadStatus;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // มีค่าเฉพาะจาก listLeads -- id ของ Project ที่สร้างจาก lead นี้ (ถ้ามี)
  projectId?: string | null;
}

export interface SettingsDto {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  overheadProfitPercent?: string;
  vatPercent?: string;
}

export interface CustomerQuoteSummaryDto {
  id: string;
  quoteNo: string;
  revisionNo: number;
  status: QuoteStatus;
  sentAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  customerNote: string | null;
  /** วันสุดท้ายที่ยืนราคา (YYYY-MM-DD) · null = ไม่มีกำหนด */
  validUntil: string | null;
  /** ใบที่ยังรอคำตอบแต่พ้นกำหนดยืนราคาแล้ว — ตัดสินที่เซิร์ฟเวอร์ กดยอมรับเองไม่ได้ */
  expired: boolean;
  project: { projectNo: string; name: string };
}

export interface CustomerQuoteItemDto {
  id: string;
  code: string | null;
  name: string;
  quantity: string;
  unit: string;
  /** ราคาต่อหน่วยที่พับค่าดำเนินการ/กำไรเข้าไปแล้ว — ตัวเลขเดียวกับที่พิมพ์ใน PDF (BR-09) */
  unitPrice: string;
  /** จำนวน × ราคาต่อหน่วย */
  lineTotal: string;
  note: string | null;
}

/** รายการงานจัดกลุ่มตามหมวดงานระดับบนสุด ให้ตรงกับ PDF ที่ลูกค้าเห็น */
export interface CustomerQuoteGroupDto {
  code: string;
  name: string;
  /** ยอดรวมของกลุ่มที่บวก markup แล้ว — ไม่ใช่ตัวเลขต้นทุนเด็ดขาด (BR-09) */
  subtotal: string;
  items: CustomerQuoteItemDto[];
}

// ไฟล์แนบฝั่งลูกค้า — คืนเฉพาะไฟล์ที่ visibility=CUSTOMER เท่านั้น (ไม่มีฟิลด์ visibility)
export interface CustomerAttachmentDto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  createdAt: string;
}

/**
 * ชนิดไฟล์ที่เปิดดูในเบราว์เซอร์ได้ → คู่กับชนิดที่ยอมเสิร์ฟแบบ `Content-Disposition: inline`
 *
 * ตัดสินจาก **นามสกุลไฟล์** ไม่ใช่ mimeType ที่เก็บไว้ เพราะ mimeType มาจากเครื่องผู้อัปโหลด
 * (isAllowedAttachment ปล่อยผ่านได้ด้วยนามสกุลอย่างเดียว) ถ้าเชื่อ mimeType แล้วเสิร์ฟ inline
 * ตามนั้น คนที่อัปไฟล์ .png พร้อมประกาศว่าเป็น text/html จะได้ XSS บนโดเมน API ไปฟรี ๆ
 *
 * Excel เปิดในเบราว์เซอร์ไม่ได้ จึงเหลือแค่ดาวน์โหลดตามเดิม
 */
export const INLINE_VIEWABLE_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** คืน Content-Type ที่ปลอดภัยพอจะเสิร์ฟ inline หรือ null ถ้าไฟล์ชนิดนี้เปิดดูไม่ได้ */
export function inlineViewableType(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;
  return INLINE_VIEWABLE_MIME[fileName.slice(dot).toLowerCase()] ?? null;
}

/** true เมื่อไฟล์นี้กด "เปิดดู" ได้ (ฝั่ง UI ใช้ตัดสินว่าจะโชว์ปุ่มเปิดดูไหม) */
export function isPreviewableAttachment(fileName: string): boolean {
  return inlineViewableType(fileName) !== null;
}

export interface CustomerQuoteDetailDto extends CustomerQuoteSummaryDto {
  netPrice: string;
  vatPct: string;
  vatAmt: string;
  // ส่วนลดที่ตกลงกัน — ลูกค้าต้องเห็น ไม่งั้นบวกราคาทุกบรรทัดแล้วไม่ตรงกับยอดสุทธิ
  discountPct: string | null;
  discountAmt: string;
  discountNote: string | null;
  groups: CustomerQuoteGroupDto[];
  // true เมื่อโปรเจกต์เป็นแบบกำหนดเอง (CUSTOM) — ไม่มี BOQ ในระบบ ให้ฝั่ง UI แสดง
  // "รายละเอียดอยู่ในไฟล์แนบ" แทนตารางหมวดงานที่ว่างเปล่า
  isCustom: boolean;
  // ไฟล์ที่พนักงานเปิดให้ลูกค้าเห็น (เช่น ใบเสนอราคา/แบบ ฉบับจริง)
  attachments: CustomerAttachmentDto[];
  /** เงื่อนไขท้ายใบทีละข้อ — ชุดเดียวกับที่พิมพ์ใน PDF · [] = ไม่มี */
  terms: string[];
}

// สัญญาที่ลูกค้าดูได้ในพอร์ทัล — โชว์เฉพาะโครงการของตัวเอง ดาวน์โหลด PDF ผ่าน endpoint ที่ตรวจสิทธิ์
/**
 * งวดการชำระเงินในมุมของลูกค้า
 *
 * ตัดสิ่งที่เป็นเรื่องภายในออกหมด (เลขอ้างอิงการโอน หมายเหตุของพนักงาน คนที่บันทึก ภาษีหัก
 * ณ ที่จ่ายรายครั้ง) เหลือเฉพาะสิ่งที่เป็นข้อมูลของลูกค้าเอง: ตกลงกันไว้เท่าไร จ่ายไปแล้วเท่าไร
 * เหลือเท่าไร ครบกำหนดเมื่อไร
 */
export interface CustomerInstallmentDto {
  seq: number;
  milestone: string;
  amount: string;
  dueOn: string | null;
  status: InstallmentStatus;
  statusLabel: string;
  paidAmount: number;
  remaining: number;
  /** วันที่ได้รับเงินครั้งล่าสุดของงวดนี้ — null = ยังไม่มีการรับเงิน */
  lastPaidOn: string | null;
  daysOverdue: number | null;
}

export interface CustomerContractPaymentDto {
  planTotal: number;
  paidAmount: number;
  remaining: number;
  paidCount: number;
  totalCount: number;
  installments: CustomerInstallmentDto[];
}

/**
 * บัญชีรับเงินของบริษัท (ตั้งในหน้าตั้งค่า) — มีค่าก็ต่อเมื่อกรอกครบ ธนาคาร/ชื่อบัญชี/เลขที่บัญชี
 * ลูกค้าเห็นในหน้าสัญญาเมื่อมีงวดค้างชำระ และถูกพิมพ์บนใบเสนอราคา
 */
export interface PaymentAccountDto {
  bankName: string;
  branch: string | null;
  accountName: string;
  accountNo: string;
  promptPay: string | null;
}

export interface CustomerContractDto {
  id: string;
  contractNo: string;
  signedAt: string | null;
  createdAt: string;
  project: { projectNo: string; name: string };
  /**
   * null = สัญญายังไม่ลงนาม หรือลงนามแล้วแต่ยังไม่มีแผนงวด
   * ฉบับที่ยังไม่ลงนามไม่มีข้อผูกพันให้ชำระ การโชว์ยอดค้างของฉบับร่างจะทำให้ลูกค้าเข้าใจว่า
   * ต้องจ่ายทั้งที่ยังไม่ได้ตกลงกัน — และโครงการหนึ่งออกฉบับร่างได้หลายฉบับพร้อมกัน
   */
  payment: CustomerContractPaymentDto | null;
}

export interface NotificationDto {
  id: string;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface DashboardSummaryDto {
  projectCounts: Record<ProjectStatus, number>;
  totalQuotedValue: number;
  newLeadsCount: number;
  // อัตราปิดงาน (win rate): นับเป็น "โครงการ" ไม่ใช่จำนวนใบเสนอราคา เพราะโครงการเดียวอาจออกใบ
  // เสนอราคาหลายฉบับ (แก้ราคาไปมา) ถ้านับใบจะบิดเบือน — quotedProjectCount = โครงการที่ส่งใบ
  // เสนอราคาให้ลูกค้าไปแล้วจริง (มีใบที่ไม่ใช่ร่าง), wonProjectCount = ที่ปิดได้ (อนุมัติ/เสร็จสิ้น)
  wonProjectCount: number;
  quotedProjectCount: number;
  recentProjects: ProjectDto[];
}

// ── ไทม์ไลน์กิจกรรมของโครงการ (อ่านจาก AuditLog) ──
// ชนิดเหตุการณ์ใช้เลือกไอคอน/สี ฝั่ง UI — ข้อความไทยประกอบมาจากฝั่ง server แล้ว เพราะที่นั่น
// มีทั้ง details JSON และเลขที่เอกสารครบ (เหมือนข้อความแจ้งเตือนที่ประกอบฝั่ง server อยู่แล้ว)
export type ProjectActivityKind =
  | "created"
  | "quote"
  | "sent"
  | "customer"
  | "accepted"
  | "rejected"
  | "contract"
  | "status"
  | "file";

export interface ProjectActivityDto {
  id: string;
  at: string;
  kind: ProjectActivityKind;
  /** ชื่อผู้ทำ (พนักงานหรือลูกค้า) — null เมื่อระบบทำเอง */
  actor: string | null;
  title: string;
  /** บรรทัดรอง เช่น เหตุผลที่ลูกค้าปฏิเสธ หรือสถานะเดิมก่อนเปลี่ยน */
  detail: string | null;
}

export interface PendingRevisionDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  quote: QuoteDto;
}

// ใบเสนอราคาที่ส่งให้ลูกค้าแล้วแต่ยังไม่ตอบกลับ — ใช้ `quote.sentAt` คิดอายุการรอเพื่อเตือนให้ตามงาน
export interface AwaitingQuoteDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  quote: QuoteDto;
}

// ใบเสนอราคาที่ลูกค้าปฏิเสธและยังไม่ได้ตัดสินใจว่าจะออกฉบับใหม่หรือปิดดีล — เดิมไม่มีหมวดนี้
// ดีลที่เสียไปจึงหายออกจากหน้างานค้างเงียบ ๆ ไม่มีใครตามต่อ
export interface RejectedQuoteDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  quote: QuoteDto;
}

/**
 * งวดที่ถึงกำหนดชำระแล้วแต่ยังได้เงินไม่ครบ
 *
 * เข้าเกณฑ์เฉพาะงวดของสัญญาที่ **ลงนามแล้ว** และมีวันครบกำหนดที่พนักงานระบุไว้เอง —
 * งวดที่ยังไม่ได้ตั้งวันครบกำหนดจะไม่โผล่ เพราะระบบไม่มีทางรู้ว่างานถึงงวดนั้นหรือยัง
 */
export interface AwaitingPaymentDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  contract: { id: string; contractNo: string };
  installment: { id: string; seq: number; milestone: string; amount: string; dueOn: string };
  /** ยอดที่ยังขาดของงวดนี้ (ไม่ใช่ยอดเต็มของงวด — บางส่วนอาจรับมาแล้ว) */
  remaining: number;
  daysOverdue: number;
}

export interface PendingWorkDto {
  pendingRevisions: PendingRevisionDto[];
  rejectedQuotes: RejectedQuoteDto[];
  awaitingResponse: AwaitingQuoteDto[];
  awaitingPayment: AwaitingPaymentDto[];
  newLeads: LeadDto[];
}

// ---------- แฟ้มลูกค้า (Customer file) ----------

// ชนิดของเหตุการณ์ในไทม์ไลน์ลูกค้า — ฝั่ง UI ใช้เลือกไอคอน/สี และใช้กรอง "เฉพาะเรื่องงาน"
// (login/security/account เป็นเรื่องบัญชี ไม่ใช่เรื่องดีล ปกติไม่ต้องอ่าน)
export type CustomerActivityKind =
  | "account"
  | "login"
  | "security"
  | "lead"
  | "view"
  | "file"
  | "accepted"
  | "rejected"
  | "revision"
  | "project"
  /** พนักงานทำกับบัญชีลูกค้ารายนี้ (แก้ข้อมูล / ระงับบัญชี / ออกลิงก์) ไม่ใช่ลูกค้าทำเอง */
  | "staff"
  | "other";

/** ชนิดที่ให้ผู้ใช้เลือกกรองได้ (จับหลาย action รวมเป็นชนิดเดียว) */
export const CUSTOMER_ACTIVITY_FILTER_KINDS = [
  "view",
  "file",
  "respond",
  "lead",
  "project",
  "login",
  "security",
  "account",
  "staff",
] as const;
export type CustomerActivityFilterKind = (typeof CUSTOMER_ACTIVITY_FILTER_KINDS)[number];

export interface CustomerActivityDto {
  id: string;
  at: string;
  kind: CustomerActivityKind;
  title: string;
  detail: string | null;
  // โครงการที่เหตุการณ์นี้เกี่ยวข้อง (ถ้ามี) — ใช้ทำลิงก์ไปหน้าโครงการ
  projectId: string | null;
  projectName: string | null;
  /**
   * หมายเลขไอพี — **ส่งมาเฉพาะเมื่อผู้เรียกเป็น OWNER** ADMIN จะได้ null เสมอ
   * นโยบายความเป็นส่วนตัวระบุว่าเก็บไอพีไว้เพื่อความปลอดภัย ไม่ใช่ให้พนักงานเปิดดูทั่วไป
   */
  ip: string | null;
}

/** หนึ่งแถวในฟีดรวมทั้งบริษัท — เหมือนไทม์ไลน์รายคน แต่บอกด้วยว่าใครทำ */
export interface CustomerActivityFeedItemDto extends CustomerActivityDto {
  customerId: string | null;
  customerName: string | null;
}

/** กิจกรรมของลูกค้าเจ้าของโครงการ บนหน้ารายละเอียดโครงการ */
export interface ProjectCustomerActivityDto {
  customerId: string | null;
  customerName: string | null;
  activity: CustomerActivityDto[];
  /**
   * ยอดจริงทั้งหมด — มากกว่า `activity.length` ได้เมื่อชนเพดานของบล็อกนี้
   * หน้าจอต้องบอกผู้ใช้เมื่อไม่เท่ากัน ไม่ใช่ตัดทิ้งเงียบ ๆ
   */
  total: number;
}

/**
 * ผลลัพธ์ที่แบ่งหน้าจากเซิร์ฟเวอร์
 *
 * `total` คือยอดที่ตรงตัวกรองทั้งหมด ไม่ใช่จำนวนแถวในหน้านี้ — ตัวเลข "N รายการ" บนหน้าจอ
 * อ่านจากช่องนี้เสมอ เพื่อไม่ให้เกิดกรณีที่หน้าบอก 20 ทั้งที่มีจริง 4,000
 */
export interface PagedDto<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** ไทม์ไลน์ที่แบ่งหน้าแล้ว — ชื่อช่อง `activity` คงไว้ตามเดิมเพื่อไม่ต้องแก้ทุกจุดที่อ่านอยู่ */
export interface CustomerActivityPageDto {
  activity: CustomerActivityDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerActivityFeedPageDto {
  activity: CustomerActivityFeedItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** ช่องที่รายชื่อลูกค้าเรียงได้จริง — จำนวนโครงการ/ใบเสนอราคาไม่อยู่ในนี้เพราะนับจากตารางอื่น */
export const CUSTOMER_SORT_FIELDS = ["name", "createdAt", "lastLogin"] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

export interface CustomerDirectoryPageDto {
  customers: CustomerListItemDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerProjectSummaryDto {
  id: string;
  projectNo: string;
  name: string;
  status: ProjectStatus;
  /** ราคาสุทธิของเวอร์ชันล่าสุด (Decimal → string); null = ยังไม่มีเวอร์ชัน */
  netPrice: string | null;
  createdAt: string;
}

export interface CustomerQuoteSummaryDto {
  id: string;
  projectId: string;
  projectName: string;
  quoteNo: string;
  revisionNo: number;
  status: QuoteStatus;
  sentAt: string | null;
  respondedAt: string | null;
  createdAt: string;
  // สถานะการเปิดดูของลูกค้า — ชุดเดียวกับ QuoteDto (ดู quote-view.ts ฝั่ง staff-app)
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
}

/** หนึ่งแถวในหน้ารายชื่อลูกค้า — พอให้เลือกได้ว่าจะเปิดแฟ้มของใคร ไม่ต้องละเอียดกว่านี้ */
export interface CustomerListItemDto {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  active: boolean;
  /** ลูกค้าใช้สิทธิ์ขอลบข้อมูลไปแล้ว — ข้อมูลส่วนตัวถูกล้าง บัญชีแก้ไข/เปิดใช้ใหม่ไม่ได้ */
  anonymized: boolean;
  customerType: CustomerType;
  /** ชื่อนิติบุคคล — แสดงคู่กับชื่อคน เพราะพนักงานมักค้นหาด้วยชื่อบริษัท */
  companyName: string | null;
  projectCount: number;
  quoteCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

/** สัญญาของลูกค้ารายนี้ — ผูกกับโครงการ ไม่ได้ผูกกับลูกค้าโดยตรง */
export interface CustomerContractSummaryDto {
  id: string;
  projectId: string;
  projectName: string;
  contractNo: string;
  /** มูลค่าที่ตรึงไว้ตอนออกสัญญา (Decimal → string); null = สัญญาเก่าที่ยังไม่มีการตรึงยอด */
  amount: string | null;
  signedAt: string | null;
  createdAt: string;
  /**
   * จำนวนงวดในแผนการจ่าย — **ไม่ใช่จำนวนงวดที่จ่ายแล้ว**
   * ระบบยังไม่ได้ติดตามการชำระเงินรายงวด จึงบอกได้แค่ว่าแผนมีกี่งวด
   */
  installmentCount: number;
}

/** คำขอที่ลูกค้ารายนี้ส่งเข้ามา (ที่ผูกกับบัญชีแล้ว) */
export interface CustomerLeadSummaryDto {
  id: string;
  createdAt: string;
  serviceType: string;
  status: LeadStatus;
  message: string | null;
  houseDesignName: string | null;
  /** โครงการที่เกิดจากคำขอนี้ (ถ้าถูกแปลงเป็นโครงการแล้ว) */
  projectId: string | null;
  projectName: string | null;
  repliedAt: string | null;
}

/** บันทึกการติดต่อ — สิ่งเดียวในแฟ้มที่พนักงานพิมพ์เอง */
export interface CustomerNoteDto {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** null = บัญชีพนักงานที่เขียนถูกลบไปแล้ว */
  authorId: string | null;
  authorName: string | null;
}

export interface CustomerDetailDto extends CustomerCompanyFieldsDto {
  id: string;
  fullName: string;
  email: string;
  active: boolean;
  /** ลูกค้าใช้สิทธิ์ขอลบข้อมูลไปแล้ว — ข้อมูลส่วนตัวถูกล้าง บัญชีแก้ไข/เปิดใช้ใหม่ไม่ได้ */
  anonymized: boolean;
  createdAt: string;
  phone: string | null;
  address: string | null;
  /**
   * ชื่อที่จะถูกพิมพ์ในช่อง "ผู้ว่าจ้าง" บนใบเสนอราคา/สัญญาจริง
   *
   * เซิร์ฟเวอร์คำนวณมาจากตัวเดียวกับที่ตัวสร้าง PDF ใช้ — หน้าจอห้ามเดาเอง ไม่งั้นสิ่งที่แฟ้ม
   * บอกกับสิ่งที่พิมพ์ออกมาจริงจะไม่ตรงกันเมื่อกฎเปลี่ยน
   */
  billingName: string | null;
  /** เข้าสู่ระบบสำเร็จครั้งล่าสุด — null = ยังไม่เคยเข้าเลย */
  lastLoginAt: string | null;
  projects: CustomerProjectSummaryDto[];
  quotes: CustomerQuoteSummaryDto[];
  contracts: CustomerContractSummaryDto[];
  leads: CustomerLeadSummaryDto[];
  notes: CustomerNoteDto[];
}

/** ลิงก์ตั้งรหัสผ่าน/เข้าใช้งานที่พนักงานออกให้ — ระบบไม่ส่งอีเมล พนักงานคัดลอกไปส่งเอง */
export interface CustomerAccessLinkDto {
  url: string;
  expiresAt: string;
}

// ---------- ถังขยะ (Recycle Bin) ----------

// ชนิดข้อมูลที่รองรับถังขยะ (soft-delete) — โครงการ/แบบบ้าน/แม่แบบ/ผลงาน/วัสดุ/คำขอลูกค้า
export type TrashItemType =
  | "project"
  | "houseDesign"
  | "template"
  | "contractTemplate"
  | "portfolio"
  | "material"
  | "lead";

export interface TrashItemDto {
  type: TrashItemType;
  typeLabel: string;
  id: string;
  label: string;
  deletedAt: string;
  deletedByName: string | null;
  // null = ลบถาวรได้; ข้อความ = เหตุผลที่ลบถาวรไม่ได้ (ยังมีของอ้างอิงอยู่)
  blockReason: string | null;
}

export interface TrashListDto {
  items: TrashItemDto[];
  retentionDays: number;
}

// ---------- สำรองข้อมูล (เฉพาะ OWNER) — ดู server/src/lib/backup ----------
export type BackupTrigger = "auto" | "manual" | "cli" | "pre-restore";

export interface BackupSummaryDto {
  name: string;
  createdAt: string;
  trigger: BackupTrigger;
  totalBytes: number;
  databaseBytes: number;
  fileCount: number;
}

export interface BackupMirrorDto {
  /** ชื่อย่อ (ไดรฟ์ + โฟลเดอร์สุดท้าย) ไม่ใช่ path เต็ม */
  label: string;
  /** โฟลเดอร์มีอยู่ตอนนี้ (ไดรฟ์ USB เสียบอยู่ / Google Drive เปิดอยู่) */
  connected: boolean;
  /** จำนวนชุดในสำเนา — อ่านได้เฉพาะตอนต่ออยู่ */
  count: number;
  latestAt: string | null;
}

export interface BackupStatusDto {
  /** ตั้ง role สำรอง (BACKUP_DATABASE_URL) แล้วหรือยัง — ยัง = สำรองไม่ได้เลย */
  configured: boolean;
  scheduleEnabled: boolean;
  /** ชั่วโมงที่สำรองอัตโนมัติ (เวลาไทย) */
  hour: number;
  keepDays: number;
  /** สำเนานอกเครื่อง (BACKUP_MIRROR_DIR คั่นด้วย ;) — ว่าง = ชุดสำรองอยู่เครื่องเดียวกับระบบ */
  mirrors: BackupMirrorDto[];
  running: boolean;
  lastError: { at: string; message: string } | null;
  /** ชุดล่าสุดเก่าเกิน 36 ชม. (หรือยังไม่เคยสำรอง) */
  stale: boolean;
  backups: BackupSummaryDto[];
}
