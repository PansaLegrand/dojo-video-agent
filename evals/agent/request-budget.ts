/** Evaluation-only reservation accounting. The runner persists its report after
 * admission and before fetch; uncertain paid requests keep their reservation. */
export class EvaluationAdmissionError extends Error {
  readonly dispatched = false;
}
export type EvaluationRates = { inputUsdPerMillion: number; outputUsdPerMillion: number };
export type EvaluationRequest = { ordinal: number; status: "pending" | "completed" | "unknown"; reservedUsd: number; actualUsd: number | null; inputTokens?: number; outputTokens?: number };
export class EvaluationBudget {
  readonly requests: EvaluationRequest[] = [];
  constructor(readonly maximumRequests: number, readonly maximumUsd: number, readonly rates: EvaluationRates) {
    if (!Number.isSafeInteger(maximumRequests) || maximumRequests < 1 || maximumRequests > 1000 ||
      !Number.isFinite(maximumUsd) || maximumUsd <= 0 || maximumUsd > 100 ||
      !Object.values(rates).every(rate => Number.isFinite(rate) && rate >= 0) || !(rates.inputUsdPerMillion + rates.outputUsdPerMillion > 0)) throw new Error("Invalid evaluation request or cost allowance.");
  }
  get accountedUsd() { return this.requests.reduce((sum, request) => sum + (request.actualUsd ?? request.reservedUsd), 0); }
  admit(inputBytes: number, maximumOutputTokens: number) {
    if (this.requests.some(request => request.status !== "completed")) throw new Error("Uncertain provider usage requires reconciliation; no automatic retry.");
    // Buffer supplied UTF-8 bytes (including reference images) plus the envelope.
    // This is an admission estimate, not a guarantee about provider-side context
    // or accounting. The campaign stops if reported cost exceeds this reservation.
    // Actual provider overrun remains visible, never clamped.
    const reservedUsd = ((inputBytes + 4096) * this.rates.inputUsdPerMillion + maximumOutputTokens * this.rates.outputUsdPerMillion) / 1_000_000;
    if (this.requests.length >= this.maximumRequests || this.accountedUsd + reservedUsd > this.maximumUsd)
      throw new EvaluationAdmissionError("Evaluation request budget exhausted; no automatic retry.");
    const request: EvaluationRequest = { ordinal: this.requests.length + 1, status: "pending", reservedUsd, actualUsd: null };
    this.requests.push(request);
    return request;
  }
  settle(request: EvaluationRequest, usage?: { inputTokens: number; outputTokens: number }) {
    if (!this.requests.includes(request) || request.status !== "pending") throw new Error("Evaluation request has already settled or belongs to another ledger.");
    if (!usage || ![usage.inputTokens, usage.outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) { request.status = "unknown"; return; }
    Object.assign(request, usage, { status: "completed", actualUsd: (usage.inputTokens * this.rates.inputUsdPerMillion + usage.outputTokens * this.rates.outputUsdPerMillion) / 1_000_000 });
  }
}
