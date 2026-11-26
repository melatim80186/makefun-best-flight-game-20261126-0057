// Skylark Archipelago — the flight model.
// One job: move the aircraft, burn fuel, take damage, land and crash.

import { PLANE } from './config.js';
import { heightAt, runwayAt, cloudAt } from './world.js';
import { clamp } from './random.js';

export function makePlane() {
  return {
    x: 0, y: 15.6, z: 1290, // parked at the south end of Merpati Field, facing north
    heading: 0, pitch: 0, bank: 0,
    speed: 0, throttle: 0,
    fuel: PLANE.fuelCapacity, damage: 0,
    gearDown: true, onGround: true,
    crashed: false, crashReason: '',
    landed: false, airTime: 0,
    verticalSpeed: 0,
    inStorm: false,
  };
}

// input: {pitch: -1..1 (up positive), bank: -1..1 (right positive),
//         throttleUp, throttleDown, gear}
export function stepPlane(p, input, dt) {
  if (p.crashed) return [];
  const events = [];
  const wasOnGround = p.onGround;

  // Throttle lever.
  if (input.throttleUp) p.throttle = clamp(p.throttle + dt * 0.55, 0, 1);
  if (input.throttleDown) p.throttle = clamp(p.throttle - dt * 0.55, 0, 1);
  if (p.fuel <= 0) p.throttle = 0;

  // Gear toggle is handled by the caller through input.gearToggle.
  if (input.gearToggle) {
    p.gearDown = !p.gearDown;
    input.gearToggle = false;
    events.push({ type: p.gearDown ? 'gear-down' : 'gear-up' });
  }

  // Speed chases the throttle's target speed. Cutting power does not stop the
  // plane in two seconds: idle drag is gentle, about a third of full thrust.
  const targetSpeed = p.throttle * PLANE.maxSpeed;
  const accel = p.throttle > 0.02 ? PLANE.accel : PLANE.accel * 0.4;
  p.speed += clamp(targetSpeed - p.speed, -accel * dt, accel * dt);
  if (p.speed < 0) p.speed = 0;

  // Attitude follows the stick, with limits.
  const pitchCmd = input.pitch * PLANE.maxPitch;
  const bankCmd = input.bank * PLANE.maxBank;
  p.pitch += clamp(pitchCmd - p.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);
  p.bank += clamp(bankCmd - p.bank, -PLANE.bankRate * dt, PLANE.bankRate * dt);

  // A banked wing turns the nose; faster flight turns slower per metre.
  const turnAuthority = clamp(p.speed / PLANE.cruiseSpeed, 0.25, 1.4);
  p.heading += Math.sin(p.bank) * PLANE.turnRate * turnAuthority * dt;

  // Climb and sink: pitch trades speed for height; a stalled wing just sinks.
  const stalled = p.speed < PLANE.stallSpeed && !p.onGround;
  let vs = Math.sin(p.pitch) * p.speed * PLANE.climbFactor;
  if (stalled) vs -= PLANE.sinkStall * (1 - p.speed / PLANE.stallSpeed);
  if (stalled && !p.stallWarned) {
    p.stallWarned = true;
    events.push({ type: 'stall' });
  }
  if (!stalled) p.stallWarned = false;
  p.verticalSpeed = vs;

  // Storm cells shake the airframe and chew the airframe.
  const storm = cloudAt(p.x, p.y, p.z);
  p.inStorm = !!storm;
  if (storm) {
    p.damage += PLANE.damageStorm * dt;
    p.pitch += (Math.random() - 0.5) * 0.06;
    p.bank += (Math.random() - 0.5) * 0.09;
    if (p.damage >= 100) {
      p.crashed = true;
      p.crashReason = 'Airframe broke up in the storm';
      events.push({ type: 'crash', reason: p.crashReason });
      return events;
    }
  }

  // Move along the nose.
  const fx = Math.sin(p.heading);
  const fz = -Math.cos(p.heading);
  p.x += fx * p.speed * Math.cos(p.pitch) * dt;
  p.z += fz * p.speed * Math.cos(p.pitch) * dt;
  p.y += vs * dt;

  if (!p.onGround) p.airTime += dt;

  // Ground contact. A landing only counts when the plane was airborne:
  // rolling along the strip must not re-fire it (and must not reset pitch,
  // or the pilot could never rotate for takeoff).
  const ground = Math.max(heightAt(p.x, p.z), 0);
  const strip = runwayAt(p.x, p.z);
  if (p.y <= ground + 1.6) {
    if (!wasOnGround && strip && p.gearDown && Math.abs(p.pitch) < 0.3 && p.speed <= PLANE.landingMaxSpeed && vs >= -PLANE.landingMaxSink) {
      // A landing: wheels on the strip, gentle enough to count.
      p.y = strip.elev + 1.6;
      p.onGround = true;
      p.pitch = 0;
      p.bank = 0;
      const smooth = vs >= -3;
      events.push({ type: 'landed', runway: strip, smooth, speed: p.speed });
      p.landed = true;
    } else if (p.onGround) {
      p.y = ground + 1.6;
    } else {
      p.crashed = true;
      p.y = ground + 1.6;
      p.crashReason = strip
        ? (p.speed > PLANE.landingMaxSpeed ? 'Came in too fast for the strip' : 'Hit the runway hard')
        : (ground <= 0.5 ? 'Ditched in the sea' : 'Flew into the terrain');
      events.push({ type: 'crash', reason: p.crashReason });
      return events;
    }
  }

  // Rolling on the ground: resistance is a force, not a snap to zero — a snap
  // smaller than one frame's acceleration pins the plane forever (found in
  // playtest: speed stuck at 0 with full throttle). Brakes bite at idle.
  if (p.onGround) {
    if (p.speed > PLANE.takeoffSpeed && p.pitch > 0.04) {
      p.onGround = false;
      p.y += 0.5;
      events.push({ type: 'takeoff' });
    } else {
      const rolling = p.throttle < 0.05 ? 9 : 3.5;
      p.speed = Math.max(0, p.speed - rolling * dt);
    }
  }

  // Fuel burn: thirsty at full throttle, sipping at idle.
  const burn = PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * p.throttle;
  p.fuel = Math.max(0, p.fuel - burn * dt);
  if (p.fuel <= 0 && !p.fuelWarned) {
    p.fuelWarned = true;
    events.push({ type: 'fuel-empty' });
  }

  // Flying far from the islands is just open sea; turn the pilot back.
  const dist = Math.hypot(p.x, p.z);
  if (dist > 3400 && !p.edgeWarned) {
    p.edgeWarned = true;
    events.push({ type: 'edge' });
  }
  if (dist < 3200) p.edgeWarned = false;

  return events;
}

export function resetPlane(p, spot) {
  const fresh = makePlane();
  Object.assign(p, fresh, spot || {});
}
