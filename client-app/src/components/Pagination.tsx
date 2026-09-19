interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}

/**
 * เลขหน้าแบบมีช่องว่าง: 1 … 4 5 6 … 9 แสดงหน้าแรกและหน้าสุดท้ายเสมอ บวกช่วงรอบ ๆ หน้าปัจจุบัน
 * แถวจึงกว้างคงที่ไม่ว่าจะมีกี่หน้า (ตรรกะชุดเดียวกับฝั่งพนักงาน แต่ปุ่มสูง 44px ตามมาตรฐานมือถือของฝั่งลูกค้า)
 */
/** ช่องว่างมีชื่อตามเลขหน้าที่อยู่ก่อนหน้ามัน ("gap-1", "gap-6") — ใช้เป็น key ได้ตรง ๆ */
type PageEntry = number | `gap-${number}`;

function pageNumbers(page: number, pageCount: number): PageEntry[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const around = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  // ให้ชุดเลขอยู่ติดปลายด้านที่เราใกล้ ไม่ให้แถวยุบเหลือ "1 … 2 … 9" ตอนอยู่หน้าที่สอง
  if (page <= 3) [2, 3, 4].forEach((n) => around.add(n));
  if (page >= pageCount - 2)
    [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => around.add(n));

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
    "flex h-11 w-9 items-center justify-center rounded-lg text-lg text-slate-600 transition-colors hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent sm:w-11";

  return (
    <nav className="mt-6 flex flex-wrap items-center justify-center gap-1" aria-label="แบ่งหน้า">
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
          <span key={entry} className="select-none px-0.5 text-slate-300 sm:px-1">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            aria-current={entry === page ? "page" : undefined}
            className={`h-11 min-w-9 rounded-lg px-1 text-sm tabular-nums transition-colors sm:min-w-11 sm:px-2 ${
              entry === page
                ? "bg-brand font-semibold text-white"
                : "text-slate-600 hover:bg-white"
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
