// Canyon Courier soak — the autopilot flies N whole sorties on different seeds.
// PASS: every sortie finishes (landed or crashed with a reason), zero errors, no stuck state.
// Usage: node tools/soak.mjs [count] [port]
import { serveGame, launchGame, waitFor } from './chrome.mjs';

const count = Number.parseInt(process.argv[2] ?? '10', 10);
const port = Number.parseInt(process.argv[3] ?? '8125', 10);

const server = await serveGame(port);
const rows = [];
let failed = 0;
try {
  const { browser, page, errors } = await launchGame(port, '/?autopilot=1&seed=1');
  try {
    for (let seed = 1; seed <= count; seed += 1) {
      await page.goto(`http://127.0.0.1:${port}/?autopilot=1&seed=${seed}`, { waitUntil: 'load', timeout: 60000 });
      await waitFor(page, () => window.__testDone === true, 180000, `sortie seed ${seed}`);
      const result = await page.evaluate(() => window.__autopilotResult);
      const row = { seed, success: result.success, score: result.score, rings: result.rings, pads: result.pads, leg: result.leg, elapsed: result.elapsed, fuel: result.fuel, damage: result.damage, detail: result.detail };
      rows.push(row);
      console.log(`seed ${seed}: ${result.success ? 'LANDED' : 'DOWN'} score=${result.score} rings=${result.rings}/12 pads=${result.pads}/3 leg=${result.leg} ${result.elapsed}s fuel=${result.fuel}% dmg=${result.damage}% — ${result.detail}`);
      if (!result.success) failed += 1;
    }
    const shotErrors = await page.evaluate(() => window.__errors);
    if (errors.length || shotErrors.length) {
      console.log(`errors: ${JSON.stringify([...errors, ...shotErrors])}`);
      failed += 1;
    }
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
const landed = rows.filter((r) => r.success).length;
console.log(`SOAK: ${landed}/${count} sorties landed, ${failed} failures`);
console.log(failed === 0 ? 'SOAK PASS' : 'SOAK FAIL');
process.exit(failed === 0 ? 0 : 1);
