import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeOwnershipEvent, ownershipForYear, safeOwnershipForYear, type OwnershipEvent } from "../lib/ownership";

const event = (effectiveAt: string, percentageBps: number, sequence = 0): OwnershipEvent => ({
  effectiveAt, percentageBps, sequence, capitalCents: "10000001", sourceFileId: "test",
  sourceHash: "a".repeat(64),
});
test("latest snapshot preserves history and is idempotent, including partner exit", () => {
  const previous = { ...event("2024-01-01", 2000), sourceFileId: "original" };
  const incoming = { ...event("2024-03-01", 2500), sourceFileId: "aditivo" };
  const history = mergeOwnershipEvent([previous], incoming);
  assert.deepEqual(mergeOwnershipEvent(history, incoming), history);
  assert.equal(ownershipForYear(history, 2024).months[2].ownershipDelta, 5);
  const exited = mergeOwnershipEvent(history, { ...event("2024-04-01", 0), sourceFileId: "exit" });
  assert.equal(ownershipForYear(exited, 2024).months[3].ownershipDelta, -25);
  assert.throws(() => mergeOwnershipEvent(history, previous));
  assert.throws(() => mergeOwnershipEvent(history, { ...incoming, effectiveAt: "2024-04-01" }));
});
test("baseline, carry-forward, and net monthly changes across years", () => {
  const result = ownershipForYear([
    event("2023-12-01", 2000), event("2024-02-10", 2500),
    event("2024-02-20", 2300), event("2024-04-01", 0),
  ], 2024);
  assert.equal(result.months[0].ownershipDelta, null);
  assert.equal(result.months[1].ownershipDelta, 3);
  assert.equal(result.months[2].ownershipPercentage, 23);
  assert.equal(result.months[3].ownershipDelta, -23);
  assert.equal(result.ownershipValueCents, "0");
});
test("initial contract is a baseline; same-day order and rounding are deterministic", () => {
  const result = ownershipForYear([event("2024-01-01", 2000), event("2024-01-01", 2500, 1)], 2024);
  assert.equal(result.months[0].ownershipDelta, 5);
  assert.equal(result.ownershipValueCents, "2500000");
});
test("exact ODBC quota value takes precedence over rounded percentage math", () => {
  const result = ownershipForYear([{
    ...event("2024-01-01", 3334), ownershipValueCents: "400000", quotas: "4000", quotaValueCents: "100",
  }], 2024);
  assert.equal(result.ownershipValueCents, "400000");
  assert.equal(result.quotas, "4000");
});
test("missing data remains unknown; invalid history fails validation", () => {
  assert.equal(ownershipForYear(null, 2024).ownershipPercentage, null);
  assert.throws(() => ownershipForYear([event("2024-02-30", 2000)], 2024));
  assert.throws(() => ownershipForYear([event("2024-02-01", 10001)], 2024));
});
test("safe dashboard boundary quarantines an invalid history without throwing", () => {
  const result = safeOwnershipForYear([event("2024-02-30", 2000)], 2024);
  assert.equal(result.valid, false);
  assert.equal(result.ownershipValueCents, null);
  assert.equal(result.months.length, 12);
  assert.match(result.issue ?? "", /reprocessamento/);
});
test("explicit prior percentage in a withdrawal clause supports first-import delta", () => {
  const result = ownershipForYear([{ ...event("2024-02-25", 0), previousPercentageBps: 5000 }], 2024);
  assert.equal(result.months[0].ownershipPercentage, null);
  assert.equal(result.months[1].ownershipDelta, -50);
  assert.equal(result.months[2].ownershipDelta, null);
});
