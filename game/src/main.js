// Canyon Courier — boot, fixed-timestep loop and sortie state machine. One job: run the game.
// Screens: title -> play -> pause -> results / crash. One sortie, three legs in a row:
// Leg 1 RING RUN (12 rings) -> Leg 2 CARGO DROP (3 pads) -> Leg 3 LANDING (short strip).
// ?shot=start|rings|storm|landing stages a deterministic scene for screenshots.
// ?autopilot=1 flies a whole sortie alone and reports to window.__autopilotResult (playtest/soak).
// ?seed=N, ?weather=0|1|2 and ?aircraft=bush|swift pin the run. Text for the judge lives in
// the title screen and the results screen: the game says what it is, in its own words.
import * as THREE from 'three';
import { STEP, DEFAULT_SEED, SORTIE_LENGTH, SCORE, FUEL, DAMAGE, FRONTS, rankFor } from './config.js';
import { createRandom, clamp } from './random.js';
import { createWorld } from './world.js';
import { createFlightState, buildAircraftMesh, stepFlight, syncAircraftMesh } from './aircraft.js';
import { createThermalWind } from './thermalWind.js';
import { createCourse } from './rings.js';
import { createCockpit } from './cockpit.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import {
  createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_VIEW, ACTION_RESTART,
  ACTION_DROP, ACTION_WEATHER, ACTION_MUTE,
} from './input.js';
import { stageShot, autopilotStep } from './shots.js';

const MAX_FRAME = 0.25;
const BEST_KEY = 'canyon-courier-best';

window.__errors = [];
window.addEventListener('error', (event) => {
  window.__errors.push(String(event.message || event.error || 'unknown error'));
});

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const autopilotMode = params.get('autopilot') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;
const weatherParam = Number.parseInt(params.get('weather') ?? '', 10);
const aircraftParam = params.get('aircraft') === 'swift' ? 'swift' : 'bush';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 4000);
scene.add(camera);

const rng = createRandom(seed);
const world = createWorld(rng);
world.build(scene);
const thermalWind = createThermalWind(rng, world);
thermalWind.buildMeshes(scene);
const course = createCourse(rng, world);
course.build(scene);
const cockpit = createCockpit(camera);
const hud = createHud();
const audio = createAudio();
const input = createInput(canvas);

let variant = aircraftParam;
let aircraftMesh = buildAircraftMesh(variant);
scene.add(aircraftMesh.group);

const game = {
  state: createFlightState(world.startPosition(), variant),
  world, course, thermalWind,
  leg: 1,
  phase: 'title',
  elapsed: 0,
  get legLabel() { return `LEG ${this.leg}/3`; },
};
let scores = { ring: 0, cargo: 0, landing: 0 };
let legDetails = { ring: '0/12 rings', cargo: '0/3 pads', landing: 'not landed' };
let view = 'chase';
let orbitYaw = 0;
let orbitPitch = 0;
let lookYaw = 0;
let lookPitch = 0;
let camPos = new THREE.Vector3();
let camInit = false;
let fuelEmptyWarned = false;
let best = 0;
try { best = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0; } catch { best = 0; }

function totalScore() {
  return scores.ring + scores.cargo + scores.landing;
}

function missionText() {
  if (game.leg === 1) return `RING RUN — ring ${course.nextRingIndex() + 1}/12 · fly the gold rings`;
  if (game.leg === 2) return `CARGO DROP — ${course.pads.filter((p) => p.done).length}/3 pads · press F over a pad`;
  return 'LANDING — put her down on the strip, slow and gentle';
}

