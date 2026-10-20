import type { ProjectCostReportDto, SignedPriceDriftLineDto } from "@systemboq/shared-types";
import { ArrowDownLeft, ArrowUpRight, TrendingUp, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";

import { money } from "../lib/cost-entry";

/**
 * สัญญาณเรื่องเงินบนแท็บต้นทุนจริง — สองเรื่องที่ "ยังไม่ใช่ต้นทุนจริง" แต่ทำให้ขาดทุน/เงินจมได้:
 *   • ราคาในคลังขึ้นหลังเซ็นสัญญา (ของที่ยังไม่ได้ซื้อจะแพงกว่าที่ตั้งงบไว้)
 *   • เงินสดของโครงการ (จ่ายออกมากกว่าที่ลูกค้าจ่ายเข้า = บริษัทออกเงินแทน)
 */

function thaiDate(iso: string): string {
  const d = iso.length === 10 ? new Date(`${iso}T00:00:00Z`) : new Date(iso);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" });
}

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;

/** รายละเอียดใต้ยอดในกล่องเงินเข้า/ออก — ยอด 0 ไม่แสดง จึงไม่มีบรรทัดที่ซ้ำกับยอดรวม */
function SubLine({ label, value, sign = "", note }: Readonly<{ label: string; value: number; sign?: "+" | "−" | ""; note?: string }>) {
  if (value === 0) return null;
  return (
    <li className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-slate-500">
        {label}
        {note && <span className="ml-1 text-slate-400">· {note}</span>}
      </span>
      <span className="shrink-0 tabular-nums text-slate-600">
        {sign}
        {money(value)}
      </span>
    </li>
  );
}

/** กล่องเงินเข้า/เงินออก: ไอคอนในวงสีอ่อน + ยอดใหญ่สีเข้ม (สีอยู่ที่ไอคอน ไม่ระบายทั้งกล่อง) */
function FlowBox({
  icon: Icon,
  tone,
  label,
  amount,
  children,
}: Readonly<{
  icon: typeof ArrowDownLeft;
  tone: "in" | "out";
  label: string;
  amount: number;
  children?: ReactNode;
}>) {
  const chip = tone === "in" ? "bg-teal-50 text-teal-700" : "bg-orange-50 text-orange-700";
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`flex size-7 items-center justify-center rounded-full ${chip}`}>
          <Icon size={15} aria-hidden />
        </span>
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{money(amount)}</p>
      {children && <ul className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3">{children}</ul>}
    </div>
  );
}

/**
 * แท็บเงินสด (แบบ B ผู้ใช้เลือก 17 ต.ค.): กล่องเงินเข้า · กล่องเงินออก · กล่องคงเหลือ
 * ยอดรวมเด่นที่หัวกล่อง รายละเอียด (หักภาษี/เงินประกัน/VAT) เป็นตัวเล็กใต้ยอด เฉพาะที่มีจริง
 * คงเหลือเป็นสีตามสถานะ (เขียว/แดง/เทา)
 */
