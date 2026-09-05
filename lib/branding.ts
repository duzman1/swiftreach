// Branding helpers — the single place that decides what the report
// header looks like for a given user. Called by both the settings
// UI (live preview) and the PDF renderer, so both stay in lockstep.
//
// Anything read-only about a user's branding lives here; the API
// routes just serve the shape.

import type { User } from "@prisma/client";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_ACCENT = "#25D366"; // WhatsApp green

export interface Branding {
  companyName: string;
  logoUrl: string | null;
  accentColor: string;
  footerText: string | null;
  hideSwiftReachBranding: boolean;
}

/**
 * Resolve the branding shape a report should render.
 *
 * Name precedence:
 *   1. user.companyName (if set)
 *   2. firstName + lastName (the account name)
 *
 * NO email-prefix fallback. A Pro user who skips branding setup
 * shouldn't hand a client a report titled "onozied". Callers that
 * face the network (the report route) must refuse to generate when
 * this returns null via `resolveBrandingOrNull` — the Branding
 * settings preview can render the placeholder shape from
 * `previewBranding` instead.
 */
export function resolveBrandingOrNull(user: {
  companyName: string | null;
  logoUrl: string | null;
  accentColor: string;
  footerText: string | null;
  hideSwiftReachBranding: boolean;
  firstName: string | null;
  lastName: string | null;
}): Branding | null {
  const nameFromFields = [user.firstName, user.lastName]
    .filter((s) => s && s.trim())
    .join(" ")
    .trim();
  const resolvedName = user.companyName?.trim() || nameFromFields;
  if (!resolvedName) return null;
  return {
    companyName: resolvedName.slice(0, 120),
    logoUrl: user.logoUrl?.trim() || null,
    accentColor: isValidHex(user.accentColor) ? user.accentColor : DEFAULT_ACCENT,
    footerText: user.footerText?.trim() || null,
    hideSwiftReachBranding: user.hideSwiftReachBranding,
  };
}

/**
 * Same as resolveBrandingOrNull but with a "Your Company" placeholder
 * for the settings-page live preview only. Never used by the report
 * generator — that path uses resolveBrandingOrNull and refuses on
 * null so a report can't ship with the placeholder name.
 */
export function resolveBranding(user: {
  companyName: string | null;
  logoUrl: string | null;
  accentColor: string;
  footerText: string | null;
  hideSwiftReachBranding: boolean;
  firstName: string | null;
  lastName: string | null;
}): Branding {
  return (
    resolveBrandingOrNull(user) ?? {
      companyName: "Your Company",
      logoUrl: null,
      accentColor: DEFAULT_ACCENT,
      footerText: null,
      hideSwiftReachBranding: false,
    }
  );
}

/** True if s is a #RRGGBB hex color. Never accepts #RGB shorthand,
 *  4/8-digit alpha, or named colors — the PDF renderer's color
 *  parser is strict and a bad value would blow up rendering. */
export function isValidHex(s: string | null | undefined): s is string {
  return typeof s === "string" && HEX_RE.test(s);
}

/** Short URL-safe slug from a company name for the PDF filename. */
export function companySlug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "report"
  );
}

/** True when this Prisma User type has all the branding fields. */
export type UserWithBranding = Pick<
  User,
  | "companyName"
  | "logoUrl"
  | "accentColor"
  | "footerText"
  | "hideSwiftReachBranding"
  | "firstName"
  | "lastName"
  | "email"
>;
