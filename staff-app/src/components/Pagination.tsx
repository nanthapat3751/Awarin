interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/**
 * เลขหน้าแบบมีช่องว่าง: 1 … 4 5 6 … 9 แสดงหน้าแรกและหน้าสุดท้ายเสมอ บวกกับช่วงรอบ ๆ หน้า
 * ปัจจุบัน ตัวควบคุมจึงกว้างคงที่ไม่ว่าข้อมูลจะมีกี่หน้า
 */
/** ช่องว่างมีชื่อตามเลขหน้าที่อยู่ก่อนหน้ามัน ("gap-1", "gap-6") — ใช้เป็น key ได้ตรง ๆ */
type PageEntry = number | `gap-${number}`;

function pageNumbers(page: number, pageCount: number): PageEntry[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const around = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  // ให้ชุดเลขอยู่ติดกับปลายด้านที่เราใกล้ เพื่อไม่ให้แถวยุบเหลือ "1 … 2 … 9" ตอนอยู่หน้าที่สอง
  if (page <= 3) [2, 3, 4].forEach((n) => around.add(n));
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => around.add(n));

  const shown = [...around].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);

  const out: PageEntry[] = [];
  let previous = 0;
  for (const n of shown) {
    if (previous && n - previous > 1) out.push(`gap-${previous}`);
    out.push(n);
    previous = n;
  }
  return out;
}

export function Pagination({ page, pageCount, onChange }: Readonly<PaginationProps>) {
  if (pageCount <= 1) return null;

  const arrowClass =
    "px-2 py-1 text-slate-700 rounded-md hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <nav className="flex items-center justify-center gap-1 mt-4" aria-label="แบ่งหน้า">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="หน้าก่อนหน้า"
        className={arrowClass}
      >
        ‹
      </button>

      {pageNumbers(page, pageCount).map((entry) =>
        typeof entry === "string" ? (
          <span key={entry} className="px-2 text-slate-300 select-none">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={`min-w-8 px-2 py-1 rounded-md text-sm ${
              entry === page
                ? "bg-slate-800 text-white"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= pageCount}
        aria-label="หน้าถัดไป"
        className={arrowClass}
      >
        ›
      </button>
    </nav>
  );
}
