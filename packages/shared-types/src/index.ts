// แพ็กเกจนี้ build ออกสองแบบ: CommonJS (dist/ สำหรับ Node server + jest) และ ESM จริง
// (dist/esm/ ให้ Vite หยิบไปใช้ผ่าน field "module") การ re-export แบบระบุชื่อ (ไม่ใช่
// `export *`) ช่วยให้กราฟ ESM ชัดเจนและ tree-shake ได้
export {
  EMAIL_ERROR_MESSAGE,
  emailDomain,
  looksLikeEmail,
  newAccountEmailProblem,
  normalizeEmail,
  suggestEmailFix,
} from "./email";
export {
  SITE_IMAGE_SLOTS,
  SITE_IMAGE_KEYS,
  isSafeImageUrl,
  resolveSiteImage,
  resolveSiteImageSlot,
  SITE_IMAGE_PAGES,
  siteImagePageOf,
  type SiteImagePageId,
  type SiteImageSlot,
  type SiteImageKey,
} from "./site-image";
export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_REQUIRED_CLASSES,
  PASSWORD_MIN_DISTINCT,
  PASSWORD_PROBLEM_MESSAGES,
  hasThaiChars,
  passwordClasses,
  passwordProblem,
  passwordProblemCode,
  passwordRuleStates,
  passwordStrength,
  type PasswordClass,
  type PasswordProblemCode,
  type PasswordRuleState,
  type PasswordStrength,
} from "./password";
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
export {
  BE_OFFSET,
  THAI_MONTHS,
  THAI_MONTHS_SHORT,
  THAI_WEEKDAYS_SHORT,
  addDaysIso,
  calendarWeeks,
  dmyToIso,
  isoToDmy,
  maskDmy,
  monthLabelTh,
  todayIso,
  type CalendarDay,
} from "./date-input";
export { GENERAL_INQUIRY_SERVICE_TYPE, SERVICE_TYPES } from "./service-type";
export { replaceVariableTokens, scanVariableTokens, type VariableToken } from "./variable-tokens";
export { AREA_RANGES, AREA_RANGE_VALUES, areaRangeLabel, isAreaRange, type AreaRange } from "./area-range";
export { applyNetRounding, ROUNDING_UNITS, roundingUnitLabel, roundTo, type NetRounding } from "./rounding";
import type { RetentionBalance } from "./retention";
export {
  retentionBalance,
  retentionOf,
  withholdingAfterRetention,
  type RetentionBalance,
} from "./retention";
export {
  budgetForKey,
  commitmentPaid,
  commitmentRemaining,
  COST_OVERRUN_REASON_LABELS,
  COST_OVERRUN_REASONS,
  COST_TYPES,
  COST_TYPE_LABELS,
  costValue,
  exposureOf,
  overrunAmount,
  type CommitmentStatus,
  type CostBudgetRowDto,
  type CostOverrunDto,
  type CostOverrunInput,
  type CostOverrunReason,
  type CostProfitDto,
  type CostType,
  type ExposureChange,
  type ExposureCommitment,
  type ExposureCost,
  type LinkedChangeOrderDto,
  type ProjectCommitmentDto,
  type ProjectCommitmentInput,
  type ProjectCostDto,
  type ProjectCostInput,
  type ProjectCashDto,
  type ProjectCostReportDto,
  type SignedPriceDriftDto,
  type SignedPriceDriftLineDto,
} from "./project-costs";
export {
  GEOIP_ATTRIBUTION,
  IP_KIND_LABEL,
  classifyIp,
  normalizeIp,
  type GeoipStatusDto,
  type IpGeo,
  type IpInfo,
  type IpKind,
} from "./ip";
import type { GeoipStatusDto, IpGeo, IpInfo, IpKind } from "./ip";
import { roundTo } from "./rounding";

/**
 * ผลตรวจการรับไอพี (หน้าตั้งค่า > การรับ IP เฉพาะ OWNER) — ตอบว่าไอพีที่ระบบบันทึกเป็นของคนใช้งานจริงไหม
 *  ok               ได้ไอพีสาธารณะ
 *  local            เปิดจากเครื่องเดียวกับเซิร์ฟเวอร์ (ระหว่างพัฒนา) ยังตอบไม่ได้
 *  local-network    เปิดจากวงภายในเดียวกัน (เช่น LAN ออฟฟิศ) ต้องลองจากเน็ตข้างนอก
 *  proxy-untrusted  มี proxy ส่งไอพีจริงมาใน X-Forwarded-For แต่ระบบยังไม่เชื่อ → ตั้ง TRUST_PROXY
 *  proxy-no-forward คำขอมาจากวงภายใน (Docker/proxy) และไม่มีใครส่งไอพีจริงมา → ตั้ง proxy ก่อน
 *  trust-all        TRUST_PROXY=true เชื่อทุกชั้น — คนใช้งานปลอมไอพีตัวเองได้ ต้องระบุจำนวนชั้นแทน
 */
export type IpCheckVerdict = "ok" | "local" | "local-network" | "proxy-untrusted" | "proxy-no-forward" | "trust-all";

export interface IpCheckDto {
  /** ไอพีที่ระบบใช้บันทึกจริง (req.ip หลังคิด TRUST_PROXY แล้ว) */
  seen: IpInfo | null;
  /** เครื่องที่ต่อเข้ามาตรง ๆ (ชั้นสุดท้ายก่อนถึง API) */
  socket: IpInfo | null;
  /** ไอพีในหัว X-Forwarded-For ตามลำดับ (ซ้ายสุด = ต้นทาง) */
  forwardedFor: IpInfo[];
  /** หัวข้อมูลอื่นที่ proxy มักใส่มา และมีอยู่ในคำขอนี้ (แสดงชื่อเท่านั้น) */
  forwardHeaders: string[];
  /** ค่า TRUST_PROXY ที่เซิร์ฟเวอร์ใช้อยู่ (null = ไม่เชื่อ proxy) */
  trustProxy: string | null;
  verdict: IpCheckVerdict;
  /** ประเทศ/ผู้ให้บริการของไอพีที่บันทึก (ไอพีภายในหรือไม่มีฐานข้อมูล = null) */
  seenGeo: IpGeo | null;
  /** สถานะฐานข้อมูลประเทศ/ผู้ให้บริการ */
  geoip: GeoipStatusDto;
}

export {
  DEFAULT_COVER,
  DEFAULT_STRUCTURAL_SETTINGS,
  DEFAULT_TAKEOFF_RULES,
  normalizeTakeoffRules,
  settingsFromRuleSet,
  STRUCTURAL_KINDS,
  TAKEOFF_MAX_ROWS,
  TAKEOFF_SHAPES,
  isWeightUnit,
  structuralTakeoff,
  sumTakeoffSheet,
  isAreaUnit,
  takeoffRowValue,
  takeoffShapeForUnit,
  takeoffShapeOf,
  type BarSet,
  type FootingType,
  type MeshEnd,
  type RebarRuleFlags,
  type TakeoffRulePresets,
  type TakeoffRuleSet,
  type SpacedBars,
  type StructuralInput,
  type StructuralKind,
  type StructuralOutputGroup,
  type StructuralOutputRow,
  type StructuralSettings,
  type StructuralTakeoff,
  type TieEndZone,
  type TakeoffDimension,
  type TakeoffRowInput,
  type TakeoffShape,
  type TakeoffSheetTotal,
  rebarCode,
} from "./takeoff";
export {
  OFFCUT_KEEP_MIN,
  STOCK_LENGTH_OPTIONS,
  cutPlan,
  pickStock,
  splitToStock,
  type CutPattern,
  type CutPlan,
  type CutRequest,
} from "./rebar-cutting";
export {
  TILE_PATTERNS,
  defaultAdhesive,
  defaultTileJointMm,
  defaultTileThicknessMm,
  TILE_BREAKAGE_DEFAULT_PCT,
  tileCutAllowancePct,
  groutKgPerSqm,
  parseTileSize,
  tileAdhesiveName,
  tileComponents,
  tileConfigErrors,
  tileGroutName,
  tileTrimName,
  tileDisplayName,
  tilePricingErrors,
  tileTakeoff,
  type TileAdhesive,
  type TileCalcConfig,
  type TileComponent,
  type TileGrout,
  type TilePattern,
  type TilePriceUnit,
  type TileRoomCount,
  type TileTakeoffResult,
  type TileTrim,
} from "./tile";
import type { TileCalcConfig } from "./tile";

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
  /** พนักงานเท่านั้น — ชื่อที่ใช้เข้าระบบฝั่งบริษัท · ลูกค้าเป็น null */
  username: string | null;
  /** ลูกค้าเท่านั้นที่บังคับมี — พนักงานเป็น null ได้ เพราะเข้าระบบด้วย username */
  email: string | null;
  /**
   * อีเมลยืนยันแล้ว (กรอกรหัส 6 หลักจากเมล / กดลิงก์ในเมลสำเร็จ) — พนักงานใช้กู้รหัสผ่านทางอีเมล
   * ได้เฉพาะเมื่อเป็น true · หน้าจอฝั่งพนักงานเตือนให้ตั้งเมื่อยังเป็น false
   */
  emailVerified: boolean;
  fullName: string;
  role: Role;
  // เปิดใช้ยืนยันตัวตน 2 ชั้น (2FA/TOTP) อยู่หรือไม่ — ใช้โชว์ป้ายสถานะในเมนูฝั่งพนักงาน
  twoFactorEnabled: boolean;
  // โปรไฟล์ (หน้า "บัญชีของฉัน") — jobTitle/workPhone มีเฉพาะพนักงาน ลูกค้าได้ null เสมอ
  /** URL เต็มของรูปโปรไฟล์ (256×256 WebP) ทั้งพนักงานและลูกค้า · null = แสดงตัวย่อชื่อแทน */
  avatarUrl: string | null;
  jobTitle: string | null;
  workPhone: string | null;
  /**
   * รหัสผ่านปัจจุบันเป็นรหัสที่ "คนอื่นตั้งให้" — ต้องเปลี่ยนก่อนใช้งานต่อ
   *
   * ตั้งเป็น true เฉพาะตอน OWNER สร้างบัญชีพนักงานใหม่หรือรีเซ็ตรหัสให้พนักงานคนอื่น เพราะรหัส
   * นั้นเดินทางผ่าน LINE/กระดาษ/ปากเปล่ามาถึงเจ้าตัว มีคนรู้อย่างน้อยสองคนเสมอ · ลูกค้าไม่มีเคสนี้
   * เพราะทีมงานไม่เคยตั้งรหัสให้ลูกค้า — ออกลิงก์ครั้งเดียวให้ลูกค้าตั้งเองตั้งแต่ต้น
   */
  mustChangePassword: boolean;
}

