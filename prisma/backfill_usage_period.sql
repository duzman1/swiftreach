-- ─────────────────────────────────────────────────────────────────────
-- FIX 4A backfill: reset stale usage-period counters
--
-- Context
-- Before FIX 4A, `messagesUsedThisMonth` was reset only by the
-- `invoice.paid` Stripe webhook. That meant:
--   * Free accounts (no invoices) never reset — throttled forever
--   * Annual subscribers reset once/year instead of once/month
--
-- After FIX 4A, `lib/usageCheck.ts#checkMessageLimit` lazily rolls
-- the period forward on every send attempt. Any user who sends will
-- self-heal on their next send.
--
-- This SQL patches the two edge cases the lazy roll won't touch:
--   1. Accounts that will never send again but still show a stale
--      counter on the billing page.
--   2. Admin dashboards / analytics that read the counter directly.
--
-- Schema: the `usagePeriodStart` column already exists on `User`
-- (added in the initial schema with @default(now())). No DDL is
-- needed — this is data-only.
-- ─────────────────────────────────────────────────────────────────────

-- 1) Any account whose usage period is more than 30 days old:
--    zero the counter and roll usagePeriodStart forward to now.
--    Applies to every plan — even Pro subscribers who somehow ran
--    over their window should get a fresh cycle.
UPDATE "User"
SET
  "messagesUsedThisMonth" = 0,
  "usagePeriodStart" = NOW()
WHERE
  "usagePeriodStart" < NOW() - INTERVAL '30 days';

-- 2) Preview only — how many rows would we touch, and what do the
--    current-period-stale rows look like on Free specifically?
-- (Run before step 1 to see the blast radius.)
--
-- SELECT COUNT(*) AS stale_users
-- FROM "User"
-- WHERE "usagePeriodStart" < NOW() - INTERVAL '30 days';
--
-- SELECT id, email, plan, "messagesUsedThisMonth", "usagePeriodStart"
-- FROM "User"
-- WHERE plan = 'free'
--   AND "messagesUsedThisMonth" > 0
--   AND "usagePeriodStart" < NOW() - INTERVAL '30 days'
-- ORDER BY "usagePeriodStart" ASC;
