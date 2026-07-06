/** All in-game achievements, datamined from the game's localization tables
 *  (i2 Achievements/* keys). "Molfar" is the all-achievements capstone; on
 *  console it doubles as the platinum trophy ("Unlock All Trophies").
 *  Groups are editorial (ours), for page layout only. */

export interface Achievement {
  /** Internal id from the game files (stable across locales). */
  id: string;
  /** Display name (often a joke or reference). */
  name: string;
  /** Unlock condition as written in-game. */
  description: string;
}

export interface AchievementGroup {
  label: string;
  blurb: string;
  achievements: Achievement[];
}

export const ACHIEVEMENT_GROUPS: AchievementGroup[] = [
  {
    label: "Infantry Combat",
    blurb: "On-foot gunplay — kills, damage and the shots in between.",
    achievements: [
      { id: "KILL_10_PLAYERS", name: "Geologists, huh?", description: "Get 25 player kills in one expedition." },
      { id: "LONG_SHOT_KILL_EASY", name: "Galician al-Gaib", description: "Kill a player who is more than 250 meters away with a headshot." },
      { id: "MELEE_KILL_EASY", name: "The Art of CQC", description: "Kill three players with a melee attack in one expedition." },
      { id: "DEAL_INFANTRY_DAMAGE", name: "Meat Grinder", description: "Deal 5,000 damage to players in one expedition." },
      { id: "RECEIVE_DAMAGE", name: "Just a flesh wound", description: "Receive 5,000 damage in one expedition." },
      { id: "FIRE_SHOTS", name: "Quantity Over Quality", description: "Fire 1,000 shots in one expedition." },
    ],
  },
  {
    label: "Tramplers",
    blurb: "Destroying, capturing and keeping the big walkers alive.",
    achievements: [
      { id: "DESTROY_TRAMPLER_EASY", name: "Sink into the Sands", description: "Destroy a trampler for the first time." },
      { id: "DESTROY_TRAMPLER_MEDIUM", name: "Menace", description: "Destroy six tramplers in one expedition." },
      { id: "CAPTURE_TRAMPLER_EASY", name: "Boarding Enthusiast", description: "Capture a trampler." },
      { id: "CAPTURE_TRAMPLER_MEDIUM", name: "I see it, I take it", description: "Capture five tramplers in one expedition." },
      { id: "DEAL_TRAMPLER_DAMAGE", name: "Friendly!", description: "Deal 50,000 damage to tramplers in one expedition." },
      { id: "REPAIR_FAILURE_POINTS", name: "Patches and bailing wires", description: "Repair 40 malfunctions in one expedition." },
      { id: "USE_ENERGY_ROD", name: "Purple Goes Faster", description: "Use 10 energy rods in one expedition." },
      { id: "PRESS_TRAMPLER_HORN", name: "I'm Tramplin' Here!", description: "Honk from the trampler's steering room." },
    ],
  },
  {
    label: "The Wasteland",
    blurb: "Sophie's locals, buried secrets and the things best left buried.",
    achievements: [
      { id: "KILL_AI_EASY", name: "Pesky Locals", description: "Kill 10 Upiórs in one expedition." },
      { id: "KILL_AI_MEDIUM", name: "The Last of Them", description: "Kill 50 Upiórs in one expedition." },
      { id: "STUN_LIVING_SAND_EASY", name: "Is it gone now?", description: "Stun the Leviathan for the first time." },
      { id: "DIE_FROM_LIVING_SAND_EASY", name: "Teg tou fo yam sauh!", description: "Die to a Leviathan." },
      { id: "DIG_TREASURE_EASY", name: "Am I a real pirate now?", description: "Dig up buried treasure for the first time." },
      { id: "UNLOCK_BLACK_DOOR_EASY", name: "Is this the Last One!?", description: "Open the Black Door." },
    ],
  },
  {
    label: "Capstone",
    blurb: "The one that needs all the others.",
    achievements: [
      { id: "PLAT_ACHIEVEMENT", name: "Molfar", description: "Unlock all achievements." },
    ],
  },
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENT_GROUPS.reduce(
  (n, g) => n + g.achievements.length,
  0,
);
