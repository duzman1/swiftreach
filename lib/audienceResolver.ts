// Audience rule language + resolver.
//
// Rules are stored as JSON on Audience.rules. This module is the
// SINGLE PLACE that:
//   1. Defines what a valid rule shape looks like (parseRules)
//   2. Turns a valid rule shape into a Prisma where clause
//      (rulesToWhere)
//
// Both the API (create/update/preview) and the send-time resolvers
// (regular campaigns POST + scheduled campaigns cron) import from
// here. Pure functions — no Prisma calls; the caller runs the
// query with the returned where clause.
//
// EMPTY-SET SEMANTICS
// An empty predicate list is REJECTED at parse time (throws
// AudienceRulesError). It never reaches rulesToWhere. The API
// layer surfaces this as a 400; the wizard prevents saving; and
// the send-time path can't invoke rulesToWhere on empty rules
// because parseRules has already refused them. See the schema
// comment on model Audience for why "empty matches nothing" is
// the intentional semantic.

import type { Prisma } from "@prisma/client";

// Operator names match lib/applyFilters.ts EXACTLY. Do not add
// synonyms — the wizard's ephemeral filter will eventually collapse
// into this and a vocabulary split would force a migration.
export type Operator =
  | "equals"
  | "not_equals"
  | "contains"
  | "greater_than"
  | "less_than"
  | "is_empty"
  | "is_not_empty"
  | "in"; // group membership only — a set predicate

// Fields the resolver knows how to filter on. Anything under
// data.* falls into the DATA_KEY_PREFIX branch and is matched
// against the JSON substring of SavedContact.data.
export type Field =
  | "group"     // ContactGroup membership; op MUST be "in"
  | "client"    // Client label; op equals/not_equals/is_empty/is_not_empty
  | "optedOut"; // Boolean; op equals only

const DATA_KEY_PREFIX = "data.";

export interface Predicate {
  field: string;              // "group" | "client" | "optedOut" | "data.<key>"
  op: Operator;
  value?: string | boolean | string[];
}

export interface AudienceRules {
  op: "AND";                  // v1: flat AND only
  predicates: Predicate[];
}

/** Thrown by parseRules; the API + UI layers surface the message. */
export class AudienceRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudienceRulesError";
  }
}

/**
 * Parse + validate an unknown JSON value as an AudienceRules.
 * Throws AudienceRulesError on any structural or content issue,
 * with a message shaped for the user (not the developer). The
 * empty-predicate case is one of those errors — see file header.
 */
export function parseRules(raw: unknown): AudienceRules {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AudienceRulesError("Rules must be an object");
  }
  const rules = raw as Record<string, unknown>;
  if (rules.op !== "AND") {
    throw new AudienceRulesError(`Rule op must be "AND" (v1)`);
  }
  if (!Array.isArray(rules.predicates)) {
    throw new AudienceRulesError("Rules must have a predicates array");
  }
  if (rules.predicates.length === 0) {
    throw new AudienceRulesError(
      "An audience needs at least one rule. Add a rule (like 'group in VIPs') and save again."
    );
  }
  const predicates = rules.predicates.map((p, i) => parsePredicate(p, i));
  return { op: "AND", predicates };
}

function parsePredicate(raw: unknown, idx: number): Predicate {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AudienceRulesError(`Rule #${idx + 1} must be an object`);
  }
  const p = raw as Record<string, unknown>;
  const field = typeof p.field === "string" ? p.field : "";
  const op = typeof p.op === "string" ? (p.op as Operator) : ("" as Operator);
  const value = p.value;
  if (!field) throw new AudienceRulesError(`Rule #${idx + 1}: missing field`);
  if (!isValidField(field)) {
    throw new AudienceRulesError(
      `Rule #${idx + 1}: unknown field "${field}". Valid: group, client, optedOut, data.<key>.`
    );
  }
  if (!isValidOperatorForField(field, op)) {
    throw new AudienceRulesError(
      `Rule #${idx + 1}: operator "${op}" is not valid for field "${field}".`
    );
  }
  // Value-shape validation depends on the operator.
  if (op === "is_empty" || op === "is_not_empty") {
    // No value required or accepted.
    return { field, op };
  }
  if (op === "in") {
    if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === "string")) {
      throw new AudienceRulesError(
        `Rule #${idx + 1}: "in" needs a non-empty array of ids`
      );
    }
    return { field, op, value: value as string[] };
  }
  if (field === "optedOut") {
    if (typeof value !== "boolean") {
      throw new AudienceRulesError(`Rule #${idx + 1}: optedOut value must be true or false`);
    }
    return { field, op, value };
  }
  if (typeof value !== "string") {
    throw new AudienceRulesError(`Rule #${idx + 1}: value must be a string`);
  }
  return { field, op, value };
}

