import { rebarUnitWeightKgPerM, rebarWeightKg, STANDARD_REBARS } from "@systemboq/shared-types";
import { Calculator, ChevronDown } from "lucide-react";

import { Button } from "./Button";

/** หน่วยที่ผลลัพธ์ของเครื่องมือนี้เป็นเสมอ — ใช้เทียบกับหน่วยนับของบรรทัด */
const KG = "กก.";

const LABEL = "flex flex-col gap-1 text-xs text-slate-700";
const INPUT = "border border-slate-300 rounded-md px-2 py-1 text-sm";

/**
 * เครื่องมือแปลง "ความยาวเหล็กเส้นรวม (ม.)" → "น้ำหนัก (กก.)" สำหรับกรอกเป็นปริมาณของบรรทัด BOQ
 * (กก. = ความยาว × d²/162 — สูตรมาตรฐานงานก่อสร้าง)
 *
 * ใช้ร่วมกันทั้งฟอร์มเพิ่มบรรทัดและแผงแก้ไขบรรทัด เดิมเป็นโค้ดคนละชุดที่ก๊อปกันมา ทำให้แก้ที่เดียว
 * แล้วอีกที่ยังเป็นแบบเก่า
 *
 * เจตนาของหน้าตา: ผู้ใช้ที่เพิ่งเห็นครั้งแรกต้องรู้ทันทีว่า "กรอกอะไร แล้วได้อะไร ไปโผล่ตรงไหน" —
 * จึงมีบรรทัดบอกจุดประสงค์ · เลขลำดับหน้าช่องกรอก · ช่องผลลัพธ์ที่บอกเหตุผลเมื่อยังใช้ไม่ได้
 * แทนที่จะเป็นขีด "—" เฉย ๆ · และปุ่มบอกปลายทางตรง ๆ ว่า "ใส่ลงช่องจำนวน"
 */
export function RebarCalculator({
  open,
  onToggle,
  diameterMm,
  onDiameterChange,
  lengthM,
  onLengthChange,
  unit,
  onUnitChange,
  onInsert,
}: Readonly<{
  open: boolean;
  onToggle: () => void;
  diameterMm: string;
  onDiameterChange: (value: string) => void;
  lengthM: string;
  onLengthChange: (value: string) => void;
  /** หน่วยนับปัจจุบันของบรรทัด ใช้เตือนเมื่อไม่ใช่ กก. */
  unit: string;
  /** ไม่ส่งมา = หน่วยนับถูกล็อก (บรรทัดผูกกับวัสดุในแคตตาล็อก) จึงได้แค่เตือน เปลี่ยนให้ไม่ได้ */
  onUnitChange?: (unit: string) => void;
  /** ส่งน้ำหนักที่คิดได้ (กก.) กลับให้ผู้เรียกไปใส่ในช่องจำนวน */
  onInsert: (weightKg: number) => void;
}>) {
  const dia = Number(diameterMm);
  const len = Number(lengthM);
  const ready = lengthM.trim() !== "" && Number.isFinite(len) && len > 0;
  const weight = ready ? rebarWeightKg(len, dia) : null;
  const perMetre = rebarUnitWeightKgPerM(dia);
  const unitIsKg = unit.trim() === KG;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
          <Calculator size={14} /> คิดน้ำหนักเหล็กเส้น
          <ChevronDown
            size={14}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </Button>
        {!open && (
          <span className="text-xs text-slate-500">แปลงความยาว (ม.) เป็นน้ำหนัก (กก.)</span>
        )}
      </div>

      {open && (
        <div className="mt-1 rounded-md border border-brand/30 bg-brand/5 p-3">
          <p className="text-xs text-slate-600">
            <span>กรอกความยาวเหล็กทั้งหมด แล้วกดปุ่มเพื่อใส่น้ำหนักลงช่อง “จำนวน”</span>
            <span className="text-slate-400"> · สูตรมาตรฐาน กก. = ความยาว × d²/162</span>
          </p>

          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className={LABEL}>
              <span>1. ขนาดเหล็ก</span>
              <select
                value={diameterMm}
                onChange={(e) => onDiameterChange(e.target.value)}
                className={INPUT}
              >
                {STANDARD_REBARS.map((r) => (
                  <option key={r.code} value={String(r.diameterMm)}>
                    {r.code} (Ø{r.diameterMm})
                  </option>
                ))}
              </select>
            </label>

            <label className={LABEL}>
              <span>2. ความยาวรวม (ม.)</span>
              <input
                type="number"
                step="0.01"
                value={lengthM}
                onChange={(e) => onLengthChange(e.target.value)}
                placeholder="เช่น 250"
                className={`${INPUT} w-28 text-right`}
              />
            </label>

            {/* ช่องผลลัพธ์: ยังไม่กรอก = บอกว่าให้ทำอะไรต่อ ไม่ใช่ปล่อยขีดว่าง ๆ ให้เดา */}
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-slate-500">น้ำหนักที่ได้</span>
              {weight == null ? (
                <span className="py-1 text-slate-400">กรอกความยาวก่อน</span>
              ) : (
                <span className="py-1">
                  <span className="text-sm font-semibold text-slate-800">
                    {weight.toLocaleString("th-TH", { maximumFractionDigits: 3 })} กก.
                  </span>
                  <span className="text-slate-400">
                    {" "}
                    ({len.toLocaleString("th-TH")} ม. × {perMetre.toFixed(3)} กก./ม.)
                  </span>
                </span>
              )}
            </div>

            <Button
              size="sm"
              variant="secondary"
              disabled={weight == null}
              onClick={() => {
                if (weight == null) return;
                // ปัดที่ 3 ตำแหน่ง — ปริมาณ BOQ ไม่ต้องละเอียดกว่านี้ และกันเลขทศนิยมยาวเหยียด
                onInsert(Math.round(weight * 1000) / 1000);
                if (onUnitChange && !unitIsKg) onUnitChange(KG);
              }}
            >
              ใส่ลงช่องจำนวน
            </Button>
          </div>

          {/* ตัวเลขที่ใส่เป็นกิโลกรัมเสมอ ถ้าหน่วยนับของบรรทัดเป็นอย่างอื่นราคาจะผิดทั้งบรรทัด */}
          {!unitIsKg &&
            (onUnitChange ? (
              <p className="mt-2 text-xs text-slate-500">
                {unit.trim() === ""
                  ? "กดใส่แล้วจะตั้ง “หน่วยนับ” เป็น กก. ให้ด้วย"
                  : `กดใส่แล้วจะเปลี่ยน “หน่วยนับ” จาก ${unit} เป็น กก. ให้ด้วย`}
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-600">
                หน่วยนับของรายการนี้คือ “{unit || "-"}” ไม่ใช่ กก. — ตัวเลขที่ใส่เป็นกิโลกรัม
                ราคาต่อหน่วยต้องเป็นราคาต่อกิโลกรัมด้วย
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
