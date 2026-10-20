import { Download, KeyRound, Pencil, ShieldCheck, ShieldOff } from "lucide-react";
import { useState, type ReactNode } from "react";

import type {
  CustomerAccessLinkDto,
  CustomerDetailDto,
  CustomerType,
} from "@systemboq/shared-types";

import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  downloadCustomerDataPackage,
  issueCustomerAccessLink,
  setCustomerActive,
  updateCustomer,
} from "../lib/customer-file-api";
import { Button } from "./Button";

type Panel = "link" | "suspend" | "export" | null;

const FIELD = "rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-800";
const ROW = "border-t border-slate-200 px-4 py-3";

/**
 * การ์ดข้อมูลติดต่อ + งานที่พนักงานทำกับบัญชีลูกค้า
 *
 * ทุกอย่างอยู่ในการ์ดใบเดียวโดยตั้งใจ: ครั้งแรกผมวางปุ่มไว้มุมขวาบนของหน้าแล้วให้แผงฟอร์มห้อย
 * ลงมา ผลคือฟอร์มลอยกลางหน้าไม่เกาะอะไร และอยู่คนละที่กับข้อมูลที่มันกำลังแก้ (ข้อมูลอยู่ล่างสุด)
 * — แก้เป็นแพตเทิร์นเดียวกับการ์ด "รายละเอียดโครงการ" ในหน้าโครงการ คือปุ่มแก้ไขอยู่หัวการ์ด
 * แล้วเนื้อการ์ดสลับเป็นฟอร์มในที่เดิม
 *
 * `children` = เนื้อการ์ดตอนอ่านอย่างเดียว (ตัวเลขสรุป/ที่อยู่/วันที่เป็นลูกค้า)
 */
