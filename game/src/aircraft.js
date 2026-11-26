// Canyon Courier — the aircraft. One job: a bush plane that looks built, plus arcade flight physics.
// Model: fuselage, nose + spinner, spinning propeller, high wings with struts, tail, fixed gear,
// nav lights and a glass canopy — all primitives, no external assets.
// Physics: throttle sets target speed, bank turns the nose, pitch climbs and dives, speed below
// stall sinks the plane; wind and thermals arrive through `env` each step.
import * as THREE from 'three';
import { clamp, wrapAngle } from './random.js';
import { FLIGHT, AIRCRAFT } from './config.js';

export function createFlightState(startPos, variantKey = 'bush') {
  return {
    variant: variantKey,
    pos: startPos.clone(),
    yaw: 0, // 0 faces -Z (down the canyon, toward the rings)
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    damage: 0,
    vspeed: 0,
    airborne: false,
    prevY: startPos.y,
    propAngle: 0,
  };
}

export function buildAircraftMesh(variantKey) {
  const spec = AIRCRAFT[variantKey];
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.45, metalness: 0.25 });
  const trim = new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.32 });
  const aluminium = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.7 });

  // Fuselage: a tapered body — cylinder + nose cone + tail cone.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.55, 5.6, 10), paint);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.4, 10), trim);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -3.4;
  group.add(nose);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.55, 1.8, 8), paint);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 3.6;
  group.add(tail);
  // Canopy: glass bubble on top, plus a dark instrument coaming.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.75, 1.5);
  canopy.position.set(0, 0.55, -0.9);
  group.add(canopy);
  // High wing: one long slab + struts down to the fuselage.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.18, 1.9), paint);
  wing.position.set(0, 0.85, -0.4);
  group.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 1.9), trim);
  wingTipL.position.set(-5.75, 0.85, -0.4);
  group.add(wingTipL);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 5.75;
  group.add(wingTipR);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6), aluminium);
    strut.position.set(side * 2.2, 0.25, -0.4);
    strut.rotation.z = side * 0.5;
    group.add(strut);
  }
  // Tail: horizontal stabiliser + vertical fin with a trim stripe.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.1), trim);
  stab.position.set(0, 0.25, 4.1);
  group.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.3), paint);
  fin.position.set(0, 0.85, 4.2);
  group.add(fin);
  // Propeller: spinner cone + two THIN, TRANSLUCENT blades on a hub that spins
  // around Z (forward axis). v1's opaque 0.28 m black blades read as a render
  // glitch bar across the cockpit cover shot; translucent blades + a faint blur
  // disc read as a spinning prop instead. Blades never cast shadows.
  const prop = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 10), aluminium);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -4.35;
  prop.add(spinner);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0x2a2c33, roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false,
  });
  const blades = [];
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.06), bladeMat);
    blade.position.z = -4.1;
    const holder = new THREE.Group();
    holder.rotation.z = angle;
    holder.add(blade);
    blades.push(blade);
    prop.add(holder);
  }
  const blurDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 28),
    new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }),
  );
  blurDisc.position.z = -4.12;
  prop.add(blurDisc);
  prop.position.z = 0;
  group.add(prop);
  // Fixed gear: two wheels + tail wheel.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), aluminium);
    leg.position.set(side * 0.9, -0.9, -1.2);
    leg.rotation.z = side * 0.25;
    group.add(leg);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.18, 8, 14), dark);
    wheel.position.set(side * 1.05, -1.35, -1.2);
    wheel.rotation.y = Math.PI / 2;
    group.add(wheel);
  }
  // Nav lights: red left, green right, white tail — emissive so they read at golden hour.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  navL.position.set(-5.9, 0.85, -0.4);
  group.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x22ff66 }));
  navR.position.set(5.9, 0.85, -0.4);
  group.add(navR);
  const navT = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  navT.position.set(0, 0.3, 4.6);
  group.add(navT);
  // v2 shadows: the airframe casts (the prop does not — translucent blades
  // would throw a solid bar shadow). Terrain and trees receive (see world.js).
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  prop.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group, prop, blades };
}

