/**
 * key ของแถวในรายการที่แก้/ลบ/สลับลำดับได้ (ข้อสัญญา · งวดเงิน · วัสดุย่อย)
 *
 * ใช้ลำดับ (index) เป็น key ไม่ได้ — ลบหรือย้ายแถวกลางรายการแล้ว React จะเอาช่องกรอกของแถวหนึ่ง
 * ไปใช้กับอีกแถว (เคอร์เซอร์/โฟกัส/ประวัติ undo ติดไปผิดข้อ) และแถวเหล่านี้ไม่มี id จากเซิร์ฟเวอร์
 * จึงผูก key ไว้กับตัวออบเจ็กต์ของแถว: ย้าย/ลบ = ออบเจ็กต์เดิม key ตามไปเอง ·
 * แก้ค่าในแถว (สร้างออบเจ็กต์ใหม่) ต้องส่งต่อ key ด้วย sameRowKey ไม่งั้นแถวถูกสร้างใหม่ทุกครั้งที่พิมพ์
 */
const keys = new WeakMap<object, string>();
let seq = 0;

export function rowKey(row: object): string {
  let key = keys.get(row);
  if (!key) {
    seq += 1;
    key = `row-${seq}`;
    keys.set(row, key);
  }
  return key;
}

/** แถวที่แก้ค่าแล้ว (ออบเจ็กต์ใหม่) ใช้ key เดิมของแถวก่อนแก้ */
export function sameRowKey<T extends object>(prev: T, next: T): T {
  const key = keys.get(prev);
  if (key) keys.set(next, key);
  return next;
}
