import {
  hasThaiChars,
  passwordProblemCode,
  passwordRuleStates,
  passwordStrength,
  PASSWORD_PROBLEM_MESSAGES,
} from "@systemboq/shared-types";

/**
 * คำเตือนและตัวบอกใบ้ที่อยู่ใต้ช่องรหัสผ่าน
 *
 * ทุกตัวในไฟล์นี้อ่านกฎจาก @systemboq/shared-types ซึ่งเป็นชุดเดียวกับที่เซิร์ฟเวอร์ใช้ตัดสิน —
 * ห้ามเขียนเงื่อนไขความยาว/ความหลากหลายซ้ำในไฟล์นี้ ไม่งั้นวันหนึ่งหน้าเว็บกับเซิร์ฟเวอร์จะ
 * ตัดสินไม่ตรงกันแล้วคนจะเจอ "กดส่งแล้วขึ้นแดงโดยไม่มีอะไรเตือนไว้ก่อน"
 */

/** Caps Lock เปิดอยู่ — โทนเหลืองแบบเดียวกับกล่องบัญชีถูกล็อกชั่วคราวในหน้าเข้าสู่ระบบ */
export function CapsLockHint({ on }: Readonly<{ on: boolean }>) {
  if (!on) return null;
  return (
    // <output> (role=status ในตัว) ให้โปรแกรมอ่านหน้าจอประกาศตอนมันโผล่ระหว่างพิมพ์ โดยไม่ต้องย้ายโฟกัสออกจากช่อง
    <output className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 shrink-0"
        aria-hidden
      >
        <path d="M12 4 5 11h4v4h6v-4h4z" />
        <path d="M9 19h6" />
      </svg>
      เปิด Caps Lock อยู่ — ตัวพิมพ์ใหญ่ทั้งหมด
    </output>
  );
}

/**
 * ยังเป็นแป้นภาษาไทยอยู่ — ลืมสลับแป้นแล้วพิมพ์ "ฟหกด" แทน "asdf" เป็นเรื่องที่เจอบ่อยที่สุดในไทย
 * เตือนอย่างเดียว ไม่ห้าม (ใส่ไทยในรหัสได้ ถ้ามีอังกฤษพิมพ์ใหญ่/เล็ก ตัวเลข และอักขระพิเศษครบ)
 */
export function ThaiKeyboardHint({ value }: Readonly<{ value: string }>) {
  if (!hasThaiChars(value)) return null;
  return (
    <output className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
      <span aria-hidden className="rounded border border-amber-300 px-1 text-[10px] font-semibold leading-4">
        ก
      </span>
      <span>กำลังพิมพ์ภาษาไทย — ถ้าตั้งใจพิมพ์ภาษาอังกฤษ ให้สลับแป้นพิมพ์ก่อน</span>
    </output>
  );
}

/**
 * สีของแต่ละขีด — ขีดเดียวเป็นเทา ไม่ใช่แดง
 *
 * แดงในฟอร์มนี้สงวนไว้ให้ "สิ่งที่ทำให้ส่งไม่ผ่าน" ซึ่งรายการเงื่อนไขข้างล่างบอกอยู่แล้ว
 * แถบนี้ทำหน้าที่บอกว่า "ผ่านแล้วแต่ยังดีกว่านี้ได้" (2 = พอใช้ → 4 = แข็งแรง)
 */
const BAR_TONE: Record<number, string> = {
  1: "bg-slate-400",
  2: "bg-amber-400",
  3: "bg-emerald-500",
  4: "bg-emerald-600",
};

export function PasswordStrengthBar({
  value,
  personal = [],
}: Readonly<{ value: string; personal?: ReadonlyArray<string | null | undefined> }>) {
  // ต้องรู้ข้อมูลเจ้าของบัญชีด้วย ไม่งั้นแถบจะขึ้นว่า "พอใช้" ให้รหัสที่กดส่งไม่ผ่าน
  // (เช่นรหัสที่มีชื่อตัวเองอยู่ข้างใน) ซึ่งขัดกับข้อความสีส้มที่อยู่ใต้มันเอง
  const { score, label } = passwordStrength(value, personal);
  if (score === 0) return null;

  return (
    <div className="mt-2">
      {/* แถบเป็นภาพประกอบล้วน ข้อความข้างล่างบอกเรื่องเดียวกันเป็นคำอยู่แล้ว */}
      <div aria-hidden className="flex gap-1">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              step <= score ? BAR_TONE[score] : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        ความแข็งแรง: <span className="font-medium text-slate-700">{label}</span>
      </p>
    </div>
  );
}

/** ปัญหาที่รายการติ๊กถูกบอกไม่ได้ — เป็นข้อ "ห้าม" ไม่ใช่ข้อ "ต้องมี" จึงไม่มีวงกลมให้เติมเต็ม */
const BLOCKING_CODES = ["TOO_LONG", "TOO_REPETITIVE", "SEQUENTIAL", "COMMON", "PERSONAL"] as const;

