import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AuthenticatedUser } from "@systemboq/shared-types";

import { apiFetch } from "./api";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  status: "loading" | "ready";
  // คืน twoFactorRequired=true เมื่อผ่านรหัสผ่านแล้วแต่ต้องกรอกรหัส 2FA ต่อในขั้นที่สอง
  login: (email: string, password: string) => Promise<{ twoFactorRequired: boolean }>;
  // ยืนยันรหัส 2FA สำเร็จ → คืน user แต่ "ยังไม่" ตั้งเข้า context (กัน redirect เด้งทันที) ให้หน้า
  // login โชว์สถานะ "สำเร็จ" ก่อน แล้วค่อยเรียก commitUser ตอนพร้อมพาเข้าระบบ
  verifyTwoFactor: (code: string) => Promise<AuthenticatedUser>;
  // ตั้ง user ที่ได้จาก verifyTwoFactor เข้า context (จังหวะที่ผู้เรียกเลือกเอง)
  commitUser: (user: AuthenticatedUser) => void;
  // ดึงข้อมูลผู้ใช้ล่าสุดจาก /me ใหม่ (เช่น หลังเปิด/ปิด 2FA เพื่อให้ป้ายสถานะในเมนูอัปเดต)
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    apiFetch<{ user: AuthenticatedUser }>("/api/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setStatus("ready"));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ user?: AuthenticatedUser; twoFactorRequired?: boolean }>(
      "/api/auth/staff/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    if (res.twoFactorRequired) {
      return { twoFactorRequired: true };
    }
    setUser(res.user ?? null);
    return { twoFactorRequired: false };
  }, []);

  const verifyTwoFactor = useCallback(async (code: string) => {
    const res = await apiFetch<{ user: AuthenticatedUser }>("/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    // ไม่ setUser ที่นี่ — ถ้าตั้งทันที guard <Navigate> ในหน้า login จะเด้งออกก่อนโชว์ "สำเร็จ"
    return res.user;
  }, []);

  const commitUser = useCallback((u: AuthenticatedUser) => setUser(u), []);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: AuthenticatedUser }>("/api/auth/me");
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  // ห่อด้วย useMemo — ไม่งั้นทุก component ที่ใช้ useAuth() re-render ตามทุกครั้งที่ AuthProvider render
  const value = useMemo(
    () => ({ user, status, login, verifyTwoFactor, commitUser, refresh, logout }),
    [user, status, login, verifyTwoFactor, commitUser, refresh, logout],
  );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError } from "./api";
