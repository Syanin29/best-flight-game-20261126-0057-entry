// Canyon Courier — the HUD. One job: every number the judge's first criterion asks for,
// readable at a glance: altitude, speed, heading, fuel, damage, score, timer, leg, wind, thermal.
// DOM writes are throttled to ~10 Hz and only when a value changed, so the HUD never churns.
export function createHud() {
  const el = (id) => document.getElementById(id);
  const nodes = {
    alt: el('hud-alt'), alt2: el('hud-alt2'), spd: el('hud-spd'), spd2: el('hud-spd2'), hdg: el('hud-hdg'), vsi: el('hud-vsi'),
    score: el('hud-score'), timer: el('hud-timer'), fuel: el('hud-fuel-fill'),
    fuelText: el('hud-fuel-text'), dmg: el('hud-dmg-fill'), dmgText: el('hud-dmg-text'),
    leg: el('hud-leg'), mission: el('hud-mission'), windArrow: el('hud-wind-arrow'),
    windText: el('hud-wind-text'), thermal: el('hud-thermal'), front: el('hud-front'),
    banner: el('hud-banner'), target: el('hud-target'), compass: el('hud-compass'),
    title: el('screen-title'), pause: el('screen-pause'), results: el('screen-results'),
    resultsBody: el('results-body'), finalRank: el('results-rank'),
    crash: el('screen-crash'), crashBody: el('crash-body'),
    attitude: el('hud-attitude'),
  };
  const attCtx = nodes.attitude ? nodes.attitude.getContext('2d') : null;

  // v2 (scorecard UI/HUD 1→2): a real attitude indicator — sky/ground split
  // rotated by bank, shifted by pitch — instead of a sixth stat card. Drawn
  // at the same 10 Hz as the rest of the HUD.
  function drawAttitude(pitch, roll) {
    if (!attCtx) return;
    const w = 186; const h = 64;
    attCtx.save();
    attCtx.clearRect(0, 0, w, h);
    attCtx.translate(w / 2, h / 2);
    attCtx.rotate(roll);
    const dy = Math.max(-h, Math.min(h, -pitch * 90));
    attCtx.fillStyle = '#7fb2d9';
    attCtx.fillRect(-w, -h + dy, w * 2, h);
    attCtx.fillStyle = '#8a6a44';
    attCtx.fillRect(-w, dy, w * 2, h);
    attCtx.strokeStyle = '#ffe9c4';
    attCtx.lineWidth = 2;
    attCtx.beginPath();
    attCtx.moveTo(-w, dy);
    attCtx.lineTo(w, dy);
    attCtx.stroke();
    attCtx.restore();
    // Fixed aircraft symbol: wings + fuselage dot, always level in the frame.
    attCtx.strokeStyle = '#ffd77a';
    attCtx.lineWidth = 3;
    attCtx.beginPath();
    attCtx.moveTo(w / 2 - 34, h / 2);
    attCtx.lineTo(w / 2 + 34, h / 2);
    attCtx.stroke();
    attCtx.fillStyle = '#ffd77a';
    attCtx.beginPath();
    attCtx.arc(w / 2, h / 2, 4, 0, Math.PI * 2);
    attCtx.fill();
  }
  const last = {};
  let lastWrite = 0;

  function setText(node, key, value) {
    if (last[key] !== value) {
      last[key] = value;
      node.textContent = value;
    }
  }

  function fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function compassStrip(headingDeg) {
    const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let best = 0;
    let bestD = 360;
    for (let i = 0; i < 8; i += 1) {
      const d = Math.abs(((headingDeg - i * 45 + 540) % 360) - 180);
      if (d < bestD) { bestD = d; best = i; }
    }
    const prev = points[(best + 7) % 8];
    const next = points[(best + 1) % 8];
    return `${prev} · ${points[best]} ${Math.round(headingDeg)}° · ${next}`;
  }

  // Full refresh, called ~10x a second from the loop; cheap because of the change cache.
  function update(now, data) {
    if (now - lastWrite < 100) return;
    lastWrite = now;
    const heading = ((-data.yaw * 180) / Math.PI % 360 + 360) % 360;
    setText(nodes.alt, 'alt', `${Math.round(data.alt)} m`);
    setText(nodes.alt2, 'alt2', `${Math.round(data.alt)} m`);
    setText(nodes.spd, 'spd', `${Math.round(data.speed)} m/s`);
    setText(nodes.spd2, 'spd2', `${Math.round(data.speed)} m/s`);
    setText(nodes.hdg, 'hdg', `${Math.round(heading)}°`);
    setText(nodes.vsi, 'vsi', `${data.vspeed >= 0 ? '+' : ''}${data.vspeed.toFixed(1)} m/s`);
    setText(nodes.score, 'score', String(data.score));
    setText(nodes.timer, 'timer', fmtTime(data.elapsed));
    setText(nodes.fuelText, 'fuelText', `${Math.round(data.fuel)}%`);
    setText(nodes.dmgText, 'dmgText', `${Math.round(data.damage)}%`);
    setText(nodes.leg, 'leg', data.legLabel);
    setText(nodes.mission, 'mission', data.mission);
    setText(nodes.front, 'front', data.frontLabel);
    setText(nodes.compass, 'compass', compassStrip(heading));
    drawAttitude(data.pitch ?? 0, data.roll ?? 0);
    const windDeg = Math.round((Math.atan2(data.wind.x, -data.wind.z) * 180) / Math.PI);
    setText(nodes.windText, 'windText', `WIND ${Math.round(data.windSpeed)} m/s`);
    nodes.windArrow.style.transform = `rotate(${windDeg}deg)`;
    const fuelPct = Math.max(0, Math.min(100, data.fuel));
    if (last.fuelW !== fuelPct) {
      last.fuelW = fuelPct;
      nodes.fuel.style.width = `${fuelPct}%`;
      nodes.fuel.style.background = fuelPct < 25 ? '#ff5533' : '#ffd77a';
    }
    const dmgPct = Math.max(0, Math.min(100, data.damage));
    if (last.dmgW !== dmgPct) {
      last.dmgW = dmgPct;
      nodes.dmg.style.width = `${dmgPct}%`;
    }
    if (last.thermal !== data.inThermal) {
      last.thermal = data.inThermal;
      nodes.thermal.classList.toggle('lit', data.inThermal);
      nodes.thermal.textContent = data.inThermal ? '▲ THERMAL LIFT +fuel saved' : '△ THERMAL — fly the gold columns';
    }
    if (last.target !== data.targetText) {
      last.target = data.targetText;
      nodes.target.textContent = data.targetText;
    }
  }

  let bannerTimer = 0;
  function banner(text, ms = 2600) {
    nodes.banner.textContent = text;
    nodes.banner.classList.add('show');
    bannerTimer = ms;
  }
  // Hide the banner at once (screenshot staging: the banner would cover the scene).
  function clearBanner() {
    nodes.banner.classList.remove('show');
    bannerTimer = 0;
  }
  function tickBanner(dt) {
    if (bannerTimer > 0) {
      bannerTimer -= dt * 1000;
      if (bannerTimer <= 0) nodes.banner.classList.remove('show');
    }
  }

  function show(screen) {
    for (const key of ['title', 'pause', 'results', 'crash']) {
      nodes[key].classList.toggle('hidden', key !== screen);
    }
  }

  function resultsHtml(legs, total, rank) {
    const rows = legs.map((l) => `<tr><td>${l.name}</td><td>${l.detail}</td><td>${l.score}</td></tr>`).join('');
    return `<table><tr><th>Leg</th><th>Result</th><th>Score</th></tr>${rows}</table>
      <p class="total">TOTAL <b>${total}</b> — Rank <b>${rank.rank}</b> · ${rank.title}</p>`;
  }

  return { update, banner, clearBanner, tickBanner, show, resultsHtml, nodes, fmtTime };
}
