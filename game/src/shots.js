// Canyon Courier — deterministic shots + the autopilot. One job: the exact frame each
// screenshot shows, and a pilot good enough to fly a whole sortie for playtest and soak.
// The autopilot steers by the same axes a human uses (throttle, pitch, roll, brake, drop),
// so a shot frame is what a real short game looks like, and the same seed always gives the
// same frame. No randomness here beyond the seeded world.
import { clamp, wrapAngle } from './random.js';
import { COURSE, FLIGHT, SORTIE_LENGTH } from './config.js';

// Steer the plane toward `target` (a Vector3) at `cruise` m/s, staying above `minAlt`.
export function autopilotAxes(state, target, opts) {
  const dx = target.x - state.pos.x;
  const dy = target.y - state.pos.y;
  const dz = target.z - state.pos.z;
  // aimAheadZ: steer toward a point past the target so the approach path converges
  // on the centreline early (final approach), while pitch still uses the true distance.
  const dzYaw = opts.aimAheadZ ? dz - opts.aimAheadZ : dz;
  const yawTo = Math.atan2(-dx, -dzYaw);
  const yawErr = wrapAngle(yawTo - state.yaw);
  const groundY = opts.groundY;
  const minAlt = groundY + (opts.minClearance ?? 16);
  // Pitch: climb toward the target, but never below the clearance floor.
  let pitchWant = clamp(dy * 0.02, -0.35, 0.4);
  if (state.pos.y < minAlt) pitchWant = Math.max(pitchWant, 0.45);
  if (opts.flare) {
    // Glide slope, referenced to the STRIP altitude (not the local terrain, which
    // rises toward the strip and used to make the plane level off instead of descend).
    // The slope is ONE-SIDED: it uses the signed along-track distance to the strip
    // centre, so once the plane is past the centre the target stays at threshold
    // height instead of rising again and making the plane climb away (seed 2 loop).
    const dist = Math.sqrt(dx * dx + dz * dz);
    const baseY = opts.stripY ?? groundY;
    const along = opts.stripZ !== undefined ? state.pos.z - opts.stripZ : dist;
    const wantAlt = baseY + clamp(Math.max(along, 0) * 0.12, 0.5, 35);
    pitchWant = clamp((wantAlt - state.pos.y) * 0.12, -0.3, 0.3);
  }
  const pitch = clamp(pitchWant / 0.5, -1, 1);
  // Heading with bank damping: the -roll term stops the weave across the centreline.
  const roll = clamp(yawErr * 2.2 - state.roll * 0.5, -1, 1);
  const dist = Math.sqrt(dx * dx + dz * dz);
  // Throttle as a POSITION, not a bang-bang rate: hold the throttle that gives the
  // cruise speed, so the speed stops seesawing (the old rate logic overshot to 53).
  const desiredThrottle = clamp((opts.cruise - FLIGHT.minSpeed) / (FLIGHT.maxThrottleSpeed - FLIGHT.minSpeed), 0, 1);
  let throttle = clamp((desiredThrottle - state.throttle) * 4, -1, 1);
  if (opts.flare && state.speed > 34) throttle = -1;
  const brake = opts.flare && dist < 180 && state.speed > 40;
  return { throttle, pitch, roll, rudder: 0, brake, lookDX: 0, lookDY: 0 };
}

// Where the autopilot aims right now, given the sortie state.
export function autopilotTarget(game) {
  const { course, world } = game;
  if (game.leg === 1) {
    const ring = course.nextRing();
    if (ring) return { target: ring.pos, cruise: 40, minClearance: 22, flare: false };
    return { target: course.pads[0].pos, cruise: 50, minClearance: 22, flare: false };
  }
  if (game.leg === 2) {
    const pad = course.nextPad();
    if (pad) {
      const p = pad.pos.clone();
      p.y = world.heightAt(p.x, p.z) + 55;
      return { target: p, cruise: 36, minClearance: 22, flare: false, pad };
    }
    const strip = course.strip.center.clone();
    strip.y = world.heightAt(strip.x, strip.z) + 45;
    return { target: strip, cruise: 50, minClearance: 22, flare: false };
  }
  // Leg 3: aim at a point 320 m short of the strip, then the strip centre itself.
  // Go-around: past the strip without landing, climb back to a re-entry point
  // 400 m north of the strip and fly the approach again at proper speed.
  const strip = course.strip;
  if (game.state.pos.z < strip.center.z - 100) {
    const reentry = strip.center.clone();
    reentry.z = strip.center.z + 400;
    reentry.y = world.heightAt(reentry.x, reentry.z) + 60;
    return { target: reentry, cruise: 40, minClearance: 22, flare: false };
  }
  const dz = game.state.pos.z - (strip.center.z + 320);
  if (dz > 0 && game.state.pos.z > strip.center.z + 40) {
    const gate = strip.center.clone();
    gate.z = strip.center.z + 320;
    gate.y = world.heightAt(gate.x, gate.z) + 35;
    return { target: gate, cruise: 40, minClearance: 14, flare: false };
  }
  const touch = strip.center.clone();
  touch.y = world.heightAt(touch.x, touch.z) + 4;
  return { target: touch, cruise: 30, minClearance: 2, flare: true, aimAheadZ: 150 };
}

