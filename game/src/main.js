// Skylark Archipelago — the game itself: loop, menu, pause, crash, results.
// One job: own the screens and the frame, and wire flight + render + HUD together.

import { MISSIONS, makeMissionState, applyEvents, checkRings, checkComplete, nextTarget } from './missions.js';
import { makePlane, stepPlane, resetPlane } from './flight.js';
import { renderScene } from './render.js';
import { drawHud } from './hud.js';
import { makeInput, attachInput, pollInput, consumeClick, consumePress, endFrameInput } from './input.js';
import { makeAudio, unlockAudio, updateAudio, playChime, playThud, playCrash, playClick, playWarning } from './audio.js';
import { parseShot, applyShot } from './shots.js';
import { PALETTE } from './config.js';
import { clamp } from './random.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const ctx = canvas.getContext('2d');

// The menu backdrop: the same golden-hour pose as the cover screenshot —
// coast below, a ring ahead — instead of the parked plane's green wall.
const menuScene = {
  plane: {
    x: -650, y: 185, z: -880, heading: -0.60, pitch: 0.02, bank: 0.18,
    speed: 68, throttle: 0.72, fuel: 78, damage: 0,
    gearDown: false, onGround: false, inStorm: false,
  },
  state: makeMissionState(MISSIONS[0]),
};

const game = {
  mode: 'menu', // menu | flying | paused | crashed | failed | complete
  missionIndex: 0,
  plane: makePlane(),
  state: makeMissionState(MISSIONS[0]),
  input: makeInput(),
  audio: makeAudio(),
  time: 0,
  frozen: false,
  buttons: [], // {x, y, w, h, action} rebuilt every menu frame
  best: loadBest(),
  shotName: null,
  crashReason: '',
  frames: 0,
};

function loadBest() {
  try {
    return JSON.parse(window.localStorage.getItem('skylark-best') || '{}');
  } catch {
    return {};
  }
}

