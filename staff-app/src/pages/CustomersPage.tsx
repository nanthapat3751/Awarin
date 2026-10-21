import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  type CustomerActivityFeedItemDto,
  type CustomerDirectoryView,
  type CustomerListItemDto,
  type CustomerSortField,
  UNVERIFIED_SIGNUP_TTL_DAYS,
} from "@systemboq/shared-types";

import {
  ActivityFilterBar,
  EMPTY_FILTER,
  filterToQuery,
  isFilterActive,
  type ActivityFilterValue,
} from "../components/ActivityFilterBar";
import { Button } from "../components/Button";
import { CustomerActivityList } from "../components/CustomerActivityList";
import { Layout } from "../components/Layout";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { SearchInput } from "../components/SearchInput";
import { ApiError } from "../lib/api";
import {
  downloadCustomerActivityCsv,
  downloadCustomerDirectoryCsv,
  listCustomerActivityFeed,
  listCustomerDirectory,
} from "../lib/customer-file-api";
import { rowNavClass, stopRowNav, useRowNav } from "../lib/row-nav";
import { badgeClass } from "../lib/status-badge";
import { useToast } from "../lib/toast-context";
import { ListSkeleton, TableSkeleton } from "../components/Skeleton";

type Tab = "list" | "activity";

/**
 * จำนวนรายชื่อที่โหลดมาเติมช่อง "เลือกลูกค้า" ของแท็บกิจกรรม
 *
 * ช่องนี้เป็นตัวช่วยเลือก ไม่ใช่สารบัญ — ถ้าลูกค้าเยอะกว่านี้ การไล่หาในลิสต์ยาว ๆ ก็ไม่ใช่วิธี
 * ที่ใช้งานได้อยู่ดี หน้าจะบอกตรง ๆ ว่าแสดงไม่ครบ และให้ใช้ช่องค้นหาหรือเข้าจากแฟ้มลูกค้าแทน
 */
const PICKER_LIMIT = 500;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** เงียบมานานแค่ไหน — ใช้เตือนสายตาว่าบัญชีไหนไม่ได้แตะมานาน */
function quietFor(lastLoginAt: string | null): { text: string; className: string } {
  if (!lastLoginAt) return { text: "ยังไม่เคยเข้า", className: "text-amber-700" };
  const days = Math.floor((Date.now() - new Date(lastLoginAt).getTime()) / 86_400_000);
  if (days === 0) return { text: "วันนี้", className: "text-slate-700" };
  if (days === 1) return { text: "เมื่อวาน", className: "text-slate-700" };
  if (days < 30) return { text: `${days} วันก่อน`, className: "text-slate-700" };
  return { text: formatDate(lastLoginAt), className: "text-slate-500" };
}

function sortState(active: boolean, dir: "asc" | "desc"): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}

/**
 * หัวคอลัมน์ที่กดเรียงได้
 *
 * มีเฉพาะคอลัมน์ที่อยู่ในตาราง `User` จริง ๆ — "โครงการ" กับ "ใบเสนอราคา" เป็นค่าที่นับจาก
 * ตารางอื่น ถ้าจะเรียงต้องรวมทั้งระบบก่อนแล้วค่อยตัดหน้า ซึ่งพาเรากลับไปหาปัญหาเดิมที่กำลังแก้
 * (โหลดลูกค้าทุกคนมาก่อน) จึงปล่อยให้เป็นหัวธรรมดา ดีกว่าทำให้กดได้แล้วไม่เกิดอะไรขึ้น
 */
