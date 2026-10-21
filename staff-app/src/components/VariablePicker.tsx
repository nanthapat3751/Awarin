import type { ContractVariableInfo } from "@systemboq/shared-types";
import { TableProperties, TextCursorInput } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { SearchInput } from "./SearchInput";
import { caretRect } from "../lib/caret-position";
import { fieldMode, type TextField, writeField } from "../lib/text-field";
import {
  applyPick,
  buildPickerItems,
  filterPickerItems,
  findOpenToken,
  type OpenToken,
  type PickerItem,
  placementBlocker,
} from "../lib/variable-autocomplete";

type Field = TextField;

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 320;

/**
 * รายการตัวแปรแบ่งกลุ่ม — ใช้ร่วมกันทั้งกล่องที่เด้งตอนพิมพ์ {{ และเมนูของปุ่ม "แทรกตัวแปร"
 *
 * ทุกปุ่มกัน mousedown ไว้ เพื่อไม่ให้โฟกัสหลุดตอนคลิก — ถ้าช่องข้อความเสียโฟกัส ตำแหน่ง
 * เคอร์เซอร์ที่จะแทรกก็หายไปด้วย (ยกเว้นช่องค้นหาในหัวกล่อง ที่ต้องคลิกเข้าไปพิมพ์ได้)
 */
function optionClass(disabled: unknown, active: boolean): string {
  if (disabled) return "cursor-not-allowed opacity-60";
  return active ? "bg-slate-100" : "hover:bg-slate-50";
}

