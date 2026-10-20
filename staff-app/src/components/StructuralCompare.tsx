import {
  OFFCUT_KEEP_MIN,
  type RebarCuttingDto,
  type StructuralCompareDto,
  type StructuralCompareLineDto,
} from "@systemboq/shared-types";
import { ChevronDown, Download } from "lucide-react";
import { Fragment, useState } from "react";

import { ApiError, downloadFile } from "../lib/api";
import { rebarBbsPath } from "../lib/boq-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";

/**
 * "กรอกครั้งเดียว ได้สองผลลัพธ์" — เหล็กเสริมใน BOQ คิดด้วยชุดเสนอราคา เซิร์ฟเวอร์คิดชิ้นส่วนเดียวกันด้วยชุดสั่งตัดให้เทียบ
 * ทุกตัวเลขเป็นปริมาณสุทธิก่อนเผื่อเสีย (กก.) · ฝั่งพนักงานเท่านั้น ไม่ออกเอกสาร/Excel ลูกค้า
 */

const kg = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** ส่วนต่างเป็น % ของชุดเสนอราคา — ฐานเป็นศูนย์ = ไม่มีความหมาย (null) */
const diffPct = (tender: number, site: number) => (tender > 0 ? ((site - tender) / tender) * 100 : null);
const pctText = (p: number) => `${p >= 0 ? "+" : "−"}${Math.abs(p).toFixed(1)}%`;
/** สั่งตัดจริงมากกว่าที่เสนอราคาไว้เกินนี้ = หน้างานอาจขาดเหล็ก → ป้ายสีเหลือง */
const WARN_PCT = 5;

/** ป้ายเล็กใต้จำนวนของบรรทัดเหล็ก */
export function RebarCompareTag({ compare, itemId }: Readonly<{ compare: StructuralCompareDto | null; itemId: string }>) {
  if (!compare) return null;
  const line: StructuralCompareLineDto | undefined = compare.lines.find((l) => l.itemId === itemId);
  if (!line) {
    return compare.noDataItemIds.includes(itemId) ? (
      <span
        className="mt-0.5 block text-xs whitespace-nowrap text-slate-400"
        title="บรรทัดนี้กรอกจำนวนเอง ไม่ได้มาจากตัวคิดชิ้นส่วน — ไม่มีขนาดให้คิดแบบสั่งตัด"
      >
        ไม่มีข้อมูลเทียบ
      </span>
    ) : null;
  }
  const p = diffPct(line.tenderNet, line.siteNet);
  const warn = p != null && p > WARN_PCT;
  return (
    <span
      className={`mt-0.5 inline-flex rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
        warn ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-slate-100 text-slate-600"
      }`}
      title={
        `เทียบปริมาณสุทธิก่อนเผื่อเสีย — ชุดเสนอราคา ${kg(line.tenderNet)} กก. · ชุดสั่งตัด ${kg(line.siteNet)} กก.` +
        (line.manualRows > 0 ? ` · ไม่นับ ${line.manualRows} แถวที่กรอกเอง` : "")
      }
    >
      สั่งตัดจริง ≈ {kg(line.siteNet)} กก.{p != null && ` · ${pctText(p)}`}
    </span>
  );
}

function totalsOf(compare: StructuralCompareDto) {
  const tender = compare.byDia.reduce((n, d) => n + d.tenderNet, 0);
  const site = compare.byDia.reduce((n, d) => n + d.siteNet, 0);
  return { tender, site, pct: diffPct(tender, site) };
}

