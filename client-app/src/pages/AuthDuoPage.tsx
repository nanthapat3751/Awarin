import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { AccountBenefits } from "../components/AccountBenefits";
import { AuthBlade, type AuthMode } from "../components/AuthBlade";
import { AuthShell } from "../components/AuthShell";
import { LoginForm } from "../components/LoginForm";
import { PrivacyNote } from "../components/PrivacyNote";
import { RegisterForm } from "../components/RegisterForm";
import { useAuth } from "../lib/auth-context";
import { usePageMeta } from "../lib/page-meta";
import { returnPathFrom } from "../lib/return-to";

/**
 * หน้าเข้าสู่ระบบและสมัครสมาชิก — การ์ดใบเดียวสองโหมด
 *
 * /login กับ /register ยังเป็นคนละ URL เหมือนเดิม (ลิงก์เก่า บุ๊กมาร์ก และปุ่มในเว็บไม่พัง) แต่
 * ทั้งสองชี้มาที่คอมโพเนนต์ตัวนี้ผ่าน Route แม่ที่ไม่มี path ใน App.tsx — React Router จึงเก็บ
 * การ์ดไว้ตัวเดิมตอนสลับ ทำให้ใบมีดเลื่อนข้ามจริงแทนที่จะกระโดดไปโผล่อีกฝั่ง
 */

// เน้นคำท้ายด้วย "น้ำหนัก + ความทึบ" ไม่ใช่ตัวเอียง
//
// ตัวอักษรไทยบนเครื่องส่วนใหญ่ตกไปที่ฟอนต์ที่ไม่มีหน้าตัวเอียงจริง (บน Windows คือ Tahoma)
// สั่ง italic แล้วเบราว์เซอร์จะ "เอียงปลอม" ด้วยการเฉือนตัวอักษรให้ล้ม ซึ่งทำให้หัวกลมของตัวไทย
// บิดจนดูเหมือนเรนเดอร์ผิด — ภาษาไทยไม่มีธรรมเนียมตัวเอียงอยู่แล้ว การเน้นจึงต้องใช้ทางอื่น
const COPY: Record<AuthMode, { title: ReactNode; subtitle: string }> = {
  login: {
    title: (
      <>
        ยินดีต้อนรับ<span className="font-normal text-white/75">กลับมา</span>
      </>
    ),
    subtitle: "ใบเสนอราคา สัญญา และเอกสารทุกฉบับของคุณ ยังอยู่ที่เดิมทั้งหมด",
  },
  register: {
    title: (
      <>
        เริ่ม<span className="font-normal text-white/75">โครงการแรก</span>
      </>
    ),
    subtitle: "บัญชีเดียว ใช้ติดตามได้ทุกงานที่ทำกับเรา ตั้งแต่ขอราคาจนส่งมอบ",
  },
};

export function AuthDuoPage() {
  const { user, status } = useAuth();
  const { pathname, state } = useLocation();
  usePageMeta(pathname === "/register" ? "สมัครสมาชิก" : "เข้าสู่ระบบ");
  const mode: AuthMode = pathname === "/register" ? "register" : "login";

  // เพิ่งล็อกอินผ่าน — หยุดเด้งออกชั่วคราวเพื่อให้เครื่องหมายถูกได้แสดงก่อนเปลี่ยนหน้า
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const focusedFor = useRef(mode);

  // ใบมีดเลื่อนเป็นภาพล้วน ถ้าไม่ย้ายโฟกัสตามไปด้วย คนที่ใช้คีย์บอร์ดหรือโปรแกรมอ่านหน้าจอจะยัง
  // ค้างอยู่กับฟอร์มเดิมที่ถูกถอดออกไปแล้ว — แต่ตอนเพิ่งเปิดหน้ามาต้องไม่แย่งโฟกัส
  //
  // เทียบ "โหมดที่โฟกัสไปแล้ว" ไม่ใช่ "รันไปกี่รอบแล้ว" — StrictMode รัน effect ซ้ำรอบที่สองตอน
  // dev ถ้าใช้ธงนับรอบ รอบที่สองจะเข้าเงื่อนไขแล้วโฟกัสช่องแรกทันทีที่เปิดหน้า (เจอจริงตอนตรวจ:
  // ช่องอีเมลขึ้นสถานะโฟกัสเองตั้งแต่ยังไม่ได้แตะอะไร)
  useEffect(() => {
    if (focusedFor.current === mode) return;
    focusedFor.current = mode;
    cardRef.current?.querySelector<HTMLInputElement>("form input")?.focus();
  }, [mode]);

  if (status === "ready" && user && !justLoggedIn) {
    return <Navigate to={returnPathFrom(state)} replace />;
  }

  return (
    <AuthShell note={<PrivacyNote />}>
      <div ref={cardRef} className="flex w-full justify-center">
        <AuthBlade
          mode={mode}
          // key=mode ให้แผงนี้ถูกสร้างใหม่ตอนสลับ ข้อความจะได้จางเข้าตามใบมีดแทนที่จะสลับทันที
          aside={
            <div key={mode} className="auth-swap">
              <AccountBenefits title={COPY[mode].title} subtitle={COPY[mode].subtitle} />
            </div>
          }
        >
          {mode === "register" ? (
            <RegisterForm />
          ) : (
            <LoginForm onSuccess={() => setJustLoggedIn(true)} />
          )}
        </AuthBlade>
      </div>
    </AuthShell>
  );
}
