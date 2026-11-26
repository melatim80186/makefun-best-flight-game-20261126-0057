// Skylark Archipelago — the renderer: sky, sea, terrain, strips, rings, aircraft.
// One job: turn the world and the plane into one readable picture, every frame.

import { CAMERA, PALETTE } from './config.js';
import { heightAt, RUNWAYS, CLOUDS, STORMS } from './world.js';
import { clamp, lerp, lerpColor, rgb, hexToRgb } from './random.js';

// A stable world-space hash for per-quad colour jitter (grid indices would
// shimmer as the camera-aligned grid slides under the plane).
function hash2(wx, wz) {
  const ix = Math.floor(wx / 46);
  const iz = Math.floor(wz / 46);
  let h = (ix * 374761393 + iz * 668265263 + 0x5f3a * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const SEA = hexToRgb(PALETTE.seaDeep);
const SEA_SHALLOW = hexToRgb(PALETTE.seaShallow);
const SAND = hexToRgb(PALETTE.sand);
const GRASS = hexToRgb(PALETTE.grass);
const FOREST = hexToRgb(PALETTE.forest);
const ROCK = hexToRgb(PALETTE.rock);
const SNOW = hexToRgb(PALETTE.snow);
const SKY_TOP = hexToRgb(PALETTE.skyTop);
const SKY_HORIZON = hexToRgb(PALETTE.skyHorizon);

// Camera basis from the plane: chase position, look direction, roll.
function cameraBasis(plane) {
  const fx = Math.sin(plane.heading);
  const fz = -Math.cos(plane.heading);
  const camX = plane.x - fx * CAMERA.distance;
  const camZ = plane.z - fz * CAMERA.distance;
  const camY = plane.y + CAMERA.height;
  const pitch = plane.pitch * CAMERA.pitchFollow;
  const roll = plane.bank * CAMERA.rollFollow;
  return { x: camX, y: camY, z: camZ, heading: plane.heading, pitch, roll };
}

// Project a world point to screen space. Returns null behind the camera.
function makeProjector(ctx, cam) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const f = (H / 2) / Math.tan(CAMERA.fov / 2);
  const ch = Math.cos(cam.heading);
  const sh = Math.sin(cam.heading);
  const cp = Math.cos(cam.pitch);
  const sp = Math.sin(cam.pitch);
  const cr = Math.cos(cam.roll);
  const sr = Math.sin(cam.roll);
  return function project(x, y, z) {
    // Translate to the camera, then yaw (heading), pitch, roll.
    let dx = x - cam.x;
    let dy = y - cam.y;
    let dz = z - cam.z;
    // Yaw: camera right is (cos h, 0, sin h), forward is (sin h, 0, -cos h).
    let tx = dx * ch + dz * sh;
    let tz = dx * sh - dz * ch;
    let ty = dy;
    // Pitch around the camera's right axis (tx).
    const py = ty * cp - tz * sp;
    const pz = ty * sp + tz * cp;
    ty = py; tz = pz;
    // Roll around the view axis (tz).
    const rx = tx * cr - ty * sr;
    const ry = tx * sr + ty * cr;
    tx = rx; ty = ry;
    // Camera looks down -z in its own space after the yaw above; forward is +tz
    // for a heading of 0 (north, -z world) — so depth is tz, and we flip y.
    if (tz < 2) return null;
    const s = f / tz;
    return { x: W / 2 + tx * s, y: H / 2 - ty * s, s, d: tz };
  };
}

function terrainColor(h, dist) {
  let c;
  if (h < 3) c = SAND;
  else if (h < 55) c = lerpColor(SAND, GRASS, clamp((h - 3) / 25, 0, 1));
  else if (h < 105) c = lerpColor(GRASS, FOREST, clamp((h - 55) / 50, 0, 1));
  else if (h < 160) c = lerpColor(FOREST, ROCK, clamp((h - 105) / 55, 0, 1));
  else c = lerpColor(ROCK, SNOW, clamp((h - 160) / 45, 0, 1));
  // Distance haze: far ground melts into the horizon colour.
  const haze = clamp((dist - 500) / 1600, 0, 0.72);
  return lerpColor(c, SKY_HORIZON, haze);
}

function drawSky(ctx, cam, time) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const horizonY = H / 2 + Math.tan(cam.pitch) * (H / 2) / Math.tan(CAMERA.fov / 2);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, PALETTE.skyTop);
  g.addColorStop(clamp(horizonY / H, 0.15, 0.85), PALETTE.skyMid);
  g.addColorStop(1, PALETTE.skyHorizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Low golden sun, fixed in the west so the light is consistent.
  const sunX = W * 0.2 + Math.sin(time * 0.02) * 6;
  const sunY = horizonY - H * 0.16;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, H * 0.22);
  glow.addColorStop(0, PALETTE.sunGlow);
  glow.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = PALETTE.sunCore;
  ctx.beginPath();
  ctx.arc(sunX, sunY, Math.max(14, H * 0.028), 0, Math.PI * 2);
  ctx.fill();
  return horizonY;
}

