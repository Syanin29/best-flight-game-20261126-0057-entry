// Canyon Courier playtest — headless Chrome flies one full sortie on autopilot and reports.
// PASS: the sortie ends (landed or crashed with a reason), zero console/page/request errors.
// Usage: node tools/playtest.mjs [seed] [port]
import { serveGame, launchGame, waitFor, ROOT } from './chrome.mjs';

const seed = Number.parseInt(process.argv[2] ?? '1', 10);
const port = Number.parseInt(process.argv[3] ?? '8123', 10);

const server = await serveGame(port);
let code = 1;
try {
  const { browser, page, errors } = await launchGame(port, `?autopilot=1&seed=${seed}`);
  try {
    await waitFor(page, () => window.__testDone === true, 180000, 'autopilot to finish');
    const result = await page.evaluate(() => window.__autopilotResult);
    const shotErrors = await page.evaluate(() => window.__errors);
    const rendererInfo = await page.evaluate(() => window.__rendererInfo);
    console.log(JSON.stringify({ seed, ...result, pageErrors: shotErrors, consoleErrors: errors }, null, 2));
    console.log(`RENDERER ${JSON.stringify(rendererInfo)}`);
    const clean = errors.length === 0 && shotErrors.length === 0;
    const ok = result && result.success === true && clean;
    console.log(ok ? 'PLAYTEST PASS' : `PLAYTEST FAIL (success=${result?.success} errors=${errors.length + shotErrors.length})`);
    code = ok ? 0 : 1;
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
process.exit(code);
