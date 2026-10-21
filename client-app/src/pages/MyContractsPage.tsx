import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { CustomerContractDto, CustomerContractPaymentDto } from "@systemboq/shared-types";

import { ChangeOrdersSection } from "../components/ChangeOrdersSection";
import { EmptyState } from "../components/EmptyState";
import { PortalPage, StatusCard } from "../components/PortalPage";
import { ApiError } from "../lib/api";
import { pdfViewerPath } from "../lib/document-pdf";
import { listMyContracts } from "../lib/my-api";
import { StatusListSkeleton } from "../components/Skeleton";
import { usePageMeta } from "../lib/page-meta";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("th-TH");
}

/**
 * งวดที่บริษัทเรียกเก็บแล้วและยังค้าง — นิยามเดียวกับรายการ "ต้องชำระ" ในหน้าการชำระเงิน
 * (มีวันครบกำหนด หรือมีใบแจ้งหนี้แล้ว)
 */
function dueNowCount(payment: CustomerContractPaymentDto): number {
  return payment.installments.filter(
    (i) => i.remaining > 0 && (i.dueOn != null || i.documents.some((d) => d.type === "INVOICE")),
  ).length;
}

export function MyContractsPage() {
  usePageMeta("สัญญาของฉัน");
  const [contracts, setContracts] = useState<CustomerContractDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyContracts()
      .then((res) => {
        setContracts(res.contracts);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "โหลดสัญญาไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalPage title="สัญญาของฉัน" subtitle="ดาวน์โหลดและเก็บสัญญาของโครงการคุณไว้ที่เดียว">
      {loading && <StatusListSkeleton count={2} label="กำลังโหลดสัญญา..." />}
      {!loading && error && (
        <p className="text-sm text-red-600">{error} — กรุณาลองเข้าสู่ระบบใหม่อีกครั้ง</p>
      )}
      {!loading && !error && contracts.length === 0 && (
        <EmptyState
          title="ยังไม่มีสัญญา"
          description="สัญญาจะปรากฏที่นี่หลังจากโครงการของคุณได้รับการอนุมัติ ให้ดาวน์โหลดเก็บไว้ได้"
        />
      )}

      <div className="flex flex-col gap-3">
        {contracts.map((contract, i) => {
          const signed = Boolean(contract.signedAt);
          const waiting = contract.changeOrders.filter((co) => co.status === "SENT").length;
          const dueNow = contract.payment ? dueNowCount(contract.payment) : 0;
          return (
            <StatusCard
              key={contract.id}
              index={i}
              accent={signed ? "bg-emerald-400" : "bg-amber-400"}
              title={contract.project.name}
              meta={`เลขที่ ${contract.contractNo} · ${
                signed ? `ลงนามเมื่อ ${formatDate(contract.signedAt)}` : "ยังไม่ลงนาม"
              }${waitingNote(waiting)}`}
              badge={{
                label: signed ? "ลงนามแล้ว" : "ยังไม่ลงนาม",
                className: signed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
              }}
              action={
                <Link
                  to={pdfViewerPath("contract", contract.id)}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 lg:min-h-0"
                >
                  เปิดสัญญา (PDF)
                </Link>
              }
              footer={
                <>
                  {/*
                    หน้าสัญญาเหลือแค่เรื่องสัญญา (แบบ A — ผู้ใช้สั่ง 18 ต.ค.): ยอดชำระ/แถบความคืบหน้า/รายการงวด/
                    ใบแจ้งหนี้-ใบเสร็จ/เงินประกันผลงาน อยู่หน้าการชำระเงินที่เดียว เหลือแค่ทางลัดเมื่อมีงวดค้าง
                    contract.payment เป็น null สำหรับฉบับร่าง — ฉบับร่างไม่มีข้อผูกพันให้ชำระ
                  */}
                  {dueNow > 0 && (
                    <Link
                      to="/my/payments"
                      className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 transition-colors hover:bg-amber-100"
                    >
                      <span>มี {dueNow} งวดที่ต้องชำระ</span>
                      <span className="inline-flex items-center gap-0.5 font-medium">
                        ไปหน้าชำระเงิน <ChevronRight size={15} aria-hidden />
                      </span>
                    </Link>
                  )}
                  <ChangeOrdersSection
                    contract={contract}
                    onResponded={(res) => {
                      setContracts(res.contracts);
                    }}
                  />
                </>
              }
            />
          );
        })}
      </div>
    </PortalPage>
  );
}

function waitingNote(waiting: number) {
  return waiting > 0 ? ` · มีงานเพิ่ม-ลดรอคุณอนุมัติ ${waiting} ใบ` : "";
}
