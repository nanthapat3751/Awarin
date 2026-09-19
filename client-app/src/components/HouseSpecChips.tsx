import type { HouseDesignDto } from "@systemboq/shared-types";

// ไอคอนชิปสเปกบ้าน สไตล์เส้น (viewBox 24, stroke ตามสีตัวอักษร) ให้เข้ากันทั้งชุด
function ChipIcon({ children, className = "h-3.5 w-3.5" }: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

// ผังพื้น (พื้นที่ใช้สอย)
function AreaIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <ChipIcon className={className}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <path d="M4 10h16M10 4v16" />
    </ChipIcon>
  );
}

// ชั้นซ้อน (จำนวนชั้น)
function FloorsIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <ChipIcon className={className}>
      <path d="m12 2 9 5-9 5-9-5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 17 9 5 9-5" />
    </ChipIcon>
  );
}

// เตียง (ห้องนอน)
function BedIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <ChipIcon className={className}>
      <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
      <path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" />
      <path d="M2 18h20" />
    </ChipIcon>
  );
}

// อ่างอาบน้ำ (ห้องน้ำ)
function BathIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <ChipIcon className={className}>
      <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.7 3 4 3.7 4 4.5V12" />
      <path d="M2 12h20v3a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-3Z" />
      <path d="M7 19l-1 2M18 19l-1 2" />
    </ChipIcon>
  );
}

interface SpecChip {
  key: string;
  icon: (p: { className?: string }) => React.ReactNode;
  value: number | string;
  unit: string;
}

// เก็บเฉพาะสเปกที่มีค่า (null = ไม่โชว์ชิปนั้น) ให้แบบบ้านเก่าที่ไม่มีค่าไม่พัง
function collectChips(d: HouseDesignDto): SpecChip[] {
  const chips: SpecChip[] = [];
  if (d.area) chips.push({ key: "area", icon: AreaIcon, value: d.area, unit: "ตร.ม." });
  if (d.floors != null) chips.push({ key: "floors", icon: FloorsIcon, value: d.floors, unit: "ชั้น" });
  if (d.bedrooms != null) chips.push({ key: "bed", icon: BedIcon, value: d.bedrooms, unit: "ห้องนอน" });
  if (d.bathrooms != null) chips.push({ key: "bath", icon: BathIcon, value: d.bathrooms, unit: "ห้องน้ำ" });
  return chips;
}

// แถวชิปสเปกบ้าน (พื้นที่/ชั้น/ห้องนอน/ห้องน้ำ) — สำหรับการ์ดในหน้ารายการ
export function HouseSpecChips({ d }: Readonly<{ d: HouseDesignDto }>) {
  const chips = collectChips(d);
  if (chips.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600"
        >
          <c.icon />
          <span className="font-medium text-slate-700">{c.value}</span>
          {c.unit}
        </span>
      ))}
    </div>
  );
}

// เวอร์ชันใหญ่สำหรับหน้ารายละเอียด — ชิปโปร่งมีขอบ ตัวเลขเด่น
export function HouseSpecChipsLarge({ d }: Readonly<{ d: HouseDesignDto }>) {
  const chips = collectChips(d);
  if (chips.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm"
        >
          <span className="text-brand">
            <c.icon className="h-5 w-5" />
          </span>
          <span className="font-semibold text-slate-800">{c.value}</span>
          {c.unit}
        </span>
      ))}
    </div>
  );
}
