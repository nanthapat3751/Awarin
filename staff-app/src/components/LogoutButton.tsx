import { Power } from "lucide-react";

import { Tooltip } from "./Tooltip";
import { useAuth } from "../lib/auth-context";
import { useConfirm } from "../lib/confirm-context";

/**
 * ปุ่มออกจากระบบบนแถบบนขวา — วงกลมคู่กับกระดิ่ง ใช้ไอคอนปุ่มเปิด-ปิด (⏻)
 *
 * ทำไมย้ายมาไว้ตรงนี้: ของเดิมซ่อนอยู่ในกล่องผู้ใช้ท้ายเมนูข้าง ต้องกดที่ชื่อก่อนเมนูถึงเด้งขึ้นมา
 * ผู้ใช้หาไม่เจอ มุมขวาบนเป็นที่ที่คนคุ้นว่าจะเจอเรื่องบัญชี/ออกจากระบบ
 *
 * **ถามยืนยันก่อนเสมอ** เพราะบัญชีพนักงานเปิดการยืนยัน 2 ชั้นได้ — เผลอกดทีต้องล็อกอินใหม่
 * พร้อมกรอกรหัสจากแอป Authenticator ซึ่งแพงเกินกว่าจะปล่อยให้พลาดได้ด้วยคลิกเดียว
 *
 * รูปทรง/ขนาด/สีพื้นตรงกับปุ่มกระดิ่งเป๊ะ (p-2 · rounded-full · bg-slate-100 · ไอคอน 20px)
 * ต่างกันแค่ตอนชี้ที่กลายเป็นโทนแดง เพื่อบอกว่าเป็นการกระทำที่พาออกจากงานที่ทำค้างอยู่
 */
export function LogoutButton() {
  const { logout } = useAuth();
  const confirm = useConfirm();

  async function handleLogout() {
    const ok = await confirm("ออกจากระบบตอนนี้หรือไม่? งานที่ยังไม่ได้บันทึกจะหายไป", {
      confirmLabel: "ออกจากระบบ",
      cancelLabel: "ทำงานต่อ",
      variant: "danger",
    });
    if (ok) void logout();
  }

  // ชิดขอบขวาของแถบบน — ป้ายชิดขวาไม่ให้ยื่นพ้นจอ
  return (
    <Tooltip label="ออกจากระบบ" align="end">
      <button
        type="button"
        onClick={() => void handleLogout()}
        aria-label="ออกจากระบบ"
        className="rounded-full border border-slate-200 bg-slate-100 p-2 text-slate-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
      >
        <Power size={20} aria-hidden />
      </button>
    </Tooltip>
  );
}
