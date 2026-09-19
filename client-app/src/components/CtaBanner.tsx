import { Link } from "react-router-dom";

// แถบ CTA เต็มความกว้าง + เส้นทอง/อำพัน 3px คั่นก่อนถึง footer — ใช้ซ้ำได้หลายหน้า
// ปรับข้อความหัวข้อ/รองได้ผ่าน prop (ค่าเริ่มต้นเน้นงานบ้าน)
export function CtaBanner({
  title = "พร้อมเริ่มโครงการบ้านของคุณแล้วหรือยัง?",
  subtitle = "ปรึกษาทีมงานของเราวันนี้ พร้อมประเมินราคาให้ฟรี",
}: Readonly<{
  title?: string;
  subtitle?: string;
}>) {
  return (
    <section className="bg-linear-to-br from-brand to-brand-dark text-white border-b-[3px] border-amber-400">
      <div className="max-w-5xl mx-auto px-4 py-14 sm:py-16 flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
        <div>
          <h2 className="text-2xl sm:text-3xl font-semibold">{title}</h2>
          <p className="text-slate-200 mt-1">{subtitle}</p>
        </div>
        {/* ปุ่มขาวทึบคู่กับปุ่มเข้าสู่ระบบบน hero — มุมโค้ง 8px ให้ตรงกับที่เว็บใช้ทั้งหน้า
            (ของเดิมเป็น 4px อยู่ตัวเดียว เลยดูแปลกแยก) ลูกศรเลื่อนขวาตอนชี้เพื่อบอกว่า "พาไปต่อ" */}
        <Link
          to="/contact"
          className="group inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-white px-6 py-3 text-sm font-medium text-brand shadow-sm transition-colors hover:bg-slate-100"
        >
          ติดต่อเรา
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
