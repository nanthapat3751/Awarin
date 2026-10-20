import type { BoqItemDto, RebarCuttingDto, StructuralCompareDto } from "@systemboq/shared-types";
import { useEffect, useMemo, useState } from "react";

import { getRebarCutting, getStructuralCompare } from "./boq-api";

/**
 * โหลดผลเทียบของเวอร์ชันล่าสุด — เฉพาะโครงการที่มีแถวจากตัวคิดชิ้นส่วนแล้ว (โครงการอื่นไม่ยิงคำขอ)
 * โหลดใหม่เมื่อ BOQ เปลี่ยน (บรรทัด/ปริมาณ/จำนวนแถว)
 */
export function useStructuralCompare(projectId: string, items: BoqItemDto[]): StructuralCompareDto | null {
  const signature = useMemo(
    () => items.map((i) => `${i.id}:${i.quantity}:${i.takeoffRows.length}`).join("|"),
    [items],
  );
  const hasMembers = useMemo(() => items.some((i) => i.takeoffRows.some((r) => r.memberKey)), [items]);
  const [compare, setCompare] = useState<StructuralCompareDto | null>(null);
  useEffect(() => {
    if (!hasMembers) {
      setCompare(null);
      return;
    }
    let alive = true;
    getStructuralCompare(projectId)
      .then(({ compare: c }) => alive && setCompare(c))
      // ผลเทียบเป็นข้อมูลเสริม — โหลดไม่ได้ไม่ขวางหน้า BOQ (ไม่แสดงป้าย)
      .catch(() => alive && setCompare(null));
    return () => {
      alive = false;
    };
  }, [projectId, signature, hasMembers]);
  return compare;
}

/** แผนตัดเหล็กหน้างาน — เงื่อนไขโหลดเดียวกับผลเทียบ (มีแถวจากตัวคิดชิ้นส่วน) · โหลดไม่ได้ = ใช้การนับแบบหารปัดขึ้นแทน */
export function useRebarCutting(projectId: string, items: BoqItemDto[]): RebarCuttingDto | null {
  const signature = useMemo(
    () => items.map((i) => `${i.id}:${i.quantity}:${i.takeoffRows.length}`).join("|"),
    [items],
  );
  const hasMembers = useMemo(() => items.some((i) => i.takeoffRows.some((r) => r.memberKey)), [items]);
  const [cutting, setCutting] = useState<RebarCuttingDto | null>(null);
  useEffect(() => {
    if (!hasMembers) {
      setCutting(null);
      return;
    }
    let alive = true;
    getRebarCutting(projectId)
      .then(({ cutting: c }) => alive && setCutting(c))
      .catch(() => alive && setCutting(null));
    return () => {
      alive = false;
    };
  }, [projectId, signature, hasMembers]);
  return cutting;
}
