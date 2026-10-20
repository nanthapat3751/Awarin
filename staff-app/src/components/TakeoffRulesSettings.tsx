import {
  DEFAULT_TAKEOFF_RULES,
  type TakeoffRulePresets,
  type TakeoffRuleSet,
} from "@systemboq/shared-types";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";

import { ApiError } from "../lib/api";
import { getTakeoffRules, saveTakeoffRules } from "../lib/settings-api";
import { useToast } from "../lib/toast-context";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { DetailSkeleton } from "./Skeleton";

const FLAGS: { key: keyof Pick<TakeoffRuleSet, "deductCover" | "bends" | "laps" | "hooks" | "fullDepthLayers">; label: string; off?: string; on?: string }[] = [
  { key: "deductCover", label: "หักระยะหุ้มคอนกรีต", off: "ยาวตามแบบเต็มชิ้น" },
  { key: "bends", label: "บวกงอปลาย / ฝังฐานราก", off: "ตะแกรงรูปตัว U ที่แบบเขียนไว้ยังงอขึ้นเสมอ" },
  { key: "laps", label: "บวกระยะทาบเมื่อยาวเกินเหล็กที่ขาย" },
  { key: "hooks", label: "บวกขอปลอก 2 ข้าง", off: "ปลอกวัดรอบนอก" },
  { key: "fullDepthLayers", label: "นับชั้นปลอกหัวเสาเข็มเต็มความหนา", off: "นับเฉพาะในระยะหุ้ม" },
];

const NUMS: { key: keyof Pick<TakeoffRuleSet, "lapFactor" | "bendFactor" | "stockLength" | "hookFactor">; label: string; unit: string }[] = [
  { key: "lapFactor", label: "ระยะทาบ", unit: "× d" },
  { key: "bendFactor", label: "งอปลาย", unit: "× d" },
  { key: "hookFactor", label: "ขอปลอกต่อข้าง", unit: "× d" },
  { key: "stockLength", label: "เหล็กยาวต่อเส้น", unit: "ม." },
];

// ขนาดที่ใช้บ่อยในบ้านพักอาศัย — ช่องว่าง = ไม่ใส่เผื่อเสียให้ (ไม่เดา)
const WASTE_SIZES = [6, 9, 10, 12, 16, 20, 25];
const barCode = (dia: number) => (dia === 6 || dia === 9 ? `RB${dia}` : `DB${dia}`);

const INPUT = "w-full min-w-0 rounded-md border border-slate-300 px-2 py-1 text-right text-sm tabular-nums disabled:bg-slate-50";

