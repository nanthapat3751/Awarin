import { useEffect, useState } from "react";

import type { CustomerLeadDto } from "@systemboq/shared-types";

import { EmptyState } from "../components/EmptyState";
import { PortalPage, StatusCard } from "../components/PortalPage";
import { LEAD_STATUS_STYLE } from "../lib/lead-status";
import { listMyLeads } from "../lib/my-api";
import { StatusListSkeleton } from "../components/Skeleton";
import { usePageMeta } from "../lib/page-meta";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("th-TH");
}

// ชิปเล็กใต้ข้อความ — บอกว่าในหน้ารายละเอียดมีอะไรใหม่ โดยไม่ต้องยัดคำตอบทั้งก้อนลงการ์ด
function Chip({ children, className }: Readonly<{ children: string; className: string }>) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

export function MyRequestsPage() {
  usePageMeta("คำขอของฉัน");
  const [leads, setLeads] = useState<CustomerLeadDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMyLeads()
      .then((res) => setLeads(res.leads))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PortalPage title="คำขอของฉัน" subtitle="ติดตามสถานะคำขอทั้งหมดของคุณกับทีมงาน">
      {loading && <StatusListSkeleton label="กำลังโหลดคำขอ..." />}

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
          const s = LEAD_STATUS_STYLE[lead.status];
          const hasChips = Boolean(lead.reply || lead.latestQuote);
          return (
            <StatusCard
              key={lead.id}
              index={i}
              href={`/my/requests/${lead.id}`}
              accent={s.accent}
              title={lead.serviceType}
              meta={`ส่งเมื่อ ${formatDate(lead.createdAt)}`}
              badge={{ label: s.label, className: s.badge }}
            >
              {lead.message && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{lead.message}</p>}
              {hasChips && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {lead.reply && <Chip className="bg-brand/10 text-brand">มีคำตอบจากทีมงาน</Chip>}
                  {lead.latestQuote && (
                    <Chip className="bg-indigo-50 text-indigo-700">มีใบเสนอราคาแล้ว</Chip>
                  )}
                </div>
              )}
            </StatusCard>
          );
        })}
      </div>
    </PortalPage>
  );
}