function isValidField(field: string): boolean {
  if (field === "group" || field === "client" || field === "optedOut") return true;
  if (field.startsWith(DATA_KEY_PREFIX) && field.length > DATA_KEY_PREFIX.length) return true;
  return false;
}

function isValidOperatorForField(field: string, op: string): boolean {
  if (field === "group") return op === "in";
  if (field === "client") {
    return op === "equals" || op === "not_equals" || op === "is_empty" || op === "is_not_empty";
  }
  if (field === "optedOut") return op === "equals";
  if (field.startsWith(DATA_KEY_PREFIX)) {
    return (
      op === "equals" || op === "not_equals" || op === "contains" ||
      op === "greater_than" || op === "less_than" ||
      op === "is_empty" || op === "is_not_empty"
    );
  }
  return false;
}

/**
 * Turn a validated rule tree into a Prisma where clause against
 * SavedContact. Always ANDs the caller-supplied userId into the
 * result so an audience can NEVER resolve across accounts.
 *
 * The `data.*` predicates match against the JSON substring of
 * SavedContact.data. That's cheap and portable but has one
 * quirk: it's the same approach ContactGroup.groupIds uses (see
 * app/api/contacts/route.ts) and it's exact enough for cuid-
 * shaped values. For free-text data.<key> matches it's a
 * substring on the entire JSON blob, so a rule `data.City equals
 * "Lagos"` will also match a contact with `{ City: "Lagosville" }`
 * under the `contains` op — same behaviour as lib/applyFilters.ts.
 * If the wizard filter ever grows a JSON path resolver we should
 * replace both callers together.
 */
export function rulesToWhere(
  rules: AudienceRules,
  userId: string
): Prisma.SavedContactWhereInput {
  const AND: Prisma.SavedContactWhereInput[] = [];
  for (const p of rules.predicates) {
    AND.push(predicateToWhere(p));
  }
  return { userId, AND };
}

function predicateToWhere(p: Predicate): Prisma.SavedContactWhereInput {
  // ── group membership ──
  if (p.field === "group" && p.op === "in") {
    const ids = p.value as string[];
    // Any-of match: groupIds JSON contains any of the listed cuids.
    return { OR: ids.map((gid) => ({ groupIds: { contains: gid } })) };
  }

  // ── client label ──
  if (p.field === "client") {
    if (p.op === "equals")       return { clientId: p.value as string };
    if (p.op === "not_equals")   return { NOT: { clientId: p.value as string } };
    if (p.op === "is_empty")     return { clientId: null };
    if (p.op === "is_not_empty") return { NOT: { clientId: null } };
  }

  // ── opt-out state ──
  if (p.field === "optedOut" && p.op === "equals") {
    return { optedOut: p.value as boolean };
  }

  // ── data.<key> ──
  if (p.field.startsWith(DATA_KEY_PREFIX)) {
    const key = p.field.slice(DATA_KEY_PREFIX.length);
    const val = typeof p.value === "string" ? p.value : "";
    // Substring against SavedContact.data (JSON string). Matches
    // lib/applyFilters.ts behaviour; not a JSON path query.
    switch (p.op) {
      case "equals":       return { data: { contains: `"${key}":"${val}"`, mode: "insensitive" } };
      case "not_equals":   return { NOT: { data: { contains: `"${key}":"${val}"`, mode: "insensitive" } } };
      case "contains":     return { data: { contains: val, mode: "insensitive" } };
      case "greater_than":
      case "less_than":
        // Numeric comparisons need JSON parsing; approximate by
        // fetching all contacts of this user and filtering in JS
        // is out of scope for the Prisma-level resolver. Callers
        // that need this can post-filter — for v1 we degrade to
        // "always false" here so a rule that looks like it should
        // work doesn't silently match everyone.
        return { id: "__audience_impossible_id__" };
      case "is_empty":
        return { OR: [
          { data: { equals: "{}" } },
          { NOT: { data: { contains: `"${key}"` } } },
        ]};
      case "is_not_empty":
        return { data: { contains: `"${key}"` } };
    }
  }

  // Unreachable if parseRules did its job; belt-and-suspenders.
  return { id: "__audience_impossible_id__" };
}
