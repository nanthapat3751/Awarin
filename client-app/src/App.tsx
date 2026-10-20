import { Suspense, useEffect } from "react";
import { Route, Routes, useLocation, useMatch } from "react-router-dom";

import { Footer } from "./components/Footer";
import { NavBar } from "./components/NavBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProtectedRoute } from "./components/ProtectedRoute";
import {
  AboutPageSkeleton,
  AccountPageSkeleton,
  CardListPageSkeleton,
  HouseDesignDetailSkeleton,
  PdfPaperSkeleton,
  PortalPageSkeleton,
  PortfolioDetailSkeleton,
  ServicesPageSkeleton,
  ContactPageSkeleton,
  RouteSkeleton,
} from "./components/Skeleton";
import { lazyPage } from "./lib/lazy-page";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

// หน้าแรก (คนเข้ามากสุด) กับหน้า 404 (เล็กมาก) โหลดมาพร้อมกัน — หน้าอื่นโหลดโค้ดของตัวเองตอนเข้าไปใช้
// คนเปิดหน้าแรกจึงไม่ต้องโหลดโค้ดพอร์ทัล / หน้า PDF / ฟอร์มสมัครไปด้วย (ดู lib/lazy-page.ts)
const AboutPage = lazyPage(() => import("./pages/AboutPage"), "AboutPage");
const ActivatePage = lazyPage(() => import("./pages/ActivatePage"), "ActivatePage");
const ContactPage = lazyPage(() => import("./pages/ContactPage"), "ContactPage");
const DocumentPdfPage = lazyPage(() => import("./pages/DocumentPdfPage"), "DocumentPdfPage");
const HouseDesignDetailPage = lazyPage(() => import("./pages/HouseDesignDetailPage"), "HouseDesignDetailPage");
const HouseDesignsPage = lazyPage(() => import("./pages/HouseDesignsPage"), "HouseDesignsPage");
const AuthDuoPage = lazyPage(() => import("./pages/AuthDuoPage"), "AuthDuoPage");
const ForgotPasswordPage = lazyPage(() => import("./pages/ForgotPasswordPage"), "ForgotPasswordPage");
const ResetPasswordPage = lazyPage(() => import("./pages/ResetPasswordPage"), "ResetPasswordPage");
const MyAccountPage = lazyPage(() => import("./pages/MyAccountPage"), "MyAccountPage");
const MyContractsPage = lazyPage(() => import("./pages/MyContractsPage"), "MyContractsPage");
const MyNotificationsPage = lazyPage(() => import("./pages/MyNotificationsPage"), "MyNotificationsPage");
const MyPaymentDetailPage = lazyPage(() => import("./pages/MyPaymentDetailPage"), "MyPaymentDetailPage");
const MyPaymentsPage = lazyPage(() => import("./pages/MyPaymentsPage"), "MyPaymentsPage");
const MyQuoteDetailPage = lazyPage(() => import("./pages/MyQuoteDetailPage"), "MyQuoteDetailPage");
const MyQuotesPage = lazyPage(() => import("./pages/MyQuotesPage"), "MyQuotesPage");
const MyRequestDetailPage = lazyPage(() => import("./pages/MyRequestDetailPage"), "MyRequestDetailPage");
const MyRequestsPage = lazyPage(() => import("./pages/MyRequestsPage"), "MyRequestsPage");
const PortfolioDetailPage = lazyPage(() => import("./pages/PortfolioDetailPage"), "PortfolioDetailPage");
const PortfolioPage = lazyPage(() => import("./pages/PortfolioPage"), "PortfolioPage");
const PrivacyPage = lazyPage(() => import("./pages/PrivacyPage"), "PrivacyPage");
const VerifyEmailPage = lazyPage(() => import("./pages/VerifyEmailPage"), "VerifyEmailPage");
const ServicesPage = lazyPage(() => import("./pages/ServicesPage"), "ServicesPage");

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
  const billingDocView = useMatch("/my/contracts/:contractId/documents/:docId/pdf");
  const changeOrderDocView = useMatch("/my/contracts/:contractId/change-orders/:docId/pdf");
  const isDocumentView = Boolean(quoteDocView ?? contractDocView ?? billingDocView ?? changeOrderDocView);
  const aboutView = useMatch("/about");
  const houseListView = useMatch("/house-designs");
  const houseDetailView = useMatch("/house-designs/:id");
  const portfolioListView = useMatch("/portfolio");
  const portfolioDetailView = useMatch("/portfolio/:id");
  const servicesView = useMatch("/services");
  const contactView = useMatch("/contact");
  const navPadding = overlayHero ? "" : "pt-[var(--nav-h)]";

  return (
    <div className={isDocumentView ? "" : "min-h-screen bg-white flex flex-col"}>
      <ScrollOnNavigate />
      {!isDocumentView && <NavBar overlayHero={overlayHero} />}
      <main className={isDocumentView ? "" : `flex-1 ${navPadding}`}>
      <ErrorBoundary variant="page" resetKey={location.pathname}>
      <Suspense
        fallback={
          isDocumentView ? (
            <div className="h-screen bg-slate-100">
              <PdfPaperSkeleton />
            </div>
          ) : aboutView ? (
            <AboutPageSkeleton />
          ) : houseListView ? (
            <CardListPageSkeleton label="กำลังโหลดแบบบ้าน" />
          ) : houseDetailView ? (
            <HouseDesignDetailSkeleton />
          ) : portfolioListView ? (
            <CardListPageSkeleton label="กำลังโหลดผลงาน" filters={3} />
          ) : portfolioDetailView ? (
            <PortfolioDetailSkeleton />
          ) : servicesView ? (
            <ServicesPageSkeleton />
          ) : contactView ? (
            <ContactPageSkeleton />
          ) : (
            <RouteSkeleton />
          )
        }
      >
      <Routes>
        <Route path="/" element={<HomePage />} />
        {/* Route แม่ไม่มี path = React Router เก็บ AuthDuoPage ไว้ตัวเดิมตอนสลับ /login กับ
            /register อนิเมชันใบมีดจึงเลื่อนข้ามได้จริง · ถ้าแยกเป็นสอง Route ระดับบนเหมือนเดิม
            การ์ดจะถูกถอดทิ้งแล้วสร้างใหม่ ใบมีดจะไปโผล่อีกฝั่งทันทีโดยไม่มีการเลื่อน */}
        <Route element={<AuthDuoPage />}>
          <Route path="/login" element={null} />
          <Route path="/register" element={null} />
        </Route>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/activate/:token" element={<ActivatePage />} />
        <Route path="/house-designs" element={<HouseDesignsPage />} />
        <Route path="/house-designs/:id" element={<HouseDesignDetailPage />} />
        <Route path="/about" element={<AboutPage />} />
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
          path="/my/requests/:id"
          element={
            <ProtectedRoute skeleton={<PortalPageSkeleton back body="request" />}>
              <MyRequestDetailPage />
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
            <ProtectedRoute skeleton={<PortalPageSkeleton back wide body="document" />}>
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
          path="/my/payments"
          element={
            <ProtectedRoute skeleton={<PortalPageSkeleton body="payments" />}>
              <MyPaymentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/payments/:installmentId"
          element={
            <ProtectedRoute skeleton={<PortalPageSkeleton back wide body="payment" />}>
              <MyPaymentDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/account"
          element={
            <ProtectedRoute skeleton={<AccountPageSkeleton />}>
              <MyAccountPage />
            </ProtectedRoute>
          }
        />
        {/* เข้าจากปุ่ม "ดูทั้งหมด" ในแผงกระดิ่ง — ไม่ใส่ในแถบเมนูเพราะกระดิ่งเป็นทางเข้าหลักอยู่แล้ว */}
        <Route
          path="/my/notifications"
          element={
            <ProtectedRoute skeleton={<PortalPageSkeleton body="notifications" />}>
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
        <Route
          path="/my/contracts/:contractId/change-orders/:docId/pdf"
          element={
            <ProtectedRoute>
              <DocumentPdfPage kind="changeOrder" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my/contracts/:contractId/documents/:docId/pdf"
          element={
            <ProtectedRoute>
              <DocumentPdfPage kind="billing" />
            </ProtectedRoute>
          }
        />
        {/* ตัวรับท้าย — ต้องอยู่ล่างสุดเสมอ ไม่มีตัวนี้ URL ที่พิมพ์ผิดจะได้แถบเมนู + ฟุตเตอร์
            แต่ตรงกลางว่างเปล่า ดูเหมือนหน้าโหลดค้าง */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      </main>
      {!isDocumentView && <Footer />}
    </div>
  );
}

export default App;