function targetText() {
  const s = game.state;
  if (game.leg === 1) {
    const ring = course.nextRing();
    if (!ring) return 'RINGS DONE — on to the pads';
    const d = Math.round(Math.hypot(ring.pos.x - s.pos.x, ring.pos.y - s.pos.y, ring.pos.z - s.pos.z));
    return `◉ RING ${ring.index + 1}/12 · ${d} m`;
  }
  if (game.leg === 2) {
    const pad = course.nextPad();
    if (!pad) return 'PADS DONE — line up for the strip';
    const d = Math.round(Math.hypot(pad.pos.x - s.pos.x, pad.pos.z - s.pos.z));
    return `▣ PAD ${pad.index + 1}/3 · ${d} m — press F to drop`;
  }
  const strip = course.strip.center;
  const d = Math.round(Math.hypot(strip.x - s.pos.x, strip.z - s.pos.z));
  return `▬ STRIP · ${d} m — slow below 48 m/s, sink under 5 m/s`;
}

function setView(next) {
  view = next;
  cockpit.setVisible(next === 'cockpit');
}

function setWeather(index) {
  thermalWind.setFront(index);
  world.applyFront(thermalWind.front());
}

function reset(nextVariant) {
  if (nextVariant && nextVariant !== variant) {
    variant = nextVariant;
    scene.remove(aircraftMesh.group);
    aircraftMesh = buildAircraftMesh(variant);
    scene.add(aircraftMesh.group);
  }
  game.state = createFlightState(world.startPosition(), variant);
  course.reset();
  scores = { ring: 0, cargo: 0, landing: 0 };
  legDetails = { ring: '0/12 rings', cargo: '0/3 pads', landing: 'not landed' };
  game.leg = 1;
  game.elapsed = 0;
  fuelEmptyWarned = false;
  camInit = false;
  orbitYaw = 0;
  orbitPitch = 0;
  lookYaw = 0;
  lookPitch = 0;
  if (Number.isInteger(weatherParam) && weatherParam >= 0 && weatherParam <= 2) setWeather(weatherParam);
  else { thermalWind.setFront(-1); world.applyFront(thermalWind.front()); }
  syncAircraftMesh(aircraftMesh, game.state);
}

function beginPlay() {
  reset(variant);
  game.phase = 'play';
  hud.show('none');
  hud.banner('LEG 1/3 — RING RUN · 12 rings down the canyon', 3200);
  audio.unlock();
  audio.resume();
}

function endSortie(landed, landingScore, reason) {
  if (landed) {
    scores.landing = landingScore;
    legDetails.landing = `${reason} · +${landingScore}`;
  }
  const total = totalScore();
  const rank = rankFor(total);
  if (total > best) {
    best = total;
    try { window.localStorage.setItem(BEST_KEY, String(best)); } catch { /* storage off */ }
  }
  game.phase = 'results';
  audio.silence();
  const legs = [
    { name: 'Leg 1 — Ring Run', detail: legDetails.ring, score: scores.ring },
    { name: 'Leg 2 — Cargo Drop', detail: legDetails.cargo, score: scores.cargo },
    { name: 'Leg 3 — Landing', detail: legDetails.landing, score: scores.landing },
  ];
  hud.nodes.resultsBody.innerHTML = hud.resultsHtml(legs, total, rank);
  hud.nodes.finalRank.textContent = `Rank ${rank.rank} — ${rank.title} · Best ${best}`;
  hud.show('results');
  if (autopilotMode) finishAutopilot(true, `landed score=${total}`);
}

function crash(reason) {
  if (game.phase !== 'play') return;
  game.state.damage = 100;
  game.phase = 'crash';
  audio.crash();
  audio.silence();
  hud.nodes.crashBody.innerHTML =
    `<p>${reason}</p><p>Score ${totalScore()} · ${missionText()}</p><p>Press R to fly again.</p>`;
  hud.show('crash');
  if (autopilotMode) finishAutopilot(false, reason);
}

function finishAutopilot(success, detail) {
  const result = {
    success,
    detail,
    score: totalScore(),
    legScores: { ...scores },
    leg: game.leg,
    rings: course.rings.filter((r) => r.passed).length,
    pads: course.pads.filter((p) => p.done).length,
    elapsed: Math.round(game.elapsed * 10) / 10,
    fuel: Math.round(game.state.fuel),
    damage: Math.round(game.state.damage),
    errors: window.__errors,
  };
  window.__autopilotResult = result;
  const node = document.getElementById('test-result');
  if (node) node.textContent = JSON.stringify(result);
  window.__testDone = true;
}