export function CashCard({
  report,
  onGoToContract,
}: Readonly<{ report: ProjectCostReportDto; detailed?: boolean; onGoToContract?: () => void }>) {
  const { cash } = report;
  const r = cash.receivedDetail;
  const o = cash.paidOutDetail;
  const short = cash.net < 0;
  const next = cash.nextInstallment;
  const hasReceivedDetail = r.withholding > 0 || r.retention > 0 || r.retentionReturned > 0;
  let balance = {
    box: "border-emerald-200 bg-emerald-50",
    label: "text-emerald-800",
    number: "text-emerald-700",
    divider: "border-emerald-200",
    title: "คงเหลือ",
    hint: "เงินเข้ามากกว่าเงินออก",
  };
  if (short) {
    balance = {
      box: "border-red-200 bg-red-50",
      label: "text-red-800",
      number: "text-red-700",
      divider: "border-red-200",
      title: "ออกเงินแทนลูกค้าอยู่",
      hint: "เงินออกมากกว่าเงินเข้า",
    };
  } else if (cash.net === 0) {
    balance = {
      box: "border-slate-200 bg-slate-50",
      label: "text-slate-600",
      number: "text-slate-900",
      divider: "border-slate-200",
      title: "คงเหลือ",
      hint: "เงินเข้าเท่ากับเงินออก",
    };
  }

  return (
    <section aria-labelledby="project-cash" className="flex flex-col gap-3">
      <h3 id="project-cash" className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-slate-800">
        <span className="inline-flex items-center gap-2">
          <Wallet size={16} className="text-slate-500" aria-hidden />
          เงินสดของโครงการ
        </span>
        <span className="font-normal text-slate-400">รวม VAT ตามเงินที่เข้า-ออกจริง ไม่ใช่กำไร</span>
      </h3>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <FlowBox icon={ArrowDownLeft} tone="in" label="เงินเข้า" amount={cash.received}>
          {hasReceivedDetail && (
            <>
              <SubLine label="ลูกค้าจ่ายงวด" value={r.installments} sign="+" />
              <SubLine label="หักภาษี ณ ที่จ่าย" value={r.withholding} sign="−" note="ได้คืนตอนยื่นภาษี" />
              <SubLine label="เงินประกันที่ลูกค้ากัน" value={r.retention} sign="−" note="ได้คืนตอนครบกำหนด" />
              <SubLine label="ได้เงินประกันคืน" value={r.retentionReturned} sign="+" />
            </>
          )}
        </FlowBox>

        <FlowBox icon={ArrowUpRight} tone="out" label="เงินออก" amount={cash.paidOut}>
          {/* ยอดที่สั่งแล้วยังไม่จ่ายไม่อยู่ในยอดนี้ — บอกไว้ที่กล่องคงเหลือแทน ไม่ให้อ่านว่ารวมอยู่แล้ว */}
          {o.vat > 0 && (
            <>
              <SubLine label="บิลก่อน VAT" value={o.beforeVat} />
              <SubLine label="VAT ในบิล" value={o.vat} note={report.vatClaimable ? "ขอคืนได้" : undefined} />
            </>
          )}
        </FlowBox>

        {/* แบบ 4 (ผู้ใช้เลือก 17 ต.ค.): สีตามสถานะ เขียว = เหลือ · แดง = ออกเงินแทนลูกค้า · เท่ากันพอดี = เทา
            เลิกนาวีทึบ เพราะชนกับปุ่มหลักและการ์ดราคาสุทธิ — สีนี้บอกสถานะ ไม่ใช่สีแบรนด์ */}
        <div className={`flex flex-col rounded-lg border p-4 ${balance.box}`}>
          <span className={`text-sm ${balance.label}`}>{balance.title}</span>
          <p className={`mt-2 text-2xl font-semibold tabular-nums ${balance.number}`}>{money(Math.abs(cash.net))}</p>
          <p className={`mt-1 text-xs ${balance.label}`}>{balance.hint}</p>
          {cash.committedOut > 0 && (
            <p className={`mt-auto border-t pt-3 text-xs ${balance.divider} ${balance.label}`}>
              สั่งแล้วยังไม่จ่าย {money(cash.committedOut)} · ถ้าจ่ายครบ{" "}
              {cash.projected < 0 ? `จะออกเงินแทนลูกค้า ${money(-cash.projected)}` : `จะเหลือ ${money(cash.projected)}`}
            </p>
          )}
        </div>
      </div>

      {short && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>
            {next ? (
              <>
                ควรเร่งเก็บ <b className="font-semibold">งวดที่ {next.seq}</b> ({next.milestone}) ยังค้าง{" "}
                <b className="font-semibold tabular-nums">{money(next.outstanding)}</b> บาท
                {next.dueOn ? ` · ครบกำหนด ${thaiDate(next.dueOn)}` : " · ยังไม่ได้ตั้งวันครบกำหนด"}
              </>
            ) : cash.contractSigned ? (
              "เก็บเงินครบทุกงวดแล้ว แต่ยังจ่ายออกมากกว่า — ตรวจว่าบันทึกบิลซ้ำ หรือมีงานเพิ่มที่ยังไม่ได้ออกใบงานเพิ่ม-ลด"
            ) : (
              "ยังไม่มีสัญญาที่ลงนาม จึงยังเก็บเงินลูกค้าไม่ได้"
            )}
          </p>
          {next && onGoToContract && (
            <button type="button" onClick={onGoToContract} className="link-pill -mr-2.5 shrink-0 font-medium text-red-800 hover:bg-red-100">
              ไปที่งวดรับเงิน →
            </button>
          )}
        </div>
      )}
      {!short && cash.projected < 0 && next && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ควรเก็บงวดที่ {next.seq} ก่อนจ่ายยอดที่สั่งไว้ — ไม่งั้นจะออกเงินแทนลูกค้า {money(-cash.projected)} บาท
        </p>
      )}
    </section>
  );
}

