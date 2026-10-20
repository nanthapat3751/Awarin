import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type { Period } from "../components/PeriodPicker";
import type { ListQuery } from "./projects-api";

/**
 * ตัวกรองของหน้ารายการเก็บใน URL (?q=&status=&year=&month=&page=) — เปิดรายการแล้วกดย้อนกลับ
 * จะกลับมาที่หน้าเดิม ตัวกรองเดิม · แชร์ลิงก์ให้เพื่อนร่วมงานก็เห็นชุดเดียวกัน
 *
 * คำค้นพิมพ์ลงช่องทันที แต่เขียนลง URL (และยิงคำขอ) หลังหยุดพิมพ์ 300ms · เปลี่ยนตัวกรองใด ๆ = กลับหน้า 1
 */
export function useListParams<S extends string>(statuses: readonly S[]) {
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const rawStatus = params.get("status");
  // ค่าที่ไม่รู้จัก (แก้ URL เอง/ลิงก์เก่า) = ไม่กรอง
  const status = statuses.includes(rawStatus as S) ? (rawStatus as S) : null;
  const year = Number(params.get("year"));
  const month = Number(params.get("month"));
  const period: Period | null = Number.isInteger(year) && year >= 2000
    ? { year, month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null }
    : null;
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);

  // แก้ทีละหลายค่าแล้วเขียน URL ครั้งเดียว · replace = ไม่เพิ่มประวัติทุกตัวที่พิมพ์/คลิก
  function update(changes: Record<string, string | null>, resetPage = true) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value == null || value === "") next.delete(key);
          else next.set(key, value);
        }
        if (resetPage) next.delete("page");
        return next;
      },
      { replace: true },
    );
  }

  // ช่องค้นหา: พิมพ์ได้ลื่น แล้วค่อยส่งลง URL · URL เปลี่ยนจากข้างนอก (ย้อนกลับ) → ช่องตาม
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => setSearchInput(q), [q]);
  useEffect(() => {
    if (searchInput.trim() === q) return;
    const timer = setTimeout(() => update({ q: searchInput.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const query: ListQuery = useMemo(
    () => ({ q: q || undefined, status: status ?? undefined, year: period?.year, month: period?.month, page }),
    [q, status, period?.year, period?.month, page],
  );

  return {
    query,
    q,
    status,
    period,
    page,
    searchInput,
    setSearchInput,
    setStatus: (next: S | null) => update({ status: next }),
    setPeriod: (next: Period | null) =>
      update({ year: next ? String(next.year) : null, month: next?.month ? String(next.month) : null }),
    // เปลี่ยนหน้าเป็นการกระทำที่คนอยากย้อนกลับได้ — เพิ่มประวัติ (push) ต่างจากตัวกรอง
    setPage: (next: number) =>
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (next <= 1) p.delete("page");
        else p.set("page", String(next));
        return p;
      }),
  };
}
