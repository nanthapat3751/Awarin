import type {
  ContractStructureDto,
  ContractTemplateDto,
  ContractVariableInfo,
} from "@systemboq/shared-types";
import { EMPTY_CONTRACT_STRUCTURE } from "@systemboq/shared-types";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  FilePen,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button, buttonClasses } from "../components/Button";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { VariableField } from "../components/VariableField";
import { VariableAutocomplete, VariableMenuButton, VariablePlacer } from "../components/VariablePicker";
import { ApiError } from "../lib/api";
import { restoreTrashItem } from "../lib/trash-api";
import { useConfirm } from "../lib/confirm-context";
import {
  createContractTemplate,
  deleteContractTemplate,
  listContractTemplates,
  setDefaultContractTemplate,
  updateContractTemplate,
} from "../lib/contract-templates-api";
import { useToast } from "../lib/toast-context";
import { rowKey, sameRowKey } from "../lib/row-keys";
import { PanelSkeleton } from "../components/Skeleton";
import { Tooltip } from "../components/Tooltip";

/*
 * หน้านี้ใช้แนวทาง "แผ่นเอกสาร": ตัวสัญญาอยู่บนกระดาษแผ่นเดียวต่อเนื่อง ไม่ใช่การ์ดใบละช่อง
 * เพราะของเดิมเป็นการ์ดขาว 14 ใบน้ำหนักเท่ากันหมด — "ชื่อแม่แบบ (ใช้ภายใน)" ที่ไม่มีวันขึ้นเอกสาร
 * ดูสำคัญเท่าตัวเนื้อสัญญา จึงแยกเป็นสองชั้นชัด ๆ:
 *   บนกระดาษ = สิ่งที่พิมพ์ลงสัญญาจริง (ชื่อบนหน้าปก / บรรทัดใต้ชื่อ / อารัมภบท / ข้อ / ปิดท้าย)
 *   นอกกระดาษ = ของใช้ภายใน (ชื่อแม่แบบ, คำอธิบาย) ยุบเก็บไว้ กางเมื่อต้องแก้
 * สัดส่วนตัวอักษรบนกระดาษล้อของจริงใน server/src/lib/pdf/contract-pdf.ts (หัวปกกลาง หนา
 * เว้นตัวอักษร · เนื้อบรรทัดห่าง 1.9) แต่ไม่ก๊อปไฟล์ฟอนต์ Sarabun มาไว้ฝั่งหน้าเว็บ
 * เพราะจะกลายเป็นฟอนต์สองชุดที่หลุดจากกันได้
 */

/*
 * ช่องกรอกบนกระดาษ: ไม่มีกรอบ บอกว่ากดได้ด้วยพื้นอ่อนตอนชี้ และวงแหวนตอนโฟกัส — ตัวกรอบอยู่ใน
 * VariableField (ต้องย้ายพื้นไปไว้ที่ตัวครอบ เพราะช่องพิมพ์ต้องใสเสมอให้ไฮไลต์ตัวแปรข้างหลังโผล่)
 * ที่นี่เหลือแค่ "ตัวอักษร" ของแต่ละช่อง ซึ่งต้องใช้ร่วมกันทั้งช่องพิมพ์และชั้นไฮไลต์
 */
const PAPER_BODY = "text-sm leading-[1.9] text-slate-700";
/** ป้ายกำกับส่วนบนกระดาษ — เงียบ ไม่แย่งน้ำหนักกับถ้อยคำสัญญา */
const SECTION_LABEL = "mb-1 text-[11px] tracking-wide text-slate-400";
const GHOST_BTN =
  "rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 " +
  "disabled:pointer-events-none disabled:opacity-25";
/**
 * ปุ่มบนแถบหัวที่เปิด/ปิดของบางอย่าง ค้างสภาพกดไว้ตอนเปิดอยู่ — ใช้ตัวเลือก aria-expanded
 * เพราะมีน้ำหนักมากกว่า `bg-white` ของ ghost จึงชนะแน่นอนโดยไม่ต้องลุ้นลำดับคลาส
 */
