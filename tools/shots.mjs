// Canyon Courier shots — deterministic screenshots from shots.json, 1280x720 JPEG.
// Each shot is a real render of the game's own code (?shot= + seed), never edited.
// Retries at lower JPEG quality if a file would exceed the 256 KiB gate cap.
// Usage: node tools/shots.mjs [port]
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { serveGame, launchGame, waitFor, ROOT } from './chrome.mjs';

const port = Number.parseInt(process.argv[2] ?? '8124', 10);
const shots = JSON.parse(await readFile(join(ROOT, 'shots.json'), 'utf8'));

const server = await serveGame(port);
let failed = 0;
try {
  const { browser, page, errors } = await launchGame(port, '/?shot=start&seed=1');
  try {
    for (const shot of shots) {
      await page.goto(`http://127.0.0.1:${port}/${shot.query}`, { waitUntil: 'load', timeout: 60000 });
      await waitFor(page, () => window.__shotReady === true, 90000, `shot ${shot.name}`);
      // Let the golden-hour frame settle one more beat before the capture.
      await new Promise((r) => setTimeout(r, 700));
      let quality = 82;
      let file;
      for (;;) {
        file = await page.screenshot({ type: 'jpeg', quality, clip: { x: 0, y: 0, width: 1280, height: 720 } });
        if (file.length <= 262144 || quality <= 55) break;
        quality -= 8;
      }
      const outPath = join(ROOT, 'screenshots', shot.name);
      await writeFile(outPath, file);
      const size = (await stat(outPath)).size;
      const status = size <= 262144 ? 'OK' : 'OVER-CAP';
      if (status !== 'OK') failed += 1;
      console.log(`${shot.name}: ${size} bytes, 1280x720, quality ${quality} — ${status}`);
    }
    console.log(errors.length ? `console/page errors during shots: ${JSON.stringify(errors)}` : 'no console/page errors during shots');
    if (errors.length) failed += 1;
  } finally {
    await browser.close();
  }
} finally {
  server.close();
}
console.log(failed === 0 ? 'SHOTS PASS' : `SHOTS FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
