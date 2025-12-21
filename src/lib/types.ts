// Re-export the enriched Call type from calls.ts
export type { Call } from "./calls";

// Props interfaces for components
export interface CallCardProps {
  number?: number;
  description: string;
  date: Date;
  time: string;
  location: string;
  slug: string;
  youtube?: string;
  index?: number;
  special?: boolean;
}
