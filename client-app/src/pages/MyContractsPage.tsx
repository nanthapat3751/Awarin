import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { CustomerContractDto, PaymentAccountDto } from "@systemboq/shared-types";

import { ContractPaymentProgress } from "../components/ContractPaymentProgress";
import { EmptyState } from "../components/EmptyState";
import { PortalPage, StatusCard } from "../components/PortalPage";
import { ApiError } from "../lib/api";
import { pdfViewerPath } from "../lib/document-pdf";
import { listMyContracts } from "../lib/my-api";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("th-TH");
}

export function MyContractsPage() {
  const [contracts, setContracts] = useState<CustomerContractDto[]>([]);
  const [payTo, setPayTo] = useState<PaymentAccountDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listMyContracts()
      .then((res) => {
        setContracts(res.contracts);
        setPayTo(res.payTo);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "โหลดสัญญาไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalPage title="สัญญาของฉัน" subtitle="ดาวน์โหลดและเก็บสัญญาของโครงการคุณไว้ที่เดียว">
      {loading && <p className="text-slate-400">กำลังโหลด...</p>}
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
          return (
            <StatusCard
              key={contract.id}
              index={i}
              accent={signed ? "bg-emerald-400" : "bg-amber-400"}
              title={contract.project.name}
              meta={`เลขที่ ${contract.contractNo} · ${
                signed ? `ลงนามเมื่อ ${formatDate(contract.signedAt)}` : "ยังไม่ลงนาม"
              }`}
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
            >
              {/*
                ขึ้นเฉพาะฉบับที่ลงนามแล้วและมีแผนงวด (เซิร์ฟเวอร์ส่ง null มาในกรณีอื่น) —
                ฉบับร่างยังไม่มีข้อผูกพันให้ชำระ และโครงการหนึ่งค้างฉบับร่างได้หลายฉบับพร้อมกัน
                ถ้าโชว์ยอดค้างของทุกฉบับ ลูกค้าจะเห็นหนี้ก้อนเดียวกันซ้ำหลายรอบ
              */}
              {contract.payment && (
                <ContractPaymentProgress payment={contract.payment} payTo={payTo} />
              )}
            </StatusCard>
          );
        })}
      </div>
    </PortalPage>
  );
}
