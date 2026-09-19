import { useEffect, useState } from "react";

import type { LeadDto, LeadStatus } from "@systemboq/shared-types";

import { EmptyState } from "../components/EmptyState";
import { PortalPage, StatusCard } from "../components/PortalPage";
import { listMyLeads } from "../lib/my-api";

// สไตล์ตามสถานะคำขอ: ป้ายสถานะ + แถบสีซ้าย — แยกสถานะได้จากสีทันที
const STATUS_STYLE: Record<LeadStatus, { label: string; badge: string; accent: string }> = {
  NEW: { label: "รอการติดต่อ", badge: "bg-amber-100 text-amber-700", accent: "bg-amber-400" },
  CONTACTED: { label: "ทีมงานติดต่อแล้ว", badge: "bg-sky-100 text-sky-700", accent: "bg-sky-400" },
  QUOTED: { label: "อยู่ระหว่างเสนอราคา", badge: "bg-brand/10 text-brand", accent: "bg-brand" },
  CLOSED: {
    label: "ดำเนินการเสร็จสิ้น",
    badge: "bg-emerald-100 text-emerald-700",
    accent: "bg-emerald-400",
  },
  REJECTED: { label: "ไม่ดำเนินการต่อ", badge: "bg-rose-100 text-rose-700", accent: "bg-rose-400" },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH");
}

export function MyRequestsPage() {
  const [leads, setLeads] = useState<LeadDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyLeads()
      .then((res) => setLeads(res.leads))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalPage title="คำขอของฉัน" subtitle="ติดตามสถานะคำขอทั้งหมดของคุณกับทีมงาน">
      {loading && <p className="text-slate-400">กำลังโหลด...</p>}

      {!loading && leads.length === 0 && (
        <EmptyState
          title="ยังไม่มีคำขอ"
          description="เริ่มต้นด้วยการส่งคำขอ แล้วติดตามสถานะการติดต่อกลับจากทีมงานได้ที่นี่"
          ctaLabel="ส่งคำขอ"
          ctaTo="/contact"
        />
      )}

      <div className="flex flex-col gap-3">
        {leads.map((lead, i) => {
          const s = STATUS_STYLE[lead.status];
          return (
            <StatusCard
              key={lead.id}
              index={i}
              accent={s.accent}
              title={lead.serviceType}
              meta={formatDate(lead.createdAt)}
              badge={{ label: s.label, className: s.badge }}
            >
              {lead.message && <p className="mt-2 text-sm text-slate-500">{lead.message}</p>}
              {lead.reply && (
                <div className="mt-3 rounded-r border-l-2 border-brand bg-brand/5 px-3 py-2">
                  <p className="text-xs font-medium text-brand">คำตอบจากทีมงาน</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{lead.reply}</p>
                </div>
              )}
            </StatusCard>
          );
        })}
      </div>
    </PortalPage>
  );
}