/** แก้โปรไฟล์ของตัวเอง (พนักงาน) — ชื่อผู้ใช้แก้ไม่ได้เพราะเป็นชื่อเข้าระบบ ต้องให้ OWNER เปลี่ยน */
export interface UpdateMyStaffProfileInput {
  fullName: string;
  jobTitle: string | null;
  workPhone: string | null;
}

// บัญชีพนักงาน (OWNER/ADMIN) สำหรับหน้าจัดการผู้ใช้ของ OWNER — ไม่รวมลูกค้า และไม่ส่งรหัสผ่าน
export interface StaffUserDto {
  id: string;
  /** ชื่อเข้าระบบ · บัญชีเก่าที่ยังไม่ได้ตั้งเป็น null */
  username: string | null;
  /** อีเมลกู้รหัสผ่าน */
  email: string | null;
  /** เจ้าตัวยืนยันอีเมลแล้ว — ถึงจะกดลืมรหัสผ่านแล้วได้ลิงก์ทางอีเมล */
  emailVerified: boolean;
  /** เปิดยืนยันตัวตน 2 ชั้นอยู่ — หน้าต่างรีเซ็ตรหัสมีตัวเลือกปิดให้ (กรณีทำมือถือหาย) */
  twoFactorEnabled: boolean;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
  /** จำนวนเครื่องที่ยังเข้าสู่ระบบอยู่ (session ที่ยังไม่หมดอายุ) */
  activeSessions: number;
  /** ใช้งานล่าสุดจากเครื่องใดก็ได้ · null = ไม่มีเครื่องที่เข้าอยู่ */
  lastSeenAt: string | null;
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
  // ขนาดกระเบื้อง (เฉพาะวัสดุที่เป็นกระเบื้อง) — ตัวคิดกระเบื้องหยิบไปใช้ · null = ไม่ได้ตั้ง
  tileWidthMm: number | null;
  tileLengthMm: number | null;
  tileThicknessMm: string | null;
  tilePiecesPerBox: number | null;
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
  /** ใบถอดแบบ (qtyBasis = "SHEET") — ว่างสำหรับบรรทัดฐานอื่น · ฝั่งพนักงานเท่านั้น */
  takeoffRows: TakeoffRowDto[];
  /** ค่าที่กรอกในตัวคิดกระเบื้อง (บรรทัดหน่วย ตร.ม.) — null = ไม่ได้ใช้ · ฝั่งพนักงานเท่านั้น */
  tileCalc: TileCalcConfig | null;
}

/** หนึ่งแถวของใบถอดแบบ (Decimal → string) */
export interface TakeoffRowDto {
  id: string;
  label: string;
  count: string;
  length: string | null;
  width: string | null;
  height: string | null;
  barDia: number | null;
  deduct: boolean;
  sortOrder: number;
  /** แถวจากตัวคิดชิ้นส่วนโครงสร้าง — กุญแจชิ้นส่วนในเวอร์ชันเดียวกัน · null = กรอกเอง */
  memberKey: string | null;
}

/**
 * เทียบเหล็กเสริม "ชุดเสนอราคา" (ที่ลง BOQ) กับ "ชุดสั่งตัด" — คิดจากขนาดชิ้นส่วนที่เก็บไว้ (ฝั่งพนักงานเท่านั้น)
 * ตัวเลขทุกตัวเป็นปริมาณสุทธิก่อนเผื่อเสีย (กก.)
 */
export interface StructuralCompareLineDto {
  itemId: string;
  /** ผลรวมแถวที่มาจากชิ้นส่วน (ชุดเสนอราคา ตามที่อยู่ในใบถอดแบบตอนนี้) */
  tenderNet: number;
  /** ชิ้นส่วนเดียวกันคิดด้วยชุดสั่งตัด */
  siteNet: number;
  /** แถวที่กรอกเองในบรรทัดนี้ (ไม่อยู่ในการเทียบ) */
  manualRows: number;
}

export interface StructuralCompareDiaDto {
  dia: number;
  tenderNet: number;
  siteNet: number;
  /** ความยาวรวมของชุดสั่งตัด (ม.) */
  siteLength: number;
}

/**
 * ชิ้นส่วนโครงสร้างที่ลงไว้ในเวอร์ชันล่าสุด (Phase 2 ข้อ 3c) — ขนาดที่เก็บไว้ + บรรทัดที่ชิ้นส่วนนี้มีแถวอยู่
 * หน้าจอใช้เปิดตัวคิดพร้อมค่าเดิมเพื่อลงทับ หรือลบชิ้นส่วนพร้อมแถวของมันออกจาก BOQ
 */
export interface StructuralMemberDto {
  key: string;
  kind: import("./takeoff").StructuralKind;
  label: string;
  count: number;
  /** ขนาดที่กรอกตอนลง (StructuralInput) — ใช้เติมฟอร์มตอนแก้ */
  input: import("./takeoff").StructuralInput;
  createdAt: string;
  lines: {
    itemId: string;
    name: string;
    unit: string;
    /** จำนวนแถวของชิ้นส่วนนี้ในบรรทัด */
    rows: number;
    /** ขนาดเหล็กของแถวเหล่านั้น (ว่าง = แถวคอนกรีต/ไม้แบบ) */
    barDias: number[];
  }[];
}

/**
 * คิดชิ้นส่วนทั้งโครงการใหม่ด้วยชุดเสนอราคาปัจจุบัน (Phase 2 ข้อ 3b) — พรีวิวก่อน-หลังรายบรรทัด
 * เงินเป็นต้นทุนตรง (ปริมาณ × ราคาต่อหน่วยของบรรทัด) ราคาขายขยับตาม % กำไร/VAT ของเวอร์ชัน
 */
export interface StructuralRecomputeDto {
  /** ชิ้นส่วนทั้งหมดในเวอร์ชันล่าสุด */
  members: number;
  /** ชิ้นส่วนที่แถวจะเปลี่ยน */
  changedMembers: number;
  /** ชิ้นส่วนที่คิดใหม่ไม่ได้ พร้อมเหตุผล (ไม่ถูกแตะ) */
  skipped: { label: string; reason: string }[];
  lines: {
    itemId: string;
    name: string;
    unit: string;
    qtyBefore: number;
    qtyAfter: number;
    /** ต้นทุนตรงของบรรทัด (ปริมาณ × (ค่าวัสดุ + ค่าแรง) ต่อหน่วย) */
    costBefore: number;
    costAfter: number;
  }[];
  costDelta: number;
  /** เวอร์ชันล่าสุดส่งใบเสนอราคาแล้ว — ยืนยันแล้วจะแตกเวอร์ชันใหม่ ใบที่ส่งไปไม่เปลี่ยน */
  willBranch: boolean;
  /** true = เขียนลง BOQ แล้ว (ไม่ใช่แค่พรีวิว) */
  applied: boolean;
  versionNo: number;
}

/**
 * แผนตัดเหล็กหน้างานทั้งโครงการ (Phase 3 ข้อ 3a) — ชุดสั่งตัด แยกตามขนาด เทียบเหล็กเส้น 10/12 ม.
 * plans เรียงตาม STOCK_LENGTH_OPTIONS · recommended = ความยาวที่ซื้อเหล็กน้อยกว่า
 */