function saveBest() {
  try {
    window.localStorage.setItem('skylark-best', JSON.stringify(game.best));
  } catch {
    // Storage may be unavailable (file://, hosted sandbox): best scores are a bonus.
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startMission(index) {
  const mission = MISSIONS[index];
  game.missionIndex = index;
  // Fresh mission state: rings un-pass, cargo un-loaded (new objects each run).
  const fresh = JSON.parse(JSON.stringify(mission));
  fresh.rings = mission.rings.map((r) => ({ ...r, passed: false }));
  game.state = makeMissionState(fresh);
  resetPlane(game.plane, fresh.start);
  game.plane.fuel = fresh.fuel;
  game.mode = 'flying';
  game.crashReason = '';
  unlockAudio(game.audio);
  playClick(game.audio);
  statusEl.textContent = `${mission.name}: ${mission.tagline}`;
}

function backToMenu() {
  game.mode = 'menu';
  resetPlane(game.plane, MISSIONS[game.missionIndex].start);
  game.state = makeMissionState(MISSIONS[game.missionIndex]);
}

function recordBest() {
  const id = game.state.mission.id;
  if (!game.best[id] || game.state.score > game.best[id]) {
    game.best[id] = game.state.score;
    saveBest();
    return true;
  }
  return false;
}

// ---------- Menu ----------

function drawMenu() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  // The menu's backdrop flies a scenic pose over the coast: a camera parked on
  // the runway stares into a green wall of hills at dawn, which is no backdrop.
  renderScene(ctx, menuScene.plane, menuScene.state, 6);
  ctx.fillStyle = 'rgba(8, 18, 34, 0.45)';
  ctx.fillRect(0, 0, W, H);

  game.buttons = [];
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f3ede0';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText('SKYLARK', W / 2, H * 0.20);
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillStyle = '#ffc93c';
  ctx.fillText('A R C H I P E L A G O', W / 2, H * 0.20 + 42);
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(234, 244, 255, 0.85)';
  ctx.fillText('A bush-plane game: rings, island strips, and one storm worth dodging.', W / 2, H * 0.20 + 74);

  // Mission cards.
  const cardW = Math.min(300, (W - 120) / 3);
  const cardH = 178;
  const gap = 24;
  const totalW = cardW * 3 + gap * 2;
  const x0 = (W - totalW) / 2;
  const y0 = H * 0.34;
  MISSIONS.forEach((m, i) => {
    const x = x0 + i * (cardW + gap);
    const hover = game.input.mouseX >= x && game.input.mouseX <= x + cardW
      && game.input.mouseY >= y0 && game.input.mouseY <= y0 + cardH;
    ctx.fillStyle = hover ? 'rgba(30, 52, 82, 0.92)' : 'rgba(10, 22, 38, 0.78)';
    ctx.strokeStyle = i === game.missionIndex ? '#ffc93c' : 'rgba(234, 244, 255, 0.35)';
    ctx.lineWidth = i === game.missionIndex ? 2.5 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y0, cardW, cardH, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffc93c';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`MISSION ${i + 1}`, x + cardW / 2, y0 + 28);
    ctx.fillStyle = '#f3ede0';
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText(m.name, x + cardW / 2, y0 + 60);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(234, 244, 255, 0.8)';
    wrapText(ctx, m.tagline, x + cardW / 2, y0 + 86, cardW - 28, 18);
    const best = game.best[m.id];
    ctx.fillStyle = best ? '#58d68d' : 'rgba(234, 244, 255, 0.5)';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(best ? `BEST ${best}` : 'NOT FLOWN YET', x + cardW / 2, y0 + cardH - 16);
    game.buttons.push({ x, y: y0, w: cardW, h: cardH, action: () => startMission(i) });
  });

  // Controls.
  const cy = y0 + cardH + 46;
  ctx.fillStyle = 'rgba(234, 244, 255, 0.9)';
  ctx.font = '15px sans-serif';
  ctx.fillText('Fly:  ↑ ↓ pitch    ← → bank    W / S throttle    G gear    P pause    M mute    R restart', W / 2, cy);
  ctx.fillStyle = 'rgba(234, 244, 255, 0.65)';
  ctx.font = '13px sans-serif';
  ctx.fillText('Click a mission card, or press 1 / 2 / 3 then Enter. Land gently, under 110 knots, gear down.', W / 2, cy + 24);
  ctx.fillText('Skylark Archipelago — an original game. No network, no accounts, just flying.', W / 2, H - 18);

  // Briefing of the selected mission, on a dark pill so the plane's tail
  // behind it never eats the words.
  const brief = MISSIONS[game.missionIndex].briefing;
  ctx.font = 'italic 15px Georgia, serif';
  const briefW = ctx.measureText(brief).width + 36;
  ctx.fillStyle = 'rgba(10, 22, 38, 0.72)';
  ctx.beginPath();
  ctx.roundRect((W - briefW) / 2, cy + 40, briefW, 34, 17);
  ctx.fill();
  ctx.fillStyle = '#f3ede0';
  ctx.fillText(brief, W / 2, cy + 62);
}

function wrapText(c, text, cx, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (c.measureText(test).width > maxW && line) {
      c.fillText(line, cx, yy);
      line = word;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) c.fillText(line, cx, yy);
}

// ---------- Overlays ----------

function overlayPanel(title, titleColor) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  ctx.fillStyle = 'rgba(6, 14, 26, 0.55)';
  ctx.fillRect(0, 0, W, H);
  const w = 560;
  const h = 380;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  ctx.fillStyle = 'rgba(10, 22, 38, 0.92)';
  ctx.strokeStyle = 'rgba(234, 244, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(title, W / 2, y + 58);
  return { x, y, w, h };
}

function drawCrashed() {
  const { x, y, w } = overlayPanel('CRASHED', PALETTE.hudRed);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '17px sans-serif';
  ctx.fillText(game.crashReason, window.innerWidth / 2, y + 100);
  ctx.fillStyle = 'rgba(234, 244, 255, 0.75)';
  ctx.font = '15px sans-serif';
  ctx.fillText(`Score ${game.state.score}  •  Rings ${game.state.ringsPassed}/${game.state.mission.rings.length}  •  Landings ${game.state.landingsDone}`, window.innerWidth / 2, y + 132);
  drawOverlayButtons(y + 190, [
    { label: 'FLY AGAIN  (R)', action: () => startMission(game.missionIndex) },
    { label: 'MENU  (Esc)', action: backToMenu },
  ]);
  void x; void w;
}

