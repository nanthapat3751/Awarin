import type { PaymentAccountDto } from "@systemboq/shared-types";

import { prisma } from "../prisma";
import { isCheckableImage, slipProvider, type SlipData, type SlipFileInput } from "./provider";

/**
 * ตรวจสลิปของการแจ้งโอนหนึ่งครั้ง — ตัดสินในระบบเราเองทั้งหมด (ผู้ให้บริการแค่อ่านสลิปกับธนาคาร)
 *
 * ปฏิเสธลูกค้าทันทีเฉพาะสามกรณีที่ "เงินไม่ได้เข้าบริษัทแน่ ๆ" (ผู้ใช้เลือก 18 ต.ค.):
 *   ธนาคารไม่พบรายการ · สลิปนี้ใช้แจ้งไปแล้ว · โอนเข้าบัญชีที่ไม่ใช่ของบริษัท
 * ยอด/วันที่ไม่ตรง **ไม่ปฏิเสธ** — สลิปจริงแปลว่าเงินเข้าแล้ว ปฏิเสธไปก็เท่ากับทิ้งร่องรอยเงินที่รับจริง
 * (รับเงินบางส่วนได้ + นิติบุคคลหัก ณ ที่จ่าย) จึงขึ้นป้ายเหลืองให้พนักงานตัดสินแทน
 * ตรวจไม่ได้ (ไม่มี QR / PDF / ผู้ให้บริการขัดข้อง) = กลับไปทางเดิม ห้ามขวางลูกค้าเพราะระบบเราตรวจไม่ได้
 */
export type SlipCheckStatus = "PASSED" | "MISMATCH" | "UNCHECKED" | "FAKE" | "DUPLICATE" | "WRONG_ACCOUNT";

export const REJECTING_SLIP_STATUSES: ReadonlySet<SlipCheckStatus> = new Set(["FAKE", "DUPLICATE", "WRONG_ACCOUNT"]);

/** ข้อความที่ลูกค้าเห็นตอนระบบปฏิเสธ — บอกว่าต้องทำอะไรต่อ */
export const SLIP_REJECT_MESSAGE: Partial<Record<SlipCheckStatus, string>> = {
  FAKE: "ตรวจสลิปนี้กับธนาคารแล้วไม่พบรายการโอน — กรุณาแนบสลิปจากแอปธนาคารอีกครั้ง หรือติดต่อบริษัท",
  DUPLICATE: "สลิปนี้เคยใช้แจ้งโอนไปแล้ว — ถ้าโอนรายการใหม่ กรุณาแนบสลิปของรายการนั้น",
  WRONG_ACCOUNT: "บัญชีปลายทางในสลิปไม่ใช่บัญชีของบริษัท — ตรวจบัญชีที่โอนอีกครั้ง หรือติดต่อบริษัท",
};

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * เลขที่ถูกปิดบางหลัก (xxx-x-x5163-x) ตรงกับเลขจริงไหม — เทียบชิดขวาทีละหลักที่มองเห็น
 * true = หลักที่เห็นตรงทั้งหมด · false = มีหลักที่ขัดกัน · null = เทียบไม่ได้ (เห็นน้อยกว่า 3 หลัก / ไม่มีข้อมูล)
 */
export function maskedDigitsMatch(masked: string | null, real: string | null): boolean | null {
  if (!masked || !real) return null;
  const m = masked.replace(/[^0-9xX*]/g, "");
  const r = real.replace(/\D/g, "");
  if (!r || (m.match(/\d/g)?.length ?? 0) < 3) return null;
  for (let k = 1; k <= m.length; k += 1) {
    const mc = m[m.length - k];
    if (!/\d/.test(mc)) continue;
    const rc = r[r.length - k];
    if (rc !== mc) return false;
  }
  return true;
}

/** บัญชีปลายทางเป็นของบริษัทไหม — เทียบเลขบัญชี และพร้อมเพย์ (โอนเข้าพร้อมเพย์ เลขบัญชีจะไม่มา) */
export function receiverVerdict(slip: SlipData, account: PaymentAccountDto | null): "ours" | "other" | "unknown" {
  if (!account) return "unknown";
  const byAccount = maskedDigitsMatch(slip.receiverAccount, account.accountNo);
  const byProxy = maskedDigitsMatch(slip.receiverProxy, account.promptPay);
  if (byAccount === true || byProxy === true) return "ours";
  if (byAccount === false || byProxy === false) return "other";
  return "unknown";
}

export interface FileCheck {
  /** ชื่อไฟล์ที่เก็บบนดิสก์ (multer filename) — ใช้ผูกกับ PaymentEvidence */
  storedName: string;
  status: SlipCheckStatus;
  slip: SlipData | null;
  message: string | null;
}

export interface SlipCheckResult {
  provider: string;
  status: SlipCheckStatus;
  flags: string[];
  files: FileCheck[];
  /** ข้อความถึงลูกค้าเมื่อระบบปฏิเสธ — null = ไม่ปฏิเสธ */
  customerMessage: string | null;
  /** ยอดรวมของสลิปที่ตรวจได้ */
  verifiedTotal: number;
}

