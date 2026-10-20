import type { ContractDto, ContractPaymentsViewDto } from "@systemboq/shared-types";
import { useEffect, useState } from "react";

import { getContractPayments } from "./contracts-api";

/**
 * ภาพรวมรับเงินของสัญญาที่ลงนามแล้วในโครงการนี้ — โหลดใหม่เมื่อ `refreshKey` เปลี่ยน
 * (หลังปิดแผงรับเงิน/บันทึกสัญญา) · โหลดไม่ได้ (เช่น ไม่มีสิทธิ์) = ไม่แสดง ไม่ใช่ตัวเลขศูนย์
 */
export function useContractMoney(projectId: string, contracts: ContractDto[], refreshKey: unknown) {
  const [views, setViews] = useState<Map<string, ContractPaymentsViewDto>>(new Map());
  const signedIds = contracts.filter((c) => c.signedAt).map((c) => c.id).join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = signedIds ? signedIds.split(",") : [];
    Promise.allSettled(ids.map((id) => getContractPayments(projectId, id))).then((results) => {
      if (cancelled) return;
      const next = new Map<string, ContractPaymentsViewDto>();
      results.forEach((r, i) => {
        if (r.status === "fulfilled") next.set(ids[i], r.value);
      });
      setViews(next);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, signedIds, refreshKey]);

  return views;
}
