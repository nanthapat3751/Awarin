/**
 * ปุ่มกรองตามสถานะพร้อมจำนวน — ตัวเลขมาจากเซิร์ฟเวอร์ (นับใต้คำค้น+ช่วงเวลาเดียวกัน)
 * ระหว่างโหลดครั้งแรกยังไม่มีตัวเลข จึงแสดงแค่ชื่อ ไม่เดาเลข 0
 */
export function StatusChips<S extends string>({
  statuses,
  labels,
  counts,
  value,
  onChange,
  allTitle,
}: Readonly<{
  statuses: readonly S[];
  labels: Record<S, string>;
  counts: Partial<Record<S | "ALL", number>> | undefined;
  value: S | null;
  onChange: (next: S | null) => void;
  /** คำอธิบายของปุ่ม "ทั้งหมด" เมื่อมันไม่ได้นับทุกสถานะจริง ๆ */
  allTitle?: string;
}>) {
  const chips: { key: S | null; label: string; count: number | undefined; title?: string }[] = [
    { key: null, label: "ทั้งหมด", count: counts?.ALL, title: allTitle },
    ...statuses.map((s) => ({ key: s, label: labels[s], count: counts?.[s] })),
  ];
  return (
    <fieldset className="mb-3 flex flex-wrap gap-1.5 min-w-0" aria-label="กรองตามสถานะ">
      {chips.map((chip) => {
        const active = value === chip.key;
        return (
          <button
            key={chip.key ?? "ALL"}
            type="button"
            title={chip.title}
            aria-pressed={active}
            onClick={() => onChange(chip.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active ? "bg-brand text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {chip.label}
            {chip.count != null && (
              <span className={`ml-1 tabular-nums ${active ? "text-white/80" : "text-slate-400"}`}>{chip.count}</span>
            )}
          </button>
        );
      })}
    </fieldset>
  );
}
