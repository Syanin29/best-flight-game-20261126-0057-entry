// Canyon Courier — the 3D cockpit. One job: instruments that look flown, not drawn.
// Five lit dials (altimeter, airspeed, heading, vertical speed, fuel) sit ON a dark
// panel in the lower third of the cockpit view; their needles move with the real
// flight state. The panel uses unlit materials so the golden-hour sun never washes
// it out, and the dials are mounted on the panel face — never floating in mid-air.
import * as THREE from 'three';
import { clamp } from './random.js';

function dialTexture(label, ticks, unit) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a2118';
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8d9b0';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 128, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd77a';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, 128, 52);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#cbb98a';
  ctx.fillText(unit, 128, 216);
  for (let i = 0; i <= ticks; i += 1) {
    const a = (-225 + (i / ticks) * 270) * (Math.PI / 180);
    const x1 = 128 + Math.cos(a) * 96;
    const y1 = 128 + Math.sin(a) * 96;
    const x2 = 128 + Math.cos(a) * 108;
    const y2 = 128 + Math.sin(a) * 108;
    ctx.strokeStyle = '#e8d9b0';
    ctx.lineWidth = i % (ticks / 5) === 0 ? 5 : 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const PANEL_Y = -0.28;
const PANEL_Z = -0.60;
// Panel front face sits at PANEL_Z + 0.025; dials must live in FRONT of that face,
// not inside the box (an earlier build put them 0.01 m inside — invisible).
const DIAL_Z = PANEL_Z + 0.032;

function makeDial(label, unit, ticks, x) {
  const group = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 28),
    new THREE.MeshBasicMaterial({ map: dialTexture(label, ticks, unit) }),
  );
  group.add(face);
  const needle = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.07, 0.004),
    new THREE.MeshBasicMaterial({ color: 0xff5533 }),
  );
  needle.position.y = 0.03;
  const pivot = new THREE.Group();
  pivot.add(needle);
  pivot.position.z = 0.004;
  group.add(pivot);
  const hub = new THREE.Mesh(
    new THREE.CircleGeometry(0.012, 12),
    new THREE.MeshBasicMaterial({ color: 0x222222 }),
  );
  hub.position.z = 0.006;
  group.add(hub);
  group.position.set(x, PANEL_Y, DIAL_Z);
  return { group, pivot };
}

// Needle angle: value 0..max maps across the 270-degree sweep starting at -225 degrees.
function needleAngle(value, max) {
  return -((-225 + clamp(value / max, 0, 1) * 270) * Math.PI) / 180;
}

export function createCockpit(camera) {
  const group = new THREE.Group();
  const panelMat = new THREE.MeshBasicMaterial({ color: 0x1a140e });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x2e2118 });
  // Panel + glareshield coaming, both unlit so they stay dark in golden hour.
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.22, 0.05), panelMat);
  panel.position.set(0, PANEL_Y, PANEL_Z);
  group.add(panel);
  const coaming = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.05, 0.08), trimMat);
  coaming.position.set(0, -0.13, PANEL_Z);
  group.add(coaming);
  // Slim windshield frame posts at the edges — pushed further out so they frame
  // instead of blocking (at 0.60 m a 0.30 m post spans half the frame).
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.22, 0.04), panelMat);
    post.position.set(side * 0.42, 0.08, -0.90);
    post.rotation.z = -side * 0.2;
    group.add(post);
  }
  const alt = makeDial('ALT', 'm', 10, -0.28);
  const spd = makeDial('SPD', 'm/s', 10, -0.14);
  const hdg = makeDial('HDG', 'deg', 12, 0);
  const vsi = makeDial('VSI', 'm/s', 10, 0.14);
  const fuel = makeDial('FUEL', '%', 10, 0.28);
  for (const d of [alt, spd, hdg, vsi, fuel]) group.add(d.group);
  // ThermalWind lamp: gold when riding a thermal, dark otherwise.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x332211 });
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), lampMat);
  lamp.position.set(0, -0.135, PANEL_Z + 0.045);
  group.add(lamp);
  camera.add(group);
  group.visible = false;

  function update(state, wind, inThermal, legName) {
    alt.pivot.rotation.z = needleAngle(Math.max(0, state.pos.y), 300);
    spd.pivot.rotation.z = needleAngle(state.speed, 90);
    let heading = ((-state.yaw * 180) / Math.PI) % 360;
    if (heading < 0) heading += 360;
    hdg.pivot.rotation.z = needleAngle(heading, 360);
    vsi.pivot.rotation.z = needleAngle(state.vspeed + 15, 30);
    fuel.pivot.rotation.z = needleAngle(state.fuel, 100);
    lampMat.color.setHex(inThermal ? 0xffc832 : 0x332211);
  }

  function setVisible(value) {
    group.visible = value;
  }

  return { group, update, setVisible };
}
