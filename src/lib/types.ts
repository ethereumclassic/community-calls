// Re-export the enriched Call type from calls.ts
export type { Call } from "./calls";

// Raw call type from Astro content collection
import type { CollectionEntry } from "astro:content";
export type RawCall = CollectionEntry<"calls">;

// Extracted call data type for utility functions
import type { Call } from "./calls";
export type CallData = Call["data"];

// Props interfaces for components
export interface CallCardProps {
  number?: number;
  description?: string;
  date?: Date;
  time?: string;
  location?: string;
  slug: string;
  youtube?: string;
  index?: number;
  special?: boolean;
}

export interface LayoutProps {
  title: string;
  description?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  publishedTime?: string;
}