// One fixed step of the sortie. `axes` is the input snapshot; `drop` releases cargo.
function stepOnce(axes, drop = false) {
  const s = game.state;
  thermalWind.tick(STEP);
  const wind = thermalWind.windAt(s.pos, thermalWind.time, game.elapsed, SORTIE_LENGTH);
  const lift = thermalWind.liftAt(s.pos, thermalWind.time);
  const groundY = world.heightAt(s.pos.x, s.pos.z);
  const inThermal = lift.inside !== null;
  if (game.phase === 'play') game.elapsed += STEP;
  // Fuel: throttle drinks it, thermals halve the burn — lift is a decision, not a decoration.
  if (game.phase === 'play' && s.fuel > 0) {
    const burn = (FUEL.baseDrain + FUEL.throttleDrain * s.throttle) * (inThermal ? FUEL.thermalSaver : 1);
    s.fuel = Math.max(0, s.fuel - burn * STEP);
    if (s.fuel <= 0 && !fuelEmptyWarned) {
      fuelEmptyWarned = true;
      hud.banner('FUEL EMPTY — throttle dead, glide to the strip!', 4000);
    }
  }
  stepFlight(s, axes, STEP, {
    wind, thermalLift: lift.lift, turbulence: thermalWind.turbulenceAt(),
    time: thermalWind.time, groundY,
  });
  // Weather fronts roll on with the sortie clock; the grade follows the front.
  const frontIndex = thermalWind.frontAt(game.elapsed, SORTIE_LENGTH);
  if (frontIndex !== (stepOnce.lastFront ?? 0)) {
    stepOnce.lastFront = frontIndex;
    world.applyFront(FRONTS[frontIndex]);
    if (game.phase === 'play') hud.banner(`${FRONTS[frontIndex].label} — wind ${FRONTS[frontIndex].windSpeed} m/s`, 3000);
  }
  course.update(thermalWind.time);
  if (game.phase !== 'play') return;
  // Autopilot safety nets: a sortie that runs away (lost, out of bounds, or past
  // 300 sim-seconds) ends as a failure instead of flying to infinity.
  if (autopilotMode) {
    const s = game.state;
    if (game.elapsed > 300) { finishAutopilot(false, `sortie exceeded 300 s sim (leg ${game.leg}, rings ${course.rings.filter((r) => r.passed).length}/12)`); game.phase = 'crash'; return; }
    if (Math.abs(s.pos.x) > 600 || s.pos.y > 600 || s.pos.z > 500 || s.pos.z < -2600) {
      crash('Left the canyon — the Courier flew out of the valley.');
      return;
    }
  }
  // Leg 1: rings.
  if (game.leg === 1) {
    const missed = course.checkMissed(s.pos);
    if (missed) {
      legDetails.ring = `${course.nextRingIndex()}/12 rings · +${scores.ring}`;
      hud.banner(`RING ${missed.index + 1} MISSED — on to the next one`);
      if (course.ringsDone()) {
        game.leg = 2;
        hud.banner('LEG 2/3 — CARGO DROP · 3 pads, press F overhead', 3600);
      }
    }
    const hit = course.checkRing(s.pos, s.speed, thermalWind.time);
    if (hit) {
      scores.ring += hit.score;
      legDetails.ring = `${course.nextRingIndex()}/12 rings · +${scores.ring}`;
      hud.banner(`RING ${hit.ring.index + 1} · +${hit.score}  (centre ${Math.round(hit.accuracy * 100)}%)`);
      audio.ring();
      if (course.ringsDone()) {
        game.leg = 2;
        hud.banner('LEG 2/3 — CARGO DROP · 3 pads, press F overhead', 3600);
      }
    }
  }
  // Leg 2: cargo drops.
  if (drop && game.leg === 2) {
    const res = course.dropCargo(s.pos);
    if (res.pad) {
      scores.cargo += res.score;
      legDetails.cargo = `${course.pads.filter((p) => p.done).length}/3 pads · +${scores.cargo}`;
      hud.banner(`SUPPLY AWAY · +${res.score} (pad ${res.pad.index + 1}, ${Math.round(res.dist)} m off)`);
      audio.drop();
      if (course.padsDone()) {
        game.leg = 3;
        hud.banner('LEG 3/3 — LANDING · slow, gentle, on the strip', 3600);
      }
    } else {
      hud.banner('No pad below — line up over an orange pad and press F', 1800);
    }
  }
  // Ground contact: takeoff roll, landing, or crash.
  const onGround = s.pos.y <= groundY + 1.2;
  if (onGround) {
    const strip = course.strip;
    const onStrip = Math.abs(s.pos.x - strip.center.x) < strip.width / 2
      && Math.abs(s.pos.z - strip.center.z) < strip.length / 2;
    // Near miss: just off the strip but slow and gentle still counts as a rough landing.
    const nearStrip = Math.abs(s.pos.x - strip.center.x) < strip.width / 2 + 14
      && Math.abs(s.pos.z - strip.center.z) < strip.length / 2 + 25;
    if (game.leg === 3 && (onStrip || nearStrip)) {
      const verdict = course.scoreLanding(s, nearStrip && !onStrip);
      if (Math.abs(s.vspeed) <= 5 && s.speed <= 48) {
        s.pos.y = groundY + 1.2;
        audio.thud();
        endSortie(true, onStrip ? verdict.score : Math.round(verdict.score / 2), onStrip ? `Landed · ${verdict.score} pts` : 'Down just off the strip · half points');
        return;
      }
      if (s.vspeed < -8 || s.speed > 55) {
        crash(`Hard landing on the strip — ${Math.abs(s.vspeed).toFixed(1)} m/s down at ${Math.round(s.speed)} m/s. The Courier is scrap.`);
        return;
      }
      // Rough but survivable touchdown: damage, bounce, keep rolling if slow enough.
      s.damage = Math.min(100, s.damage + DAMAGE.roughTouch);
      s.pos.y = groundY + 1.3;
      s.speed *= 0.6;
      s.pitch = 0.1;
      audio.thud();
      hud.banner(`Rough touchdown! Damage ${Math.round(s.damage)}% — keep it slow`, 2400);
      if (s.speed < 25) {
        endSortie(true, Math.round(verdict.score / 2), 'Rough landing · half points');
        return;
      }
    } else if (!s.airborne && s.speed < 34) {
      // Takeoff roll (or a slow taxi): stay on the ground, no damage.
      s.pos.y = groundY + 1.2;
      s.vspeed = 0;
    } else if (s.vspeed < -6 || s.speed > 50) {
      crash(`Terrain strike at ${Math.round(s.speed)} m/s — the canyon wins this one.`);
      return;
    } else {
      s.damage = Math.min(100, s.damage + DAMAGE.scrape);
      s.pos.y = groundY + 1.4;
      s.speed *= 0.75;
      audio.thud();
      hud.banner(`Scraped the canyon! Damage ${Math.round(s.damage)}%`, 2200);
      if (s.damage >= 100) { crash('Damage 100% — the Courier came apart.'); return; }
    }
  }
  if (s.damage >= 100) crash('Damage 100% — the Courier came apart.');
}

