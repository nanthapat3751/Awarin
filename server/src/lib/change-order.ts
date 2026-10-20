import type { ChangeOrderLineDto, ChangeOrderTotalsDto, ChangeOrderLineKind } from "@systemboq/shared-types";

import { round2 } from "./pricing";

/**
 * ตัวเลขของใบงานเพิ่ม-ลด — ตรรกะล้วน ไม่แตะ DB
 *
 * แถวรายการเป็น "ราคาขาย": ราคาทุนต่อหน่วย × ตัวคูณฝั่งลูกค้าของเวอร์ชันนั้น (customerLineMultiplier)
 * ปัดราคาต่อหน่วยก่อนแล้วค่อยคูณจำนวน แบบเดียวกับใบเสนอราคาที่ลูกค้าถือ — ลูกค้าเทียบกับใบเดิมได้ตรงบรรทัด
 *
 * ยอดสุทธิไม่ได้มาจากผลรวมแถว แต่มาจากราคาสุทธิของสองเวอร์ชัน (ยอดที่สัญญาผูกจริง) ส่วนต่างที่เกิดจาก
 * ส่วนลดเป็น % / ปัดยอด / ปัดรายบรรทัด แสดงเป็นแถว "ปรับส่วนลด/ปัดเศษ" แทนการซ่อน
 */

export interface ChangeOrderSourceLine {
  kind: ChangeOrderLineKind | "unchanged";
  categoryCode: string | null;
  before: { name: string; unit: string; quantity: number; costUnitPrice: number } | null;
  after: { name: string; unit: string; quantity: number; costUnitPrice: number } | null;
}

interface Side {
  qty: number;
  unitPrice: number;
  total: number;
}

function side(v: ChangeOrderSourceLine["before"], multiplier: number): Side | null {
  if (!v) return null;
  const unitPrice = round2(v.costUnitPrice * multiplier);
  return { qty: v.quantity, unitPrice, total: round2(v.quantity * unitPrice) };
}

const fmt = (n: number) => n.toFixed(2);

/**
 * แถวของใบ: บรรทัดที่เพิ่ม/ลบ/แก้ทั้งหมด + บรรทัดที่ไม่ได้แก้แต่ราคาขายขยับ (อัตรากำไรเปลี่ยน)
 * บรรทัดที่เหมือนเดิมทุกอย่างไม่อยู่ในใบ
 */
export function buildChangeOrderLines(
  source: ChangeOrderSourceLine[],
  fromMultiplier: number,
  toMultiplier: number,
): ChangeOrderLineDto[] {
  const lines: ChangeOrderLineDto[] = [];
  for (const s of source) {
    const b = side(s.before, fromMultiplier);
    const a = side(s.after, toMultiplier);
    const delta = round2((a?.total ?? 0) - (b?.total ?? 0));
    if (s.kind === "unchanged" && delta === 0) continue;
    const ref = (s.after ?? s.before)!;
    lines.push({
      kind: s.kind === "unchanged" ? "changed" : s.kind,
      categoryCode: s.categoryCode,
      name: ref.name,
      unit: ref.unit,
      beforeQty: s.before ? String(s.before.quantity) : null,
      afterQty: s.after ? String(s.after.quantity) : null,
      beforeUnitPrice: b ? fmt(b.unitPrice) : null,
      afterUnitPrice: a ? fmt(a.unitPrice) : null,
      beforeTotal: fmt(b?.total ?? 0),
      afterTotal: fmt(a?.total ?? 0),
      delta: fmt(delta),
    });
  }
  return lines;
}

export interface VersionMoney {
  netPrice: number;
  vatAmt: number;
}

/** ยอดรวมของใบ — สุทธิมาจากสองเวอร์ชันเสมอ แถวรายการแยกเป็นงานเพิ่ม/งานลด + ส่วนต่างที่อธิบายได้ */
export function changeOrderTotals(
  lines: ChangeOrderLineDto[],
  from: VersionMoney,
  to: VersionMoney,
): ChangeOrderTotalsDto {
  let add = 0;
  let deduct = 0;
  for (const l of lines) {
    const d = Number(l.delta);
    if (d > 0) add += d;
    else deduct -= d;
  }
  add = round2(add);
  deduct = round2(deduct);
  const netBeforeVat = round2(to.netPrice - to.vatAmt - (from.netPrice - from.vatAmt));
  const vat = round2(to.vatAmt - from.vatAmt);
  return {
    addAmount: fmt(add),
    deductAmount: fmt(deduct),
    adjustAmount: fmt(round2(netBeforeVat - (add - deduct))),
    netBeforeVat: fmt(netBeforeVat),
    vatAmount: fmt(vat),
    totalAmount: fmt(round2(to.netPrice - from.netPrice)),
  };
}

export interface InstallmentState {
  id: string;
  seq: number;
  milestone: string;
  amount: number;
  /** ยอดที่ถือว่าชำระแล้ว */
  paid: number;
  /** มีใบแจ้งหนี้ที่ยังใช้อยู่ — ยอดบนใบออกไปถึงลูกค้าแล้ว ห้ามแก้ยอดงวดนี้เงียบ ๆ */
  invoiced: boolean;
}

export type InstallmentPlan =
  | { kind: "none" }
  | { kind: "create"; seq: number; milestone: string; amount: number }
  | { kind: "reduce"; changes: { id: string; seq: number; milestone: string; from: number; to: number }[] }
  | { kind: "blocked"; reason: string };

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * เงินของใบที่อนุมัติไปอยู่งวดไหน (ผู้ใช้เลือก: งานเพิ่ม = งวดใหม่ · งานลด = หักงวดท้าย)
 *
 * งานลดหักจากงวดท้ายสุดย้อนขึ้นมา เฉพาะส่วนที่ยังไม่ได้รับเงิน และข้ามงวดที่วางบิลไปแล้ว
 * (ยอดบนใบแจ้งหนี้ถึงมือลูกค้าแล้ว) — หักไม่พอ = ไม่อนุมัติให้ บอกเหตุผลแทนการทำให้ยอดติดลบ
 */
export function planInstallments(
  total: number,
  seqLabel: string,
  installments: InstallmentState[],
): InstallmentPlan {
  if (total === 0) return { kind: "none" };
  if (total > 0) {
    const seq = Math.max(0, ...installments.map((i) => i.seq)) + 1;
    return { kind: "create", seq, milestone: seqLabel, amount: total };
  }
  let left = round2(-total);
  const changes: { id: string; seq: number; milestone: string; from: number; to: number }[] = [];
  for (const i of [...installments].sort((a, b) => b.seq - a.seq)) {
    if (left <= 0) break;
    if (i.invoiced) continue;
    const room = round2(i.amount - i.paid);
    if (room <= 0) continue;
    const cut = Math.min(room, left);
    changes.push({ id: i.id, seq: i.seq, milestone: i.milestone, from: i.amount, to: round2(i.amount - cut) });
    left = round2(left - cut);
  }
  if (left > 0) {
    const room = round2(-total - left);
    return {
      kind: "blocked",
      reason:
        `งานลด ${money(-total)} บาท มากกว่ายอดที่ยังเก็บได้ ${money(room)} บาท ` +
        "(ไม่นับงวดที่รับเงินแล้วหรือวางบิลแล้ว) — ยกเลิกใบแจ้งหนี้ที่ยังไม่ได้รับเงินก่อน หรือคุยเรื่องคืนเงินกับลูกค้า",
    };
  }
  return { kind: "reduce", changes };
}
