import { describe, it, expect } from "vitest";
import { mergeCombatStats, type WeaponStatsFile, type TurretStat } from "./combat-stats";
import type { Entity, ItemStats } from "@sandlabs/data";
import type { ReconcileHit } from "./reconcile";

const item = (slug: string, stats: Partial<ItemStats> | null = null): Entity => ({
  id: slug, slug, kind: "item", name: slug, description: null, category: "misc",
  rarity: null, icon: null, imageAlt: null, derivedName: null, sourceUrl: null, disabled: false,
  itemStats: stats === null ? null : { storageStack: null, workbenchTier: null, statType: null,
    statValue: null, damage: null, playerDamage: null, tramplerDamage: null, splashDamage: null,
    magazine: null, ammoName: null, ammoType: null, reloadSeconds: null, rangeFull: null,
    rangeMax: null, rangeMinMult: null, rangeFalloff: null, penetrates: null, armorRating: null,
    armorRegenDelay: null, armorRegenSpeed: null, armorDurability: null, fireRate: null,
    projectileVelocity: null, ...stats },
  tramplerStats: null, techNodeStats: null,
});
const hit = (slug: string): ReconcileHit => ({ slug, status: "matched" });
const wf = (o: Partial<WeaponStatsFile> = {}): WeaponStatsFile => ({ weapons: {}, ammo: {}, armor: {}, ...o });

describe("mergeCombatStats", () => {
  it("refreshes ammo damage/range/penetrates over the baseline, keeps baseline extras", () => {
    const baseline = [item("pistol-ammo", { ammoType: "8x21 mm", statType: "Ammunition", damage: 1 })];
    const map = new Map<string, ReconcileHit>([["item_pistolAmmo", hit("pistol-ammo")]]);
    const out = mergeCombatStats(baseline, wf({ ammo: { item_pistolAmmo: {
      turret: false, damagePhysical: 50, range: { full: 35, max: 150, minMult: 0.3, falloff: true }, penetrates: false, stack: [50, 250, 1000] } } }), {}, map);
    const s = out[0].itemStats!;
    expect(s.damage).toBe(50);
    expect(s.rangeFull).toBe(35);
    expect(s.rangeMax).toBe(150);
    expect(s.rangeFalloff).toBe(true);
    expect(s.penetrates).toBe(false);
    expect(s.ammoType).toBe("8x21 mm");
    expect(s.statType).toBe("Ammunition");
    expect(s.storageStack).toBeNull();
  });

  it("maps armor regen fields and creates itemStats when baseline had none", () => {
    const baseline = [item("old-jacket", null)];
    const map = new Map([["Old_Jacket", hit("old-jacket")]]);
    const out = mergeCombatStats(baseline, wf({ armor: { Old_Jacket: {
      armorRating: 50, regen: { delay: 6, speed: 7 }, durability: 1400 } } }), {}, map);
    const s = out[0].itemStats!;
    expect(s).not.toBeNull();
    expect(s.armorRating).toBe(50);
    expect(s.armorRegenDelay).toBe(6);
    expect(s.armorRegenSpeed).toBe(7);
    expect(s.armorDurability).toBe(1400);
  });

  it("maps turret fields and merges when an item appears in multiple maps", () => {
    const baseline = [item("auto-turret-t2", { damage: 9 })];
    const map = new Map([["game_packedAutoTurretT2Container", hit("auto-turret-t2")]]);
    const turrets: Record<string, TurretStat> = { game_packedAutoTurretT2Container: {
      fireRate: 5, clipSize: 2, reloadSeconds: null, projectileVelocity: 150, penetrates: true } };
    const out = mergeCombatStats(baseline, wf(), turrets, map);
    const s = out[0].itemStats!;
    expect(s.fireRate).toBe(5);
    expect(s.magazine).toBe(2);
    expect(s.projectileVelocity).toBe(150);
    expect(s.penetrates).toBe(true);
    expect(s.damage).toBe(9);
  });

  it("collapses _Melee/_Ranged via canonical id and skips unreconciled ids", () => {
    const baseline = [item("anti-reactor-gun", { reloadSeconds: 1 })];
    const map = new Map([["item_antiReactorGun", hit("anti-reactor-gun")]]);
    const out = mergeCombatStats(baseline, wf({ weapons: {
      item_antiReactorGun_Melee: { reloadSeconds: 3.05, range: null },
      DevSiegeRevolver: { reloadSeconds: 9, range: null } } }), {}, map);
    expect(out[0].itemStats!.reloadSeconds).toBe(3.05);
    expect(out.find((e) => e.slug === "dev")).toBeUndefined();
  });

  it("leaves items with no datamine entry untouched", () => {
    const baseline = [item("plain", { damage: 7 })];
    const out = mergeCombatStats(baseline, wf(), {}, new Map());
    expect(out[0].itemStats!.damage).toBe(7);
  });
});
