import type { ContractDto, ContractStructureDto } from "@systemboq/shared-types";
import { Check, Lock, Plus, TableProperties, Trash2 } from "lucide-react";
import { useState } from "react";

import { ApiError } from "../lib/api";
import { updateContractBody } from "../lib/contracts-api";
import { INSTALLMENT_TABLE_TOKEN } from "../lib/contract-tokens";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { ContractInstallmentsEditor } from "./ContractInstallmentsEditor";
import { ContractPaymentsPanel } from "./ContractPaymentsPanel";
import { rowKey, sameRowKey } from "../lib/row-keys";

const INPUT = "w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm text-slate-800";
const LABEL = "flex flex-col gap-1 text-xs text-slate-700";

function clone(s: ContractStructureDto): ContractStructureDto {
  return { ...s, clauses: s.clauses.map((c) => ({ ...c })) };
}

/**
 * แก้ถ้อยคำของสัญญา "ฉบับนี้" — ไม่ใช่แม่แบบ
 *
 * นี่คือที่ที่พนักงานเติมยอดเงินแต่ละงวดในข้อ 7 เพราะแม่แบบใช้ร่วมกันทุกโครงการจึงใส่ยอดจริงไม่ได้
 * ตัวแปร {{...}} ถูกแทนค่าไปแล้วตั้งแต่ตอนออกสัญญา ข้อความที่เห็นตรงนี้คือสิ่งที่จะพิมพ์ออกมาเป๊ะ ๆ
 */
