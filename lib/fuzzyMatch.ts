// Tiny Levenshtein implementation, good enough for short header strings.
// We use it to suggest "did you mean?" for unknown {{tokens}}.

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost      // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/**
 * Suggest the closest candidate name for `unknown`.
 * Returns null if nothing is meaningfully close.
 */
export function suggestClosest(
  unknown: string,
  candidates: string[],
  maxDistance: number | null = null
): string | null {
  if (candidates.length === 0) return null;

  // Default threshold scales with the unknown's length:
  //   <= 5 chars → distance up to 1
  //   6-10       → distance up to 2
  //   11+        → distance up to 3
  const threshold =
    maxDistance ??
    (unknown.length <= 5 ? 1 : unknown.length <= 10 ? 2 : 3);

  let best: { name: string; distance: number } | null = null;
  const lowerUnknown = unknown.toLowerCase();

  for (const c of candidates) {
    // Case-insensitive distance — usually what people care about.
    const d = levenshtein(lowerUnknown, c.toLowerCase());
    if (d <= threshold && (!best || d < best.distance)) {
      best = { name: c, distance: d };
    }
  }
  return best?.name ?? null;
}
