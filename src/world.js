import { GRID, WORLD, fbm, hash, polylineDistance, toGrid, toWorld, tileCenter } from "./util.js";

export const BARN = { u0: 18, v0: 11, u1: 22, v1: 15 };
export const DRUM = { c: 20, r: 17 };
export const STOCKPILE = { c: 23, r: 20 };
export const PLOT = { u0: 10, v0: 22, cols: 6, rows: 4 };
export const POND = { u: 31, v: 12.5, ru: 4.4, rv: 3.6 };
export const BUCKETS = { c: 8, r: 9 };
export const WHEEL_NODE = { c: 34, r: 18 };
export const PIPELINE = [
  [32, 18],
  [30, 18],
  [28, 18],
  [26, 18],
  [24, 18],
  [22, 18],
  [20, 18],
  [18, 18],
];
export const STORAGE_TILES = [
  [14, 18],
  [15, 18],
  [16, 18],
  [17, 18],
];
export const SEED_SACK = { c: 12, r: 21 };
export const DEEP_WOOD = { c0: 1, r0: 1, c1: 13, r1: 15 };
export const PADDOCK = { u0: 24, v0: 2, u1: 31, v1: 7 };
export const CORN = { u0: 4, v0: 17, u1: 8, v1: 21 };
export const STARTS = { ade: [20, 19], mei: [18, 20], eli: [22, 19] };

export const PATHS = [
  [
    [13.5, 21.5],
    [17, 19],
    [20.5, 18.6],
    [24, 16.4],
    [27.2, 13.6],
  ],
  [
    [19.6, 17.6],
    [17, 15.6],
    [13.4, 12.6],
    [10.4, 10.6],
    [8.8, 9.8],
  ],
  [
    [21, 19.5],
    [24, 22.5],
    [27.5, 27.5],
    [32, 33],
    [40, 40],
  ],
  [
    [11, 24],
    [7, 24.6],
    [3, 26.2],
    [0, 27],
  ],
  [
    [22, 14.6],
    [25, 9],
    [26.5, 7.4],
  ],
];

const WATER = 1;
const BLOCKED = 2;
let worldMode = 1;

export function setWorldMode(mode) {
  worldMode = mode === 2 ? 2 : 1;
}

export function currentWorldMode() {
  return worldMode;
}

export function riverValue(u, v) {
  if (v < 1.2 || v > 31.2) return 4;
  return Math.abs(u - 36.5) / 1.55;
}

export function inRiver(c, r) {
  return worldMode === 2 && inGrid(c, r) && riverValue(c + 0.5, r + 0.5) < 1;
}

export const grid = {
  kind: new Uint8Array(GRID * GRID),
  blocked: new Uint8Array(GRID * GRID),
};

const at = (c, r) => r * GRID + c;
export const inGrid = (c, r) => c >= 0 && r >= 0 && c < GRID && r < GRID;

export function pondValue(u, v) {
  const du = (u - POND.u) / POND.ru;
  const dv = (v - POND.v) / POND.rv;
  return Math.hypot(du, dv) + (fbm(u * 0.8, v * 0.8) - 0.5) * 0.38;
}

export function pathValue(u, v) {
  let best = Infinity;
  PATHS.forEach((points) => {
    best = Math.min(best, polylineDistance(u, v, points));
  });
  return best + (fbm(u * 1.7 + 11, v * 1.7 + 4) - 0.5) * 0.32;
}

export function inRect(u, v, rect) {
  return u >= rect.u0 && v >= rect.v0 && u < rect.u1 && v < rect.v1;
}

export function inPlot(u, v) {
  return u >= PLOT.u0 && v >= PLOT.v0 && u < PLOT.u0 + PLOT.cols && v < PLOT.v0 + PLOT.rows;
}

export function isWater(c, r) {
  return inGrid(c, r) && grid.kind[at(c, r)] === WATER;
}

export function isWalkable(c, r) {
  return inGrid(c, r) && grid.blocked[at(c, r)] === 0;
}

export function setBlocked(c, r, value) {
  if (inGrid(c, r)) grid.blocked[at(c, r)] = value ? BLOCKED : 0;
}

function edgeDistance(c, r) {
  return Math.min(c, r, GRID - 1 - c, GRID - 1 - r);
}

function nearRect(c, r, rect, pad) {
  return c >= rect.u0 - pad && r >= rect.v0 - pad && c < rect.u1 + pad && r < rect.v1 + pad;
}

