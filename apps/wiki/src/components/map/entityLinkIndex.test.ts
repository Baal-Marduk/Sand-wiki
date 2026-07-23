import { describe, it, expect } from "vitest";
import { slugForName, __normalize, keyOpens, doorKey, lootSetsForBlueprint, containerRoute } from "./entityLinkIndex";

describe("__normalize", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(__normalize("  Crate   of  Shells ")).toBe("crate of shells");
  });
});

describe("slugForName", () => {
  it("returns null for an unknown name", () => {
    expect(slugForName("definitely not a real entity xyzzy")).toBeNull();
  });

  it("resolves a known item name to its /items route (case-insensitive)", () => {
    expect(slugForName("Binoculars")).toMatchObject({ href: "/items/binoculars" });
    expect(slugForName("  BINOCULARS  ")).toMatchObject({ href: "/items/binoculars" });
  });

  it("resolves another known item name", () => {
    expect(slugForName("Black Box")).toMatchObject({ href: "/items/black-box" });
  });

  it("resolves a known environment name to its /environment route", () => {
    expect(slugForName("Crate of Shells")).toMatchObject({ href: "/environment/crate-of-shells" });
  });

  it("includes the entity icon path when the entity has one", () => {
    // Binoculars has a sprite in the current dataset.
    expect(slugForName("Binoculars")).toMatchObject({ icon: "/icons/icon_item_binocular.png" });
    // Every resolved route exposes an `icon` key (string path or null).
    const hit = slugForName("Black Box");
    expect(hit).not.toBeNull();
    expect(hit).toHaveProperty("icon");
  });

  it("returns null for empty input", () => {
    expect(slugForName("")).toBeNull();
  });

  // Curated alias: the map's turret loot label diverges from the wiki kit name, so it
  // only resolves via the alias layer (verified against the real store).
  it("resolves a turret loot label to its wiki artillery kit via the alias layer", () => {
    expect(slugForName("Auto Mounted Turret T1 Packable"))
      .toMatchObject({ href: "/items/game-packed-auto-turret-t1-container" });
    expect(slugForName("Shotgun Mounted Turret T3 Packable"))
      .toMatchObject({ href: "/items/game-packed-shotgun-turret-t3-container" });
  });

  // Loot boxes vary by tier/effort but the wiki has one untiered container per type;
  // the family fallback links them regardless of the tier/effort suffix.
  it("resolves loot-box families to their untiered wiki container", () => {
    expect(slugForName("Shells Box T1 Mid Effort")).toMatchObject({ href: "/environment/crate-of-shells" });
    expect(slugForName("Medical Cabinet T2 Low Effort")).toMatchObject({ href: "/environment/medical-cabinet" });
    expect(slugForName("Locked Box Military")).toMatchObject({ href: "/environment/military-box" });
    // game_armyBox_* is the Weapon Crate. This used to assert military-box — the key-locked
    // Military Box — so every army box on the map linked to the wrong container.
    expect(slugForName("Army Box T1 High Effort")).toMatchObject({ href: "/environment/weapon-crate" });
    expect(slugForName("Safe Middle T2")).toMatchObject({ href: "/environment/valuables-safe" });
    expect(slugForName("Valuable Piles03")).toMatchObject({ href: "/items/coin-crown" });
  });

  it("doorKey returns a lockable door's colour-matched key (incl. fort)", () => {
    expect(doorKey("Sqr Door Lockable Black")).toMatchObject({ href: "/items/game-key-island-door-black" });
    expect(doorKey("Sqr Door Lockable Fort")).toMatchObject({ href: "/items/game-key-island-door-fort" });
    expect(doorKey("Destructible Door Medium")).toBeNull(); // not a keyed door
  });

  it("keyOpens lists what a key unlocks (requires-key backlink)", () => {
    expect(keyOpens("Green Key").some(o => o.href === "/environment/kaiserplatz")).toBe(true);
    expect(keyOpens("Box Key").some(o => o.href === "/environment/military-box")).toBe(true);
    expect(keyOpens("Metal Rods")).toEqual([]); // not a key
  });

  // Armored turrets have no corresponding wiki kit — intentionally unlinked (no alias,
  // no name match) so they stay plain text rather than mislinking.
  it("leaves an armored turret (no wiki kit) unlinked", () => {
    expect(slugForName("Auto Mounted Turret Armored T1 Packable")).toBeNull();
  });

  // "Backpack" (item, slug "backpack01") is disabled in the current dataset and has
  // no enabled entity of the same name — verified via packages/data/generated/entities.json.
  it("returns null for a disabled entity's name, even though it exists in the dataset", () => {
    expect(slugForName("Backpack")).toBeNull();
  });

  // Collision-priority check (item > environment > trampler-part) is intentionally
  // NOT tested against the real dataset: as of this writing, no normalized name in
  // packages/data/generated/entities.json appears in more than one of
  // {item, environment, trampler-part}, so there is no real fixture to assert against.
  // (Verified by grouping entities.json by normalized name and checking for kind overlap.)
});

