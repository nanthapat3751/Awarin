// State machine ของสถานะใบเสนอราคา (MASTER_PROMPT.md §6)

export type QuoteStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "REVISED";

export class InvalidQuoteTransitionError extends Error {
  constructor(from: QuoteStatus, to: QuoteStatus) {
    super(`Invalid quote status transition: ${from} -> ${to}`);
    this.name = "InvalidQuoteTransitionError";
  }
}

const ALLOWED_TRANSITIONS: Record<QuoteStatus, readonly QuoteStatus[]> = {
  DRAFT: ["SENT"],
  SENT: ["ACCEPTED", "REJECTED", "REVISED"],
  ACCEPTED: [],
  REJECTED: [],
  REVISED: [],
};

export function assertValidQuoteTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidQuoteTransitionError(from, to);
  }
}
