import type request from "supertest";

type Agent = ReturnType<typeof request.agent>;

/**
 * ยืนยันกับบัญชีทุกรายการรับเงินที่ยังรอยืนยันของสัญญาหนึ่ง (ผ่าน API จริง ด้วยบัญชีเจ้าของ)
 *
 * เทสต์ที่ทดสอบเรื่องอื่น (ใบเสร็จ/พอร์ทัลลูกค้า) ต้องผ่านขั้นนี้ก่อน เพราะออกใบเสร็จได้และลูกค้าเห็นเงิน
 * เฉพาะรายการที่ยืนยันแล้ว — ตัวการยืนยันเองมีเทสต์ของมันที่ payment-verification.test.ts
 */
export async function verifyAllPayments(owner: Agent, contractBase: string) {
  const view = await owner.get(`${contractBase}/payments`);
  if (view.status !== 200) throw new Error(`load payments failed: ${view.status}`);
  for (const inst of view.body.installments as { payments: { id: string; verifiedAt: string | null }[] }[]) {
    for (const pay of inst.payments) {
      if (pay.verifiedAt) continue;
      const res = await owner.post(`${contractBase}/payments/${pay.id}/verify`);
      if (res.status !== 200) throw new Error(`verify failed: ${res.status} ${JSON.stringify(res.body)}`);
    }
  }
}
