/** Normalizes an entry number to canonical form: UPPERCASE, no internal spaces. */
export function normalizeEntryNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}
