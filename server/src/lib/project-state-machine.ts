// State machine ของสถานะโปรเจกต์ (MASTER_PROMPT.md §6, กฎ guard + BR-07/BR-08)

export type ProjectStatus =
  | "DRAFT"
  | "QUOTED"
  | "REJECTED"
  | "APPROVED"
  | "COMPLETED"
  | "CANCELLED";

export class InvalidTransitionError extends Error {
  constructor(from: ProjectStatus, to: ProjectStatus) {
    super(`Invalid project status transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const TERMINAL_STATUSES: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>(["COMPLETED", "CANCELLED"]);

const ALLOWED_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  DRAFT: ["QUOTED", "CANCELLED"],
  QUOTED: ["REJECTED", "APPROVED", "CANCELLED"],
  // ลูกค้าปฏิเสธแล้วยังไม่จบ: ออกใบเสนอราคาฉบับใหม่แล้วส่ง โปรเจกต์กลับไปเป็น QUOTED เอง
  // (ดู quotes.service.ts) ถ้าตัดสินใจเลิกตามดีลจริง ๆ ค่อยยกเลิกโปรเจกต์
  REJECTED: ["QUOTED", "CANCELLED"],
  // บริษัทไม่ได้ติดตามช่วงก่อสร้าง โปรเจกต์ที่อนุมัติแล้วจึงปิดงานเป็น COMPLETED (ส่งมอบ)
  // ตรง ๆ — ไม่มีสถานะ "กำลังก่อสร้าง" แยกต่างหาก
  APPROVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export interface ProjectTransitionContext {
  /** ต้องเป็น true เมื่อเปลี่ยน QUOTED -> APPROVED (ต้องมีใบเสนอราคาสถานะ ACCEPTED อยู่) */
  hasAcceptedQuote?: boolean;
  /** ต้องเป็น true เมื่อเปลี่ยน QUOTED -> REJECTED (ต้องมีใบเสนอราคาที่ถูกปฏิเสธจริง) */
  hasRejectedQuote?: boolean;
}

export function isTerminalProjectStatus(status: ProjectStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** โยน InvalidTransitionError เมื่อการเปลี่ยนสถานะไม่ได้รับอนุญาต ไม่เช่นนั้นคืน void */
export function assertValidProjectTransition(
  from: ProjectStatus,
  to: ProjectStatus,
  context: ProjectTransitionContext = {},
): void {
  if (isTerminalProjectStatus(from)) {
    throw new InvalidTransitionError(from, to);
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
  if (from === "QUOTED" && to === "APPROVED" && !context.hasAcceptedQuote) {
    throw new InvalidTransitionError(from, to);
  }
  // กันไม่ให้ปั๊มสถานะ "ลูกค้าปฏิเสธ" ใส่โปรเจกต์โดยที่ไม่มีใบเสนอราคาที่ถูกปฏิเสธจริง —
  // สถานะนี้ตั้งใจให้ขยับเองตามใบเสนอราคาเท่านั้น ไม่ใช่ปุ่มให้พนักงานกดเล่น
  if (from === "QUOTED" && to === "REJECTED" && !context.hasRejectedQuote) {
    throw new InvalidTransitionError(from, to);
  }
}