describe("lootSetsForBlueprint", () => {
  it("returns [] for a blueprint that is not a loot container", () => {
    expect(lootSetsForBlueprint("game_treasureShovel")).toEqual([]);
    expect(lootSetsForBlueprint("definitely_not_a_blueprint")).toEqual([]);
  });

  it("resolves a container whose map label does not match its wiki name", () => {
    // The map labels this "Buried Treasure"; the wiki entity is "Suspicious Pile of Sand",
    // so name matching finds nothing and only the blueprint id connects them.
    expect(slugForName("Buried Treasure")).toBeNull();
    const sets = lootSetsForBlueprint("game_buriedTreasure");
    expect(sets).toHaveLength(13);
    // Weighted, not uniform: six T1 sets and T2 set1 sit at 500, the rest at 100.
    expect(sets[0].chance).toBeCloseTo(12.2, 1);
    expect(sets[sets.length - 1].chance).toBeCloseTo(2.44, 2);
  });

  it("scopes sets to the blueprint's own roll pool, not the whole tier group", () => {
    // "Tier 1" unions the low/mid/high entities and each names its sets set1..setN.
    // A low-effort crate must show only its own four, at 25% each.
    const low = lootSetsForBlueprint("game_armyBox_t1_lowEffort");
    expect(low).toHaveLength(4);
    expect(low.every((s) => Math.abs(s.chance - 25) < 0.01)).toBe(true);
    expect(lootSetsForBlueprint("game_armyBox_t3_highEffort")).toHaveLength(8);
  });

  it("carries exact per-set quantities, never a merged span", () => {
    const sets = lootSetsForBlueprint("game_buriedTreasure");
    const rocket = sets.find((s) => s.items.some((i) => i.name === "Rocket Launcher"));
    expect(rocket).toBeDefined();
    // The rollup renders Coin Crown as "300-700~"; inside a set it is one real range.
    for (const it of rocket!.items) expect(it.voyage ?? "").not.toContain("~");
  });
});

describe("containerRoute", () => {
  it("prefers the blueprint over the display label", () => {
    // Label alone resolves to nothing here; the blueprint is exact.
    expect(slugForName("Buried Treasure")).toBeNull();
    expect(containerRoute("game_buriedTreasure", "Buried Treasure"))
      .toMatchObject({ href: "/environment/suspicious-pile-of-sand" });
  });

  it("distinguishes variants a family rule collapses", () => {
    // The /^shells box\b/ family sends every label to crate-of-shells; the resupply
    // crate is its own container and only the blueprint separates them.
    expect(slugForName("Shells Box T1 Resupply")).toMatchObject({ href: "/environment/crate-of-shells" });
    expect(containerRoute("game_shellsBox_t1_resupply", "Shells Box T1 Resupply"))
      .toMatchObject({ href: "/environment/shell-box-resupply" });
  });

  it("falls back to the label when the blueprint is unknown", () => {
    expect(containerRoute(undefined, "Crate of Shells"))
      .toMatchObject({ href: "/environment/crate-of-shells" });
    expect(containerRoute("not_a_blueprint", "Crate of Shells"))
      .toMatchObject({ href: "/environment/crate-of-shells" });
  });
});
