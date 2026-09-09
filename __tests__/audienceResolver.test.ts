// Runs via `npm test` → tsx --test __tests__/*.test.ts
//
// parseRules + rulesToWhere are the single point that decides:
//   1. Whether a rule set is valid (parseRules throws AudienceRulesError)
//   2. What Prisma where clause an audience produces (rulesToWhere)
//
// Both are pure; testing them here gates every rule-set behaviour the
// app relies on — creating, previewing, and resolving audiences at
// send time all go through this module.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseRules,
  rulesToWhere,
  AudienceRulesError,
} from "../lib/audienceResolver";

const USER = "user_test";

// ── parseRules: shape validation ──

test("empty predicates array is REJECTED", () => {
  // The core spec: an empty rule set matches nothing, and the
  // resolver refuses to produce a "match everyone" clause. The
  // error travels up to the API layer as a 400 and to the wizard
  // as a save-blocking toast.
  assert.throws(
    () => parseRules({ op: "AND", predicates: [] }),
    (err) => err instanceof AudienceRulesError
      && /at least one rule/i.test(err.message),
  );
});

test("non-AND op is rejected (v1 doesn't support OR / nested)", () => {
  assert.throws(
    () => parseRules({ op: "OR", predicates: [{ field: "optedOut", op: "equals", value: false }] }),
    (err) => err instanceof AudienceRulesError,
  );
});

test("unknown field name is rejected", () => {
  assert.throws(
    () => parseRules({ op: "AND", predicates: [{ field: "gender", op: "equals", value: "F" }] }),
    (err) => err instanceof AudienceRulesError && /unknown field/i.test(err.message),
  );
});

test("operator mismatch (client + in) is rejected", () => {
  // `in` is a group-only operator; client uses equals/is_empty variants.
  assert.throws(
    () => parseRules({ op: "AND", predicates: [{ field: "client", op: "in", value: ["c1"] }] }),
    (err) => err instanceof AudienceRulesError,
  );
});

test("group predicate requires non-empty array of ids", () => {
  assert.throws(
    () => parseRules({ op: "AND", predicates: [{ field: "group", op: "in", value: [] }] }),
    (err) => err instanceof AudienceRulesError,
  );
});

test("data.<key> field parses cleanly", () => {
  const rules = parseRules({
    op: "AND",
    predicates: [{ field: "data.City", op: "equals", value: "Lagos" }],
  });
  assert.equal(rules.predicates[0].field, "data.City");
  assert.equal(rules.predicates[0].op, "equals");
});

// ── rulesToWhere: userId scoping + shape ──

test("resolver ALWAYS scopes to userId", () => {
  // Cross-user leak is the class of bug this test exists to catch.
  const rules = parseRules({
    op: "AND",
    predicates: [{ field: "optedOut", op: "equals", value: false }],
  });
  const where = rulesToWhere(rules, USER);
  assert.equal(where.userId, USER, "userId must be top-level in the where clause");
});

test("group predicate turns into OR of contains matches", () => {
  const rules = parseRules({
    op: "AND",
    predicates: [{ field: "group", op: "in", value: ["g1", "g2"] }],
  });
  const where = rulesToWhere(rules, USER);
  // AND[0] is the OR-of-contains block.
  const p = (where.AND as any[])[0];
  assert.ok(p.OR);
  assert.equal(p.OR.length, 2);
  assert.equal(p.OR[0].groupIds.contains, "g1");
});

test("client equals → clientId equality", () => {
  const rules = parseRules({
    op: "AND",
    predicates: [{ field: "client", op: "equals", value: "c-acme" }],
  });
  const where = rulesToWhere(rules, USER);
  const p = (where.AND as any[])[0];
  assert.equal(p.clientId, "c-acme");
});

test("client is_empty → clientId: null (matches 'Unassigned')", () => {
  const rules = parseRules({
    op: "AND",
    predicates: [{ field: "client", op: "is_empty" }],
  });
  const where = rulesToWhere(rules, USER);
  const p = (where.AND as any[])[0];
  assert.equal(p.clientId, null);
});

test("optedOut: false → optedOut: false", () => {
  const rules = parseRules({
    op: "AND",
    predicates: [{ field: "optedOut", op: "equals", value: false }],
  });
  const where = rulesToWhere(rules, USER);
  const p = (where.AND as any[])[0];
  assert.equal(p.optedOut, false);
});

test("multiple predicates AND together", () => {
  const rules = parseRules({
    op: "AND",
    predicates: [
      { field: "group",    op: "in",     value: ["g1"] },
      { field: "client",   op: "equals", value: "c-acme" },
      { field: "optedOut", op: "equals", value: false },
    ],
  });
  const where = rulesToWhere(rules, USER);
  assert.equal((where.AND as any[]).length, 3);
});

test("data.<key> greater_than / less_than degrades to impossible-id, not to match-all", () => {
  // Numeric ops need JSON parse; v1 resolver can't do them at the
  // Prisma level. The safe fallback is "match nothing", not
  // "match everything" — a rule the user thought was narrowing
  // must not silently blast the whole list.
  const rules = parseRules({
    op: "AND",
    predicates: [{ field: "data.Balance", op: "greater_than", value: "500" }],
  });
  const where = rulesToWhere(rules, USER);
  const p = (where.AND as any[])[0];
  assert.equal(p.id, "__audience_impossible_id__");
});

test("parseRules is idempotent on a valid tree", () => {
  const source = {
    op: "AND" as const,
    predicates: [{ field: "optedOut", op: "equals" as const, value: false }],
  };
  const once = parseRules(source);
  const twice = parseRules(once);
  assert.deepEqual(twice, once);
});
