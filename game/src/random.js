// Canyon Courier — seeded RNG. One job: deterministic randomness for terrain, rings, thermals.
// mulberry32: small, fast, and the same seed always deals the same canyon.
export function createRandom(seed) {
  let a = seed >>> 0;
  return {
    next() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    range(min, max) {
      return min + this.next() * (max - min);
    },
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    pick(list) {
      return list[Math.floor(this.next() * list.length)];
    },
  };
}

// Smooth 2D value noise built on the seeded RNG: a fixed permutation grid, bilinear
// interpolation with a smoothstep fade. Deterministic for a given seed.
export function createNoise2D(rng, size = 256) {
  const grid = new Float32Array(size * size);
  for (let i = 0; i < grid.length; i += 1) grid[i] = rng.next();
  function fade(t) {
    return t * t * (3 - 2 * t);
  }
  function at(ix, iz) {
    const x = ((ix % size) + size) % size;
    const z = ((iz % size) + size) % size;
    return grid[z * size + x];
  }
  return function noise2D(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = at(ix, iz);
    const b = at(ix + 1, iz);
    const c = at(ix, iz + 1);
    const d = at(ix + 1, iz + 1);
    const ux = fade(fx);
    const uz = fade(fz);
    return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Shortest signed angle from `from` to `to`, in (-PI, PI].
export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  return angle;
}
