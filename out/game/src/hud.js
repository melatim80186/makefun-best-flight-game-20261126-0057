// Skylark Archipelago — the HUD: tapes, compass, attitude ball, fuel, minimap.
// One job: show altitude, speed and heading (and everything else the pilot
// needs) as lit instruments over the scene, never as bare numbers alone.

import { PALETTE } from './config.js';
import { RUNWAYS, ISLANDS, heightAt } from './world.js';
import { clamp, lerp } from './random.js';
import { nextTarget } from './missions.js';

const INK = PALETTE.hudInk;
const DIM = PALETTE.hudDim;
const AMBER = PALETTE.hudAmber;
const RED = PALETTE.hudRed;
const GREEN = PALETTE.hudGreen;

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function tape(ctx, x, y, w, h, value, step, majorStep, unit, fmt) {
  panel(ctx, x, y, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const mid = y + h / 2;
  const pxPerUnit = (h - 30) / (step * 6);
  const base = Math.floor(value / step) * step;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  for (let v = base - step * 3; v <= base + step * 3; v += step) {
    const dy = mid - (v - value) * pxPerUnit;
    if (dy < y + 8 || dy > y + h - 8) continue;
    const major = v % majorStep === 0;
    ctx.strokeStyle = major ? INK : DIM;
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x + w - (major ? 14 : 8), dy);
    ctx.lineTo(x + w, dy);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = INK;
      ctx.fillText(fmt(v), x + 6, dy + 4);
    }
  }
  ctx.restore();
  // Current-value box.
  ctx.fillStyle = '#0a1626';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 4, mid - 13, w + 8, 26, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fmt(value), x + w / 2, mid + 5);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = DIM;
  ctx.fillText(unit, x + w / 2, y + h - 6);
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function compass(ctx, W, plane) {
  const w = Math.min(420, W * 0.36);
  const x = (W - w) / 2;
  const y = 10;
  panel(ctx, x, y, w, 34);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, 34);
  ctx.clip();
  const deg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
  const pxPerDeg = w / 120;
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  for (let d = Math.floor((deg - 60) / 15) * 15; d <= deg + 60; d += 15) {
    const dd = ((d % 360) + 360) % 360;
    const dx = x + w / 2 + (dd - deg) * pxPerDeg;
    // Wrap: the shortest angular distance.
    let off = dd - deg;
    if (off > 180) off -= 360;
    if (off < -180) off += 360;
    const sx = x + w / 2 + off * pxPerDeg;
    if (sx < x - 10 || sx > x + w + 10) continue;
    const isCardinal = dd % 90 === 0;
    ctx.strokeStyle = isCardinal ? INK : DIM;
    ctx.lineWidth = isCardinal ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(sx, y + (isCardinal ? 6 : 12));
    ctx.lineTo(sx, y + 20);
    ctx.stroke();
    if (dd % 45 === 0) {
      ctx.fillStyle = isCardinal ? INK : DIM;
      ctx.fillText(COMPASS_POINTS[Math.round(dd / 45) % 8], sx, y + 31);
    }
  }
  ctx.restore();
  // Heading caret + readout.
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 6, y + 2);
  ctx.lineTo(x + w / 2 + 6, y + 2);
  ctx.lineTo(x + w / 2, y + 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(`${String(Math.round(deg)).padStart(3, '0')}°`, x + w / 2, y + 47);
}