/**
 * null = ปิดระบบตรวจสลิปอยู่ (ไม่ได้ตั้งผู้ให้บริการ) — การแจ้งโอนทำงานแบบเดิมทุกอย่าง
 */
export async function checkNoticeSlips(
  files: (SlipFileInput & { filename: string })[],
  ctx: {
    customerAmount: number;
    customerPaidOn: string;
    /** ยอดที่ต้องโอนจริงของงวด (หัก ณ ที่จ่าย/เงินประกันแล้ว) — สูตรเดียวกับใบแจ้งหนี้ */
    expectedNet: number;
    account: PaymentAccountDto | null;
  },
): Promise<SlipCheckResult | null> {
  const provider = slipProvider();
  if (!provider) return null;

  const seen = new Set<string>();
  const checks: FileCheck[] = [];
  for (const file of files) {
    const base = { storedName: file.filename, slip: null, message: null };
    if (!isCheckableImage(file.mimetype)) {
      checks.push({ ...base, status: "UNCHECKED", message: "ไฟล์ PDF ตรวจอัตโนมัติไม่ได้" });
      continue;
    }
    let read;
    try {
      read = await provider.read(file);
    } catch (err) {
      read = { kind: "unreadable" as const, message: `ตรวจสลิปไม่สำเร็จ (${err instanceof Error ? err.message : "error"})` };
    }
    if (read.kind === "unreadable") {
      checks.push({ ...base, status: "UNCHECKED", message: read.message });
      continue;
    }
    if (read.kind === "fake") {
      checks.push({ ...base, status: "FAKE", message: read.message });
      continue;
    }
    const slip = read.slip;
    if (receiverVerdict(slip, ctx.account) === "other") {
      checks.push({ ...base, slip, status: "WRONG_ACCOUNT", message: null });
      continue;
    }
    // ซ้ำกับสลิปที่ถูกใช้อยู่ในระบบ หรือแนบสลิปเดียวกันมาสองไฟล์ในการแจ้งเดียว
    const used = seen.has(slip.transRef) || (await prisma.slipVerification.findUnique({ where: { activeRef: slip.transRef }, select: { id: true } }));
    seen.add(slip.transRef);
    checks.push({ ...base, slip, status: used ? "DUPLICATE" : "PASSED", message: null });
  }

  const verified = checks.filter((c) => c.status === "PASSED" && c.slip);
  const verifiedTotal = Math.round(verified.reduce((sum, c) => sum + c.slip!.amount, 0) * 100) / 100;
  const result = (status: SlipCheckStatus, flags: string[] = []): SlipCheckResult => ({
    provider: provider.name,
    status,
    flags,
    files: checks,
    customerMessage: SLIP_REJECT_MESSAGE[status] ?? null,
    verifiedTotal,
  });

  // ปฏิเสธ: สลิปปลอม > ซ้ำ > ผิดบัญชี (ลำดับข้อความที่ลูกค้าเห็น)
  for (const hard of ["FAKE", "DUPLICATE", "WRONG_ACCOUNT"] as const) {
    if (checks.some((c) => c.status === hard)) return result(hard);
  }
  if (verified.length === 0) {
    return result("UNCHECKED", [...new Set(checks.map((c) => c.message).filter((m): m is string => Boolean(m)))]);
  }

  const flags: string[] = [];
  if (verified.length < checks.length) flags.push(`ตรวจอัตโนมัติได้ ${verified.length} จาก ${checks.length} ไฟล์`);
  if (!ctx.account) {
    flags.push("ยังไม่ได้ตั้งบัญชีรับเงินในหน้าตั้งค่า — เทียบบัญชีปลายทางไม่ได้");
  } else if (verified.some((c) => receiverVerdict(c.slip!, ctx.account) === "unknown")) {
    flags.push("เทียบบัญชีปลายทางไม่ได้ (ธนาคารไม่ส่งเลขบัญชีมา)");
  }
  if (Math.abs(verifiedTotal - ctx.customerAmount) > 0.009) {
    flags.push(`ยอดในสลิป ${money(verifiedTotal)} ไม่ตรงกับที่ลูกค้าแจ้ง ${money(ctx.customerAmount)}`);
  }
  if (Math.abs(verifiedTotal - ctx.expectedNet) > 0.009) {
    flags.push(`ยอดในสลิป ${money(verifiedTotal)} ไม่ตรงกับยอดที่ต้องโอน ${money(ctx.expectedNet)}`);
  }
  for (const c of verified) {
    const d = c.slip!.transDate;
    if (!d) {
      flags.push("สลิปไม่มีวันที่โอน");
    } else if (d !== ctx.customerPaidOn) {
      flags.push(`วันที่โอนในสลิป (${thaiDate(d)}) ไม่ตรงกับที่ลูกค้าแจ้ง (${thaiDate(ctx.customerPaidOn)})`);
    }
  }
  const unique = [...new Set(flags)];
  return result(unique.length > 0 ? "MISMATCH" : "PASSED", unique);
}
