import type { Loader, LoaderContext } from 'astro/loaders';
import { glob } from 'astro/loaders';

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

        // Mutate the data object directly - don't delete/recreate the entry
        data.callNumber = callNumber;
        data.youtubeId = youtubeId;
        data.slug = slug;
        data.uid = `etccc-${callNumber}-${dateStr}@cc.ethereumclassic.org`;
      }
    },
    schema: baseLoader.schema,
  };
}