export interface RebarCuttingDto {
  /** ชิ้นส่วนที่นับ (มีแถวอยู่ใน BOQ) */
  members: number;
  byDia: {
    dia: number;
    code: string;
    /** จำนวนชิ้นที่ต้องตัด (คิดที่เส้น 10 ม.) */
    pieces: number;
    plans: (import("./rebar-cutting").CutPlan & { netKg: number; purchaseKg: number })[];
    recommended: number;
  }[];
}

export interface StructuralCompareDto {
  /** ชิ้นส่วนที่ยังมีแถวอยู่ใน BOQ */
  members: { label: string; kind: string; count: number }[];
  lines: StructuralCompareLineDto[];
  byDia: StructuralCompareDiaDto[];
  /** บรรทัดเหล็ก (หน่วยน้ำหนัก) ที่ไม่มีแถวจากชิ้นส่วนเลย — "ไม่มีข้อมูลเทียบ" */
  noDataItemIds: string[];
}

/** ช่องเปิดประตู/หน้าต่างของโครงการ — หักออกจากพื้นที่ผนังก่อนคิดงานผนัง */
export interface ProjectOpeningDto {
  label: string;
  count: number;
  width: number;
  height: number;
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
  contingencyAmt: string;
  overheadProfitPct: string;
  overheadProfitAmt: string;
  discountAmt: string;
  /** ส่วนลดปัดเศษ — "0.00" = ไม่ได้ปัด */
  roundingAmt: string;
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

export interface ProjectVersionDto {
  id: string;
  projectId: string;
  versionNo: number;
  directCost: string;
  /** ค่าเผื่อเหลือเผื่อขาด % ของต้นทุนตรง ("0.00" = ไม่เผื่อ) */
  contingencyPct: string;
  contingencyAmt: string;
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
  /** ปัดยอดสุทธิ (รวม VAT) ลงเป็นทวีคูณของหน่วยนี้ (บาท) — null = ไม่ปัด */
  roundingUnit: number | null;
  /** ส่วนลดปัดเศษที่หักก่อน VAT — "0.00" = ไม่ได้ปัด หรือยอดลงตัวอยู่แล้ว */
  roundingAmt: string;
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
  return roundTo(value, 2);
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
  /** ค่าเผื่อเหลือเผื่อขาด — ค่าดำเนินการคิดจาก "ต้นทุนตรง + เผื่อเหลือเผื่อขาด" ไม่ใช่ต้นทุนตรงเปล่า ๆ */
  contingencyAmt?: number;
  overheadProfitPct: number;
  overheadProfitAmt: number;
  overheadPct: number | null;
}): OverheadProfitSplit {
  const { overheadPct } = input;
  if (overheadPct == null || !Number.isFinite(overheadPct)) {
    return { known: false, overheadPct: 0, profitPct: 0, overheadAmt: 0, profitAmt: 0 };
  }
  const baseCost = round2(input.directCost + (input.contingencyAmt ?? 0));
  const overheadAmt = round2(baseCost * (overheadPct / 100));
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
  /** มีเฉพาะในหน้ารายละเอียดโครงการ (การ์ดลูกค้า + ช่องเลือกลูกค้า) — ที่อื่นไม่ได้ดึงมา */
  avatarUrl?: string | null;
  /** เบอร์จากโปรไฟล์ลูกค้า — มีที่เดียวกับ avatarUrl */
  phone?: string | null;
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
  // พื้นที่ช่องเปิดประตู/หน้าต่างรวม (ตร.ม.) — หักจากพื้นที่ผนังของทุกบรรทัดที่คิดต่อพื้นที่ผนัง
  openingAreaSqm: string | null;
  // รายการช่องเปิดที่ใช้คิดยอดข้างบน (null = กรอกยอดรวมเอง)
  openings: ProjectOpeningDto[] | null;
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
  /** วันที่ส่งมอบ (COMPLETED) · null = ยังไม่ส่งมอบ หรือส่งมอบก่อนระบบเริ่มเก็บวันที่ */
  completedAt: string | null;
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
  // ── ขั้นอนุมัติก่อนส่ง (ฝั่งพนักงานเท่านั้น) ──
  /** มีค่าจาก listQuotes — ใครเสนอ/ใครอนุมัติ (ไม่มีรูปลายเซ็น ดูรูปได้ใน PDF) */
  approval?: QuoteApprovalDto;
  /** ผู้อนุมัติส่งกลับให้แก้ — เหตุผลล่าสุด (ล้างเมื่อขออนุมัติใหม่) */
  approvalReturnNote?: string | null;
  approvalReturnedAt?: string | null;
}

/**
 * สถานะการอนุมัติของใบร่าง: NONE = ยังไม่ขอ · PENDING = รอ OWNER อนุมัติ · APPROVED = ส่งให้ลูกค้าได้
 * ใบที่ส่งไปแล้วก่อนมีขั้นอนุมัติจะเป็น NONE ตลอด (ไม่เติมย้อนหลัง)
 */
export type QuoteApprovalState = "NONE" | "PENDING" | "APPROVED";

export interface QuoteSignerSummaryDto {
  userId: string | null;
  name: string;
  title: string | null;
  /** เซ็นตอนนั้นมีรูปลายเซ็นหรือไม่ — ไม่มี = PDF พิมพ์เป็นเส้นว่าง + ชื่อ */
  hasSignature: boolean;
  signedAt: string;
}

export interface QuoteApprovalDto {
  state: QuoteApprovalState;
  proposer: QuoteSignerSummaryDto | null;
  approver: QuoteSignerSummaryDto | null;
}

/** อุปกรณ์ที่เข้าสู่ระบบอยู่ (หน้า "บัญชีของฉัน") — ไม่มี token จริงหลุดออกไป ใช้ handle ที่แปลงทางเดียวแทน */
export interface MySessionDto {
  handle: string;
  current: boolean;
  browser: string;
  os: string;
  kind: "desktop" | "mobile" | "tablet";
  ip: string | null;
  /** ไอพีชนิดไหน (สาธารณะ/วงภายใน/เครื่องเซิร์ฟเวอร์) — null = ไม่มีไอพี */
  ipKind: IpKind | null;
  /** ประเทศ + ผู้ให้บริการเน็ต จากฐานไอพีออฟไลน์ (ไม่ส่งไอพีออกนอกระบบ) · null = ไอพีภายใน/ค้นไม่เจอ */
  ipGeo: IpGeo | null;
  /** เข้าจากเบราว์เซอร์ที่บัญชีนี้ไม่เคยใช้มาก่อน */
  newDevice: boolean;
  createdAt: string;
  lastSeenAt: string;
  /** หลุดออกจากระบบเองเมื่อไร (อายุ session ตายตัวนับจากตอนเข้า ไม่ต่ออายุตามการใช้งาน) */
  expiresAt: string;
}

/** โทนของเหตุการณ์ในประวัติการเข้าสู่ระบบ — success เข้าได้ · danger มีคนลองแล้วไม่ผ่าน · warning ถูกล็อก/สั่งออก */
export type LoginEventTone = "success" | "danger" | "warning" | "neutral";

/** หนึ่งเหตุการณ์ในประวัติการเข้าสู่ระบบและความปลอดภัยของบัญชีตัวเอง (อ่านจาก AuditLog) */
export interface LoginEventDto {
  id: string;
  at: string;
  tone: LoginEventTone;
  /** "เข้าสู่ระบบ" · "รหัสผ่านไม่ถูกต้อง" · "เปลี่ยนรหัสผ่าน" ... */
  title: string;
  /** รายละเอียดเสริม เช่น เครื่องที่ถูกสั่งออก */
  detail: string | null;
  /** เข้าจากเครื่องที่บัญชีนี้ไม่เคยใช้ */
  newDevice: boolean;
  /** "Chrome · Windows" ของเครื่องที่ทำเหตุการณ์นี้ */
  device: string | null;
  kind: "desktop" | "mobile" | "tablet";
  ip: string | null;
  ipKind: IpKind | null;
  ipGeo: IpGeo | null;
}

export interface LoginHistoryDto {
  events: LoginEventDto[];
  /** หน้าปัจจุบัน (เริ่มที่ 1 — ขอเกินหน้าสุดท้ายได้หน้าสุดท้าย) */
  page: number;
  pageSize: number;
  /** จำนวนเหตุการณ์ทั้งหมดในช่วงที่ดูย้อนหลังได้ */
  total: number;
  /** ย้อนหลังได้กี่วัน */
  days: number;
}

/** ลายเซ็นของตัวเอง — dataUrl เป็น PNG พื้นโปร่งใส ส่งกลับให้เจ้าของดูเท่านั้น */
export interface MySignatureDto {
  dataUrl: string | null;
  updatedAt: string | null;
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
  /** เงินประกันผลงาน % ของยอดงวดรวม VAT — null = ไม่มี */
  retentionPct?: string | null;
  retentionSetAt?: string | null;
  retentionDueOn?: string | null;
}

