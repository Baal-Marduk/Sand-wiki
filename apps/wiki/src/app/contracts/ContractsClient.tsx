"use client";

import { useState } from "react";
import { ItemIcon } from "@/components/ItemIcon";
import contracts from "./data/contracts.json";
import itemMap from "./data/contract-items.json";
import designed from "./data/designed-contracts.json";

type Bundle = { tier: number; items: { item: string; count: number }[] };
type ItemInfo = { name: string; icon: string | null; rarity: string | null };
type TierChances = { chanceS: number; chanceA: number; chanceB: number; chanceC: number; chanceD: number };
type Designed = {
  id: number; name: string;
  requiredItem: string; requiredCount: number;
  rewardItem: string; rewardCount: number;
  tierChances: TierChances; timeoutMinutes: number; extraTimeMinutes: number;
};

const ITEMS = itemMap as Record<string, ItemInfo>;
const REWARDS = contracts.rewards as Bundle[];
const LOCKED = contracts.lockedBox as Bundle[];
const CONTRACTS = designed as Designed[];

const resolve = (id: string): ItemInfo => ITEMS[id] ?? { name: id, icon: null, rarity: null };

function topTier(c: TierChances): string | null {
  const e: [string, number][] = [["S", c.chanceS], ["A", c.chanceA], ["B", c.chanceB], ["C", c.chanceC], ["D", c.chanceD]];
  e.sort((a, b) => b[1] - a[1]);
  return e[0][1] > 0 ? e[0][0] : null;
}

function ItemPill({ id, count }: { id: string; count: number }) {
  const it = resolve(id);
  return (
    <span className="inline-flex items-center gap-1.5">
      <ItemIcon name={it.name} icon={it.icon} rarity={it.rarity} size="sm" decorative />
      <span className="text-sm text-foreground" title={id}>{it.name}</span>
      <span className="text-sm tabular-nums text-muted-foreground">×{count}</span>
    </span>
  );
}

function Deliveries() {
  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-muted-foreground">
        The fixed delivery contracts from the game files — hand the required item into a contract platform to
        earn the reward. ({CONTRACTS.length} defined.)
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {CONTRACTS.map((c) => {
          const tier = topTier(c.tierChances);
          return (
            <div key={c.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deliver</span>
                <ItemPill id={c.requiredItem} count={c.requiredCount} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">Reward</span>
                <ItemPill id={c.rewardItem} count={c.rewardCount} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {tier && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">Reward tier {tier}</span>
                )}
                {c.timeoutMinutes > 0 && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">⏱ {c.timeoutMinutes} min</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BundleCard({ b }: { b: Bundle }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <span className="inline-block rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
        reward tier {b.tier}
      </span>
      <ul className="mt-3 space-y-1.5">
        {b.items.map((e, i) => {
          const it = resolve(e.item);
          return (
            <li key={i} className="flex items-center gap-2">
              <ItemIcon name={it.name} icon={it.icon} rarity={it.rarity} size="sm" decorative />
              <span className="flex-1 text-sm text-foreground" title={e.item}>{it.name}</span>
              <span className="text-sm tabular-nums text-muted-foreground">×{e.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type View = "contracts" | "rewards" | "locked";

export function ContractsClient() {
  const [view, setView] = useState<View>("contracts");
  const [tier, setTier] = useState<number | "all">("all");

  const source = view === "rewards" ? REWARDS : view === "locked" ? LOCKED : [];
  const tiers = [...new Set(source.map((b) => b.tier))].sort((a, b) => a - b);
  const list = source.filter((b) => tier === "all" || b.tier === tier);

  const go = (v: View) => { setView(v); setTier("all"); };
  const tabCls = (on: boolean) =>
    "rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors " +
    (on ? "bg-primary text-background" : "border border-border text-foreground hover:border-primary hover:text-primary");
  const chipCls = (on: boolean) =>
    "rounded px-3 py-1 text-xs font-semibold transition-colors " +
    (on ? "bg-primary/20 text-primary" : "border border-border text-muted-foreground hover:text-primary");

  return (
    <div className="mt-5">
      <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        <span aria-hidden className="text-amber-400">⚠</span>
        <p className="text-foreground/90">
          <strong>Reward/box data is unverified</strong> — it sits in the current playtest files but may be an older
          build&apos;s table; treat the reward bundles &amp; locked-box loot as historical until verified in-game. The
          delivery contracts below are the fixed definitions from the files.
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-primary">
          Where to find contract platforms (from the prefabs)
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {["⚒ Little Factory (all 3 variants) ×1 each", "⚒ Little Factory Armory (all 3 variants) ×1 each", "● Basic Contract field sites (4 types) ×2 each"].map((t) => (
            <span key={t} className="rounded-full border border-border bg-background/40 px-2 py-1 text-foreground">{t}</span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Reward tier scales with the zone tier — deeper zones, better bundles.</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => go("contracts")} className={tabCls(view === "contracts")}>Contracts (deliveries)</button>
        <button onClick={() => go("rewards")} className={tabCls(view === "rewards")}>Reward bundles</button>
        <button onClick={() => go("locked")} className={tabCls(view === "locked")}>Locked boxes</button>
        {view !== "contracts" && (
          <>
            <span className="mx-1 h-4 w-px bg-border" />
            <button onClick={() => setTier("all")} className={chipCls(tier === "all")}>All tiers</button>
            {tiers.map((t) => (
              <button key={t} onClick={() => setTier(t)} className={chipCls(tier === t)}>Tier {t}</button>
            ))}
          </>
        )}
      </div>

      {view === "contracts" ? (
        <Deliveries />
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((b, i) => <BundleCard key={i} b={b} />)}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {REWARDS.length} contract reward bundles · {LOCKED.length} locked-box bundles.
          </p>
        </>
      )}
    </div>
  );
}
