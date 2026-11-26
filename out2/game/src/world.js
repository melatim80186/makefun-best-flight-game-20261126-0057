// Skylark Archipelago — the world: islands, terrain height, airstrips, clouds.
// One job: answer "how high is the ground here?" and "where are the strips?"

import { WORLD } from './config.js';
import { fbm, clamp, mulberry32 } from './random.js';

// Islands are smooth radial bumps: a cosine falloff times fractal noise.
// x/z in metres, r in metres, peak in metres above sea level.
export const ISLANDS = [
  { name: 'Merpati', x: 0, z: 300, r: 1500, peak: 118 }, // home island, the big one
  { name: 'Gagak Ridge', x: -350, z: -1750, r: 950, peak: 235 }, // tall, snowy ridge
  { name: 'Koral', x: 1850, z: 700, r: 820, peak: 88 }, // low coral island
  { name: 'Buru', x: -1850, z: 1050, r: 720, peak: 165 }, // forested hill island
  { name: 'Pasir', x: -500, z: 2250, r: 520, peak: 46 }, // flat sandbar island
];

// Airstrips: flattened ground, a dark strip with white marks, a windsock.
// heading is radians, 0 = north (-z), positive turns east.
// Each strip sits near its island's shore, so the approach comes in over low
// ground or water — a strip in the island's high middle would leave a wall
// of terrain on every approach (found in playtest: the first home strip did).
export const RUNWAYS = [
  { id: 'home', name: 'Merpati Field', x: 0, z: 1050, heading: 0, length: 560, width: 38, elev: 14 },
  { id: 'ridge', name: 'Gagak Strip', x: -350, z: -1150, heading: 0, length: 460, width: 32, elev: 26 },
  { id: 'koral', name: 'Koral Beach', x: 2400, z: 700, heading: Math.PI / 2, length: 480, width: 34, elev: 9 },
];

function islandBump(x, z, isl) {
  const dx = x - isl.x;
  const dz = z - isl.z;
  const d = Math.sqrt(dx * dx + dz * dz) / isl.r;
  if (d >= 1) return 0;
  const fall = 0.5 + 0.5 * Math.cos(Math.PI * d); // 1 at centre, 0 at the shore
  const rough = 0.75 + 0.45 * fbm(x * 0.0016 + 7.3, z * 0.0016 + 2.9, WORLD.seed, 4);
  return isl.peak * fall * fall * rough;
}

function runwayFlatten(x, z) {
  // Returns {h, w}: the flattened height and the blend weight (0..1) near a strip.
  let best = null;
  for (const rw of RUNWAYS) {
    const dx = x - rw.x;
    const dz = z - rw.z;
    // Strip axis is (sin h, 0, -cos h); right is (cos h, 0, sin h).
    const sh = Math.sin(rw.heading);
    const ch = Math.cos(rw.heading);
    const along = dx * sh - dz * ch; // metres along the strip
    const across = dx * ch + dz * sh; // metres across the strip
    const halfL = rw.length / 2;
    const halfW = rw.width / 2;
    if (Math.abs(along) < halfL + 130 && Math.abs(across) < halfW + 130) {
      const edge = Math.max(
        (Math.abs(along) - halfL) / 130,
        (Math.abs(across) - halfW) / 130,
      );
      const w = clamp(1 - Math.max(0, edge), 0, 1);
      const wSmooth = w * w * (3 - 2 * w);
      if (!best || wSmooth > best.w) best = { h: rw.elev, w: wSmooth };
    }
  }
  return best;
}

// Height of the terrain in metres at (x, z). Sea floor reads below zero;
// the renderer draws water at y = 0 wherever the ground is under it.
export function heightAt(x, z) {
  let h = -6; // sea floor
  for (const isl of ISLANDS) h += islandBump(x, z, isl);
  const flat = runwayFlatten(x, z);
  if (flat) h = h * (1 - flat.w) + flat.h * flat.w;
  return h;
}

// Is (x, z) on a runway surface (within the strip, not just the flattened apron)?
export function runwayAt(x, z) {
  for (const rw of RUNWAYS) {
    const dx = x - rw.x;
    const dz = z - rw.z;
    const sh = Math.sin(rw.heading);
    const ch = Math.cos(rw.heading);
    const along = dx * sh - dz * ch;
    const across = dx * ch + dz * sh;
    if (Math.abs(along) <= rw.length / 2 && Math.abs(across) <= rw.width / 2) return rw;
  }
  return null;
}

// Clouds: fair-weather puffs that drift, and dark storm cells for the cargo run.
const rng = mulberry32(WORLD.seed ^ 0x5f3a);
export const CLOUDS = [];
for (let i = 0; i < 26; i++) {
  CLOUDS.push({
    x: (rng() - 0.5) * 5600,
    z: (rng() - 0.5) * 5600,
    y: 260 + rng() * 160,
    r: 90 + rng() * 170,
    storm: false,
    drift: 2 + rng() * 3,
  });
}
// Storm cells sit on the cargo route between Merpati and Koral.
export const STORMS = [
  { x: 900, z: 450, y: 210, r: 190 },
  { x: 1350, z: 620, y: 240, r: 150 },
  { x: 600, z: 850, y: 190, r: 130 },
];

export function cloudAt(x, y, z) {
  for (const st of STORMS) {
    const dx = x - st.x;
    const dy = y - st.y;
    const dz = z - st.z;
    if (dx * dx + dy * dy * 2.2 + dz * dz < st.r * st.r) return st;
  }
  return null;
}