function drawFailed() {
  const { y } = overlayPanel('OUT OF TIME', PALETTE.hudAmber);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = '17px sans-serif';
  ctx.fillText('The mission window closed before the course was finished.', window.innerWidth / 2, y + 100);
  ctx.fillStyle = 'rgba(234, 244, 255, 0.75)';
  ctx.font = '15px sans-serif';
  ctx.fillText(`Score ${game.state.score}  •  Rings ${game.state.ringsPassed}/${game.state.mission.rings.length}`, window.innerWidth / 2, y + 132);
  drawOverlayButtons(y + 190, [
    { label: 'FLY AGAIN  (R)', action: () => startMission(game.missionIndex) },
    { label: 'MENU  (Esc)', action: backToMenu },
  ]);
}

function drawComplete() {
  const { y } = overlayPanel('MISSION COMPLETE', PALETTE.hudGreen);
  const isBest = game.state.score >= (game.best[game.state.mission.id] || 0);
  ctx.fillStyle = '#eaf4ff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`SCORE  ${game.state.score}${isBest ? '  —  NEW BEST!' : ''}`, window.innerWidth / 2, y + 98);
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  let yy = y + 128;
  for (const line of game.state.log.slice(-10)) {
    ctx.fillStyle = 'rgba(234, 244, 255, 0.85)';
    ctx.fillText(line.label, window.innerWidth / 2 - 230, yy);
    ctx.textAlign = 'right';
    ctx.fillText(`+${line.points}`, window.innerWidth / 2 + 230, yy);
    ctx.textAlign = 'left';
    yy += 18;
  }
  drawOverlayButtons(y + 330, [
    { label: 'FLY AGAIN  (R)', action: () => startMission(game.missionIndex) },
    { label: 'MENU  (Esc)', action: backToMenu },
  ]);
}

function drawPaused() {
  const { y } = overlayPanel('PAUSED', '#eaf4ff');
  ctx.fillStyle = 'rgba(234, 244, 255, 0.8)';
  ctx.font = '15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('The islands will wait. P or Esc to keep flying.', window.innerWidth / 2, y + 100);
  drawOverlayButtons(y + 190, [
    { label: 'RESUME  (P)', action: () => { game.mode = 'flying'; } },
    { label: 'RESTART  (R)', action: () => startMission(game.missionIndex) },
    { label: 'MENU  (Esc)', action: backToMenu },
  ]);
}

function drawOverlayButtons(y, buttons) {
  const W = window.innerWidth;
  const bw = 200;
  const bh = 44;
  const gap = 18;
  const total = buttons.length * bw + (buttons.length - 1) * gap;
  let x = (W - total) / 2;
  game.buttons = [];
  for (const b of buttons) {
    const hover = game.input.mouseX >= x && game.input.mouseX <= x + bw
      && game.input.mouseY >= y && game.input.mouseY <= y + bh;
    ctx.fillStyle = hover ? '#ffc93c' : 'rgba(234, 244, 255, 0.16)';
    ctx.strokeStyle = hover ? '#ffc93c' : 'rgba(234, 244, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = hover ? '#1a2b45' : '#eaf4ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(b.label, x + bw / 2, y + 28);
    game.buttons.push({ x, y, w: bw, h: bh, action: b.action });
    x += bw + gap;
  }
}

// ---------- Frame ----------

let lastT = 0;

