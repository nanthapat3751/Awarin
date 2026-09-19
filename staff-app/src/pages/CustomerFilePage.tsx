import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type {
  CustomerActivityDto,
  CustomerDetailDto,
  LeadStatus,
} from "@systemboq/shared-types";

import {
  ActivityFilterBar,
  EMPTY_FILTER,
  filterToQuery,
  isFilterActive,
  type ActivityFilterValue,
} from "../components/ActivityFilterBar";
import { buttonClasses } from "../components/Button";
import { CustomerActivityList } from "../components/CustomerActivityList";
import { CustomerContactCard } from "../components/CustomerContactCard";
import { CustomerNotes } from "../components/CustomerNotes";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { QuoteViewCell } from "../components/QuoteViewCell";
import { ApiError } from "../lib/api";
import { getCustomerActivity, getCustomerDetail } from "../lib/customer-file-api";
import { VIEW_TRACKING_SINCE } from "../lib/quote-view";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { badgeClass, type BadgeColor } from "../lib/status-badge";

const PROJECT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  QUOTED: "เสนอราคาแล้ว",
  REJECTED: "ลูกค้าปฏิเสธ",
  APPROVED: "อนุมัติแล้ว",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
};

const PROJECT_STATUS_COLOR: Record<string, BadgeColor> = {
  DRAFT: "slate",
  QUOTED: "amber",
  REJECTED: "red",
  APPROVED: "emerald",
  COMPLETED: "blue",
  CANCELLED: "slate",
};

// ชุดเดียวกับหน้าคำขอลูกค้า (LeadsPage) — ป้ายสีเดียวกันต้องหมายถึงสถานะเดียวกันทั้งระบบ
const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "ใหม่",
  CONTACTED: "ติดต่อแล้ว",
  QUOTED: "เสนอราคาแล้ว",
  CLOSED: "ปิดงาน",
  REJECTED: "ปฏิเสธ",
};

const LEAD_STATUS_COLOR: Record<LeadStatus, BadgeColor> = {
  NEW: "amber",
  CONTACTED: "blue",
  QUOTED: "indigo",
  CLOSED: "emerald",
  REJECTED: "red",
};

const QUOTE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  SENT: "ส่งแล้ว",
  ACCEPTED: "ลูกค้ายอมรับ",
  REJECTED: "ลูกค้าปฏิเสธ",
  REVISED: "ขอปรับแก้",
};

