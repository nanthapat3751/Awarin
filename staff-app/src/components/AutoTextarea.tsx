import { useEffect, useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

/**
 * ช่องข้อความที่สูงตามเนื้อหาเสมอ — ไม่มีสกรอลล์ในกล่อง
 *
 * หน้าแม่แบบสัญญาเป็น "แผ่นเอกสาร" ถ้ากล่องสูงคงที่แล้วเนื้อล้น เอกสารจะถูกตัดเป็นหน้าต่างเล็ก ๆ
 * (ของเดิมข้อ 9 ยาว 2,077 ตัวอักษร แต่กล่องสูง 126px = มองเห็นแค่ 18%)
 *
 * ต้องเซ็ต height เป็น auto ก่อนอ่าน scrollHeight ทุกครั้ง ไม่งั้นความสูงจะโตอย่างเดียว ลดไม่ลง
 * และต้องคำนวณใหม่ตอนจอเปลี่ยนขนาดด้วย เพราะการตัดบรรทัดเปลี่ยน = จำนวนบรรทัดเปลี่ยน
 */
export function AutoTextarea({
  value,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(fit, [value]);

  useEffect(() => {
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      className={`resize-none overflow-hidden ${className ?? ""}`}
      {...props}
    />
  );
}
