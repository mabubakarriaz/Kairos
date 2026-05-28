// Pure label utilities — safe in both server and client modules.
// Labels are lowercase ASCII slugs ([a-z0-9_-]); display adds the `#` sigil.

export const MAX_LABELS_PER_TASK = 6;
export const MAX_LABEL_LENGTH = 24;

const VALID_LABEL = /^[a-z0-9][a-z0-9_-]*$/;

export function normalizeLabel(input: string): string | null {
  const stripped = input.replace(/^#+/, "").trim().toLowerCase();
  if (!stripped || stripped.length > MAX_LABEL_LENGTH) return null;
  return VALID_LABEL.test(stripped) ? stripped : null;
}

/** Comma/whitespace-separated user input → normalized list, deduped + capped. */
export function parseLabelsInput(input: string): string[] {
  const seen = new Set<string>();
  for (const piece of input.split(/[,\s]+/)) {
    const norm = normalizeLabel(piece);
    if (norm) seen.add(norm);
    if (seen.size >= MAX_LABELS_PER_TASK) break;
  }
  return Array.from(seen);
}

/** Comma-separated URL `?labels=` value → normalized list. */
export function parseLabelsParam(input: string | undefined | null): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  for (const piece of input.split(",")) {
    const norm = normalizeLabel(piece);
    if (norm) seen.add(norm);
  }
  return Array.from(seen);
}

/** Sanitize a list of raw strings (e.g. from DB or callers). */
export function sanitizeLabels(input: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of input) {
    const norm = normalizeLabel(raw);
    if (norm) seen.add(norm);
    if (seen.size >= MAX_LABELS_PER_TASK) break;
  }
  return Array.from(seen);
}

/** OR-semantic match: block satisfies the filter if it shares any active label.
 *  An empty filter matches everything. */
export function matchesLabelFilter(blockLabels: readonly string[], filterLabels: readonly string[]): boolean {
  if (filterLabels.length === 0) return true;
  return blockLabels.some((l) => filterLabels.includes(l));
}