function reserved(c, r) {
  const u = c + 0.5;
  const v = r + 0.5;
  if (pondValue(u, v) < 1.25) return true;
  if (pathValue(u, v) < 1.05) return true;
  if (nearRect(c, r, BARN, 2)) return true;
  if (nearRect(c, r, { u0: PLOT.u0, v0: PLOT.v0, u1: PLOT.u0 + PLOT.cols, v1: PLOT.v0 + PLOT.rows }, 2)) return true;
  if (nearRect(c, r, PADDOCK, 1)) return true;
  if (nearRect(c, r, CORN, 1)) return true;
  if (Math.hypot(c - BUCKETS.c, r - BUCKETS.r) < 3) return true;
  if (Math.hypot(c - DRUM.c, r - DRUM.r) < 3) return true;
  if (Math.hypot(c - STOCKPILE.c, r - STOCKPILE.r) < 2) return true;
  if (worldMode === 2) {
    if (Math.hypot(c - WHEEL_NODE.c, r - WHEEL_NODE.r) < 1.2) return true;
    if (PIPELINE.some(([pc, pr]) => pc === c && pr === r)) return true;
    if (STORAGE_TILES.some(([pc, pr]) => pc === c && pr === r)) return true;
    if (c === SEED_SACK.c && r === SEED_SACK.r) return true;
  }
  return Object.values(STARTS).some(([sc, sr]) => Math.hypot(c - sc, r - sr) < 2.5);
}