function RuleCard({
  title,
  description,
  rule,
  readOnly,
  onChange,
  onReset,
  children,
}: Readonly<{
  title: string;
  description: string;
  rule: TakeoffRuleSet;
  readOnly: boolean;
  onChange: (next: TakeoffRuleSet) => void;
  onReset: () => void;
  children?: React.ReactNode;
}>) {
  return (
    <section className="flex min-w-72 flex-1 flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {!readOnly && (
            <button type="button" onClick={onReset} className="link-pill -my-1 -mr-2.5 ml-auto text-xs font-medium text-brand">
              คืนค่ามาตรฐาน
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        {FLAGS.map((f) => (
          <label key={f.key} className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={rule[f.key]}
              disabled={readOnly}
              onChange={(e) => onChange({ ...rule, [f.key]: e.target.checked })}
            />
            <span>
              {f.label}
              {!rule[f.key] && f.off && <span className="block text-xs text-slate-400">{f.off}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NUMS.map((n) => (
          <label key={n.key} className="flex flex-col gap-1 text-xs text-slate-600">
            {n.label}
            <span className="flex items-center gap-1">
              <input
                type="number"
                min="0"
                step="any"
                value={String(rule[n.key])}
                disabled={readOnly}
                onChange={(e) => onChange({ ...rule, [n.key]: e.target.value === "" ? Number.NaN : Number(e.target.value) })}
                className={INPUT}
              />
              <span className="shrink-0 text-slate-400">{n.unit}</span>
            </span>
          </label>
        ))}
      </div>
      {children}
    </section>
  );
}

/**
 * ตั้งค่า → ถอดปริมาณ: ชุดกฎสองชุดที่ตัวคิดชิ้นส่วนโครงสร้างใช้
 * BOQ/ใบเสนอราคา = ชุดเสนอราคา · รายการสั่งเหล็กหน้างาน = ชุดสั่งตัด (คิดจากขนาดชิ้นส่วนชุดเดียวกัน)
 * ทุกคนเห็นได้ แก้ได้เฉพาะเจ้าของ (เซิร์ฟเวอร์ตรวจซ้ำ)
 */
export function TakeoffRulesSettings({ isOwner }: Readonly<{ isOwner: boolean }>) {
  const toast = useToast();
  const [saved, setSaved] = useState<TakeoffRulePresets | null>(null);
  const [draft, setDraft] = useState<TakeoffRulePresets | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getTakeoffRules()
      .then(({ rules }) => {
        setSaved(rules);
        setDraft(rules);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "โหลดชุดกฎไม่สำเร็จ"));
  }, []);

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!draft || !saved) return <DetailSkeleton />;

  const readOnly = !isOwner;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const invalid = [draft.tender, draft.site].some((r) => NUMS.some((n) => !Number.isFinite(r[n.key])));

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const { rules } = await saveTakeoffRules(draft);
      setSaved(rules);
      setDraft(rules);
      toast.success("บันทึกชุดกฎแล้ว — บรรทัดที่ลง BOQ ไปแล้วไม่เปลี่ยนเอง");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกชุดกฎไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-5xl flex-col gap-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">ชุดกฎการถอดปริมาณ</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          กรอกขนาดชิ้นส่วนครั้งเดียวในหน้าต่าง “คำนวณโครงสร้าง” ระบบคิดสองชุด: BOQ/ใบเสนอราคาใช้ “ชุดเสนอราคา” ·
          รายการสั่งเหล็กหน้างานใช้ “ชุดสั่งตัด” · มีผลกับเหล็กเสริมเท่านั้น คอนกรีต/ไม้แบบคิดเหมือนกัน
        </p>
        <div className="mt-2">
          <Notice tone="amber">
            แก้กฎแล้ว บรรทัดที่ลง BOQ ไปแล้วไม่เปลี่ยนเอง (เหมือนราคาในคลังเปลี่ยน) — ชิ้นส่วนที่ลงหลังจากนี้ใช้กฎใหม่ ·
            รายการสั่งเหล็กหน้างานคิดด้วยชุดสั่งตัดล่าสุดเสมอ
          </Notice>
        </div>
        {readOnly && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <Lock size={13} aria-hidden /> ดูได้อย่างเดียว — แก้ได้เฉพาะเจ้าของระบบ
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <RuleCard
          title="ชุดเสนอราคา"
          description="Estimator/QS · เร็ว ใช้มาตรฐานกลาง · ใช้กับ BOQ และใบเสนอราคา"
          rule={draft.tender}
          readOnly={readOnly}
          onChange={(next) => setDraft({ ...draft, tender: { ...draft.tender, ...next } })}
          onReset={() => setDraft({ ...draft, tender: DEFAULT_TAKEOFF_RULES.tender })}
        >
          <div>
            <p className="text-xs text-slate-700">
              เผื่อเสียรายขนาด <span className="text-slate-400">(ใส่ในบรรทัดเหล็กใหม่ของ BOQ ให้เอง · ว่าง = ไม่ใส่)</span>
            </p>
            <div className="mt-1 grid grid-cols-4 gap-2">
              {WASTE_SIZES.map((dia) => {
                const v = draft.tender.wastePct[String(dia)];
                return (
                  <label key={dia} className="flex flex-col gap-1 text-xs text-slate-600">
                    {barCode(dia)}
                    <span className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="any"
                        value={v == null ? "" : String(v)}
                        disabled={readOnly}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            tender: {
                              ...draft.tender,
                              wastePct: { ...draft.tender.wastePct, [String(dia)]: e.target.value === "" ? null : Number(e.target.value) },
                            },
                          })
                        }
                        className={INPUT}
                      />
                      <span className="shrink-0 text-slate-400">%</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-400">ค่าตั้งต้น RB6 5 · RB9 7 · DB12 9 · DB16 11 มาจากไฟล์ BOQ จริงของบริษัท</p>
          </div>
        </RuleCard>
        <RuleCard
          title="ชุดสั่งตัด"
          description="โฟร์แมน/วิศวกรสนาม · ใกล้ความยาวที่ตัดจริง · ใช้กับรายการสั่งเหล็กหน้างาน"
          rule={draft.site}
          readOnly={readOnly}
          onChange={(next) => setDraft({ ...draft, site: next })}
          onReset={() => setDraft({ ...draft, site: DEFAULT_TAKEOFF_RULES.site })}
        />
      </div>

      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button variant="brand" onClick={save} disabled={!dirty || invalid || saving}>
            {saving ? "กำลังบันทึก..." : "บันทึกชุดกฎ"}
          </Button>
          {invalid && <span className="text-xs text-red-600">กรอกค่ามาตรฐานให้ครบทุกช่อง</span>}
          {dirty && !invalid && (
            <button type="button" onClick={() => setDraft(saved)} className="link-pill text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              ยกเลิกที่แก้
            </button>
          )}
        </div>
      )}
    </div>
  );
}
