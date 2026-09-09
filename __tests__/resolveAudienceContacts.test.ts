// Unit tests for resolveAudienceToRows — the shared helper that
// campaigns + scheduled + cron all lean on to turn an audience id
// into a row set. The scary edges (empty audience refused, deleted
// audience refused on the scheduled path, data flattening) live
// here so regressions surface loudly.

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveAudienceToRows, AudienceResolveError } from "../lib/resolveAudienceContacts";

type Predicate = { field: string; op: string; value?: unknown };
interface AudienceRow {
  id: string;
  userId: string;
  name: string;
  rules: string;
}
interface SavedContactRow {
  phoneNumber: string;
  data: string;
}

/** Bare-minimum Prisma double: exposes only the calls this helper
 *  makes, and records the last `where` seen so the opt-out
 *  exclusion assertion can inspect it. */
function makePrisma(opts: {
  audience?: AudienceRow | null;
  contacts?: SavedContactRow[];
}) {
  let lastFindManyWhere: unknown = null;
  const prisma = {
    audience: {
      async findUnique(_args: { where: { id: string } }): Promise<AudienceRow | null> {
        return opts.audience ?? null;
      },
    },
    savedContact: {
      async findMany(args: { where: unknown }): Promise<SavedContactRow[]> {
        lastFindManyWhere = args.where;
        return opts.contacts ?? [];
      },
    },
  };
  return {
    prisma: prisma as unknown as import("@prisma/client").PrismaClient,
    inspect: () => ({ lastFindManyWhere }),
  };
}

function rules(predicates: Predicate[]): string {
  return JSON.stringify({ op: "AND", predicates });
}

test("throws AUDIENCE_NOT_FOUND when the id does not exist", async () => {
  const { prisma } = makePrisma({ audience: null });
  await assert.rejects(
    () => resolveAudienceToRows(prisma, "user-1", "missing-id"),
    (e: unknown) =>
      e instanceof AudienceResolveError && e.code === "AUDIENCE_NOT_FOUND"
  );
});

test("throws AUDIENCE_DELETED (not NOT_FOUND) when expectExisting is set", async () => {
  const { prisma } = makePrisma({ audience: null });
  await assert.rejects(
    () =>
      resolveAudienceToRows(prisma, "user-1", "missing-id", {
        expectExisting: true,
      }),
    (e: unknown) => e instanceof AudienceResolveError && e.code === "AUDIENCE_DELETED"
  );
});

test("throws AUDIENCE_NOT_FOUND when the audience belongs to another user", async () => {
  const { prisma } = makePrisma({
    audience: {
      id: "a1",
      userId: "SOMEONE-ELSE",
      name: "x",
      rules: rules([{ field: "client", op: "is_not_empty" }]),
    },
  });
  await assert.rejects(
    () => resolveAudienceToRows(prisma, "user-1", "a1"),
    (e: unknown) =>
      e instanceof AudienceResolveError && e.code === "AUDIENCE_NOT_FOUND"
  );
});

test("throws AUDIENCE_RULES_INVALID when the stored rules are malformed", async () => {
  const { prisma } = makePrisma({
    audience: {
      id: "a1",
      userId: "user-1",
      name: "broken",
      // predicates:[] is what parseRules refuses (matches nothing is
      // enforced as an error, per the design override).
      rules: JSON.stringify({ op: "AND", predicates: [] }),
    },
  });
  await assert.rejects(
    () => resolveAudienceToRows(prisma, "user-1", "a1"),
    (e: unknown) =>
      e instanceof AudienceResolveError && e.code === "AUDIENCE_RULES_INVALID"
  );
});

test("throws AUDIENCE_EMPTY when rules resolve to zero contacts", async () => {
  const { prisma } = makePrisma({
    audience: {
      id: "a1",
      userId: "user-1",
      name: "empty today",
      rules: rules([{ field: "client", op: "is_not_empty" }]),
    },
    contacts: [], // resolver returns nothing
  });
  await assert.rejects(
    () => resolveAudienceToRows(prisma, "user-1", "a1"),
    (e: unknown) => e instanceof AudienceResolveError && e.code === "AUDIENCE_EMPTY"
  );
});

