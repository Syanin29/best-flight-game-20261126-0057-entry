// Canyon Courier — constants and tuning. One job: every number the game balances on.
// 12 rings, 3 legs, 3 weather fronts, 2 aircraft, 1 golden-hour canyon.
export const STEP = 1 / 60;
export const DEFAULT_SEED = 20261126;
export const SORTIE_LENGTH = 150; // seconds the three weather fronts split between

export const COURSE = {
  ringCount: 12,
  ringSpacing: 120,
  firstRingZ: -160,
  ringRadius: 20,
  stripZ: -2240,
  stripLength: 180,
  stripWidth: 44,
  padCount: 3,
};

export const FLIGHT = {
  minSpeed: 18,
  stallSpeed: 28,
  maxThrottleSpeed: 82,
  accel: 9,
  maxRoll: 1.05,
  maxPitch: 0.5,
  rollRate: 2.4,
  pitchRate: 1.8,
  levelRate: 1.4,
  brakeFactor: 0.55,
};

// Two aircraft: the Bush Courier (forgiving, thrifty) and the Swift Courier (fast, thirsty).
export const AIRCRAFT = {
  bush: {
    name: 'Bush Courier',
    color: 0xd86a2c,
    trim: 0x2e4a3a,
    speedBonus: 0,
    fuelRate: 0.9,
    handling: 1.0,
    blurb: 'Forgiving bush plane — sips fuel, turns gentle.',
  },
  swift: {
    name: 'Swift Courier',
    color: 0x2c5fd8,
    trim: 0xd8c22c,
    speedBonus: 10,
    fuelRate: 1.25,
    handling: 1.25,
    blurb: 'Fast courier — 10 m/s quicker, drinks fuel.',
  },
};

export const FUEL = { start: 100, baseDrain: 0.22, throttleDrain: 0.5, thermalSaver: 0.45 };
export const DAMAGE = { roughTouch: 22, hardTouch: 45, scrape: 30, max: 100 };

export const SCORE = {
  ringBase: 100,
  ringAccuracy: 100,
  ringSpeed: 50,
  cargoBase: 150,
  cargoAccuracy: 100,
  landingBase: 300,
};

// ThermalWind fronts: clear -> strong wind -> storm, one per third of a sortie.
export const FRONTS = [
  { name: 'Clear', windSpeed: 3, gust: 1, fog: 0.0011, sun: 2.4, sky: 0xffc98a, label: 'FRONT 1/3 — CLEAR' },
  { name: 'Strong Wind', windSpeed: 11, gust: 4, fog: 0.0016, sun: 2.0, sky: 0xf0b070, label: 'FRONT 2/3 — STRONG WIND' },
  { name: 'Storm', windSpeed: 19, gust: 9, fog: 0.0042, sun: 0.9, sky: 0x6b5a58, label: 'FRONT 3/3 — STORM' },
];

export const RANKS = [
  { min: 3200, rank: 'S', title: 'Legend of the Canyon' },
  { min: 2600, rank: 'A', title: 'Master Courier' },
  { min: 1800, rank: 'B', title: 'Solid Courier' },
  { min: 1000, rank: 'C', title: 'Rookie Courier' },
  { min: 0, rank: 'D', title: 'Keep Flying' },
];

export function rankFor(total) {
  for (const r of RANKS) if (total >= r.min) return r;
  return RANKS[RANKS.length - 1];
}
