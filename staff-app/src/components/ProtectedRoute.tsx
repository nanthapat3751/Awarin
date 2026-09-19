import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../lib/auth-context";

export function ProtectedRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { user, status, logout } = useAuth();

  // session ที่สร้างจากการล็อกอินแอปลูกค้า (client-app) ก็ยังเป็น "session ที่ถูกต้อง" ที่นี่
  // เพราะทั้งสองแอปใช้ cookie เดียวกันบน origin ของ API — แต่เป็น role ที่ผิดสำหรับแอปนี้ จึง
  // logout ออกแทนที่จะ render เปลือกฝั่งพนักงานครอบกำแพง 403 ไว้ เพื่อให้การล็อกอินครั้งถัดไป
  // เริ่มต้นแบบสะอาด
  const wrongRole = !!user && user.role !== "OWNER" && user.role !== "ADMIN";
  useEffect(() => {
    if (wrongRole) logout();
  }, [wrongRole, logout]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        กำลังโหลด...
      </div>
    );
  }

  if (!user || wrongRole) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
