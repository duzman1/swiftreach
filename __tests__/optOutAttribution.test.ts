// Runs with: `npm test`  (which invokes `tsx --test __tests__/*.test.ts`)
//
// pickAttributedCampaign is the pure function the live opt-out
// detector (lib/optOut.ts.attributeOptOut) calls after fetching
// candidate sends from Prisma. Testing it directly means the DB
// layer + the attribution rule stay decoupled — a schema change
// won't invalidate these cases, and the same code path decides
// which client's report an opt-out lands in for compliance.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickAttributedCampaign,
  OPT_OUT_ATTRIBUTION_LOOKBACK_DAYS,
} from "../lib/optOutAttribution";

const optOutAt = new Date("2026-09-15T10:00:00Z");
const N = OPT_OUT_ATTRIBUTION_LOOKBACK_DAYS;

test("N is 30 (the shipped policy value)", () => {
  // If this fails, someone changed the policy — check
  // reportData.ts's scoping-rule comment matches too.
  assert.equal(N, 30);
});

test("send inside lookback window → attributed", () => {
  const sends = [
    { campaignId: "c-inside", sentAt: new Date("2026-09-01T10:00:00Z") }, // 14 days before
  ];
  const result = pickAttributedCampaign(sends, optOutAt, N);
  assert.notEqual(result, null, "should attribute an in-window send");
  assert.equal(result!.campaignId, "c-inside");
});

test("send outside lookback window → NOT attributed (stays null)", () => {
  const sends = [
    { campaignId: "c-old", sentAt: new Date("2026-07-01T10:00:00Z") }, // 76 days before
  ];
  const result = pickAttributedCampaign(sends, optOutAt, N);
  assert.equal(result, null, "76-day-old send must not attribute at N=30");
});

test("no sends at all → NOT attributed", () => {
  const result = pickAttributedCampaign([], optOutAt, N);
  assert.equal(result, null, "empty send list must return null");
});

test("two sends, most recent within window → picks the more recent", () => {
  const sends = [
    { campaignId: "c-older", sentAt: new Date("2026-08-25T10:00:00Z") }, // 21 days before
    { campaignId: "c-newer", sentAt: new Date("2026-09-10T10:00:00Z") }, //  5 days before
  ];
  const result = pickAttributedCampaign(sends, optOutAt, N);
  assert.notEqual(result, null);
  assert.equal(result!.campaignId, "c-newer", "most-recent send must win");
});

// Additional edge-case coverage — same execution path, guards
// against silent regressions if the ordering rule ever changes.

test("send AFTER the opt-out → ignored (can't have caused it)", () => {
  const sends = [
    { campaignId: "c-future", sentAt: new Date("2026-09-16T10:00:00Z") }, // 1 day AFTER
    { campaignId: "c-past",   sentAt: new Date("2026-09-14T10:00:00Z") }, // 1 day before
  ];
  const result = pickAttributedCampaign(sends, optOutAt, N);
  assert.equal(result!.campaignId, "c-past");
});

test("send exactly at the lookback boundary → attributed", () => {
  // Exactly N days before optOutAt — cutoff comparison uses `<`
  // (strict), so an equal timestamp is on the inside of the window.
  const boundary = new Date(optOutAt.getTime() - N * 24 * 60 * 60 * 1000);
  const sends = [{ campaignId: "c-edge", sentAt: boundary }];
  const result = pickAttributedCampaign(sends, optOutAt, N);
  assert.notEqual(result, null, "boundary send must attribute");
  assert.equal(result!.campaignId, "c-edge");
});

test("send exactly at the opt-out timestamp → attributed", () => {
  // A webhook can fire so quickly that Contact.sentAt and the
  // opt-out timestamp collide. Equal counts as "before".
  const sends = [
    { campaignId: "c-simultaneous", sentAt: new Date(optOutAt.getTime()) },
  ];
  const result = pickAttributedCampaign(sends, optOutAt, N);
  assert.notEqual(result, null);
  assert.equal(result!.campaignId, "c-simultaneous");
});

test("does not mutate its input", () => {
  const sends = [
    { campaignId: "a", sentAt: new Date("2026-09-01T10:00:00Z") },
    { campaignId: "b", sentAt: new Date("2026-09-05T10:00:00Z") },
  ];
  const snapshot = JSON.stringify(sends);
  pickAttributedCampaign(sends, optOutAt, N);
  assert.equal(JSON.stringify(sends), snapshot, "input array must be unchanged");
});
