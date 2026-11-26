# Canyon Courier: 12 rings, 3 weather fronts, 2 aircraft, 1 golden-hour canyon

[![make.fun bounty](https://make.fun/badge.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

**Canyon Courier** is a complete 3D flight game (Three.js, vendored, zero network): one sortie down Ember Canyon in a bush plane. **Leg 1 — Ring Run:** thread 12 gold rings, scored on centre accuracy and speed. **Leg 2 — Cargo Drop:** release 3 supply packs over the orange pads (F). **Leg 3 — Landing:** put her down on the short strip, slow and gentle. **ThermalWind** is the named weather system: three fronts (clear / strong wind / storm) roll through the sortie while gold thermal columns give free lift — ride one and you save fuel, fight the storm and you burn it. Two aircraft (Bush Courier, forgiving and thrifty; Swift Courier, 10 m/s faster and thirstier), a golden-hour canyon with river, pines and clouds, a lit 3D cockpit with five working dials, chase + cockpit cameras, procedural WebAudio engine/wind/chimes, and fuel + damage that turn every sortie into decisions.

Run it: `node serve.ts` then open http://localhost:8080 — W/S throttle, arrows/A-D pitch and roll, Q/E rudder, Space air brake, F drop cargo, C camera, P pause, R restart, T weather, M mute. Verify it: `node tools/playtest.mjs` (one full sortie), `node tools/shots.mjs` (4 deterministic screenshots), `node tools/soak.mjs 10` (10 sorties).

## Changelog

- v1: first full build — 12-ring / 3-pad / strip sortie, ThermalWind fronts + thermals, 2 aircraft, golden-hour canyon, lit cockpit dials, procedural audio, tools/ (playtest + shots + soak).
