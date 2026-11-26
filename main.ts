// Canyon Courier — the hand-in program (Node 22, standard library only).
// It copies this repository's game/ and screenshots/ into the output directory the grader
// (or MAKEFUN_OUTPUT_DIR outside it) points at, then writes /output/dossier.json with the
// vendored make.fun library, exactly as the kit's starter does. No build step, no network,
// no writes outside the output directory — and it never changes a directory's mode.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps: only text_max_bytes shapes the bytes; the others refuse an entry
// the scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files
// in game/ or 48 MiB of game files in all, or a path under game/ over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Reviser read-back: the dossier on disk must carry exactly the four staged
// screenshots, and its cover must still be the verified runway shot — a swapped
// or dropped screenshot fails here instead of handing in silently.
const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
if (dossier.images.length !== 4) throw new Error(`dossier holds ${dossier.images.length} screenshots, expected 4`);
const coverSha = createHash('sha256').update(Buffer.from(dossier.images[0].base64, 'base64')).digest('hex');
if (coverSha !== 'b0a28dfb736f6aa1fbf864622c03345b5bdbc98b347e8ff5d75253069e30090c') throw new Error('dossier cover hash does not match the verified 1-start.jpg runway shot');
// v2 reviser read-back (reviser edit, own invention): the STORM shot is the v2
// headline fix — verify it too, so a swapped or dropped storm frame fails
// here instead of handing in a v1 storm under a v2 cover.
const stormSha = createHash('sha256').update(Buffer.from(dossier.images[2].base64, 'base64')).digest('hex');
if (stormSha !== '3a987a8a1b3dffe10dfc7e2dc0cce68b57809ddde47f38d8a26f72a9e97d3d13') throw new Error('dossier storm hash does not match the verified 3-storm.jpg storm shot');
