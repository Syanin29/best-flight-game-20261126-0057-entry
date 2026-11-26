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
    const gust = 1 + (front.gust / 12) * Math.sin(t * 0.9 + pos.z * 0.01) * Math.sin(t * 0.53);
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

  // Visible columns: translucent gold cylinders + a soft cap sprite, so thermals read in screenshots.
  function buildMeshes(scene) {
    const group = new THREE.Group();
    for (const th of thermals) {
      const geo = new THREE.CylinderGeometry(th.radius * 0.7, th.radius, 90, 18, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd77a, transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const col = new THREE.Mesh(geo, mat);
      col.position.set(th.x, world.heightAt(th.x, th.z) + 45, th.z);
      group.add(col);
      const cap = new THREE.Mesh(
        new THREE.CircleGeometry(th.radius * 0.7, 18),
        new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.22, depthWrite: false }),
      );
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(th.x, world.heightAt(th.x, th.z) + 88, th.z);
      group.add(cap);
    }
    scene.add(group);
    return group;
  }

  return {
    thermals, windAt, liftAt, turbulenceAt, front, frontAt, setFront, cycleFront, tick, buildMeshes,
    get time() { return time; },
    get frontIndex() { return frontIndex; },
  };
}
