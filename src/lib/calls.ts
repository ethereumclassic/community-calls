import type { CallLike } from './types';

/**
 * Extract call number from filename
 */
function getCallNumberFromFilename(id: string): number {
  const match = id.match(/_(\d+)\.md$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Extract call number from frontmatter or filename
 */
export function getCallNumber(call: { id: string; data: { number?: number } }): number {
  if (call.data.number) return call.data.number;
  return getCallNumberFromFilename(call.id);
}

/**
 * Generate URL slug from call data
 */
export function getSlug(call: CallLike): string {
  const date = call.data.date;
  const num = call.data.number || getCallNumberFromFilename(call.id);
  const desc = call.data.description;

  if (date && desc) {
    const dateStr = date.toISOString().split('T')[0];
    const slugDesc = desc.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `${dateStr}-${num}-${slugDesc}`;
  }
  return call.id.replace('.md', '');
}

/**
 * Filter out addendum and recurring call files
 */
export function filterValidCalls<T extends { id: string }>(calls: T[]): T[] {
  return calls.filter(call =>
    !call.id.includes('addendum') && !call.id.includes('recurring')
  );
}

/**
 * Sort calls by date (newest first by default)
 */
export function sortCallsByDate<T extends { data: { date?: Date } }>(
  calls: T[],
  order: 'asc' | 'desc' = 'desc'
): T[] {
  return [...calls].sort((a, b) => {
    const dateA = a.data.date ? new Date(a.data.date).getTime() : 0;
    const dateB = b.data.date ? new Date(b.data.date).getTime() : 0;
    return order === 'desc' ? dateB - dateA : dateA - dateB;
  });
}

/**
 * Sort calls by call number
 */
export function sortCallsByNumber<T extends { id: string; data: { number?: number } }>(
  calls: T[],
  order: 'asc' | 'desc' = 'asc'
): T[] {
  return [...calls].sort((a, b) => {
    const numA = getCallNumber(a);
    const numB = getCallNumber(b);
    return order === 'asc' ? numA - numB : numB - numA;
  });
}

/**
 * Get the URL path for a call
 */
export function getCallUrl(call: CallLike): string {
  return `/calls/${getSlug(call)}`;
}

/**
 * Escape XML entities
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Escape special characters for ICS
 */
export function escapeICS(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Generate UID for ICS event
 */
export function generateUID(callNumber: number, date: Date): string {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  return `etccc-${callNumber}-${dateStr}@cc.ethereumclassic.org`;
}
