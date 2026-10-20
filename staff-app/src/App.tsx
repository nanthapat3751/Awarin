import { Route, Routes } from "react-router-dom";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { AccountPage } from "./pages/AccountPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DocumentPdfPage } from "./pages/DocumentPdfPage";
import { HouseDesignDetailPage } from "./pages/HouseDesignDetailPage";
import { HouseDesignsPage } from "./pages/HouseDesignsPage";
import { LeadsPage } from "./pages/LeadsPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { MaterialsPage } from "./pages/MaterialsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { PendingWorkPage } from "./pages/PendingWorkPage";
import { PortfolioDetailPage } from "./pages/PortfolioDetailPage";
import { PortfolioPage } from "./pages/PortfolioPage";
import { CustomerFilePage } from "./pages/CustomerFilePage";
import { CustomersPage } from "./pages/CustomersPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SalesTaxReportPage } from "./pages/SalesTaxReportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SiteImagesPage } from "./pages/SiteImagesPage";
import { TemplateDetailPage } from "./pages/TemplateDetailPage";
import { ContractTemplatesPage } from "./pages/ContractTemplatesPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { TrashPage } from "./pages/TrashPage";
import { UsersPage } from "./pages/UsersPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* หน้าสาธารณะ: ลืมรหัสผ่าน → ลิงก์ในอีเมล → ตั้งรหัสใหม่ (ไม่ต้องล็อกอิน) */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pending-work"
        element={
          <ProtectedRoute>
            <PendingWorkPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/categories"
        element={
          <ProtectedRoute>
            <CategoriesPage />
          </ProtectedRoute>
        }
      />
      {/* Same page, but with the open หมวดงาน in the URL so it can be linked and shared. */}
      <Route
        path="/categories/:categoryId"
        element={
          <ProtectedRoute>
            <CategoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/materials"
        element={
          <ProtectedRoute>
            <MaterialsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <ProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute>
            <ProjectDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports/sales-tax"
        element={
          <ProtectedRoute>
            <SalesTaxReportPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <CustomersPage />
          </ProtectedRoute>
        }
      />
      {/* แฟ้มลูกค้า — ไม่มีเมนูข้าง เข้าจากการ์ดลูกค้าในหน้าโครงการ/หน้าคำขอ/หน้าจัดการผู้ใช้
          เพราะเป็นหน้าที่เปิดจาก "ลูกค้ารายนี้" เสมอ ไม่ใช่หน้าที่เปิดลอย ๆ แล้วค่อยหาคน */}
      <Route
        path="/customers/:id"
        element={
          <ProtectedRoute>
            <CustomerFilePage />
          </ProtectedRoute>
        }
      />
      {/* หน้าดูเอกสาร PDF — วางก่อน /templates เฉย ๆ ไม่มีนัยเรื่องลำดับ เพราะ path ไม่ทับกัน
          เปิดจากปุ่มในหน้าโครงการด้วย target="_blank" (ดู lib/document-pdf.ts) */}
      <Route
        path="/projects/:id/quotes/:docId/pdf"
        element={
          <ProtectedRoute>
            <DocumentPdfPage kind="quote" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/contracts/:docId/pdf"
        element={
          <ProtectedRoute>
            <DocumentPdfPage kind="contract" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/contracts/:contractId/change-orders/:docId/pdf"
        element={
          <ProtectedRoute>
            <DocumentPdfPage kind="changeOrder" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/contracts/:contractId/documents/:docId/pdf"
        element={
          <ProtectedRoute>
            <DocumentPdfPage kind="billing" />
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates"
        element={
          <ProtectedRoute>
            <TemplatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/contract-templates"
        element={
          <ProtectedRoute>
            <ContractTemplatesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates/:id"
        element={
          <ProtectedRoute>
            <TemplateDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/house-designs"
        element={
          <ProtectedRoute>
            <HouseDesignsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/house-designs/:id"
        element={
          <ProtectedRoute>
            <HouseDesignDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolio"
        element={
          <ProtectedRoute>
            <PortfolioPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/portfolio/:id"
        element={
          <ProtectedRoute>
            <PortfolioDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <LeadsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <NotificationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute>
            <UsersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/site-images"
        element={
          <ProtectedRoute>
            <SiteImagesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trash"
        element={
          <ProtectedRoute>
            <TrashPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <AccountPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      {/* ตัวรับท้าย — ต้องอยู่ล่างสุดเสมอ ไม่มีตัวนี้ react-router จะไม่เรนเดอร์อะไรเลยเมื่อ URL
          ไม่ตรงกับเส้นทางไหน (จอขาวล้วน ไม่มีแม้แต่เมนูข้าง) ที่ห่อ ProtectedRoute ไว้ด้วยเพราะ
          ProtectedRoute อยู่ "ในแต่ละเส้นทาง" ไม่ได้ห่อทั้งก้อน — พอไม่มีเส้นทางไหนตรง จึงไม่มี
          ตัวไหนได้ทำงาน คนที่ยังไม่ล็อกอินเปิด URL มั่วเลยค้างอยู่หน้าขาวแทนที่จะถูกพาไปล็อกอิน */}
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <NotFoundPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
