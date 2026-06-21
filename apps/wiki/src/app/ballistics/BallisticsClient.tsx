"use client";

import { useMemo, useState } from "react";
import { AdminBack } from "@/components/AdminBack";
import ballistics from "./data/weapon_ballistics.json";
import turretCompare from "./data/turret_compare.json";

interface Ammo {
  id: string;
  family: string;
  label?: string;
  name?: string;
  velocity?: number | null;
  gravity?: number | null;
  drag?: number | null;
  inherited?: boolean;
  turretType?: string;
  ricochet?: { count?: number };
  penetration?: { maxCount?: number };
}
interface TurretRow {
  state: string;
  variant?: string;
  fireRate?: number | null;
  fireInterval?: number | null;
  autoRefill?: boolean;
  reloadSeconds?: number | null;
  clipSize?: number | null;
  barrels?: number | null;
}
interface TurretFamily {
  family: string;
  caliber: string;
  rows: TurretRow[];
}

const AMMO = ballistics.ammo as unknown as Record<string, Ammo>;
const FAMILIES = (turretCompare.families ?? []) as unknown as TurretFamily[];

const RANGES = [50, 100, 200, 400];
const TABS = [
  ["drop", "Bullet Drop"],
  ["turrets", "Turret Stats"],
] as const;

// simple no-drag ballistic drop: t = R/v, drop = ½·g·t² (metres)
function dropAt(velocity?: number | null, gravity?: number | null, range?: number): number | null {
  // velocity <= 1 = a non-travelling effect projectile (drop is meaningless)
  if (!velocity || velocity <= 1 || !gravity || !range) return null;
  const t = range / velocity;
  return 0.5 * gravity * t * t;
}

const panelCls = "mt-4 rounded-lg border border-border bg-card p-4";
const labelCls = "mb-3 font-display text-sm font-semibold uppercase tracking-wide text-primary";
const thCls = "border-b border-border pb-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const thLeft = thCls + " text-left";
const tdCls = "border-b border-border/40 py-1.5 text-right tabular-nums text-foreground";
const tdLeft = "border-b border-border/40 py-1.5 text-left text-foreground";

function BulletDrop({ groups }: { groups: [string, Ammo[]][] }) {
  return (
    <>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Muzzle velocity, gravity and drag per ammo, mined from the projectile blueprints. Drop columns
        are a no-drag estimate (½·g·t², t = range ÷ velocity) for quick comparison; real drop is slightly
        more with drag. Turret ammo is grouped by turret type; each row is an ammo variant. A † means
        that round inherits the turret&apos;s base-projectile figures.
      </p>
      {groups.map(([fam, rows]) => (
        <div key={fam} className={panelCls}>
          <div className={labelCls}>{fam}</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={thLeft}>Ammo</th>
                  <th className={thCls}>Velocity</th>
                  <th className={thCls}>Gravity</th>
                  <th className={thCls}>Drag</th>
                  {RANGES.map((r) => (
                    <th key={r} className={thCls}>drop @ {r}m</th>
                  ))}
                  <th className={thCls}>Ricochet</th>
                  <th className={thCls}>Pen.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className={tdLeft}>
                      {a.label || a.name || a.id}
                      {a.inherited && (
                        <span
                          title="Uses the turret's base-projectile figures (no per-ammo override found)"
                          className="text-muted-foreground"
                        >
                          {" "}†
                        </span>
                      )}
                    </td>
                    <td className={tdCls}>{a.velocity != null ? `${a.velocity} m/s` : "—"}</td>
                    <td className={tdCls}>{a.gravity ?? "—"}</td>
                    <td className={tdCls}>{a.drag ?? "—"}</td>
                    {RANGES.map((r) => {
                      const d = dropAt(a.velocity, a.gravity, r);
                      return <td key={r} className={tdCls}>{d != null ? `${d.toFixed(d < 1 ? 2 : 1)} m` : "—"}</td>;
                    })}
                    <td className={tdCls}>{a.ricochet?.count ? `${a.ricochet.count}×` : "—"}</td>
                    <td className={tdCls}>{a.penetration?.maxCount ? `${a.penetration.maxCount}×` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

function TurretStats() {
  return (
    <>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        Rate of fire, reload and magazine for each turret across condition states (Rusty → Worn →
        Pristine → Experimental). The Auto turret gets faster fire each state; the Cannon and Shotgun
        keep their fire rate but reload quicker. Experimental is the special T4 variant (Accelerating /
        Rail Gun / Double Barrel).
      </p>
      {FAMILIES.map((f) => (
        <div key={f.family} className={panelCls}>
          <div className={labelCls}>
            {f.family} <span className="text-muted-foreground">· {f.caliber}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={thLeft}>State</th>
                  <th className={thCls}>Fire rate</th>
                  <th className={thCls}>Shot interval</th>
                  <th className={thCls}>Reload</th>
                  <th className={thCls}>Magazine</th>
                  <th className={thCls}>Barrels</th>
                </tr>
              </thead>
              <tbody>
                {f.rows.map((r, i) => (
                  <tr key={i}>
                    <td className={tdLeft}>
                      {r.state}
                      {r.variant && <span className="text-muted-foreground"> · {r.variant}</span>}
                    </td>
                    <td className={tdCls}>{r.fireRate != null ? `${r.fireRate}/s` : "—"}</td>
                    <td className={tdCls}>{r.fireInterval != null ? `${r.fireInterval}s` : "—"}</td>
                    <td className={tdCls}>
                      {r.autoRefill ? "Auto-refill" : r.reloadSeconds != null ? `${r.reloadSeconds}s` : "—"}
                    </td>
                    <td className={tdCls}>{r.clipSize ?? "—"}</td>
                    <td className={tdCls}>{r.barrels ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </>
  );
}

export function BallisticsClient() {
  const [tab, setTab] = useState<"drop" | "turrets">("drop");
  const groups = useMemo<[string, Ammo[]][]>(() => {
    const byFam = new Map<string, Ammo[]>();
    for (const a of Object.values(AMMO)) {
      if (!byFam.has(a.family)) byFam.set(a.family, []);
      byFam.get(a.family)!.push(a);
    }
    for (const [fam, arr] of byFam) {
      if (fam === "Turrets") {
        arr.sort(
          (x, y) =>
            (x.turretType || "").localeCompare(y.turretType || "") || (y.velocity ?? 0) - (x.velocity ?? 0),
        );
      } else {
        arr.sort((x, y) => (y.velocity ?? 0) - (x.velocity ?? 0));
      }
    }
    return [...byFam.entries()].sort((a, b) => {
      if (a[0] === "Turrets") return -1;
      if (b[0] === "Turrets") return 1;
      return a[0].localeCompare(b[0]);
    });
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <AdminBack />
      <h1 className="mt-2 font-display text-2xl font-bold uppercase tracking-wide text-primary">Ballistics Sheet</h1>
      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">Admin · datamined weapon &amp; turret figures</p>

      <div className="mt-5 flex gap-2">
        {TABS.map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={
                "rounded px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors " +
                (active
                  ? "bg-primary text-background"
                  : "border border-border text-foreground hover:border-primary hover:text-primary")
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "drop" ? <BulletDrop groups={groups} /> : <TurretStats />}
    </div>
  );
}
