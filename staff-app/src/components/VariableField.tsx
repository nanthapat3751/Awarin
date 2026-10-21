import { type FocusEvent, useLayoutEffect, useRef } from "react";

import { ALLOW_BLOCKS_ATTR, NO_VARIABLES_ATTR } from "../lib/text-field";
import type { FieldMode } from "../lib/variable-autocomplete";
import { fieldProblems, segmentVariables, type SegmentKind, type Vocabulary } from "../lib/variable-highlight";
import { contentKeys } from "../lib/content-keys";
import { AutoTextarea } from "./AutoTextarea";

/*
 * ไฮไลต์วาดด้วย ring (box-shadow) ไม่ใช่ padding — padding ดันตัวอักษรในชั้นหลังให้เลื่อนออกจาก
 * ตัวอักษรจริงในช่องพิมพ์ ส่วน box-shadow ขยายพื้นออกไปรอบ ๆ โดยไม่แตะเลย์เอาต์
 * `box-decoration-clone` ให้ตัวแปรที่ถูกตัดข้ามบรรทัดได้พื้นครบทั้งสองท่อน
 */
const MARK: Record<Exclude<SegmentKind, "text">, string> = {
  var: "bg-indigo-50 ring-2 ring-indigo-50",
  block: "bg-indigo-100 ring-2 ring-indigo-100",
  unknown: "bg-red-50 ring-2 ring-red-50 underline decoration-red-500 decoration-wavy underline-offset-4",
  misplaced: "bg-red-50 ring-2 ring-red-50 underline decoration-red-500 decoration-wavy underline-offset-4",
};

/**
 * ช่องบนกระดาษแม่แบบสัญญาที่ไฮไลต์ตัวแปร {{...}} ในตัว
 *
 * **ช่องพิมพ์ยังเป็น textarea/input ตัวเดิม** — ไม่ใช้ contentEditable เพราะมีปัญหากับการพิมพ์
 * ภาษาไทย (สระ/วรรณยุกต์ลอย, undo เพี้ยน) บนเอกสารที่มีผลทางกฎหมาย แทนที่จะวาดสีบนตัวอักษร
 * จึงวางชั้นเงาไว้ "ข้างหลัง" ช่องพิมพ์ที่พื้นใส: ชั้นเงามีข้อความชุดเดียวกัน ตัวอักษรใส
 * แต่ตัวแปรมีพื้นสี — ต้องใช้ฟอนต์ ระยะขอบ ความกว้าง และกฎตัดบรรทัดชุดเดียวกันทุกอย่าง
 * (`textClassName` ใช้ร่วมทั้งสองชั้น) ไม่งั้นพื้นสีจะเลื่อนออกจากคำ
 *
 * ตัวที่พิมพ์ผิด/อยู่ผิดช่องขึ้นแดง + บอกเหตุผลใต้ช่องทันที — เดิมรู้ก็ต่อเมื่อกดบันทึกแล้ว
 */
/** แอตทริบิวต์บอกตัวเติมตัวแปรว่าช่องนี้รับอะไรได้ */
const MODE_ATTRS: Record<FieldMode, Record<string, string>> = {
  varsAndBlocks: { [ALLOW_BLOCKS_ATTR]: "" },
  none: { [NO_VARIABLES_ATTR]: "" },
  vars: {},
};

export function VariableField({
  label,
  multiline,
  mode,
  vocab,
  wrapperClassName = "",
  textClassName,
  value,
  placeholder,
  onChange,
  onFocus,
}: Readonly<{
  /**
   * ชื่อช่อง (aria-label) — ป้ายบนกระดาษเป็นแค่ข้อความเทาเหนือช่อง ไม่ได้ผูกกับช่อง
   * โปรแกรมอ่านหน้าจอเลยไม่รู้ว่าช่องไหนคืออะไร
   */
  label: string;
  multiline: boolean;
  mode: FieldMode;
  vocab: Vocabulary;
  /** เลย์เอาต์ภายนอก (ระยะห่าง/ความกว้าง) — ไม่ใส่เรื่องตัวอักษรที่นี่ */
  wrapperClassName?: string;
  /** ขนาด/น้ำหนัก/ระยะบรรทัด/สีของตัวอักษร — ใช้ร่วมทั้งช่องพิมพ์และชั้นไฮไลต์ */
  textClassName: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onFocus?: (el: HTMLTextAreaElement | HTMLInputElement) => void;
}>) {
  // ยังไม่ได้รายชื่อตัวแปรจากเซิร์ฟเวอร์ = ไม่ไฮไลต์เลย ดีกว่าขึ้นแดงทั้งหน้าชั่ววูบว่าไม่รู้จักสักตัว
  const ready = vocab.variables.length > 0;
  const segments = ready ? segmentVariables(value, vocab, mode) : [{ text: value, kind: "text" as const }];
  const problems = ready ? fieldProblems(segments, vocab, mode) : [];
  const segmentKeys = contentKeys(segments.map((s) => s.text));

  const backdropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ช่องบรรทัดเดียวเลื่อนแนวนอนได้เมื่อข้อความยาวเกินช่อง — ชั้นไฮไลต์ต้องเลื่อนตาม
  const syncScroll = () => {
    if (backdropRef.current && inputRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };
  useLayoutEffect(syncScroll, [value]);

  const attrs = {
    "aria-label": label,
    ...MODE_ATTRS[mode],
  };
  const text = `px-2 py-1 ${textClassName}`;
  const handleFocus = (e: FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => onFocus?.(e.currentTarget);

  return (
    <div className={`-mx-2 ${wrapperClassName}`}>
      <div className="relative rounded transition-colors focus-within:bg-slate-100/70 focus-within:ring-2 focus-within:ring-brand/25 hover:bg-slate-100/70">
        <div
          ref={backdropRef}
          aria-hidden
          className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent ${text} ${
            multiline ? "whitespace-pre-wrap break-words" : "whitespace-pre"
          }`}
        >
          {segments.map((s, i) =>
            s.kind === "text" ? (
              s.text
            ) : (
              <mark key={segmentKeys[i]} className={`box-decoration-clone rounded-sm text-transparent ${MARK[s.kind]}`}>
                {s.text}
              </mark>
            ),
          )}
        </div>
        {multiline ? (
          <AutoTextarea
            className={`relative block w-full bg-transparent focus:outline-none ${text}`}
            value={value}
            placeholder={placeholder}
            onFocus={handleFocus}
            onChange={(e) => onChange(e.target.value)}
            {...attrs}
          />
        ) : (
          <input
            ref={inputRef}
            className={`relative block w-full bg-transparent focus:outline-none ${text}`}
            value={value}
            placeholder={placeholder}
            onFocus={handleFocus}
            onScroll={syncScroll}
            onChange={(e) => onChange(e.target.value)}
            {...attrs}
          />
        )}
      </div>
      {/* กล่อง aria-live อยู่ตลอด — ข้อความที่โผล่ขึ้นในนั้นทีหลังจึงถูกอ่านให้ฟัง */}
      <div aria-live="polite">
        {problems.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5 px-2">
            {problems.map((p) => (
              <li key={p} className="text-xs text-red-600">
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