function attitudeBall(ctx, x, y, r, plane) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(plane.bank);
  const pitchPx = clamp(plane.pitch, -0.5, 0.5) * r * 1.6;
  // Sky half and ground half, shifted by pitch.
  ctx.fillStyle = '#7fb2dd';
  ctx.fillRect(-r - 2, -r - 2 + pitchPx, r * 2 + 4, r + 2 - pitchPx);
  ctx.fillStyle = '#8a6b42';
  ctx.fillRect(-r - 2, pitchPx, r * 2 + 4, r + 2 - pitchPx);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r, pitchPx);
  ctx.lineTo(r, pitchPx);
  ctx.stroke();
  ctx.strokeStyle = DIM;
  ctx.lineWidth = 1;
  for (const off of [-0.35, -0.18, 0.18, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, pitchPx + off * r * 1.6);
    ctx.lineTo(r * 0.35, pitchPx + off * r * 1.6);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol + bezel.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x + 5, y + 3);
  ctx.lineTo(x - 5, y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', x, y + r + 14);
}

function bar(ctx, x, y, w, h, frac, color, label) {
  panel(ctx, x, y, w, h);
  ctx.fillStyle = color;
  const inner = Math.max(0, (w - 8) * clamp(frac, 0, 1));
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, inner, h - 8, 4);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 8, y + h / 2 + 4);
}