const QUOTE_STATUS_COLOR: Record<string, BadgeColor> = {
  DRAFT: "slate",
  SENT: "blue",
  ACCEPTED: "emerald",
  REJECTED: "red",
  REVISED: "amber",
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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function baht(value: string | null): string {
  if (value === null) return "—";
  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function StatBox({ label, value, hint }: Readonly<{ label: string; value: string; hint?: string }>) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-medium tabular-nums text-slate-800">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * แฟ้มลูกค้า — ทุกอย่างของลูกค้าหนึ่งรายในหน้าเดียว
 *
 * ก่อนหน้านี้ไม่มีหน้าลูกค้าเลย: บัญชีอยู่ในหน้าจัดการผู้ใช้ (OWNER เท่านั้น) โครงการอยู่หน้าโครงการ
 * คำขอแรกอยู่หน้าคำขอลูกค้า และกิจกรรมที่เขาทำไม่ได้แสดงที่ไหนเลย พนักงานต้องเปิดสามหน้าแล้ว
 * ปะติดปะต่อเองก่อนจะยกหูโทรหา
 */
/** โครงการที่นับเป็น "งานที่ปิดได้" */
const WON_STATUSES: ReadonlySet<string> = new Set(["APPROVED", "COMPLETED"]);

/** ตัวเลขสรุปใต้ข้อมูลติดต่อ — เบอร์ · เข้าระบบล่าสุด · การเปิดดูใบเสนอราคา · มูลค่างานที่ปิดได้ */
function CustomerStats({ customer }: Readonly<{ customer: CustomerDetailDto }>) {
  // นับเฉพาะใบที่ส่งหลังระบบเริ่มเก็บข้อมูลการเปิดดู — ใบเก่ากว่านั้นไม่มีข้อมูล ถ้าเอามานับ
  // ด้วยจะได้ "0/4" ซึ่งอ่านว่า "ลูกค้าไม่เคยเปิดสักใบ" ทั้งที่ความจริงคือไม่เคยเก็บ
  const trackedQuotes = customer.quotes.filter(
    (q) => q.status !== "DRAFT" && new Date(q.sentAt ?? q.createdAt) >= VIEW_TRACKING_SINCE,
  );
  const openedQuotes = trackedQuotes.filter((q) => q.firstViewedAt !== null).length;

  // มูลค่า "งานที่ปิดได้" ไม่ใช่ผลบวกทุกโครงการ — โครงการที่ถูกยกเลิกหรือลูกค้าปฏิเสธไม่ใช่เงิน
  // ที่บริษัทได้ การเอามารวมทำให้ลูกค้ารายนี้ดูมีมูลค่ามากกว่าความจริง
  const wonProjects = customer.projects.filter((p) => WON_STATUSES.has(p.status));
  const wonValue = wonProjects.reduce((sum, p) => sum + Number(p.netPrice ?? 0), 0);

  return (
    <div className="grid grid-cols-2 divide-x divide-slate-200 border-t border-slate-200 md:grid-cols-4">
      <StatBox label="เบอร์โทร" value={customer.phone ?? "—"} />
      <StatBox
        label="เข้าระบบล่าสุด"
        value={customer.lastLoginAt ? formatDate(customer.lastLoginAt) : "ยังไม่เคยเข้า"}
        hint={
          customer.lastLoginAt
            ? (formatWhen(customer.lastLoginAt).split(" ").pop() ?? "")
            : undefined
        }
      />
      <StatBox
        label="ใบเสนอราคาที่เปิดดูแล้ว"
        value={trackedQuotes.length > 0 ? `${openedQuotes}/${trackedQuotes.length}` : "—"}
        hint={
          trackedQuotes.length > 0
            ? "จากที่ส่งไปทั้งหมด"
            : "ยังไม่มีใบที่ส่งหลังระบบเริ่มเก็บข้อมูล"
        }
      />
      <StatBox
        label="มูลค่างานที่ปิดได้"
        value={wonValue > 0 ? baht(String(wonValue)) : "—"}
        hint={
          wonValue > 0
            ? `บาท · จาก ${wonProjects.length} โครงการที่อนุมัติ/เสร็จสิ้น`
            : "ยังไม่มีโครงการที่ปิดได้"
        }
      />
    </div>
  );
}

export function CustomerFilePage() {
  const { id = "" } = useParams();
  const rowNav = useRowNav();
  const [customer, setCustomer] = useState<CustomerDetailDto | null>(null);
  const [activity, setActivity] = useState<CustomerActivityDto[] | null>(null);
  // ยอดจริงทั้งหมดจากเซิร์ฟเวอร์ — ไม่ใช่ `activity.length` ซึ่งตอนนี้เป็นแค่จำนวนแถวในหน้านี้
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(20);
  const [filter, setFilter] = useState<ActivityFilterValue>(EMPTY_FILTER);
  const [error, setError] = useState<string | null>(null);
  // เลื่อนค่านี้เพื่อสั่งโหลดไทม์ไลน์ใหม่ หลังพนักงานแก้ข้อมูล/ระงับบัญชี — งานพวกนั้นเขียนแถวใหม่
  // ลงไทม์ไลน์ด้วย ถ้าไม่โหลดซ้ำ หน้าจะยังเป็นชุดเดิมตอนเปิดหน้า แล้วดูเหมือนระบบไม่ได้บันทึกอะไร
  const [activityNonce, setActivityNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setCustomer(null);
    setError(null);
    getCustomerDetail(id)
      .then((res) => {
        if (alive) setCustomer(res.customer);
      })
      .catch((err) => {
        if (alive) setError(err instanceof ApiError ? err.message : "โหลดข้อมูลลูกค้าไม่สำเร็จ");
      });
    return () => {
      alive = false;
    };
  }, [id]);

  // แยก effect ของไทม์ไลน์ออกมา เพราะเปลี่ยนตัวกรองแล้วต้องโหลดใหม่เฉพาะส่วนนี้
  // ไม่ใช่กะพริบทั้งหน้า (ข้อมูลติดต่อ/โครงการ/ใบเสนอราคาไม่ได้เปลี่ยนตามตัวกรอง)
  useEffect(() => {
    let alive = true;
    const query = filterToQuery(filter);
    const timer = window.setTimeout(() => {
      getCustomerActivity(id, query, activityPage)
        .then((res) => {
          if (!alive) return;
          setActivity(res.activity);
          setActivityTotal(res.total);
          setActivityPageSize(res.pageSize);
        })
        // ไทม์ไลน์เป็นข้อมูลประกอบ — ถ้าโหลดไม่ได้ก็ไม่ควรทำให้ทั้งหน้าใช้ไม่ได้
        .catch(() => {
          if (alive) setActivity([]);
        });
      // หน่วงเล็กน้อยกันยิงทุกตัวอักษรตอนพิมพ์ค้นหา
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [id, filter, activityNonce, activityPage]);

  // เปลี่ยนตัวกรองหรือเปลี่ยนลูกค้า = กลับหน้า 1 ไม่งั้นค้างอยู่หน้าท้าย ๆ ของผลชุดเก่า
  // แล้วดูเหมือนตัวกรองไม่ทำงาน (เดิมตรรกะนี้อยู่ในตัว CustomerActivityList ตอนแบ่งหน้าในเครื่อง)
  useEffect(() => {
    setActivityPage(1);
  }, [id, filter]);

  if (error) {
    return (
      <Layout>
        <PageHeader title="แฟ้มลูกค้า" />
        <p className="text-slate-600">{error}</p>
        <Link to="/customers" className={`${buttonClasses("ghost", "sm")} mt-4`}>
          <ArrowLeft size={14} /> กลับไปหน้ารายชื่อลูกค้า
        </Link>
      </Layout>
    );
  }

  if (!customer) {
    return (
      <Layout>
        <PageHeader title="แฟ้มลูกค้า" />
        <p className="text-slate-500">กำลังโหลด...</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <Link to="/customers" className={`${buttonClasses("ghost", "sm")} mb-3`}>
        <ArrowLeft size={14} /> กลับไปหน้ารายชื่อลูกค้า
      </Link>

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {customer.fullName}
            {/* "ลูกค้าลบบัญชีเอง" กับ "พนักงานระงับ" คนละเรื่อง — ก่อนหน้านี้ขึ้นว่าระงับเหมือนกันหมด */}
            {!customer.active && (
              <span className={badgeClass(customer.anonymized ? "slate" : "red")}>
                {customer.anonymized ? "ลบบัญชีแล้ว" : "ระงับการใช้งาน"}
              </span>
            )}
          </span>
        }
        subtitle={customer.email}
      />

      {/* ข้อมูลติดต่อ — สิ่งที่ต้องใช้ตอนจะโทรหา อยู่บนสุดของหน้า
          ปุ่มแก้ไข/ออกลิงก์/ระงับบัญชี อยู่ที่หัวการ์ดใบนี้ ไม่ใช่มุมขวาบนของหน้า เพื่อให้ฟอร์มกางออกมา
          ตรงที่ข้อมูลอยู่จริง (เคยวางไว้บนหัวหน้าแล้วฟอร์มลอยกลางหน้าไม่เกาะอะไร) */}
      <CustomerContactCard
        customer={customer}
        onUpdated={(next) => {
          setCustomer(next);
          setActivityNonce((n) => n + 1);
        }}
        onRecorded={() => setActivityNonce((n) => n + 1)}
      >
        <CustomerStats customer={customer} />
        {/* บล็อกนิติบุคคลโผล่เฉพาะเมื่อผู้ว่าจ้างเป็นนิติบุคคลจริง — ของบุคคลธรรมดาไม่ต้องขึ้น
            บรรทัด "บุคคลธรรมดา" ให้รก เพราะเป็นค่าตั้งต้นและชื่อบนหัวหน้าก็คือชื่อที่เอกสารจะใช้อยู่แล้ว */}
        {customer.customerType === "COMPANY" && (
          <div className="border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">ผู้ว่าจ้าง (นิติบุคคล)</p>
            <p className="mt-0.5 text-sm font-medium text-slate-800">
              {customer.billingName ?? customer.fullName}
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              {customer.taxId ? (
                <>
                  เลขประจำตัวผู้เสียภาษี {customer.taxId}
                  {customer.branch ? ` · ${customer.branch}` : ""}
                </>
              ) : (
                // ย้อมสีเฉพาะคำสถานะ ไม่ย้อมทั้งประโยค (กฎเดียวกับคำเตือนเรื่องที่อยู่)
                <>
                  <span className="text-amber-700">ยังไม่มีเลขประจำตัวผู้เสียภาษี</span> —
                  เอกสารจะออกโดยไม่มีเลขให้ฝ่ายบัญชีของลูกค้าตั้งเบิก
                </>
              )}
            </p>
            {customer.contactPerson && (
              <p className="mt-0.5 text-sm text-slate-600">
                ผู้ประสานงาน: {customer.contactPerson}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              ใบเสนอราคาและสัญญาจะออกในนามนี้ และแสดงยอดหักภาษี ณ ที่จ่าย 3% ให้ด้วย
            </p>
          </div>
        )}

        {/* แสดงแม้ยังว่าง — ที่อยู่นี้คือ "ที่อยู่ผู้ว่าจ้าง" ที่พิมพ์ลงใบเสนอราคา/สัญญา ถ้าซ่อนตอนว่าง
            จะไม่มีใครรู้ว่าเอกสารกำลังจะพิมพ์ออกไปโดยไม่มีที่อยู่ */}
        <div className="border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">ที่อยู่ผู้ว่าจ้าง</p>
          {customer.address ? (
            <p className="mt-0.5 text-sm text-slate-700">{customer.address}</p>
          ) : (
            // สีอยู่ที่คำว่า "ยังไม่มีที่อยู่" คำเดียว ส่วนผลที่ตามมาเป็นสีปกติ — ถ้าย้อมทั้งประโยค
            // มันจะเด่นกว่าข้อมูลจริงในการ์ด ทั้งที่เป็นแค่หมายเหตุ
            <p className="mt-0.5 text-sm text-slate-500">
              <span className="text-amber-700">ยังไม่มีที่อยู่</span> — เอกสารจะพิมพ์ออกไปโดยไม่มี
              ที่อยู่ผู้ว่าจ้าง
            </p>
          )}
        </div>
        <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-400">
          เป็นลูกค้าตั้งแต่ {formatDate(customer.createdAt)}
        </div>
      </CustomerContactCard>

      {/* อยู่ต่อจากข้อมูลติดต่อโดยตั้งใจ — กำลังจะยกหูโทร ต้องเห็นก่อนว่าคุยอะไรกันไว้ล่าสุด */}
      <CustomerNotes
        customerId={customer.id}
        notes={customer.notes}
        canWrite={!customer.anonymized}
        onChanged={setCustomer}
      />

      <h2 className="mb-2 text-lg font-medium text-slate-800">
        โครงการ ({customer.projects.length})
      </h2>
      {customer.projects.length === 0 ? (
        <p className="mb-8 text-slate-500">ยังไม่มีโครงการ</p>
      ) : (
        <table className="mb-8 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">โครงการ</th>
              <th className="whitespace-nowrap px-3 py-2">สถานะ</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">ราคาสุทธิ</th>
              <th className="whitespace-nowrap px-3 py-2">สร้างเมื่อ</th>
            </tr>
          </thead>
          <tbody>
            {customer.projects.map((p) => (
              <tr
                key={p.id}
                {...rowNav(`/projects/${p.id}`)}
                className={`border-t border-slate-100 ${rowNavClass}`}
              >
                <td className="px-3 py-2">
                  <Link
                    to={`/projects/${p.id}`}
                    onClick={stopRowNav}
                    className="font-medium text-slate-800"
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-slate-500">{p.projectNo}</p>
                </td>
                <td className="px-3 py-2">
                  <span className={badgeClass(PROJECT_STATUS_COLOR[p.status] ?? "slate")}>
                    {PROJECT_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {baht(p.netPrice)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  {formatDate(p.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className="mb-2 text-lg font-medium text-slate-800">
        ใบเสนอราคา ({customer.quotes.length})
      </h2>
      {customer.quotes.length === 0 ? (
        <p className="mb-8 text-slate-500">ยังไม่มีใบเสนอราคา</p>
      ) : (
        <table className="mb-8 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">เลขที่</th>
              <th className="whitespace-nowrap px-3 py-2">โครงการ</th>
              <th className="whitespace-nowrap px-3 py-2">สถานะ</th>
              <th className="whitespace-nowrap px-3 py-2">ส่งเมื่อ</th>
              <th className="whitespace-nowrap px-3 py-2">เปิดดู</th>
            </tr>
          </thead>
          <tbody>
            {customer.quotes.map((q) => (
              <tr
                key={q.id}
                {...rowNav(`/projects/${q.projectId}`)}
                className={`border-t border-slate-100 ${rowNavClass}`}
              >
                <td className="whitespace-nowrap px-3 py-2 text-slate-800">
                  {q.quoteNo}
                  <span className="ml-1 text-xs text-slate-400">ฉบับที่ {q.revisionNo}</span>
                </td>
                <td className="px-3 py-2 text-slate-600">{q.projectName}</td>
                <td className="px-3 py-2">
                  <span className={badgeClass(QUOTE_STATUS_COLOR[q.status] ?? "slate")}>
                    {QUOTE_STATUS_LABEL[q.status] ?? q.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                  {q.sentAt ? formatDate(q.sentAt) : "—"}
                </td>
                <td className="px-3 py-2">
                  <QuoteViewCell quote={q} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}


      {/* สัญญา — ผูกกับโครงการ ไม่ได้ผูกกับลูกค้าโดยตรง เปิดแฟ้มแล้วต้องรู้ว่าเซ็นไปกี่ฉบับ ยอดเท่าไร */}
      <h2 className="mb-2 text-lg font-medium text-slate-800">
        สัญญา ({customer.contracts.length})
      </h2>
      {customer.contracts.length === 0 ? (
        <p className="mb-8 text-slate-500">ยังไม่มีสัญญา</p>
      ) : (
        <table className="mb-8 w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm [&_tbody_tr:hover]:bg-slate-50/70">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
            <tr>
              <th className="whitespace-nowrap px-3 py-2">เลขที่</th>
              <th className="px-3 py-2">โครงการ</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">มูลค่าสัญญา</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">งวด</th>
              <th className="whitespace-nowrap px-3 py-2">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {customer.contracts.map((c) => (
              <tr
                key={c.id}
                {...rowNav(`/projects/${c.projectId}`)}
                className={`border-t border-slate-100 ${rowNavClass}`}
              >
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-800">
                  {c.contractNo}
                </td>
                <td className="px-3 py-2">
                  <Link
                    to={`/projects/${c.projectId}`}
                    onClick={stopRowNav}
                    className="text-slate-700 underline-offset-2 hover:underline"
                  >
                    {c.projectName}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-700">
                  {baht(c.amount)}
                </td>
                {/* "แผนมีกี่งวด" ไม่ใช่ "จ่ายไปกี่งวด" — ระบบยังไม่ได้ติดตามการชำระเงินรายงวด */}
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                  {c.installmentCount > 0 ? `${c.installmentCount} งวด` : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {c.signedAt ? (
                    <span className={badgeClass("emerald")}>เซ็นแล้ว {formatDate(c.signedAt)}</span>
                  ) : (
                    <span className={badgeClass("slate")}>ยังไม่เซ็น</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* คำขอที่ลูกค้าส่งเข้ามา — ไทม์ไลน์บอกแค่ว่า "ส่งคำขอ" แต่เนื้อคำขออยู่ที่นี่ */}
      <h2 className="mb-2 text-lg font-medium text-slate-800">
        คำขอที่ส่งเข้ามา ({customer.leads.length})
      </h2>
      {customer.leads.length === 0 ? (
        <p className="mb-8 text-slate-500">ยังไม่มีคำขอที่ผูกกับบัญชีนี้</p>
      ) : (
        <ul className="mb-8 flex flex-col gap-2">
          {customer.leads.map((l) => (
            <li key={l.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-slate-800">{l.serviceType}</span>
                <span className={badgeClass(LEAD_STATUS_COLOR[l.status])}>
                  {LEAD_STATUS_LABEL[l.status]}
                </span>
                {l.houseDesignName && (
                  <span className="text-sm text-slate-500">· แบบ {l.houseDesignName}</span>
                )}
                <span className="ms-auto text-xs text-slate-400">{formatWhen(l.createdAt)}</span>
              </div>
              {l.message && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-600">{l.message}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                {l.projectId && l.projectName ? (
                  <Link
                    to={`/projects/${l.projectId}`}
                    className="text-slate-500 underline-offset-2 hover:underline"
                  >
                    กลายเป็นโครงการ {l.projectName}
                  </Link>
                ) : (
                  <span>ยังไม่ได้แปลงเป็นโครงการ</span>
                )}
                {l.repliedAt && <span>· ตอบกลับแล้ว {formatDate(l.repliedAt)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-slate-800">
          กิจกรรม{activity ? ` (${activityTotal})` : ""}
        </h2>
        <Link
          to={`/customers?tab=activity&customerId=${customer.id}`}
          className="text-sm text-brand transition-colors hover:text-brand-dark"
        >
          ดูในฟีดรวมทั้งบริษัท
        </Link>
      </div>

      <ActivityFilterBar value={filter} onChange={setFilter} />

      {activity === null && <p className="text-slate-500">กำลังโหลดกิจกรรม...</p>}
      {activity !== null && activity.length === 0 && (
        <p className="mb-8 text-slate-500">
          {isFilterActive(filter)
            ? "ไม่พบกิจกรรมที่ตรงกับตัวกรอง"
            : "ยังไม่มีกิจกรรมของลูกค้ารายนี้"}
        </p>
      )}
      {activity !== null && activity.length > 0 && (
        <div className="mb-8">
          {/* pageSize=0 = ปิดการแบ่งหน้าในตัวคอมโพเนนต์ เพราะหน้านี้แบ่งที่เซิร์ฟเวอร์แล้ว
              (ของเดิมตัดหน้าในเบราว์เซอร์จากก้อนที่ถูกจำกัดไว้ 200 แถวแบบเงียบ ๆ) */}
          <CustomerActivityList items={activity} pageSize={0} />
          <Pagination
            page={activityPage}
            pageCount={Math.max(1, Math.ceil(activityTotal / activityPageSize))}
            onChange={setActivityPage}
          />
        </div>
      )}
    </Layout>
  );
}
