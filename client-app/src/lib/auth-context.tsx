import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AuthenticatedUser } from "@systemboq/shared-types";

import { apiFetch } from "./api";

interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  address?: string;
}

interface AuthContextValue {
  user: AuthenticatedUser | null;
  status: "loading" | "ready";
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  // ตั้งรหัสผ่านผ่านลิงก์เข้าใช้ครั้งเดียว แล้วเข้าระบบทันที (บัญชีที่ทีมงานสร้างให้) — ที่อยู่ไม่บังคับ
  activateAccount: (token: string, password: string, address?: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (currentPassword: string) => Promise<void>;
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
    const res = await apiFetch<{ user: AuthenticatedUser }>("/api/auth/customer/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(res.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await apiFetch("/api/auth/customer/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await login(input.email, input.password);
  }, [login]);

  const activateAccount = useCallback(async (token: string, password: string, address?: string) => {
    const res = await apiFetch<{ user: AuthenticatedUser }>(
      `/api/auth/access/${encodeURIComponent(token)}`,
      { method: "POST", body: JSON.stringify({ password, address }) },
    );
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await apiFetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }, []);

  const deleteAccount = useCallback(async (currentPassword: string) => {
    await apiFetch("/api/auth/delete-account", {
      method: "POST",
      body: JSON.stringify({ currentPassword }),
    });
    setUser(null);
  }, []);

  // ห่อด้วย useMemo — ไม่งั้นทุก component ที่ใช้ useAuth() re-render ตามทุกครั้งที่ AuthProvider render
  const value = useMemo(
    () => ({ user, status, login, register, activateAccount, logout, changePassword, deleteAccount }),
    [user, status, login, register, activateAccount, logout, changePassword, deleteAccount],
  );

  return (
    <AuthContext.Provider value={value}>
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
