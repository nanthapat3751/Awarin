import {
  assertValidQuoteTransition,
  InvalidQuoteTransitionError,
} from "../../src/lib/quote-state-machine";

describe("quote state machine", () => {
  it("allows DRAFT -> SENT", () => {
    expect(() => assertValidQuoteTransition("DRAFT", "SENT")).not.toThrow();
  });

  it("allows SENT -> ACCEPTED, SENT -> REJECTED, SENT -> REVISED", () => {
    expect(() => assertValidQuoteTransition("SENT", "ACCEPTED")).not.toThrow();
    expect(() => assertValidQuoteTransition("SENT", "REJECTED")).not.toThrow();
    expect(() => assertValidQuoteTransition("SENT", "REVISED")).not.toThrow();
  });

  it("rejects transitions from terminal quote statuses", () => {
    expect(() => assertValidQuoteTransition("ACCEPTED", "SENT")).toThrow(
      InvalidQuoteTransitionError,
    );
    expect(() => assertValidQuoteTransition("REJECTED", "SENT")).toThrow(
      InvalidQuoteTransitionError,
    );
    expect(() => assertValidQuoteTransition("REVISED", "SENT")).toThrow(
      InvalidQuoteTransitionError,
    );
  });

  it("rejects skipping DRAFT straight to ACCEPTED", () => {
    expect(() => assertValidQuoteTransition("DRAFT", "ACCEPTED")).toThrow(
      InvalidQuoteTransitionError,
    );
  });
});
