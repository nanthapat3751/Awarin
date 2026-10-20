import {
  STRUCTURAL_KINDS,
  type BoqItemDto,
  type MaterialDto,
  type StructuralMemberDto,
} from "@systemboq/shared-types";
import { ChevronDown, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../lib/api";
import { deleteStructuralMember, listStructuralMembers } from "../lib/boq-api";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { iconButtonClasses } from "./Button";
import type { SearchableOption } from "./SearchableSelect";
import { StructuralCalcDialog } from "./StructuralCalcDialog";
import { StructuralRecomputeDialog } from "./StructuralRecomputeDialog";
import { Tooltip } from "./Tooltip";

const fmtM = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 3 });

/**
 * ชิ้นส่วนโครงสร้างที่ลงไว้ (Phase 2 ข้อ 3c — ผู้ใช้เลือก 16 ต.ค.) พับอยู่ใต้แถบสรุปเหล็กในแท็บ BOQ
 *
 * แก้ = เปิดตัวคิดพร้อมขนาดเดิม แล้วลงทับ (แถวเดิมของชิ้นนี้ถูกแทน) · ลบ = ถอดแถวของชิ้นนี้ออกจากทุกบรรทัด
 * เดิมใส่ขนาดผิดแล้วต้องไปไล่แก้แถวในใบถอดแบบทีละบรรทัด และขนาดที่เก็บไว้ (ใช้คิดชุดสั่งตัด) ไม่ตรงกับ BOQ
 * โหลดเฉพาะโครงการที่มีแถวจากตัวคิดชิ้นส่วนแล้ว — โครงการอื่นไม่ยิงคำขอ ไม่เห็นแผงนี้
 */
export function StructuralMembersPanel({
  projectId,
  items,
  materials,
  categoryOptions,
  editable,
  onChanged,
}: Readonly<{
  projectId: string;
  items: BoqItemDto[];
  materials: MaterialDto[];
  categoryOptions: SearchableOption[];
  editable: boolean;
  onChanged: () => Promise<void> | void;
}>) {
  const toast = useToast();
  const confirm = useConfirm();
  const signature = useMemo(
    () => items.map((i) => `${i.id}:${i.quantity}:${i.takeoffRows.length}`).join("|"),
    [items],
  );
  const hasMembers = useMemo(() => items.some((i) => i.takeoffRows.some((r) => r.memberKey)), [items]);
  const [members, setMembers] = useState<StructuralMemberDto[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StructuralMemberDto | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  useEffect(() => {
    if (!hasMembers) {
      setMembers([]);
      return;
    }
    let alive = true;
    listStructuralMembers(projectId)
      .then(({ members: m }) => alive && setMembers(m))
      // รายการชิ้นส่วนเป็นเครื่องมือเสริม — โหลดไม่ได้ไม่ขวางหน้า BOQ (ซ่อนแผงไป)
      .catch(() => alive && setMembers([]));
    return () => {
      alive = false;
    };
  }, [projectId, signature, hasMembers]);

  if (members.length === 0) return null;

  async function remove(m: StructuralMemberDto) {
    const ok = await confirm(
      `ลบชิ้นส่วน ${m.label} (×${m.count})? แถวของชิ้นนี้จะหายจาก ${m.lines.length} บรรทัด — บรรทัดที่ไม่เหลือแถวอื่นจะถูกลบด้วย`,
      { confirmLabel: "ลบชิ้นส่วน", cancelLabel: "ยกเลิก", variant: "danger" },
    );
    if (!ok) return;
    setBusyKey(m.key);
    try {
      const res = await deleteStructuralMember(projectId, m.key);
      await onChanged();
      toast.success(
        `ลบ ${m.label} แล้ว` +
          (res.removed > 0 ? ` · ลบบรรทัดที่ไม่เหลือแถว ${res.removed}` : "") +
          (res.newVersion ? ` · แตกเป็นเวอร์ชัน ${res.version.versionNo} (เวอร์ชันเดิมส่งใบเสนอราคาแล้ว)` : ""),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบชิ้นส่วนไม่สำเร็จ");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="mb-2 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
        >
          <span className="font-semibold text-slate-900">ชิ้นส่วนโครงสร้าง ({members.length})</span>
          <span className="truncate text-xs text-slate-500">ชิ้นที่ลงจากตัวคิด — แก้ขนาดหรือลบได้ที่นี่</span>
          <ChevronDown size={15} aria-hidden className={`ml-auto shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {/* หลังแก้ชุดเสนอราคา ชิ้นเดิมยังคิดด้วยกฎเก่า — คิดใหม่ทั้งโครงการ (พรีวิวก่อนยืนยันเสมอ) */}
        {editable && (
          <button
            type="button"
            onClick={() => setRecomputing(true)}
            className="link-pill inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand"
          >
            <RefreshCw size={13} aria-hidden /> คิดใหม่ทั้งโครงการ
          </button>
        )}
      </div>
      {open && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {members.map((m) => {
            const kindLabel = STRUCTURAL_KINDS.find((k) => k.value === m.kind)?.label ?? m.kind;
            return (
              <li key={m.key} className="group flex items-start gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800">
                    <span className="font-medium">{m.label}</span>{" "}
                    <span className="text-slate-500">
                      {kindLabel} ×{m.count} · {fmtM(m.input.width)} × {fmtM(m.input.depth)} × {fmtM(m.input.length)} ม.
                    </span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {m.lines.length > 0
                      ? `ลงที่ ${m.lines.map((l) => l.name).join(" · ")}`
                      : "ไม่มีแถวใน BOQ แล้ว (ถูกลบจากใบถอดแบบ)"}
                  </p>
                </div>
                {editable && (
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 touch:opacity-100">
                    <Tooltip label="แก้ไข" side="top">
                      <button
                        type="button"
                        aria-label={`แก้ชิ้นส่วน ${m.label}`}
                        disabled={busyKey != null}
                        onClick={() => setEditing(m)}
                        className={iconButtonClasses()}
                      >
                        <Pencil size={14} />
                      </button>
                    </Tooltip>
                    <Tooltip label="ลบ" side="top" align="end">
                      <button
                        type="button"
                        aria-label={`ลบชิ้นส่วน ${m.label}`}
                        disabled={busyKey != null}
                        onClick={() => void remove(m)}
                        className={iconButtonClasses("danger")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {recomputing && (
        <StructuralRecomputeDialog projectId={projectId} onApplied={onChanged} onClose={() => setRecomputing(false)} />
      )}
      {editing && (
        <StructuralCalcDialog
          projectId={projectId}
          items={items}
          materials={materials}
          categoryOptions={categoryOptions}
          editing={editing}
          onApplied={onChanged}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
