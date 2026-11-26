# BUILD LOG — Canyon Courier (best-flight-game-20261126-0057) — v1

Builder: SIC · Session started 26 Nov 2026 ~12:40 WITA · Build finished 26 Nov 2026 ~13:35 WITA
(before blind round 1 cutoff 20:57 WITA). Free tokens only. **Do NOT submit — coordinator
submits after reviser + judge + kit check.**

## Entry
- Title: **"Canyon Courier: 12 rings, 3 weather fronts, 2 aircraft, 1 golden-hour canyon"**
- Game: 3D Three.js flight game, one sortie, 3 legs (RING RUN 12 rings → CARGO DROP 3 pads →
  LANDING on a short strip). Named unique system: **ThermalWind** (dynamic wind + thermal
  updraft columns + 3 weather fronts: clear / strong wind / storm). 2 aircraft (Bush / Swift).
- Repo (local): `~/workspace/makefun/best-flight-game-20261126-0057-entry/`
- GitHub target: `Syanin29/best-flight-game-20261126-0057-entry` (public)
- Anchor (before first game-code write): `makefun anchor 4df99a36bebd0752a57d3fe396fec2421ba93bd7 round 34288318`

## Skills loaded + measurable impact
- `bounty-skill-routing.md` §1 (game-3d-routing) — read. **MISMATCH FOUND: routing names
  `game-3d-rendering` + `webgl-performance-tuning`; neither exists in the catalogue.**
  Real equivalents used instead: `threejs-game-development` (read in full: fixed-timestep
  loop, renderer setup, DPR clamp) + `threejs-aaa-graphics-builder` family (golden-hour
  lighting, procedural textures, perf).
- `threejs-game-development` — fixed-timestep 1/60 loop with MAX_FRAME 0.25; autopilot
  bulk-steps up to 600 fixed steps/frame (soak 10 sorties in ~100 s wall time).
- `threejs-aaa-graphics-builder` + lighting/textures/performance — ACES tone mapping,
  low golden-hour sun + warm fog, procedural canyon (heightmap + river + instanced pines +
  biome vertex colours), vendored three r160 (no CDN at runtime).
- `winner-playbook-how-winners-work.md` — applied: title counts 4 numbers; one deep mode
  (3 legs, one sortie); one named unique system (ThermalWind); `tools/` mandatory
  (playtest + shots + soak); screenshots judged first, so 4 staged deterministic shots.
- `winner-patterns-all-2026-11-26.md` §5D — title = NAME + setting + mechanic + numbers.

## Files (game/ = 15 files, 763,780 bytes; gate ≤993 files / ≤48 MiB)
| file | bytes | job |
|---|---|---|
| game/index.html | 8,463 | HUD DOM + screens + import map (gate ≤1 MiB) |
| game/src/main.js | 21,401 | fixed-timestep loop + state machine + cameras |
| game/src/world.js | 9,296 | procedural canyon + river + pines + runway/strip |
| game/src/aircraft.js | 8,410 | bush-plane model + flight physics |
| game/src/thermalWind.js | 4,111 | ThermalWind system (wind + thermals + fronts) |
| game/src/rings.js | 8,516 | 12 rings + 3 cargo pads + landing strip + scoring |
| game/src/cockpit.js | 5,015 | 5 lit 3D dials (ALT/SPD/HDG/VSI/FUEL) + thermal lamp |
| game/src/hud.js | 5,279 | DOM HUD (throttled ~10 Hz, change-cached) |
| game/src/shots.js | 8,920 | deterministic shot staging + autopilot |
| game/src/config.js | 2,411 | constants + seed + course + aircraft specs |
| game/src/random.js | 2,134 | mulberry32 RNG + noise + math helpers |
| game/src/input.js | 3,812 | keyboard + mouse |
| game/src/audio.js | 4,250 | procedural WebAudio (engine/wind/chime/thud) |
| game/vendor/three/three.module.min.js | 670,681 | three.js r160 vendored (npm pack, *.min.js — excluded from transcript) |
| game/vendor/three/LICENSE | — | three.js licence |
| main.ts (root) | 1,554 | copy game/ + screenshots/ → output, buildDossier; never chmods |
| serve.ts | — | dev server (starter pattern, not submitted) |
| README.md | — | 1 dense paragraph + badge + controls + changelog v1 |

## Tool results (all green, headless Chrome 157)
- **playtest** (`tools/playtest.mjs`, seed 1): PASS — landed, score 3260 (rings 2520 = 12/12,
  cargo 646 = 3/3, landing 169), elapsed 68.6 s sim, fuel 76%, damage 0%, 0 console /
  page / request errors.
- **soak** (`tools/soak.mjs`, seeds 1–10): **10/10 landed, 0 failures** — scores 3027–3293,
  elapsed 68.5–69.0 s, fuel 75–76%, damage 0%. Re-run after every cockpit/shots change:
  still 10/10.
- **shots** (`tools/shots.mjs`): PASS — 4 shots, 1280×720, 79–89 KiB each (gate ≤256 KiB),
  0 console/page errors. All 4 visually inspected (see below).
- **grader test** (2× as `nobody`, MAKEFUN_OUTPUT_DIR = root-owned mode-777 dir,
  repo copied to /tmp because /home/hatch is not traversable by nobody): exit 0 both runs,
  **dossier.json byte-identical** (550,938 bytes, gate ≤1.5 MiB). No chmod of output dirs
  anywhere (main.ts, tools, or test setup).

## Screenshots (sha256, final)
- 1-start.jpg — 79,120 B — `2cabda7a7824ce26a6ab96b898685b860434768a4d0d67074ef0cad8f48e8eef`
  Cockpit on runway, 5 lit dials, ring 1 ahead, golden hour. (Fixed 3×: panel was a red
  wall → dials embedded inside the panel box → mission card covered the dials.)
