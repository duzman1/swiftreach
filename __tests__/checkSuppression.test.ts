// Unit tests for the single-point enforcement helper. Uses a fake
// Prisma double so we can verify: DNC takes priority over
// SavedContact.optedOut; missing rows return { suppress: false };
// bulk helpers return correct union + classification; audit rows
// carry the right shape.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  checkSuppression,
  loadSuppressedSet,
  classifySuppressions,
  logSuppressed,
} from "../lib/checkSuppression";

interface DncRow { userId: string; phoneNumber: string; }
interface OptedRow { userId: string; phoneNumber: string; optedOut: boolean; }

/** Minimal Prisma double: exposes only the calls the helper actually
 *  makes. Records log writes so tests can inspect them. */
function makePrisma(state: {
  dnc?: DncRow[];
  opted?: OptedRow[];
} = {}) {
  const dnc = state.dnc ?? [];
  const opted = state.opted ?? [];
  const logs: Array<Record<string, unknown>> = [];
  const prisma = {
    doNotContact: {
      async findUnique(args: { where: { userId_phoneNumber: { userId: string; phoneNumber: string } } }) {
        const { userId, phoneNumber } = args.where.userId_phoneNumber;
        const hit = dnc.find((r) => r.userId === userId && r.phoneNumber === phoneNumber);
        return hit ? { id: `dnc-${phoneNumber}` } : null;
      },
      async findMany(args: { where: { userId: string; phoneNumber?: { in: string[] } } }) {
        return dnc
          .filter((r) => r.userId === args.where.userId)
          .filter((r) => !args.where.phoneNumber?.in || args.where.phoneNumber.in.includes(r.phoneNumber));
      },
    },
    savedContact: {
      async findUnique(args: { where: { userId_phoneNumber: { userId: string; phoneNumber: string } }; select: unknown }) {
        const { userId, phoneNumber } = args.where.userId_phoneNumber;
        const hit = opted.find((r) => r.userId === userId && r.phoneNumber === phoneNumber);
        return hit ? { optedOut: hit.optedOut } : null;
      },
      async findMany(args: { where: { userId: string; optedOut?: boolean; phoneNumber?: { in: string[] } } }) {
        return opted
          .filter((r) => r.userId === args.where.userId)
          .filter((r) => args.where.optedOut === undefined || r.optedOut === args.where.optedOut)
          .filter((r) => !args.where.phoneNumber?.in || args.where.phoneNumber.in.includes(r.phoneNumber));
      },
    },
    suppressionLog: {
      async create(args: { data: Record<string, unknown> }) {
        logs.push(args.data);
        return { id: `log-${logs.length}`, ...args.data };
      },
      async createMany(args: { data: Array<Record<string, unknown>> }) {
        for (const d of args.data) logs.push(d);
        return { count: args.data.length };
      },
    },
  };
  return {
    prisma: prisma as unknown as import("@prisma/client").PrismaClient,
    logs,
  };
}

test("no DNC + no opt-out → suppress: false, no log written", async () => {
  const { prisma, logs } = makePrisma();
  const decision = await checkSuppression(prisma, {
    userId: "u1",
    phoneNumber: "1112223333",
    surface: "campaign",
  });
  assert.equal(decision.suppress, false);
  assert.equal(logs.length, 0);
});

test("DNC hit → suppress with reason 'do_not_contact', logs one row", async () => {
  const { prisma, logs } = makePrisma({
    dnc: [{ userId: "u1", phoneNumber: "1112223333" }],
  });
  const decision = await checkSuppression(prisma, {
    userId: "u1",
    phoneNumber: "1112223333",
    surface: "automation",
    automationId: "auto-1",
  });
  assert.equal(decision.suppress, true);
  assert.equal(decision.reason, "do_not_contact");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].reason, "do_not_contact");
  assert.equal(logs[0].surface, "automation");
  assert.equal(logs[0].automationId, "auto-1");
});

