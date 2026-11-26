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

export function createWorld(rng, decoRng = null) {
  // v2: shrubs/rocks draw from a SEPARATE rng stream (seed+777, passed by
  // main.js) so the new decoration never shifts the shared stream that lays
  // out thermals + rings + pads — v1's proven course geometry stays identical.
  const deco = decoRng ?? rng;
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
  let cloudMat = null;
  const SUN_OFFSET = new THREE.Vector3(320, 190, 260);

  // v2 (threejs-textures: procedural canvas texture): a subtle grey grain map
  // multiplied over the vertex colours — the v1 terrain read as flat colour
  // fields. One shared 256x256 canvas, tiled; zero network, deterministic.
  function makeNoiseTexture(base, spread, size = 256) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        const v = base + Math.floor((h - Math.floor(h)) * spread);
        const i = (y * size + x) * 4;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(24, 24);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const noiseTexture = makeNoiseTexture(205, 50);
  const asphaltTexture = makeNoiseTexture(60, 20);

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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: noiseTexture });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true; // v2: the canyon floor catches the plane/tree shadows
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
    // v2: instanced pines cast + receive — the shadow pass costs one 2048 map,
    // instancing keeps the draw calls at 2.
    trunks.castShadow = true;
    trunks.receiveShadow = true;
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    return [trunks, leaves];
  }

  function runwayStrip(cx, cz, length, width, heading) {
    const group = new THREE.Group();
    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(width, length),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: asphaltTexture }),
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.y = 0.15;
    asphalt.receiveShadow = true;
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
    cloudMat = mat;
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

  function buildShrubsAndRocks() {
    // v2 (scorecard World 1→2): the v1 canyon had ONE plant — 260 identical
    // cone pines. Two more instanced kits, same 2 draw calls: olive shrubs on
    // the valley floor and grey boulders on the slopes. Seeded, deterministic.
    const dummy = new THREE.Object3D();
    const shrubs = [];
    const rocks = [];
    let guard = 0;
    while (shrubs.length < 150 && guard < 3000) {
      guard += 1;
      const z = deco.range(140, -2360);
      const x = valleyCenterX(z) + deco.range(-70, 70);
      const h = heightAt(x, z);
      if (h > 30) continue;
      shrubs.push({ x, y: h, z, s: deco.range(0.6, 1.8) });
    }
    guard = 0;
    while (rocks.length < 120 && guard < 3000) {
      guard += 1;
      const z = deco.range(140, -2360);
      const side = deco.next() < 0.5 ? -1 : 1;
      const x = valleyCenterX(z) + side * deco.range(70, 200);
      const h = heightAt(x, z);
      if (h < 18 || h > 110) continue;
      rocks.push({ x, y: h, z, s: deco.range(0.8, 3.2) });
    }
    const shrubMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.6, 0),
      new THREE.MeshStandardMaterial({ color: 0x6a7a35, roughness: 1 }),
      Math.max(shrubs.length, 1),
    );
    shrubs.forEach((s, i) => {
      dummy.position.set(s.x, s.y + 0.7 * s.s, s.z);
      dummy.scale.set(s.s, s.s * 0.62, s.s);
      dummy.rotation.set(0, deco.range(0, Math.PI * 2), 0);
      dummy.updateMatrix();
      shrubMesh.setMatrixAt(i, dummy.matrix);
    });
    shrubMesh.instanceMatrix.needsUpdate = true;
    shrubMesh.castShadow = true;
    shrubMesh.receiveShadow = true;
    const rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1.4, 0),
      new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 1 }),
      Math.max(rocks.length, 1),
    );
    rocks.forEach((s, i) => {
      dummy.position.set(s.x, s.y + 0.4 * s.s, s.z);
      dummy.scale.setScalar(s.s);
      dummy.rotation.set(deco.range(0, 3), deco.range(0, 3), deco.range(0, 3));
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
    });
    rockMesh.instanceMatrix.needsUpdate = true;
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    return [shrubMesh, rockMesh];
  }

  function build(targetScene) {
    scene = targetScene;
    scene.add(buildTerrainMesh());
    scene.add(buildRiver());
    for (const mesh of buildTrees()) scene.add(mesh);
    for (const mesh of buildShrubsAndRocks()) scene.add(mesh);
    scene.add(runwayStrip(valleyCenterX(55), 55, 150, 26, 0));
    scene.add(runwayStrip(stripCenterX, COURSE.stripZ, COURSE.stripLength, COURSE.stripWidth, 0));
    scene.add(buildClouds());

    sun = new THREE.DirectionalLight(0xffb36b, 2.4);
    // v2 shadows: one PCFSoft sun shadow, 2048 map, ~360 m ortho box that FOLLOWS
    // the plane (updateSun) so shadows stay crisp down the whole 2.6 km course
    // instead of smearing over the full map. DPR clamp + instancing unchanged.
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 1200;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.6;
    sun.position.set(320, 190, 260);
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
    // v2: storm clouds go slate-grey instead of golden-hour pink.
    if (cloudMat) {
      if (front.name === 'Storm') { cloudMat.color.setHex(0x77707a); cloudMat.opacity = 0.95; }
      else if (front.name === 'Strong Wind') { cloudMat.color.setHex(0xd8c0b0); cloudMat.opacity = 0.85; }
      else { cloudMat.color.setHex(0xffffff); cloudMat.opacity = 0.8; }
    }
  }

  // Keep the sun + its shadow box centred on the plane, called every frame.
  // v2 (cascaded-shadows, applied subset): the shadow-box centre is SNAPPED to
  // whole texels (360 m / 2048 = 0.176 m) so the shadows stop shimmering as
  // the plane translates. Full CSM (sampler2DArray + custom depth shader) was
  // NOT adopted: vendored three r160 has no SunLight addon, and one 2048 map
  // following the plane already gives 17.6 cm texels over the whole course.
  const SHADOW_TEXEL = 360 / 2048;
  function snapTexel(v) { return Math.round(v / SHADOW_TEXEL) * SHADOW_TEXEL; }
  function updateSun(planePos) {
    if (!sun) return;
    const tx = snapTexel(planePos.x);
    const ty = snapTexel(planePos.y);
    const tz = snapTexel(planePos.z);
    sun.position.set(tx + SUN_OFFSET.x, ty + SUN_OFFSET.y, tz + SUN_OFFSET.z);
    sun.target.position.set(tx, ty, tz);
    sun.target.updateMatrixWorld();
  }

  function startPosition() {
    return new THREE.Vector3(valleyCenterX(100), heightAt(valleyCenterX(100), 100) + 1.6, 100);
  }

  return { heightAt, valleyCenterX, build, applyFront, updateSun, startPosition, stripCenterX, stripY };
}
