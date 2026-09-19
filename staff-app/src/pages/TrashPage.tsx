import { RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { TrashItemDto, TrashItemType } from "@systemboq/shared-types";

import { Button } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { listTrash, purgeTrashItem, restoreTrashItem } from "../lib/trash-api";

// สีป้ายชนิด (เขียนคลาสเต็มเพราะ Tailwind JIT อ่านเฉพาะ literal)
const TYPE_BADGE: Record<TrashItemType, string> = {
  project: "bg-blue-100 text-blue-800",
  houseDesign: "bg-emerald-100 text-emerald-800",
  template: "bg-violet-100 text-violet-800",
  contractTemplate: "bg-indigo-100 text-indigo-800",
  portfolio: "bg-amber-100 text-amber-800",
  material: "bg-cyan-100 text-cyan-800",
  lead: "bg-rose-100 text-rose-800",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// "เหลือ N วันก่อนลบถาวร" — จากวันลบ + จำนวนวันที่เก็บ
function daysLeftOf(deletedAt: string, retentionDays: number): number {
  const elapsed = Math.floor((Date.now() - new Date(deletedAt).getTime()) / MS_PER_DAY);
  return Math.max(0, retentionDays - elapsed);
}

function formatDeletedAt(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TrashPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const isOwner = user?.role === "OWNER";

  const [items, setItems] = useState<TrashItemDto[]>([]);
  const [retentionDays, setRetentionDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listTrash();
      setItems(res.items);
      setRetentionDays(res.retentionDays);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดถังขยะไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRestore(item: TrashItemDto) {
    setBusyId(item.id);
    try {
      await restoreTrashItem(item.type, item.id);
      toast.success(`กู้คืน "${item.label}" แล้ว`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "กู้คืนไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePurge(item: TrashItemDto) {
    const ok = await confirm(
      `ลบ "${item.label}" ออกถาวร? การลบถาวรกู้คืนไม่ได้อีก`,
      { confirmLabel: "ลบถาวร", variant: "danger" },
    );
    if (!ok) return;
    setBusyId(item.id);
    try {
      await purgeTrashItem(item.type, item.id);
      toast.success(`ลบ "${item.label}" ออกถาวรแล้ว`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบถาวรไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout>
      {/* ส่งคำอธิบายผ่าน prop subtitle ไม่ใช่วาง <p> ต่อท้ายเอง — subtitle จะถูกจัดให้ตรงแนวกับ
          หัวข้อ (x=304) และห่างจากหัวข้อ 36px เท่ากับทุกหน้า ส่วนการวางเองทำให้คำอธิบายเยื้อง
          ไปทางซ้ายเกิน 16px ไปชนแนวแถบสีนาวี และห่างจากหัวข้อ 58px (วัดเทียบกับหน้าแม่แบบ/ผู้ใช้) */}
      <PageHeader
        title="ถังขยะ"
        subtitle={
          <>
            <span>รายการที่ลบจะถูกเก็บไว้ที่นี่ กู้คืนได้ทุกเมื่อ — และจะถูก</span>
            <span className="font-medium text-slate-700">ลบถาวรอัตโนมัติหลัง {retentionDays} วัน</span>
            {isOwner ? "" : " การลบถาวรทำได้เฉพาะเจ้าของระบบ (OWNER)"}
          </>
        }
      />

      {loading && <p className="text-slate-500">กำลังโหลด...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <Trash2 size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-700 font-medium">ถังขยะว่างเปล่า</p>
          <p className="mt-1 text-sm text-slate-500">รายการที่คุณลบจะมาแสดงที่นี่ก่อนถูกลบถาวร</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <p className="mb-2 text-xs text-slate-500">มีในถังขยะ {items.length} รายการ</p>
          <table className="w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden [&_tbody_tr:hover]:bg-slate-50/70">
            <thead className="text-left text-xs font-medium text-slate-600 [&_th]:bg-slate-200 [&_th]:border-b [&_th]:border-slate-300">
              <tr>
                <th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">รายการ</th>
                <th className="px-3 py-2 whitespace-nowrap">ลบเมื่อ</th>
                <th className="px-3 py-2 whitespace-nowrap">เหลือก่อนลบถาวร</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const daysLeft = daysLeftOf(item.deletedAt, retentionDays);
                const busy = busyId === item.id;
                return (
                  <tr key={`${item.type}:${item.id}`} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[item.type]}`}
                      >
                        {item.typeLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-slate-800">{item.label}</span>
                      {item.deletedByName && (
                        <span className="block text-xs text-slate-400">ลบโดย: {item.deletedByName}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                      {formatDeletedAt(item.deletedAt)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={daysLeft <= 3 ? "text-amber-600 font-medium" : "text-slate-500"}>
                        {daysLeft > 0 ? `${daysLeft} วัน` : "กำลังจะถูกลบ"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" disabled={busy} onClick={() => handleRestore(item)}>
                          <RotateCcw size={14} /> กู้คืน
                        </Button>
                        {isOwner && (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={busy || item.blockReason !== null}
                            title={item.blockReason ?? undefined}
                            onClick={() => handlePurge(item)}
                          >
                            <Trash2 size={14} /> ลบถาวร
                          </Button>
                        )}
                      </div>
                      {isOwner && item.blockReason && (
                        <span className="mt-1 block text-right text-xs text-slate-400">
                          {item.blockReason}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* ปุ่มลอยเล็ก ๆ อธิบายการกู้คืนแบบเงียบ ๆ — ใช้ไอคอน Undo2 ให้สื่อความ */}
      {!loading && !error && items.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Undo2 size={13} /> กด "กู้คืน" เพื่อนำรายการกลับไปยังที่เดิม
        </p>
      )}
    </Layout>
  );
}