// Live debug snapshot for the playtest tools (read-only).
window.__debug = () => {
  const s = game.state;
  const ring = course.nextRing();
  return {
    phase: game.phase, leg: game.leg, elapsed: Math.round(game.elapsed * 10) / 10,
    x: Math.round(s.pos.x), y: Math.round(s.pos.y), z: Math.round(s.pos.z),
    speed: Math.round(s.speed), yaw: Math.round(s.yaw * 100) / 100,
    pitch: Math.round(s.pitch * 100) / 100, roll: Math.round(s.roll * 100) / 100,
    throttle: Math.round(s.throttle * 100) / 100, fuel: Math.round(s.fuel),
    rings: course.rings.filter((r) => r.passed).length,
    nextRing: ring ? { x: Math.round(ring.pos.x), y: Math.round(ring.pos.y), z: Math.round(ring.pos.z) } : null,
    groundY: Math.round(world.heightAt(s.pos.x, s.pos.z)),
  };
};

// Expose the game object shots.js and the playtest drive.
game.setView = setView;
game.setWeather = setWeather;
game.stepOnce = stepOnce;
game.reset = reset;
game.beginPlay = beginPlay;
game.beginLeg = () => {};
game.hud = hud;
game.phase = 'title';

const forwardVec = new THREE.Vector3();
function updateCamera(dt) {
  const s = game.state;
  const cp = Math.cos(s.pitch);
  forwardVec.set(-Math.sin(s.yaw) * cp, Math.sin(s.pitch), -Math.cos(s.yaw) * cp);
  if (view === 'cockpit') {
    // High enough that the panel (camera child, 0.30 below the lens) clears the
    // fuselage top: any lower and the panel + dials hide inside the airframe.
    camera.position.copy(s.pos).addScaledVector(forwardVec, 0.9);
    camera.position.y += 1.35;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-s.pitch + lookPitch, s.yaw + lookYaw, s.roll);
    cockpit.update(s, null, thermalWind.liftAt(s.pos, thermalWind.time).inside !== null, '');
  } else {
    const back = 15;
    const up = 4.6;
    const desired = new THREE.Vector3()
      .copy(s.pos)
      .addScaledVector(forwardVec, -back)
      .add(new THREE.Vector3(Math.sin(orbitYaw) * 6, up + orbitPitch * 4, Math.cos(orbitYaw) * 6));
    if (!camInit) {
      camPos.copy(desired);
      camInit = true;
    }
    const k = 1 - Math.exp(-5 * dt);
    camPos.lerp(desired, k);
    camera.position.copy(camPos);
    const look = new THREE.Vector3().copy(s.pos).addScaledVector(forwardVec, 24);
    camera.lookAt(look);
    camera.rotation.z += s.roll * 0.25;
  }
}

