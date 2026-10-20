import { useSyncExternalStore } from "react";

// หน้าแรกกำลังรอรูป hero อยู่ไหม — แถบเมนูต้องรู้ เพราะระหว่างรอ hero เป็นพื้นขาว (แสงวิ่งสีอ่อนแบบ
// ส่วนอื่นของเว็บ) แถบเมนูโหมดกระจกโปร่งที่ตัวอักษรขาวจะกลืนหายไปกับพื้น จึงต้องเป็นแถบขาวทึบก่อน
// แล้วค่อยเปลี่ยนเป็นกระจกเมื่อรูปขึ้น (NavBar กับ HomePage อยู่คนละกิ่งของต้นไม้ จึงใช้ที่เก็บค่ากลาง)
let loading = false;
const listeners = new Set<() => void>();

export function setHeroLoading(next: boolean): void {
  if (loading === next) return;
  loading = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHeroLoading(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => loading,
    () => false,
  );
}