function TickIcon({ ok }: Readonly<{ ok: boolean }>) {
  if (!ok) {
    // วงกลมว่าง — บอกว่า "ยังไม่ครบ" โดยไม่ตะโกนว่าทำผิด
    return <span aria-hidden className="mt-0.75 h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300" />;
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700"
      aria-hidden
    >
      <path d="m4 12.5 5 5L20 6.5" />
    </svg>
  );
}

/**
 * รายการเงื่อนไขรหัสผ่านทีละข้อ (ติ๊กเขียวทันทีที่ผ่าน) + เหตุผลที่ยังใช้ไม่ได้
 *
 * **โชว์ตั้งแต่โฟกัสช่อง** (`show`) ไม่ต้องรอพิมพ์ — คนต้องรู้กฎก่อนคิดรหัส ไม่ใช่หลังพิมพ์ผิดไปแล้ว
 * **หายไปเองเมื่อผ่านครบ** รายการที่ติ๊กครบแล้วค้างอยู่ทำให้ฟอร์มยาวขึ้นโดยไม่บอกอะไรใหม่
 * (และบนการ์ดใบมีดทำให้การ์ดสูงขึ้นถาวร) — แถบความแข็งแรงยังอยู่ต่อเพื่อบอกว่ายังทำให้ดีกว่านี้ได้
 *
 * @param personal ชื่อ/อีเมล/เบอร์โทรของเจ้าตัวถ้าฟอร์มนี้มี — ส่งมาเพื่อเตือนล่วงหน้าว่าห้ามใส่
 *                 ลงในรหัส แทนที่จะให้ไปรู้ตอนเซิร์ฟเวอร์ตอบกลับมา
 * @param show     บังคับโชว์แม้ยังไม่พิมพ์ (ส่ง true ตอนช่องได้โฟกัส)
 */
export function PasswordRules({
  value,
  personal = [],
  show = false,
}: Readonly<{ value: string; personal?: ReadonlyArray<string | null | undefined>; show?: boolean }>) {
  if (value === "" && !show) return null;

  const code = value === "" ? "TOO_SHORT" : passwordProblemCode(value, personal);
  // ผ่านครบแล้วและไม่มีข้อห้ามใดติด — เก็บรายการทิ้งไป
  if (code === null) return null;

  const rules = passwordRuleStates(value);
  const blocking = BLOCKING_CODES.find((c) => c === code);

  return (
    <div className="mt-2 flex flex-col gap-1" aria-label="เงื่อนไขรหัสผ่าน">
      <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            // ข้อเดี่ยวท้ายตาราง (อักขระพิเศษ) ข้อความยาวที่สุด — กินเต็มแถว ไม่ตัดกลางบรรทัด
            className={`flex items-start gap-1.5 text-xs leading-relaxed ${rule.id === "special" ? "sm:col-span-2" : ""}`}
          >
            <TickIcon ok={rule.ok} />
            <span className={ruleTone(rule.ok, rule.optional)}>
              {rule.label}
            </span>
            <span className="sr-only">{ruleStatusText(rule.ok, rule.optional)}</span>
          </li>
        ))}
      </ul>
      {blocking && (
        // ข้อห้ามใช้ส้มไม่ใช่แดง — แดงสงวนให้ข้อความผิดพลาดจากเซิร์ฟเวอร์หลังกดส่งจริง
        <output className="text-xs leading-relaxed text-amber-700 block">
          {PASSWORD_PROBLEM_MESSAGES[blocking]}
        </output>
      )}
    </div>
  );
}

/**
 * ผลเทียบช่องยืนยันรหัสผ่าน — บอกสด ๆ ว่าตรงกันหรือยัง (เงียบจนกว่าจะเริ่มพิมพ์ช่องยืนยัน)
 */
export function PasswordMatchHint({ password, confirm }: Readonly<{ password: string; confirm: string }>) {
  if (confirm === "") return null;
  const ok = confirm === password;
  return (
    <output className={`mt-1.5 flex items-start gap-1.5 text-xs ${ok ? "text-emerald-700" : "text-amber-700"}`}>
      {ok ? <TickIcon ok /> : <span aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-center leading-3">✕</span>}
      {ok ? "รหัสผ่านตรงกัน" : "รหัสผ่านทั้งสองช่องยังไม่ตรงกัน"}
    </output>
  );
}

/** สีป้ายของข้อกำหนด: ผ่าน = เขียว · ข้อแนะนำที่ยังไม่ผ่าน = เทาจาง · ข้อบังคับที่ยังไม่ผ่าน = เทา */
function ruleTone(ok: boolean, optional: boolean | undefined) {
  if (ok) return "text-emerald-700";
  return optional ? "text-slate-400" : "text-slate-600";
}

/** ข้อความสำหรับโปรแกรมอ่านหน้าจอ (ข้อแนะนำที่ยังไม่ผ่านไม่ต้องอ่านว่าไม่ผ่าน) */
function ruleStatusText(ok: boolean, optional: boolean | undefined) {
  if (ok) return " — ผ่านแล้ว";
  return optional ? "" : " — ยังไม่ผ่าน";
}
