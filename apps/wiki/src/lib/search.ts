import { ITEM_CATEGORIES, type Category } from "@/lib/taxonomy";

export interface IndexItem { slug: string; name: string; category: string; derivedName?: string | null; icon?: string | null; rarity?: string | null }
/** A searchable environment entity (loot container or landmark). `category` is its env
 *  category slug, used to group it in the dropdown and pick its icon. */
export interface IndexPlace { slug: string; name: string; category: string }
/** A searchable enemy entity (creature or enemy trampler). `category` is its enemy
 *  category slug, used to group it in the dropdown and pick its icon. */
export interface IndexEnemy { slug: string; name: string; category: string }
export interface SearchIndex { items: IndexItem[]; places: IndexPlace[]; enemies: IndexEnemy[] }
export interface Suggestions { categories: Category[]; items: IndexItem[]; places: IndexPlace[]; enemies: IndexEnemy[] }

const ITEM_CAP = 8;
const PLACE_CAP = 6;
const ENEMY_CAP = 6;

/** Case-insensitive substring match over category labels, item names (+derived names),
 *  place names, and enemy names. Items, places, and enemies are capped independently. */
export function searchSuggestions(query: string, items: IndexItem[], places: IndexPlace[] = [], enemies: IndexEnemy[] = []): Suggestions {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return { categories: [], items: [], places: [], enemies: [] };
  const categories = ITEM_CATEGORIES.filter((c) => c.label.toLowerCase().includes(q));
  const matchedItems = items
    .filter((i) => i.name.toLowerCase().includes(q) || (i.derivedName ?? "").toLowerCase().includes(q))
    .slice(0, ITEM_CAP);
  const matchedPlaces = places.filter((p) => p.name.toLowerCase().includes(q)).slice(0, PLACE_CAP);
  const matchedEnemies = enemies.filter((e) => e.name.toLowerCase().includes(q)).slice(0, ENEMY_CAP);
  return { categories, items: matchedItems, places: matchedPlaces, enemies: matchedEnemies };
}
