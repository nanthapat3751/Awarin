import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth-context";
import { ForcePasswordChangePage } from "../pages/ForcePasswordChangePage";
import { AppShellSkeleton } from "./Skeleton";

export function ProtectedRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { user, status, logout } = useAuth();
  const location = useLocation();

  // session ที่สร้างจากการล็อกอินแอปลูกค้า (client-app) ก็ยังเป็น "session ที่ถูกต้อง" ที่นี่
  // เพราะทั้งสองแอปใช้ cookie เดียวกันบน origin ของ API — แต่เป็น role ที่ผิดสำหรับแอปนี้ จึง
  // logout ออกแทนที่จะ render เปลือกฝั่งพนักงานครอบกำแพง 403 ไว้ เพื่อให้การล็อกอินครั้งถัดไป
  // เริ่มต้นแบบสะอาด
  const wrongRole = !!user && user.role !== "OWNER" && user.role !== "ADMIN";
  useEffect(() => {
    if (wrongRole) logout();
  }, [wrongRole, logout]);

  if (status === "loading") {
    return <AppShellSkeleton />;
  }

  if (!user || wrongRole) {
    // จำหน้าที่ตั้งใจเปิดไว้ เข้าสู่ระบบเสร็จ LoginPage พากลับมาที่นี่ (ดู lib/return-to.ts)
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  // รหัสที่ใช้เข้ามาเป็นรหัสที่ผู้ดูแลตั้งให้ — บังคับตั้งใหม่ก่อน แล้ว refresh() ในหน้านั้นจะทำให้
  // ธงหายไปเองและหลุดมาถึง children · ไม่ใช้ <Navigate> ไปอีกเส้นทางเพราะจะทำให้พิมพ์ URL
  // เข้าหน้าอื่นได้ตรง ๆ (เซิร์ฟเวอร์ปิดไว้อยู่แล้ว แต่จะเจอ 403 เปล่า ๆ โดยไม่รู้สาเหตุ)
  if (user.mustChangePassword) {
    return <ForcePasswordChangePage />;
  }

  return <>{children}</>;
}
