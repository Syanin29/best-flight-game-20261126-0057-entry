// Canyon Courier tools — shared headless-Chrome driver (puppeteer-core + Chrome for Testing).
// One job: launch the game in a real browser, serve game/ locally, and hand back a page.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const CHROME_PATH = `${process.env.HOME}/.cache/puppeteer/chrome/linux-157.0.8103.78/chrome-linux64/chrome`;
export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const GAME_DIR = join(ROOT, 'game');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

// Static server for game/ only (same rules as serve.ts: no paths outside game/).
export function serveGame(port) {
  const root = GAME_DIR;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end('bad request');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const file = resolve(join(root, normalize(pathname)));
    if (file !== root && !file.startsWith(root + sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }
    readFile(file)
      .then((data) => {
        response.writeHead(200, {
          'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'content-length': data.length,
          'cache-control': 'no-store',
        });
        response.end(data);
      })
      .catch(() => response.writeHead(404).end('not found'));
  });
  return new Promise((done) => server.listen(port, '127.0.0.1', () => done(server)));
}

export async function launchGame(port, query) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--window-size=1280,720',
      '--mute-audio',
    ],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${String(err.message || err)}`));
  page.on('requestfailed', (req) => errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText ?? ''}`));
  await page.goto(`http://127.0.0.1:${port}${query}`, { waitUntil: 'load', timeout: 60000 });
  return { browser, page, errors };
}

// Wait for a predicate in the page, polling every 250 ms, up to timeoutMs.
export async function waitFor(page, predicate, timeoutMs, label) {
  const started = Date.now();
  for (;;) {
    const ok = await page.evaluate(predicate).catch(() => false);
    if (ok) return true;
    if (Date.now() - started > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}
