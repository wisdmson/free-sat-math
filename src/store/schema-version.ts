/** The integer `schemaVersion` of parsed JSON, or null if it has none. */
export function schemaVersionOf(data: unknown): number | null {
  if (typeof data !== 'object' || data === null) return null;
  const v = (data as { schemaVersion?: unknown }).schemaVersion;
  return typeof v === 'number' && Number.isInteger(v) ? v : null;
}