export function buildWorld() {
  for (let r = 0; r < GRID; r += 1) {
    for (let c = 0; c < GRID; c += 1) {
      const water = pondValue(c + 0.5, r + 0.5) < 1 || (worldMode === 2 && riverValue(c + 0.5, r + 0.5) < 1);
      grid.kind[at(c, r)] = water ? WATER : 0;
      grid.blocked[at(c, r)] = water ? BLOCKED : 0;
    }
  }
  for (let r = BARN.v0; r < BARN.v1; r += 1) for (let c = BARN.u0; c < BARN.u1; c += 1) setBlocked(c, r, true);
  for (let r = PADDOCK.v0; r < PADDOCK.v1; r += 1) for (let c = PADDOCK.u0; c < PADDOCK.u1; c += 1) setBlocked(c, r, true);
  for (let r = CORN.v0; r < CORN.v1; r += 1) for (let c = CORN.u0; c < CORN.u1; c += 1) setBlocked(c, r, true);
  setBlocked(DRUM.c, DRUM.r, true);
  setBlocked(STOCKPILE.c, STOCKPILE.r, true);

  const trees = [];
  const addTree = (c, r, choppable, scale = 1) => {
    const point = tileCenter(c, r);
    const jitterX = (hash(c * 7, r * 3) - 0.5) * 18;
    const jitterY = (hash(c * 5, r * 11) - 0.5) * 8;
    trees.push({
      c,
      r,
      x: point.x + jitterX,
      y: point.y + jitterY,
      kind: hash(c * 13, r * 17) > 0.45 ? "pine" : "oak",
      scale: scale * (0.86 + hash(c * 3, r * 19) * 0.3),
      flip: hash(c, r * 23) > 0.5 ? 1 : -1,
      choppable,
      hits: 0,
      shake: 0,
      fall: 0,
      felled: false,
    });
    if (inGrid(c, r)) setBlocked(c, r, true);
  };

  for (let r = -4; r < GRID + 4; r += 1) {
    for (let c = -4; c < GRID + 4; c += 1) {
      const edge = edgeDistance(c, r);
      if (edge < 0) {
        if (edge > -4 && hash(c * 31, r * 29) > 0.45) addTree(c, r, false, 1.1);
        continue;
      }
      if (reserved(c, r)) continue;
      if (edge < 2) {
        if (hash(c * 11, r * 7) > 0.32) addTree(c, r, false, 1.05);
        continue;
      }
      if (worldMode === 2) {
        const deep = c >= DEEP_WOOD.c0 && r >= DEEP_WOOD.r0 && c <= DEEP_WOOD.c1 && r <= DEEP_WOOD.r1;
        if (!deep) {
          if (hash(c * 3 + 1, r * 5 + 2) > 0.035) continue;
          if (c + r > 30 && c + r < 48) continue;
          if (trees.some((tree) => Math.abs(tree.c - c) + Math.abs(tree.r - r) < 3)) continue;
          addTree(c, r, false, 0.92);
          continue;
        }
        const gate = c >= 8 && c <= 11 && r >= 13;
        if (gate) continue;
        const thicket = c <= 2 || r <= 2 || c >= 12 || r >= 14;
        const chance = thicket ? 0.8 : 0.84;
        if (hash(c * 3 + 1, r * 5 + 2) > chance) continue;
        if (trees.some((tree) => Math.abs(tree.c - c) + Math.abs(tree.r - r) < 2)) continue;
        addTree(c, r, !thicket, thicket ? 1.2 : 1.08);
        continue;
      }
      const forest = Math.hypot((c - 31) / 5.5, (r - 23) / 4.5) < 1;
      const westWood = Math.hypot((c - 6) / 4, (r - 33) / 4.5) < 1;
      const northWood = Math.hypot((c - 13) / 4, (r - 5) / 3) < 1;
      const frontOfFarm = c + r > 38 && c + r < 52 && Math.abs(c - r) < 5;
      const chance = forest ? 0.5 : westWood || northWood ? 0.42 : frontOfFarm ? 0 : 0.05;
      if (hash(c * 3 + 1, r * 5 + 2) > chance) continue;
      if (trees.some((tree) => Math.abs(tree.c - c) + Math.abs(tree.r - r) < 2)) continue;
      addTree(c, r, true);
    }
  }
  if (worldMode !== 2) {
    [
      [25, 19],
      [26, 21],
      [24, 18],
      [27, 19],
    ].forEach(([c, r]) => {
      if (!trees.some((tree) => tree.c === c && tree.r === r)) addTree(c, r, true);
    });
  }

  const cells = [];
  for (let r = 0; r < PLOT.rows; r += 1) {
    for (let c = 0; c < PLOT.cols; c += 1) {
      const u = PLOT.u0 + c;
      const v = PLOT.v0 + r;
      const point = tileCenter(u, v);
      cells.push({ c: u, r: v, x: point.x, y: point.y, tilled: false, progress: 0 });
    }
  }

  const fence = [];
  const u0 = PLOT.u0;
  const v0 = PLOT.v0;
  const u1 = PLOT.u0 + PLOT.cols;
  const v1 = PLOT.v0 + PLOT.rows;
  const pushSegment = (a, b, inward) => {
    const pa = toWorld(a[0], a[1]);
    const pb = toWorld(b[0], b[1]);
    const mid = toWorld((a[0] + b[0]) / 2 + inward[0] * 0.45, (a[1] + b[1]) / 2 + inward[1] * 0.45);
    fence.push({ a: pa, b: pb, stand: mid, built: false, y: (pa.y + pb.y) / 2 });
  };
  for (let u = u0; u < u1; u += 1) pushSegment([u, v0], [u + 1, v0], [0, 1]);
  for (let v = v0; v < v1; v += 1) pushSegment([u1, v], [u1, v + 1], [-1, 0]);
  for (let u = u1; u > u0; u -= 1) pushSegment([u, v1], [u - 1, v1], [0, -1]);
  for (let v = v1; v > v0; v -= 1) pushSegment([u0, v], [u0, v - 1], [1, 0]);

  const paddockFence = [];
  const ring = [
    [PADDOCK.u0, PADDOCK.v0],
    [PADDOCK.u1, PADDOCK.v0],
    [PADDOCK.u1, PADDOCK.v1],
    [PADDOCK.u0, PADDOCK.v1],
  ];
  ring.forEach((start, index) => {
    const end = ring[(index + 1) % ring.length];
    const steps = Math.abs(end[0] - start[0]) + Math.abs(end[1] - start[1]);
    for (let step = 0; step < steps; step += 1) {
      const a = [start[0] + ((end[0] - start[0]) / steps) * step, start[1] + ((end[1] - start[1]) / steps) * step];
      const b = [start[0] + ((end[0] - start[0]) / steps) * (step + 1), start[1] + ((end[1] - start[1]) / steps) * (step + 1)];
      const pa = toWorld(a[0], a[1]);
      const pb = toWorld(b[0], b[1]);
      paddockFence.push({ a: pa, b: pb, built: true, y: (pa.y + pb.y) / 2 });
    }
  });

  return { trees, cells, fence, paddockFence };
}

