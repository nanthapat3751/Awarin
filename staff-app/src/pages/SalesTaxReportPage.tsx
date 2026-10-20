import type { SalesTaxReportDto } from "@systemboq/shared-types";
import { Download, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";

import { Layout } from "../components/Layout";
import { ApiError } from "../lib/api";
import { downloadSalesTaxXlsx, getSalesTaxReport } from "../lib/reports-api";
import { useToast } from "../lib/toast-context";
import { Button } from "../components/Button";
import { TableSkeleton } from "../components/Skeleton";
import { MonthInput } from "../components/MonthInput";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function thaiMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function thaiDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** เดือนปัจจุบันตามเวลาไทย (ปปปป-ดด) */
function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7);
}

/**
 * รายงานภาษีขายรายเดือน — ใบกำกับภาษีที่ออกในเดือนนั้น สำหรับยื่น ภ.พ.30
 *
 * ตัวเลขทุกช่องอ่านจากใบที่ออกไปแล้ว ไม่ได้คำนวณ VAT ใหม่ รายงานจึงตรงกับกระดาษที่อยู่ในมือลูกค้าเสมอ
 * ใบที่ยกเลิกยังอยู่ในรายการ (เลขที่ต้องเรียงต่อกันตอนถูกตรวจ) แต่ไม่ถูกนับในยอดรวม
 */
export function SalesTaxReportPage() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<SalesTaxReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      await downloadSalesTaxXlsx(month);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ดาวน์โหลดไฟล์ไม่สำเร็จ");
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSalesTaxReport(month)
      .then((res) => {
        if (alive) setReport(res);
      })
      .catch((err) => {
        if (alive) toast.error(err instanceof ApiError ? err.message : "โหลดรายงานไม่สำเร็จ");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const totals = report?.totals;

  return (
    <Layout>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">รายงานภาษีขาย</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              ใบกำกับภาษีที่ออกในเดือนที่เลือก — ใช้ยื่นแบบ ภ.พ.30
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1 text-xs text-slate-500">
              <label htmlFor="sales-tax-month">เดือนภาษี</label>
              <MonthInput id="sales-tax-month" value={month} max={currentMonth()} onChange={setMonth} />
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={downloading}
              onClick={() => void download()}
            >
              <Download size={14} /> {downloading ? "กำลังเตรียมไฟล์..." : "ดาวน์โหลด Excel"}
            </Button>
          </div>
        </div>

        {loading && <TableSkeleton rows={8} cols={6} />}

        {!loading && report && report.rows.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center">
            <FileSpreadsheet size={26} className="mx-auto mb-3 text-slate-300" aria-hidden />
            <p className="text-sm text-slate-600">ไม่มีใบกำกับภาษีที่ออกใน{thaiMonth(month)}</p>
            <p className="mt-1 text-xs text-slate-400">
              ใบกำกับภาษีจะเกิดขึ้นเมื่อบันทึกรับเงินงวดแล้วกดออกใบเสร็จ (ต้องเปิดการจดทะเบียน VAT ในหน้าตั้งค่า)
            </p>
          </div>
        )}

        {!loading && report && report.rows.length > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "มูลค่าสินค้า/บริการ", value: totals!.base },
                { label: "ภาษีขาย (VAT)", value: totals!.vat },
                { label: "รวมเป็นเงิน", value: totals!.total },
              ].map((card) => (
                <div key={card.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{money(card.value)}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {thaiMonth(month)} · ใบกำกับภาษี {totals!.count} ใบ
              {totals!.voidedCount > 0 && ` · ยกเลิก ${totals!.voidedCount} ใบ (ไม่นับในยอดรวม)`}
            </p>

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              {/* iPad (<1280): วันที่ไปใต้เลขที่ · เลขผู้เสียภาษีไปใต้ผู้ซื้อ — ยอดเงินสามช่องเห็นครบไม่ต้องปัดข้าง (ผู้ใช้สั่ง 18 ต.ค.) */}
              <table className="w-full text-sm xl:min-w-[52rem]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-3 py-2 font-medium">เลขที่</th>
                    <th className="hidden xl:table-cell px-3 py-2 font-medium">วันที่</th>
                    <th className="px-3 py-2 font-medium">ผู้ซื้อ</th>
                    <th className="hidden xl:table-cell px-3 py-2 font-medium">เลขผู้เสียภาษี</th>
                    <th className="px-3 py-2 text-right font-medium">มูลค่า</th>
                    <th className="px-3 py-2 text-right font-medium">VAT</th>
                    <th className="px-3 py-2 text-right font-medium">รวม</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={r.id} className={`border-b border-slate-100 ${r.voidedAt ? "text-slate-400" : ""}`}>
                      <td className="px-3 py-2">
                        {r.docNo}
                        {r.voidedAt && (
                          <span className="ml-1.5 rounded bg-rose-50 px-1.5 py-0.5 text-xs text-rose-700">ยกเลิก</span>
                        )}
                        <span className="block text-xs tabular-nums text-slate-500 xl:hidden">{thaiDate(r.issuedOn)}</span>
                      </td>
                      <td className="hidden xl:table-cell px-3 py-2 tabular-nums">{thaiDate(r.issuedOn)}</td>
                      <td className="px-3 py-2">
                        {r.customerName ?? "-"}
                        <span className="block text-xs text-slate-400">{r.projectNo}</span>
                        <span className="block text-xs tabular-nums text-slate-500 xl:hidden">
                          เลขผู้เสียภาษี {r.customerTaxId ?? "-"}
                          {r.customerBranch && ` · ${r.customerBranch}`}
                        </span>
                      </td>
                      <td className="hidden xl:table-cell px-3 py-2 tabular-nums">
                        {r.customerTaxId ?? "-"}
                        {r.customerBranch && <span className="block text-xs text-slate-400">{r.customerBranch}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.base)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.vat)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(r.total)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="hidden xl:table-cell px-3 py-2" colSpan={4}>
                      รวม (ไม่นับใบที่ยกเลิก)
                    </td>
                    <td className="px-3 py-2 xl:hidden" colSpan={2}>
                      รวม (ไม่นับใบที่ยกเลิก)
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals!.base)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals!.vat)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totals!.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
