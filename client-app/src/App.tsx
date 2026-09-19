import { useEffect } from "react";
import { Route, Routes, useLocation, useMatch } from "react-router-dom";

import { Footer } from "./components/Footer";
import { NavBar } from "./components/NavBar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ActivatePage } from "./pages/ActivatePage";
import { ContactPage } from "./pages/ContactPage";
import { DocumentPdfPage } from "./pages/DocumentPdfPage";
import { HomePage } from "./pages/HomePage";
import { HouseDesignDetailPage } from "./pages/HouseDesignDetailPage";
import { HouseDesignsPage } from "./pages/HouseDesignsPage";
import { LoginPage } from "./pages/LoginPage";
import { MyAccountPage } from "./pages/MyAccountPage";
import { MyContractsPage } from "./pages/MyContractsPage";
import { MyNotificationsPage } from "./pages/MyNotificationsPage";
import { MyQuoteDetailPage } from "./pages/MyQuoteDetailPage";
import { MyQuotesPage } from "./pages/MyQuotesPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PortfolioDetailPage } from "./pages/PortfolioDetailPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ServicesPage } from "./pages/ServicesPage";

/**
 * จัดตำแหน่งการเลื่อนหน้าจอเมื่อเปลี่ยนเส้นทาง — react-router ไม่ทำให้ทั้งสองกรณี
 *
 * 1. ไม่มี #  → ดีดขึ้นบนสุด. ของเดิมไม่ทำ ทำให้กดลิงก์ฟุตเตอร์จากท้ายหน้าแล้วไปโผล่กลางหน้าใหม่
 *    (วัดได้: กด "ผลงาน" ตอนอยู่ที่ 2575px แล้วไปโผล่ที่ 326px ของหน้าผลงาน เหมือนหน้าเสีย)
 * 2. มี #    → เลื่อนไปยังส่วนนั้น. เบราว์เซอร์ทำเองไม่ได้แม้จะเปิด URL พร้อม # ตรง ๆ เพราะตอนมัน
 *    มองหา element นั้น React ยังเรนเดอร์ไม่เสร็จ (วัดได้: เปิด /services#construction แล้ว
 *    scrollY=0 ทั้งที่ส่วนนั้นอยู่ห่างลงไป 2173px) จึงต้องหาซ้ำเป็นช่วง ๆ จนกว่าจะเจอ
 *
 * ระยะเว้นหัวข้อไม่ให้ถูกแถบเมนู fixed บังใช้ scroll-mt-* ที่ตัว section เอง — scrollIntoView
 * เคารพค่านั้นให้อยู่แล้ว จึงไม่ต้องคำนวณ --nav-h ซ้ำที่นี่
 */
function ScrollOnNavigate() {
  const { pathname, hash, key } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const id = decodeURIComponent(hash.slice(1));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let tries = 0;
    let timer = 0;

    const seek = () => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        return;
      }
      // เผื่อเนื้อหาโหลดช้า ลองหาซ้ำได้ราว 1 วินาที แล้วเลิก (ไม่ดีดขึ้นบนสุด เดี๋ยวหน้ากระตุก)
      if (tries++ < 20) timer = window.setTimeout(seek, 50);
    };
    seek();

    return () => window.clearTimeout(timer);
  }, [pathname, hash, key]);

  return null;
}

function App() {
  const location = useLocation();
  // หน้าแรกมี hero แบบเต็มจอที่ nav แบบ fixed ซ้อนทับอยู่; ทุกหน้าที่เหลือต้องมี padding ด้านบน
  // เพื่อไม่ให้เนื้อหาถูกบังหลังแถบ fixed — ใช้ --nav-h ที่ NavBar วัดความสูงจริงมาให้
  // (เดิมฮาร์ดโค้ด pt-18.25 = 73px ทั้งที่แถบสูง 89px → เนื้อหาถูกบังไป 16px ทุกหน้า)
  const overlayHero = location.pathname === "/";

  // หน้าดูเอกสาร PDF เป็นแท็บสำหรับอ่านไฟล์อย่างเดียว จึงตัดเปลือกเว็บ (แถบเมนู + ฟุตเตอร์) ออก
  // ไม่งั้น iframe เต็มจอจะไปชนกับ padding ของแถบ fixed แล้วฟุตเตอร์จะห้อยอยู่ใต้เอกสารแบบไม่มีเหตุผล
  // ต้องเรียก useMatch ทั้งสองตัวเสมอ ห้ามให้ ?? มาลัดวงจรตัวหลัง — ไม่งั้นจำนวน hook ของ App
  // เปลี่ยนไปตามเส้นทาง แล้ว React จะพังตอนกด "ย้อนกลับ" ออกจากหน้าดูเอกสาร
  const quoteDocView = useMatch("/my/quotes/:docId/pdf");
  const contractDocView = useMatch("/my/contracts/:docId/pdf");
  const isDocumentView = Boolean(quoteDocView ?? contractDocView);
  const navPadding = overlayHero ? "" : "pt-[var(--nav-h)]";

  return (
    <div className={isDocumentView ? "" : "min-h-screen bg-white flex flex-col"}>
      <ScrollOnNavigate />
      {!isDocumentView && <NavBar overlayHero={overlayHero} />}
      <main className={isDocumentView ? "" : `flex-1 ${navPadding}`}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/activate/:token" element={<ActivatePage />} />
        <Route path="/house-designs" element={<HouseDesignsPage />} />
        <Route path="/house-designs/:id" element={<HouseDesignDetailPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/portfolio/:id" element={<PortfolioDetailPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route
          path="/my/requests"
          element={
            <ProtectedRoute>
              <MyRequestsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/quotes"
          element={
            <ProtectedRoute>
              <MyQuotesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/quotes/:id"
          element={
            <ProtectedRoute>
              <MyQuoteDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/contracts"
          element={
            <ProtectedRoute>
              <MyContractsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/account"
          element={
            <ProtectedRoute>
              <MyAccountPage />
            </ProtectedRoute>
          }
        />
        {/* เข้าจากปุ่ม "ดูทั้งหมด" ในแผงกระดิ่ง — ไม่ใส่ในแถบเมนูเพราะกระดิ่งเป็นทางเข้าหลักอยู่แล้ว */}
        <Route
          path="/my/notifications"
          element={
            <ProtectedRoute>
              <MyNotificationsPage />
            </ProtectedRoute>
          }
        />
        {/* หน้าดูเอกสาร PDF — เปิดจากปุ่มด้วย target="_blank" (ดู lib/document-pdf.ts) */}
        <Route
          path="/my/quotes/:docId/pdf"
          element={
            <ProtectedRoute>
              <DocumentPdfPage kind="quote" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/contracts/:docId/pdf"
          element={
            <ProtectedRoute>
              <DocumentPdfPage kind="contract" />
            </ProtectedRoute>
          }
        />
        {/* ตัวรับท้าย — ต้องอยู่ล่างสุดเสมอ ไม่มีตัวนี้ URL ที่พิมพ์ผิดจะได้แถบเมนู + ฟุตเตอร์
            แต่ตรงกลางว่างเปล่า ดูเหมือนหน้าโหลดค้าง */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </main>
      {!isDocumentView && <Footer />}
    </div>
  );
}

export default App;