/** ใช้งบหมวดนี้ไปแล้วกี่ % (รวมที่สั่ง) — ช่วยเดาว่าของในบรรทัดนั้นซื้อไปแล้วหรือยัง */
function categoryUsage(report: ProjectCostReportDto, categoryId: string): number | null {
  const row = report.rows.find((r) => r.kind === "category" && r.categoryId === categoryId);
  if (!row?.budget) return null;
  return Math.round(((row.actual + row.committed) / row.budget) * 100);
}

function DriftLine({
  report,
  line,
  busy,
  onAck,
  onUnack,
}: Readonly<{
  report: ProjectCostReportDto;
  line: SignedPriceDriftLineDto;
  busy: boolean;
  onAck: (itemId: string) => void;
  onUnack: (itemId: string) => void;
}>) {
  const usage = categoryUsage(report, line.categoryId);
  const matChanged = line.from.materialUnitPrice !== line.to.materialUnitPrice;
  const labChanged = line.from.laborUnitPrice !== line.to.laborUnitPrice;
  const up = line.delta > 0;
  return (
    <li className={`grid grid-cols-1 gap-x-4 gap-y-1 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center ${line.acked ? "opacity-60" : ""}`}>
      <div className="min-w-0">
        <p className="text-slate-800">{line.name}</p>
        <p className="text-xs text-slate-500">
          {Number(line.quantity).toLocaleString("th-TH")} {line.unit}
          {matChanged && (
            <>
              {" · "}วัสดุ {money(line.from.materialUnitPrice)} → <b className="font-medium text-slate-700">{money(line.to.materialUnitPrice)}</b>
            </>
          )}
          {labChanged && (
            <>
              {" · "}ค่าแรง {money(line.from.laborUnitPrice)} → <b className="font-medium text-slate-700">{money(line.to.laborUnitPrice)}</b>
            </>
          )}
          {" "}/{line.unit} · คลังเปลี่ยน {thaiDate(line.changedAt)}
        </p>
        {line.components.length > 0 && (
          <p className="text-xs text-slate-400">
            {line.components.map((c) => `${c.name} ${c.from} → ${c.to}`).join(" · ")}
          </p>
        )}
        <p className="text-xs text-slate-400">
          {line.categoryCode ? `${line.categoryCode} ` : ""}
          {line.categoryName}
          {usage != null && ` · หมวดนี้ใช้งบไปแล้ว ${usage}%`}
        </p>
      </div>
      <span className={`text-right font-medium tabular-nums ${up ? "text-red-700" : "text-emerald-700"}`}>{signed(line.delta)}</span>
      {line.acked ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onUnack(line.itemId)}
          className="link-pill justify-self-start text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:bg-transparent sm:justify-self-end"
        >
          ซื้อแล้ว · ยกเลิก
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => onAck(line.itemId)}
          className="link-pill justify-self-start whitespace-nowrap text-xs font-medium text-brand disabled:bg-transparent disabled:opacity-50 sm:justify-self-end"
        >
          ซื้อแล้ว/ล็อกราคาแล้ว
        </button>
      )}
    </li>
  );
}

