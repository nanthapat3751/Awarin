import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { reloadForNewVersion } from "./lib/lazy-page.ts";
import { AuthProvider } from "./lib/auth-context.tsx";
import { ConfirmProvider } from "./lib/confirm-context.tsx";
import "./index.css";

// Vite แจ้งตอนโหลดไฟล์ประกอบของหน้า (CSS/โค้ดย่อย) ไม่ได้ — ส่วนใหญ่คือเว็บเพิ่ง deploy เวอร์ชันใหม่
// แล้วไฟล์ชื่อเก่าถูกลบ รีโหลดรับชุดใหม่ (ครั้งเดียว — ดู reloadForNewVersion) · รีโหลดไม่ได้ปล่อยให้
// error ไหลต่อไปที่ ErrorBoundary ขึ้นหน้าแจ้งตามปกติ
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary variant="app">
    <BrowserRouter>
      <AuthProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
