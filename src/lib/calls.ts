import type { CollectionEntry } from 'astro:content';

type Call = CollectionEntry<'calls'>;

/**
 * Sort calls by date (newest first by default)
 */
export function sortCallsByDate(
  calls: Call[],
  order: 'asc' | 'desc' = 'desc'
): Call[] {
  return [...calls].sort((a, b) => {
    const dateA = a.data.date ? new Date(a.data.date).getTime() : 0;
    const dateB = b.data.date ? new Date(b.data.date).getTime() : 0;
    return order === 'desc' ? dateB - dateA : dateA - dateB;
  });
}

/**
 * Sort calls by call number (uses computed callNumber field from loader)
 */
export function sortCallsByNumber(
  calls: Call[],
  order: 'asc' | 'desc' = 'asc'
): Call[] {
  return [...calls].sort((a, b) => {
    const numA = a.data.callNumber ?? 0;
    const numB = b.data.callNumber ?? 0;
    return order === 'asc' ? numA - numB : numB - numA;
  });
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
