import type { MySignatureDto } from "@systemboq/shared-types";
import { ImageUp, PenLine, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

import { getMySignature, removeMySignature, saveMySignature } from "../lib/account-api";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";

const CARD = "bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3";
/** สีหมึก: ดำ หรือ น้ำเงิน (เอกสารไทยนิยมเซ็นปากกาน้ำเงิน) */
const INKS = [
  { label: "ดำ", color: "#111827" },
  { label: "น้ำเงิน", color: "#1e3a8a" },
] as const;

function msg(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/**
 * ตัวอย่างบนเส้นเซ็นแบบเดียวกับท้ายใบเสนอราคา — ให้เห็นว่าออกมาบนเอกสารจริงเป็นยังไง
 * ยังไม่ตั้ง (dataUrl null) = กรอบเส้นประบอกตำแหน่งที่ลายเซ็นจะไปอยู่ แทนข้อความลอย ๆ บรรทัดเดียว
 */
function SignaturePreview({ dataUrl, name }: Readonly<{ dataUrl: string | null; name: string }>) {
  return (
    <div className="w-72 rounded-md border border-slate-200 bg-white px-4 pb-3 pt-2 text-center text-xs text-slate-600">
      <div className="relative h-14">
        {dataUrl ? (
          <img src={dataUrl} alt="ลายเซ็นของคุณ" className="absolute bottom-0 left-1/2 max-h-14 max-w-[200px] -translate-x-1/2" />
        ) : (
          <div className="absolute inset-x-6 bottom-1 top-1 flex items-center justify-center rounded border border-dashed border-slate-300 text-slate-400">
            ลายเซ็นของคุณจะอยู่ตรงนี้
          </div>
        )}
      </div>
      <p className="whitespace-nowrap">ลงชื่อ ................................ ผู้เสนอราคา</p>
      <p className="mt-1">( {name} )</p>
    </div>
  );
}

function DrawPad({ onSave, busy }: Readonly<{ onSave: (image: Blob) => void; busy: boolean }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [ink, setInk] = useState<string>(INKS[0].color);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // ความละเอียดจริงของ canvas ต้องคูณ devicePixelRatio ไม่งั้นเส้นแตกบนจอคม
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
    const pad = new SignaturePad(canvas, { minWidth: 1, maxWidth: 2.8, penColor: INKS[0].color });
    pad.addEventListener("endStroke", () => setEmpty(pad.isEmpty()));
    padRef.current = pad;
    return () => pad.off();
  }, []);

  function chooseInk(color: string) {
    setInk(color);
    if (padRef.current) padRef.current.penColor = color;
  }

  function clear() {
    padRef.current?.clear();
    setEmpty(true);
  }

  function save() {
    canvasRef.current?.toBlob((blob) => blob && onSave(blob), "image/png");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label="กรอบสำหรับเซ็นชื่อ"
          className="h-44 w-full touch-none rounded-md border border-dashed border-slate-300 bg-slate-50"
        />
        {/* เส้นช่วยวางลายเซ็น — แค่ไกด์ ไม่ถูกบันทึกไปด้วย */}
        <div className="pointer-events-none absolute inset-x-8 bottom-10 border-b border-slate-300" aria-hidden />
        {empty && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            เซ็นในกรอบนี้ด้วยเมาส์ นิ้ว หรือปากกา
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">สีหมึก</span>
        {INKS.map((i) => (
          <button
            key={i.color}
            type="button"
            onClick={() => chooseInk(i.color)}
            aria-pressed={ink === i.color}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              ink === i.color ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-200 text-slate-500"
            }`}
          >
            <span className="h-3 w-3 rounded-full" style={{ background: i.color }} aria-hidden />
            {i.label}
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={clear} disabled={busy || empty} className="ml-auto">
          <RotateCcw size={14} /> ล้าง
        </Button>
        <Button size="sm" onClick={save} disabled={busy || empty}>
          {busy ? "กำลังบันทึก..." : "บันทึกลายเซ็น"}
        </Button>
      </div>
    </div>
  );
}

function UploadPad({ onSave, busy }: Readonly<{ onSave: (image: Blob) => void; busy: boolean }>) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="text-sm text-slate-600">
        เซ็นด้วยปากกาสีเข้มบนกระดาษขาว ถ่ายให้ตรงและสว่าง — ระบบลบพื้นกระดาษและตัดขอบให้เอง
      </p>
      <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
        <ImageUp size={14} /> {busy ? "กำลังประมวลผล..." : "เลือกรูปลายเซ็น"}
      </Button>
      <p className="text-xs text-slate-400">JPG, PNG หรือ WEBP ไม่เกิน 8 MB</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onSave(file);
        }}
      />
    </div>
  );
}

/**
 * ลายเซ็นของฉัน — ใช้ลงช่อง "ผู้เสนอราคา" (ตอนกดขออนุมัติ) และ "ผู้อนุมัติ" (ตอนเจ้าของกดอนุมัติ)
 * ของใบเสนอราคาเท่านั้น และเฉพาะใบที่เจ้าของบัญชีเป็นคนกดเอง · ใบที่เซ็นไปแล้วเก็บสำเนาของตัวเอง
 * เปลี่ยน/ลบที่นี่จึงไม่ย้อนไปแก้ใบเก่า
 */
export function SignatureCard() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [signature, setSignature] = useState<MySignatureDto | null>(null);
  const [editing, setEditing] = useState<"draw" | "upload" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMySignature()
      .then(setSignature)
      .catch(() => setSignature({ dataUrl: null, updatedAt: null }));
  }, []);

  async function save(image: Blob) {
    setBusy(true);
    try {
      setSignature(await saveMySignature(image));
      setEditing(null);
      toast.success("บันทึกลายเซ็นแล้ว");
    } catch (err) {
      toast.error(msg(err, "บันทึกลายเซ็นไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm("ลบลายเซ็น? ใบเสนอราคาที่เซ็นไปแล้วไม่เปลี่ยน ใบต่อไปจะเป็นเส้นว่างให้เซ็นมือ", {
      confirmLabel: "ลบลายเซ็น",
    });
    if (!ok) return;
    try {
      await removeMySignature();
      setSignature({ dataUrl: null, updatedAt: null });
      toast.success("ลบลายเซ็นแล้ว");
    } catch (err) {
      toast.error(msg(err, "ลบลายเซ็นไม่สำเร็จ"));
    }
  }

  const tab = (id: "draw" | "upload", label: string, Icon: typeof PenLine) => (
    <button
      type="button"
      onClick={() => setEditing(id)}
      aria-pressed={editing === id}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-sm ${
        editing === id ? "border-brand font-medium text-brand" : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <section id="signature" className={`${CARD} scroll-mt-20`}>
      <div>
        <p className="text-sm font-medium text-slate-800">ลายเซ็น</p>
        <p className="mt-0.5 text-xs text-slate-500">
          ลงในใบเสนอราคาเฉพาะตอนที่คุณกดขออนุมัติหรืออนุมัติเอง · เปลี่ยนทีหลังได้ ใบที่เซ็นไปแล้วไม่เปลี่ยนตาม
        </p>
      </div>

      {signature == null && <Skeleton className="h-24 w-64 max-w-full" />}

      {signature && editing == null && (
        // ปุ่มอยู่ใต้ตัวอย่าง ชิดซ้ายแนวเดียวกัน (ผู้ใช้ทัก 18 ต.ค. — เดิมลอยอยู่ขวาล่างของกล่องตัวอย่าง ดูไม่เข้าพวก)
        <div className="flex flex-col items-start gap-3">
          <div className="flex flex-col gap-1.5">
            <SignaturePreview dataUrl={signature.dataUrl} name={user?.fullName ?? ""} />
            <p className="text-xs text-slate-500">
              {signature.dataUrl
                ? "ตัวอย่างท้ายใบเสนอราคา"
                : "ยังไม่ได้ตั้ง — ระหว่างนี้ใบเสนอราคาจะเว้นเส้นว่างไว้ให้เซ็นมือ"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="neutral" onClick={() => setEditing("draw")}>
              <PenLine size={14} /> {signature.dataUrl ? "เปลี่ยนลายเซ็น" : "ตั้งลายเซ็น"}
            </Button>
            {signature.dataUrl && (
              <Button size="sm" variant="dangerQuiet" onClick={remove}>
                ลบลายเซ็น
              </Button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1 border-b border-slate-200">
            {tab("draw", "วาดลายเซ็น", PenLine)}
            {tab("upload", "อัปรูปลายเซ็น", ImageUp)}
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy} className="mb-1 ml-auto">
              ยกเลิก
            </Button>
          </div>
          {editing === "draw" ? <DrawPad onSave={save} busy={busy} /> : <UploadPad onSave={save} busy={busy} />}
        </div>
      )}
    </section>
  );
}
