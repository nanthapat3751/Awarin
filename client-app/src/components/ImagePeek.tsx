import { useEffect, useState } from "react";

/**
 * รูปในการ์ดที่ "แอบดู" รูปอื่นของรายการนั้นได้โดยไม่ต้องกดเข้าไป
 *
 * ทำไมต้องมี: ข้อมูลจริงมีรูปมากกว่าที่หน้ารายการเคยโชว์อยู่มาก — บ้านสไตล์โมเดิร์นชั้นเดียวมี
 * รูปภายนอก 1 + ภายใน 6 รวม 7 ภาพ แต่การ์ดโชว์แค่รูปแรกรูปเดียว ผลงาน "งาน1" มี 4 ภาพ
 * "งานที่18" มี 3 ภาพ ก็โชว์แค่ปก ทั้งที่ API หน้ารายการส่งรูปมาครบอยู่แล้ว ไม่ต้องแก้หลังบ้านเลย
 *
 * พฤติกรรม: ปกติโชว์รูปแรก + ป้ายบอกจำนวนภาพมุมขวาบน; ชี้ค้างที่การ์ดแล้วไล่สลับรูปทีละใบ
 * แบบค่อย ๆ จาง พร้อมเปลี่ยนป้ายเป็น "3/7 ภาพ" ให้รู้ว่าดูถึงไหน เอาเมาส์ออกกลับไปรูปแรก
 *
 * สองเรื่องที่ตั้งใจทำ:
 * 1. โหลดรูปเพิ่ม "เฉพาะตอนชี้ครั้งแรก" (armed) — ถ้าใส่ทุกรูปลง DOM ตั้งแต่แรก การ์ดใบเดียว
 *    จะดึงรูป 7 ไฟล์ทันทีที่เปิดหน้า ทั้งที่ผู้ใช้ส่วนใหญ่ไม่ได้ชี้
 * 2. คนที่ตั้งค่าลดการเคลื่อนไหวจะไม่มีการไล่สลับรูปเลย เหลือแค่ป้ายบอกจำนวน
 *
 * ป้ายใช้พื้นเข้มโปร่ง 70% เพราะรูปข้างหลังเป็นอะไรก็ได้ — คำนวณกรณีแย่สุด (รูปขาวล้วน)
 * ตัวอักษรขาวยังได้ 6.6:1 ผ่านเกณฑ์
 *
 * บนมือถือไม่มีการชี้ จึงเหลือแค่ป้ายบอกจำนวน — ซึ่งก็ยังบอกได้ว่ากดเข้าไปแล้วมีรูปให้ดูอีก
 */
export function ImagePeek({
  images,
  alt,
  active,
}: Readonly<{
  images: string[];
  alt: string;
  /** การ์ดกำลังถูกชี้อยู่หรือไม่ — ให้การ์ดเป็นคนบอก เพราะเลเยอร์ overlay ในการ์ดกินอีเวนต์เมาส์ */
  active: boolean;
}>) {
  const [index, setIndex] = useState(0);
  const [armed, setArmed] = useState(false);
  const many = images.length > 1;

  useEffect(() => {
    if (!active || !many) {
      setIndex(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setArmed(true);
    const id = window.setInterval(() => setIndex((n) => (n + 1) % images.length), 1400);
    return () => window.clearInterval(id);
  }, [active, many, images.length]);

  // ก่อนชี้ครั้งแรกใส่แค่รูปเดียวลง DOM — กันการดาวน์โหลดรูปที่ยังไม่มีใครดู
  const mounted = armed ? images : images.slice(0, 1);

  return (
    <>
      {mounted.map((src, n) => (
        <img
          key={src + n}
          src={src}
          // ให้รูปแรกถือคำบรรยายไว้ตัวเดียว ที่เหลือเป็นภาพชุดเดียวกันจึงซ่อนจากโปรแกรมอ่านหน้าจอ
          alt={n === 0 ? alt : ""}
          aria-hidden={n !== 0}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 group-hover:scale-105 motion-reduce:transition-none ${
            n === index ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {many && (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {active && armed ? `${index + 1}/${images.length} ภาพ` : `${images.length} ภาพ`}
        </span>
      )}
    </>
  );
}
