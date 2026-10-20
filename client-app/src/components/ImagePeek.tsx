import { useEffect, useRef, useState } from "react";

/**
 * รูปในการ์ดที่ "แอบดู" รูปอื่นของรายการนั้นได้โดยไม่ต้องกดเข้าไป
 *
 * ทำไมต้องมี: ข้อมูลจริงมีรูปมากกว่าที่หน้ารายการเคยโชว์อยู่มาก — บ้านสไตล์โมเดิร์นชั้นเดียวมี
 * รูปภายนอก 1 + ภายใน 6 รวม 7 ภาพ แต่การ์ดโชว์แค่รูปแรกรูปเดียว ผลงาน "งาน1" มี 4 ภาพ
 * "งานที่18" มี 3 ภาพ ก็โชว์แค่ปก ทั้งที่ API หน้ารายการส่งรูปมาครบอยู่แล้ว ไม่ต้องแก้หลังบ้านเลย
 *
 * พฤติกรรม: ปกติโชว์รูปแรก; ชี้ค้างที่การ์ดแล้วไล่สลับรูปทีละใบแบบค่อย ๆ จาง เอาเมาส์ออกกลับไปรูปแรก
 * (เคยมีป้าย "7 ภาพ"/"3/7 ภาพ" มุมขวาบน — ผู้ใช้สั่งเอาออกทั้งหน้าแบบบ้านและผลงาน 18 ต.ค. อย่าใส่กลับ)
 *
 * สองเรื่องที่ตั้งใจทำ:
 * 1. โหลดรูปเพิ่ม "เฉพาะตอนชี้ครั้งแรก" (armed) — ถ้าใส่ทุกรูปลง DOM ตั้งแต่แรก การ์ดใบเดียว
 *    จะดึงรูป 7 ไฟล์ทันทีที่เปิดหน้า ทั้งที่ผู้ใช้ส่วนใหญ่ไม่ได้ชี้
 * 2. คนที่ตั้งค่าลดการเคลื่อนไหวจะไม่มีการไล่สลับรูปเลย เหลือแค่รูปปก
 *
 * บนมือถือไม่มีการชี้ จึงเห็นแค่รูปปก
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
  // รูปแรก (ปก) โหลดเสร็จหรือยัง — ยังไม่เสร็จ = แสงวิ่งรองข้างใต้ แทนพื้นเทาเปล่าแล้วรูปโผล่พรวด
  // พังก็ถือว่าจบ (ไม่ให้แสงวิ่งค้าง) · รูปในแคชอาจเสร็จก่อนผูก onLoad จึงเช็ค complete ซ้ำ
  const [coverDone, setCoverDone] = useState(false);
  const coverRef = useRef<HTMLImageElement>(null);
  const cover = images[0];
  useEffect(() => {
    setCoverDone(Boolean(coverRef.current?.complete));
  }, [cover]);

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
      {!coverDone && <div aria-hidden className="skeleton absolute inset-0 rounded-none" />}
      {mounted.map((src, n) => (
        <img
          key={src + n}
          ref={n === 0 ? coverRef : undefined}
          src={src}
          onLoad={n === 0 ? () => setCoverDone(true) : undefined}
          onError={n === 0 ? () => setCoverDone(true) : undefined}
          // ให้รูปแรกถือคำบรรยายไว้ตัวเดียว ที่เหลือเป็นภาพชุดเดียวกันจึงซ่อนจากโปรแกรมอ่านหน้าจอ
          alt={n === 0 ? alt : ""}
          aria-hidden={n !== 0}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 group-hover:scale-105 motion-reduce:transition-none ${
            n === index && (n !== 0 || coverDone) ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </>
  );
}
