import { Plus } from "lucide-react";
import { useState } from "react";

import type { CustomerDetailDto, CustomerNoteDto } from "@systemboq/shared-types";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  addCustomerNote,
  deleteCustomerNote,
  updateCustomerNote,
} from "../lib/customer-file-api";
import { AutoTextarea } from "./AutoTextarea";
import { Button } from "./Button";

/** แสดงกี่บันทึกก่อนต้องกด "ดูทั้งหมด" — แพตเทิร์นเดียวกับไทม์ไลน์ในหน้าโครงการ */
const PREVIEW_COUNT = 5;

const BOX =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20";

function when(value: string): string {
  return new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * บันทึกการติดต่อลูกค้า — โทรไปคุยอะไร นัดวันไหน ติดเรื่องอะไร
 *
 * เป็นส่วนเดียวในแฟ้มที่คนพิมพ์เอง ที่เหลืออ่านจากสิ่งที่ระบบบันทึกไว้อยู่แล้ว จึงไม่เอาไปรวมกับ
 * ตารางกิจกรรม: ตารางนั้นคือ "สิ่งที่ระบบเห็น" (แก้ไม่ได้ อ่านจาก AuditLog) ส่วนนี่คือ
 * "สิ่งที่เราจดไว้เอง" (แก้ได้ ลบได้) ถ้าปนกันจะแยกไม่ออกว่าอันไหนเป็นหลักฐานอันไหนเป็นความเห็น
 */
export function CustomerNotes({
  customerId,
  notes,
  canWrite,
  onChanged,
}: Readonly<{
  customerId: string;
  notes: CustomerNoteDto[];
  /** false เมื่อลูกค้าขอลบข้อมูลแล้ว — เซิร์ฟเวอร์ปฏิเสธอยู่แล้ว ที่นี่แค่ไม่ให้เห็นปุ่ม */
  canWrite: boolean;
  onChanged: (next: CustomerDetailDto) => void;
}>) {
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ customer: CustomerDetailDto }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      onChanged(res.customer);
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (await run(() => addCustomerNote(customerId, draft.trim()))) {
      setDraft("");
      setAdding(false);
    }
  }

  async function saveEdit(noteId: string) {
    if (await run(() => updateCustomerNote(customerId, noteId, editDraft.trim()))) {
      setEditingId(null);
    }
  }

  async function remove(noteId: string) {
    if (!window.confirm("ลบบันทึกนี้?")) return;
    await run(() => deleteCustomerNote(customerId, noteId));
  }

  // แก้/ลบได้เฉพาะบันทึกของตัวเอง หรือ OWNER — กฎเดียวกับที่เซิร์ฟเวอร์บังคับ
  const canEdit = (n: CustomerNoteDto) => canWrite && (isOwner || n.authorId === user?.id);

  const shown = expanded ? notes : notes.slice(0, PREVIEW_COUNT);

  return (
    <section className="mb-8">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-slate-800">
          บันทึกการติดต่อ{notes.length > 0 ? ` (${notes.length})` : ""}
        </h2>
        {canWrite && !adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> เพิ่มบันทึก
          </Button>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {adding && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
          <AutoTextarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="เช่น โทรคุยเรื่องงบ ลูกค้าขอปรับลดห้องน้ำเหลือ 2 ห้อง นัดดูแบบอีกครั้งศุกร์นี้"
            className={BOX}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false);
                setDraft("");
                setError(null);
              }}
              disabled={busy}
            >
              ยกเลิก
            </Button>
            <Button size="sm" onClick={add} disabled={busy || draft.trim() === ""}>
              {busy ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      )}

      {notes.length === 0 && !adding && (
        <p className="text-slate-500">ยังไม่มีบันทึก — จดไว้ได้ว่าคุยอะไรกันไปบ้าง</p>
      )}

      {shown.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shown.map((n) => (
            <li key={n.id} className="rounded-lg border border-slate-200 bg-white p-3">
              {editingId === n.id ? (
                <>
                  <AutoTextarea
                    autoFocus
                    rows={2}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className={BOX}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveEdit(n.id)}
                      disabled={busy || editDraft.trim() === ""}
                    >
                      บันทึก
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* ขึ้นบรรทัดใหม่ตามที่พิมพ์มา — บันทึกการโทรมักเป็นรายการสั้น ๆ หลายบรรทัด */}
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                    <span>{n.authorName ?? "ไม่ทราบผู้เขียน"}</span>
                    <span aria-hidden>·</span>
                    <span>{when(n.createdAt)}</span>
                    {n.updatedAt !== n.createdAt && <span>· แก้ไขแล้ว</span>}
                    {canEdit(n) && (
                      <span className="-me-1.5 ms-auto flex">
                        <button
                          type="button"
                          className="link-pill -my-1 px-1.5 hover:bg-slate-100 hover:text-slate-700"
                          onClick={() => {
                            setEditingId(n.id);
                            setEditDraft(n.body);
                            setError(null);
                          }}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="link-pill -my-1 px-1.5 hover:bg-red-50 hover:text-red-600"
                          onClick={() => remove(n.id)}
                          disabled={busy}
                        >
                          ลบ
                        </button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {notes.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="link-pill -ml-2.5 mt-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          {expanded ? "ย่อลง" : `ดูทั้งหมด (${notes.length})`}
        </button>
      )}
    </section>
  );
}
