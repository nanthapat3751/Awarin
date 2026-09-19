import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link } from "react-router-dom";

import type { PortfolioDto } from "@systemboq/shared-types";

// ความเร็วเลื่อนอัตโนมัติ (พิกเซลต่อเฟรม ที่ ~60fps) — ช้าพอให้อ่านชื่อผลงานได้ทัน
const AUTO_SPEED = 0.5;
// ระยะลาก (px) ก่อนถือว่าเป็นการ "ลาก" ไม่ใช่ "คลิก" — กันเปิดลิงก์พลาดตอนลาก
const DRAG_THRESHOLD = 5;
// มาสก์ไล่จางที่ขอบซ้าย-ขวา ให้การ์ดค่อย ๆ จางหายแทนตัดขอบแข็ง
const EDGE_FADE =
  "linear-gradient(to right, transparent 0, #000 2rem, #000 calc(100% - 2rem), transparent 100%)";

function CarouselCard({ item }: Readonly<{ item: PortfolioDto }>) {
  const cover = item.images?.[0];
  return (
    <Link
      to={`/portfolio/${item.id}`}
      className="group block w-80 sm:w-96 shrink-0"
      // ป้องกันการลากรูป (ghost image) ระหว่างลากเลื่อน
      draggable={false}
    >
      {/* การ์ดแนวตั้ง (portrait) — สูงเด่นแบบผลงานสถาปัตย์ */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-100 aspect-4/5">
        {cover ? (
          <img
            src={cover}
            alt={item.title}
            draggable={false}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm select-none">
            รูปผลงาน
          </div>
        )}
        {/* แถบไล่เฉดล่างให้ตัวอักษรอ่านออกเมื่อมีรูปจริง */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="absolute top-3 left-3 text-xs font-medium text-white bg-brand/90 rounded-full px-2.5 py-1">
          {item.type === "DESIGN" ? "งานออกแบบ" : "งานก่อสร้าง"}
        </span>
      </div>
      <h3 className="mt-3.5 text-lg font-medium text-slate-800 group-hover:text-brand transition-colors truncate">
        {item.title}
      </h3>
      {item.description && (
        <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>
      )}
    </Link>
  );
}

export function PortfolioCarousel({ items }: Readonly<{ items: PortfolioDto[] }>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // เหตุที่ทำให้หยุดเลื่อนเอง: hover / โฟกัสด้วยคีย์บอร์ด / กำลังลาก — รวมเป็น pausedRef ตัวเดียว
  const hoverRef = useRef(false);
  const focusRef = useRef(false);
  const dragRef = useRef({ active: false, startX: 0, startScroll: 0, moved: false });
  const pausedRef = useRef(false);
  const syncPaused = useCallback(() => {
    pausedRef.current = hoverRef.current || focusRef.current || dragRef.current.active;
  }, []);

  // เลื่อนต่อเนื่องเองด้วย requestAnimationFrame แล้ววนลูปแบบไร้รอยต่อ
  // ด้วยการเรนเดอร์รายการซ้ำสองชุด: พอเลื่อนพ้นชุดแรกก็ลบความกว้างครึ่งหนึ่งออก
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    // เคารพผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหว — ไม่เลื่อนอัตโนมัติ ให้ลาก/ปัดเอง
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const step = () => {
      if (!pausedRef.current) {
        const half = el.scrollWidth / 2;
        if (half > 0) {
          let next = el.scrollLeft + AUTO_SPEED;
          if (next >= half) next -= half;
          el.scrollLeft = next;
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [items]);

  // รักษาให้ scrollLeft อยู่ในช่วงของชุดแรกเสมอ (กันหลุดขอบตอนปัด/ลาก) — ปรับจุดอ้างอิงการลากตามด้วย
  const normalize = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const half = el.scrollWidth / 2;
    if (half <= 0) return;
    if (el.scrollLeft >= half) {
      el.scrollLeft -= half;
      dragRef.current.startScroll -= half;
    } else if (el.scrollLeft < 0) {
      el.scrollLeft += half;
      dragRef.current.startScroll += half;
    }
  }, []);

  // ---- ลากด้วยเมาส์เพื่อเลื่อน (เดสก์ท็อป) — มือถือใช้ปัดเนทีฟอยู่แล้ว ----
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = trackRef.current;
      if (!el) return;
      el.setPointerCapture?.(e.pointerId);
      dragRef.current = {
        active: true,
        startX: e.clientX,
        startScroll: el.scrollLeft,
        moved: false,
      };
      syncPaused();
    },
    [syncPaused],
  );
  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d.active) return;
    const el = trackRef.current;
    if (!el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > DRAG_THRESHOLD) d.moved = true;
    el.scrollLeft = d.startScroll - dx;
  }, []);
  const endDrag = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    syncPaused();
  }, [syncPaused]);
  // ถ้าเพิ่งลาก (ไม่ใช่คลิกนิ่ง) ให้ยกเลิกการเปิดลิงก์ของการ์ด
  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  }, []);

  if (items.length === 0) return null;

  // เรนเดอร์ซ้ำสองชุดเพื่อให้ลูปไร้รอยต่อ (ชุดที่สองเป็นภาพต่อเนื่องของชุดแรก)
  const loopItems = [...items.map((item) => ({ item, copy: "a" })), ...items.map((item) => ({ item, copy: "b" }))];

  return (
    <section
      aria-label="แกลเลอรีผลงานของเรา (เลื่อนอัตโนมัติ — ลากหรือปัดเพื่อดูเพิ่ม)"
      onMouseEnter={() => {
        hoverRef.current = true;
        syncPaused();
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
        endDrag();
        syncPaused();
      }}
      onTouchStart={() => {
        hoverRef.current = true;
        syncPaused();
      }}
      onTouchEnd={() => {
        hoverRef.current = false;
        syncPaused();
      }}
      // หยุดเลื่อนเมื่อผู้ใช้แท็บโฟกัสเข้ามาในแกลเลอรี (เข้าถึงง่ายด้วยคีย์บอร์ด)
      onFocusCapture={() => {
        focusRef.current = true;
        syncPaused();
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          focusRef.current = false;
          syncPaused();
        }
      }}
    >
      <div
        ref={trackRef}
        onScroll={normalize}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        style={{ maskImage: EDGE_FADE, WebkitMaskImage: EDGE_FADE }}
        className="flex gap-5 overflow-x-auto pb-2 cursor-grab select-none active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {loopItems.map(({ item, copy }) => (
          <CarouselCard key={`${item.id}-${copy}`} item={item} />
        ))}
      </div>
    </section>
  );
}