export function CustomerContactCard({
  customer,
  onUpdated,
  onRecorded,
  children,
}: Readonly<{
  customer: CustomerDetailDto;
  /** ข้อมูลลูกค้าเปลี่ยน (แก้ข้อมูล / ระงับ / เปิดคืน) */
  onUpdated: (next: CustomerDetailDto) => void;
  /** มีการบันทึกลงไทม์ไลน์แต่ข้อมูลลูกค้าไม่เปลี่ยน (ออกลิงก์เข้าใช้) */
  onRecorded?: () => void;
  children: ReactNode;
}>) {
  const { user } = useAuth();
  const isOwner = user?.role === "OWNER";
  const locked = customer.anonymized;

  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    address: "",
    customerType: "INDIVIDUAL" as CustomerType,
    companyName: "",
    taxId: "",
    branch: "",
    contactPerson: "",
  });
  const [link, setLink] = useState<CustomerAccessLinkDto | null>(null);
  const [copied, setCopied] = useState(false);
  const [reason, setReason] = useState("");
  // ค่าเริ่มต้นคือ "รวม" เพราะบันทึกการติดต่อก็เป็นข้อมูลส่วนบุคคลของลูกค้า การตัดออกเงียบ ๆ
  // ทำให้ไฟล์ที่ชื่อว่าสำเนาข้อมูลของเขาไม่จริง — ตัดออกได้ แต่ไฟล์จะระบุไว้ว่าตัดออก
  const [includeNotes, setIncludeNotes] = useState(true);

  function openEdit() {
    setForm({
      fullName: customer.fullName,
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      customerType: customer.customerType,
      companyName: customer.companyName ?? "",
      taxId: customer.taxId ?? "",
      branch: customer.branch ?? "",
      contactPerson: customer.contactPerson ?? "",
    });
    setError(null);
    setPanel(null);
    setEditing(true);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      const res = await updateCustomer(customer.id, {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        customerType: form.customerType,
        // ส่งช่องของนิติบุคคลเป็นค่าว่างเมื่อกลับไปเป็นบุคคลธรรมดา = ล้างทิ้ง ไม่ใช่ซ่อนไว้เฉย ๆ
        // (ถ้าเก็บค้างไว้ วันหนึ่งติ๊กกลับมาเป็นนิติบุคคลแล้วจะได้ชื่อบริษัทเก่าโผล่มาเงียบ ๆ)
        companyName: form.customerType === "COMPANY" ? form.companyName.trim() : "",
        taxId: form.customerType === "COMPANY" ? form.taxId.trim() : "",
        branch: form.customerType === "COMPANY" ? form.branch.trim() : "",
        contactPerson: form.customerType === "COMPANY" ? form.contactPerson.trim() : "",
      });
      onUpdated(res.customer);
      setEditing(false);
    });

  const issueLink = () =>
    run(async () => {
      setLink(await issueCustomerAccessLink(customer.id));
      setCopied(false);
      setPanel("link");
      onRecorded?.();
    });

  const toggleActive = (active: boolean) =>
    run(async () => {
      const res = await setCustomerActive(customer.id, {
        active,
        ...(active ? {} : { reason: reason.trim() || undefined }),
      });
      onUpdated(res.customer);
      setReason("");
      setPanel(null);
    });

  const exportData = () =>
    run(async () => {
      await downloadCustomerDataPackage(customer.id, customer.fullName, { includeNotes });
      setPanel(null);
    });

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // เบราว์เซอร์บางตัวบล็อก clipboard — พนักงานเลือกคัดลอกเองจากช่องได้
    }
  }

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <p className="text-sm font-medium text-slate-700">ข้อมูลติดต่อ</p>

        {/* บัญชีที่ลูกค้าใช้สิทธิ์ขอลบไปแล้ว แตะไม่ได้ทุกทาง — ไม่ต้องโชว์ปุ่มให้กดแล้วเด้ง error */}
        {locked ? (
          <p className="text-xs text-slate-400">ลูกค้าขอลบข้อมูลแล้ว — แก้ไขบัญชีนี้ไม่ได้</p>
        ) : (
          !editing && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={openEdit}>
                <Pencil size={13} /> แก้ไข
              </Button>
              {customer.active && (
                <Button variant="brand" size="sm" onClick={issueLink} disabled={busy}>
                  <KeyRound size={13} /> ออกลิงก์เข้าใช้งาน
                </Button>
              )}
              {/* สำเนาข้อมูลส่วนบุคคลตาม PDPA — OWNER เท่านั้น เพราะไฟล์รวมหมายเลขไอพี
                  ทุกครั้งที่เข้าระบบ ซึ่งระบบตั้งใจไม่ให้ ADMIN เห็นบนหน้าจอ */}
              {isOwner && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPanel(panel === "export" ? null : "export")}
                >
                  <Download size={13} /> ส่งออกข้อมูล
                </Button>
              )}
              {/* เปิด-ปิดบัญชีใครก็ตามเป็นอำนาจของเจ้าของระบบ กฎเดียวกับบัญชีพนักงาน */}
              {isOwner &&
                (customer.active ? (
                  <Button
                    variant="dangerQuiet"
                    size="sm"
                    onClick={() => setPanel(panel === "suspend" ? null : "suspend")}
                  >
                    <ShieldOff size={13} /> ระงับบัญชี
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleActive(true)}
                    disabled={busy}
                  >
                    <ShieldCheck size={13} /> เปิดใช้งานอีกครั้ง
                  </Button>
                ))}
            </div>
          )
        )}
      </div>

      {error && (
        <p className={`${ROW} bg-red-50/60 text-sm text-red-700`}>{error}</p>
      )}

      {panel === "link" && link && (
        <div className={ROW}>
          <p className="text-sm text-slate-700">
            ส่งลิงก์นี้ให้ลูกค้าทาง LINE หรือช่องที่คุยกัน ลูกค้าจะตั้งรหัสผ่านเองแล้วเข้าใช้งานได้ทันที
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              readOnly
              value={link.url}
              onFocus={(e) => e.currentTarget.select()}
              className={`min-w-0 flex-1 bg-slate-50 font-mono ${FIELD}`}
            />
            <Button size="sm" onClick={copyLink}>
              {copied ? "คัดลอกแล้ว ✓" : "คัดลอก"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPanel(null)}>
              ปิด
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            ใช้ได้ครั้งเดียว หมดอายุ {new Date(link.expiresAt).toLocaleDateString("th-TH")} ·
            ออกลิงก์ใหม่เมื่อไร ลิงก์เก่าที่ยังไม่ถูกใช้จะใช้ไม่ได้ทันที
          </p>
        </div>
      )}

      {panel === "export" && (
        <div className={ROW}>
          <p className="text-sm text-slate-700">
            รวมข้อมูลทั้งหมดที่ระบบเก็บไว้เกี่ยวกับลูกค้ารายนี้เป็นไฟล์เดียว (JSON) สำหรับตอบคำขอ
            “ขอรับสำเนาข้อมูล” ตามนโยบายความเป็นส่วนตัว — บัญชี · ข้อมูลติดต่อ · คำขอ · โครงการ ·
            ใบเสนอราคา · สัญญา · ประวัติการใช้งานพร้อมหมายเลขไอพี
          </p>
          <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 accent-brand"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
            />
            <span>
              <span>รวมบันทึกการติดต่อของพนักงาน</span>
              <span className="block text-xs text-slate-500">
                บันทึกเหล่านี้เป็นข้อมูลส่วนบุคคลของลูกค้าเช่นกัน ถ้าเอาออก ไฟล์จะระบุไว้ว่าไม่ได้รวม
              </span>
            </span>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={exportData} disabled={busy}>
              {busy ? "กำลังสร้างไฟล์..." : "ดาวน์โหลดไฟล์"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPanel(null)} disabled={busy}>
              ยกเลิก
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            การส่งออกถูกบันทึกไว้ในประวัติของลูกค้ารายนี้ว่าใครโหลดเมื่อไร
          </p>
        </div>
      )}

      {panel === "suspend" && (
        <div className={`${ROW} bg-red-50/50`}>
          <p className="text-sm text-slate-700">
            ลูกค้าจะเข้าใช้งานไม่ได้ทันที และถูกนำออกจากระบบทุกเครื่องที่ล็อกอินค้างไว้
            โครงการและเอกสารทั้งหมดยังอยู่ครบ เปิดใช้งานคืนได้ทุกเมื่อ
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-slate-600">
              <span>เหตุผล (ไม่บังคับ)</span>
              <input
                className={`bg-white ${FIELD}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="เช่น ลูกค้าขอให้ระงับชั่วคราว"
              />
            </label>
            <Button variant="ghost" size="sm" onClick={() => setPanel(null)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button variant="danger" size="sm" onClick={() => toggleActive(false)} disabled={busy}>
              {busy ? "กำลังระงับ..." : "ระงับบัญชี"}
            </Button>
          </div>
        </div>
      )}

      {editing ? (
        <div className={ROW}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>ชื่อ-นามสกุล</span>
              <input
                className={FIELD}
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-700">
              <span>เบอร์โทร</span>
              <input
                className={FIELD}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            {/* ประเภทผู้ว่าจ้างอยู่เหนือช่องของบริษัท เพราะมันเป็นตัวตัดสินว่าช่องข้างล่างจะมีหรือไม่มี */}
            <fieldset className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <legend className="sr-only">ประเภทผู้ว่าจ้าง</legend>
              <span className="text-xs text-slate-700">ผู้ว่าจ้างเป็น</span>
              {(
                [
                  ["INDIVIDUAL", "บุคคลธรรมดา"],
                  ["COMPANY", "นิติบุคคล"],
                ] as [CustomerType, string][]
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="customerType"
                    className="accent-brand"
                    checked={form.customerType === value}
                    onChange={() => setForm({ ...form, customerType: value })}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {form.customerType === "COMPANY" && (
              <>
                <label className="flex flex-col gap-1 text-xs text-slate-700 sm:col-span-2">
                  <span>ชื่อนิติบุคคล</span>
                  <input
                    className={FIELD}
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    placeholder="เช่น บริษัท อาวรินทร์ เอ็นจิเนียริ่ง จำกัด"
                  />
                  <span className="text-slate-400">
                    ใบเสนอราคาและสัญญาจะออกในนามนี้แทนชื่อเจ้าของบัญชี
                  </span>
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  <span>เลขประจำตัวผู้เสียภาษี</span>
                  <input
                    className={FIELD}
                    value={form.taxId}
                    inputMode="numeric"
                    maxLength={13}
                    onChange={(e) =>
                      setForm({ ...form, taxId: e.target.value.replace(/\D/g, "") })
                    }
                    placeholder="13 หลัก"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  <span>สำนักงาน / สาขา</span>
                  <input
                    className={FIELD}
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    placeholder="เช่น สำนักงานใหญ่"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-700 sm:col-span-2">
                  <span>ผู้ประสานงาน</span>
                  <input
                    className={FIELD}
                    value={form.contactPerson}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                    placeholder={customer.fullName}
                  />
                  <span className="text-slate-400">เว้นว่างไว้จะใช้ชื่อเจ้าของบัญชี</span>
                </label>
              </>
            )}

            <label className="flex flex-col gap-1 text-xs text-slate-700 sm:col-span-2">
              <span>ที่อยู่ผู้ว่าจ้าง</span>
              <textarea
                rows={2}
                className={FIELD}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="เช่น 99/1 ต.ในเมือง อ.เมือง จ.ขอนแก่น 40000"
              />
              <span className="text-slate-400">พิมพ์ลงใบเสนอราคาและสัญญาเป็นที่อยู่ผู้ว่าจ้าง</span>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {/* อีเมลแก้ที่นี่ไม่ได้โดยตั้งใจ — เป็นชื่อผู้ใช้ที่ลูกค้าใช้ล็อกอิน */}
            <p className="text-xs text-slate-400">อีเมล {customer.email} แก้ไขจากที่นี่ไม่ได้</p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={busy}>
                ยกเลิก
              </Button>
              <Button size="sm" onClick={save} disabled={busy || form.fullName.trim() === ""}>
                {busy ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