const GRASS = [
  [74, 128, 44],
  [86, 145, 52],
  [99, 160, 60],
  [114, 175, 70],
  [134, 192, 86],
];
const DIRT = [
  [126, 82, 46],
  [158, 106, 62],
  [181, 126, 76],
  [201, 148, 96],
  [222, 180, 128],
];
const SOIL = [
  [74, 47, 28],
  [92, 60, 35],
  [108, 72, 43],
];
const WATER_COLORS = [
  [33, 88, 150],
  [45, 110, 178],
  [62, 136, 204],
  [120, 186, 232],
];
const FOREST = [
  [34, 58, 30],
  [42, 70, 34],
  [52, 84, 40],
];
const PASTURE = [
  [122, 160, 66],
  [140, 174, 78],
  [160, 186, 92],
];

function pick(palette, value) {
  return palette[Math.max(0, Math.min(palette.length - 1, Math.floor(value * palette.length)))];
}

export function renderGround() {
  const width = WORLD.w / 2;
  const height = WORLD.h / 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  const data = image.data;
  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const { u, v } = toGrid(px * 2 + 1, py * 2 + 1);
      const grain = hash(px, py);
      const blade = hash(px, Math.floor(py / 2) + 9000);
      let color;
      if (u < -0.2 || v < -0.2 || u > GRID + 0.2 || v > GRID + 0.2) {
        color = pick(FOREST, fbm(u * 0.5, v * 0.5) * 0.7 + grain * 0.3);
      } else {
        const pond = pondValue(u, v);
        const wet = worldMode === 2 ? Math.min(pond, riverValue(u, v)) : pond;
        const path = pathValue(u, v);
        if (wet < 1) {
          const depth = Math.min(1, (1 - wet) * 2.4);
          const ripple = Math.sin((u + v) * 5.5 + fbm(u * 2, v * 2) * 6) > 0.92 && grain > 0.4;
          color = ripple ? WATER_COLORS[3] : pick(WATER_COLORS.slice(0, 3), 1 - depth * 0.85 + grain * 0.12);
        } else if (wet < 1.1) {
          color = grain > 0.5 ? [112, 92, 56] : [138, 116, 72];
        } else if (inPlot(u, v)) {
          const fu = u - Math.floor(u);
          const fv = v - Math.floor(v);
          const crack = Math.abs(fbm(u * 3.1, v * 3.1) - 0.5) < 0.025;
          const seam = fu < 0.05 || fv < 0.05 || fu > 0.95 || fv > 0.95;
          color = seam || crack ? [56, 35, 20] : pick(SOIL, fbm(u * 2, v * 2) * 0.5 + grain * 0.5);
        } else if (path < 0.62) {
          color = pick(DIRT.slice(1), fbm(u * 1.5, v * 1.5) * 0.6 + grain * 0.4);
          if (grain > 0.985) color = DIRT[4];
          if (grain < 0.012) color = DIRT[0];
        } else if (path < 0.8) {
          color = grain > 0.55 ? DIRT[1] : GRASS[1];
        } else if (inRect(u, v, PADDOCK)) {
          color = pick(PASTURE, fbm(u, v) * 0.6 + grain * 0.4);
          if (grain > 0.97) color = DIRT[2];
        } else {
          const patch = fbm(u * 0.45, v * 0.45);
          color = pick(GRASS.slice(0, 4), patch * 0.75 + grain * 0.25);
          if (blade > 0.94) color = GRASS[0];
          else if (blade > 0.9) color = GRASS[4];
          const flower = hash(px * 3 + 1, py * 7 + 5);
          if (flower > 0.9993) color = [246, 240, 214];
          else if (flower > 0.9987) color = [240, 200, 72];
        }
      }
      const offset = (py * width + px) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export function waterSparkles() {
  const points = [];
  for (let index = 0; index < 600 && points.length < 70; index += 1) {
    const u = POND.u + (hash(index, 1) - 0.5) * POND.ru * 2;
    const v = POND.v + (hash(index, 2) - 0.5) * POND.rv * 2;
    if (pondValue(u, v) > 0.85) continue;
    const point = toWorld(u, v);
    points.push({ x: Math.round(point.x / 2) * 2, y: Math.round(point.y / 2) * 2, phase: hash(index, 3) * 6.28 });
  }
  return points;
}

export function tilledTile() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  const image = context.createImageData(32, 16);
  for (let py = 0; py < 16; py += 1) {
    for (let px = 0; px < 32; px += 1) {
      const lx = (px + 0.5 - 16) / 16;
      const ly = (py + 0.5) / 8;
      const a = (lx + ly) / 2;
      const b = (ly - lx) / 2;
      if (a < 0.02 || b < 0.02 || a > 0.98 || b > 0.98) continue;
      const row = (b * 4) % 1;
      const grain = hash(px * 3, py * 5);
      let color = [86, 54, 30];
      if (row < 0.3) color = [44, 27, 15];
      else if (row < 0.5) color = [62, 39, 22];
      else if (row > 0.82) color = grain > 0.5 ? [118, 78, 46] : [104, 68, 40];
      const offset = (py * 32 + px) * 4;
      image.data[offset] = color[0];
      image.data[offset + 1] = color[1];
      image.data[offset + 2] = color[2];
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

const NEIGHBORS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [-1, 1, 1.414],
  [1, -1, 1.414],
  [-1, -1, 1.414],
];

export function findPath(start, goals) {
  const goalSet = new Set(goals.filter(([c, r]) => isWalkable(c, r)).map(([c, r]) => at(c, r)));
  if (!goalSet.size) return null;
  const startIndex = at(start.c, start.r);
  if (goalSet.has(startIndex)) return [[start.c, start.r]];
  const cost = new Float32Array(GRID * GRID).fill(Infinity);
  const previous = new Int32Array(GRID * GRID).fill(-1);
  const open = [startIndex];
  cost[startIndex] = 0;
  while (open.length) {
    let bestSlot = 0;
    for (let slot = 1; slot < open.length; slot += 1) if (cost[open[slot]] < cost[open[bestSlot]]) bestSlot = slot;
    const current = open[bestSlot];
    open[bestSlot] = open[open.length - 1];
    open.pop();
    if (goalSet.has(current)) {
      const route = [];
      for (let node = current; node !== -1; node = previous[node]) route.push([node % GRID, Math.floor(node / GRID)]);
      return route.reverse();
    }
    const c = current % GRID;
    const r = Math.floor(current / GRID);
    NEIGHBORS.forEach(([dc, dr, step]) => {
      const nc = c + dc;
      const nr = r + dr;
      if (!isWalkable(nc, nr)) return;
      if (dc && dr && (!isWalkable(c + dc, r) || !isWalkable(c, r + dr))) return;
      const next = at(nc, nr);
      const total = cost[current] + step;
      if (total >= cost[next]) return;
      if (cost[next] === Infinity) open.push(next);
      cost[next] = total;
      previous[next] = current;
    });
  }
  return null;
}

export function nearestWalkable(c, r) {
  if (isWalkable(c, r)) return [c, r];
  for (let radius = 1; radius < 8; radius += 1) {
    let best = null;
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius || !isWalkable(c + dc, r + dr)) continue;
        const distance = Math.hypot(dc, dr);
        if (!best || distance < best.distance) best = { c: c + dc, r: r + dr, distance };
      }
    }
    if (best) return [best.c, best.r];
  }
  return null;
}

export function ring(c, r, size = 1) {
  const tiles = [];
  for (let dr = -size; dr <= size; dr += 1) {
    for (let dc = -size; dc <= size; dc += 1) {
      if (dc || dr) tiles.push([c + dc, r + dr]);
    }
  }
  return tiles;
}

export function shoreTiles() {
  const tiles = [];
  for (let r = 0; r < GRID; r += 1) {
    for (let c = 0; c < GRID; c += 1) {
      if (!isWalkable(c, r)) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => isWater(c + dc, r + dr))) tiles.push([c, r]);
    }
  }
  return tiles;
}

export function hasLine(a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10);
  for (let step = 1; step < steps; step += 1) {
    const t = step / steps;
    const { u, v } = toGrid(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    const c = Math.floor(u);
    const r = Math.floor(v);
    if (!isWalkable(c, r)) return false;
    const fu = u - c;
    const fv = v - r;
    if (fu < 0.2 && !isWalkable(c - 1, r)) return false;
    if (fu > 0.8 && !isWalkable(c + 1, r)) return false;
    if (fv < 0.2 && !isWalkable(c, r - 1)) return false;
    if (fv > 0.8 && !isWalkable(c, r + 1)) return false;
  }
  return true;
}
