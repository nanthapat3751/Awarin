import { round2 } from "./pricing";

/**
 * "ผู้ว่าจ้าง" บนเอกสาร — คู่สัญญาจริง ซึ่งไม่จำเป็นต้องเป็นคนที่มาสมัครเว็บ
 *
 * ก่อนหน้านี้ระบบรู้จักลูกค้าแค่ในฐานะ "คน" เอกสารจึงพิมพ์ได้แค่ `ลูกค้า: <ชื่อคน>` ยื่นให้ฝ่ายบัญชี
 * ของบริษัทลูกค้าตั้งเบิกไม่ได้ (ต้องมีชื่อนิติบุคคล + เลขประจำตัวผู้เสียภาษี + สาขา) และคำนวณ
 * ภาษีหัก ณ ที่จ่ายไม่ได้ เพราะไม่รู้ว่าผู้จ่ายเงินเป็นนิติบุคคลหรือไม่
 *
 * ที่เดียวที่ตัดสินว่า "ชื่อบนเอกสารคืออะไร" — ใบเสนอราคา (ทั้งฝั่งพนักงานและฝั่งลูกค้า) กับสัญญา
 * ต้องเรียกตัวนี้ทั้งหมด ไม่งั้นเอกสารสามใบของดีลเดียวกันจะเรียกผู้ว่าจ้างคนละชื่อ
 */
export interface BillingParty {
  isCompany: boolean;
  /** ชื่อที่พิมพ์ในช่อง "ผู้ว่าจ้าง" — ชื่อนิติบุคคลถ้าเป็นบริษัท ไม่งั้นชื่อเจ้าของบัญชี */
  name: string | null;
  taxId: string | null;
  branch: string | null;
  address: string | null;
  /**
   * ผู้ประสานงานฝั่งลูกค้า — มีความหมายเฉพาะกับนิติบุคคล
   * (ของบุคคลธรรมดา ผู้ว่าจ้างกับคนที่เราคุยด้วยคือคนเดียวกัน การพิมพ์ซ้ำเป็นข้อมูลเปล่า)
   */
  contactPerson: string | null;
}

type ProfileLike = {
  customerType?: string | null;
  companyName?: string | null;
  taxId?: string | null;
  branch?: string | null;
  address?: string | null;
  contactPerson?: string | null;
} | null | undefined;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

/**
 * แปลงบัญชีลูกค้า + โปรไฟล์ เป็นผู้ว่าจ้างที่พิมพ์ลงเอกสารได้
 *
 * ตั้งใจให้ "ทนของไม่ครบ": ติ๊กว่าเป็นนิติบุคคลแต่ยังไม่กรอกชื่อบริษัท จะกลับไปใช้ชื่อเจ้าของบัญชี
 * แทนที่จะพิมพ์ช่องว่างลงบนสัญญา — เอกสารที่ไม่มีชื่อผู้ว่าจ้างเลยแย่กว่าเอกสารที่มีชื่อคน
 */
export function billingPartyOf(
  user: { fullName: string } | null | undefined,
  profile: ProfileLike,
): BillingParty {
  const isCompany = profile?.customerType === "COMPANY";
  const companyName = clean(profile?.companyName);
  const personName = clean(user?.fullName);

  return {
    isCompany,
    name: (isCompany ? companyName : null) ?? personName,
    taxId: isCompany ? clean(profile?.taxId) : null,
    branch: isCompany ? clean(profile?.branch) : null,
    address: clean(profile?.address),
    // ชื่อเจ้าของบัญชีคือผู้ประสานงานโดยปริยาย เว้นแต่ระบุคนอื่นไว้
    contactPerson: isCompany ? (clean(profile?.contactPerson) ?? personName) : null,
  };
}

