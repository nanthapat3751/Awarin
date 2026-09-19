import { Search, X } from "lucide-react";

/**
 * ช่องค้นหาของทั้งแอป — ไอคอนแว่นขยายอยู่ "ด้านขวา"
 *
 * ทำไมรวมเป็นคอมโพเนนต์: เดิมช่องค้นหา 6 จุดเขียนแยกกันหมด บางหน้าไม่มีไอคอนเลย บางหน้ามีไอคอน
 * อยู่ซ้าย ทำให้หน้าตาไม่ตรงกัน และเวลาจะแก้ทีต้องไล่แก้ทุกไฟล์
 *
 * ปุ่มล้าง (X) ใช้ "ช่องเดียวกัน" กับแว่นขยาย — พิมพ์แล้วแว่นสลับเป็นปุ่มล้าง ไม่วางซ้อนกันสองอัน
 * `type="search"` + `.search-clean` เพื่อปิดปุ่มกากบาทของเบราว์เซอร์เอง (ไม่งั้นจะซ้ำกับปุ่มเรา)
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName = "",
  autoFocus,
  clearable = true,
  onKeyDown,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** คลาสของกล่องนอก — ใช้คุมความกว้าง/flex ให้เข้ากับแถวที่ไปวาง */
  className?: string;
  /** เผื่อบางที่ต้องการความสูงต่างจากค่าเริ่มต้น */
  inputClassName?: string;
  autoFocus?: boolean;
  clearable?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}>) {
  const showClear = clearable && value.length > 0;

  return (
    <div className={`relative ${className}`}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        className={`search-clean w-full rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-9 text-sm text-slate-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand ${inputClassName}`}
      />
      {showClear ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="ล้างคำค้นหา"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X size={14} />
        </button>
      ) : (
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
      )}
    </div>
  );
}
