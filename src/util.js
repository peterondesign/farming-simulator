export const VIEW = { w: 1280, h: 720 };
export const TILE_W = 64;
export const TILE_H = 32;
export const GRID = 40;
export const OX = (GRID * TILE_W) / 2;
export const OY = 48;
export const WORLD = { w: GRID * TILE_W, h: GRID * TILE_H + OY * 2 };

export function toWorld(u, v) {
  return { x: (u - v) * (TILE_W / 2) + OX, y: (u + v) * (TILE_H / 2) + OY };
}

export function toGrid(x, y) {
  const a = (x - OX) / (TILE_W / 2);
  const b = (y - OY) / (TILE_H / 2);
  return { u: (a + b) / 2, v: (b - a) / 2 };
}

export function tileCenter(c, r) {
  return toWorld(c + 0.5, r + 0.5);
}

export function tileAt(x, y) {
  const { u, v } = toGrid(x, y);
  return { c: Math.floor(u), r: Math.floor(v) };
}

export function hash(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function fbm(x, y) {
  return noise(x, y) * 0.6 + noise(x * 2.1 + 7.3, y * 2.1 + 3.1) * 0.3 + noise(x * 4.3 + 1.7, y * 4.3 + 9.2) * 0.1;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy || 1;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / length, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function polylineDistance(u, v, points) {
  let best = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [au, av] = points[index];
    const [bu, bv] = points[index + 1];
    best = Math.min(best, segmentDistance(u, v, au, av, bu, bv));
  }
  return best;
}

export function formatClock(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
