// แผงอธิบายว่า "บัญชีลูกค้าใช้ทำอะไร" — ใช้ร่วมกันบนหน้าเข้าสู่ระบบและสมัครสมาชิก เพื่อให้คนที่ยัง
// ไม่ล็อกอินเข้าใจคุณค่าก่อนตัดสินใจ (แก้ปัญหา "ปุ่มเข้าสู่ระบบมีแต่โชว์ ไม่รู้ว่าเข้าไปทำอะไรได้")
const BENEFITS: { title: string; desc: string }[] = [
  { title: "ดูใบเสนอราคา", desc: "เปิดดูราคาและรายละเอียดงานได้ทุกเมื่อ" },
  { title: "ติดตามสถานะคำขอและโครงการ", desc: "รู้ว่างานของคุณอยู่ในขั้นตอนไหน" },
  { title: "เก็บสัญญาและเอกสาร", desc: "ดาวน์โหลดเอกสารทั้งหมดได้จากที่เดียว" },
  { title: "รับการแจ้งเตือน", desc: "มีอัปเดตใหม่แจ้งให้ทราบทันที" },
];

export function AccountBenefits() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">บัญชีลูกค้า Awarin</h2>
        <p className="mt-1 text-sm text-slate-500">พื้นที่ส่วนตัวสำหรับติดตามงานของคุณกับเรา</p>
      </div>
      <ul className="flex flex-col gap-4">
        {BENEFITS.map((b) => (
          <li key={b.title} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.29 6.8-6.8a1 1 0 0 1 1.4 0Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <div>
              <p className="text-sm font-medium text-slate-700">{b.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{b.desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