const PREVIEW = 5;

/**
 * ราคาในคลังเปลี่ยนหลังเซ็นสัญญา — ของที่ยังไม่ได้ซื้อจะแพง/ถูกกว่าที่ตั้งงบไว้
 * ระบบไม่รู้ว่าแต่ละบรรทัดซื้อไปแล้วเท่าไร (บิลลงระดับหมวด) ตัวเลขจึงคิดจากจำนวนทั้งบรรทัด และให้คนกด "ซื้อแล้ว" เอง
 */
export function PriceDriftCard({
  report,
  busy,
  onAck,
  onUnack,
}: Readonly<{
  report: ProjectCostReportDto;
  busy: boolean;
  onAck: (itemId: string) => void;
  onUnack: (itemId: string) => void;
}>) {
  const [showAll, setShowAll] = useState(false);
  const [showAcked, setShowAcked] = useState(false);
  const drift = report.priceDrift;
  if (!drift || drift.lines.length === 0) return null;
  const open = drift.lines.filter((l) => !l.acked);
  const acked = drift.lines.filter((l) => l.acked);
  const rising = drift.increase > 0;
  const shown = showAll ? open : open.slice(0, PREVIEW);
  const tone = rising ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white";

  return (
    <section aria-labelledby="signed-price-drift" className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex gap-2.5">
        <TrendingUp size={18} className={`mt-0.5 shrink-0 ${rising ? "text-amber-600" : "text-slate-400"}`} aria-hidden />
        <div className="min-w-0">
          <h3 id="signed-price-drift" className={`text-sm font-semibold ${rising ? "text-amber-900" : "text-slate-800"}`}>
            ราคาในคลังเปลี่ยนหลังเซ็นสัญญา {drift.contractNo}
            {open.length > 0 && <span className="font-normal"> · {open.length} รายการ</span>}
          </h3>
          <p className={`text-xs ${rising ? "text-amber-800" : "text-slate-500"}`}>
            {open.length === 0 ? (
              "กดซื้อแล้ว/ล็อกราคาแล้วครบทุกรายการ"
            ) : (
              <>
                {rising && (
                  <>
                    ถ้ายังไม่ได้ซื้อ ต้นทุนอาจเพิ่ม <b className="font-semibold tabular-nums">{money(drift.increase)}</b> บาท
                  </>
                )}
                {rising && drift.decrease > 0 && " · "}
                {drift.decrease > 0 && <>ถูกลง {money(drift.decrease)} บาท</>}
                {" "}— ควรรีบซื้อหรือล็อกราคากับร้านก่อนราคาขึ้นอีก · คิดจากจำนวนทั้งบรรทัด ระบบไม่รู้ว่าซื้อไปแล้วเท่าไร
              </>
            )}
          </p>
        </div>
      </div>

      {open.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200/80 bg-white">
          {shown.map((l) => (
            <DriftLine key={l.itemId} report={report} line={l} busy={busy} onAck={onAck} onUnack={onUnack} />
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap gap-x-2">
        {open.length > PREVIEW && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="link-pill -ml-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800"
          >
            {showAll ? "ย่อลง" : `ดูทั้งหมด (${open.length})`}
          </button>
        )}
        {acked.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAcked((v) => !v)}
            className="link-pill -ml-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-800"
          >
            {showAcked ? "ซ่อนที่ซื้อแล้ว" : `ซื้อแล้ว/ล็อกราคาแล้ว ${acked.length} รายการ`}
          </button>
        )}
      </div>
      {showAcked && acked.length > 0 && (
        <ul className="mt-2 divide-y divide-slate-100 rounded-md border border-slate-200/80 bg-white">
          {acked.map((l) => (
            <DriftLine key={l.itemId} report={report} line={l} busy={busy} onAck={onAck} onUnack={onUnack} />
          ))}
        </ul>
      )}
    </section>
  );
}
