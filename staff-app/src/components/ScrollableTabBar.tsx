import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * แถบแท็บที่เลื่อนแนวนอนได้โดยไม่มีแถบเลื่อน — ใช้ร่วมกันในหน้าแม่แบบ · BOQ ของโครงการ · หมวดงาน
 *
 * ทำไมไม่ซ่อนแถบเลื่อนเฉย ๆ: ล้อเมาส์ธรรมดาบน Windows เลื่อนได้แค่ขึ้น/ลง ถ้าไม่มีแถบเลื่อนก็ไม่มีทาง
 * ไปถึงแท็บที่ล้นเลย จึงมีปุ่ม ‹ › ที่ขอบแทน ปุ่มโผล่เฉพาะด้านที่ยังมีแท็บซ่อนอยู่ และขอบจางใต้ปุ่ม
 * บอกว่ามีต่อ · แท็บพอดีจอ = ไม่มีปุ่ม ไม่มีขอบจาง หน้าตาเหมือนแถบธรรมดา
 *
 * className = ตำแหน่ง/ความสูงของทั้งแถบ (sticky, top-*, h-*, margin) · พื้น bg-slate-50 ตายตัว
 * เพราะขอบจางต้องไล่จากสีเดียวกับพื้นแถบ
 */
export function ScrollableTabBar({
  id,
  ariaLabel,
  className = "",
  selectedKey,
  end,
  children,
}: {
  id: string;
  ariaLabel: string;
  className?: string;
  /** เปลี่ยนเมื่อแท็บที่เลือกเปลี่ยน — แถบจะเลื่อนให้แท็บนั้นอยู่ในจอ */
  selectedKey: string | null;
  /** ของที่ติดปลายขวาของแถบ ไม่เลื่อนไปกับแท็บ (เช่น ปุ่มยุบ/กางทั้งหมด) — ลูกศร › อยู่ก่อนหน้ามัน */
  end?: ReactNode;
  children: ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const firstReveal = useRef(true);

  const update = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    // ปัด 1px — ซูมเบราว์เซอร์ทำให้ scrollLeft เป็นทศนิยม เลื่อนสุดแล้วปุ่มยังค้างอยู่
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    // จำนวนแท็บ/ตัวเลขนับเปลี่ยน หรือจอหด ก็ทำให้ล้น/ไม่ล้นได้ — ดูทั้งกล่องและเนื้อใน
    const ro = new ResizeObserver(update);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [update, children]);

  // แท็บที่เลือกต้องอยู่ในจอเสมอ (เปิดลิงก์ ?cat=F มาตรง ๆ หรือกดปุ่มหมวดถัดไปท้ายตาราง)
  // ใช้ scrollTo ของแถบเอง ไม่ใช้ scrollIntoView — ตัวนั้นเลื่อนทั้งหน้าในแนวตั้งด้วย
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab) return;
    const pad = 40; // กันไม่ให้แท็บไปจมอยู่ใต้ปุ่มลูกศร
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    let target: number | null = null;
    if (left - pad < el.scrollLeft) target = Math.max(0, left - pad);
    else if (right + pad > el.scrollLeft + el.clientWidth) target = right + pad - el.clientWidth;
    if (target != null) {
      el.scrollTo({ left: target, behavior: firstReveal.current ? "auto" : smoothBehavior() });
    }
    firstReveal.current = false;
  }, [selectedKey]);

  function step(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.6), behavior: smoothBehavior() });
  }

  const arrow =
    "absolute top-0 bottom-px z-10 flex items-center from-slate-50 from-55% to-transparent text-slate-500 hover:text-slate-900";
  const arrowButton =
    "flex size-7 items-center justify-center rounded-md hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-brand";

  return (
    <div id={id} className={`flex ${className}`}>
      <div className="relative h-full min-w-0 flex-1">
        <div
          ref={scrollerRef}
          role="tablist"
          aria-label={ariaLabel}
          className="relative flex h-full items-stretch gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
        {/* ปุ่มไม่อยู่ในลำดับ Tab — คนใช้คีย์บอร์ดกด Tab ผ่านแท็บทีละอันได้อยู่แล้ว และเบราว์เซอร์
            เลื่อนแท็บที่โฟกัสเข้าจอให้เอง ปุ่มนี้มีไว้สำหรับเมาส์ */}
        {canLeft && (
          <div className={`${arrow} left-0 bg-linear-to-r pr-6`}>
            <button type="button" tabIndex={-1} aria-label="เลื่อนแท็บไปทางซ้าย" onClick={() => step(-1)} className={arrowButton}>
              <ChevronLeft size={16} />
            </button>
          </div>
        )}
        {canRight && (
          <div className={`${arrow} right-0 bg-linear-to-l pl-6`}>
            <button type="button" tabIndex={-1} aria-label="เลื่อนแท็บไปทางขวา" onClick={() => step(1)} className={arrowButton}>
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      {end && (
        <div className="flex h-full shrink-0 items-center border-b border-slate-200 bg-slate-50 pl-2">{end}</div>
      )}
    </div>
  );
}

function smoothBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
