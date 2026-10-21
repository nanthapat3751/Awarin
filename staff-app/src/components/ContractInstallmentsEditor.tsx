import type { ContractDto, ContractInstallmentDto } from "@systemboq/shared-types";
import { AlertTriangle, Check, Lock, Plus, Trash2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import { listInstallments, setRetention as saveRetentionPct, updateInstallments } from "../lib/contracts-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { rowKey, sameRowKey } from "../lib/row-keys";
import { PanelSkeleton } from "./Skeleton";
import { roundTo } from "@systemboq/shared-types";
import { Tooltip } from "./Tooltip";

const INPUT = "border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800";

const round2 = (n: number) => roundTo(n, 2);
const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** สัดส่วนงวดมาตรฐานของบ้านพักอาศัย — ชุดเดียวกับที่เซิร์ฟเวอร์ใช้ตอนออกสัญญา */
const DEFAULT_PERCENTS = [20, 15, 15, 20, 17, 10, 3];

interface Row {
  milestone: string;
  amount: string;
}

/**
 * งวดการชำระเงิน (ข้อ 7) ของสัญญาฉบับหนึ่ง
 *
 * ต่างจากการพิมพ์ยอดลงในเนื้อสัญญาตรงที่ระบบตรวจให้ว่าทุกงวดรวมกันเท่ามูลค่าสัญญาพอดี —
 * ตอนเป็นข้อความ ไม่มีอะไรดักได้เลยว่าเจ็ดงวดรวมกันแล้วขาดไปแสนนึง
 */
/** ข้อความสรุปยอดรวมของงวดเทียบกับมูลค่าสัญญา */
function balanceMessage(anyInvalid: boolean, balanced: boolean, diff: number): string {
  if (anyInvalid) return "มีช่องที่ยังไม่ใช่ตัวเลข";
  if (balanced) return "ยอดตรงกับมูลค่าสัญญาพอดี";
  return diff > 0 ? `ยังขาดอีก ${money(diff)} บาท` : `เกินไป ${money(-diff)} บาท`;
}

export function ContractInstallmentsEditor({
  projectId,
  contract,
  bodyHasTable,
}: Readonly<{
  projectId: string;
  contract: ContractDto;
  /**
   * เนื้อสัญญา "ที่กำลังแก้อยู่บนจอ" มีบล็อกตารางไหม — ส่งมาจากตัวแก้เนื้อสัญญา
   * เพื่อให้คำเตือนหายทันทีที่กดแทรก ไม่ใช่รอจนโหลดหน้าใหม่ (ค่าจากเซิร์ฟเวอร์เป็นค่าที่บันทึกแล้ว)
   */
  bodyHasTable?: boolean;
}>) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const locked = Boolean(contract.signedAt);
  /*
   * มูลค่าสัญญามาจากเซิร์ฟเวอร์ ไม่ใช่ contract.amount ที่ถืออยู่แล้ว —
   * สัญญาที่ออกก่อนมีฟีเจอร์นี้ยังเป็น null แล้วหน้าจอจะนึกว่าเป้าหมายคือ 0
   * ทั้งที่เซิร์ฟเวอร์เทียบกับราคาสุทธิเวอร์ชันล่าสุด กดบันทึกก็ไม่ผ่านสักครั้งโดยไม่รู้ว่าทำไม
   */
  const [target, setTarget] = useState(0);
  const [savedPrintsTable, setSavedPrintsTable] = useState(true);
  /** เงินประกันผลงาน % — ค่าที่บันทึกแล้ว กับค่าที่กำลังพิมพ์ */
  const [savedRetention, setSavedRetention] = useState(contract.retentionPct == null ? "" : String(Number(contract.retentionPct)));
  const [retention, setRetention] = useState(savedRetention);
  const [savingRetention, setSavingRetention] = useState(false);
  const printsTable = bodyHasTable ?? savedPrintsTable;

  useEffect(() => {
    let alive = true;
    listInstallments(projectId, contract.id)
      .then((res) => {
        if (!alive) return;
        setTarget(Number(res.contractAmount));
        setSavedPrintsTable(res.printsTable);
        setRows(
          res.installments.map((i: ContractInstallmentDto) => ({
            milestone: i.milestone,
            amount: String(Number(i.amount)),
          })),
        );
      })
      .catch(() => {
        if (alive) toast.error("โหลดงวดเงินไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, contract.id]);

  const parsed = rows.map((r) => {
    const n = Number(r.amount);
    return Number.isFinite(n) ? n : Number.NaN;
  });
  const anyInvalid = parsed.some((n) => !Number.isFinite(n) || n < 0);
  const sum = anyInvalid ? Number.NaN : round2(parsed.reduce((a, b) => a + b, 0));
  const diff = anyInvalid ? Number.NaN : round2(target - sum);
  const balanced = !anyInvalid && diff === 0;

  function patch(i: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r, n) => (n === i ? sameRowKey(r, { ...r, ...p }) : r)));
  }

  /** แบ่งตามสัดส่วนมาตรฐาน — งวดสุดท้ายรับเศษการปัด ยอดรวมจึงตรงเสมอ (เหมือนฝั่งเซิร์ฟเวอร์) */
  function autoSplit() {
    const plan = DEFAULT_PERCENTS.slice(0, Math.max(1, rows.length));
    const head = plan.slice(0, -1).map((p) => round2(target * (p / 100)));
    const used = round2(head.reduce((a, b) => a + b, 0));
    const amounts = [...head, round2(target - used)];
    setRows((rs) =>
      rs.map((r, i) => sameRowKey(r, { ...r, amount: String(amounts[i] ?? 0) })),
    );
  }

  /** ยัดส่วนต่างที่เหลือลงงวดสุดท้าย — ทางลัดที่ใช้บ่อยสุดเวลายอดไม่ลงตัว */
  function balanceLast() {
    if (rows.length === 0 || anyInvalid) return;
    const last = rows.length - 1;
    patch(last, { amount: String(round2(parsed[last] + diff)) });
  }

  async function save() {
    if (!balanced) return;
    setSaving(true);
    try {
      await updateInstallments(
        projectId,
        contract.id,
        rows.map((r) => ({ milestone: r.milestone.trim(), amount: Number(r.amount) })),
      );
      toast.success("บันทึกงวดเงินแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const retentionPct = retention.trim() === "" ? null : Number(retention);
  const retentionInvalid = retentionPct != null && (!Number.isFinite(retentionPct) || retentionPct < 0 || retentionPct > 20);

  async function saveRetention() {
    if (retentionInvalid) return;
    setSavingRetention(true);
    try {
      await saveRetentionPct(projectId, contract.id, { pct: retentionPct });
      setSavedRetention(retention.trim());
      toast.success(retentionPct ? `ตั้งเงินประกันผลงาน ${retentionPct}% แล้ว` : "สัญญานี้ไม่มีเงินประกันผลงาน");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingRetention(false);
    }
  }

  if (loading) return <PanelSkeleton label="กำลังโหลดงวดเงิน..." />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-800">งวดการชำระเงิน (ข้อ 7)</p>
        <p className="text-xs text-slate-500">
          มูลค่าสัญญา <span className="tabular-nums text-slate-800">{money(target)}</span> บาท
        </p>
      </div>

      {locked && (
        <p className="inline-flex items-center gap-1 self-start rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">
          <Lock size={12} /> ลงนามแล้ว — แก้งวดเงินไม่ได้
        </p>
      )}

      {/*
        กรอกงวดไว้ครบแต่เอกสารไม่พิมพ์ออกมา = ความผิดพลาดที่เงียบที่สุดของฟีเจอร์นี้
        ต้องบอกตรงนี้ เพราะเป็นจุดเดียวที่คนกำลังมองตอนกรอกยอด
      */}
      {!printsTable && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            เนื้อสัญญาฉบับนี้ยังไม่มีบล็อก <code className="font-medium">{"{{ตารางงวดงาน}}"}</code>{" "}
            งวดที่กรอกไว้จะถูกบันทึก แต่<span className="font-medium">จะไม่ถูกพิมพ์ลงเอกสาร</span> —
            แทรกบล็อกนี้ในข้อว่าด้วยการชำระเงินที่หัวข้อ “เนื้อสัญญา” ด้านล่างก่อน
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={rowKey(r)} className="flex flex-wrap items-center gap-2">
            <span className="w-14 shrink-0 text-xs text-slate-500">งวดที่ {i + 1}</span>
            <input
              className={`${INPUT} min-w-0 flex-1`}
              value={r.milestone}
              disabled={locked}
              placeholder="ชำระเมื่อ ... แล้วเสร็จ"
              onChange={(e) => patch(i, { milestone: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              min="0"
              className={`${INPUT} w-36 text-right tabular-nums`}
              value={r.amount}
              disabled={locked}
              onChange={(e) => patch(i, { amount: e.target.value })}
            />
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-500">
              {target > 0 && Number.isFinite(parsed[i])
                ? `${round2((parsed[i] / target) * 100)}%`
                : "—"}
            </span>
            {!locked && rows.length > 1 && (
              <Tooltip label="ลบงวดนี้" side="top" align="end">
                <button
                  type="button"
                  aria-label="ลบงวดนี้"
                  onClick={() => setRows((rs) => rs.filter((_, n) => n !== i))}
                  className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={15} />
                </button>
              </Tooltip>
            )}
          </div>
        ))}
      </div>

      {/* ยอดรวมอยู่ติดกับช่องกรอกเสมอ ไม่ต้องเลื่อนไปหา — เป็นตัวเลขเดียวที่ต้องจ้องตอนแก้ */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm ${
          balanced
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        <span>
          รวม <span className="font-semibold tabular-nums">{anyInvalid ? "—" : money(sum)}</span> บาท
        </span>
        <span>
          {balanceMessage(anyInvalid, balanced, diff)}
        </span>
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving || !balanced}>
            <Check size={14} /> {saving ? "กำลังบันทึก..." : "บันทึกงวดเงิน"}
          </Button>
          {!balanced && !anyInvalid && rows.length > 0 && (
            <Button variant="ghost" size="sm" onClick={balanceLast}>
              ยัดส่วนต่างลงงวดสุดท้าย
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={autoSplit}>
            <Wand2 size={14} /> แบ่งตามสัดส่วนมาตรฐาน
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { milestone: "", amount: "0" }])}
          >
            <Plus size={14} /> เพิ่มงวด
          </Button>
        </div>
      )}

      {/*
        เงินประกันผลงานเป็นเงื่อนไขของการจ่ายแต่ละงวด จึงอยู่ใต้ตารางงวด ไม่ใช่ในหน้าตั้งค่า
        ตั้งแล้วสัญญาพิมพ์ "หักเงินประกันผลงาน x% · โอนสุทธิ" ใต้ทุกงวด
      */}
      {!locked && (
        <div className="flex flex-col gap-1.5 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`retention-${contract.id}`} className="text-sm text-slate-700">
              เงินประกันผลงาน
            </label>
            <input
              id={`retention-${contract.id}`}
              type="number"
              step="0.5"
              min="0"
              max="20"
              placeholder="ไม่มี"
              className={`${INPUT} w-20 text-right tabular-nums`}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            />
            <span className="text-sm text-slate-500">% ของยอดแต่ละงวด (รวม VAT)</span>
            {retention.trim() !== savedRetention && (
              <Button size="sm" variant="ghost" disabled={savingRetention || retentionInvalid} onClick={() => void saveRetention()}>
                <Check size={14} /> บันทึก
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            {retentionHint(retentionInvalid, retentionPct, target)}
          </p>
        </div>
      )}
    </div>
  );
}

function retentionHint(invalid: boolean, pct: number | null, target: number) {
  if (invalid) return "ใส่ได้ 0–20%";
  if (!pct) return "เว้นว่าง = สัญญานี้ไม่มีเงินประกันผลงาน";
  return `ผู้ว่าจ้างกันไว้ทุกงวด รวม ${money(round2((target * pct) / 100))} บาท แล้วคืนเมื่อพ้นระยะรับประกันผลงาน — พิมพ์ใต้ตารางงวดในสัญญา`;
}
