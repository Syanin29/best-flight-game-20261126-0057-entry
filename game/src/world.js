// Canyon Courier — the golden-hour canyon. One job: procedural terrain, river, runway, sky.
// The valley meanders along -Z; canyon walls rise on both sides; the river follows the floor.
// heightAt(x, z) is the single source of truth for rendering, collisions, rings and the autopilot.
import * as THREE from 'three';
import { createNoise2D, clamp, lerp, smoothstep } from './random.js';
import { COURSE } from './config.js';

const WORLD_LENGTH = 2600; // z from +180 down to -2420
const WORLD_WIDTH = 560;

export function valleyCenterX(z) {
  return 40 * Math.sin(z * 0.0016) + 25 * Math.sin(z * 0.004 + 1.7);
}

export function createWorld(rng) {
  const n1 = createNoise2D(rng);
  const n2 = createNoise2D(rng);
  const n3 = createNoise2D(rng);

  const stripCenterX = valleyCenterX(COURSE.stripZ);
  const stripY = 6;

  // Flat pads: the departure runway (z -20..130) and the landing strip (z stripZ +/- 70).
  function padBlend(x, z) {
    const runway = smoothstep(55, 28, Math.abs(x - valleyCenterX(55))) * smoothstep(160, 120, z) * smoothstep(-50, -10, z);
    const strip = smoothstep(60, 32, Math.abs(x - stripCenterX)) * smoothstep(90, 55, Math.abs(z - COURSE.stripZ));
    return Math.max(runway, strip);
  }

  function rawHeight(x, z) {
    const dx = x - valleyCenterX(z);
    const floor = 6 * n1(x * 0.02, z * 0.02) + 2.5 * n2(x * 0.09, z * 0.09);
    const walls = smoothstep(90, 260, Math.abs(dx)) * (64 + 36 * n3(x * 0.008, z * 0.008));
    const rise = Math.max(0, -z) * 0.004;
    return floor + walls + rise;
  }

  function heightAt(x, z) {
    const blend = padBlend(x, z);
    const target = Math.abs(z - COURSE.stripZ) < 90 ? stripY : 2;
    return lerp(rawHeight(x, z), target, blend);
  }

  let scene = null;
  let sun = null;
  let hemi = null;
  let fog = null;

  function buildTerrainMesh() {
    const segX = 110;
    const segZ = 220;
    const geo = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_LENGTH, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xc99a5e);
    const grass = new THREE.Color(0x7d8a4a);
    const rock = new THREE.Color(0x8a5f46);
    const high = new THREE.Color(0xb98a5e);
    const snow = new THREE.Color(0xe8ddc8);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i) - 1120; // plane centred at z = -1120 covers +180 .. -2420
      const h = heightAt(x, z);
      pos.setY(i, h);
      pos.setZ(i, z);
      const slope = Math.abs(rawHeight(x + 2, z) - h) + Math.abs(rawHeight(x, z + 2) - h);
      if (h > 118) tmp.copy(snow);
      else if (h > 62 || slope > 9) tmp.copy(rock).lerp(high, clamp((h - 62) / 60, 0, 1));
      else if (h > 14) tmp.copy(grass).lerp(rock, clamp(slope / 14, 0, 0.6));
      else tmp.copy(sand).lerp(grass, clamp((h - 2) / 12, 0, 0.7));
      // Warm golden-hour tint baked into the low floor, cooler rock up high.
      tmp.offsetHSL(0.01, 0.05, 0);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  function buildRiver() {
    // A ribbon of flat water following the valley floor, y just above the floor height.
    const points = [];
    for (let z = 160; z >= -2380; z -= 40) points.push(new THREE.Vector3(valleyCenterX(z), 0, z));
    const shape = [];
    const left = [];
    const right = [];
    for (const p of points) {
      left.push(new THREE.Vector3(p.x - 11, 2.6, p.z));
      right.push(new THREE.Vector3(p.x + 11, 2.6, p.z));
    }
    const verts = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      verts.push(left[i], right[i], left[i + 1], right[i], right[i + 1], left[i + 1]);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(verts);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3f7fb8, roughness: 0.15, metalness: 0.4,
      emissive: 0x1a3a55, emissiveIntensity: 0.5, transparent: true, opacity: 0.9,
    });
    return new THREE.Mesh(geo, mat);
  }

  function buildTrees() {
    // Instanced pines on the valley shoulders: one trunk mesh + one foliage mesh, ~260 trees.
    const spots = [];
    let guard = 0;
    while (spots.length < 260 && guard < 4000) {
      guard += 1;
      const z = rng.range(140, -2360);
      const side = rng.next() < 0.5 ? -1 : 1;
      const dx = side * rng.range(26, 62);
      const x = valleyCenterX(z) + dx;
      const h = heightAt(x, z);
      if (h > 46) continue;
      spots.push({ x, y: h, z, s: rng.range(0.7, 1.6) });
    }
    const dummy = new THREE.Object3D();
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 3.2, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leafGeo = new THREE.ConeGeometry(2.6, 8, 6);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d5a2e, roughness: 1 });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y + 1.6 * s.s, s.z);
      dummy.scale.setScalar(s.s);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(s.x, s.y + (3.2 + 3.6) * s.s, s.z);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    return [trunks, leaves];
  }

  function runwayStrip(cx, cz, length, width, heading) {
    const group = new THREE.Group();
    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.9 }),
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.y = 0.15;
    group.add(asphalt);
    // Centre dashes + threshold bars, as thin white planes.
    const markMat = new THREE.MeshBasicMaterial({ color: 0xf2ead8 });
    for (let d = -length / 2 + 12; d < length / 2 - 8; d += 18) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 8), markMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.2, d);
      group.add(dash);
    }
    for (const side of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(width - 6, 3), markMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(0, 0.2, side * (length / 2 - 6));
      group.add(bar);
    }
    group.position.set(cx, heightAt(cx, cz) + 0.1, cz);
    group.rotation.y = heading;
    return group;
  }

  function buildClouds() {
    // Soft billboard puffs: one shared canvas radial texture, ~22 sprites at golden-hour pink.
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 32, 4, 64, 32, 60);
    grad.addColorStop(0, 'rgba(255, 225, 190, 0.85)');
    grad.addColorStop(1, 'rgba(255, 225, 190, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 });
    const group = new THREE.Group();
    for (let i = 0; i < 22; i += 1) {
      const s = new THREE.Sprite(mat);
      const z = rng.range(150, -2050);
      s.position.set(valleyCenterX(z) + rng.range(-260, 260), rng.range(120, 210), z);
      s.scale.set(rng.range(90, 190), rng.range(28, 55), 1);
      group.add(s);
    }
    return group;
  }

  function build(targetScene) {
    scene = targetScene;
    scene.add(buildTerrainMesh());
    scene.add(buildRiver());
    for (const mesh of buildTrees()) scene.add(mesh);
    scene.add(runwayStrip(valleyCenterX(55), 55, 150, 26, 0));
    scene.add(runwayStrip(stripCenterX, COURSE.stripZ, COURSE.stripLength, COURSE.stripWidth, 0));
    scene.add(buildClouds());

    sun = new THREE.DirectionalLight(0xffb36b, 2.4);
    sun.position.set(320, 130, 260);
    scene.add(sun);
    scene.add(sun.target);
    hemi = new THREE.HemisphereLight(0xffd9a0, 0x5a4a3a, 0.9);
    scene.add(hemi);
    fog = new THREE.FogExp2(0xf2b27a, 0.0011);
    scene.fog = fog;
    scene.background = new THREE.Color(0xffc98a);
  }

  // Golden-hour grade per weather front: fog density, sun strength, sky colour.
  function applyFront(front) {
    if (!scene) return;
    fog.density = front.fog;
    sun.intensity = front.sun;
    scene.background.setHex(front.sky);
    fog.color.setHex(front.sky);
    hemi.intensity = front.name === 'Storm' ? 0.55 : 0.9;
  }

  function startPosition() {
    return new THREE.Vector3(valleyCenterX(100), heightAt(valleyCenterX(100), 100) + 1.6, 100);
  }

  return { heightAt, valleyCenterX, build, applyFront, startPosition, stripCenterX, stripY };
}
