import { billingDocLabel } from "@systemboq/shared-types";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError, fetchPdfObjectUrl } from "../lib/api";
import { billingDocApiPath, changeOrderApiPath, pdfApiPath, pdfDocTitle, type PdfDocKind } from "../lib/document-pdf";
import { getMyQuote, listMyContracts } from "../lib/my-api";
import { PdfPaperSkeleton } from "../components/Skeleton";

/** ชื่อในแท็บตอนยังไม่รู้ว่าเป็นเอกสารอะไร + ค่าที่คืนกลับตอนออกจากหน้า */
const BASE_TITLE = "Awarin Engineering — รับออกแบบและสร้างบ้าน";

interface DocMeta {
  /** ชื่อบนแท็บ เช่น "สัญญา CT-2026-0001" / "ใบเสร็จรับเงิน RC-2026-0003" */
  title: string;
  projectName: string;
}

/** "billing" = ใบแจ้งหนี้/ใบเสร็จของงวดเงิน · "changeOrder" = ใบงานเพิ่ม-ลด (ทั้งคู่อยู่ใต้สัญญา) */
type ViewerKind = PdfDocKind | "billing" | "changeOrder";

/** เลขที่เอกสาร + ชื่อโครงการ สำหรับชื่อแท็บ — ยิงพร้อมกับการสร้างไฟล์ */
async function loadDocMeta(kind: ViewerKind, contractId: string, docId: string): Promise<DocMeta | null> {
  if (kind === "quote") {
    const { quote } = await getMyQuote(docId);
    return { title: pdfDocTitle(kind, quote.quoteNo), projectName: quote.project.name };
  }
  const { contracts } = await listMyContracts();
  if (kind === "contract") {
    const found = contracts.find((c) => c.id === docId);
    return found ? { title: pdfDocTitle(kind, found.contractNo), projectName: found.project.name } : null;
  }
  const contract = contracts.find((c) => c.id === contractId);
  if (kind === "changeOrder") {
    const co = contract?.changeOrders.find((c) => c.id === docId);
    return contract && co ? { title: `ใบงานเพิ่ม-ลด ${co.docNo}`, projectName: contract.project.name } : null;
  }
  // ใบคืนเงินประกันผลงานไม่ผูกงวด — อยู่ในส่วน retention ของสัญญา
  const doc = [
    ...(contract?.payment?.installments.flatMap((i) => i.documents) ?? []),
    ...(contract?.payment?.retention?.documents ?? []),
  ].find((d) => d.id === docId);
  return contract && doc
    ? { title: `${billingDocLabel(doc)} ${doc.docNo}`, projectName: contract.project.name }
    : null;
}

/**
 * หน้าดูเอกสาร PDF ของลูกค้า (คู่กับ staff-app/src/pages/DocumentPdfPage.tsx)
 *
 * ทำไมต้องมี: เดิมกดปุ่มแล้ว fetch ไฟล์มาเป็น blob แล้ว window.open ไปที่ blob URL — ก้อน blob
 * ไม่มีชื่อ แท็บจึงขึ้นว่า "about:blank" ลูกค้าที่เปิดใบเสนอราคาหลายฉบับพร้อมกันแยกไม่ออกว่าอันไหน
 * เป็นอันไหน พอทำเป็นหน้าของเราเองจึงตั้งชื่อแท็บได้เอง
 *
 * ตัวไฟล์เองก็มีชื่อฝังอยู่แล้ว (server เขียน /Title ให้ — ดู server/src/lib/pdf/metadata.ts)
 * สองอย่างนี้เสริมกัน: ชื่อแท็บใช้ตอนดูในเว็บ ส่วนชื่อในไฟล์ติดไปด้วยเวลาลูกค้าบันทึกหรือส่งต่อ
 *
 * จงใจไม่มี NavBar/Footer — App.tsx ตัดเปลือกเว็บออกให้เมื่ออยู่เส้นทางนี้ (useMatch)
 * เพราะแท็บนี้มีไว้อ่านเอกสารอย่างเดียว
 *
 * และจงใจ "ไม่มีแถบเครื่องมือของเราเอง" ด้วย — ตัวอ่าน PDF ของเบราว์เซอร์มีแถบของมันอยู่แล้ว
 * (ชื่อเอกสาร · เลขหน้า · ย่อ/ขยาย · ดาวน์โหลด · พิมพ์) การวางแถบของเราซ้อนไว้ข้างบนทำให้ชื่อ
 * เอกสารโผล่สองรอบและมีปุ่มบันทึกสองปุ่ม ผู้ใช้ทักว่าเปิดไฟล์ปกติไม่ควรมีแบบนั้น
 * → เหลือแค่ iframe เต็มจอ หน้าตาเหมือนเปิดไฟล์ PDF ธรรมดาทุกประการ ต่างกันแค่ชื่อแท็บที่เราคุมเอง
 *
 * (ฝัง iframe ไปที่ URL ของ API ตรง ๆ ไม่ได้ — เซิร์ฟเวอร์ส่ง X-Frame-Options: SAMEORIGIN และ
 *  CSP frame-ancestors 'self' เบราว์เซอร์จึงบล็อก จำเป็นต้องโหลดเป็น blob แบบนี้)
 */
export function DocumentPdfPage({ kind }: Readonly<{ kind: ViewerKind }>) {
  const { docId = "", contractId = "" } = useParams();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<DocMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    (async () => {
      try {
        // ยิงพร้อมกัน: การสร้าง PDF ใช้เวลาหลายวินาที ไม่ควรต่อคิวหลังข้อมูลหัวเรื่อง
        const [found, objectUrl] = await Promise.all([
          loadDocMeta(kind, contractId, docId),
          fetchPdfObjectUrl(
            docApiPath(kind, contractId, docId),
          ),
        ]);

        // StrictMode ของ dev เรียก effect สองรอบ — ถ้ารอบนี้ถูกยกเลิกไปแล้วต้องคืน blob ทิ้ง
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        created = objectUrl;

        if (found) setMeta(found);
        setPdfUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "เปิดไฟล์ไม่สำเร็จ กรุณาลองใหม่");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [docId, contractId, kind]);

  const title = meta?.title ?? null;
  const backTo = kind === "quote" ? `/my/quotes/${docId}` : "/my/contracts";

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
            <p className="font-medium text-slate-700">{error}</p>
            <p className="mt-1 text-sm text-slate-500">
              ลองใหม่อีกครั้ง หรือย้อนกลับไปดูรายการเอกสารของคุณ
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {/* min-h-11 = 44px ตามเกณฑ์ปุ่มกดบนมือถือของฝั่งลูกค้า (ดู client-app-responsive) */}
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex min-h-11 items-center rounded-md bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
              >
                ลองใหม่
              </button>
              <Link
                to={backTo}
                className="inline-flex min-h-11 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                ย้อนกลับ
              </Link>
            </div>
          </div>
        </div>
      )}

      {!error && !pdfUrl && <PdfPaperSkeleton />}

      {pdfUrl && (
        <iframe src={pdfUrl} title={title ?? "เอกสาร PDF"} className="h-full w-full border-0" />
      )}
    </div>
  );
}

function docApiPath(kind: ViewerKind, contractId: string, docId: string) {
  if (kind === "billing") return billingDocApiPath(contractId, docId);
  if (kind === "changeOrder") return changeOrderApiPath(contractId, docId);
  return pdfApiPath(kind, docId);
}
