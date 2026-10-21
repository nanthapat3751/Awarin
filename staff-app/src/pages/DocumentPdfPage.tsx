import { billingDocLabel } from "@systemboq/shared-types";
import { FileWarning } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button, buttonClasses } from "../components/Button";
import { ApiError, fetchPdfObjectUrl } from "../lib/api";
import { getContractPayments, listContracts } from "../lib/contracts-api";
import { listChangeOrders } from "../lib/change-orders-api";
import { billingDocApiPath, changeOrderApiPath, pdfApiPath, pdfDocTitle, type PdfDocKind } from "../lib/document-pdf";
import { getProject } from "../lib/projects-api";
import { listQuotes } from "../lib/quotes-api";

/** ชื่อในแท็บตอนยังไม่รู้ว่าเป็นเอกสารอะไร + ค่าที่คืนกลับตอนออกจากหน้า */
const BASE_TITLE = "ระบบประเมินราคาต้นทุนงานก่อสร้าง — Staff";

interface DocMeta {
  /** ชื่อบนแท็บ เช่น "สัญญา CT-2026-0001" / "ใบเสร็จรับเงิน RC-2026-0003" */
  title: string;
  projectName: string;
}

/** "billing" = ใบแจ้งหนี้/ใบเสร็จของงวดเงิน · "changeOrder" = ใบงานเพิ่ม-ลด (ทั้งคู่อยู่ใต้สัญญา) */
type ViewerKind = PdfDocKind | "billing" | "changeOrder";

/** เลขที่เอกสาร → ชื่อบนแท็บ ยิงพร้อมกับการสร้างไฟล์ */
async function loadDocTitle(kind: ViewerKind, projectId: string, contractId: string, docId: string) {
  if (kind === "billing") {
    const view = await getContractPayments(projectId, contractId);
    // ใบคืนเงินประกันผลงานไม่ผูกงวด — อยู่ในส่วน retention ของสัญญา
    const doc = [...view.installments.flatMap((i) => i.documents), ...view.retention.documents].find(
      (d) => d.id === docId,
    );
    return doc ? `${billingDocLabel(doc)} ${doc.docNo}` : "เอกสาร";
  }
  if (kind === "changeOrder") {
    const { changeOrders } = await listChangeOrders(projectId, contractId);
    return `ใบงานเพิ่ม-ลด ${changeOrders.find((c) => c.id === docId)?.docNo ?? "—"}`;
  }
  if (kind === "quote") {
    const { quotes } = await listQuotes(projectId);
    return pdfDocTitle(kind, quotes.find((q) => q.id === docId)?.quoteNo ?? "—");
  }
  const { contracts } = await listContracts(projectId);
  return pdfDocTitle(kind, contracts.find((c) => c.id === docId)?.contractNo ?? "—");
}

