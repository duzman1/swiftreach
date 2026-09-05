-- ─────────────────────────────────────────────────────────────────────
-- Backfill: calendar-month usage-period reset
--
-- Context
-- Previously, `messagesUsedThisMonth` was reset only by the
-- `invoice.paid` Stripe webhook. That meant:
--   * Free accounts (no invoices) never reset — throttled forever
--   * Annual subscribers reset once/year instead of once/month
-- Live evidence: a Free account showing "Resets June 9" in September
-- with 451/500 sent, unable to send anything since June.
--
-- New behaviour (see lib/usageCheck.ts + lib/usagePeriod.ts):
--   usagePeriodStart is the 00:00-UTC start of the CURRENT calendar
--   month. Any account whose usagePeriodStart is in an earlier month
--   is stale — the auto-roll in code will fix it on the next check
--   or send, but this backfill fixes every account in one shot so
--   admin views + dashboards show the correct number immediately.
--
-- Schema
-- `usagePeriodStart` already exists on `User` (added in the initial
-- schema, DateTime with @default(now())). This SQL is data-only —
-- no DDL required.
-- ─────────────────────────────────────────────────────────────────────

-- Preview (run BEFORE step 2 to see the blast radius).
--   * How many accounts have a stale period?
--   * Which Free accounts are stuck with a non-zero counter?
--
-- SELECT COUNT(*) AS stale_users
-- FROM "User"
-- WHERE date_trunc('month', "usagePeriodStart" AT TIME ZONE 'UTC')
--     < date_trunc('month', NOW() AT TIME ZONE 'UTC');
--
-- SELECT id, email, plan, "messagesUsedThisMonth", "usagePeriodStart"
-- FROM "User"
-- WHERE plan = 'free'
--   AND "messagesUsedThisMonth" > 0
--   AND date_trunc('month', "usagePeriodStart" AT TIME ZONE 'UTC')
--     < date_trunc('month', NOW() AT TIME ZONE 'UTC')
-- ORDER BY "usagePeriodStart" ASC;

-- 1) Backfill every account so usagePeriodStart is the 00:00-UTC
--    first-of-current-month. Idempotent — running it a second time
--    is a no-op for accounts already on this month's boundary.
--    Any account whose stored period is stale (last month or older)
--    ALSO gets its counter zeroed in the same UPDATE, which fixes
--    the June-451 Free account and any annual subscriber whose
--    counter carried across months.
--
--    Split into two statements to keep the "reset counter" logic
--    obvious. Postgres date_trunc gives us the calendar-month floor.
UPDATE "User"
SET
  "messagesUsedThisMonth" = 0,
  "usagePeriodStart"      = date_trunc('month', NOW() AT TIME ZONE 'UTC')
                              AT TIME ZONE 'UTC'
WHERE
  date_trunc('month', "usagePeriodStart" AT TIME ZONE 'UTC')
    < date_trunc('month', NOW() AT TIME ZONE 'UTC');

-- 2) Normalize accounts that are already in the current month but
--    have a non-midnight-UTC usagePeriodStart (e.g. an account
--    created today at 14:37 UTC). Snap those to the 1st @ 00:00.
--    The counter is preserved — this month's sends still count.
UPDATE "User"
SET
  "usagePeriodStart" = date_trunc('month', NOW() AT TIME ZONE 'UTC')
                         AT TIME ZONE 'UTC'
WHERE
  "usagePeriodStart" <> date_trunc('month', NOW() AT TIME ZONE 'UTC')
                          AT TIME ZONE 'UTC';
