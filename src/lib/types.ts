import type { CollectionEntry } from "astro:content";

// Re-export the Astro-generated type
export type Call = CollectionEntry<"calls">;

// Extracted call data type for utility functions
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
