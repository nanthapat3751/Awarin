import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../lib/auth-context";

export function ProtectedRoute({ children }: Readonly<{ children: ReactNode }>) {
  const { user, status } = useAuth();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        กำลังโหลด...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