// ---------- ใบงานเพิ่ม-ลด (Variation Order) ----------
//
// คิดจาก BOQ สองเวอร์ชัน (ก่อน → หลังแก้) เป็นราคาขาย (พับกำไรแล้ว) แบบเดียวกับใบเสนอราคาฝั่งลูกค้า

export type ChangeOrderStatus = "DRAFT" | "SENT" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ChangeOrderLineKind = "added" | "removed" | "changed";

export interface ChangeOrderLineDto {
  kind: ChangeOrderLineKind;
  categoryCode: string | null;
  name: string;
  unit: string;
  beforeQty: string | null;
  afterQty: string | null;
  /** ราคาขายต่อหน่วย (รวมค่าดำเนินการ/กำไรแล้ว) */
  beforeUnitPrice: string | null;
  afterUnitPrice: string | null;
  beforeTotal: string;
  afterTotal: string;
  /** หลัง − ก่อน (ติดลบ = งานลด) */
  delta: string;
}

export interface ChangeOrderTotalsDto {
  /** รวมงานเพิ่ม / งานลด ก่อน VAT (ค่าบวกทั้งคู่) */
  addAmount: string;
  deductAmount: string;
  /** ผลต่างส่วนลด/ปัดเศษ ที่ทำให้ผลรวมรายการไม่เท่ายอดจริง — 0 ส่วนใหญ่ */
  adjustAmount: string;
  netBeforeVat: string;
  vatAmount: string;
  /** เปลี่ยนแปลงสุทธิรวม VAT (ติดลบ = มูลค่าสัญญาลดลง) */
  totalAmount: string;
}

/** งวดที่ถูกสร้าง/ปรับตอนอนุมัติ — from = null แปลว่างวดใหม่ */
export interface ChangeOrderInstallmentChangeDto {
  seq: number;
  milestone: string;
  from: string | null;
  to: string;
}

export interface ChangeOrderDto extends ChangeOrderTotalsDto {
  id: string;
  contractId: string;
  seq: number;
  docNo: string;
  status: ChangeOrderStatus;
  title: string;
  note: string | null;
  extensionDays: number | null;
  fromVersionNo: number;
  toVersionNo: number;
  lines: ChangeOrderLineDto[];
  sentAt: string | null;
  respondedAt: string | null;
  /** PORTAL = ลูกค้ากดในพอร์ทัล · PAPER = พนักงานบันทึกจากใบที่เซ็น */
  respondedVia: "PORTAL" | "PAPER" | null;
  responseNote: string | null;
  installmentChanges: ChangeOrderInstallmentChangeDto[] | null;
  createdAt: string;
  createdByName: string | null;
  /** ร่างที่ BOQ ถูกแก้ต่อหลังออก — ตัวเลขในร่างยังไม่รวมการแก้ล่าสุด ต้องกด "คิดใหม่" */
  outdated: boolean;
  /** มูลค่าสัญญาก่อนใบนี้ → หลังใบนี้ (ใบที่ยังไม่อนุมัติ = ถ้าอนุมัติ) */
  amountBefore: string | null;
  amountAfter: string | null;
}

/** ตัวอย่างก่อนออกใบ — ยังไม่บันทึกอะไร */
export interface ChangeOrderPreviewDto extends ChangeOrderTotalsDto {
  fromVersionNo: number;
  toVersionNo: number;
  lines: ChangeOrderLineDto[];
  /** มูลค่าสัญญาปัจจุบัน → หลังใบนี้อนุมัติ */
  currentAmount: string;
  newAmount: string;
}

/** ใบงานเพิ่ม-ลดทั้งหมดของสัญญาหนึ่งฉบับ + มูลค่าสัญญา */
export interface ContractChangeOrdersDto {
  /** มูลค่าตามสัญญาที่ลงนาม */
  contractAmount: string | null;
  /** มูลค่าปัจจุบัน = ตามสัญญา + ใบที่อนุมัติแล้ว */
  currentAmount: string | null;
  changeOrders: ChangeOrderDto[];
  /** ออกใบใหม่ได้ไหมตอนนี้ — ไม่ได้ = บอกเหตุผลเป็นภาษาคน */
  blocker: string | null;
}

/** ฝั่งลูกค้า — เฉพาะใบที่ส่งถึงแล้ว (ไม่มีร่าง/ใบที่ยกเลิก) */
export type CustomerChangeOrderDto = Omit<
  ChangeOrderDto,
  "contractId" | "fromVersionNo" | "toVersionNo" | "createdByName" | "outdated"
>;

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
  /** เงินประกันผลงานที่ผู้ว่าจ้างกันไว้จากครั้งนี้ ("0.00" = ไม่ได้กัน) */
  retentionAmount: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  /** คนที่รับเงินสด/เช็คมากับมือ — null สำหรับเงินโอน */
  receivedBy: string | null;
  /** null = บัญชีพนักงานที่บันทึกถูกลบไปแล้ว */
  recordedByName: string | null;
  recordedById: string | null;
  createdAt: string;
  /** ยืนยันกับบัญชีธนาคารแล้วเมื่อ — null = รอยืนยัน (ออกใบเสร็จไม่ได้ · ลูกค้ายังไม่เห็น) */
  verifiedAt: string | null;
  verifiedById: string | null;
  verifiedByName: string | null;
  /** หลักฐานการรับเงิน (สลิป/รูปเช็ค/สำเนาใบเสร็จ) — เฉพาะพนักงาน ลูกค้าไม่เห็น */
  evidence: PaymentEvidenceDto[];
}

/** ไฟล์หลักฐานการรับเงินหนึ่งไฟล์ — เปิดดูผ่าน route ที่ตรวจสิทธิ์พนักงาน */
export interface PaymentEvidenceDto {
  id: string;
  fileName: string;
  sizeBytes: number;
  /** null = บัญชีที่แนบถูกลบไปแล้ว */
  uploadedByName: string | null;
  uploadedById: string | null;
  createdAt: string;
}

/** หลักฐานต่อรายการรับเงิน — หน้า-หลังเช็ค + ใบนำฝาก ก็ยังไม่เกิน */
export const PAYMENT_EVIDENCE_MAX_FILES = 5;
export const PAYMENT_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
/** สลิปจากแอปธนาคารเป็นรูป · ใบนำฝาก/สแกนเป็น PDF — ทั้งหมดเปิดดูในเบราว์เซอร์ได้ */
export const PAYMENT_EVIDENCE_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";
/** สลิปต่อการแจ้งโอนหนึ่งครั้งของลูกค้า — โอนหลายบัญชี/หลายครั้งในวันเดียวยังพอ */
export const PAYMENT_NOTICE_MAX_FILES = 3;

/** CANCELLED = ลูกค้ายกเลิกเองก่อนบริษัทตรวจ (แนบสลิปผิด/พิมพ์ยอดผิด) */
export type PaymentNoticeStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

/**
 * ผลตรวจสลิปกับธนาคาร (ผู้ให้บริการตรวจสลิป) — **ผ่าน ≠ เงินเข้า** พนักงานยังต้องกดยืนยันเสมอ
 * PASSED = ยืนยันคลิกเดียวได้ · MISMATCH = สลิปจริงแต่มีจุดไม่ตรง · UNCHECKED = ตรวจไม่ได้ (ตรวจเองแบบเดิม)
 * FAKE / DUPLICATE / WRONG_ACCOUNT = ระบบปฏิเสธการแจ้งทันที
 */
export type SlipCheckStatus = "PASSED" | "MISMATCH" | "UNCHECKED" | "FAKE" | "DUPLICATE" | "WRONG_ACCOUNT";

/** ผลตรวจรายไฟล์ */
export interface SlipFileCheckDto {
  evidenceId: string;
  status: SlipCheckStatus;
  transRef: string | null;
  amount: string | null;
  /** ISO datetime */
  transferredAt: string | null;
  senderName: string | null;
  senderBank: string | null;
  receiverName: string | null;
  /** ถูกปิดบางหลัก */
  receiverAccount: string | null;
  /** เหตุที่ตรวจไม่ได้ */
  message: string | null;
}

export interface SlipCheckDto {
  status: SlipCheckStatus;
  /** จุดที่ไม่ตรง — ข้อความไทยพร้อมแสดง */
  flags: string[];
  files: SlipFileCheckDto[];
}

/**
 * ลูกค้าแจ้งโอนเงินพร้อมสลิป (มุมพนักงาน) — **ยังไม่ใช่เงินเข้า** จนกว่าพนักงานตรวจกับบัญชีแล้วยืนยัน
 * `amount` = ยอดที่ลูกค้าบอกว่าโอน (หลังหัก ณ ที่จ่ายแล้ว ถ้ามี) ไม่ใช่ยอดที่ถือว่าชำระงวด
 */