/** แถบสรุปเหนือตาราง BOQ */
export function RebarCompareBar({
  compare,
  onOpenSite,
  siteOpen = false,
}: Readonly<{ compare: StructuralCompareDto | null; onOpenSite: () => void; siteOpen?: boolean }>) {
  if (!compare || compare.byDia.length === 0) return null;
  const t = totalsOf(compare);
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
      <span className="font-semibold text-slate-900">เหล็กเสริมทั้งโครงการ</span>
      <span>
        ประมาณราคา <b className="tabular-nums text-slate-900">{kg(t.tender)}</b> กก.
      </span>
      <span>
        สั่งตัดจริง ≈ <b className="tabular-nums text-slate-900">{kg(t.site)}</b> กก.
        {t.pct != null && <span className="text-slate-500"> ({pctText(t.pct)})</span>}
      </span>
      <span className="text-xs text-slate-400">เทียบปริมาณสุทธิก่อนเผื่อเสีย · เห็นเฉพาะทีมงาน</span>
      <button
        type="button"
        onClick={onOpenSite}
        aria-expanded={siteOpen}
        className="link-pill -mr-2.5 ml-auto text-sm font-medium text-brand"
      >
        {siteOpen ? "ซ่อนรายการสั่งเหล็กหน้างาน" : "ดูรายการสั่งเหล็กหน้างาน"}
      </button>
    </div>
  );
}

const barCode = (dia: number) => (dia === 6 || dia === 9 ? `RB${dia}` : `DB${dia}`);

const len3 = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/**
 * การ์ด "สั่งเหล็กหน้างาน" กางใต้แถบเหล็กในแท็บ BOQ — ชุดสั่งตัด แยกตามขนาด
 * จำนวนเส้นมาจากแผนตัด (Phase 3 ข้อ 3a: FFD เทียบเส้น 10/12 ม.) · แผนตัดยังโหลดไม่เสร็จ = นับแบบหารปัดขึ้นไปก่อน
 */