test("resolved rows carry phoneNumber plus flat data fields", async () => {
  const { prisma } = makePrisma({
    audience: {
      id: "a1",
      userId: "user-1",
      name: "Lagos VIPs",
      rules: rules([{ field: "client", op: "is_not_empty" }]),
    },
    contacts: [
      { phoneNumber: "2348012345678", data: JSON.stringify({ name: "Ada", city: "Lagos" }) },
      { phoneNumber: "2348011111111", data: JSON.stringify({ name: "Bola" }) },
    ],
  });
  const out = await resolveAudienceToRows(prisma, "user-1", "a1");
  assert.equal(out.resolvedCount, 2);
  assert.equal(out.rows[0].phoneNumber, "2348012345678");
  assert.equal(out.rows[0].name, "Ada");
  assert.equal(out.rows[0].city, "Lagos");
  assert.equal(out.rows[1].phoneNumber, "2348011111111");
  assert.equal(out.rows[1].name, "Bola");
});

test("nested/non-string data values are stringified so buildMessage doesn't crash", async () => {
  const { prisma } = makePrisma({
    audience: {
      id: "a1",
      userId: "user-1",
      name: "x",
      rules: rules([{ field: "client", op: "is_not_empty" }]),
    },
    contacts: [
      {
        phoneNumber: "1",
        data: JSON.stringify({
          age: 42,
          address: { street: "Marina", city: "Lagos" },
        }),
      },
    ],
  });
  const out = await resolveAudienceToRows(prisma, "user-1", "a1");
  assert.equal(out.rows[0].age, "42");
  assert.equal(typeof out.rows[0].address, "string");
  assert.ok(out.rows[0].address.includes("Marina"));
});

test("phoneNumber from data can't shadow the top-level phoneNumber column", async () => {
  const { prisma } = makePrisma({
    audience: {
      id: "a1",
      userId: "user-1",
      name: "x",
      rules: rules([{ field: "client", op: "is_not_empty" }]),
    },
    contacts: [
      {
        phoneNumber: "1112223333",
        data: JSON.stringify({ phoneNumber: "9998887777", name: "attacker" }),
      },
    ],
  });
  const out = await resolveAudienceToRows(prisma, "user-1", "a1");
  assert.equal(out.rows[0].phoneNumber, "1112223333");
});

test("opt-out exclusion is baked into the SavedContact.findMany where", async () => {
  const { prisma, inspect } = makePrisma({
    audience: {
      id: "a1",
      userId: "user-1",
      name: "x",
      rules: rules([{ field: "client", op: "is_not_empty" }]),
    },
    contacts: [{ phoneNumber: "1", data: "{}" }],
  });
  await resolveAudienceToRows(prisma, "user-1", "a1");
  const where = inspect().lastFindManyWhere as Record<string, unknown>;
  assert.ok(Array.isArray(where.AND), "where.AND should be an array");
  const clauses = where.AND as Array<Record<string, unknown>>;
  const hasOptOutFalse = clauses.some(
    (c) => Object.prototype.hasOwnProperty.call(c, "optedOut") && (c as { optedOut: boolean }).optedOut === false
  );
  assert.ok(hasOptOutFalse, "opt-out exclusion must be in the where clause");
});

test("malformed data JSON degrades gracefully — row keeps just phoneNumber", async () => {
  const { prisma } = makePrisma({
    audience: {
      id: "a1",
      userId: "user-1",
      name: "x",
      rules: rules([{ field: "client", op: "is_not_empty" }]),
    },
    contacts: [{ phoneNumber: "1234567890", data: "not-json{{{" }],
  });
  const out = await resolveAudienceToRows(prisma, "user-1", "a1");
  assert.equal(out.rows[0].phoneNumber, "1234567890");
  assert.equal(Object.keys(out.rows[0]).length, 1);
});