function minimap(ctx, x, y, r, plane, state) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(16, 42, 66, 0.85)';
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  const scale = (r * 2) / 6200;
  const toMap = (wx, wz) => [x + wx * scale, y + wz * scale];
  // Islands as green blobs.
  ctx.fillStyle = '#3f7d3a';
  for (const isl of ISLANDS) {
    const [mx, mz] = toMap(isl.x, isl.z);
    ctx.beginPath();
    ctx.arc(mx, mz, Math.max(3, isl.r * scale), 0, Math.PI * 2);
    ctx.fill();
  }
  // Runways as pale dashes.
  ctx.strokeStyle = '#e8e8e0';
  ctx.lineWidth = 2;
  for (const rw of RUNWAYS) {
    const [mx, mz] = toMap(rw.x, rw.z);
    const dx = Math.sin(rw.heading) * 7;
    const dz = -Math.cos(rw.heading) * 7;
    ctx.beginPath();
    ctx.moveTo(mx - dx, mz - dz);
    ctx.lineTo(mx + dx, mz + dz);
    ctx.stroke();
  }
  // Rings: gold dots, next one pulsing.
  const target = nextTarget(state);
  for (const rg of state.mission.rings) {
    const [mx, mz] = toMap(rg.x, rg.z);
    ctx.fillStyle = rg.passed ? 'rgba(255,201,60,0.35)' : PALETTE.ringGold;
    ctx.beginPath();
    ctx.arc(mx, mz, rg === (target && target.ring) ? 4.5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // The aircraft: a white triangle pointing along its heading.
  const [px, pz] = toMap(plane.x, plane.z);
  ctx.translate(px, pz);
  ctx.rotate(plane.heading);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MAP', x, y + r + 14);
}

export function drawHud(ctx, plane, state, time) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const knots = Math.round(plane.speed * 1.944);
  const feet = Math.round(plane.y * 3.281);
  const fpm = Math.round(plane.verticalSpeed * 196.9);

  compass(ctx, W, plane);

  // Speed tape (left) and altitude tape (right), knots and feet.
  tape(ctx, 14, H * 0.22, 64, H * 0.42, knots, 10, 20, 'KT', (v) => String(Math.round(v)));
  tape(ctx, W - 78, H * 0.22, 64, H * 0.42, feet, 100, 200, 'FT', (v) => String(Math.round(v)));

  // Vertical speed under the altitude tape.
  ctx.fillStyle = fpm >= 0 ? GREEN : AMBER;
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${fpm >= 0 ? '+' : ''}${fpm} fpm`, W - 46, H * 0.22 + H * 0.42 + 20);

  // Attitude ball, bottom-left.
  attitudeBall(ctx, 92, H - 92, 58, plane);

  // Throttle / fuel / damage bars, bottom-centre.
  const bw = 240;
  const bx = (W - bw) / 2;
  const by = H - 96;
  bar(ctx, bx, by, bw, 20, plane.throttle, '#58a6ff', `THR ${Math.round(plane.throttle * 100)}%`);
  bar(ctx, bx, by + 24, bw, 20, plane.fuel / 100, plane.fuel < 25 ? RED : GREEN, `FUEL ${Math.round(plane.fuel)}%`);
  if (plane.damage > 1) {
    bar(ctx, bx, by + 48, bw, 20, plane.damage / 100, RED, `DMG ${Math.round(plane.damage)}%`);
  }

  // Gear state, right of the attitude ball (the ball's own label sits under it).
  ctx.fillStyle = plane.gearDown ? GREEN : DIM;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(plane.gearDown ? 'GEAR DOWN' : 'GEAR UP', 170, H - 18);

  // Minimap, bottom-right.
  minimap(ctx, W - 92, H - 92, 58, plane, state);

  // Objective banner, top-left.
  const target = nextTarget(state);
  panel(ctx, 14, 10, 300, 54);
  ctx.fillStyle = INK;
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(state.mission.name.toUpperCase(), 24, 30);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = DIM;
  if (target) {
    const d = Math.hypot(plane.x - target.x, plane.y - target.y, plane.z - target.z);
    const label = target.kind === 'ring'
      ? `Ring ${state.ringsPassed + 1} of ${state.mission.rings.length} — ${Math.round(d)} m`
      : `Land at ${target.runway.name} — ${Math.round(d)} m`;
    ctx.fillText(label, 24, 50);
  } else if (state.complete) {
    ctx.fillStyle = GREEN;
    ctx.fillText('Mission complete — nice flying!', 24, 50);
  } else {
    ctx.fillText('Take off and follow the course', 24, 50);
  }

  // Score, top-right under the compass side, on its own dark pill so it stays
  // readable when a cloud drifts behind it.
  panel(ctx, W - 178, 56, 164, 46);
  ctx.fillStyle = INK;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`SCORE ${state.score}`, W - 24, 76);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = DIM;
  const mins = Math.floor(state.timeLeft / 60);
  const secs = Math.floor(state.timeLeft % 60);
  ctx.fillText(`TIME ${mins}:${String(secs).padStart(2, '0')}`, W - 24, 94);

  // Centre flight-path marker.
  ctx.strokeStyle = 'rgba(234, 244, 255, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.52, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W / 2, H * 0.52 - 14);
  ctx.lineTo(W / 2, H * 0.52 - 6);
  ctx.moveTo(W / 2, H * 0.52 + 6);
  ctx.lineTo(W / 2, H * 0.52 + 14);
  ctx.moveTo(W / 2 - 14, H * 0.52);
  ctx.lineTo(W / 2 - 6, H * 0.52);
  ctx.moveTo(W / 2 + 6, H * 0.52);
  ctx.lineTo(W / 2 + 14, H * 0.52);
  ctx.stroke();

  // Warnings, flashing centre-top. TERRAIN is ground-relative: on a proper
  // final approach the plane is low by the altimeter but high above the strip.
  const warnings = [];
  if (plane.speed < 27 && !plane.onGround) warnings.push('STALL');
  if (plane.fuel > 0 && plane.fuel < 20) warnings.push('LOW FUEL');
  if (plane.inStorm) warnings.push('STORM DAMAGE');
  const groundBelow = Math.max(heightAt(plane.x, plane.z), 0);
  if (plane.y < groundBelow + 25 && plane.speed > 40 && !plane.onGround) warnings.push('TERRAIN');
  if (warnings.length && Math.sin(time * 8) > -0.2) {
    ctx.fillStyle = RED;
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(warnings.join('  •  '), W / 2, 92);
  }

  // Toasts (score popups), right side under the score.
  ctx.textAlign = 'right';
  state.toasts.forEach((t, i) => {
    ctx.globalAlpha = clamp(1 - t.t / 3.2, 0, 1);
    ctx.fillStyle = GREEN;
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(t.text, W - 14, 122 + i * 22);
  });
  ctx.globalAlpha = 1;
}