// One autopilot step: pick the target, steer, and drop cargo over a pad when lined up.
export function autopilotStep(game) {
  const aim = autopilotTarget(game);
  const groundY = game.world.heightAt(game.state.pos.x, game.state.pos.z);
  // Wall avoidance: never chase a target so far off the valley line that the canyon
  // walls can catch the plane — steer back to the centre line at a FIXED safe height
  // (never "25 m above where I am now", which climbs forever). NEVER on final
  // approach (leg 3): the flare owns the plane there, and this override once
  // hijacked a landing, ordered cruise 50 + a climb, and flew it out of bounds.
  const cx = game.world.valleyCenterX(game.state.pos.z);
  if (game.leg !== 3 && Math.abs(game.state.pos.x - cx) > 48) {
    aim.target = { x: cx, y: groundY + 40, z: game.state.pos.z - 120 };
    aim.cruise = 40;
  }
  // Wind correction: aim upwind of the target by the drift over the transit time,
  // so a crosswind stops pushing the approach off the centreline.
  const wind = game.thermalWind.windAt(game.state.pos, game.thermalWind.time, game.elapsed, SORTIE_LENGTH);
  const toTarget = Math.hypot(aim.target.x - game.state.pos.x, aim.target.z - game.state.pos.z);
  const transit = toTarget / Math.max(game.state.speed, 15);
  const aimTarget = {
    x: aim.target.x - clamp(wind.x * transit, -60, 60),
    y: aim.target.y,
    z: aim.target.z - clamp(wind.z * transit, -60, 60),
  };
  const axes = autopilotAxes(game.state, aimTarget, {
    cruise: aim.cruise, minClearance: aim.minClearance, flare: aim.flare, groundY,
    aimAheadZ: aim.aimAheadZ, stripY: game.course.strip.center.y, stripZ: game.course.strip.center.z,
  });
  let drop = false;
  if (game.leg === 2 && aim.pad) {
    const dx = game.state.pos.x - aim.pad.pos.x;
    const dz = game.state.pos.z - aim.pad.pos.z;
    if (Math.hypot(dx, dz) < 25) drop = true;
  }
  return { axes, drop };
}

// Stage one of the four deterministic screenshot scenes. `game` is the object main.js builds:
// { state, world, course, thermalWind, setView, setWeather, stepOnce, reset, beginLeg }.
// After staging, the caller paints twice and sets window.__shotReady.
export function stageShot(name, game) {
  game.reset('bush');
  // beginPlay FIRST: its reset() applies the default weather, and setWeather after
  // it is what sticks (the old order set the weather and then reset wiped it —
  // the "storm" shot shipped a clear sky because of this).
  if (name === 'start') {
    game.beginPlay();
    game.setWeather(0);
    game.setView('cockpit');
    if (game.hud) game.hud.clearBanner(); // cover: no banner over the cockpit
    // Cover: hide the whole bottom mission card — it overlaps the cockpit dials.
    const bottom = document.getElementById('hud-bottom');
    if (bottom) bottom.style.display = 'none';
    // Idle on the runway with the engine warm: instruments lit, ring 1 ahead in the HUD.
    game.state.throttle = 0.35;
    for (let i = 0; i < 30; i += 1) game.stepOnce({ throttle: 0, pitch: 0, roll: 0, rudder: 0, brake: true, lookDX: 0, lookDY: 0 });
    game.state.throttle = 0.35;
    game.state.speed = 0;
    return { screen: 'title-hidden' };
  }
  if (name === 'storm') {
    game.beginPlay();
    game.setWeather(2);
    game.setView('chase');
    // v2 framing: pull the chase camera back (22 m / 6.5 m) and fly PAST ring 12
    // (z -1480) before freezing the frame — v1 froze the plane right at the
    // ring plane, so the 40 m torus filled the whole frame. Also clear the leg
    // banner (it covered the plane) and force one lightning flash at capture.
    game.setChaseDistance(22, 6.5);
    if (game.hud) game.hud.clearBanner();
    flyUntil(game, () => game.elapsed > 52 || game.leg > 1, 60 * 80);
    flyUntil(game, () => game.state.pos.z < -1560 || game.leg > 2, 60 * 40);
    // Clear the banner AFTER flying: the leg 1→2 transition fires a banner
    // mid-flight, after the pre-flight clear — v2's first storm render still
    // had it plastered across the plane.
    if (game.hud) game.hud.clearBanner();
    if (game.setForceFlash && game.stormTime) game.setForceFlash(game.stormTime() + 2);
    return { screen: 'play' };
  }
  if (name === 'landing') {
    game.beginPlay();
    game.setWeather(0);
    game.setView('chase');
    flyUntil(game, () => game.leg === 3 && game.state.pos.z < game.course.strip.center.z + 260, 60 * 240);
    return { screen: 'play' };
  }
  // Default: 'rings' — chase view punching through a ring, HUD full.
  game.beginPlay();
  game.setWeather(0);
  game.setView('chase');
  flyUntil(game, () => game.course.nextRingIndex() >= 4, 60 * 90);
  return { screen: 'play' };
}

// Fly the autopilot forward until `stop()` is true or `maxSteps` runs out.
export function flyUntil(game, stop, maxSteps) {
  for (let i = 0; i < maxSteps; i += 1) {
    if (stop()) break;
    if (game.phase !== 'play') break;
    const { axes, drop } = autopilotStep(game);
    game.stepOnce(axes, drop);
  }
}