const PRESSED_WHEN_OPEN =
  "aria-expanded:border-slate-400 aria-expanded:bg-slate-100 aria-expanded:text-slate-800";

/**
 * นับเฉพาะ "เนื้อความ" ที่เป็นถ้อยคำสัญญาจริง — ไม่นับหัวข้อ เพราะระบบเติม "ข้อ 1." ให้เอง
 * ตอนกดเพิ่มข้อ แม่แบบเปล่า ๆ จึงมีหัวข้ออยู่แล้วโดยที่ยังไม่มีใครพิมพ์อะไรเลย
 */
function bodyTextLength(s: ContractStructureDto): number {
  return (
    s.preamble.trim().length +
    s.clauses.reduce((n, c) => n + c.body.trim().length, 0) +
    s.closing.trim().length
  );
}

/**
 * เกณฑ์ "ยังไม่มีเนื้อหา" — วัดจากของจริงในระบบ: แม่แบบมาตรฐาน 9 ข้อ = 5,012 ตัวอักษร
 * ส่วนแม่แบบที่กดเซฟทิ้งไว้โดยไม่พิมพ์อะไร = 5 ตัวอักษร. 100 จึงต่ำกว่าของจริง 50 เท่า
 * และสูงกว่าของเปล่า 20 เท่า — ไม่มีทางไปโดนสัญญาจริงแม้ฉบับสั้น
 *
 * ตั้งใจ**ไม่**ไปเพิ่มความยาวขั้นต่ำในตัวตรวจฝั่งเซิร์ฟเวอร์ เพราะจะบล็อกคนที่ตั้งใจเซฟงานค้าง
 * ไว้เขียนต่อ — กันเฉพาะ "การกระทำที่อันตราย" คือการตั้งเป็นค่าเริ่มต้นก็พอ
 */
const THIN_BODY_CHARS = 100;

/** ทำสำเนาลึกก่อนแก้ ไม่งั้นการกด "ยกเลิก" จะคืนค่าไม่ได้เพราะ state เดิมถูกแก้ไปแล้ว */
function cloneStructure(s: ContractStructureDto): ContractStructureDto {
  return { ...s, clauses: s.clauses.map((c) => ({ ...c })) };
}

