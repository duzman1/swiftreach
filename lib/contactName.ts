// Pick a display name from a contact's stored rowData JSON.
// Strategy: prefer a column whose header looks name-ish; otherwise fall back
// to the first non-phone column with content.

const NAME_HINTS = ["name", "fullname", "full name", "first", "contact", "recipient"];

export function pickContactName(
  rowDataJson: string,
  phoneColumn: string,
  headers?: string[]
): string {
  let row: Record<string, string>;
  try {
    row = JSON.parse(rowDataJson || "{}");
  } catch {
    return "";
  }

  const cols = headers && headers.length > 0 ? headers : Object.keys(row);

  // 1. First column whose header contains a name-ish hint (case-insensitive)
  for (const h of cols) {
    if (h === phoneColumn) continue;
    const lower = h.toLowerCase();
    if (NAME_HINTS.some((hint) => lower.includes(hint))) {
      const v = String(row[h] ?? "").trim();
      if (v) return v;
    }
  }
  // 2. Otherwise: first non-phone column with a non-empty value
  for (const h of cols) {
    if (h === phoneColumn) continue;
    const v = String(row[h] ?? "").trim();
    if (v) return v;
  }
  return "";
}