export interface PaymentNoticeDto {
  id: string;
  installmentId: string;
  paidOn: string;
  amount: string;
  note: string | null;
  status: PaymentNoticeStatus;
  submittedByName: string | null;
  createdAt: string;
  evidence: PaymentEvidenceDto[];
  /** null = ไม่ได้ตรวจสลิปอัตโนมัติ (ปิดระบบอยู่ / การแจ้งก่อนมีระบบนี้) */
  slipCheck: SlipCheckDto | null;
  /** เหตุผลที่ปฏิเสธ (ของการแจ้งที่ถูกปฏิเสธ) */
  rejectReason: string | null;
}

/** การแจ้งโอนในมุมลูกค้า — เห็นสถานะของตัวเองและเหตุผลถ้าไม่ผ่าน */
export interface CustomerPaymentNoticeDto {
  id: string;
  paidOn: string;
  amount: string;
  status: PaymentNoticeStatus;
  rejectReason: string | null;
  createdAt: string;
  evidence: { id: string; fileName: string }[];
  /** ระบบตรวจสลิปกับธนาคารผ่านแล้ว (ยังรอบริษัทกดยืนยัน) */
  slipVerified: boolean;
  /**
   * ยอดในสลิปตามธนาคาร ไม่ตรงกับยอดที่ลูกค้ากรอก — บอกลูกค้าทันที (ส่วนใหญ่คือแนบสลิปผิดใบ/พิมพ์ยอดผิด)
   * null = ตรง หรือยังตรวจสลิปไม่ได้
   */
  slipAmountMismatch: { slipAmount: string } | null;
  /** ลูกค้ายกเลิกการแจ้งนี้เองได้ — ยังรอตรวจ และบริษัทยังไม่ได้บันทึกรับเงินจากการแจ้งนี้ */
  canCancel: boolean;
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
  /** เงินประกันผลงานที่ถูกกันไว้รวมทุกครั้ง (ยังเป็นหนี้ของลูกค้า แต่อยู่ในก้อน "รอคืน" ไม่ใช่ของงวดนี้) */
  retainedAmount: number;
  /** เงินที่เข้าบัญชีจริงรวม = paidAmount − withheldAmount − retainedAmount */
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
  payments: { amount: number; withholdingAmount: number; retentionAmount?: number }[];
  dueOn: string | null;
  /** วันนี้ในรูปแบบ YYYY-MM-DD */
  today: string;
}): InstallmentProgress {
  const paidAmount = round2(input.payments.reduce((sum, p) => sum + p.amount, 0));
  const withheldAmount = round2(input.payments.reduce((sum, p) => sum + p.withholdingAmount, 0));
  const retainedAmount = round2(input.payments.reduce((sum, p) => sum + (p.retentionAmount ?? 0), 0));
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
    retainedAmount,
    receivedAmount: round2(paidAmount - withheldAmount - retainedAmount),
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
  /** เงินประกันผลงานที่คาดว่าจะถูกกันจากงวดนี้ — null = สัญญาไม่มีเงินประกัน */
  expectedRetention: number | null;
  payments: InstallmentPaymentDto[];
  /** ลูกค้าแจ้งโอนมาแล้วยังไม่มีใครตรวจ — เรียงเก่าก่อน */
  pendingNotices: PaymentNoticeDto[];
  /**
   * การแจ้งที่ระบบตรวจสลิปปฏิเสธ (ปลอม/ซ้ำ/ผิดบัญชี) ในช่วง 90 วัน — ให้พนักงานเห็นความพยายามใช้สลิปไม่ถูกต้อง
   * (ผู้ใช้เลือก "ปฏิเสธ + เก็บให้พนักงานเห็น")
   */
  slipRejectedNotices: PaymentNoticeDto[];
  /** ใบแจ้งหนี้/ใบเสร็จของงวดนี้ รวมใบที่ยกเลิกแล้ว เรียงตามวันที่ออก */
  documents: BillingDocSummaryDto[];
}

/** ใบแจ้งหนี้ (ต่องวด) / ใบเสร็จรับเงิน (ต่อรายการรับเงิน) */
export type BillingDocType = "INVOICE" | "RECEIPT";

export const BILLING_DOC_LABELS: Record<BillingDocType, string> = {
  INVOICE: "ใบแจ้งหนี้",
  RECEIPT: "ใบเสร็จรับเงิน",
};