function frame(t) {
  requestAnimationFrame(frame);
  const dt = game.frozen ? 0 : clamp((t - lastT) / 1000, 0, 0.05);
  lastT = t;
  if (!game.frozen) game.time += dt;
  const input = game.input;

  pollInput(input);

  // Global keys.
  if (consumePress(input, 'KeyM')) {
    const muted = toggleMute(game.audio);
    statusEl.textContent = muted ? 'Sound off' : 'Sound on';
  }
  if (consumePress(input, 'KeyR') && game.mode !== 'menu') startMission(game.missionIndex);
  if (consumePress(input, 'Escape') && game.mode !== 'menu') {
    if (game.mode === 'flying') game.mode = 'paused';
    else if (game.mode === 'paused') game.mode = 'flying';
    else backToMenu();
  }
  if (consumePress(input, 'KeyP')) {
    if (game.mode === 'flying') game.mode = 'paused';
    else if (game.mode === 'paused') game.mode = 'flying';
  }

  if (game.mode === 'menu') {
    if (consumePress(input, 'Digit1')) game.missionIndex = 0;
    if (consumePress(input, 'Digit2')) game.missionIndex = 1;
    if (consumePress(input, 'Digit3')) game.missionIndex = 2;
    if (consumePress(input, 'Enter') || consumePress(input, 'Space')) startMission(game.missionIndex);
    if (consumeClick(input)) {
      for (const b of game.buttons) {
        if (input.mouseX >= b.x && input.mouseX <= b.x + b.w && input.mouseY >= b.y && input.mouseY <= b.y + b.h) {
          b.action();
          break;
        }
      }
    }
    drawMenu();
  } else if (game.mode === 'flying') {
    // Step the world.
    const events = stepPlane(game.plane, input, dt);
    for (const ev of events) {
      if (ev.type === 'landed') playThud(game.audio);
      if (ev.type === 'crash') { playCrash(game.audio); game.crashReason = ev.reason; }
      if (ev.type === 'stall') playWarning(game.audio);
    }
    checkRings(game.state, game.plane);
    applyEvents(game.state, events, game.plane);
    const hadScore = game.state.score;
    if (game.state.toasts.length && game.state.score !== hadScore) playChime(game.audio);
    // Timer.
    game.state.timeLeft -= dt;
    for (const toast of game.state.toasts) toast.t += dt;
    game.state.toasts = game.state.toasts.filter((toast) => toast.t < 3.2);
    if (game.state.timeLeft <= 0 && !game.state.complete) {
      game.state.timeLeft = 0;
      game.mode = 'failed';
    }
    if (game.plane.crashed) {
      game.mode = 'crashed';
      statusEl.textContent = `Crashed: ${game.crashReason}`;
    } else if (checkComplete(game.state)) {
      game.mode = 'complete';
      recordBest();
      playChime(game.audio);
      statusEl.textContent = `Mission complete — score ${game.state.score}`;
    }
    updateAudio(game.audio, game.plane);
    renderScene(ctx, game.plane, game.state, game.time);
    drawHud(ctx, game.plane, game.state, game.time);
    if (consumeClick(input)) {
      // Clicking while flying does nothing (mouse is for menus); keep the flag cleared.
    }
  } else {
    // paused / crashed / failed / complete: keep the scene behind the overlay.
    renderScene(ctx, game.plane, game.state, game.time);
    if (game.mode !== 'paused') drawHud(ctx, game.plane, game.state, game.time);
    if (game.mode === 'paused') drawPaused();
    if (game.mode === 'crashed') drawCrashed();
    if (game.mode === 'failed') drawFailed();
    if (game.mode === 'complete') drawComplete();
    if (consumeClick(input)) {
      for (const b of game.buttons) {
        if (input.mouseX >= b.x && input.mouseX <= b.x + b.w && input.mouseY >= b.y && input.mouseY <= b.y + b.h) {
          b.action();
          break;
        }
      }
    }
  }

  endFrameInput(input);
  game.frames += 1;
  if (game.shotName && game.frames >= 3) window.__shotReady = true;
}

function boot() {
  resize();
  window.addEventListener('resize', resize);
  attachInput(game.input, canvas);
  canvas.addEventListener('pointerdown', () => unlockAudio(game.audio));
  // Debug hook: with ?debug=1 the live game object is inspectable from the
  // console (used by headless playtests; harmless in normal play).
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    window.__skylark = game;
  }
  game.shotName = parseShot();
  if (game.shotName) {
    applyShot(game, game.shotName);
    // The staged pose is a still: freeze the clock so the shot is identical
    // every time it is taken.
    game.frozen = true;
  }
  requestAnimationFrame(frame);
}

boot();
