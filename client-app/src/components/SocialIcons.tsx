// ไอคอนช่องทางโซเชียล (inline SVG แบบทึบ) — client-app ไม่ได้ติดตั้ง lucide จึงวาดเอง
// อยู่ที่นี่เพราะใช้ทั้งในฟุตเตอร์และในคอลัมน์ข้อมูลติดต่อของหน้า /contact
type IconProps = { className?: string };

export const FacebookIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-4 w-4"} aria-hidden>
    <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
  </svg>
);

export const YoutubeIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-4 w-4"} aria-hidden>
    <path d="M23.5 6.2a3 3 0 0 0-2.11-2.12C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.39.58A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.11 2.12C4.5 20.5 12 20.5 12 20.5s7.5 0 9.39-.58a3 3 0 0 0 2.11-2.12A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
  </svg>
);

export const LineIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className ?? "h-4 w-4"} aria-hidden>
    <path d="M12 3C6.48 3 2 6.58 2 11c0 2.53 1.5 4.78 3.86 6.25-.13.9-.6 2.2-.7 2.53-.13.42.16.42.33.31.13-.09 2.02-1.34 2.86-1.9.5.07 1.02.1 1.55.1 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
  </svg>
);
