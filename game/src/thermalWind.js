// Canyon Courier — ThermalWind. One job: the named weather system the sortie is flown through.
// Three fronts (clear / strong wind / storm) set the base wind, gusts and grade; six thermal
// columns along the course give free lift (and save fuel) to a pilot who flies through them.
// windAt() is what the flight model feels; liftAt() is what the HUD thermal lamp reads.
import * as THREE from 'three';
import { FRONTS, COURSE } from './config.js';
import { clamp, smoothstep } from './random.js';

export function createThermalWind(rng, world) {
  // Thermals sit beside the ring line so a pilot chasing rings can also ride lift.
  const thermals = [];
  for (let i = 0; i < 6; i += 1) {
    const z = -260 - i * 300 + rng.range(-40, 40);
    thermals.push({
      x: world.valleyCenterX(z) + rng.range(-45, 45),
      z,
      radius: rng.range(24, 38),
      strength: rng.range(6, 10),
      phase: rng.range(0, Math.PI * 2),
    });
  }

  let frontIndex = 0;
  let override = -1; // -1 follows the sortie clock; 0..2 pins a front (debug key T, ?weather=)
  let time = 0;

  function frontAt(elapsed, sortieLength) {
    if (override >= 0) return override;
    return clamp(Math.floor((elapsed / sortieLength) * 3), 0, 2);
  }

  function setFront(index) {
    override = index;
    frontIndex = index >= 0 ? index : 0;
  }

  function cycleFront() {
    const next = (frontIndex + 1) % 3;
    setFront(next);
    return next;
  }

  // Wind vector at a point and time: base wind (cross-canyon, veering per front) + gusts.
  function windAt(pos, t, elapsed, sortieLength) {
    frontIndex = frontAt(elapsed, sortieLength);
    const front = FRONTS[frontIndex];
    const dir = 0.7 + frontIndex * 0.35; // veers with each front
    // Gusts breathe around the base wind (never multiply it): storm peaks near 1.75x,
    // clear air barely moves. The old formula multiplied up to 10x — a 190 m/s hurricane.
    // v2: floor 0.75 — a storm that gusts down to 0.25x read as 6 m/s on the HUD
    // while the config said 19 m/s. Wind never drops below 3/4 of the front's base.
    const gust = clamp(1 + (front.gust / 12) * Math.sin(t * 0.9 + pos.z * 0.01) * Math.sin(t * 0.53), 0.75, 1.75);
    return new THREE.Vector3(
      Math.cos(dir) * front.windSpeed * gust,
      0,
      Math.sin(dir) * front.windSpeed * gust * 0.4,
    );
  }

  // Updraft inside a thermal column, fading at its edge and breathing slowly with time.
  function liftAt(pos, t) {
    let lift = 0;
    let inside = null;
    for (const th of thermals) {
      const dx = pos.x - th.x;
      const dz = pos.z - th.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < th.radius) {
        const edge = 1 - smoothstep(th.radius * 0.55, th.radius, d);
        const breathe = 0.85 + 0.15 * Math.sin(t * 0.7 + th.phase);
        lift = Math.max(lift, th.strength * edge * breathe);
        inside = th;
      }
    }
    return { lift, inside };
  }

  function turbulenceAt() {
    return FRONTS[frontIndex].gust / 9;
  }

  function front() {
    return FRONTS[frontIndex];
  }

  function tick(dt) {
    time += dt;
  }

  // Soft round dot texture so rain reads as rain, not square confetti (v2's
  // first storm render showed hard white squares).
  function dotTexture() {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }
  const dotTex = dotTexture();
  let thermalPoints = null;
  let thermalPointsBase = null;
  function buildMeshes(scene) {
    const group = new THREE.Group();
    for (const th of thermals) {
      const geo = new THREE.CylinderGeometry(th.radius * 0.7, th.radius, 90, 18, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd77a, transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const col = new THREE.Mesh(geo, mat);
      col.position.set(th.x, world.heightAt(th.x, th.z) + 45, th.z);
      group.add(col);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(th.radius * 0.32, th.radius * 0.42, 90, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }),
      );
      core.position.set(th.x, world.heightAt(th.x, th.z) + 45, th.z);
      group.add(core);
      const cap = new THREE.Mesh(
        new THREE.CircleGeometry(th.radius * 0.7, 18),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.35, depthWrite: false }),
      );
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(th.x, world.heightAt(th.x, th.z) + 88, th.z);
      group.add(cap);
    }
    // Rising gold motes: 14 per column, positions a pure function of time.
    const per = 14;
    const count = thermals.length * per;
    const pos = new Float32Array(count * 3);
    thermalPointsBase = [];
    for (let c = 0; c < thermals.length; c += 1) {
      for (let k = 0; k < per; k += 1) {
        const a = (k / per) * Math.PI * 2 + c;
        const r = thermals[c].radius * (0.15 + 0.45 * ((k * 37 % 10) / 10));
        thermalPointsBase.push({ cx: thermals[c].x, cz: thermals[c].z, gy: world.heightAt(thermals[c].x, thermals[c].z), ox: Math.cos(a) * r, oz: Math.sin(a) * r, ph: (k / per) + c * 0.13 });
      }
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    thermalPoints = new THREE.Points(pgeo, new THREE.PointsMaterial({
      color: 0xffd77a, size: 1.6, map: dotTex, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true,
    }));
    thermalPoints.frustumCulled = false;
    group.add(thermalPoints);
    scene.add(group);
    return group;
  }

  // Motes rise 90 m over ~11 s and loop; swirl slightly as they climb.
  function updateVisuals(t) {
    if (!thermalPoints) return;
    const attr = thermalPoints.geometry.attributes.position;
    for (let i = 0; i < thermalPointsBase.length; i += 1) {
      const b = thermalPointsBase[i];
      const f = ((t * 0.09 + b.ph) % 1);
      const swirl = Math.sin(f * Math.PI * 2 + b.ph * 9) * 2;
      attr.setXYZ(i, b.cx + b.ox + swirl, b.gy + 4 + f * 88, b.cz + b.oz + swirl * 0.6);
    }
    attr.needsUpdate = true;
  }

  // ---- Storm FX: rain + lightning. All positions are pure functions of time —
  // no Math.random, no accumulated state — so the storm shot is deterministic. ----
  let rain = null;
  let rainBase = null;
  let bolt = null;
  let flashLight = null;
  let forceFlashUntil = -1;
  const RAIN_COUNT = 1400;
  function hash01(n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function buildStorm(scene) {
    rainBase = [];
    const pos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      rainBase.push({ x: (hash01(i * 3 + 1) - 0.5) * 150, y: hash01(i * 3 + 2) * 70, z: (hash01(i * 3 + 3) - 0.5) * 150, sp: 52 + hash01(i * 7) * 18 });
    }
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.Points(rgeo, new THREE.PointsMaterial({
      color: 0xbdd2e0, size: 0.55, map: dotTex, transparent: true, opacity: 0.6, depthWrite: false, sizeAttenuation: true,
    }));
    rain.frustumCulled = false;
    rain.visible = false;
    scene.add(rain);
    // Lightning bolt: one jagged polyline in the sky ahead of the plane.
    const bpts = [];
    let bx = 0; let by = 120;
    for (let k = 0; k <= 8; k += 1) {
      bpts.push(new THREE.Vector3(bx, by, 0));
      bx += (hash01(k * 13 + 5) - 0.5) * 22;
      by -= 13;
    }
    const bgeo = new THREE.BufferGeometry().setFromPoints(bpts);
    bolt = new THREE.Line(bgeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
    bolt.frustumCulled = false;
    bolt.visible = false;
    scene.add(bolt);
    flashLight = new THREE.PointLight(0xdfe8ff, 0, 700, 1.2);
    scene.add(flashLight);
  }
  function setForceFlash(until) { forceFlashUntil = until; }
  // Flash windows: every 6 s of storm time, a 0.5 s double-blink (0.5 s on, 0.12 s
  // off, 0.18 s on) — deterministic in `t`, so the staged shot can force one.
  function flashAt(t) {
    const ph = t % 6;
    if (t < forceFlashUntil) return 1;
    if (ph < 0.5) return 1 - ph / 0.5;
    if (ph < 0.62) return 0;
    if (ph < 0.8) return 0.8;
    return 0;
  }
  // Rain falls around `center` (the plane), slanted by the storm wind so the
  // 19 m/s wind is VISIBLE; bolt + flash only while the front is Storm.
  function updateStorm(t, center, frontName) {
    const isStorm = frontName === 'Storm';
    if (rain) {
      rain.visible = isStorm;
      if (isStorm) {
        const wind = FRONTS[2].windSpeed;
        const attr = rain.geometry.attributes.position;
        for (let i = 0; i < RAIN_COUNT; i += 1) {
          const b = rainBase[i];
          const fall = (b.y - b.sp * t) % 70;
          const y = fall < 0 ? fall + 70 : fall;
          // Slant: the further a drop has fallen, the further the wind has pushed it.
          const slant = (70 - y) * 0.22 * (wind / 19);
          attr.setXYZ(i, center.x + b.x + slant, center.y - 20 + y, center.z + b.z + slant * 0.4);
        }
        attr.needsUpdate = true;
      }
    }
    const f = isStorm ? flashAt(t) : 0;
    if (bolt) {
      bolt.visible = f > 0.05;
      if (bolt.visible) {
        bolt.position.set(center.x - 60, center.y + 10, center.z - 140);
        bolt.material.opacity = 0.95 * f;
      }
    }
    if (flashLight) {
      flashLight.intensity = f * 1500;
      flashLight.position.set(center.x - 60, center.y + 90, center.z - 140);
    }
    return f;
  }

  return {
    thermals, windAt, liftAt, turbulenceAt, front, frontAt, setFront, cycleFront, tick, buildMeshes,
    updateVisuals, buildStorm, updateStorm, setForceFlash,
    get time() { return time; },
    get frontIndex() { return frontIndex; },
  };
}
