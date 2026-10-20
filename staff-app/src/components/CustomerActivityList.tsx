import {
  GEOIP_ATTRIBUTION,
  IP_KIND_LABEL,
  type CustomerActivityDto,
  type CustomerActivityKind,
} from "@systemboq/shared-types";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Pagination } from "./Pagination";
import { NARROW_SCREEN, useMediaQuery } from "../lib/use-media-query";

/** กี่รายการต่อหน้า — แถวตารางสูง ~44px 20 แถวพอดีหนึ่งจอโดยประมาณ */
const PAGE_SIZE_DEFAULT = 15;

/**
 * ป้ายเหตุการณ์ — สีใช้เฉพาะเมื่อสื่อความหมาย (ยอมรับ/ปฏิเสธ/ความปลอดภัย/สัญญาณซื้อ) เหตุการณ์กลาง ๆ
 * เป็นเทา ไม่งั้นตารางจะกลายเป็นพลุสี — กฎเดียวกับ ProjectActivity · เขียวใช้ 700 เพราะ 600 คอนทราสต์ไม่ผ่าน
 */
const NEUTRAL = "border-slate-200 bg-slate-50 text-slate-600";
const KIND_BADGE: Record<CustomerActivityKind, { label: string; className: string }> = {
  account: { label: "บัญชี", className: NEUTRAL },
  login: { label: "เข้าสู่ระบบ", className: NEUTRAL },
  security: { label: "ความปลอดภัย", className: "border-amber-200 bg-amber-50 text-amber-800" },
  lead: { label: "ส่งคำขอ", className: "border-blue-200 bg-blue-50 text-blue-700" },
  view: { label: "เปิดดู", className: "border-sky-200 bg-sky-50 text-sky-700" },
  file: { label: "ดาวน์โหลด", className: NEUTRAL },
  accepted: { label: "ยอมรับ", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  rejected: { label: "ปฏิเสธ", className: "border-red-200 bg-red-50 text-red-700" },
  revision: { label: "ขอปรับแก้", className: "border-amber-200 bg-amber-50 text-amber-800" },
  project: { label: "โครงการ", className: NEUTRAL },
  // งานของพนักงาน ไม่ใช่สัญญาณจากลูกค้า — เทาเสมอ ไม่แย่งสายตาจากแถวที่ลูกค้าทำ
  staff: { label: "พนักงานดำเนินการ", className: NEUTRAL },
  other: { label: "อื่น ๆ", className: NEUTRAL },
};

/** เวลาแบบละเอียดถึงนาที — ตารางนี้ต้องอ่านเป็น "10:32 → 10:35 → 10:41" ได้ */
function clockTime(value: string): string {
  return new Date(value).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

/** "5 นาทีที่แล้ว" ใต้เวลา — เกิน 30 วันไม่ต้องบอก แถบวันที่ด้านบนบอกอยู่แล้ว */
function relativeTime(value: string, now = Date.now()): string | null {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "เมื่อสักครู่";
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  const days = Math.floor(hours / 24);
  return days <= 30 ? `${days} วันที่แล้ว` : null;
}

function dayLabel(value: string): string {
  const d = new Date(value);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfThatDay) / 86_400_000);
  if (diffDays <= 0) return "วันนี้";
  if (diffDays === 1) return "เมื่อวาน";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

export interface ActivityRow extends CustomerActivityDto {
  /** มีเฉพาะในฟีดรวมทั้งบริษัท */
  customerId?: string | null;
  customerName?: string | null;
}

interface DayGroup {
  label: string;
  items: ActivityRow[];
}

function groupByDay(items: ActivityRow[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** ผู้ทำรายการ — ลูกค้าเอง (ในฟีดรวมเป็นลิงก์ไปแฟ้ม) หรือพนักงานคนไหน */
function ActorCell({ item, linkCustomer }: Readonly<{ item: ActivityRow; linkCustomer: boolean }>) {
  if (item.actor.kind === "staff") {
    return (
      <span className="flex flex-col">
        <span className="text-slate-700">{item.actor.name ?? "พนักงาน"}</span>
        <span className="text-xs text-slate-400">พนักงาน</span>
      </span>
    );
  }
  if (linkCustomer && item.customerId) {
    return (
      <Link to={`/customers/${item.customerId}`} className="text-slate-700 underline-offset-2 hover:underline">
        {item.customerName ?? item.actor.name ?? "ลูกค้า"}
      </Link>
    );
  }
  // แฟ้มของลูกค้าคนเดียว — ไม่ต้องพิมพ์ชื่อเจ้าของแฟ้มซ้ำทุกแถว บอกแค่ว่าลูกค้าทำเอง
  return <span className="text-slate-500">ลูกค้า</span>;
}

/**
 * ที่มา: IP + ประเทศ/ผู้ให้บริการ + ป้ายเมื่อไม่ใช่ IP สาธารณะ (กันอ่าน IP ของ Docker/proxy เป็นของลูกค้า)
 * และป้าย "ต่างประเทศ" — บัญชีลูกค้าในไทยเข้าจากต่างประเทศคือสัญญาณว่าอาจมีคนอื่นใช้บัญชี
 */
function SourceCell({ item }: Readonly<{ item: ActivityRow }>) {
  if (!item.ip) return <span className="text-slate-400">—</span>;
  const label = item.ipKind ? IP_KIND_LABEL[item.ipKind] : null;
  const geo = item.ipGeo;
  const where = geo ? [geo.country, geo.network].filter(Boolean).join(" · ") : "";
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="font-mono text-xs tabular-nums text-slate-700">{item.ip}</span>
      {where && <span className="text-xs text-slate-500">{where}</span>}
      {geo?.foreign && (
        <span
          title="บัญชีนี้ถูกใช้จากนอกประเทศ — ถ้าลูกค้าไม่ได้อยู่ต่างประเทศ อาจมีคนอื่นใช้บัญชี"
          className="rounded border border-red-200 bg-red-50 px-1.5 text-[11px] font-medium text-red-700"
        >
          ต่างประเทศ
        </span>
      )}
      {label && (
        <span
          title="ไม่ใช่ IP สาธารณะของผู้ใช้ — ตรวจการตั้งค่าได้ที่ ตั้งค่า > การรับ IP"
          className="rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] text-slate-500"
        >
          {label}
        </span>
      )}
    </span>
  );
}

function DeviceCell({ item }: Readonly<{ item: ActivityRow }>) {
  if (!item.device && !item.newDevice) return <span className="text-slate-400">—</span>;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="text-slate-600">{item.device ?? "ไม่ทราบอุปกรณ์"}</span>
      {item.newDevice && (
        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 text-[11px] font-medium text-amber-800">
          เครื่องใหม่
        </span>
      )}
    </span>
  );
}

/**
 * ตารางกิจกรรมของลูกค้า — ใช้ร่วมกันสามที่ (แฟ้มลูกค้า · ฟีดรวมทั้งบริษัท · หน้ารายละเอียดโครงการ)
 *
 * คอลัมน์: เวลา · เหตุการณ์ · ผู้ทำรายการ · รายละเอียด · ที่มา (IP เฉพาะ OWNER) · อุปกรณ์
 * เวลายังอยู่คอลัมน์แรกเสมอเพื่อกวาดตาอ่านเป็นลำดับเหตุการณ์ วันที่เป็นแถบคั่น (แพตเทิร์นแถบหมวดใน BOQ)
 * คอลัมน์ที่ไม่มีข้อมูลในหน้านั้นไม่แสดง — ADMIN ไม่ได้ IP ก็ไม่เห็นคอลัมน์ว่าง ๆ
 */
export function CustomerActivityList({
  items,
  showCustomer = false,
  showProject = true,
  pageSize = PAGE_SIZE_DEFAULT,
  framed = true,
}: Readonly<{
  items: ActivityRow[];
  /** ฟีดรวมทั้งบริษัทต้องบอกว่าลูกค้าคนไหนทำ (ชื่อเป็นลิงก์ไปแฟ้ม) */
  showCustomer?: boolean;
  /** หน้าโครงการไม่ต้องบอกชื่อโครงการซ้ำ เพราะอยู่ในโครงการนั้นอยู่แล้ว */
  showProject?: boolean;
  /** ใส่ 0 เพื่อแสดงทั้งหมดในหน้าเดียว */
  pageSize?: number;
  /** false เมื่อวางในการ์ดอยู่แล้ว — ตีกรอบซ้อนกรอบทำให้หน้าดูเป็นกล่องซ้อนกล่อง */
  framed?: boolean;
}>) {
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);

  // ชุดข้อมูลเปลี่ยน (เปลี่ยนตัวกรอง/เปลี่ยนลูกค้า) ต้องกลับไปหน้าแรก ไม่งั้นจะค้างอยู่หน้าท้าย ๆ
  // ของผลลัพธ์ชุดเก่า แล้วเหมือนตัวกรองไม่ทำงาน
  useEffect(() => {
    setPage(1);
  }, [items]);

  const paged = pageSize > 0;
  const pageCount = paged ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount);
  const shown = paged ? items.slice((safePage - 1) * pageSize, safePage * pageSize) : items;

  // ผู้ทำรายการ: ฟีดรวมต้องมีเสมอ · แฟ้มรายคนแสดงเมื่อมีแถวที่พนักงานทำ (ไม่งั้นทุกแถวคือ "ลูกค้า")
  const showActor = showCustomer || shown.some((i) => i.actor.kind === "staff");
  // ไอพีส่งมาเฉพาะ OWNER (ADMIN ได้ null) — ไม่มีก็ไม่ต้องกินคอลัมน์
  const showIp = shown.some((i) => i.ip);
  const showDevice = shown.some((i) => i.device || i.newDevice);
  // สัญญาอนุญาต CC BY ของ DB-IP บังคับให้แสดงเครดิตทุกที่ที่ใช้ข้อมูลประเทศ/ผู้ให้บริการ
  const showGeoCredit = shown.some((i) => i.ipGeo);
  // iPad (<1280): ป้ายเหตุการณ์ไปอยู่หัวรายละเอียด · IP/อุปกรณ์ไปท้ายรายละเอียด — คอลัมน์เหลือ เวลา/ผู้ทำ/รายละเอียด
  // พอดีจอไม่ต้องปัดข้าง (ผู้ใช้สั่ง 18 ต.ค.) · คอมเหมือนเดิม
  const narrow = useMediaQuery(NARROW_SCREEN);
  const ipCol = showIp && !narrow;
  const deviceCol = showDevice && !narrow;
  const colCount = (narrow ? 2 : 3) + (showActor ? 1 : 0) + (ipCol ? 1 : 0) + (deviceCol ? 1 : 0);
  const now = Date.now();

  function goPage(next: number) {
    setPage(next);
    // กดเปลี่ยนหน้าจากท้ายตารางแล้วต้องได้เริ่มอ่านจากหัวตาราง ไม่ใช่โผล่กลางแถว
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <div
        ref={topRef}
        className={`scroll-mt-4 overflow-x-auto ${framed ? "rounded-lg border border-slate-200 bg-white" : ""}`}
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
            <tr>
              <th className="w-24 whitespace-nowrap px-3 py-2">เวลา</th>
              {!narrow && <th className="whitespace-nowrap px-3 py-2">เหตุการณ์</th>}
              {showActor && <th className="whitespace-nowrap px-3 py-2">ผู้ทำรายการ</th>}
              <th className="px-3 py-2">รายละเอียด</th>
              {/* ใช้ "IP" ไม่ใช่ "ไอพี" — ตัวย่อที่คนไอทีเห็นจนชินอ่านเร็วกว่าคำทับศัพท์ */}
              {ipCol && (
                <th className="whitespace-nowrap px-3 py-2">
                  ที่มา (IP)
                  <Link
                    to="/settings?tab=network"
                    className="ms-1.5 font-normal text-slate-500 underline underline-offset-2 hover:text-slate-700"
                  >
                    ตรวจ
                  </Link>
                </th>
              )}
              {deviceCol && <th className="whitespace-nowrap px-3 py-2">อุปกรณ์</th>}
            </tr>
          </thead>
          <tbody>
            {groupByDay(shown).map((group) => (
              <Fragment key={group.label}>
                <tr className="border-t border-slate-200 bg-slate-100/70">
                  <td colSpan={colCount} className="px-3 py-1.5">
                    <span className="text-xs font-medium text-slate-600">{group.label}</span>
                    <span className="ms-2 text-xs text-slate-400">{group.items.length} รายการ</span>
                  </td>
                </tr>

                {group.items.map((item) => {
                  const badge = KIND_BADGE[item.kind] ?? KIND_BADGE.other;
                  const ago = relativeTime(item.at, now);
                  return (
                    <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-2 align-top">
                        <span className="block tabular-nums text-slate-600">{clockTime(item.at)}</span>
                        {ago && <span className="block text-xs text-slate-400">{ago}</span>}
                      </td>

                      {!narrow && (
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          <span className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                      )}

                      {showActor && (
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          <ActorCell item={item} linkCustomer={showCustomer} />
                        </td>
                      )}

                      <td className="px-3 py-2 align-top">
                        {narrow && (
                          <span className={`mb-1 inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                        <span className="block text-slate-700">{item.title}</span>
                        {item.detail && <span className="block text-xs text-slate-500">{item.detail}</span>}
                        {showProject && item.projectId && item.projectName && (
                          <Link
                            to={`/projects/${item.projectId}`}
                            className="block text-xs text-slate-500 underline-offset-2 hover:underline"
                          >
                            โครงการ: {item.projectName}
                          </Link>
                        )}
                        {narrow && (item.ip || item.device || item.newDevice) && (
                          <div className="mt-1.5 flex flex-wrap items-start gap-x-4 gap-y-1 text-xs">
                            {item.ip && <SourceCell item={item} />}
                            {(item.device || item.newDevice) && <DeviceCell item={item} />}
                          </div>
                        )}
                      </td>

                      {ipCol && (
                        <td className="whitespace-nowrap px-3 py-2 align-top">
                          <SourceCell item={item} />
                        </td>
                      )}

                      {deviceCol && (
                        <td className="whitespace-nowrap px-3 py-2 align-top text-xs">
                          <DeviceCell item={item} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {showGeoCredit && (
        <p className="mt-1 text-right text-[11px] text-slate-400">
          ประเทศ/ผู้ให้บริการ:{" "}
          <a href={GEOIP_ATTRIBUTION.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {GEOIP_ATTRIBUTION.text}
          </a>
        </p>
      )}
      <Pagination page={safePage} pageCount={pageCount} onChange={goPage} />
    </>
  );
}