test("DNC takes priority over SavedContact.optedOut", async () => {
  const { prisma, logs } = makePrisma({
    dnc: [{ userId: "u1", phoneNumber: "111" }],
    opted: [{ userId: "u1", phoneNumber: "111", optedOut: true }],
  });
  const decision = await checkSuppression(prisma, {
    userId: "u1",
    phoneNumber: "111",
    surface: "campaign",
  });
  assert.equal(decision.reason, "do_not_contact"); // NOT "opted_out"
  assert.equal(logs.length, 1);
  assert.equal(logs[0].reason, "do_not_contact");
});

test("SavedContact.optedOut without DNC → suppress with reason 'opted_out'", async () => {
  const { prisma } = makePrisma({
    opted: [{ userId: "u1", phoneNumber: "222", optedOut: true }],
  });
  const decision = await checkSuppression(prisma, {
    userId: "u1",
    phoneNumber: "222",
    surface: "single_send",
  });
  assert.equal(decision.suppress, true);
  assert.equal(decision.reason, "opted_out");
});

test("suppression check is per-user — another user's DNC doesn't block", async () => {
  const { prisma } = makePrisma({
    dnc: [{ userId: "u1", phoneNumber: "555" }],
  });
  const decision = await checkSuppression(prisma, {
    userId: "u2", // different user
    phoneNumber: "555",
    surface: "webhook",
  });
  assert.equal(decision.suppress, false);
});

test("logIfSuppressed: false does not write an audit row", async () => {
  const { prisma, logs } = makePrisma({
    dnc: [{ userId: "u1", phoneNumber: "999" }],
  });
  const decision = await checkSuppression(prisma, {
    userId: "u1",
    phoneNumber: "999",
    surface: "campaign",
    logIfSuppressed: false,
  });
  assert.equal(decision.suppress, true);
  assert.equal(logs.length, 0); // pre-flight check must NOT log
});

test("loadSuppressedSet unions DNC + SavedContact.optedOut, per user", async () => {
  const { prisma } = makePrisma({
    dnc: [
      { userId: "u1", phoneNumber: "A" },
      { userId: "u2", phoneNumber: "X" }, // wrong user
    ],
    opted: [
      { userId: "u1", phoneNumber: "B", optedOut: true },
      { userId: "u1", phoneNumber: "C", optedOut: false }, // not opted-out
    ],
  });
  const set = await loadSuppressedSet(prisma, "u1");
  assert.equal(set.size, 2);
  assert.ok(set.has("A"));
  assert.ok(set.has("B"));
  assert.ok(!set.has("C"));
  assert.ok(!set.has("X"));
});

test("classifySuppressions labels DNC winners as 'do_not_contact' even when both hit", async () => {
  const { prisma } = makePrisma({
    dnc: [{ userId: "u1", phoneNumber: "P1" }],
    opted: [
      { userId: "u1", phoneNumber: "P1", optedOut: true }, // both
      { userId: "u1", phoneNumber: "P2", optedOut: true }, // opt-out only
    ],
  });
  const reasons = await classifySuppressions(prisma, "u1", ["P1", "P2", "P3"]);
  assert.equal(reasons.get("P1"), "do_not_contact"); // DNC wins
  assert.equal(reasons.get("P2"), "opted_out");
  assert.equal(reasons.get("P3"), undefined); // not suppressed
});

test("logSuppressed empty array is a no-op (no createMany call)", async () => {
  const { prisma, logs } = makePrisma();
  await logSuppressed(prisma, []);
  assert.equal(logs.length, 0);
});

test("logSuppressed writes all entries with correct shape", async () => {
  const { prisma, logs } = makePrisma();
  await logSuppressed(prisma, [
    {
      userId: "u1",
      phoneNumber: "A",
      surface: "campaign",
      reason: "opted_out",
      campaignId: "c1",
    },
    {
      userId: "u1",
      phoneNumber: "B",
      surface: "automation",
      reason: "do_not_contact",
      automationId: "a1",
    },
  ]);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].campaignId, "c1");
  assert.equal(logs[0].automationId, null);
  assert.equal(logs[1].automationId, "a1");
  assert.equal(logs[1].campaignId, null);
});
