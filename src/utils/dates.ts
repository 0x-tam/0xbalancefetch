/**
 * Returns the snapshot date string for a given year.
 * Snapshot is always December 31 of that year.
 * We use Dec 31 at 23:59:59 UTC to capture the end-of-day state.
 */
export function snapshotDateForYear(year: number): string {
  return `${year}-12-31`;
}

/** Validates that a year is a reasonable 4-digit calendar year. */
export function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2015 && year <= new Date().getFullYear();
}

/** Returns the ISO timestamp string for the end of Dec 31 in UTC. */
export function snapshotTimestampForYear(year: number): string {
  return `${year}-12-31T23:59:59Z`;
}