function drawSea(ctx, horizonY, cam, time) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  if (horizonY >= H) return;
  const g = ctx.createLinearGradient(0, Math.max(0, horizonY), 0, H);
  g.addColorStop(0, PALETTE.seaShallow);
  g.addColorStop(1, PALETTE.seaDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.max(0, horizonY), W, H - Math.max(0, horizonY));
  // Sun glitter: a shimmering path under the sun.
  ctx.fillStyle = PALETTE.seaGlitter;
  const sunX = W * 0.2;
  for (let i = 0; i < 26; i++) {
    const y = horizonY + 8 + ((i * 37 + time * 12) % Math.max(20, H - horizonY - 10));
    const w = 12 + (i % 5) * 9;
    const x = sunX + Math.sin(i * 2.7 + time * 0.6) * (20 + i * 3);
    ctx.globalAlpha = 0.10 + (i % 3) * 0.05;
    ctx.fillRect(x - w / 2, y, w, 2);
  }
  ctx.globalAlpha = 1;
}

function drawTerrain(ctx, project, cam) {
  // A camera-aligned grid sampled ahead of the plane: near rows dense, far rows sparse.
  const rows = 26;
  const cols = 34;
  const maxDist = 1500;
  const halfWidth = 1.15; // lateral spread as a fraction of distance
  // Row distances grow geometrically so the near ground is detailed.
  const dists = [];
  for (let i = 0; i <= rows; i++) dists.push(26 * Math.pow(maxDist / 26, i / rows));
  const fx = Math.sin(cam.heading);
  const fz = -Math.cos(cam.heading);
  const rx = Math.cos(cam.heading); // camera right = (cos h, 0, sin h)... check: right = forward x up
  const rz = Math.sin(cam.heading);
  // Grid of projected points, far row first so near quads paint over far ones.
  const grid = [];
  for (let i = 0; i <= rows; i++) {
    const d = dists[i];
    const rowPts = [];
    for (let j = 0; j <= cols; j++) {
      const lat = (j / cols - 0.5) * 2 * halfWidth * d;
      const wx = cam.x + fx * d + rx * lat;
      const wz = cam.z + fz * d + rz * lat;
      const h = heightAt(wx, wz);
      rowPts.push({ p: project(wx, Math.max(h, 0.4), wz), h, d, wx, wz });
    }
    grid.push(rowPts);
  }
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = 0; j < cols; j++) {
      const a = grid[i][j];
      const b = grid[i][j + 1];
      const c = grid[i + 1][j + 1];
      const d = grid[i + 1][j];
      if (!a.p || !b.p || !c.p || !d.p) continue;
      const hAvg = (a.h + b.h + c.h + d.h) / 4;
      const distAvg = (a.d + b.d + c.d + d.d) / 4;
      if (hAvg <= 0.4) continue; // sea is drawn as the sea plane
      // Slope shading (sun from the west: ground rising toward the camera
      // catches the light) plus a whisper of per-quad variation so the grid
      // reads as terrain, not floor tiles.
      const slope = (a.h + b.h - c.h - d.h) / 4;
      const cx = (a.wx + b.wx + c.wx + d.wx) / 4;
      const cz = (a.wz + b.wz + c.wz + d.wz) / 4;
      const shade = clamp(1 + slope * 0.012 + (hash2(cx, cz) - 0.5) * 0.09, 0.78, 1.12);
      const base = terrainColor(hAvg, distAvg);
      ctx.fillStyle = rgb(base.map((v) => Math.round(v * shade)));
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y);
      ctx.lineTo(b.p.x, b.p.y);
      ctx.lineTo(c.p.x, c.p.y);
      ctx.lineTo(d.p.x, d.p.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRunway(ctx, project, cam) {
  for (const rw of RUNWAYS) {
    const sh = Math.sin(rw.heading);
    const ch = Math.cos(rw.heading);
    const hl = rw.length / 2;
    const hw = rw.width / 2;
    const corner = (along, across) => {
      // World offset = strip-axis * along + right * across.
      const dx = sh * along + ch * across;
      const dz = -ch * along + sh * across;
      return project(rw.x + dx, rw.elev + 0.4, rw.z + dz);
    };
    const p1 = corner(-hl, -hw);
    const p2 = corner(hl, -hw);
    const p3 = corner(hl, hw);
    const p4 = corner(-hl, hw);
    if (!p1 || !p2 || !p3 || !p4) continue;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
    ctx.closePath(); ctx.fill();
    // Centreline dashes.
    ctx.fillStyle = PALETTE.runwayLine;
    for (let a = -hl + 30; a < hl - 20; a += 42) {
      const q1 = corner(a, -1.2);
      const q2 = corner(a + 22, -1.2);
      const q3 = corner(a + 22, 1.2);
      const q4 = corner(a, 1.2);
      if (!q1 || !q2 || !q3 || !q4) continue;
      ctx.beginPath();
      ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.lineTo(q4.x, q4.y);
      ctx.closePath(); ctx.fill();
    }
    // Threshold bars at both ends.
    for (const end of [-hl + 8, hl - 8]) {
      for (let off = -hw + 5; off < hw - 4; off += 8) {
        const q1 = corner(end - 6, off);
        const q2 = corner(end + 6, off);
        const q3 = corner(end + 6, off + 4);
        const q4 = corner(end - 6, off + 4);
        if (!q1 || !q2 || !q3 || !q4) continue;
        ctx.beginPath();
        ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.lineTo(q4.x, q4.y);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

function drawRings(ctx, project, state) {
  const rings = state.mission.rings;
  const target = state.mission.rings.find((r) => !r.passed);
  for (const r of rings) {
    const centre = project(r.x, r.y, r.z);
    if (!centre) continue;
    const edge = project(r.x + r.r, r.y, r.z) || project(r.x, r.y + r.r, r.z);
    if (!edge) continue;
    const rad = Math.abs(edge.x - centre.x) || Math.abs(edge.y - centre.y);
    if (rad < 2) continue;
    const isNext = r === target;
    ctx.save();
    ctx.globalAlpha = r.passed ? 0.25 : 1;
    ctx.strokeStyle = isNext ? PALETTE.ringNext : PALETTE.ringGold;
    ctx.lineWidth = Math.max(2, rad * 0.09);
    ctx.shadowColor = PALETTE.ringGlow;
    ctx.shadowBlur = isNext ? 18 : 8;
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, rad, rad * 0.94, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = r.passed ? 0.06 : 0.14;
    ctx.fillStyle = PALETTE.ringGold;
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, rad, rad * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawClouds(ctx, project, cam, time) {
  for (const cl of CLOUDS) {
    const x = cl.x + time * cl.drift;
    const p = project(x, cl.y, cl.z);
    if (!p) continue;
    const rad = Math.max(4, cl.r * p.s * 0.55);
    if (rad < 3) continue;
    ctx.fillStyle = 'rgba(255, 252, 246, 0.75)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rad, rad * 0.36, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - rad * 0.5, p.y + rad * 0.08, rad * 0.6, rad * 0.28, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + rad * 0.5, p.y + rad * 0.08, rad * 0.6, rad * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const st of STORMS) {
    const p = project(st.x, st.y, st.z);
    if (!p) continue;
    const rad = Math.max(6, st.r * p.s * 0.6);
    ctx.fillStyle = 'rgba(52, 58, 74, 0.88)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rad, rad * 0.62, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - rad * 0.55, p.y + rad * 0.1, rad * 0.62, rad * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + rad * 0.55, p.y + rad * 0.1, rad * 0.62, rad * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(90, 98, 120, 0.7)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - rad * 0.18, rad * 0.7, rad * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    // Lightning flicker inside the nearest storm.
    if (Math.sin(time * 7 + st.x) > 0.93) {
      ctx.strokeStyle = 'rgba(255, 246, 170, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - 6, p.y + rad * 0.5);
      ctx.lineTo(p.x + 4, p.y + rad * 0.8);
      ctx.lineTo(p.x - 2, p.y + rad * 1.15);
      ctx.stroke();
    }
  }
}

// The aircraft, seen from behind and slightly above: a red-and-cream bush plane
// with its wings spread, tail at the bottom of the frame, nose pointing away.
function drawPlane(ctx, plane) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const cx = W / 2;
  const cy = H * 0.60;
  const S = Math.min(W, H) / 520; // scale so the plane reads at 1280x720 and at 800x450
  ctx.save();
  ctx.translate(cx, cy);
  // Canvas rotate() is clockwise for positive angles: banking right (bank > 0)
  // drops the right wing. The camera already rolls with the plane by
  // CAMERA.rollFollow, so the sprite only needs the remainder (bank - roll),
  // or the plane looks banked 1.5x against its own horizon.
  ctx.rotate(plane.bank * (1 - CAMERA.rollFollow));
  ctx.scale(S, S);
  // Propeller blur at the far (nose) end.
  ctx.fillStyle = 'rgba(220, 228, 235, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, -118, 26, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Main wings.
  ctx.fillStyle = '#b8322a';
  ctx.beginPath();
  ctx.moveTo(-128, -58); ctx.lineTo(128, -58); ctx.lineTo(118, -34); ctx.lineTo(-118, -34);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8e2d4';
  ctx.beginPath();
  ctx.moveTo(-128, -58); ctx.lineTo(-96, -58); ctx.lineTo(-92, -34); ctx.lineTo(-118, -34);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(96, -58); ctx.lineTo(128, -58); ctx.lineTo(118, -34); ctx.lineTo(92, -34);
  ctx.closePath(); ctx.fill();
  // Fuselage: cream, tapering to the nose.
  ctx.fillStyle = '#f3ede0';
  ctx.beginPath();
  ctx.moveTo(-16, -128); ctx.quadraticCurveTo(-20, -40, -13, 52);
  ctx.lineTo(13, 52); ctx.quadraticCurveTo(20, -40, 16, -128);
  ctx.quadraticCurveTo(0, -138, -16, -128);
  ctx.closePath(); ctx.fill();
  // Red cheatline along the fuselage.
  ctx.fillStyle = '#b8322a';
  ctx.fillRect(-14, -30, 28, 7);
  // Cockpit windows, lit warm from inside.
  ctx.fillStyle = '#ffd98a';
  ctx.beginPath();
  ctx.moveTo(-11, -96); ctx.lineTo(11, -96); ctx.lineTo(9, -76); ctx.lineTo(-9, -76);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2c4a6b';
  ctx.fillRect(-11, -96, 22, 4);
  // Tailplane and fin.
  ctx.fillStyle = '#b8322a';
  ctx.beginPath();
  ctx.moveTo(-52, 44); ctx.lineTo(52, 44); ctx.lineTo(44, 60); ctx.lineTo(-44, 60);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-4, 40); ctx.lineTo(4, 40); ctx.lineTo(10, 74); ctx.lineTo(-10, 74);
  ctx.closePath(); ctx.fill();
  // Navigation lights: green left, red right, white tail.
  ctx.fillStyle = '#39ff88';
  ctx.beginPath(); ctx.arc(-126, -46, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff4040';
  ctx.beginPath(); ctx.arc(126, -46, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(0, 76, 3.5, 0, Math.PI * 2); ctx.fill();
  // Registration on the tail.
  ctx.fillStyle = '#f3ede0';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PK-SKY', 0, 58);
  ctx.restore();
}

export function renderScene(ctx, plane, state, time) {
  const cam = cameraBasis(plane);
  const project = makeProjector(ctx, cam);
  const horizonY = drawSky(ctx, cam, time);
  drawSea(ctx, horizonY, cam, time);
  drawTerrain(ctx, project, cam);
  drawRunway(ctx, project, cam);
  drawClouds(ctx, project, cam, time);
  drawRings(ctx, project, state);
  drawPlane(ctx, plane);
}