export function VariablePickerList({
  items,
  activeName,
  onPick,
  onHover,
  header,
  footer,
  emptyText = "ไม่มีตัวแปรชื่อนี้ — ตัวแปรที่พิมพ์ผิดจะถูกพิมพ์ออกมาทั้งวงเล็บ",
}: Readonly<{
  items: PickerItem[];
  activeName: string | null;
  onPick: (item: PickerItem) => void;
  onHover?: (name: string) => void;
  /** หัวกล่อง — เมนูของปุ่มใส่ช่องค้นหาไว้ตรงนี้ (ไม่มีคำค้นที่พิมพ์ต่อจาก {{ ในเนื้อความ) */
  header?: ReactNode;
  footer?: string;
  emptyText?: string;
}>) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeName]);

  // กัน mousedown ทั้งกล่อง (ยกเว้นช่องค้นหา) — ฟังที่ตัวกล่องโดยตรง ไม่ผูก onMouseDown บน div ที่ไม่ใช่ปุ่ม
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const keepFocus = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
    };
    box.addEventListener("mousedown", keepFocus);
    return () => box.removeEventListener("mousedown", keepFocus);
  }, []);

  return (
    <div
      ref={boxRef}
      className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-lg"
      style={{ width: POPUP_WIDTH, maxHeight: POPUP_MAX_HEIGHT }}
    >
      {header && <div className="border-b border-slate-100 p-2">{header}</div>}
      <div role="listbox" aria-label="ตัวแปรในแม่แบบสัญญา" className="min-h-0 flex-1 overflow-y-auto py-1">
        {items.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">{emptyText}</p>}
        {items.map((item, i) => {
          const showGroup = i === 0 || items[i - 1].groupLabel !== item.groupLabel;
          const active = item.name === activeName;
          return (
            <div key={item.name}>
              {showGroup && (
                <p className="px-3 pb-0.5 pt-2 text-[11px] font-medium text-slate-400">{item.groupLabel}</p>
              )}
              <button
                ref={active ? activeRef : undefined}
                type="button"
                role="option"
                aria-selected={active}
                aria-disabled={item.disabled != null}
                onClick={() => {
                  if (!item.disabled) onPick(item);
                }}
                onMouseEnter={() => onHover?.(item.name)}
                className={`flex w-full flex-col items-start px-3 py-1.5 text-left ${
                  optionClass(item.disabled, active)
                }`}
              >
                <span
                  className={`flex items-center gap-1 text-sm ${
                    item.group === "block" ? "text-indigo-800" : "text-slate-800"
                  }`}
                >
                  {item.group === "block" && <TableProperties size={13} aria-hidden />}
                  {item.name}
                </span>
                <span
                  className={`max-w-full truncate text-xs ${item.missing ? "text-amber-700" : "text-slate-500"}`}
                >
                  {item.preview}
                </span>
                {/* คำอธิบายรองโชว์เฉพาะตัวที่เลือกอยู่ — ถ้าโชว์ทุกตัว แต่ละรายการกินสามบรรทัด
                    พิมพ์ {{ แล้วเห็นแค่ 4 จาก 18 ตัว ส่วนเหตุผลที่กดไม่ได้ต้องโชว์เสมอ */}
                {(item.disabled ?? (active ? item.note : null)) && (
                  <span className="text-[11px] text-slate-400">{item.disabled ?? item.note}</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
      {footer && <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">{footer}</p>}
    </div>
  );
}

interface OpenState {
  el: Field;
  token: OpenToken;
  caret: number;
  /** พิกัดของกล่อง — เก็บเป็น style เพื่อสลับขึ้นบน/ลงล่างตามที่ว่างของจอ */
  style: CSSProperties;
}

/** วางกล่องใต้บรรทัดที่เคอร์เซอร์อยู่ ถ้าที่ว่างด้านล่างไม่พอให้กลับขึ้นไปอยู่เหนือบรรทัดแทน */
function popupStyle(el: Field, position: number): CSSProperties {
  const caret = caretRect(el, position);
  const left = Math.max(8, Math.min(caret.left, window.innerWidth - POPUP_WIDTH - 8));
  const below = caret.top + caret.height + 4;
  if (below + POPUP_MAX_HEIGHT <= window.innerHeight - 8) {
    return { position: "fixed", top: below, left, zIndex: 50 };
  }
  // ยึดขอบล่างของกล่องไว้เหนือบรรทัด — กล่องสั้นหรือยาวก็ชิดบรรทัดพอดี ไม่เว้นช่องโหว่
  return { position: "fixed", bottom: window.innerHeight - caret.top + 4, left, zIndex: 50 };
}

/**
 * พิมพ์ {{ ในช่องใดก็ได้ภายใน `containerRef` แล้วรายการตัวแปรเด้งขึ้นใต้เคอร์เซอร์
 *
 * ผูก event ที่ตัวครอบครั้งเดียว (ไม่ใช่ทีละช่อง) เพราะข้อสัญญาเพิ่ม/ลบ/สลับที่ได้ตลอด
 * ตัวที่ไม่อยากให้มีตัวช่วยนี้ (เช่น ชื่อแม่แบบที่ใช้ภายใน) แค่อยู่นอกตัวครอบก็พอ
 */
export function VariableAutocomplete({
  containerRef,
  variables,
  blockTokens,
}: {
  containerRef: RefObject<HTMLElement | null>;
  variables: ContractVariableInfo[];
  blockTokens: string[];
}) {
  const [open, setOpen] = useState<OpenState | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  /** กด Esc แล้วอย่าเด้งกลับมาอีกขณะยังพิมพ์ต่อใน {{ อันเดิม */
  const dismissed = useRef<{ el: Field; start: number } | null>(null);

  const items = open
    ? filterPickerItems(buildPickerItems(variables, blockTokens, fieldMode(open.el)), open.token.query)
    : [];
  const selectable = items.filter((i) => !i.disabled);

  // เก็บค่าล่าสุดไว้ใน ref ให้ตัวจับคีย์บอร์ด (ที่ผูกครั้งเดียว) อ่านได้โดยไม่ต้องผูกใหม่ทุกครั้ง
  const live = useRef({ open, activeName, selectable });
  live.current = { open, activeName, selectable };
  const pickRef = useRef<(name: string) => void>(() => undefined);

  // เปิดกล่องใหม่ หรือคำที่พิมพ์เปลี่ยน → แถบเลือกกลับไปตัวแรกที่เลือกได้
  // (ถ้าผูกกับคำที่พิมพ์อย่างเดียว พิมพ์ {{ ครั้งที่สองจะค้างตัวที่เลือกไว้จากรอบก่อน)
  const firstSelectable = selectable[0]?.name ?? null;
  const resetKey = open ? `${open.token.start}|${open.token.query}` : "";
  useEffect(() => {
    setActiveName(firstSelectable);
  }, [resetKey, firstSelectable]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isField = (t: EventTarget | null): t is Field =>
      t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === "text");

    function evaluate(el: Field) {
      // ชื่อบนหน้าปกไม่ถูกแทนค่า — ไม่เสนอตัวแปรเลย (ถ้าพิมพ์ {{ เองจะขึ้นแดงใต้ช่องแทน)
      if (fieldMode(el) === "none") {
        setOpen(null);
        return;
      }
      const caret = el.selectionStart ?? el.value.length;
      if (el.selectionEnd !== caret) {
        setOpen(null);
        return;
      }
      const token = findOpenToken(el.value, caret);
      if (!token) {
        dismissed.current = null;
        setOpen(null);
        return;
      }
      if (dismissed.current?.el === el && dismissed.current.start === token.start) {
        setOpen(null);
        return;
      }
      setOpen({ el, token, caret, style: popupStyle(el, token.start) });
    }

    function pick(name: string) {
      const state = live.current.open;
      if (!state) return;
      const next = applyPick(state.el.value, state.token, state.caret, name);
      setOpen(null);
      writeField(state.el, next.text, next.caret);
    }
    pickRef.current = pick;

    const onInput = (e: Event) => {
      if (isField(e.target)) evaluate(e.target);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const { open: state, activeName: current, selectable: list } = live.current;
      if (!state || e.isComposing) return;
      const index = list.findIndex((i) => i.name === current);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (list.length === 0) return;
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = list[(index + step + list.length) % list.length];
        setActiveName(next.name);
      } else if ((e.key === "Enter" || e.key === "Tab") && current && index !== -1) {
        // ไม่มีตัวที่เลือกได้ = ปล่อยให้ Enter ขึ้นบรรทัดใหม่ตามปกติ ไม่กินปุ่มทิ้งเฉย ๆ
        e.preventDefault();
        pick(current);
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismissed.current = { el: state.el, start: state.token.start };
        setOpen(null);
      }
    };
    // เลื่อนเคอร์เซอร์ด้วยลูกศรซ้ายขวา/คลิก = อาจออกจาก {{ แล้ว ต้องประเมินใหม่
    const onKeyUp = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && isField(e.target)) {
        evaluate(e.target);
      }
    };
    const onClick = (e: Event) => {
      if (isField(e.target)) evaluate(e.target);
    };
    const onFocusOut = () => setOpen(null);
    // จอเลื่อน = เคอร์เซอร์ย้ายตำแหน่งบนจอ กล่องต้องตามไปด้วย
    const onReposition = () => {
      const state = live.current.open;
      if (state) setOpen({ ...state, style: popupStyle(state.el, state.token.start) });
    };

    container.addEventListener("input", onInput);
    container.addEventListener("keydown", onKeyDown, true);
    container.addEventListener("keyup", onKeyUp);
    container.addEventListener("click", onClick);
    container.addEventListener("focusout", onFocusOut);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      container.removeEventListener("input", onInput);
      container.removeEventListener("keydown", onKeyDown, true);
      container.removeEventListener("keyup", onKeyUp);
      container.removeEventListener("click", onClick);
      container.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [containerRef]);

  if (!open) return null;
  return createPortal(
    <div style={open.style}>
      <VariablePickerList
        items={items}
        activeName={activeName}
        onPick={(item) => pickRef.current(item.name)}
        onHover={(name) => {
          if (selectable.some((i) => i.name === name)) setActiveName(name);
        }}
        footer="↑↓ เลือก · Enter แทรก · Esc ปิด"
      />
    </div>,
    document.body,
  );
}

/** ตัวครอบปุ่มเมนู — คลิกปุ่มนี้ตอนกำลังวาง = ยกเลิก (ปุ่มจัดการเอง ตัววางไม่ต้องยกเลิกซ้ำ) */
const MENU_ATTR = "data-variable-menu";

/**
 * ปุ่ม "แทรกตัวแปร" บนแถบหัว — แบบ "เลือกก่อน แล้วคลิกวาง" (DocuSign / PandaDoc)
 * กดปุ่ม → เลือกตัวแปร → ป้ายติดเมาส์ไป → คลิกตรงไหนในเนื้อสัญญา ตัวแปรลงตรงนั้น (ดู VariablePlacer)
 *
 * ที่มา: ทุกแบบก่อนหน้าให้คลิกในเนื้อสัญญา "เตรียมไว้ก่อน" แล้วค่อยกดปุ่ม ผู้ใช้บอกว่าใช้ยาก —
 * ลืมคลิกก็กดไม่ได้ และลำดับกลับด้านจากที่คนคิด ("อะไร" แล้วค่อย "ที่ไหน") · เคยลองมาแล้วและถูกปฏิเสธ:
 * เมนูกางลงที่ทับจุดที่คลิกไว้ · แผงข้างกระดาษ (กระดาษแคบ แผงค้างจอ) · กล่องที่เด้งตรงเคอร์เซอร์
 * รายการในเมนูนี้ไม่ทับอะไรที่ต้องเห็น เพราะตอนเลือกยังไม่ได้เลือกที่วาง และมันหายทันทีที่เลือก
 */
export function VariableMenuButton({
  variables,
  blockTokens,
  placing,
  onChoose,
  onCancelPlacing,
  className,
}: Readonly<{
  variables: ContractVariableInfo[];
  blockTokens: string[];
  /** ตัวแปรที่เลือกไว้และกำลังรอคลิกวาง — กดปุ่มซ้ำ = ยกเลิก */
  placing: string | null;
  onChoose: (name: string) => void;
  onCancelPlacing: () => void;
  className: string;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeName, setActiveName] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ยังไม่รู้ว่าจะวางช่องไหน จึงเลือกได้ทุกตัว — ช่องที่วางไม่ได้ค่อยบอกตอนชี้ (ป้ายติดเมาส์)
  const items = filterPickerItems(buildPickerItems(variables, blockTokens, "varsAndBlocks"), query.trim());
  const firstName = items[0]?.name ?? null;
  useEffect(() => {
    setActiveName(firstName);
  }, [query, firstName, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (name: string) => {
    close();
    onChoose(name);
  };
  const move = (step: number) => {
    if (items.length === 0) return;
    const index = items.findIndex((i) => i.name === activeName);
    setActiveName(items[(index + step + items.length) % items.length].name);
  };

  return (
    <div ref={wrapRef} className="relative" {...{ [MENU_ATTR]: "" }}>
      <button
        type="button"
        aria-expanded={open || placing !== null}
        aria-haspopup="listbox"
        onClick={() => {
          if (placing) onCancelPlacing();
          else if (open) close();
          else setOpen(true);
        }}
        className={className}
      >
        {/* ช่องข้อความ + เคอร์เซอร์ = ใส่ลงในข้อความ (ของเดิม "{ }" เป็นภาษาโปรแกรมเมอร์) */}
        <TextCursorInput size={14} aria-hidden />
        แทรกตัวแปร
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2">
          <VariablePickerList
            items={items}
            activeName={activeName}
            onHover={setActiveName}
            onPick={(item) => choose(item.name)}
            header={
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="ค้นหา เช่น ที่อยู่ · ลูกค้า"
                autoFocus
                // โฟกัสอยู่ที่ช่องค้นหาตลอด (คลิกรายการไม่ขโมยโฟกัส) คีย์ลัดของเมนูจึงรับที่ช่องนี้
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    move(e.key === "ArrowDown" ? 1 : -1);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (activeName) choose(activeName);
                  } else if (e.key === "Escape") {
                    // กันไม่ให้ Esc ในช่อง type="search" แค่ล้างคำค้น — ต้องปิดเมนู
                    e.preventDefault();
                    close();
                  }
                }}
              />
            }
            emptyText="ไม่มีตัวแปรที่ตรงกับคำค้น"
            footer="เลือกแล้วคลิกตรงที่จะวางในเนื้อสัญญา · ทางลัด: พิมพ์ {{ ในเนื้อสัญญาได้เลย"
          />
        </div>
      )}
    </div>
  );
}

