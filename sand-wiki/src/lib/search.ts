import { ITEM_CATEGORIES, type Category } from "@/lib/taxonomy";

export interface IndexItem { slug: string; name: string; category: string; derivedName?: string | null }
export interface Suggestions { categories: Category[]; items: IndexItem[] }

const ITEM_CAP = 8;

/** Case-insensitive substring match over category labels + item names. */
export function searchSuggestions(query: string, index: IndexItem[]): Suggestions {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { categories: [], items: [] };
  const categories = ITEM_CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
  const items = index
    .filter((i) => i.name.toLowerCase().includes(q) || (i.derivedName ?? "").toLowerCase().includes(q))
    .slice(0, ITEM_CAP);
  return { categories, items };
}