export interface BillingDocSummaryDto {
  id: string;
  type: BillingDocType;
  /** ใบเสร็จที่เป็นใบกำกับภาษีด้วย — หน้าจอใช้เรียกชื่อใบให้ตรงกับกระดาษ */
  isTaxInvoice: boolean;
  docNo: string;
  /** ใบแจ้งหนี้ = วันวางบิล · ใบเสร็จ = วันที่ได้รับเงิน (YYYY-MM-DD) */
  issuedOn: string;
  dueOn: string | null;
  amount: string;
  /** ใบเสร็จเท่านั้น — รายการรับเงินที่ใบนี้ออกให้ */
  paymentId: string | null;
  /** ใบของเงินประกันผลงาน (ทั้งสัญญา ไม่ใช่ของงวด) */
  forRetention: boolean;
  /** ใบเสร็จรับคืนเงินประกัน — รายการรับคืนที่ใบนี้ออกให้ */
  retentionReleaseId: string | null;
  issuedByName: string;
  createdAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

/** หนึ่งบรรทัดในรายงานภาษีขาย = ใบกำกับภาษีหนึ่งใบ (ตัวเลขตรึงมาจากใบ ไม่คำนวณใหม่) */
export interface SalesTaxRowDto {
  id: string;
  docNo: string;
  issuedOn: string;
  customerName: string | null;
  customerTaxId: string | null;
  customerBranch: string | null;
  projectNo: string;
  /** มูลค่าสินค้า/บริการก่อนภาษี */
  base: number;
  vat: number;
  total: number;
  /** ใบที่ยกเลิก — ยังอยู่ในรายงานให้เลขที่เรียงต่อกัน แต่ไม่ถูกนับในยอดรวม */
  voidedAt: string | null;
  voidReason: string | null;
}

export interface SalesTaxReportDto {
  /** ปปปป-ดด */
  month: string;
  rows: SalesTaxRowDto[];
  totals: {
    count: number;
    voidedCount: number;
    base: number;
    vat: number;
    total: number;
  };
}

export interface IssueInvoiceInput {
  /** กำหนดชำระ (YYYY-MM-DD) — ตั้งเป็นวันครบกำหนดของงวดด้วย */
  dueOn: string;
}

export interface VoidBillingDocInput {
  reason: string;
}

/** เอกสารที่ลูกค้าเปิดได้ — เฉพาะใบที่ยังไม่ถูกยกเลิก */
export interface CustomerBillingDocDto {
  id: string;
  type: BillingDocType;
  isTaxInvoice: boolean;
  docNo: string;
  issuedOn: string;
}

/** ชื่อใบที่พิมพ์บนกระดาษ — ใบเสร็จที่เป็นใบกำกับภาษีเรียกชื่อยาวกว่า */
export function billingDocLabel(doc: { type: BillingDocType; isTaxInvoice?: boolean }): string {
  return doc.type === "RECEIPT" && doc.isTaxInvoice
    ? "ใบเสร็จรับเงิน/ใบกำกับภาษี"
    : BILLING_DOC_LABELS[doc.type];
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
  retention: ContractRetentionDto;
}

/** การรับคืนเงินประกันผลงานหนึ่งครั้ง */
export interface RetentionReleaseDto {
  id: string;
  paidOn: string;
  amount: string;
  withholdingAmount: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  recordedByName: string | null;
  recordedById: string | null;
  createdAt: string;
}

export interface ContractRetentionDto {
  /** % ของยอดงวดรวม VAT — null = สัญญาไม่มีเงินประกันผลงาน */
  pct: number | null;
  /** ตั้ง % หลังวันลงนาม (OWNER เติมจากสัญญากระดาษ) — สัญญา PDF จะไม่พิมพ์ข้อนี้ */
  setAfterSigning: boolean;
  /** วันครบกำหนดคืน (YYYY-MM-DD) — พนักงานตั้งเอง */
  dueOn: string | null;
  /** ถ้าทุกงวดจ่ายครบ จะถูกกันรวมเท่าไร */
  plannedTotal: number;
  balance: RetentionBalance;
  /** ภาษีหัก ณ ที่จ่ายที่คาดว่าจะถูกหักตอนคืนยอดที่ยังค้าง — ใช้เติมช่องกรอก · null = ไม่หัก/ไม่รู้ฐาน */
  expectedWithholding: number | null;
  releases: RetentionReleaseDto[];
  /** ใบแจ้งหนี้/ใบเสร็จคืนเงินประกัน รวมใบที่ยกเลิก */
  documents: BillingDocSummaryDto[];
}

/** ตั้งเงินประกันผลงานของสัญญา — ส่งเฉพาะช่องที่จะเปลี่ยน */
export interface RetentionSettingsInput {
  pct?: number | null;
  dueOn?: string | null;
}

export interface ContractPaymentSummary {
  /** ยอดรวมของทุกงวดในแผน — เท่ามูลค่าสัญญาเสมอ เพราะระบบบังคับไว้ตอนบันทึกแผน */
  planTotal: number;
  paidAmount: number;
  remaining: number;
  overpaidAmount: number;
  withheldAmount: number;
  retainedAmount: number;
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
    payments: { amount: number; withholdingAmount: number; retentionAmount?: number }[];
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
    retainedAmount: sum((r) => r.progress.retainedAmount),
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

/**
 * หน้ารายการที่แบ่งหน้าที่เซิร์ฟเวอร์ (โครงการ / คำขอลูกค้า) — ค้นหา กรองสถานะ และช่วงเวลาทำที่เซิร์ฟเวอร์
 * `counts` นับต่อสถานะภายใต้คำค้น+ช่วงเวลาเดียวกัน แต่ไม่ขึ้นกับสถานะที่เลือก (ตัวเลขบนปุ่มกรอง)
 */
export interface ListPageMeta {
  /** หน้าปัจจุบัน (เริ่มที่ 1 — ขอเกินหน้าสุดท้ายได้หน้าสุดท้าย) */
  page: number;
  pageSize: number;
  /** จำนวนรายการที่ตรงตัวกรองทั้งหมด */
  total: number;
}

export interface ProjectListPageDto extends ListPageMeta {
  projects: ProjectDto[];
  /** ALL = ไม่รวมโครงการที่ยกเลิก (ซ่อนไว้เป็นค่าเริ่มต้น ดูได้ที่ปุ่ม "ยกเลิก") */
  counts: Record<ProjectStatus | "ALL", number>;
}

export interface LeadListPageDto extends ListPageMeta {
  leads: LeadDto[];
  counts: Record<LeadStatus | "ALL", number>;
}

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
  // ช่วงพื้นที่ที่ลูกค้าเลือกแทนตัวเลข (null = พิมพ์ตัวเลข/คำขอเก่า) — ไม่เติมลงโครงการ
  areaRange: import("./area-range").AreaRange | null;
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

/**
 * คำขอในมุมลูกค้า (หน้า "คำขอของฉัน") — เฉพาะสิ่งที่ลูกค้าส่งมาเอง + ผลที่ลูกค้าควรเห็น
 * ไม่มีช่องภายใน (customerId, deletedAt/deletedById, updatedAt) และไม่มีอะไรจากโครงการนอกจากทางไปเอกสาร
 */
export interface CustomerLeadDto {
  id: string;
  serviceType: string;
  message: string | null;
  // ช่องติดต่อที่กรอกในฟอร์มตอนส่ง (อาจไม่ตรงกับข้อมูลบัญชีปัจจุบัน)
  name: string;
  phone: string;
  email: string | null;
  siteAddress: string | null;
  areaSqm: string | null;
  areaRange: import("./area-range").AreaRange | null;
  /** วันตามปฏิทิน YYYY-MM-DD */
  desiredStartDate: string | null;
  attachments: string[];
  /** null = ไม่ได้เลือกแบบ หรือแบบถูกลบ/เลิกเผยแพร่แล้ว (ลิงก์จะพาไปหน้าว่าง) */
  houseDesign: { id: string; name: string } | null;
  status: LeadStatus;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  /** ใบเสนอราคาล่าสุดที่ส่งถึงลูกค้าแล้วจากคำขอนี้ — ฉบับร่างไม่นับ */
  latestQuote: { id: string; quoteNo: string; revisionNo: number; status: QuoteStatus } | null;
  /** โครงการของคำขอนี้มีสัญญาแล้ว (ดูได้ที่หน้า "สัญญาของฉัน") */
  hasContract: boolean;
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
  /** ส่วนลดปัดเศษ (หักก่อน VAT ให้ยอดสุทธิลงตัว) — "0.00" = ไม่มี */
  roundingAmt: string;
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
  id: string;
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
  /** ใบแจ้งหนี้/ใบเสร็จของงวดนี้ที่ยังใช้ได้ */
  documents: CustomerBillingDocDto[];
  /**
   * การแจ้งโอนล่าสุดที่ยังต้องบอกลูกค้า — รอตรวจ หรือไม่ผ่าน (พร้อมเหตุผล)
   * ยืนยันแล้วไม่ต้องโชว์ เพราะสถานะงวดเปลี่ยนเป็นชำระแล้วอยู่แล้ว · null = ไม่มี
   */
  notice: CustomerPaymentNoticeDto | null;
  /** แจ้งโอนงวดนี้ได้ไหม — ยังมียอดค้าง + วางบิล/ถึงกำหนดแล้ว + ไม่มีการแจ้งที่รอตรวจอยู่ */
  canNotify: boolean;
  /**
   * QR พร้อมเพย์ฝังยอดที่ต้องโอนจริง (สูตรเดียวกับ "ยอดโอนสุทธิ" บนใบแจ้งหนี้ — หักเงินประกัน/ภาษี ณ ที่จ่ายแล้ว)
   * null = บริษัทยังไม่ตั้งพร้อมเพย์ หรืองวดนี้ยังไม่ถึงคิวจ่าย
   */
  payQr: { amount: number; dataUrl: string } | null;
}

export interface CustomerContractPaymentDto {
  planTotal: number;
  paidAmount: number;
  remaining: number;
  paidCount: number;
  totalCount: number;
  installments: CustomerInstallmentDto[];
  /** เงินประกันผลงาน — null = สัญญาไม่มี (หรือ % ถูกเติมหลังลงนามแต่ยังไม่เคยกันจริง) */
  retention: CustomerRetentionDto | null;
}

export interface CustomerRetentionDto {
  pct: number | null;
  held: number;
  released: number;
  outstanding: number;
  dueOn: string | null;
  /** ใบแจ้งหนี้/ใบเสร็จคืนเงินประกันที่ยังใช้ได้ */
  documents: CustomerBillingDocDto[];
}

// ---------- หน้าการชำระเงินของลูกค้า (/my/payments) ----------

/** งวดที่ลูกค้าต้องจ่ายหนึ่งรายการ — ขึ้นเมื่อบริษัทเรียกเก็บแล้ว (วางบิล/ตั้งวันครบกำหนด) และยังค้างอยู่ */
export interface CustomerDueItemDto {
  installmentId: string;
  contractId: string;
  contractNo: string;
  projectName: string;
  seq: number;
  milestone: string;
  /** ยอดงวดเต็ม */
  installmentAmount: number;
  /** ยอดงวดที่ยังค้าง (ก่อนหักภาษี ณ ที่จ่าย/เงินประกัน) */
  remaining: number;
  /** ยอดที่ต้องโอนจริง = "ยอดโอนสุทธิ" บนใบแจ้งหนี้ (หักเงินประกันผลงาน/ภาษี ณ ที่จ่ายแล้ว) */
  amountToPay: number;
  dueOn: string | null;
  daysOverdue: number | null;
  invoice: CustomerBillingDocDto | null;
  /** การแจ้งโอนล่าสุดที่ยังต้องบอก (รอตรวจ/ไม่ผ่าน) */
  notice: CustomerPaymentNoticeDto | null;
  canNotify: boolean;
}

/** งวดถัดไปของแต่ละสัญญาที่ยังไม่ถึงคิวเรียกเก็บ — บอกให้รู้ล่วงหน้า ไม่มีปุ่มจ่าย */
export interface CustomerUpcomingDto {
  contractId: string;
  contractNo: string;
  projectName: string;
  seq: number;
  milestone: string;
  amount: number;
  /** จำนวนงวดที่ยังไม่ถึงคิวทั้งหมดของสัญญานี้ (รวมงวดนี้) */
  remainingCount: number;
}

/** ประวัติการชำระ (เฉพาะที่บริษัทยืนยันรับเงินแล้ว) */
export interface CustomerPaymentHistoryDto {
  id: string;
  installmentId: string;
  contractId: string;
  contractNo: string;
  projectName: string;
  seq: number;
  milestone: string;
  paidOn: string;
  /** ยอดที่นับว่าชำระงวดนี้แล้ว */
  amount: number;
  receipt: CustomerBillingDocDto | null;
  /** ใบแจ้งหนี้ของงวดนี้ (ยังใช้ได้) — เดิมเปิดได้แค่ในหน้าสัญญา ย้ายมาอยู่ที่นี่ 18 ต.ค. */
  invoice: CustomerBillingDocDto | null;
}

/** เงินประกันผลงานของสัญญาหนึ่ง ในหน้าการชำระเงิน (ย้ายมาจากหน้าสัญญา 18 ต.ค.) */
export interface CustomerContractRetentionDto {
  contractId: string;
  contractNo: string;
  projectName: string;
  retention: CustomerRetentionDto;
}

export interface CustomerPaymentsDto {
  /** ยอดที่ต้องโอนรวมทุกรายการที่ค้าง */
  totalToPay: number;
  overdueCount: number;
  due: CustomerDueItemDto[];
  upcoming: CustomerUpcomingDto[];
  history: CustomerPaymentHistoryDto[];
  /** ตารางงวดทั้งหมดของแต่ละสัญญาที่ลงนามแล้ว — ไทม์ไลน์ใต้การ์ดงวดถัดไป */
  schedules: CustomerPaymentScheduleDto[];
  /** เฉพาะสัญญาที่มีเงินประกันผลงาน (มี % หรือเคยถูกหักจริง) */
  retentions: CustomerContractRetentionDto[];
}

export interface CustomerPaymentScheduleDto {
  contractId: string;
  contractNo: string;
  projectName: string;
  installments: CustomerInstallmentOptionDto[];
}

/**
 * งวดทั้งหมดของสัญญาเดียวกัน — รายการ "เลือกงวดที่จะชำระ" ในหน้าจ่ายรายงวด
 * PAID = รับครบแล้ว · NOTIFIED = แจ้งโอนแล้วรอตรวจ · DUE = เรียกเก็บแล้วยังค้าง · UPCOMING = ยังไม่เรียกเก็บ (เลือกไม่ได้)
 */
export interface CustomerInstallmentOptionDto {
  installmentId: string;
  seq: number;
  milestone: string;
  amount: number;
  state: "PAID" | "NOTIFIED" | "DUE" | "UPCOMING";
  dueOn: string | null;
  daysOverdue: number | null;
}

/** หน้าจ่ายทีละงวด (/my/payments/:installmentId) */
export interface CustomerPaymentDetailDto extends CustomerDueItemDto {
  /** ชำระครบแล้ว — หน้าเปลี่ยนเป็นสรุปพร้อมใบเสร็จ */
  paid: boolean;
  /** ยังไม่ถึงคิวเรียกเก็บ (ยังไม่วางบิล) — ไม่มี QR */
  notBilledYet: boolean;
  /** ที่มาของ amountToPay — โชว์ให้ลูกค้าเห็นว่าหักอะไรไปบ้าง (null = ไม่มีส่วนหักนั้น) */
  breakdown: { paidBefore: number; withholding: number | null; retention: number | null };
  payQr: { amount: number; dataUrl: string } | null;
  payTo: PaymentAccountDto | null;
  receipts: CustomerBillingDocDto[];
  payments: { id: string; paidOn: string; amount: number }[];
  /** งวดทั้งหมดของสัญญานี้ เรียงตามลำดับงวด (รวมงวดที่เปิดอยู่) */
  installments: CustomerInstallmentOptionDto[];
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
  /** มูลค่าปัจจุบัน (ตามสัญญา + งานเพิ่ม-ลดที่อนุมัติแล้ว) — null = สัญญาเก่าที่ไม่มียอดตรึงไว้ */
  currentAmount: string | null;
  /** มูลค่าตามสัญญาที่ลงนาม */
  contractAmount: string | null;
  changeOrders: CustomerChangeOrderDto[];
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

// ── ท่อขาย (pipeline) บนแดชบอร์ด ──
// แต่ละขั้นคือ "จำนวนงาน + มูลค่าเงินที่ค้างอยู่ตรงนั้น" เพื่อตอบว่าเงินติดอยู่ขั้นไหน
// กฎตัวเลขห้ามโกหก: โครงการที่ยกเลิก/ลูกค้าปฏิเสธ ไม่นับในทุกขั้น เพราะไม่ใช่งานที่ยังลุ้นอยู่
// ไม่มีขั้น "ลงนามสัญญา" แยก (ถอดออก 2026-10-08): โครงการไม่มีสถานะลงนามของตัวเอง ลงนามแล้วยังเป็น
// APPROVED/COMPLETED — ขั้นแยกเคยนับโครงการเดียวกันซ้ำสองขั้น "ลูกค้ายอมรับ" จึงรวมที่ลงนามแล้วด้วย
export type PipelineStageKey = "lead" | "quoted" | "accepted" | "completed";

/** ใบเสนอราคาที่ส่งไปแล้วลูกค้ายังไม่ตอบเกินกี่วัน ถึงนับว่า "รอนาน" (เท่ากับป้ายแดงในหน้างานที่รอดำเนินการ) */
export const PIPELINE_STALE_DAYS = 14;

export interface PipelineStageDto {
  key: PipelineStageKey;
  label: string;
  count: number;
  /** มูลค่ารวมของขั้นนี้ — ขั้น "คำขอ" ยังไม่มีราคา จึงเป็น null ไม่ใช่ 0 (0 จะดูเหมือนงานไม่มีมูลค่า) */
  value: number | null;
  /** ลิงก์ไปหน้าที่เห็นรายการของขั้นนี้ */
  href: string;
  /** งานในขั้นนี้ที่ค้างนานจนต้องตาม — ตอนนี้มีเฉพาะขั้นเสนอราคา (ส่งไปเกิน PIPELINE_STALE_DAYS วัน
   *  แล้วลูกค้ายังไม่ตอบ) ขั้นอื่นเป็น 0 */
  staleCount: number;
}

export interface DashboardPipelineDto {
  stages: PipelineStageDto[];
  /** งานที่หลุดออกจากท่อในช่วงที่ผ่านมา — แสดงแยก ไม่ปนกับขั้นที่ยังลุ้นอยู่ */
  lost: { rejectedCount: number; cancelledCount: number };
}

// ── กระดานเงินตามสัญญา ──
// ยอดเงินมี 3 ชั้นที่ต่างกันจริง ๆ: มูลค่าสัญญา / ยอดที่ถือว่าชำระแล้ว / เงินที่เข้าบัญชีจริง
// (ต่างกันเพราะภาษีหัก ณ ที่จ่าย 3% ดู installment-payment-tracking)
export interface ContractCashRowDto {
  contract: { id: string; contractNo: string; signedAt: string | null };
  project: { id: string; projectNo: string; name: string };
  customerName: string | null;
  amount: number;
  installmentCount: number;
  /** งวดที่ยังไม่ได้ตั้งวันครบกำหนด — ตั้งไม่ครบ = เตือนค้างชำระไม่ได้เลย */
  installmentsWithoutDueDate: number;
  paidAmount: number;
  receivedAmount: number;
  remaining: number;
  overdueCount: number;
  /** ยอดของงวดที่เลยกำหนดและยังได้ไม่ครบ */
  overdueAmount: number;
  /** เงินประกันผลงานที่ลูกค้ากันไว้และยังไม่คืน — ยังเป็นเงินที่เราต้องได้ ไม่อยู่ใน remaining */
  retentionOutstanding: number;
}

export interface DashboardCashDto {
  rows: ContractCashRowDto[];
  /** สัญญาที่ลงนามแล้วแต่ไม่มีทั้งยอดและงวด (ของเก่าก่อนระบบงวดเงิน) — ไม่เอามาปนในตาราง
   *  เพราะจะเป็นแถวศูนย์ล้วน แต่ต้องนับให้เห็นว่ามีอยู่ */
  legacyContractCount: number;
  totals: {
    contractAmount: number;
    paidAmount: number;
    receivedAmount: number;
    remaining: number;
    overdueAmount: number;
    installmentsWithoutDueDate: number;
    retentionOutstanding: number;
  };
  /** สัญญาที่ออกแล้วแต่ยังไม่ลงนาม — ยังรับเงินไม่ได้จนกว่าจะลงนาม */
  unsignedContracts: { id: string; contractNo: string; projectId: string; projectName: string; amount: number | null }[];
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

/** ใบเสนอราคาที่รอ OWNER อนุมัติก่อนส่ง (ยังเป็น DRAFT) */
export interface PendingApprovalDto {
  project: { id: string; projectNo: string; name: string };
  quote: { id: string; quoteNo: string };
  proposerName: string;
  requestedAt: string;
}

/**
 * สัญญาที่ออกแล้วแต่ยังไม่ลงนาม ของโครงการที่ยังไม่มีฉบับไหนลงนามเลย — ยุบเป็นโครงการละแถว (โครงการเดียวออกสัญญาค้างไว้ได้หลายฉบับ
 * ยอดเท่ากัน ต่างกันแค่ฉบับไหนถูกเซ็น ถ้าแตกแถวละฉบับ งานเดียวจะกินทั้งหมวด) · ยังรับเงินไม่ได้จนกว่าจะลงนาม
 */
export interface UnsignedContractGroupDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  /** เรียงเก่าสุดก่อน · amount null = สัญญารุ่นเก่าที่ไม่ได้เก็บยอด (ห้ามเดา) */
  contracts: { id: string; contractNo: string; amount: string | null; createdAt: string }[];
}

/**
 * สัญญาที่ลงนามแล้วแต่มีงวดที่ยังไม่ได้ตั้งวันครบกำหนด (และยังเก็บเงินไม่ครบ) — ระบบเตือน
 * "งวดถึงกำหนด" ให้ไม่ได้เลยจนกว่าจะตั้งวัน · ยุบเป็นสัญญาละแถว ไม่ใช่งวดละแถว
 */
export interface MissingDueDateDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  contract: { id: string; contractNo: string };
  /** จำนวนงวดที่ยังไม่มีวันครบกำหนด / งวดทั้งหมดของสัญญา */
  missingCount: number;
  installmentCount: number;
  /** ยอดที่ยังไม่ได้รับของงวดที่ไม่มีวัน */
  remaining: number;
}

/**
 * คำขอที่พนักงานติดต่อแล้ว (CONTACTED) แต่ยังไม่ได้ส่งใบเสนอราคา — เดิมพอกด "ติดต่อแล้ว" คำขอหลุดจาก
 * หน้างานค้างทันที ถ้าเงียบไปก็หายเลย · ส่งใบเสนอราคาแล้วสถานะเป็น QUOTED เองจึงหลุดจากหมวดนี้
 * lastActivityAt = ความเคลื่อนไหวล่าสุดของคำขอหรือโครงการที่สร้างจากคำขอ (ไม่มีคอลัมน์ "วันที่ติดต่อ")
 */
export interface ContactedLeadDto {
  lead: { id: string; name: string; phone: string; serviceType: string; createdAt: string };
  project: { id: string; projectNo: string; name: string } | null;
  lastActivityAt: string;
}

/** ใบงานเพิ่ม-ลดที่ส่งให้ลูกค้าแล้ว รออนุมัติ (พอร์ทัลหรือเซ็นกระดาษ) */
export interface AwaitingChangeOrderDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  contract: { id: string; contractNo: string };
  changeOrder: { id: string; docNo: string; title: string; totalAmount: string; sentAt: string | null };
}

/** ลูกค้าแจ้งโอนมาแล้ว รอพนักงานตรวจกับบัญชี — เงินอาจเข้าแล้วแต่ระบบยังไม่รู้ */
export interface PendingPaymentNoticeDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  contract: { id: string; contractNo: string };
  installment: { seq: number; milestone: string };
  notice: { id: string; paidOn: string; amount: string; createdAt: string; slipStatus: SlipCheckStatus | null };
}