export function ContractTemplatesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [templates, setTemplates] = useState<ContractTemplateDto[]>([]);
  const [variableInfo, setVariableInfo] = useState<ContractVariableInfo[]>([]);
  const [blockTokens, setBlockTokens] = useState<string[]>([]);
  /** รายชื่อที่ใช้ตัดสินว่า {{...}} ไหนถูก/ผิด — มาจากเซิร์ฟเวอร์ ตัวเดียวกับที่ใช้แทนค่าจริง */
  const vocab = useMemo(
    () => ({ variables: variableInfo.map((v) => v.name), blocks: blockTokens }),
    [variableInfo, blockTokens],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** แถบ "ข้อมูลแม่แบบ" ยุบไว้ก่อน — เป็นของใช้ภายใน ไม่ได้แก้บ่อยเท่าตัวสัญญา */
  const [metaOpen, setMetaOpen] = useState(false);

  // ฟอร์มที่กำลังแก้ — แยกจากรายการ เพื่อให้กด "ยกเลิก" แล้วกลับไปค่าที่บันทึกไว้ได้
  const [form, setForm] = useState<{
    name: string;
    description: string;
    docTitle: string;
    structure: ContractStructureDto;
  } | null>(null);
  const [isNew, setIsNew] = useState(false);

  /** ตัวครอบกระดาษ — พิมพ์ {{ ในช่องไหนก็ได้ข้างในแล้วรายการตัวแปรเด้งขึ้นใต้เคอร์เซอร์ */
  const paperRef = useRef<HTMLDivElement>(null);
  /** ตัวแปรที่เลือกจากปุ่มบนแถบหัวแล้ว กำลังรอคลิกวางในเนื้อสัญญา (null = ไม่ได้อยู่ในโหมดวาง) */
  const [placing, setPlacing] = useState<string | null>(null);

  async function refresh(keepId?: string) {
    setLoading(true);
    try {
      const res = await listContractTemplates();
      setTemplates(res.templates);
      setVariableInfo(res.variableInfo);
      setBlockTokens(res.blockTokens);
      const next = keepId ?? selectedId ?? res.templates[0]?.id ?? null;
      setSelectedId(next);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "โหลดแม่แบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // โหลดครั้งเดียวตอนเข้าหน้า
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  // เปลี่ยนแม่แบบที่เลือก → เติมฟอร์มใหม่ (ทิ้งสิ่งที่ยังไม่บันทึกของอันเดิม)
  useEffect(() => {
    if (!selected || isNew) return;
    setForm({
      name: selected.name,
      description: selected.description ?? "",
      docTitle: selected.docTitle,
      structure: cloneStructure(selected.structure),
    });
  }, [selected, isNew]);

  function startNew() {
    setIsNew(true);
    setSelectedId(null);
    // แม่แบบใหม่ยังไม่มีชื่อ ต้องกางแถบข้อมูลแม่แบบให้เห็นช่องกรอกทันที
    setMetaOpen(true);
    setForm({
      name: "",
      description: "",
      docTitle: "สัญญาเหมาทำการก่อสร้าง",
      structure: cloneStructure(EMPTY_CONTRACT_STRUCTURE),
    });
  }

  function patchStructure(patch: Partial<ContractStructureDto>) {
    setForm((f) => (f ? { ...f, structure: { ...f.structure, ...patch } } : f));
  }

  function patchClause(index: number, patch: Partial<{ heading: string; body: string }>) {
    setForm((f) => {
      if (!f) return f;
      const clauses = f.structure.clauses.map((c, i) => (i === index ? sameRowKey(c, { ...c, ...patch }) : c));
      return { ...f, structure: { ...f.structure, clauses } };
    });
  }

  function moveClause(index: number, delta: number) {
    setForm((f) => {
      if (!f) return f;
      const clauses = [...f.structure.clauses];
      const target = index + delta;
      if (target < 0 || target >= clauses.length) return f;
      [clauses[index], clauses[target]] = [clauses[target], clauses[index]];
      return { ...f, structure: { ...f.structure, clauses } };
    });
  }

  function addClause() {
    setForm((f) => {
      if (!f) return f;
      const n = f.structure.clauses.length + 1;
      return {
        ...f,
        structure: {
          ...f.structure,
          clauses: [...f.structure.clauses, { heading: `ข้อ ${n}.`, body: "" }],
        },
      };
    });
  }

  function removeClause(index: number) {
    setForm((f) => {
      if (!f || f.structure.clauses.length <= 1) return f;
      return {
        ...f,
        structure: { ...f.structure, clauses: f.structure.clauses.filter((_, i) => i !== index) },
      };
    });
  }

  async function save() {
    if (!form) return;
    if (!form.name.trim()) {
      // ช่องชื่ออยู่ในแถบที่ยุบได้ — ถ้าไม่กางให้ ผู้ใช้จะเห็นแต่ toast โดยไม่เห็นช่องที่ต้องแก้
      setMetaOpen(true);
      toast.error("กรุณากรอกชื่อแม่แบบ");
      return;
    }
    if (!form.structure.preamble.trim()) {
      toast.error("อารัมภบทต้องไม่ว่าง");
      return;
    }
    if (form.structure.clauses.some((c) => !c.heading.trim() || !c.body.trim())) {
      toast.error("มีข้อสัญญาที่หัวข้อหรือเนื้อความยังว่างอยู่");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        docTitle: form.docTitle.trim(),
        structure: form.structure,
      };
      const res = isNew
        ? await createContractTemplate(payload)
        : await updateContractTemplate(selectedId!, payload);
      setIsNew(false);
      await refresh(res.template.id);
      if (res.unknownVariables.length > 0) {
        toast.info(
          `บันทึกแล้ว แต่มีตัวแปรที่ระบบไม่รู้จัก: ${res.unknownVariables
            .map((v) => `{{${v}}}`)
            .join(" ")} — จะถูกพิมพ์ลงสัญญาตามที่พิมพ์ไว้`,
        );
      } else {
        toast.success("บันทึกแม่แบบแล้ว");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(t: ContractTemplateDto) {
    const len = bodyTextLength(t.structure);
    if (len < THIN_BODY_CHARS) {
      // บอกตัวเลขจริงทั้งสองฝั่ง ให้คนตัดสินจากข้อเท็จจริง ไม่ใช่แค่คำเตือนลอย ๆ
      const current = templates.find((x) => x.isDefault);
      const compare = current
        ? ` ขณะที่ตัวที่ใช้อยู่ "${current.name}" มี ${bodyTextLength(current.structure).toLocaleString()} ตัวอักษร`
        : "";
      const ok = await confirm(
        `แม่แบบ "${t.name}" มีเนื้อความรวมแค่ ${len} ตัวอักษร${compare} — ` +
          "สัญญาที่ออกหลังจากนี้โดยไม่เลือกแม่แบบเองจะใช้ตัวนี้ และจะได้เอกสารที่แทบไม่มีข้อความ",
        { confirmLabel: "ตั้งเป็นค่าเริ่มต้นทั้งที่ยังไม่มีเนื้อหา", variant: "danger" },
      );
      if (!ok) return;
    }
    try {
      await setDefaultContractTemplate(t.id);
      await refresh(t.id);
      toast.success("ตั้งเป็นแม่แบบเริ่มต้นแล้ว");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ตั้งค่าไม่สำเร็จ");
    }
  }

  async function remove(t: ContractTemplateDto) {
    const ok = await confirm(
      `ย้าย "${t.name}" ไปถังขยะ? สัญญาที่ออกไปแล้วไม่ได้รับผลกระทบ เพราะเก็บถ้อยคำของตัวเองไว้แล้ว`,
      { confirmLabel: "ลบ", variant: "danger" },
    );
    if (!ok) return;
    try {
      await deleteContractTemplate(t.id);
      setSelectedId(null);
      await refresh();
      toast.undo("ย้ายแม่แบบสัญญาไปถังขยะแล้ว", async () => {
        await restoreTrashItem("contractTemplate", t.id);
        await refresh();
        setSelectedId(t.id);
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <Layout>
      <PageHeader
        title="แม่แบบสัญญา"
        subtitle="ถ้อยคำกลางที่ใช้ตอนออกสัญญา แก้ที่นี่ได้เลยไม่ต้องแก้โปรแกรม — สัญญาที่ออกไปแล้วจะไม่เปลี่ยนตาม เพราะเก็บถ้อยคำของตัวเองไว้ตั้งแต่วันที่ออก"
      />

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {loading && <PanelSkeleton lines={8} />}

      {!loading && form && (
        <>
          {/* ---------- แถบควบคุมติดขอบบน: เลือกแม่แบบ · ข้อมูลภายใน · ตัวแปร ---------- */}
          {/* พื้นต้องทึบ 100% — ตอนลองแบบโปร่ง 95% + เบลอ ตัวหนังสือที่เลื่อนลอดใต้แถบ
              โผล่จาง ๆ ที่ริมล่างเหมือนภาพเพี้ยน ไม่ใช่เอฟเฟกต์ */}
          <div className="sticky top-0 z-20 -mx-6 border-b border-slate-200 bg-slate-50 px-6 pb-2 pt-1">
            <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-1">
              {/* แม่แบบเป็นแท็บ ไม่ใช่คอลัมน์ 260px — ของเดิมกินความกว้างตลอดหน้า
                  เพื่อแสดงรายการที่ตอนนี้มีอยู่รายการเดียว */}
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {templates.map((t) => {
                  const active = t.id === selectedId && !isNew;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setIsNew(false);
                        setSelectedId(t.id);
                      }}
                      className={`flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-sm transition-colors ${
                        active
                          ? "border-brand font-medium text-brand"
                          : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {t.name}
                      {t.isDefault && (
                        <Star size={11} className="fill-amber-400 text-amber-400" aria-label="ค่าเริ่มต้น" />
                      )}
                      {bodyTextLength(t.structure) < THIN_BODY_CHARS && (
                        <span className="rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-700">
                          ยังไม่มีเนื้อหา
                        </span>
                      )}
                    </button>
                  );
                })}
                {isNew && (
                  <span className="border-b-2 border-brand px-2 py-1.5 text-sm font-medium text-brand">
                    แม่แบบใหม่
                  </span>
                )}
                <button
                  type="button"
                  onClick={startNew}
                  className="ml-1 flex items-center gap-1 border-b-2 border-transparent px-2 py-1.5 text-sm text-slate-500 transition-colors hover:text-brand"
                >
                  <Plus size={14} /> สร้างแม่แบบใหม่
                </button>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* เลือกตัวแปรก่อน แล้วคลิกตรงที่จะวางในเนื้อสัญญา — ไม่ต้องคลิกเนื้อสัญญาเตรียมไว้ก่อน */}
                <VariableMenuButton
                  variables={variableInfo}
                  blockTokens={blockTokens}
                  placing={placing}
                  onChoose={setPlacing}
                  onCancelPlacing={() => setPlacing(null)}
                  className={`${buttonClasses("ghost", "sm")} ${PRESSED_WHEN_OPEN}`}
                />
                {/* ลูกศรอยู่ท้ายปุ่ม (ของเดิมอยู่หน้าคำ อ่านเหมือนหัวข้อที่ยุบได้) */}
                <button
                  type="button"
                  onClick={() => setMetaOpen((v) => !v)}
                  aria-expanded={metaOpen}
                  className={`${buttonClasses("ghost", "sm")} ${PRESSED_WHEN_OPEN}`}
                >
                  <FilePen size={14} aria-hidden />
                  ข้อมูลแม่แบบ
                  <ChevronDown
                    size={13}
                    aria-hidden
                    className={`opacity-60 transition-transform ${metaOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isNew && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsNew(false);
                      setSelectedId(templates[0]?.id ?? null);
                    }}
                  >
                    ยกเลิก
                  </Button>
                )}
                <Button size="sm" onClick={save} disabled={saving}>
                  <Check size={14} /> {saving ? "กำลังบันทึก..." : "บันทึกแม่แบบ"}
                </Button>
              </div>
            </div>

            {/* ของใช้ภายใน ไม่ขึ้นเอกสาร — เก็บนอกกระดาษและยุบไว้
                ไม่นับเป็น "ช่องล่าสุด" ของเมนูแทรกตัวแปร: ตัวแปรในชื่อแม่แบบไม่มีวันถูกแทนค่า */}
            {metaOpen && (
              <div className="mx-auto mt-2 grid max-w-4xl gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  <span>ชื่อแม่แบบ (ใช้ภายใน ไม่ขึ้นบนเอกสาร)</span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:border-brand focus:outline-none"
                    value={form.name}
                    onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  <span>คำอธิบายสั้น ๆ (ไม่บังคับ)</span>
                  <input
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800 focus:border-brand focus:outline-none"
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, description: e.target.value } : f))
                    }
                  />
                </label>
              </div>
            )}
          </div>

          {/* ---------- กระดาษ ---------- */}
          <VariableAutocomplete
            containerRef={paperRef}
            variables={variableInfo}
            blockTokens={blockTokens}
          />
          {placing && (
            <VariablePlacer
              containerRef={paperRef}
              name={placing}
              blockTokens={blockTokens}
              onDone={() => setPlacing(null)}
            />
          )}
          <div
            ref={paperRef}
            className="mx-auto mt-6 max-w-4xl rounded-lg border border-slate-200 bg-white px-8 py-10 shadow-sm sm:px-16 sm:py-14"
          >
            {/* หน้าปก */}
            <div className="text-center">
              <p className={SECTION_LABEL}>หน้าปก</p>
              {/* ชื่อบนหน้าปกเซิร์ฟเวอร์คัดลอกลงสัญญาตรง ๆ ไม่แทนค่าตัวแปร — ถ้ามี {{...}} จะขึ้นแดง */}
              <VariableField
                label="ชื่อเอกสารบนหน้าปก"
                multiline={false}
                mode="none"
                vocab={vocab}
                textClassName="text-center text-2xl font-bold tracking-wide text-slate-900"
                value={form.docTitle}
                placeholder="ชื่อเอกสารบนหน้าปก"
                onChange={(v) => setForm((f) => (f ? { ...f, docTitle: v } : f))}
              />
              <VariableField
                label="บรรทัดใต้ชื่อเอกสาร"
                multiline={false}
                mode="vars"
                vocab={vocab}
                wrapperClassName="mt-1"
                textClassName="text-center text-base text-slate-600"
                value={form.structure.coverSubtitle}
                placeholder="บรรทัดใต้ชื่อเอกสาร"
                onChange={(v) => patchStructure({ coverSubtitle: v })}
              />
            </div>

            <hr className="my-10 border-slate-200" />

            {/* อารัมภบท */}
            <p className={SECTION_LABEL}>อารัมภบท — ย่อหน้าที่ระบุคู่สัญญาทั้งสองฝ่าย</p>
            <VariableField
              label="อารัมภบท"
              multiline
              mode="vars"
              vocab={vocab}
              textClassName={PAPER_BODY}
              value={form.structure.preamble}
              placeholder="คลิกเพื่อพิมพ์ เช่น สัญญานี้ทำขึ้นระหว่าง {{ชื่อบริษัท}} ซึ่งต่อไปเรียกว่า “ผู้รับจ้าง” กับ … · พิมพ์ {{ เพื่อแทรกตัวแปร"
              onChange={(v) => patchStructure({ preamble: v })}
            />

            {/* ข้อสัญญา */}
            <div className="mt-8 flex flex-col gap-7">
              {form.structure.clauses.map((c, i) => (
                <div key={rowKey(c)} className="group relative">
                  {/* ลำดับตำแหน่งอยู่ริมกระดาษ — ไม่ใช่เลขที่พิมพ์ลงเอกสาร (อันนั้นอยู่ในหัวข้อ) */}
                  <span
                    className="absolute -left-11 top-2 hidden w-7 text-right text-xs tabular-nums text-slate-300 sm:block"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <VariableField
                      label={`ข้อที่ ${i + 1} — หัวข้อ`}
                      multiline={false}
                      mode="vars"
                      vocab={vocab}
                      wrapperClassName="min-w-0 flex-1"
                      textClassName="text-[17px] font-semibold text-slate-900"
                      value={c.heading}
                      placeholder="หัวข้อ"
                      onChange={(v) => patchClause(i, { heading: v })}
                    />
                    {/* ปุ่มจัดการโผล่ตอนชี้/โฟกัส — ของเดิมโชว์ตลอด 27 ปุ่มพร้อมกัน
                        รวมถังขยะแดง 9 อันเรียงลงมาข้างเนื้อสัญญา */}
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100">
                      <button
                        type="button"
                        onClick={() => moveClause(i, -1)}
                        disabled={i === 0}
                        aria-label="เลื่อนขึ้น"
                        className={GHOST_BTN}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveClause(i, 1)}
                        disabled={i === form.structure.clauses.length - 1}
                        aria-label="เลื่อนลง"
                        className={GHOST_BTN}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <Tooltip label="ลบข้อนี้" side="top" align="end">
                        <button
                          type="button"
                          onClick={() => removeClause(i)}
                          disabled={form.structure.clauses.length <= 1}
                          aria-label="ลบข้อนี้"
                          className={`${GHOST_BTN} hover:bg-red-50 hover:text-red-600`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                  {/* ช่องเดียวที่ตารางงวดงานถูกวาดเป็นตารางจริง (ดู contract-pdf.ts) ช่องอื่นพิมพ์วงเล็บดิบ */}
                  <VariableField
                    label={`ข้อที่ ${i + 1} — เนื้อความ`}
                    multiline
                    mode="varsAndBlocks"
                    vocab={vocab}
                    wrapperClassName="mt-0.5"
                    textClassName={PAPER_BODY}
                    value={c.body}
                    placeholder="เนื้อความของข้อนี้ · พิมพ์ {{ เพื่อแทรกตัวแปร"
                    onChange={(v) => patchClause(i, { body: v })}
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addClause}
              className="mt-6 flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-brand"
            >
              <Plus size={14} /> เพิ่มข้อสัญญา
            </button>

            <hr className="my-10 border-slate-200" />

            <p className={SECTION_LABEL}>ข้อความปิดท้าย — ก่อนช่องลงนาม</p>
            <VariableField
              label="ข้อความปิดท้าย"
              multiline
              mode="vars"
              vocab={vocab}
              textClassName={PAPER_BODY}
              value={form.structure.closing}
              placeholder="คลิกเพื่อพิมพ์ เช่น คู่สัญญาได้อ่านและเข้าใจข้อความโดยตลอดแล้ว จึงได้ลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน"
              onChange={(v) => patchStructure({ closing: v })}
            />

            {/* ท้ายกระดาษ: บอกว่าเอกสารจบตรงนี้ และช่องลงนามไม่ต้องพิมพ์เอง
                (เคยมีคนพิมพ์ช่องเซ็นซ้ำลงไปในข้อความปิดท้าย) */}
            <div className="mt-12 border-t border-dashed border-slate-200 pt-5">
              <p className="text-[11px] text-slate-400">
                ระบบเติมช่องลงนามของทั้งสองฝ่ายและช่องพยานให้เองตอนออกสัญญา — ไม่ต้องพิมพ์ไว้ในแม่แบบ
              </p>
              <div className="mt-4 flex flex-wrap justify-between gap-6 text-xs text-slate-300">
                <span>ลงชื่อ ....................................... ผู้ว่าจ้าง</span>
                <span>ลงชื่อ ....................................... ผู้รับจ้าง</span>
              </div>
            </div>
          </div>

          {/* ---------- การกระทำรอง: อยู่ท้ายหน้า ไม่แย่งที่กับปุ่มบันทึก ---------- */}
          {!isNew && selected && (
            <div className="mx-auto mt-4 flex max-w-4xl flex-wrap items-center gap-3 pb-10">
              {!selected.isDefault && (
                <Button variant="ghost" size="sm" onClick={() => makeDefault(selected)}>
                  <Star size={14} /> ตั้งเป็นค่าเริ่มต้น
                </Button>
              )}
              <Button variant="dangerQuiet" size="sm" onClick={() => remove(selected)}>
                <Trash2 size={14} /> ลบ
              </Button>
            </div>
          )}
        </>
      )}

      {/* ไม่มีแม่แบบเลย → ปุ่มสร้างต้องอยู่ตรงนี้ด้วย เพราะแท็บด้านบนอยู่ในกิ่งที่มีฟอร์มแล้ว */}
      {!loading && !form && (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">ยังไม่มีแม่แบบสัญญา</p>
          <Button className="mt-4" onClick={startNew}>
            <Plus size={15} /> สร้างแม่แบบใหม่
          </Button>
        </div>
      )}
    </Layout>
  );
}
