import {
  assertValidProjectTransition,
  InvalidTransitionError,
  isTerminalProjectStatus,
} from "../../src/lib/project-state-machine";

describe("project state machine", () => {
  it("allows DRAFT -> QUOTED", () => {
    expect(() => assertValidProjectTransition("DRAFT", "QUOTED")).not.toThrow();
  });

  it("allows DRAFT -> CANCELLED and QUOTED -> CANCELLED", () => {
    expect(() => assertValidProjectTransition("DRAFT", "CANCELLED")).not.toThrow();
    expect(() => assertValidProjectTransition("QUOTED", "CANCELLED")).not.toThrow();
  });

  it("requires an accepted quote before QUOTED -> APPROVED", () => {
    expect(() => assertValidProjectTransition("QUOTED", "APPROVED")).toThrow(
      InvalidTransitionError,
    );
    expect(() =>
      assertValidProjectTransition("QUOTED", "APPROVED", { hasAcceptedQuote: false }),
    ).toThrow(InvalidTransitionError);
    expect(() =>
      assertValidProjectTransition("QUOTED", "APPROVED", { hasAcceptedQuote: true }),
    ).not.toThrow();
  });

  it("allows APPROVED -> COMPLETED directly (no construction phase tracked)", () => {
    expect(() => assertValidProjectTransition("APPROVED", "COMPLETED")).not.toThrow();
  });

  it("rejects transitions out of terminal statuses", () => {
    expect(isTerminalProjectStatus("COMPLETED")).toBe(true);
    expect(isTerminalProjectStatus("CANCELLED")).toBe(true);
    expect(() => assertValidProjectTransition("COMPLETED", "APPROVED")).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertValidProjectTransition("CANCELLED", "DRAFT")).toThrow(
      InvalidTransitionError,
    );
  });

  it("rejects skipping states, e.g. DRAFT -> APPROVED or DRAFT -> COMPLETED", () => {
    expect(() => assertValidProjectTransition("DRAFT", "APPROVED")).toThrow(
      InvalidTransitionError,
    );
    expect(() => assertValidProjectTransition("DRAFT", "COMPLETED")).toThrow(
      InvalidTransitionError,
    );
  });

  it("rejects cancelling an already-approved project", () => {
    expect(() => assertValidProjectTransition("APPROVED", "CANCELLED")).toThrow(
      InvalidTransitionError,
    );
  });

  describe("สถานะ \"ลูกค้าปฏิเสธ\"", () => {
    it("ต้องมีใบเสนอราคาที่ถูกปฏิเสธจริงถึงจะเข้าสถานะนี้ได้", () => {
      // กันไม่ให้ปั๊มสถานะนี้ใส่โปรเจกต์ด้วยมือ — ต้องขยับตามใบเสนอราคาเท่านั้น
      expect(() => assertValidProjectTransition("QUOTED", "REJECTED")).toThrow(
        InvalidTransitionError,
      );
      expect(() =>
        assertValidProjectTransition("QUOTED", "REJECTED", { hasRejectedQuote: true }),
      ).not.toThrow();
    });

    it("ไม่ใช่สถานะปลายทาง — ออกใบใหม่แล้วกลับไปเสนอราคาได้ หรือปิดดีลไปเลย", () => {
      expect(isTerminalProjectStatus("REJECTED")).toBe(false);
      expect(() => assertValidProjectTransition("REJECTED", "QUOTED")).not.toThrow();
      expect(() => assertValidProjectTransition("REJECTED", "CANCELLED")).not.toThrow();
    });

    it("ข้ามไปอนุมัติ/ปิดงานตรง ๆ จากสถานะถูกปฏิเสธไม่ได้", () => {
      expect(() =>
        assertValidProjectTransition("REJECTED", "APPROVED", { hasAcceptedQuote: true }),
      ).toThrow(InvalidTransitionError);
      expect(() => assertValidProjectTransition("REJECTED", "COMPLETED")).toThrow(
        InvalidTransitionError,
      );
    });
  });
});