/**
 * หน้าดูเอกสาร PDF ของแอปเราเอง
 *
 * ทำไมต้องมี: เดิมกดปุ่มแล้วระบบ fetch ไฟล์มาเก็บเป็น blob ในหน่วยความจำ แล้ว window.open ไปที่
 * blob URL — ก้อน blob ไม่มีชื่อติดมาด้วย แท็บจึงขึ้นว่า "about:blank" ทุกใบ เปิดหลายใบพร้อมกัน
 * แล้วแยกไม่ออกว่าใบไหนของโครงการไหน (และไฟล์ที่ Puppeteer สร้างก็ไม่มี metadata ชื่อเอกสาร
 * ให้เบราว์เซอร์อ่านด้วย — ตรวจแล้วว่าไม่มีแม้แต่ /Info dictionary)
 *
 * พอเปิดเป็นหน้าของเราเอง เราตั้ง document.title เองได้ ไม่ต้องพึ่งพฤติกรรมของตัวอ่าน PDF
 * และเวลาเกิดข้อผิดพลาดยังขึ้นข้อความไทยได้ แทนที่จะโชว์ JSON ดิบเต็มแท็บแบบการเปิด URL ของ API ตรง ๆ
 *
 * จงใจไม่ครอบด้วย <Layout> — แท็บนี้มีไว้อ่านเอกสารอย่างเดียว เมนูข้างจะกินพื้นที่เปล่า ๆ
 *
 * และจงใจ "ไม่มีแถบเครื่องมือของเราเอง" ด้วย — ตัวอ่าน PDF ของเบราว์เซอร์มีแถบของมันอยู่แล้ว
 * (ชื่อเอกสาร · เลขหน้า · ย่อ/ขยาย · ดาวน์โหลด · พิมพ์) วางแถบของเราซ้อนไว้ข้างบนแล้วชื่อเอกสาร
 * โผล่สองรอบและมีปุ่มบันทึกสองปุ่ม เปิดไฟล์ปกติไม่ควรเป็นแบบนั้น → เหลือ iframe เต็มจอล้วน ๆ
 * (ทำเหมือนกันทั้งสองแอป — ดู client-app/src/pages/DocumentPdfPage.tsx)
 *
 * (ฝัง iframe ไปที่ URL ของ API ตรง ๆ ไม่ได้ — เซิร์ฟเวอร์ส่ง X-Frame-Options: SAMEORIGIN และ
 *  CSP frame-ancestors 'self' เบราว์เซอร์จึงบล็อก จำเป็นต้องโหลดเป็น blob แบบนี้)
 */
export function DocumentPdfPage({ kind }: Readonly<{ kind: ViewerKind }>) {
  const { id = "", docId = "", contractId = "" } = useParams();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    (async () => {
      try {
        // ยิงพร้อมกัน: การสร้าง PDF ใช้ Puppeteer กินเวลาหลายวินาที ไม่ควรต่อคิวหลังข้อมูลหัวเรื่อง
        const [detail, docTitle, objectUrl] = await Promise.all([
          getProject(id),
          loadDocTitle(kind, id, contractId, docId),
          fetchPdfObjectUrl(
            docApiPath(kind, id, contractId, docId),
          ),
        ]);

        // StrictMode ของ dev เรียก effect สองรอบ — ถ้ารอบนี้ถูกยกเลิกไปแล้วต้องคืน blob ทิ้ง
        // ไม่งั้นหน่วยความจำค้างและ state ของรอบเก่าจะมาทับรอบใหม่
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;

        setMeta({ title: docTitle, projectName: detail.project.name });
        setPdfUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "เปิดไฟล์ PDF ไม่สำเร็จ");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, docId, contractId, kind]);

  const title = meta?.title ?? null;

  useEffect(() => {
    document.title = title ? `${title} · ${meta?.projectName ?? ""}`.trim() : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title, meta?.projectName]);

  return (
    <div className="h-screen bg-slate-100">
      {error && (
        <div className="flex h-full items-center justify-center p-6">
          <div className="max-w-md rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
            <FileWarning size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-700">{error}</p>
            <p className="mt-1 text-sm text-slate-500">
              ลองใหม่อีกครั้ง หรือกลับไปที่หน้าโครงการเพื่อตรวจสอบเอกสาร
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button size="sm" variant="neutral" onClick={() => window.location.reload()}>
                ลองใหม่
              </Button>
              <Link to={`/projects/${id}`} className={buttonClasses("ghost", "sm")}>
                ไปหน้าโครงการ
              </Link>
            </div>
          </div>
        </div>
      )}

      {!error && !pdfUrl && (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-slate-500">กำลังสร้างไฟล์ PDF...</p>
        </div>
      )}

      {pdfUrl && <iframe src={pdfUrl} title={title ?? "เอกสาร PDF"} className="h-full w-full border-0" />}
    </div>
  );
}

function docApiPath(kind: ViewerKind, projectId: string, contractId: string, docId: string) {
  if (kind === "billing") return billingDocApiPath(projectId, contractId, docId);
  if (kind === "changeOrder") return changeOrderApiPath(projectId, contractId, docId);
  return pdfApiPath(kind, projectId, docId);
}
