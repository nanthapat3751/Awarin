import {
  Check,
  FileText,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Signature,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import type {
  CustomerActivityDto,
  ProjectActivityDto,
  ProjectActivityKind,
} from "@systemboq/shared-types";

import { getProjectCustomerActivity } from "../lib/customer-file-api";
import { getProjectActivity } from "../lib/projects-api";
import { CustomerActivityList } from "./CustomerActivityList";

// จำนวนที่โชว์ตอนยังไม่กด "ดูทั้งหมด" — หน้ารายละเอียดโครงการยาว ~6,000px อยู่แล้ว
// ไทม์ไลน์จึงต้องไม่ต่อความยาวออกไปอีกโดยไม่จำเป็น
const PREVIEW_COUNT = 4;

// สีเดียวกับป้ายสถานะที่ใช้ทั้งแอป และใช้ "เฉพาะเมื่อสีนั้นสื่อความหมาย" — เหตุการณ์กลาง ๆ
// (ออกเอกสาร/แก้ไข/แนบไฟล์) เป็นเทาทั้งหมด ไม่งั้นไทม์ไลน์จะกลายเป็นพลุสี
const KIND_STYLE: Record<ProjectActivityKind, { icon: ReactNode; className: string }> = {
  created: { icon: <Plus size={13} />, className: "border-slate-200 bg-slate-50 text-slate-500" },
  quote: { icon: <FileText size={13} />, className: "border-slate-200 bg-slate-50 text-slate-500" },
  sent: { icon: <Send size={13} />, className: "border-slate-200 bg-slate-50 text-slate-500" },
  file: { icon: <Paperclip size={13} />, className: "border-slate-200 bg-slate-50 text-slate-500" },
  status: { icon: <FileText size={13} />, className: "border-slate-200 bg-slate-50 text-slate-500" },
  customer: {
    icon: <MessageSquare size={13} />,
    className: "border-indigo-200 bg-indigo-50 text-indigo-600",
  },
  accepted: { icon: <Check size={13} />, className: "border-emerald-200 bg-emerald-50 text-emerald-600" },
  rejected: { icon: <X size={13} />, className: "border-red-200 bg-red-50 text-red-600" },
  contract: { icon: <Signature size={13} />, className: "border-blue-200 bg-blue-50 text-blue-600" },
};

function formatWhen(value: string): string {
  return new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ไทม์ไลน์กิจกรรมของโครงการ
 *
 * เรื่องราวของดีลเคยกระจายอยู่คนละที่ (วันสร้างบนแถบขั้นตอน, วันส่ง/วันตอบในคอลัมน์ของตาราง
 * ใบเสนอราคา, เหตุผลที่ปฏิเสธในแถวใต้ตาราง, การเปลี่ยนสถานะโครงการไม่ได้แสดงที่ไหนเลย)
 * ทั้งที่ AuditLog เก็บครบมาตลอด — ที่นี่คือที่เดียวที่อ่านรอบเดียวจบ
 */
type Lens = "all" | "customer";

const LENS_LABEL: Record<Lens, string> = { all: "ทั้งหมด", customer: "เฉพาะลูกค้า" };

export function ProjectActivity({ projectId }: Readonly<{ projectId: string }>) {
  const [items, setItems] = useState<ProjectActivityDto[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [lens, setLens] = useState<Lens>("all");
  const [customerItems, setCustomerItems] = useState<CustomerActivityDto[] | null>(null);
  const [customerName, setCustomerName] = useState<string | null>(null);
  // ยอดจริงจากเซิร์ฟเวอร์ — บล็อกนี้ยังไม่แบ่งหน้า (เป็นพรีวิวของโครงการเดียว) แต่ถ้าชนเพดาน
  // ต้องบอกผู้ใช้ ไม่ใช่ตัดท้ายทิ้งเงียบ ๆ เหมือนก่อนหน้านี้
  const [customerTotal, setCustomerTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    getProjectActivity(projectId)
      .then((res) => {
        if (alive) setItems(res.activity);
      })
      // เงียบไว้: ไทม์ไลน์เป็นข้อมูลประกอบ ไม่ควรขึ้น error ทับหน้าที่ส่วนอื่นยังใช้งานได้ปกติ
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  // โหลดมุมมองลูกค้าเมื่อกดดูจริงเท่านั้น -- ส่วนใหญ่เปิดหน้าโครงการมาเพื่อดูไทม์ไลน์รวม
  useEffect(() => {
    if (lens !== "customer" || customerItems !== null) return;
    let alive = true;
    getProjectCustomerActivity(projectId)
      .then((res) => {
        if (!alive) return;
        setCustomerItems(res.activity);
        setCustomerName(res.customerName);
        setCustomerTotal(res.total);
      })
      .catch(() => {
        if (alive) setCustomerItems([]);
      });
    return () => {
      alive = false;
    };
  }, [lens, projectId, customerItems]);

  if (items === null) {
    return <p className="text-sm text-slate-500">กำลังโหลดกิจกรรม...</p>;
  }

  const shown = expanded ? items : items.slice(0, PREVIEW_COUNT);

  // ปุ่มสลับมุมมอง -- ไทม์ไลน์รวมเห็นทั้งงานพนักงานและลูกค้า แต่กรองการเปิดอ่านซ้ำ ๆ ออก
  // ส่วนมุมมองลูกค้าเห็นเฉพาะสิ่งที่ลูกค้าทำ และเห็นทุกครั้งที่เปิด (ละเอียดระดับนาที)
  const lensToggle = (
    <div className="flex overflow-hidden rounded-md border border-slate-200">
      {(["all", "customer"] as Lens[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLens(l)}
          aria-pressed={lens === l}
          className={`px-2.5 py-1 text-xs transition-colors ${
            lens === l
              ? "bg-slate-100 font-medium text-slate-800"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          {LENS_LABEL[l]}
        </button>
      ))}
    </div>
  );

  if (lens === "customer") {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">
            สิ่งที่ลูกค้าทำกับโครงการนี้
            {customerName && <span className="ms-1 text-slate-400">· {customerName}</span>}
          </p>
          {lensToggle}
        </div>
        {customerItems === null && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
        {customerItems !== null && customerItems.length === 0 && (
          <p className="text-sm text-slate-500">
            ลูกค้ายังไม่ได้ทำอะไรกับโครงการนี้ (หรือยังไม่ได้ระบุลูกค้า)
          </p>
        )}
        {customerItems !== null && customerItems.length > 0 && (
          <>
            <CustomerActivityList items={customerItems} showProject={false} framed={false} />
            {customerTotal > customerItems.length && (
              <p className="mt-2 text-xs text-slate-500">
                แสดง {customerItems.length} จาก {customerTotal} รายการ — ดูครบทุกรายการได้ในแฟ้มลูกค้า
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">กิจกรรมล่าสุด</p>
          {lensToggle}
        </div>
        <p className="text-sm text-slate-500">ยังไม่มีกิจกรรมในโครงการนี้</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">กิจกรรมล่าสุด</p>
        <div className="flex items-center gap-2">
          {items.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100"
            >
              {expanded ? "ย่อลง" : `ดูทั้งหมด (${items.length})`}
            </button>
          )}
          {lensToggle}
        </div>
      </div>

      <ol className="flex flex-col">
        {shown.map((item, i) => {
          const style = KIND_STYLE[item.kind];
          const last = i === shown.length - 1;
          return (
            <li key={item.id} className="flex gap-3">
              {/* เส้นแนวตั้งเชื่อมหมุด — ตัดเส้นที่รายการสุดท้ายไม่ให้ห้อยลงมาลอย ๆ */}
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${style.className}`}
                >
                  {style.icon}
                </span>
                {!last && <span className="w-px flex-1 bg-slate-200" />}
              </div>

              <div className={`min-w-0 flex-1 ${last ? "" : "pb-3"}`}>
                <p className="text-sm text-slate-700">{item.title}</p>
                {item.detail && (
                  <p className="mt-0.5 text-sm text-slate-500">{item.detail}</p>
                )}
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatWhen(item.at)}
                  {item.actor ? ` · ${item.actor}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