export function ContractBodyEditor({
  projectId,
  contract,
  onSaved,
}: Readonly<{
  projectId: string;
  contract: ContractDto;
  onSaved: () => void | Promise<void>;
}>) {
  const toast = useToast();
  const [body, setBody] = useState<ContractStructureDto | null>(
    contract.bodyJson ? clone(contract.bodyJson) : null,
  );
  const [saving, setSaving] = useState(false);
  const locked = Boolean(contract.signedAt);
  /*
   * ตำแหน่งเคอร์เซอร์ล่าสุดในข้อสัญญา — เก็บไว้เพื่อแทรกบล็อกตารางงวดงานตรงจุดที่คนวางไว้
   * ไม่ใช่ต่อท้ายข้อเสมอ เพราะย่อหน้าปิดท้ายของข้อ 7 ต้องอยู่ใต้ตาราง
   */
  const [caret, setCaret] = useState<{ index: number; start: number; end: number } | null>(null);

  if (!body) {
    return (
      <p className="text-sm text-slate-500">
        สัญญาฉบับนี้ออกก่อนระบบแม่แบบสัญญา จึงยังไม่มีเนื้อสัญญาให้แก้ —
        สร้างสัญญาใบใหม่เพื่อใช้แม่แบบปัจจุบัน
      </p>
    );
  }

  function patchClause(i: number, patch: Partial<{ heading: string; body: string }>) {
    setBody((b) =>
      b ? { ...b, clauses: b.clauses.map((c, n) => (n === i ? sameRowKey(c, { ...c, ...patch }) : c)) } : b,
    );
  }

  /** แทรกบล็อกตารางงวดงานลงในข้อที่เคอร์เซอร์ค้างอยู่ */
  function insertInstallmentBlock() {
    if (!caret) {
      toast.info("คลิกในข้อที่ต้องการก่อน แล้วค่อยกดแทรกตาราง");
      return;
    }
    const { index, start, end } = caret;
    setBody((b) => {
      if (!b) return b;
      const text = b.clauses[index]?.body ?? "";
      const next = text.slice(0, start) + INSTALLMENT_TABLE_TOKEN + text.slice(end);
      return { ...b, clauses: b.clauses.map((c, n) => (n === index ? sameRowKey(c, { ...c, body: next }) : c)) };
    });
  }

  const hasInstallmentTable = body.clauses.some((c) =>
    c.body.includes(INSTALLMENT_TABLE_TOKEN),
  );

  async function save() {
    if (!body) return;
    if (!body.preamble.trim() || body.clauses.some((c) => !c.heading.trim() || !c.body.trim())) {
      toast.error("อารัมภบทและทุกข้อสัญญาต้องไม่ว่าง");
      return;
    }
    setSaving(true);
    try {
      await updateContractBody(projectId, contract.id, { body });
      toast.success("บันทึกข้อความสัญญาแล้ว");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>
          ออกจากแม่แบบ:{" "}
          <span className="text-slate-700">{contract.templateName ?? "-"}</span>
        </span>
        {locked && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700">
            <Lock size={12} /> ลงนามแล้ว — แก้ข้อความไม่ได้ ต้องทำบันทึกแนบท้ายสัญญาแทน
          </span>
        )}
      </div>

      {/*
        ก่อนลงนาม = วางแผนว่าจะแบ่งจ่ายกี่งวด · หลังลงนาม = เก็บเงินตามแผนนั้น
        เป็นคนละงานคนละช่วงเวลา จึงสลับกันไปเลย ไม่เอาสองตารางมาซ้อนกัน (แผนงวดแก้หลังลงนาม
        ไม่ได้อยู่แล้ว ตารางเดิมจึงเหลือแค่ตารางอ่านอย่างเดียวที่ซ้ำกับตารางการรับเงิน)
      */}
      <div className="rounded-md border border-slate-200 bg-white p-3">
        {locked ? (
          <ContractPaymentsPanel projectId={projectId} contractId={contract.id} />
        ) : (
          <ContractInstallmentsEditor
            projectId={projectId}
            contract={contract}
            bodyHasTable={hasInstallmentTable}
          />
        )}
      </div>

      {/* ปุ่มโผล่เฉพาะตอนที่เนื้อสัญญายังไม่มีตาราง — ถ้ามีแล้วการแทรกซ้ำได้มีแต่ทำให้พิมพ์สองตาราง */}
      {!locked && !hasInstallmentTable && (
        <button
          type="button"
          onClick={insertInstallmentBlock}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs text-indigo-800 transition-colors hover:border-indigo-300 hover:bg-indigo-100"
        >
          <TableProperties size={13} /> แทรกบล็อกตารางงวดงาน
        </button>
      )}

      {/* ข้อความสัญญาอยู่ล่างกว่างวดเงิน เพราะถ้อยคำมาจากแม่แบบแล้ว ส่วนที่ต้องแก้จริงคือยอดเงิน */}
      <label className={LABEL}>
        <span>อารัมภบท</span>
        <textarea
          className={`${INPUT} min-h-24 leading-relaxed`}
          value={body.preamble}
          disabled={locked}
          onChange={(e) => setBody((b) => (b ? { ...b, preamble: e.target.value } : b))}
        />
      </label>

      {body.clauses.map((c, i) => (
        <div key={rowKey(c)} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <input
              className={`${INPUT} font-medium`}
              value={c.heading}
              disabled={locked}
              onChange={(e) => patchClause(i, { heading: e.target.value })}
            />
            {!locked && body.clauses.length > 1 && (
              <button
                type="button"
                aria-label="ลบข้อนี้"
                onClick={() =>
                  setBody((b) => (b ? { ...b, clauses: b.clauses.filter((_, n) => n !== i) } : b))
                }
                className="rounded-md p-1.5 text-red-600 hover:bg-red-50"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
          <textarea
            className={`${INPUT} min-h-32 leading-relaxed`}
            value={c.body}
            disabled={locked}
            onChange={(e) => patchClause(i, { body: e.target.value })}
            onSelect={(e) =>
              setCaret({
                index: i,
                start: e.currentTarget.selectionStart ?? 0,
                end: e.currentTarget.selectionEnd ?? 0,
              })
            }
          />
        </div>
      ))}

      <label className={LABEL}>
        <span>ข้อความปิดท้าย</span>
        <textarea
          className={`${INPUT} min-h-20 leading-relaxed`}
          value={body.closing}
          disabled={locked}
          onChange={(e) => setBody((b) => (b ? { ...b, closing: e.target.value } : b))}
        />
      </label>

      {!locked && (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={save} disabled={saving}>
            <Check size={14} /> {saving ? "กำลังบันทึก..." : "บันทึกข้อความ"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setBody((b) => {
                if (!b) return b;
                const n = b.clauses.length + 1;
                return { ...b, clauses: [...b.clauses, { heading: `ข้อ ${n}.`, body: "" }] };
              })
            }
          >
            <Plus size={14} /> เพิ่มข้อสัญญา
          </Button>
        </div>
      )}
    </div>
  );
}
