import {
  NAME_CHARS_MESSAGE,
  NAME_FULL_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
  isValidFullName,
  normalizeFullName,
  validateFullName,
} from "@systemboq/shared-types";

describe("normalizeFullName", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeFullName("  สมชาย   ใจดี  ")).toBe("สมชาย ใจดี");
    expect(normalizeFullName("John\t Smith")).toBe("John Smith");
  });

  it("is safe on empty/whitespace-only input", () => {
    expect(normalizeFullName("")).toBe("");
    expect(normalizeFullName("     ")).toBe("");
  });
});

describe("validateFullName", () => {
  it("accepts a normal Thai full name", () => {
    expect(validateFullName("สมชาย ใจดี")).toBeNull();
    // Thai vowels/tone marks are combining marks — must not be rejected.
    expect(validateFullName("ณัฐวุฒิ พิพัฒน์")).toBeNull();
  });

  it("accepts Latin and accented names with connectors", () => {
    expect(validateFullName("John Smith")).toBeNull();
    expect(validateFullName("María José García")).toBeNull();
    expect(validateFullName("Anne-Marie O'Brien")).toBeNull();
  });

  it("requires a non-trivial amount of input (idea 1)", () => {
    expect(validateFullName("")).toBe(NAME_REQUIRED_MESSAGE);
    expect(validateFullName("   ")).toBe(NAME_REQUIRED_MESSAGE);
    expect(validateFullName("ก")).toBe(NAME_REQUIRED_MESSAGE);
  });

  it("rejects names that are too long (idea 1)", () => {
    const long = `${"ก".repeat(60)} ${"ข".repeat(60)}`;
    expect(validateFullName(long)).toBe(NAME_TOO_LONG_MESSAGE);
  });

  it("requires both first and last name (idea 2)", () => {
    expect(validateFullName("สมชาย")).toBe(NAME_FULL_MESSAGE);
    expect(validateFullName("John")).toBe(NAME_FULL_MESSAGE);
    // การยุบช่องว่างทำให้ช่องว่างท้ายไม่ถูกนับเป็นคำที่สองปลอม ๆ
    expect(validateFullName("สมชาย    ")).toBe(NAME_FULL_MESSAGE);
  });

  it("rejects digits, symbols and emoji (idea 3)", () => {
    expect(validateFullName("สมชาย123 ใจดี")).toBe(NAME_CHARS_MESSAGE);
    expect(validateFullName("John Smith!")).toBe(NAME_CHARS_MESSAGE);
    expect(validateFullName("สมชาย 😀")).toBe(NAME_CHARS_MESSAGE);
    expect(validateFullName("test@mail ครับ")).toBe(NAME_CHARS_MESSAGE);
  });

  it("exposes the same rule through isValidFullName", () => {
    expect(isValidFullName("สมชาย ใจดี")).toBe(true);
    expect(isValidFullName("สมชาย")).toBe(false);
    expect(isValidFullName("123 456")).toBe(false);
  });
});