function SortHeader({
  field,
  label,
  sort,
  dir,
  onSort,
}: Readonly<{
  field: CustomerSortField;
  label: string;
  sort: CustomerSortField | null;
  dir: "asc" | "desc";
  onSort: (field: CustomerSortField) => void;
}>) {
  const active = sort === field;
  return (
    <th className="whitespace-nowrap px-3 py-2" aria-sort={sortState(active, dir)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-slate-900 ${
          active ? "font-semibold text-slate-900" : ""
        }`}
      >
        {label}
        {active &&
          (dir === "asc" ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </th>
  );
}

/**
 * แฟ้มลูกค้า — รายชื่อลูกค้า + ฟีดกิจกรรมรวม อยู่หน้าเดียวกันคนละแท็บ
 *
 * เดิมแยกเป็นสองเมนู เพราะสองมุมมองนี้ตอบคนละคำถาม (รายชื่อ = "จะเปิดแฟ้มของใคร",
 * กิจกรรม = "มีอะไรเคลื่อนไหวบ้าง") แต่เหตุผลนั้นไม่คุ้มกับที่ในเมนูข้างที่มี 16 รายการอยู่แล้ว
 * และการวางเป็นเมนูแยกทำให้ดูเหมือนคนละเรื่องกัน ทั้งที่เป็นเรื่องลูกค้าเหมือนกัน
 *
 * แท็บอยู่ใน URL (?tab=activity) เพื่อให้ลิงก์จากหน้าอื่นพาเข้ามาที่แท็บที่ถูกต้องได้
 *
 * **ทั้งสองแท็บแบ่งหน้าที่เซิร์ฟเวอร์** — ของเดิมโหลดมาทั้งหมดแล้วกรอง/ตัดหน้าในเบราว์เซอร์
 * ซึ่งทำงานได้ดีตอนมีลูกค้า 7 คน แต่เป็นการส่งข้อมูลส่วนบุคคลของทุกคนลงเครื่องพนักงานทุกครั้ง
 * ที่เปิดหน้า และฝั่งกิจกรรมมีเพดาน 200 แถวที่ชนแล้วเงียบ
 */
export function CustomersPage() {
  const rowNav = useRowNav();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "activity" ? "activity" : "list";
  const feedCustomerId = params.get("customerId") ?? "";

  const [customers, setCustomers] = useState<CustomerListItemDto[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [sort, setSort] = useState<CustomerSortField | null>(null);
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [query, setQuery] = useState("");
  // บัญชีที่สมัครแล้วยังไม่ยืนยันอีเมลแยกไว้อีกมุมมอง — ไม่นับเป็นลูกค้าและไม่ออกใน CSV ของรายชื่อหลัก
  const [view, setView] = useState<CustomerDirectoryView>("verified");
  const [unverifiedCount, setUnverifiedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [feed, setFeed] = useState<CustomerActivityFeedItemDto[] | null>(null);
  const [feedTotal, setFeedTotal] = useState(0);
  const [feedPage, setFeedPage] = useState(1);
  const [feedPageSize, setFeedPageSize] = useState(15);
  const [filter, setFilter] = useState<ActivityFilterValue>(EMPTY_FILTER);

  // ตัวเลือกของช่อง "ลูกค้า" ในแท็บกิจกรรม — โหลดแยกจากตาราง เพราะตารางแบ่งหน้าแล้ว
  const [pickerOptions, setPickerOptions] = useState<CustomerListItemDto[]>([]);
  const [pickerTotal, setPickerTotal] = useState(0);

  // ค้นหา/เรียง/เปลี่ยนหน้า = ยิงใหม่ทุกครั้ง (หน่วงกันยิงทุกตัวอักษรตอนพิมพ์)
  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      listCustomerDirectory({ q: query, page, sort: sort ?? undefined, dir: sort ? dir : undefined, view })
        .then((res) => {
          if (!alive) return;
          setCustomers(res.customers);
          setTotal(res.total);
          setUnverifiedCount(res.unverifiedCount);
          setPageSize(res.pageSize);
          setError(null);
        })
        .catch((err) => {
          if (alive) setError(err instanceof ApiError ? err.message : "โหลดรายชื่อลูกค้าไม่สำเร็จ");
        });
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, page, sort, dir, view]);

  // เปลี่ยนคำค้นหรือการเรียง = กลับหน้า 1 ไม่งั้นค้างอยู่หน้าท้าย ๆ ของผลชุดเก่าแล้วดูเหมือนไม่มีข้อมูล
  useEffect(() => {
    setPage(1);
  }, [query, sort, dir, view]);

  useEffect(() => {
    if (tab !== "activity") return;
    let alive = true;
    listCustomerDirectory({ sort: "name", dir: "asc", pageSize: PICKER_LIMIT })
      .then((res) => {
        if (!alive) return;
        setPickerOptions(res.customers);
        setPickerTotal(res.total);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tab]);

  // โหลดฟีดเมื่อเข้าแท็บกิจกรรมเท่านั้น — ส่วนใหญ่เข้าหน้านี้มาเพื่อหาลูกค้าสักคน
  useEffect(() => {
    if (tab !== "activity") return;
    let alive = true;
    const q = filterToQuery(filter, { customerId: feedCustomerId });
    const timer = window.setTimeout(() => {
      listCustomerActivityFeed(q, feedPage)
        .then((res) => {
          if (!alive) return;
          setFeed(res.activity);
          setFeedTotal(res.total);
          setFeedPageSize(res.pageSize);
        })
        .catch(() => {
          if (alive) setFeed([]);
        });
      // หน่วงเล็กน้อยกันยิงทุกตัวอักษรตอนพิมพ์ค้นหา
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [tab, filter, feedCustomerId, feedPage]);

  useEffect(() => {
    setFeedPage(1);
  }, [filter, feedCustomerId]);

  function goTab(next: Tab) {
    const p = new URLSearchParams(params);
    if (next === "activity") p.set("tab", "activity");
    else {
      p.delete("tab");
      p.delete("customerId");
    }
    setParams(p, { replace: true });
  }

  function toggleSort(field: CustomerSortField) {
    if (sort !== field) {
      setSort(field);
      // ชื่อเริ่มจาก ก→ฮ ส่วนวันที่เริ่มจากใหม่สุด — เป็นทิศที่คนคาดหวังของแต่ละชนิดข้อมูล
      setDir(field === "name" ? "asc" : "desc");
      return;
    }
    setDir(dir === "asc" ? "desc" : "asc");
  }

  async function runExport(fn: () => Promise<void>) {
    setExporting(true);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "ส่งออกไฟล์ไม่สำเร็จ");
    } finally {
      setExporting(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const feedPageCount = Math.max(1, Math.ceil(feedTotal / feedPageSize));
  const feedQuery = filterToQuery(filter, { customerId: feedCustomerId });

  // ลูกค้าที่เลือกไว้อาจไม่อยู่ในชุดตัวเลือกที่โหลดมา (ลิงก์ลึกจากแฟ้ม) — เอาชื่อจากฟีดมาใช้แทน
  const selectedFeedCustomer =
    pickerOptions.find((c) => c.id === feedCustomerId) ??
    (feedCustomerId && feed?.[0]?.customerId === feedCustomerId
      ? { id: feedCustomerId, fullName: feed[0].customerName ?? "ลูกค้ารายนี้" }
      : undefined);

  return (
    <Layout>
      <PageHeader
        title="แฟ้มลูกค้า"
        subtitle="บัญชีลูกค้าทั้งหมด และสิ่งที่ลูกค้าทำในระบบ"
        action={
          tab === "list" ? (
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="ค้นหาชื่อ อีเมล เบอร์โทร หรือชื่อบริษัท"
              />
              <Button
                variant="ghost"
                size="sm"
                disabled={exporting || total === 0}
                onClick={() =>
                  runExport(() =>
                    downloadCustomerDirectoryCsv({
                      view,
                      q: query,
                      sort: sort ?? undefined,
                      dir: sort ? dir : undefined,
                    }),
                  )
                }
              >
                <Download size={13} /> ส่งออก CSV
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* เส้นฐานเป็นเงาด้านใน ไม่ใช่ border + -mb-px — กันแถบเลื่อนแนวตั้ง ▲●▼ บน Windows (ดูแท็บหน้าโครงการ) */}
      <div className="mb-6 flex gap-3 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-slate-300)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          { key: "list" as Tab, label: "รายชื่อ", count: customers ? total : null },
          { key: "activity" as Tab, label: "กิจกรรม", count: null },
        ]).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => goTab(t.key)}
            aria-current={t.key === tab ? "page" : undefined}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${
              t.key === tab
                ? "border-brand font-semibold text-brand"
                : "border-transparent text-slate-600 hover:border-slate-400 hover:text-slate-900"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span
                className={`ml-1.5 text-xs tabular-nums ${
                  t.key === tab ? "text-brand/80" : "text-slate-500"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "list" && (
        <>
          {/* โผล่เฉพาะเมื่อมีบัญชีที่ยังไม่ยืนยัน (หรือกำลังดูมุมมองนั้นอยู่) — ไม่มีก็ไม่ต้องมีปุ่มรก */}
          {(unverifiedCount > 0 || view === "unverified") && (
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div role="radiogroup" aria-label="มุมมองรายชื่อ" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
                {([
                  { key: "verified" as const, label: "ลูกค้า" },
                  { key: "unverified" as const, label: `ยังไม่ยืนยันอีเมล ${unverifiedCount}` },
                ]).map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    role="radio"
                    aria-checked={view === v.key}
                    onClick={() => setView(v.key)}
                    className={`rounded-md px-3 py-1 transition-colors ${
                      view === v.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {view === "unverified" && (
                <p className="text-xs text-slate-500">
                  สมัครแล้วแต่ยังไม่ยืนยันอีเมล — อาจพิมพ์อีเมลผิดหรือเป็นอีเมลปลอม เข้าระบบไม่ได้ ·
                  ระบบลบให้อัตโนมัติเมื่อครบ {UNVERIFIED_SIGNUP_TTL_DAYS} วัน เว้นบัญชีที่ผูกโครงการ/คำขอไว้แล้ว
                </p>
              )}
            </div>
          )}
          {error && <p className="text-slate-600">{error}</p>}
          {!error && customers === null && <TableSkeleton rows={8} cols={6} />}
          {!error && customers !== null && customers.length === 0 && (
            <p className="text-slate-500">
              {emptyText(query, view)}
            </p>
          )}

          {customers !== null && customers.length > 0 && (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm [&_tbody_tr:hover]:bg-slate-50/70">
                <thead className="text-left text-xs font-medium text-slate-600 [&_th]:border-b [&_th]:border-slate-300 [&_th]:bg-slate-200">
                  <tr>
                    <SortHeader field="name" label="ชื่อ" sort={sort} dir={dir} onSort={toggleSort} />
                    {/* iPad (<1280): เบอร์โทรไปใต้อีเมล — ตารางพอดีจอ (ผู้ใช้สั่ง 18 ต.ค.) */}
                    <th className="hidden whitespace-nowrap px-3 py-2 xl:table-cell">เบอร์โทร</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">โครงการ</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right">ใบเสนอราคา</th>
                    <SortHeader
                      field="lastLogin"
                      label={view === "unverified" ? "ลบอัตโนมัติ" : "เข้าระบบล่าสุด"}
                      sort={sort}
                      dir={dir}
                      onSort={toggleSort}
                    />
                    <SortHeader
                      field="createdAt"
                      label="เป็นลูกค้าตั้งแต่"
                      sort={sort}
                      dir={dir}
                      onSort={toggleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const quiet = quietFor(c.lastLoginAt);
                    return (
                      <tr
                        key={c.id}
                        {...rowNav(`/customers/${c.id}`)}
                        className={`border-t border-slate-100 ${rowNavClass}`}
                      >
                        <td className="px-3 py-2">
                          <Link
                            to={`/customers/${c.id}`}
                            onClick={stopRowNav}
                            className="font-medium text-slate-800"
                          >
                            {c.fullName}
                          </Link>
                          {/* บัญชีที่ "ลูกค้าลบเอง" กับ "พนักงานระงับ" คนละเรื่องกัน ก่อนหน้านี้ขึ้น
                              ว่า "ระงับการใช้งาน" เหมือนกันหมด ทั้งที่ตอนนั้นระงับบัญชีลูกค้ายังทำไม่ได้เลย */}
                          {!c.active && (
                            <span className={`${badgeClass(c.anonymized ? "slate" : "red")} ml-2`}>
                              {c.anonymized ? "ลบบัญชีแล้ว" : "ระงับการใช้งาน"}
                            </span>
                          )}
                          {!c.emailVerified && (
                            <span className={`${badgeClass("amber")} ml-2`}>ยังไม่ยืนยันอีเมล</span>
                          )}
                          {/* ชื่อบริษัทอยู่บรรทัดเดียวกับอีเมล เพราะเป็น "ชื่อที่เอกสารจะออกให้"
                              ไม่ใช่ข้อมูลติดต่อ — ต้องเห็นตั้งแต่ในรายชื่อก่อนเปิดแฟ้ม */}
                          <p className="text-xs text-slate-500">
                            {c.companyName ? `${c.companyName} · ` : ""}
                            {c.email}
                          </p>
                          {c.phone && <p className="text-xs text-slate-500 xl:hidden">{c.phone}</p>}
                        </td>
                        <td className="hidden whitespace-nowrap px-3 py-2 text-slate-700 xl:table-cell">
                          {c.phone ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {c.projectCount || "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {c.quoteCount || "—"}
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2 ${view === "unverified" ? "text-slate-500" : quiet.className}`}>
                          {/* มุมมองที่ยังไม่ยืนยัน = เข้าระบบไม่ได้อยู่แล้ว ช่องนี้จึงบอกกำหนดลบแทน */}
                          {view === "unverified" ? purgeText(c.purgeAt) : quiet.text}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                          {formatDate(c.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} />
            </>
          )}
        </>
      )}

      {tab === "activity" && (
        <>
          <ActivityFilterBar value={filter} onChange={setFilter}>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>ลูกค้า</span>
              <select
                value={feedCustomerId}
                onChange={(e) => {
                  const p = new URLSearchParams(params);
                  if (e.target.value) p.set("customerId", e.target.value);
                  else p.delete("customerId");
                  setParams(p, { replace: true });
                }}
                className="max-w-55 truncate rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                <option value="">ทุกคน</option>
                {pickerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName}
                  </option>
                ))}
              </select>
            </label>
          </ActivityFilterBar>

          {/* บอกตรง ๆ เมื่อรายชื่อในช่องเลือกไม่ครบ แทนที่จะตัดท้ายทิ้งเงียบ ๆ */}
          {pickerTotal > pickerOptions.length && (
            <p className="-mt-2 mb-3 text-xs text-slate-500">
              ช่องเลือกลูกค้าแสดง {pickerOptions.length} จาก {pickerTotal} คน — ลูกค้าที่ไม่อยู่ใน
              รายการ ให้เปิดจากแฟ้มลูกค้าแล้วกด “ดูในฟีดรวมทั้งบริษัท”
            </p>
          )}

          {feed === null && <ListSkeleton rows={6} />}
          {feed !== null && feed.length === 0 && (
            <p className="text-slate-500">
              {isFilterActive(filter) || feedCustomerId
                ? "ไม่พบกิจกรรมที่ตรงกับตัวกรอง"
                : "ยังไม่มีกิจกรรมของลูกค้า"}
            </p>
          )}
          {feed !== null && feed.length > 0 && (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-500">
                  {selectedFeedCustomer ? (
                    <>
                      กิจกรรมของ{" "}
                      <Link
                        to={`/customers/${selectedFeedCustomer.id}`}
                        className="text-slate-700 underline-offset-2 hover:underline"
                      >
                        {selectedFeedCustomer.fullName}
                      </Link>{" "}
                      {feedTotal} รายการ
                    </>
                  ) : (
                    `${feedTotal} รายการ`
                  )}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={exporting}
                  onClick={() => runExport(() => downloadCustomerActivityCsv(feedQuery))}
                >
                  <Download size={13} /> ส่งออก CSV
                </Button>
              </div>
              {/* ไม่ต้องโชว์ชื่อลูกค้าซ้ำทุกบรรทัดเมื่อกรองเหลือคนเดียวแล้ว
                  pageSize=0 = ปิดการแบ่งหน้าในตัวคอมโพเนนต์ เพราะหน้านี้แบ่งที่เซิร์ฟเวอร์แล้ว */}
              <CustomerActivityList
                items={feed}
                showCustomer={!selectedFeedCustomer}
                pageSize={0}
              />
              <Pagination page={feedPage} pageCount={feedPageCount} onChange={setFeedPage} />
            </>
          )}
        </>
      )}
    </Layout>
  );
}

function emptyText(query: string, view: string) {
  if (query.trim()) return `ไม่พบลูกค้าที่ตรงกับ “${query}”`;
  return view === "unverified" ? "ไม่มีบัญชีที่รอยืนยันอีเมล" : "ยังไม่มีบัญชีลูกค้าในระบบ";
}

/** มุมมองที่ยังไม่ยืนยัน = เข้าระบบไม่ได้อยู่แล้ว ช่องนี้จึงบอกกำหนดลบแทน */
function purgeText(purgeAt: string | null | undefined) {
  return purgeAt ? formatDate(purgeAt) : "ไม่ลบ (มีของผูกไว้)";
}
