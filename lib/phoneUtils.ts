export function normalizePhone(raw: string, defaultCountryCode = "1"): string {
  if (!raw) return "";
  const digitsOnly = String(raw).replace(/[^\d]/g, "");
  if (!digitsOnly) return "";
  if (digitsOnly.length === 10) return defaultCountryCode + digitsOnly;
  return digitsOnly;
}

export function isValidPhone(raw: string): boolean {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  return digits.length >= 10;
}

const PHONE_HEADER_HINTS = ["phone", "mobile", "cell", "number", "whatsapp"];

export function detectPhoneColumnCandidates(headers: string[]): string[] {
  return headers.filter((h) => {
    const lower = h.toLowerCase();
    return PHONE_HEADER_HINTS.some((hint) => lower.includes(hint));
  });
}