// One fixed step of arcade flight. `axes` comes from input.js; `env` carries wind (Vector3),
// thermalLift (m/s), turbulence (0..1) and the terrain height function.
export function stepFlight(state, axes, dt, env) {
  const spec = AIRCRAFT[state.variant];
  const handling = spec.handling;
  // Throttle: W/S move it, clamped; fuel empty forces idle.
  state.throttle = clamp(state.throttle + axes.throttle * dt * 0.55, 0, 1);
  if (state.fuel <= 0) state.throttle = 0;
  // Speed chases the throttle target; air brake cuts the target.
  let target = FLIGHT.minSpeed + state.throttle * (FLIGHT.maxThrottleSpeed - FLIGHT.minSpeed + spec.speedBonus);
  if (axes.brake) target *= FLIGHT.brakeFactor;
  const rate = target > state.speed ? FLIGHT.accel : FLIGHT.accel * 1.6;
  state.speed += clamp(target - state.speed, -rate * dt, rate * dt);
  // Roll and pitch chase the stick, then the wings level themselves.
  const rollTarget = axes.roll * FLIGHT.maxRoll;
  const pitchTarget = axes.pitch * FLIGHT.maxPitch;
  state.roll += clamp(rollTarget - state.roll, -FLIGHT.rollRate * handling * dt, FLIGHT.rollRate * handling * dt);
  state.pitch += clamp(pitchTarget - state.pitch, -FLIGHT.pitchRate * handling * dt, FLIGHT.pitchRate * handling * dt);
  if (axes.roll === 0) {
    const toZero = clamp(-state.roll, -FLIGHT.levelRate * dt, FLIGHT.levelRate * dt);
    state.roll += toZero;
  }
  if (axes.pitch === 0) {
    const toZero = clamp(-state.pitch, -FLIGHT.levelRate * 0.6 * dt, FLIGHT.levelRate * 0.6 * dt);
    state.pitch += toZero;
  }
  // Bank turns the nose; rudder trims it. Positive roll (left bank) turns left:
  // yaw grows, and forward = (-sin yaw, ..., -cos yaw) swings toward -x.
  const turnRate = (9.8 * Math.tan(state.roll)) / Math.max(state.speed, 12);
  state.yaw += turnRate * dt;
  state.yaw += axes.rudder * 0.35 * dt;
  state.yaw = wrapAngle(state.yaw);
  // Turbulence shakes the wings a little; thermals lift the whole plane.
  if (env.turbulence > 0) {
    state.roll += (env.turbulence * 0.35 * Math.sin(env.time * 7.3)) * dt;
    state.pitch += (env.turbulence * 0.2 * Math.sin(env.time * 9.1 + 2)) * dt;
  }
  // Move along the nose, plus wind drift, plus thermal lift; stall sinks the plane.
  const cp = Math.cos(state.pitch);
  const fx = -Math.sin(state.yaw) * cp;
  const fy = Math.sin(state.pitch);
  const fz = -Math.cos(state.yaw) * cp;
  state.prevY = state.pos.y;
  state.pos.x += (fx * state.speed + env.wind.x) * dt;
  state.pos.y += (fy * state.speed + env.wind.y + env.thermalLift) * dt;
  state.pos.z += (fz * state.speed + env.wind.z) * dt;
  if (state.speed < FLIGHT.stallSpeed && state.pos.y > env.groundY + 2) {
    state.pos.y -= (FLIGHT.stallSpeed - state.speed) * 0.35 * dt;
  }
  state.vspeed = (state.pos.y - state.prevY) / dt;
  state.airborne = state.pos.y > env.groundY + 2.5;
  state.propAngle += (4 + state.throttle * 26) * dt;
}

// Sync the built mesh to the flight state (roll about the nose axis, pitch, yaw).
export function syncAircraftMesh(mesh, state) {
  mesh.group.position.copy(state.pos);
  mesh.group.rotation.set(0, 0, 0);
  mesh.group.rotateY(state.yaw);
  mesh.group.rotateX(-state.pitch);
  mesh.group.rotateZ(state.roll);
  mesh.prop.rotation.z = state.propAngle;
}