export function SiteRebarCard({
  compare,
  cutting,
  projectId,
  projectNo,
}: Readonly<{ compare: StructuralCompareDto | null; cutting: RebarCuttingDto | null; projectId: string; projectNo: string }>) {
  const toast = useToast();
  const [openDia, setOpenDia] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  if (!compare || compare.byDia.length === 0) return null;
  const manualLines = compare.noDataItemIds.length;
  const manualRows = compare.lines.reduce((n, l) => n + l.manualRows, 0);
  const members = compare.members.map((m) => `${m.label} ×${m.count}`);
  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">สั่งเหล็กหน้างาน</p>
          <p className="text-xs text-slate-500">
            คิดจากชิ้นส่วนชุดเดียวกับ BOQ ด้วย “ชุดสั่งตัด” (ตั้งค่า → ถอดปริมาณ) — ไม่กระทบราคาที่เสนอลูกค้า
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              await downloadFile(rebarBbsPath(projectId), `เหล็ก-${projectNo}.xlsx`);
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : "ส่งออก Excel ไม่สำเร็จ");
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download size={13} aria-hidden /> {exporting ? "กำลังสร้างไฟล์..." : "ส่งออก Excel (สรุป · รายชิ้นส่วน · แผนตัด)"}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-4 py-2 font-medium">ขนาด</th>
              <th className="px-4 py-2 text-right font-medium">น้ำหนักสั่งตัด (กก.)</th>
              <th className="px-4 py-2 text-right font-medium">ยาวรวม (ม.)</th>
              <th className="px-4 py-2 text-right font-medium">เส้น 10 ม.</th>
              <th className="px-4 py-2 text-right font-medium">เส้น 12 ม.</th>
              <th className="px-4 py-2 text-right font-medium">ต่างจาก BOQ</th>
              <th className="px-4 py-2 font-medium" aria-label="แผนตัด" />
            </tr>
          </thead>
          <tbody>
            {compare.byDia.map((d) => {
              const p = diffPct(d.tenderNet, d.siteNet);
              const cut = cutting?.byDia.find((c) => c.dia === d.dia);
              const plan = cut?.plans.find((x) => x.stock === cut.recommended);
              const open = openDia === d.dia && plan != null;
              // แผนตัดได้แล้ว = จำนวนเส้นจริงจากการจัดตัด · ยังไม่ได้ = หารปัดขึ้น (ตัวเลขขั้นต่ำ ยังไม่รวมเศษ)
              const stockCell = (stock: number) => {
                const pl = cut?.plans.find((x) => x.stock === stock);
                if (!pl) return <span className="text-slate-500">≥ {Math.ceil(d.siteLength / stock - 1e-9)}</span>;
                const best = cut!.recommended === stock;
                return (
                  <span className={best ? "font-semibold text-slate-900" : "text-slate-500"}>
                    {pl.bars}
                    <span
                      className="block text-xs font-normal text-slate-400"
                      title={`ซื้อ ${pl.bars * pl.stock} ม. · ใช้จริง ${len3(pl.netLength)} ม. · เศษทิ้ง ${len3(pl.scrap)} ม. · เศษเก็บไว้ ${len3(pl.offcut)} ม.`}
                    >
                      เหลือ {pl.leftoverPct}% (ทิ้ง {pl.scrapPct}%){best && <span className="text-emerald-700"> · แนะนำ</span>}
                    </span>
                  </span>
                );
              };
              return (
                <Fragment key={d.dia}>
                  <tr className="border-t border-slate-100 align-top tabular-nums">
                    <td className="px-4 py-2 font-medium text-slate-800">{barCode(d.dia)}</td>
                    <td className="px-4 py-2 text-right">{kg(d.siteNet)}</td>
                    <td className="px-4 py-2 text-right">{Math.round(d.siteLength).toLocaleString("th-TH")}</td>
                    <td className="px-4 py-2 text-right">{stockCell(10)}</td>
                    <td className="px-4 py-2 text-right">{stockCell(12)}</td>
                    <td className={`px-4 py-2 text-right ${p != null && p > WARN_PCT ? "text-amber-800" : "text-slate-600"}`}>
                      {p == null ? "—" : pctText(p)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {plan && (
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenDia(open ? null : d.dia)}
                          className="link-pill inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-brand"
                        >
                          แผนตัด
                          <ChevronDown size={13} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {open && plan && (
                    <tr className="bg-slate-50/70">
                      <td colSpan={7} className="px-4 py-2">
                        <p className="mb-1 text-xs text-slate-500">
                          {barCode(d.dia)} · ซื้อเส้นยาว {plan.stock} ม. {plan.bars} เส้น · ใช้จริง {len3(plan.netLength)} ม. · เศษทิ้ง{" "}
                          {len3(plan.scrap)} ม. · เศษเก็บไว้ (≥ {OFFCUT_KEEP_MIN} ม.) {len3(plan.offcut)} ม.
                        </p>
                        <ul className="flex flex-col gap-0.5 text-xs tabular-nums text-slate-700">
                          {plan.patterns.map((pt) => (
                            <li key={`${pt.bars}-${pt.cuts.map((c) => `${c.length}x${c.count}`).join(",")}`}>
                              <span className="inline-block w-16 font-medium text-slate-900">{pt.bars} เส้น</span>
                              ตัดเป็น {pt.cuts.map((c) => `${len3(c.length)} × ${c.count}`).join(" + ")}
                              {pt.leftover > 0 && (
                                <span className={pt.leftover >= OFFCUT_KEEP_MIN ? "text-emerald-700" : "text-slate-400"}>
                                  {" "}· เหลือ {len3(pt.leftover)} ม.{pt.leftover >= OFFCUT_KEEP_MIN ? " (เก็บไว้ใช้)" : ""}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        <span>
          ที่มา: {members.length} ชิ้นส่วน ({members.slice(0, 6).join(" · ")}
          {members.length > 6 ? " …" : ""})
        </span>
        <span>
          จำนวนเส้นจากแผนตัด: เรียงชิ้นยาวไปสั้นลงเส้นแรกที่ยังว่างพอ · เส้นยาวต่างกันทาบต่างกัน คิดแยก · เศษ ≥ {OFFCUT_KEEP_MIN} ม. นับเป็นเศษเก็บไว้
        </span>
        {(manualLines > 0 || manualRows > 0) && (
          <span>
            ไม่อยู่ในตารางนี้:{" "}
            {[manualLines > 0 && `บรรทัดที่กรอกจำนวนเอง ${manualLines} บรรทัด`, manualRows > 0 && `แถวที่กรอกเอง ${manualRows} แถว`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>
    </section>
  );
}