- 2-rings.jpg — 89,320 B — `db0cd696a65d4d19ee7ab1b36a667c124dc8a3d230d1713ee20544ab55b27296`
  Chase view through a ring, built red bush plane, full HUD, "RING 4 · +220 (centre 95%)",
  thermal column + "THERMAL LIFT +fuel saved".
- 3-storm.jpg — 86,781 B — `33e8f29cb8c2119b498ae99aa8439dfbf899b83af472e63b7c4cb83a2b2be2a2`
  Storm front (grey sky/fog, FRONT 3/3 — STORM, WIND 6 m/s), plane + ring + cargo pad.
  (Fixed: `beginPlay()` reset wiped the staged weather — the first "storm" shot was clear sky.)
- 4-landing.jpg — 85,816 B — `9d60b4ca3fdccef155d8f29f385c314b5774d69d74e494bf54ba4a5f6d4f99eb`
  Final approach, strip with dashes ahead (260 m), score 3166, timer 00:57, WIND 2 m/s.

## Bugs fixed in this session (13 + 5 screenshot fixes)
1. `makefun init` refused while starter LICENSE existed → emptied dir, init first.
2. `launchGame` double-slash URL → server ERR_INVALID_URL.
3. `thermalWind.buildMeshes` missing from returned object.
4. Turn sign wrong (yaw -= turned plane away from targets) → yaw +=.
5. Canyon walls too steep/close + ring x jumps → walls widened, rings smoothed, radius 16→20.
6. Wall-avoidance override aimed at pos.y+25 → perpetual climb to y=20000+ → fixed safe height, later disabled in leg 3.
7. Course geography: pads behind rings → re-laid (rings end −1480, pads −1620/−1760/−1900, strip −2240).
8. ThermalWind gust formula multiplied wind up to 10× (190 m/s storm) → capped ~1.75×.
9. Autopilot throttle bang-bang → position control (desiredThrottle from cruise).
10. Glide slope on local terrain → strip altitude → one-sided signed along-track distance (fixed seed-2 climb-away loop; soak went 9/10 → 10/10).
11. Flare `dist<120 → throttle=-1` idled plane to stall on final → removed.
12. Missed-ring death spiral → checkMissed (0 pts, advance).
13. Go-around added (re-entry strip+400, +60 m) after overshoots.
14. (Shots) Storm staging wiped by `beginPlay()` reset → reorder: beginPlay first, then setWeather/setView.
15. (Shots) Cockpit panel hidden inside fuselage → camera raised (up 1.35, forward 0.9); canopy glass made transparent (opacity 0.32) so the panel shows through.
16. (Shots) Dials embedded 0.01 m inside the panel box → moved to DIAL_Z = PANEL_Z + 0.032, in front of the face; faces lightened (#2a2118) so they read on the dark panel.
17. (Shots) Windshield posts spanned half the frame at 0.60 m → slimmer, pushed to 0.90 m.
18. (Shots) Bottom mission card covered the dials → hidden for the cover shot only (`#hud-bottom` — the first fix hid only the inner `#hud-target` line, not the card).

## ⚠️ BLOCKER — commit/push NOT done (needs Master's plain-words approval)
After the `makefun init` exec, a system security notice flagged the init-created `.git`
directory (hooks can run code): do NOT run git/package-manager commands inside the repo,
do NOT copy/move its files. Verified by read-only listing: `.git/hooks/` contains ONLY
`*.sample` files (no active hooks); `.makefun/` contains only `freshness.json`. Decision:
**no git commands were run at all in this repo** (no status/add/commit/push/log/diff).
Game is built + verified, but **commit SHA: NONE — commit/push BLOCKED pending Master's
plain-words approval to run git in this repo**. Coordinator: do not submit until the repo
is committed + pushed to GitHub (Syanin29/best-flight-game-20261126-0057-entry, public,
About linking https://make.fun/bounty/best-flight-game-20261126-0057).

## Self-check vs playbook Gates 0–5
- Gate 0 (eligible + payable): free entry, $500 pot, closes 28 Nov 08:57 WITA — PASS.
- Gate 1 (brief, literal): flight game, 3D, cockpit/chase + terrain + plane + lit
  instruments + runway/ring ahead + HUD alt/speed/heading — all visible in screenshots — PASS.
- Gate 2 (title counts ≥3 numbers): "12 rings, 3 weather fronts, 2 aircraft, 1 golden-hour
  canyon" = 4 numbers — PASS.
- Gate 3 (one deep mode + one named unique system): 1 sortie / 3 legs + ThermalWind — PASS.
- Gate 4 (tools/ mandatory): playtest + shots + soak, all green, 10/10 soak — PASS.
- Gate 5 (internal judge ≥75): self-assessment — screenshots show every criterion-1 element
  (cockpit with lit dials, chase with built plane through ring, storm front, landing strip);
  structure is 1-job-per-file; no live playtest by a human judge — estimated 78–82/100
  (honest: the cover's windshield posts are still chunky; terrain is low-poly by design).

## What was cut / not done
- Nothing cut from the design: all 3 legs, ThermalWind, 2 aircraft, both views, procedural
  audio, tools/ (playtest/shots/soak) are in and verified.
- Not done: git commit + push (BLOCKED — see above). No live human playtest (headless
  autopilot only); a human flight test would be the next verification step for the reviser.
- Known weak spot: the cockpit view's windshield posts are still visually heavy; the
  canyon is low-poly stylised (deliberate — matches the golden-hour flat-shaded look).
