import type { Loader, LoaderContext } from 'astro/loaders';
import { glob } from 'astro/loaders';
import { siteConfig } from './config';

/**
 * Parse "1500 UTC" format to hours/minutes
 */
function parseUTCTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{2})(\d{2})\s*UTC$/i);
  if (!match) return null;
  return {
    hours: parseInt(match[1], 10),
    minutes: parseInt(match[2], 10),
  };
}

/**
 * Combine a date and time string into a full Date object
 */
function combineDateAndTime(date: Date, timeStr?: string): Date {
  const combined = new Date(date);
  if (timeStr) {
    const parsed = parseUTCTime(timeStr);
    if (parsed) {
      combined.setUTCHours(parsed.hours, parsed.minutes, 0, 0);
    }
  }
  return combined;
}

/**
 * Extract call number from filename
 */
function getCallNumberFromFilename(id: string): number {
  const match = id.match(/_(\d+)(?:_\w+)?\.md$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Generate URL slug from call data
 */
function generateSlug(
  id: string,
  data: { date?: Date; number?: number; description?: string }
): string {
  const date = data.date;
  const num = data.number || getCallNumberFromFilename(id);
  const desc = data.description;

  if (date && desc) {
    const dateStr = date.toISOString().split('T')[0];
    const slugDesc = desc
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${dateStr}-${num}-${slugDesc}`;
  }
  return id.replace('.md', '');
}

/**
 * Custom loader that wraps glob and adds computed fields
 */
export function callsLoader(options: {
  pattern: string;
  base: string;
}): Loader {
  const baseLoader = glob({ pattern: options.pattern, base: options.base });

  return {
    name: 'calls-loader',
    load: async (context: LoaderContext) => {
      // First, let the base loader populate the store
      await baseLoader.load(context);

      // Now iterate and mutate each entry's data with computed fields
      for (const [id, entry] of context.store.entries()) {
        if (!entry.data) continue;

        const data = entry.data as Record<string, unknown>;

        // Compute call number (from frontmatter or filename)
        const callNumber =
          typeof data.number === 'number'
            ? data.number
            : getCallNumberFromFilename(id);

        // Use youtube ID directly (no longer a URL)
        const youtubeId =
          typeof data.youtube === 'string' ? data.youtube : null;

        // Parse date if it's a string
        const dateValue = data.date instanceof Date
          ? data.date
          : (typeof data.date === 'string' ? new Date(data.date) : undefined);

        // Compute slug
        const slug = generateSlug(id, {
          date: dateValue,
          number: callNumber,
          description: typeof data.description === 'string' ? data.description : undefined,
        });

        // Compute formatted date string for ICS UID
        const dateStr = dateValue
          ? dateValue.toISOString().split('T')[0].replace(/-/g, '')
          : '';

        // Compute event datetime (date + time) as timestamp
        const timeStr = typeof data.time === 'string' ? data.time : undefined;
        const eventDateTime = dateValue
          ? combineDateAndTime(dateValue, timeStr).getTime()
          : null;

        // Compute isUpcoming - events stay upcoming until buffer period after start
        const now = Date.now();
        const isUpcoming = eventDateTime !== null
          ? eventDateTime > (now - siteConfig.upcomingBufferMs)
          : false;

        // Mutate the data object directly - don't delete/recreate the entry
        data.callNumber = callNumber;
        data.youtubeId = youtubeId;
        data.slug = slug;
        data.uid = `etccc-${callNumber}-${dateStr}@cc.ethereumclassic.org`;
        data.eventDateTime = eventDateTime;
        data.isUpcoming = isUpcoming;
      }
    },
    schema: baseLoader.schema,
  };
}
