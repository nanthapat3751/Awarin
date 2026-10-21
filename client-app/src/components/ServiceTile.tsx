import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";

interface ServiceTileProps {
  title: string;
  desc: string;
  to: string;
  /** ไอคอนจาง ๆ บนพื้นน้ำเงิน เมื่อการ์ดนี้ยังไม่มีรูป */
  Icon: ComponentType;
  /** null = ยังไม่รู้ค่าตั้งจากคลังรูป (แสงวิ่งรอ) · "" = ไม่มีรูป (พื้นน้ำเงินของบริษัท) */
  image: string | null;
}

/**
 * การ์ดบริการแบบรูปเต็มใบ ตัวหนังสือขาวทับด้านล่าง — คำอธิบายพับไว้ เอาเมาส์ชี้/โฟกัสแล้วเลื่อนขึ้นมา
 * (จอสัมผัสไม่มีการชี้ จึงเปิดคำอธิบายไว้ตลอด คุมด้วย .service-tile-desc ใน index.css)
 *
 * ลำดับการโหลดเหมือน hero: แสงวิ่งระหว่างรอ → รูปจางเข้า → ตัวหนังสือลอยขึ้น
 * ตัวหนังสือรอรูปเพราะเป็นสีขาว ขึ้นก่อนรูปจะอ่านไม่ออกบนก้อนเทาของแสงวิ่ง
 *
 * กดได้ทั้งใบ: ชื่อบริการเป็นลิงก์จริงแล้วขยายพื้นที่กดคลุมการ์ดด้วย after: (โปรแกรมอ่านหน้าจอได้ยิน
 * "งานออกแบบ, ลิงก์" ไม่ใช่ "ดูรายละเอียด" สามครั้ง และยังคลิกกลางเปิดแท็บใหม่ได้)
 */
export function ServiceTile({
  title,
  desc,
  to,
  Icon,
  image,
}: Readonly<ServiceTileProps>) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // เปลี่ยนรูป (ค่าตั้งจากเซิร์ฟเวอร์มาถึงทีหลังค่าในแคช) = เริ่มนับใหม่ ไม่งั้นสถานะ "พัง" ของรูปเก่าค้าง
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    // รูปในแคชอาจโหลดเสร็จก่อน React ผูก onLoad
    const img = imgRef.current;
    if (image && img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [image]);

  const hasImage = !!image && !failed;
  const waiting = image === null || (hasImage && !loaded);

  return (
    <div
      className={`group relative aspect-4/3 overflow-hidden rounded-xl md:aspect-3/4 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-brand has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-slate-50 ${
        waiting ? "bg-slate-100" : "bg-brand"
      }`}
    >
      {!waiting && !hasImage && (
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-br from-[#26308f] via-brand to-brand-dark"
        >
          <span className="absolute right-6 top-6 text-white/15 [&_svg]:h-24 [&_svg]:w-24">
            <Icon />
          </span>
        </div>
      )}
      {hasImage && (
        <img
          ref={imgRef}
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
      {/* ไล่มืดจากล่าง ให้ตัวหนังสือขาวอ่านออกไม่ว่ารูปที่พนักงานอัปจะสว่างแค่ไหน */}
      {hasImage && (
        <div
          aria-hidden
          className={`absolute inset-0 bg-linear-to-t from-black/80 via-black/25 to-transparent transition-opacity duration-700 motion-reduce:transition-none ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}

      {waiting && (
        <div aria-hidden className="skeleton-group absolute inset-0">
          <div className="skeleton absolute inset-0 rounded-none" />
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 p-6 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
          waiting ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <h3 className="text-xl font-semibold">
          <Link
            to={to}
            className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
          >
            {title}
          </Link>
        </h3>
        <p className="service-tile-desc text-sm leading-relaxed text-white/90">
          <span className="block pt-2">{desc}</span>
        </p>
        {/* ตัวบอกว่ากดได้ ไม่ใช่ลิงก์แยก (ลิงก์จริงคือชื่อบริการด้านบน) */}
        <span
          aria-hidden="true"
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium"
        >
          <span>ดูรายละเอียด</span>
          <span className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none">
            →
          </span>
        </span>
      </div>
    </div>
  );
}
