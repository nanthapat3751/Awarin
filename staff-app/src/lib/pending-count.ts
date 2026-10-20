import { useEffect, useSyncExternalStore } from "react";

import { getPendingWork } from "./dashboard-api";
import { buildPendingItems, type PendingItem } from "./pending-items";

// ตัวเลขบนเมนูซ้าย ("งานที่รอดำเนินการ") — นับเฉพาะเรื่องที่ต้องลงมือตอนนี้ (เร่ง + ควรทำวันนี้)
// ระดับ "ติดตาม" ยังอยู่ในหน้า แต่ไม่ขึ้นเป็นตัวเลข: เดิมนับทุกงาน ตัวเลขจึงค้างตลอดแม้เปิดดูแล้ว
// (ผู้ใช้เข้าใจว่าเป็นแจ้งเตือนที่อ่านแล้วต้องหาย) ทั้งที่งานติดตามรอได้ · มีเรื่องเร่ง = ตัวเลขสีแดง
//
// ใช้เกณฑ์ระดับเดียวกับหน้างานค้าง (lib/pending-items.ts) จึงคิดฝั่งนี้ ไม่ให้เซิร์ฟเวอร์คิดซ้ำอีกชุด
// ที่เก็บกลางเพราะแต่ละหน้า mount Layout ของตัวเอง · ขอใหม่เมื่อค่าเก่ากว่า 60 วิ ·
// หน้างานค้างส่งค่าที่มันคำนวณได้มาให้ตรง ๆ (setPendingBadge) ตัวเลขสองที่จึงตรงกันเสมอ
const MAX_AGE_MS = 60_000;
// เปลี่ยนหน้า = เพิ่งทำอะไรเสร็จมามักจะเป็นตอนนี้ (เปลี่ยนสถานะคำขอ, ส่งใบเสนอราคา) — ขอใหม่ถ้าเก่ากว่า 5 วิ
// ตัวเลขจึงลดลงแทบทันทีที่ทำงานเสร็จ ไม่ต้องรอรอบ 60 วิ
const ON_NAVIGATE_MAX_AGE_MS = 5_000;

export interface PendingBadge {
  /** จำนวนเรื่องที่ต้องทำตอนนี้ (เร่ง + ควรทำวันนี้) */
  count: number;
  /** ในนั้นเป็นเรื่องเร่งกี่เรื่อง */
  urgent: number;
}

let badge: PendingBadge | null = null;
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function setPendingBadge(items: PendingItem[]): void {
  fetchedAt = Date.now();
  const urgent = items.filter((it) => it.level === "urgent").length;
  const count = urgent + items.filter((it) => it.level === "soon").length;
  if (badge && badge.count === count && badge.urgent === urgent) return;
  badge = { count, urgent };
  listeners.forEach((l) => l());
}

function refreshIfStale(maxAge = MAX_AGE_MS): void {
  if (inFlight || Date.now() - fetchedAt < maxAge) return;
  inFlight = getPendingWork()
    .then((res) => setPendingBadge(buildPendingItems(res.pendingWork)))
    .catch(() => {
      // เงียบไว้ — ตัวเลขบนเมนูเป็นของเสริม
      fetchedAt = Date.now();
    })
    .finally(() => {
      inFlight = null;
    });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** null = ยังไม่รู้/ดูไม่ได้ (ไม่แสดงตัวเลข) */
export function usePendingBadge(enabled: boolean): PendingBadge | null {
  const value = useSyncExternalStore(subscribe, () => badge, () => null);
  useEffect(() => {
    if (!enabled) return;
    refreshIfStale(ON_NAVIGATE_MAX_AGE_MS);
    const timer = setInterval(() => refreshIfStale(), MAX_AGE_MS);
    return () => clearInterval(timer);
  }, [enabled]);
  return enabled ? value : null;
}