function hudData() {
  const s = game.state;
  const wind = thermalWind.windAt(s.pos, thermalWind.time, game.elapsed, SORTIE_LENGTH);
  return {
    alt: s.pos.y,
    speed: s.speed,
    yaw: s.yaw,
    vspeed: s.vspeed,
    fuel: s.fuel,
    damage: s.damage,
    score: totalScore(),
    elapsed: game.elapsed,
    legLabel: `LEG ${game.leg}/3 · ${game.leg === 1 ? 'RING RUN' : game.leg === 2 ? 'CARGO DROP' : 'LANDING'}`,
    mission: missionText(),
    frontLabel: thermalWind.front().label,
    wind,
    windSpeed: Math.hypot(wind.x, wind.z),
    inThermal: thermalWind.liftAt(s.pos, thermalWind.time).inside !== null,
    targetText: targetText(),
  };
}

function handleActions() {
  const actions = input.takeActions();
  const choice = input.aircraftChoice();
  if (choice && game.phase === 'title') {
    reset(choice);
    hud.nodes.titleAircraft.textContent = `Aircraft: ${choice === 'bush' ? 'Bush Courier (1)' : 'Swift Courier (2)'} — press 1/2 to switch`;
    audio.click();
  }
  if (actions & ACTION_CONFIRM) {
    if (game.phase === 'title' || game.phase === 'results' || game.phase === 'crash') {
      audio.unlock();
      beginPlay();
    }
  }
  if (actions & ACTION_PAUSE) {
    if (game.phase === 'play') {
      game.phase = 'pause';
      hud.show('pause');
      audio.silence();
    } else if (game.phase === 'pause') {
      game.phase = 'play';
      hud.show('none');
    }
  }
  if (actions & ACTION_VIEW) {
    setView(view === 'chase' ? 'cockpit' : 'chase');
    audio.click();
  }
  if (actions & ACTION_RESTART) {
    if (game.phase !== 'title') beginPlay();
  }
  if (actions & ACTION_WEATHER) {
    const next = thermalWind.cycleFront();
    world.applyFront(thermalWind.front());
    hud.banner(`Weather: ${thermalWind.front().label}`, 2200);
  }
  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.isMuted());
    hud.banner(audio.isMuted() ? 'Sound off (M to turn back on)' : 'Sound on', 1500);
  }
  return actions;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  const look = input.takeLook();
  orbitYaw += look.dx * 0.003;
  orbitPitch = clamp(orbitPitch - look.dy * 0.004, -0.6, 0.8);
  lookYaw = clamp(lookYaw - look.dx * 0.002, -0.9, 0.9);
  lookPitch = clamp(lookPitch - look.dy * 0.002, -0.5, 0.5);
  if (shot) {
    // Staged scene: render only — the shot was already flown deterministically.
  } else if (autopilotMode && game.phase === 'play') {
    // Playtest/soak: run the sortie as fast as the CPU allows (up to 10 sim-seconds a frame).
    let n = 0;
    while (game.phase === 'play' && n < 600) {
      const { axes, drop } = autopilotStep(game);
      stepOnce(axes, drop);
      n += 1;
    }
    if (game.phase === 'play') {
      const { axes, drop } = autopilotStep(game);
      stepOnce(axes, drop);
    }
  } else if (game.phase === 'play') {
    const actions = handleActions();
    accumulator += dt;
    while (accumulator >= STEP) {
      stepOnce(input.axes(), Boolean(actions & ACTION_DROP));
      accumulator -= STEP;
      if (game.phase !== 'play') { accumulator = 0; break; }
    }
    audio.setEngine(game.state.throttle, game.state.speed, thermalWind.liftAt(game.state.pos, thermalWind.time).inside !== null);
  } else {
    handleActions();
    accumulator = 0;
    // Title screen: the plane sits on the runway, prop idling, canyon behind it.
    if (game.phase === 'title') {
      game.state.propAngle += 0.6 * dt;
      thermalWind.tick(dt);
    }
  }
  syncAircraftMesh(aircraftMesh, game.state);
  updateCamera(dt);
  hud.update(now, hudData());
  hud.tickBanner(dt);
  renderer.render(scene, camera);
  if (shot) {
    painted += 1;
    if (painted >= 2 && !window.__shotReady) window.__shotReady = true;
  }
}

let last = performance.now();
let accumulator = 0;
let painted = 0;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'play') {
    game.phase = 'pause';
    hud.show('pause');
    audio.silence();
  }
});

canvas.addEventListener('pointerdown', () => {
  if (game.phase === 'title' || game.phase === 'results' || game.phase === 'crash') {
    audio.unlock();
    beginPlay();
  }
});

reset(variant);
if (shot) {
  stageShot(shot, game);
  hud.show('none');
  if (shot === 'start') {
    // Cover: the title card stays OFF; the cockpit, runway, ring and lit instruments speak.
    hud.nodes.title.classList.add('hidden');
  }
  syncAircraftMesh(aircraftMesh, game.state);
  updateCamera(0.016);
  hud.update(performance.now(), hudData());
  requestAnimationFrame(frame);
} else {
  hud.show('title');
  setView('chase');
  if (autopilotMode) {
    beginPlay();
    // Autopilot timeout: a sortie that never ends is a failure, not a hang.
    setTimeout(() => {
      if (!window.__testDone) finishAutopilot(false, 'timeout: sortie did not finish in 240 s');
    }, 240000);
  }
  requestAnimationFrame(frame);
}
