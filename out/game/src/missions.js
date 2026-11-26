// Skylark Archipelago — missions: what "winning" means in each sortie.
// One job: define the goals, track progress, and score the flight.

import { SCORE } from './config.js';
import { RUNWAYS } from './world.js';

// A ring is a golden hoop in the sky: fly through its middle.
function ring(x, y, z, r = 26) {
  return { x, y, z, r, passed: false };
}

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    tagline: 'Eight golden rings over the islands. Thread them all before the fuel runs dry.',
    briefing: 'Take off from Merpati Field, climb to the coast, and fly the ring course. '
      + 'A clean pass through the middle pays a bonus. Mind the fuel — full throttle drinks it.',
    start: { x: 0, y: 15.6, z: 1290, heading: 0, speed: 0, throttle: 0, gearDown: true, onGround: true },
    fuel: 100,
    timeLimit: 300,
    rings: [
      ring(0, 120, -250), ring(-420, 150, -700), ring(-800, 190, -1100),
      ring(-600, 230, -1600), ring(0, 210, -1900), ring(650, 180, -1500),
      ring(1050, 150, -900), ring(900, 130, -250),
    ],
    landings: [],
    cargo: null,
  },
  {
    id: 'island-hop',
    name: 'Island Hop',
    tagline: 'Three strips, three landings. The bush pilot\'s milk run — done properly.',
    briefing: 'Take off from Merpati Field and put the wheels down on Gagak Strip, then '
      + 'Koral Beach, then home again. A gentle touchdown pays a smoothness bonus; '
      + 'a fast or hard arrival is a crash. Gear down, speed under 110 knots.',
    start: { x: 0, y: 15.6, z: 1290, heading: 0, speed: 0, throttle: 0, gearDown: true, onGround: true },
    fuel: 100,
    timeLimit: 420,
    rings: [],
    landings: ['ridge', 'koral', 'home'],
    cargo: null,
  },
  {
    id: 'storm-cargo',
    name: 'Storm Cargo',
    tagline: 'Medicine for Koral, straight through the storm cells. Fly it or lose it.',
    briefing: 'Pick up the cargo at Merpati Field (it loads itself on takeoff), then '
      + 'deliver it to Koral Beach. The direct route crosses three storm cells that '
      + 'shake the airframe apart — thread between them or climb over them.',
    start: { x: 0, y: 15.6, z: 1290, heading: 0, speed: 0, throttle: 0, gearDown: true, onGround: true },
    fuel: 100,
    timeLimit: 360,
    rings: [ring(500, 170, 350, 30), ring(1200, 190, 550, 30)],
    landings: ['koral'],
    cargo: { pickup: 'home', drop: 'koral', loaded: false, delivered: false },
  },
];

export function makeMissionState(mission) {
  return {
    mission,
    score: 0,
    ringsPassed: 0,
    landingsDone: 0,
    timeLeft: mission.timeLimit,
    complete: false,
    failed: false,
    toasts: [], // {text, t} floating score popups
    log: [], // score breakdown lines for the results screen
  };
}

export function nextTarget(state) {
  const m = state.mission;
  const ringTarget = m.rings.find((r) => !r.passed);
  if (ringTarget) return { kind: 'ring', ring: ringTarget, x: ringTarget.x, y: ringTarget.y, z: ringTarget.z };
  if (m.cargo && m.cargo.loaded && !m.cargo.delivered) {
    const rw = RUNWAYS.find((r) => r.id === m.cargo.drop);
    return { kind: 'land', runway: rw, x: rw.x, y: rw.elev + 5, z: rw.z };
  }
  const nextId = m.landings[state.landingsDone];
  if (nextId) {
    const rw = RUNWAYS.find((r) => r.id === nextId);
    return { kind: 'land', runway: rw, x: rw.x, y: rw.elev + 5, z: rw.z };
  }
  return null;
}

function toast(state, text) {
  state.toasts.push({ text, t: 0 });
  if (state.toasts.length > 4) state.toasts.shift();
}

function addScore(state, points, label) {
  state.score += points;
  state.log.push({ label, points });
  toast(state, `+${points}  ${label}`);
}

// Feed flight events into the mission; returns nothing, mutates state.
export function applyEvents(state, events, plane) {
  const m = state.mission;
  for (const ev of events) {
    if (ev.type === 'takeoff') {
      toast(state, 'Airborne — gear up with G');
      if (m.cargo && !m.cargo.loaded) {
        m.cargo.loaded = true;
        toast(state, 'Cargo loaded — deliver to Koral Beach');
      }
    }
    if (ev.type === 'landed') {
      const want = m.landings[state.landingsDone];
      const isTarget = want && ev.runway.id === want;
      const points = SCORE.landing + (ev.smooth ? SCORE.landingSmoothBonus : 0);
      if (isTarget) {
        state.landingsDone += 1;
        addScore(state, points, ev.smooth ? `Landing at ${ev.runway.name} (smooth)` : `Landing at ${ev.runway.name}`);
        if (m.cargo && m.cargo.loaded && ev.runway.id === m.cargo.drop) {
          m.cargo.delivered = true;
          addScore(state, SCORE.cargo, 'Cargo delivered to Koral');
        }
      } else {
        // A landing that is not the mission's next stop still counts a little.
        addScore(state, 50, `Touchdown at ${ev.runway.name}`);
      }
    }
    if (ev.type === 'stall') toast(state, 'STALL — nose down, power up');
    if (ev.type === 'fuel-empty') toast(state, 'FUEL EMPTY — gliding');
    if (ev.type === 'edge') toast(state, 'Open sea ahead — turn back');
  }
}

// Ring passes are checked every frame from the plane's position.
export function checkRings(state, plane) {
  for (const r of state.mission.rings) {
    if (r.passed) continue;
    const dx = plane.x - r.x;
    const dy = plane.y - r.y;
    const dz = plane.z - r.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < r.r) {
      r.passed = true;
      state.ringsPassed += 1;
      const clean = d < r.r * 0.45;
      const points = SCORE.ring + (clean ? SCORE.ringTimeBonus : 0);
      addScore(state, points, clean ? `Ring ${state.ringsPassed} — dead centre` : `Ring ${state.ringsPassed}`);
    }
  }
}

// Mission completion: every ring flown and every landing done (cargo delivered).
export function checkComplete(state) {
  const m = state.mission;
  const ringsDone = m.rings.every((r) => r.passed);
  const landingsDone = state.landingsDone >= m.landings.length;
  const cargoDone = !m.cargo || m.cargo.delivered;
  if (ringsDone && landingsDone && cargoDone && !state.complete) {
    state.complete = true;
    const timeBonus = Math.round(state.timeLeft) * 2;
    if (timeBonus > 0) addScore(state, timeBonus, `Time bonus (${Math.round(state.timeLeft)}s left)`);
    addScore(state, SCORE.missionComplete, 'Mission complete');
    return true;
  }
  return false;
}