/**
 * อัตราภาษีหัก ณ ที่จ่ายของงานรับจ้างทำของ/รับเหมาก่อสร้าง
 *
 * ตรึงไว้ที่ 3% ตามประมวลรัษฎากร ไม่ทำเป็นค่าตั้งค่าให้แก้ได้ เพราะไม่ใช่นโยบายของบริษัท
 * แต่เป็นอัตราตามกฎหมาย — ถ้าวันหนึ่งกฎหมายเปลี่ยน ต้องเป็นการแก้โค้ดที่มีคนตรวจ ไม่ใช่ช่องกรอก
 */
export const WITHHOLDING_TAX_PCT = 3;

export interface Withholding {
  pct: number;
  /** ฐานภาษี = มูลค่างานก่อนภาษีมูลค่าเพิ่ม */
  base: number;
  /** ยอดที่ผู้ว่าจ้างหักไว้นำส่งสรรพากร */
  tax: number;
  /** ยอดที่ผู้ว่าจ้างโอนเข้าบัญชีเราจริง */
  netTransfer: number;
}

/**
 * ภาษีหัก ณ ที่จ่ายของยอดหนึ่งก้อน — คืน null เมื่อ "ไม่ต้องหัก" หรือ "ยังคำนวณไม่ได้"
 *
 * หักเฉพาะเมื่อผู้จ่ายเงินเป็นนิติบุคคล: บุคคลธรรมดาที่จ้างสร้างบ้านให้ตัวเองไม่ใช่ผู้มีหน้าที่หัก
 * ภาษี ณ ที่จ่าย การพิมพ์บรรทัดนี้ลงในใบเสนอราคาของเขาจึงผิดและทำให้เข้าใจผิดว่าต้องหัก
 *
 * `vatAmt` เป็น null แปลว่าไม่รู้ว่ายอดนั้นมี VAT อยู่เท่าไร (สัญญาเก่าที่ออกก่อนมีการตรึงค่าไว้)
 * → คืน null ไปเลย ดีกว่าเดาว่า VAT 7% แล้วพิมพ์ตัวเลขที่อาจผิดลงบนเอกสาร
 */
export function withholdingFor(
  party: Pick<BillingParty, "isCompany">,
  total: number,
  vatAmt: number | null,
): Withholding | null {
  if (!party.isCompany) return null;
  if (vatAmt === null || !Number.isFinite(total) || !Number.isFinite(vatAmt)) return null;

  const base = round2(total - vatAmt);
  if (base <= 0) return null;

  const tax = round2((base * WITHHOLDING_TAX_PCT) / 100);
  return { pct: WITHHOLDING_TAX_PCT, base, tax, netTransfer: round2(total - tax) };
}

/**
 * แบ่งภาษีหัก ณ ที่จ่ายลงแต่ละงวด
 *
 * แต่ละงวดหักตามสัดส่วนของงวดนั้นในมูลค่าสัญญา แล้ว **ยัดเศษที่เหลือทั้งหมดไว้ที่งวดสุดท้าย**
 * ไม่งั้นผลบวกของทุกงวดจะไม่เท่ากับยอดหักทั้งสัญญา (ต่างกันไม่กี่สตางค์ แต่เป็นตัวเลขบนเอกสาร
 * ที่บวกแล้วไม่ลงตัว ซึ่งฝ่ายบัญชีของลูกค้าจะทักกลับมาแน่)
 */
export function splitWithholding(
  withholding: Withholding,
  contractAmount: number,
  installments: { amount: number }[],
): { tax: number; netTransfer: number }[] {
  if (installments.length === 0 || contractAmount <= 0) return [];

  const out: { tax: number; netTransfer: number }[] = [];
  let allocated = 0;

  installments.forEach((item, index) => {
    const last = index === installments.length - 1;
    const tax = last
      ? round2(withholding.tax - allocated)
      : round2((withholding.tax * item.amount) / contractAmount);
    allocated = round2(allocated + tax);
    out.push({ tax, netTransfer: round2(item.amount - tax) });
  });

  return out;
}
