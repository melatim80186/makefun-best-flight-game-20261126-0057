// Skylark Archipelago — screenshot staging: deterministic poses for the hand-in.
// One job: read ?shot=<name> and put the game into a fixed, photogenic state
// so the screenshots are real renders of the game's own code, frozen in time.
//
//   ?shot=cover    — mid-flight over the coast, a gold ring ahead, HUD lit
//   ?shot=ring     — about to thread a ring, close and centred
//   ?shot=landing  — short final to Merpati Field, gear down, low and slow
//   ?shot=results  — mission-complete screen with the score breakdown
// Any shot freezes the clock (time stops) so two renders are identical.

import { MISSIONS, makeMissionState, checkRings } from './missions.js';
import { RUNWAYS } from './world.js';

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  return q.get('shot');
}

export function applyShot(game, name) {
  const plane = game.plane;
  let state = game.state;
  if (name === 'cover') {
    // Park the plane on the approach to ring 3 (-800, 190, -1100): the ring
    // sits ~150 m ahead on the nose, big in the frame, the coast below.
    Object.assign(plane, {
      x: -715, y: 190, z: -976, heading: -0.60, pitch: 0.02, bank: 0.18,
      speed: 68, throttle: 0.72, fuel: 78, damage: 0,
      gearDown: false, onGround: false,
    });
    state.score = 240;
    state.ringsPassed = 2;
    state.mission.rings[0].passed = true;
    state.mission.rings[1].passed = true;
    state.timeLeft = 212;
    state.toasts = [{ text: '+100  Ring 2', t: 0.4 }];
    game.mode = 'flying';
    game.frozen = true;
  } else if (name === 'ring') {
    const r = state.mission.rings[2];
    Object.assign(plane, {
      x: r.x - Math.sin(0.55) * 130, y: r.y + 6, z: r.z + Math.cos(0.55) * 130,
      heading: 0.55, pitch: 0.0, bank: -0.1,
      speed: 74, throttle: 0.8, fuel: 71, damage: 0,
      gearDown: false, onGround: false,
    });
    state.score = 240;
    state.ringsPassed = 2;
    state.mission.rings[0].passed = true;
    state.mission.rings[1].passed = true;
    state.timeLeft = 198;
    game.mode = 'flying';
    game.frozen = true;
  } else if (name === 'landing') {
    // The landing shot flies Island Hop with two strips already behind it, so
    // the banner names the strip ahead: Merpati Field.
    game.state = makeMissionState(MISSIONS[1]);
    state = game.state;
    const rw = RUNWAYS[0];
    // Long final: 270 m south of the threshold and high enough to see the
    // strip — and 70 m west of the centreline, so the runway reads BESIDE the
    // plane instead of hiding directly behind it (chase view geometry).
    Object.assign(plane, {
      x: rw.x - 70, y: rw.elev + 55, z: rw.z + 550, heading: 0, pitch: -0.06, bank: 0.02,
      speed: 46, throttle: 0.32, fuel: 64, damage: 0,
      gearDown: true, onGround: false,
    });
    state.score = 650;
    state.landingsDone = 2;
    state.log = [
      { label: 'Landing at Gagak Strip (smooth)', points: 400 },
      { label: 'Landing at Koral Beach', points: 250 },
    ];
    state.timeLeft = 154;
    state.toasts = [{ text: 'GEAR DOWN — final approach', t: 0.4 }];
    game.mode = 'flying';
    game.frozen = true;
  } else if (name === 'results') {
    Object.assign(plane, {
      x: -715, y: 190, z: -976, heading: -0.60, pitch: 0.02, bank: 0.18,
      speed: 68, throttle: 0.72, fuel: 42, damage: 0,
      gearDown: false, onGround: false,
    });
    state.score = 1890;
    state.ringsPassed = 8;
    for (const r of state.mission.rings) r.passed = true;
    state.log = [
      { label: 'Ring 1', points: 100 }, { label: 'Ring 2 — dead centre', points: 140 },
      { label: 'Ring 3', points: 100 }, { label: 'Ring 4 — dead centre', points: 140 },
      { label: 'Ring 5', points: 100 }, { label: 'Ring 6', points: 100 },
      { label: 'Ring 7 — dead centre', points: 140 }, { label: 'Ring 8', points: 100 },
      { label: 'Time bonus (212s left)', points: 424 },
      { label: 'Mission complete', points: 500 },
    ];
    state.timeLeft = 212;
    state.complete = true;
    game.mode = 'complete';
    game.frozen = true;
  } else {
    return false;
  }
  // Keep the ring-pass check honest: a staged pose must not "collect" a ring
  // just by being placed near one.
  void checkRings;
  return true;
}
