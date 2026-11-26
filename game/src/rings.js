// Canyon Courier — the course. One job: 12 rings, 3 cargo pads and the landing strip.
// Leg 1 RING RUN: fly the 12 rings in order, scored on centre accuracy + speed.
// Leg 2 CARGO DROP: release 3 supply packs over the marked pads (F), scored on drop accuracy.
// Leg 3 LANDING: put the plane down on the short strip, scored on speed, descent and position.
import * as THREE from 'three';
import { COURSE, SCORE } from './config.js';
import { clamp } from './random.js';

function numberTexture(n) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = '#1a1208';
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffd77a';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#ffd77a';
  ctx.font = 'bold 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 64, 68);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

export function createCourse(rng, world) {
  const rings = [];
  // Ring x wanders as a smooth random walk, so consecutive rings never demand a
  // hairpin: the course is a line a 40 m/s plane can actually fly.
  let walkX = 0;
  for (let i = 0; i < COURSE.ringCount; i += 1) {
    const z = COURSE.firstRingZ - i * COURSE.ringSpacing;
    walkX = clamp(walkX + rng.range(-18, 18), -24, 24);
    const x = world.valleyCenterX(z) + walkX;
    const y = world.heightAt(x, z) + rng.range(38, 60);
    rings.push({ index: i, pos: new THREE.Vector3(x, y, z), radius: COURSE.ringRadius, passed: false, score: 0 });
  }
  const pads = [];
  let padWalkX = 0;
  for (let i = 0; i < COURSE.padCount; i += 1) {
    const z = -1620 - i * 140;
    padWalkX = clamp(padWalkX + rng.range(-14, 14), -18, 18);
    const x = world.valleyCenterX(z) + padWalkX;
    pads.push({
      index: i,
      pos: new THREE.Vector3(x, world.heightAt(x, z), z),
      done: false,
      score: 0,
    });
  }
  const strip = {
    center: new THREE.Vector3(world.stripCenterX, world.stripY, COURSE.stripZ),
    length: COURSE.stripLength,
    width: COURSE.stripWidth,
  };

  let group = null;
  let ringMeshes = [];
  let padMeshes = [];
  let nextRingMarker = null;

  function build(scene) {
    group = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(COURSE.ringRadius, 1.3, 10, 40);
    rings.forEach((ring, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff8c1a, emissive: 0xff6a00, emissiveIntensity: 0.9, roughness: 0.4,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.copy(ring.pos);
      // Face the ring down the course: its plane is perpendicular to the flight direction.
      const next = rings[Math.min(i + 1, rings.length - 1)];
      const dir = new THREE.Vector3().subVectors(next.pos, ring.pos).normalize();
      mesh.lookAt(new THREE.Vector3().copy(ring.pos).add(dir));
      group.add(mesh);
      ringMeshes.push(mesh);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12),
        new THREE.MeshBasicMaterial({ map: numberTexture(i + 1), transparent: true, depthWrite: false }),
      );
      label.position.copy(ring.pos).add(new THREE.Vector3(0, COURSE.ringRadius + 9, 0));
      group.add(label);
    });
    // Pads: orange H-marked circles with a beacon pole.
    pads.forEach((pad) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xff6a00, emissiveIntensity: 0.5, roughness: 0.8 });
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 0.6, 24), mat);
      disc.position.set(pad.pos.x, pad.pos.y + 0.4, pad.pos.z);
      group.add(disc);
      padMeshes.push(disc);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 26, 6),
        new THREE.MeshBasicMaterial({ color: 0xffd77a }),
      );
      pole.position.set(pad.pos.x, pad.pos.y + 13, pad.pos.z);
      group.add(pole);
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(1.1, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5533 }),
      );
      beacon.position.set(pad.pos.x, pad.pos.y + 26, pad.pos.z);
      group.add(beacon);
      pad.beacon = beacon;
    });
    scene.add(group);
  }

  // Ring pass: the plane crosses the ring plane within the radius. Returns the ring score or 0.
  function checkRing(pos, speed, time) {
    for (const ring of rings) {
      if (ring.passed) continue;
      // Only the next ring in order counts — the sortie is a line, not a buffet.
      if (ring.index !== nextRingIndex()) continue;
      const dz = pos.z - ring.pos.z;
      if (Math.abs(dz) > 10) continue;
      const dx = pos.x - ring.pos.x;
      const dy = pos.y - ring.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > ring.radius) continue;
      const accuracy = clamp(1 - dist / ring.radius, 0, 1);
      const score = Math.round(
        SCORE.ringBase + SCORE.ringAccuracy * accuracy + SCORE.ringSpeed * clamp(speed / 80, 0, 1),
      );
      ring.passed = true;
      ring.score = score;
      return { ring, score, accuracy };
    }
    return null;
  }

  // A ring flown past by more than 60 m is missed (0 points) — the sortie goes on
  // to the next ring instead of turning the plane around into the canyon walls.
  function checkMissed(pos) {
    const ring = nextRing();
    if (!ring) return null;
    if (ring.pos.z - pos.z > 60) {
      ring.passed = true;
      ring.score = 0;
      return ring;
    }
    return null;
  }

  function nextRingIndex() {
    for (let i = 0; i < rings.length; i += 1) if (!rings[i].passed) return i;
    return rings.length;
  }

  function nextRing() {
    const i = nextRingIndex();
    return i < rings.length ? rings[i] : null;
  }

  function ringsDone() {
    return nextRingIndex() >= rings.length;
  }

  // Cargo drop: score by horizontal distance from the pad centre at release.
  function dropCargo(pos) {
    for (const pad of pads) {
      if (pad.done) continue;
      const dx = pos.x - pad.pos.x;
      const dz = pos.z - pad.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > 70) continue;
      const accuracy = clamp(1 - dist / 70, 0, 1);
      const score = Math.round(SCORE.cargoBase + SCORE.cargoAccuracy * accuracy);
      pad.done = true;
      pad.score = score;
      return { pad, score, accuracy, dist };
    }
    return { pad: null, score: 0, accuracy: 0, dist: Infinity };
  }

  function nextPad() {
    for (const pad of pads) if (!pad.done) return pad;
    return null;
  }

  function padsDone() {
    return pads.every((p) => p.done);
  }

  // Landing: gentle, slow, on the strip, near its centre. `forgiving` scores a
  // touchdown just off the strip (half points are applied by the caller).
  function scoreLanding(state, forgiving = false) {
    const dx = Math.abs(state.pos.x - strip.center.x);
    const dz = Math.abs(state.pos.z - strip.center.z);
    const onStrip = dx < strip.width / 2 && dz < strip.length / 2;
    if (!onStrip && !forgiving) return { landed: false, score: 0, reason: 'off the strip' };
    const speedScore = clamp(1 - state.speed / 48, 0, 1);
    const sinkScore = clamp(1 - Math.abs(state.vspeed) / 5, 0, 1);
    const centreScore = clamp(1 - dx / (strip.width / 2), 0, 1);
    const score = Math.round(SCORE.landingBase * (0.35 * speedScore + 0.35 * sinkScore + 0.3 * centreScore));
    return { landed: true, score, reason: 'down safe' };
  }

  // Pulse the next ring and dim the passed ones so the course reads at a glance.
  function update(time) {
    ringMeshes.forEach((mesh, i) => {
      const ring = rings[i];
      if (ring.passed) {
        mesh.material.emissive.setHex(0x1a8a3a);
        mesh.material.emissiveIntensity = 0.5;
      } else if (i === nextRingIndex()) {
        const pulse = 0.8 + 0.4 * Math.sin(time * 5);
        mesh.material.emissiveIntensity = pulse;
        mesh.scale.setScalar(1 + 0.03 * Math.sin(time * 5));
      }
    });
    padMeshes.forEach((mesh, i) => {
      mesh.material.emissiveIntensity = pads[i].done ? 0.15 : 0.5 + 0.3 * Math.sin(time * 3 + i);
    });
  }

  function reset() {
    rings.forEach((r) => { r.passed = false; r.score = 0; });
    pads.forEach((p) => { p.done = false; p.score = 0; });
  }

  return {
    rings, pads, strip, build, checkRing, checkMissed, nextRing, nextRingIndex, ringsDone,
    dropCargo, nextPad, padsDone, scoreLanding, update, reset,
  };
}