/**
 * โหมดวางตัวแปร — ป้ายตัวแปรติดเมาส์ไป คลิกตรงไหนในเนื้อสัญญา ตัวแปรลงตรงนั้นพอดี
 *
 * ใช้การคลิกของเบราว์เซอร์เองวางเคอร์เซอร์ (คลิกในช่อง = เคอร์เซอร์ไปอยู่ตรงที่คลิก) แล้วค่อยแทรก
 * ตรงนั้นตอน click — ไม่ต้องคำนวณเองว่าเมาส์อยู่ตรงตัวอักษรไหน (ภาษาไทยมีสระบน/ล่าง คำนวณเองพลาดง่าย)
 * คลิกพลาดไปโดนที่ว่างบนกระดาษ = ยังอยู่ในโหมดวาง · คลิกนอกกระดาษ (แท็บ/บันทึก/เมนู) = ยกเลิก
 * แล้วปล่อยให้คลิกนั้นทำงานตามปกติ · Esc = ยกเลิก
 */
export function VariablePlacer({
  containerRef,
  name,
  blockTokens,
  onDone,
}: {
  containerRef: RefObject<HTMLElement | null>;
  name: string;
  blockTokens: string[];
  onDone: () => void;
}) {
  const chipRef = useRef<HTMLDivElement>(null);
  /** เหตุผลที่ช่องใต้เมาส์วางไม่ได้ — null = วางได้/ไม่ได้ชี้ช่องไหน */
  const [blocked, setBlocked] = useState<string | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isBlock = blockTokens.includes(name);
    // ช่องที่วางไม่ได้ เมาส์เป็นเครื่องหมายห้าม (กฎอยู่ใน index.css)
    container.dataset.placing = isBlock ? "block" : "var";

    const fieldAt = (t: EventTarget | null): Field | null => {
      if (!(t instanceof Element) || !container.contains(t)) return null;
      return t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === "text") ? t : null;
    };
    const blockerOf = (f: Field) => placementBlocker(name, blockTokens, fieldMode(f));

    const onMove = (e: MouseEvent) => {
      const chip = chipRef.current;
      if (chip) {
        // ขยับด้วย transform ตรง ๆ ไม่ผ่าน state — ไม่ต้องวาดทั้งกล่องใหม่ทุกครั้งที่เมาส์ขยับ
        chip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 18}px)`;
        chip.style.opacity = "1";
      }
      const f = fieldAt(e.target);
      setBlocked(f ? blockerOf(f) : null);
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const f = fieldAt(e.target);
      if (f) {
        // ช่องที่วางไม่ได้: ไม่ให้โฟกัส/วางเคอร์เซอร์ ป้ายบอกเหตุผลอยู่แล้ว
        if (blockerOf(f)) e.preventDefault();
        return;
      }
      if (e.target instanceof Node && container.contains(e.target)) {
        e.preventDefault();
        return;
      }
      if (e.target instanceof Element && e.target.closest(`[${MENU_ATTR}]`)) return;
      doneRef.current();
    };
    const onClick = (e: MouseEvent) => {
      const f = fieldAt(e.target);
      if (!f || blockerOf(f)) return;
      const start = f.selectionStart ?? f.value.length;
      const end = f.selectionEnd ?? start;
      const token = `{{${name}}}`;
      writeField(f, f.value.slice(0, start) + token + f.value.slice(end), start + token.length);
      doneRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      doneRef.current();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      delete container.dataset.placing;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [containerRef, name, blockTokens]);

  return createPortal(
    <>
      {/* ป้ายซ่อนไว้จนเมาส์ขยับครั้งแรก — ก่อนหน้านั้นยังไม่รู้ว่าเมาส์อยู่ตรงไหน */}
      <div
        ref={chipRef}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-50 flex flex-col items-start gap-1 opacity-0"
      >
        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-sm text-indigo-800 shadow-sm ring-1 ring-indigo-200">
          {`{{${name}}}`}
        </span>
        <span
          className={`rounded-md bg-white px-2 py-0.5 text-[11px] shadow-sm ring-1 ${
            blocked ? "text-amber-700 ring-amber-200" : "text-slate-500 ring-slate-200"
          }`}
        >
          {blocked ?? "คลิกตรงที่จะวาง · Esc ยกเลิก"}
        </span>
      </div>
      <p aria-live="polite" className="sr-only">
        {`เลือก {{${name}}} แล้ว คลิกตรงที่จะวางในเนื้อสัญญา กด Esc เพื่อยกเลิก`}
      </p>
    </>,
    document.body,
  );
}
