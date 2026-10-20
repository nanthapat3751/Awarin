import { Suspense, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth-context";
import { PortalPageSkeleton } from "./Skeleton";

/**
 * `skeleton` = โครงร่างของหน้านั้น ใช้ทั้งตอนตรวจการเข้าสู่ระบบ และตอนโหลดไฟล์โค้ดของหน้า
 * — สองช่วงต่อกันจึงเห็นโครงร่างเดียวตลอด ไม่สลับทรงไปมา
 *
 * ต้องมี Suspense ของตัวเองตรงนี้: เดิมหน้าพอร์ทัลไปพึ่ง Suspense ระดับแอป ซึ่ง React ซ่อนโครงร่าง
 * ตอนตรวจ login ทิ้ง (display: none) แล้วจอว่างเปล่าระหว่างรอไฟล์โค้ด — ลูกค้าเห็นหน้าขาวแว้บหนึ่ง
 */
export function ProtectedRoute({
  children,
  skeleton = <PortalPageSkeleton />,
}: Readonly<{ children: ReactNode; skeleton?: ReactNode }>) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return <>{skeleton}</>;
  }

  if (!user) {
    // จำหน้าที่ตั้งใจเปิดไว้ เข้าสู่ระบบเสร็จ LoginForm พากลับมาที่นี่ (ดู lib/return-to.ts)
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Suspense fallback={skeleton}>{children}</Suspense>;
}
