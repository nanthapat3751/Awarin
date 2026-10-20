/**
 * "หมายถึง somchai@gmail.com หรือเปล่า? · ใช้อีเมลนี้" ใต้ช่องอีเมล
 *
 * คำแนะนำ ไม่ใช่ข้อผิดพลาด — สีเหลืองอำพัน ไม่ใช่แดง และไม่กันการส่งฟอร์ม เพราะการเดาโดเมน
 * ใกล้เคียงผิดได้ (ดู suggestEmailFix ใน shared-types) กดปุ่มแล้วถึงจะแก้ให้ ไม่แก้เงียบ ๆ
 */
export function EmailSuggestion({
  suggestion,
  onUse,
}: Readonly<{ suggestion: string; onUse: (email: string) => void }>) {
  return (
    <p className="-mt-2 text-sm text-amber-800" role="status">
      หมายถึง <span className="font-medium">{suggestion}</span> หรือเปล่า?{" "}
      <button
        type="button"
        onClick={() => onUse(suggestion)}
        className="auth-link inline-flex min-h-11 items-center font-medium lg:min-h-0"
      >
        ใช้อีเมลนี้
      </button>
    </p>
  );
}