/** โครงการที่เซ็นแล้ว และราคาในคลังขึ้นหลังเซ็น — ยังไม่ได้กด "ซื้อแล้ว/ล็อกราคาแล้ว" */
export interface PriceDriftSignedDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  contract: { contractNo: string };
  lineCount: number;
  /** ต้นทุนอาจเพิ่ม (รวมเฉพาะบรรทัดที่แพงขึ้น) */
  increase: number;
}

/** โครงการที่จ่ายออกมากกว่าเงินที่ลูกค้าจ่ายเข้า (รวม VAT) */
export interface CashShortfallDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  /** ติดลบเสมอ */
  net: number;
  nextInstallment: { seq: number; milestone: string; dueOn: string | null; outstanding: number } | null;
}

/** รายการรับเงินที่บันทึกแล้วแต่ยังไม่มีใครยืนยันกับบัญชีธนาคาร */
export interface UnverifiedPaymentDto {
  project: { id: string; projectNo: string; name: string; customer: CustomerDto | null };
  contract: { id: string; contractNo: string };
  installment: { seq: number };
  payment: { id: string; paidOn: string; amount: string; recordedByName: string | null; createdAt: string };
}

export interface PendingWorkDto {
  pendingPaymentNotices: PendingPaymentNoticeDto[];
  pendingApprovals: PendingApprovalDto[];
  unsignedContracts: UnsignedContractGroupDto[];
  missingDueDates: MissingDueDateDto[];
  awaitingChangeOrders: AwaitingChangeOrderDto[];
  contactedLeads: ContactedLeadDto[];
  pendingRevisions: PendingRevisionDto[];
  rejectedQuotes: RejectedQuoteDto[];
  awaitingResponse: AwaitingQuoteDto[];
  awaitingPayment: AwaitingPaymentDto[];
  newLeads: LeadDto[];
  priceDriftSigned: PriceDriftSignedDto[];
  cashShortfall: CashShortfallDto[];
  unverifiedPayments: UnverifiedPaymentDto[];
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
  /** ประเภทของไอพี (สาธารณะ / เครือข่ายภายใน / ...) — null เมื่อไม่มีไอพีหรือผู้เรียกไม่ใช่ OWNER */
  ipKind: IpKind | null;
  /** ประเทศ/ผู้ให้บริการของไอพี — เฉพาะ OWNER และเฉพาะไอพีสาธารณะที่ค้นเจอ */
  ipGeo: IpGeo | null;
  /**
   * อุปกรณ์แบบหยาบ เช่น "Chrome · Windows" หรือ "เครื่องมืออัตโนมัติ (curl)" — null = ไม่ได้บันทึก
   * ไม่ระบุตัวคนเหมือนไอพี จึงให้พนักงานทุกคนเห็น (ช่วยตอบว่าลูกค้าเปิดใบเสนอราคาจากมือถือหรือคอม)
   */
  device: string | null;
  /** แถวนี้คือการเข้าจากเครื่องที่บัญชีนี้ไม่เคยใช้ (อ่านจากคุกกี้เครื่อง ไม่ใช่จากไอพี) */
  newDevice: boolean;
  /** ใครเป็นคนทำ — ลูกค้าเอง หรือพนักงานที่ทำกับบัญชีลูกค้ารายนี้ */
  actor: { kind: "customer" | "staff"; name: string | null };
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

/**
 * บัญชีลูกค้าที่สมัครเองแต่ไม่ยืนยันอีเมลภายในกี่วัน ระบบลบให้อัตโนมัติ (งานล้างรายวัน)
 * — ยกเว้นบัญชีที่พนักงานผูกโครงการ/คำขอ/บันทึก/ลิงก์เข้าใช้ไว้แล้ว
 */
export const UNVERIFIED_SIGNUP_TTL_DAYS = 7;

/** มุมมองของรายชื่อลูกค้า — ค่าเริ่มต้นแสดงเฉพาะบัญชีที่ยืนยันอีเมลแล้ว (หรือทีมงานสร้างให้) */
export type CustomerDirectoryView = "verified" | "unverified";

export interface CustomerDirectoryPageDto {
  customers: CustomerListItemDto[];
  /** บัญชีที่สมัครแล้วยังไม่ยืนยันอีเมล (ไม่ขึ้นกับคำค้น) — โชว์เป็นตัวเลขบนตัวกรอง */
  unverifiedCount: number;
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
  /** false = สมัครเองแต่ยังไม่ยืนยันอีเมล — อาจพิมพ์อีเมลผิดหรือเป็นอีเมลปลอม เข้าระบบไม่ได้ */
  emailVerified: boolean;
  /** วันที่ระบบจะลบบัญชีที่ยังไม่ยืนยันนี้ทิ้ง — null = ยืนยันแล้ว หรือมีของที่พนักงานผูกไว้ (ไม่ลบ) */
  purgeAt: string | null;
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

// ---------- การส่งอีเมล (เฉพาะ OWNER) — ดู server/src/lib/mailer.ts ----------
/** console = พิมพ์ลง log · silent = ทิ้งเงียบ (เทสต์) · smtp = ส่งจริง */
export type MailTransportMode = "console" | "silent" | "smtp";

export interface MailCheckDto {
  ok: boolean;
  at: string;
  /** สาเหตุที่ต่อไม่ได้ แปลเป็นภาษาคนแล้ว พร้อมวิธีแก้ — null เมื่อต่อได้ */
  problem: string | null;
}

export interface MailStatusDto {
  mode: MailTransportMode;
  /** ชื่อ + อีเมลผู้ส่งที่ลูกค้าเห็น (MAIL_FROM) */
  from: string;
  /** ค่าการเชื่อมต่อ (ไม่มีรหัสผ่าน) — null เมื่อไม่ได้อยู่โหมด smtp */
  smtp: { host: string | null; port: number; secure: boolean; user: string | null } | null;
  /** ลิงก์ในเมลชี้ไปที่เว็บนี้ — ตอน deploy ถ้ายังเป็น localhost ลูกค้าจะกดลิงก์ไม่ได้ */
  linkBaseUrl: string;
  /** ผลตรวจการเชื่อมต่อล่าสุด (ตอนเปิดเซิร์ฟเวอร์ หรือกดตรวจเอง) — null เมื่อยังไม่เคยตรวจ/ไม่ใช่ smtp */
  lastCheck: MailCheckDto | null;
}

export interface MailTestResultDto {
  mode: MailTransportMode;
  to: string;
  /** โหมด console/silent ถือว่าสำเร็จแต่ไม่ได้ออกไปจริง — หน้าเว็บต้องบอกให้ชัด */
  deliveredForReal: boolean;
}

export {
  PAYMENT_BACKDATE_WARN_DAYS,
  paymentWarnings,
  type PaymentCheckInput,
  type PaymentCheckInstallment,
} from "./payment-warnings";
