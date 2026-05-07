// Translate raw Meta error strings (as we store them on Contact.errorMessage)
// into something a non-engineer can act on.
//
// Stored format examples:
//   "[131026] Message undeliverable — Message undeliverable"
//   "[131030] Recipient phone number not in allowed list"
//   "[131047] Re-engagement message — Re-engagement message"

const FRIENDLY_BY_CODE: Record<string, string> = {
  "131026": "Not on WhatsApp — this number has no WhatsApp account",
  "131030": "Not on test recipient list — add this number in Meta dashboard",
  "131047": "Outside 24-hour window — contact must message you first",
};

export function extractErrorCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Match "[131026]" or "(#131026)" or bare "131026" at the start.
  const match = raw.match(/(?:\[|\(#)?(\d{4,6})(?:\]|\))?/);
  return match ? match[1] : null;
}

export function translateError(raw: string | null | undefined): string {
  if (!raw) return "";
  const code = extractErrorCode(raw);
  if (code && FRIENDLY_BY_CODE[code]) {
    return FRIENDLY_BY_CODE[code];
  }
  return raw;
}

// Bulk classify a list of stored error messages — useful for the retry flow.
export function classifyErrors(rawErrors: (string | null | undefined)[]): {
  codes: Record<string, number>;
  total: number;
} {
  const codes: Record<string, number> = {};
  let total = 0;
  for (const e of rawErrors) {
    if (!e) continue;
    total++;
    const code = extractErrorCode(e) ?? "unknown";
    codes[code] = (codes[code] ?? 0) + 1;
  }
  return { codes, total };
}
