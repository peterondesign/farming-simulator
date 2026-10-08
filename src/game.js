import { WORLD, clamp, hash, tileAt, tileCenter, toWorld } from "./util.js";
import * as W from "./world.js";
import { drawOutline, drawSprite, parchment, spriteSize, text, wrap } from "./art.js";

export const DURATION = 180;
export const WARNING_AT = 60;
const WATER_PER_TRIP = 10;
const WOOD_PER_TREE = 8;
export const FENCE_COST = 2;
const SPEED = 128;
const FOG_SCALE = 16;

export const CREW = {
  ade: { name: "Ade", role: "Water Logistics", tool: "bucket", sprite: "ade", face: "ade-face" },
  mei: { name: "Mei", role: "Agriculture", tool: "hoe", sprite: "mei", face: "mei-face" },
  eli: { name: "Eli", role: "Lumber & Construction", tool: "axe", sprite: "eli", face: "eli-face" },
};
export const CREW_ORDER = ["ade", "mei", "eli"];

export const level = { ready: false };
let ground = null;
let tilled = null;
let sparkles = [];
let toastHandler = () => {};

export function onToast(handler) {
  toastHandler = handler;
}

function say(message) {
  toastHandler(message);
}

export function prepare() {
  W.buildWorld();
  ground = W.renderGround();
  tilled = W.tilledTile();
  sparkles = W.waterSparkles();
}

export function groundCanvas() {
  return ground;
}

function makeUnit(id) {
  const [c, r] = W.STARTS[id];
  const point = tileCenter(c, r);
  return {
    id,
    ...CREW[id],
    x: point.x,
    y: point.y,
    facing: -1,
    path: [],
    onArrive: null,
    action: null,
    task: "idle",
    loop: false,
    bucket: null,
    selected: false,
    walkClock: 0,
    hop: 0,
    idle: 0,
    stuck: 0,
    quiet: 4,
    line: 0,
    bubble: null,
    markX: point.x,
    markY: point.y,
  };
}

function decor() {
  const items = [];
  for (let r = W.CORN.v0; r < W.CORN.v1; r += 1) {
    for (let c = W.CORN.u0; c < W.CORN.u1; c += 1) {
      const point = tileCenter(c, r);
      items.push({ sprite: "corn", x: point.x, y: point.y + 6, scale: 0.9 + hash(c, r) * 0.2, flip: hash(r, c) > 0.5 ? 1 : -1 });
    }
  }
  [
    [17.2, 15.6],
    [16.4, 16.6],
    [7.4, 8.4],
    [9.8, 8.2],
  ].forEach(([u, v]) => {
    const point = toWorld(u, v);
    items.push({ sprite: "hay", x: point.x, y: point.y, scale: 1, flip: 1 });
  });
  const stack = toWorld(25.6, 3.6);
  items.push({ sprite: "haystack", x: stack.x, y: stack.y, scale: 1, flip: 1 });
  for (let r = 2; r < 38; r += 1) {
    for (let c = 2; c < 38; c += 1) {
      if (!W.isWalkable(c, r) || hash(c * 41, r * 37) < 0.965) continue;
      const u = c + 0.5;
      const v = r + 0.5;
      if (W.inPlot(u, v) || W.pathValue(u, v) < 1 || W.pondValue(u, v) < 1.2) continue;
      const point = tileCenter(c, r);
      items.push({ sprite: "bush", x: point.x + (hash(c, r) - 0.5) * 30, y: point.y, scale: 0.8 + hash(r, c) * 0.4, flip: 1 });
    }
  }
  return items;
}

function makeFog() {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(WORLD.w / FOG_SCALE);
  canvas.height = Math.ceil(WORLD.h / FOG_SCALE);
  const context = canvas.getContext("2d");
  context.fillStyle = "#0b120c";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function reveal(x, y, radius) {
  const context = level.fog.getContext("2d");
  const fx = x / FOG_SCALE;
  const fy = y / FOG_SCALE;
  const fr = radius / FOG_SCALE;
  const gradient = context.createRadialGradient(fx, fy, fr * 0.45, fx, fy, fr);
  gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(fx, fy, fr, fr * 0.8, 0, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = "source-over";
}

export function resetLevel() {
  const built = W.buildWorld();
  Object.assign(level, {
    ready: true,
    time: DURATION,
    elapsed: 0,
    warned: false,
    warningClock: -1,
    status: "play",
    drum: 0,
    wood: 0,
    felled: 0,
    bucketsLeft: 3,
    seen: { buckets: false, water: false },
    trees: built.trees,
    cells: built.cells,
    fence: built.fence,
    paddockFence: built.paddockFence,
    shore: W.shoreTiles(),
    decor: decor(),
    units: CREW_ORDER.map(makeUnit),
    cows: [0, 1, 2].map((index) => ({
      u: 25.5 + index * 2,
      v: 4 + (index % 2),
      tu: 26 + index,
      tv: 4.5,
      wait: hash(index, 9) * 3,
      facing: index % 2 ? 1 : -1,
    })),
    particles: [],
    floaters: [],
    hints: {},
    clouds: [0, 1, 2, 3].map((index) => ({
      x: hash(index, 1) * WORLD.w,
      y: 200 + hash(index, 2) * (WORLD.h - 400),
      size: 160 + hash(index, 3) * 140,
    })),
    fog: makeFog(),
    stars: 0,
    score: 0,
    timeBonus: 0,
  });
  const center = toWorld(17, 20);
  reveal(center.x, center.y, 520);
  const forest = toWorld(26, 20);
  reveal(forest.x, forest.y, 260);
}

export function unit(id) {
  return level.units.find((entry) => entry.id === id);
}

export function selectedUnits() {
  return level.units.filter((entry) => entry.selected);
}

export function tilledCount() {
  return level.cells.filter((cell) => cell.tilled).length;
}

export function builtCount() {
  return level.fence.filter((segment) => segment.built).length;
}

export function progress() {
  return {
    water: level.drum / 100,
    till: tilledCount() / level.cells.length,
    fence: builtCount() / level.fence.length,
  };
}

function woodShortfall() {
  return (level.fence.length - builtCount()) * FENCE_COST - level.wood;
}

function floater(x, y, message, color = "#fff3c4") {
  level.floaters.push({ x, y, text: message, color, t: 0 });
}

const cues = [];
export function takeCues() {
  return cues.splice(0);
}
function cue(name) {
  cues.push(name);
}

function grant(x, y, base) {
  const points = Math.max(8, Math.round(base * (0.45 + level.time / DURATION)));
  level.score += points;
  floater(x, y - 18, `+${points}`, "#ffe08a");
}

const STUCK_LINES = [
  "I'm stuck. Point me around it.",
  "I can't get through here.",
  "Try sending me a clearer way.",
];

function advice(entry) {
  if (entry.id === "ade") {
    if (!entry.bucket) return ["I should find the empty buckets.", "Those buckets are out there somewhere.", "I think I should be carrying water, once I have a bucket."];
    if (level.drum < 100) return ["I think I should be hauling water.", "Send me to the pond and I'll keep the drum filling.", "The drum still needs water."];
  }
  if (entry.id === "mei" && tilledCount() < level.cells.length) {
    return ["I should be tilling that soil.", "The ground will harden if I wait.", "I think I should be working the dirt plot."];
  }
  if (entry.id === "eli" && builtCount() < level.fence.length) {
    if (woodShortfall() > 0) return ["I should be chopping trees for lumber.", "The fence needs more wood.", "I think I should be clearing trees."];
    return ["I have the wood. I should build the fence.", "Send me to the soil and I'll fence it in.", "I think I should be enclosing the plot."];
  }
  return null;
}

function speak(entry, lines) {
  entry.line = (entry.line + 1) % lines.length;
  entry.bubble = { text: lines[entry.line], life: 4.6 };
  entry.quiet = 10;
  entry.idle = 0;
  entry.stuck = 0;
}

function updateCallouts(dt) {
  level.units.forEach((entry) => {
    if (entry.bubble) {
      entry.bubble.life -= dt;
      if (entry.bubble.life <= 0) entry.bubble = null;
    }
    entry.quiet = Math.max(0, entry.quiet - dt);
    entry.sample = (entry.sample || 0) + dt;
    const busy = entry.path.length > 0;
    if (!busy && !entry.action && entry.task === "idle") entry.idle += dt;
    else entry.idle = 0;
    if (entry.sample >= 0.45) {
      const moved = Math.hypot(entry.x - entry.markX, entry.y - entry.markY);
      if (busy && moved < 10) entry.stuck += entry.sample;
      else entry.stuck = 0;
      entry.markX = entry.x;
      entry.markY = entry.y;
      entry.sample = 0;
    }
    if (entry.quiet > 0 || entry.bubble) return;
    if (entry.stuck > 2.2) speak(entry, STUCK_LINES);
    else if (entry.idle > 6.5) {
      const lines = advice(entry);
      if (lines) speak(entry, lines);
    }
  });
}

function burst(x, y, count, colors, options = {}) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (options.speed || 60) * (0.4 + Math.random() * 0.8);
    level.particles.push({
      x,
      y,
      z: options.z || 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.5,
      vz: (options.lift || 90) * (0.6 + Math.random() * 0.6),
      life: 0,
      max: 0.5 + Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: options.size || 3,
    });
  }
}

function smooth(from, points) {
  const result = [];
  let cursor = from;
  let index = 0;
  while (index < points.length) {
    let far = points.length - 1;
    while (far > index && !W.hasLine(cursor, points[far])) far -= 1;
    result.push(points[far]);
    cursor = points[far];
    index = far + 1;
  }
  return result;
}

function walkTo(entry, goals, then, exact, quiet) {
  let start = tileAt(entry.x, entry.y);
  if (!W.isWalkable(start.c, start.r)) {
    const near = W.nearestWalkable(start.c, start.r);
    if (near) start = { c: near[0], r: near[1] };
  }
  const route = W.findPath(start, goals);
  if (!route) {
    if (!quiet) {
      say(`${entry.name} can't reach that spot.`);
      speak(entry, STUCK_LINES);
    }
    return false;
  }
  const points = route.slice(1).map(([c, r]) => tileCenter(c, r));
  if (exact) {
    if (points.length) points[points.length - 1] = exact;
    else points.push(exact);
  }
  if (!points.length) points.push(tileCenter(route[0][0], route[0][1]));
  entry.path = smooth({ x: entry.x, y: entry.y }, points);
  entry.onArrive = then;
  entry.action = null;
  return true;
}

function act(entry, kind, duration, done, extra = {}) {
  entry.action = { kind, t: 0, duration, done, beat: 0, ...extra };
  entry.bubble = null;
  const sounds = { chop: "chop", till: "hoe", build: "hammer", fill: "splash", pour: "pour", pickup: "bucket" };
  if (sounds[kind]) cue(sounds[kind]);
}

function clearTask(entry) {
  entry.path = [];
  entry.onArrive = null;
  if (entry.action?.cell && !entry.action.cell.tilled) entry.action.cell.progress = 0;
  entry.action = null;
  entry.loop = false;
  entry.helping = null;
  entry.task = "idle";
}

function face(entry, x) {
  if (Math.abs(x - entry.x) > 2) entry.facing = x > entry.x ? 1 : -1;
}

const bucketSpot = () => tileCenter(W.BUCKETS.c, W.BUCKETS.r);
const drumSpot = () => tileCenter(W.DRUM.c, W.DRUM.r);

function goPickup(entry) {
  entry.task = "pickup";
  walkTo(entry, W.ring(W.BUCKETS.c, W.BUCKETS.r), () => {
    face(entry, bucketSpot().x);
    act(entry, "pickup", 0.6, () => {
      level.bucketsLeft -= 1;
      level.seen.buckets = true;
      entry.bucket = "empty";
      entry.task = "idle";
      entry.hop = 1;
      floater(entry.x, entry.y - 100, "+1 Bucket");
    });
  });
}

function goFill(entry) {
  entry.task = entry.loop ? "loop-fill" : "fill";
  walkTo(entry, level.shore, () => {
    const { c, r } = tileAt(entry.x, entry.y);
    const water = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].find(([dc, dr]) => W.isWater(c + dc, r + dr));
    const splash = water ? tileCenter(c + water[0], r + water[1]) : { x: entry.x, y: entry.y };
    face(entry, splash.x);
    act(
      entry,
      "fill",
      1.1,
      () => {
        entry.bucket = "full";
        level.seen.water = true;
        if (entry.loop) goPour(entry);
        else entry.task = "idle";
      },
      { splash },
    );
  });
}

function goPour(entry) {
  entry.task = "loop-pour";
  walkTo(entry, W.ring(W.DRUM.c, W.DRUM.r), () => {
    const drum = drumSpot();
    face(entry, drum.x);
    act(entry, "pour", 1.0, () => {
      level.drum = Math.min(100, level.drum + WATER_PER_TRIP);
      entry.bucket = "empty";
      grant(drum.x, drum.y - 70, 30);
      floater(drum.x, drum.y - 96, `+${WATER_PER_TRIP}% water`, "#bfe4ff");
      if (level.drum >= 100) {
        entry.loop = false;
        entry.task = "idle";
        say("The water drum is full!");
      } else if (entry.loop) goFill(entry);
      else entry.task = "idle";
    });
  });
}

function startWaterRun(entry) {
  if (level.drum >= 100) {
    say("The water drum is already full.");
    return;
  }
  entry.loop = true;
  if (entry.bucket === "full") goPour(entry);
  else goFill(entry);
}

function nearestCell(entry) {
  let best = null;
  level.cells.forEach((cell) => {
    if (cell.tilled) return;
    const distance = Math.hypot(cell.x - entry.x, cell.y - entry.y);
    if (!best || distance < best.distance) best = { cell, distance };
  });
  return best?.cell || null;
}

function goTill(entry, chosen) {
  const cell = chosen && !chosen.tilled ? chosen : nearestCell(entry);
  if (!cell) {
    entry.task = "idle";
    say("The soil is fully tilled!");
    return;
  }
  entry.task = "till";
  walkTo(
    entry,
    [[cell.c, cell.r]],
    () => {
      act(
        entry,
        "till",
        1.9,
        () => {
          cell.tilled = true;
          cell.progress = 1;
          grant(cell.x, cell.y, 18);
          burst(cell.x, cell.y, 10, ["#3d2614", "#5a3a20", "#7a5434"], { lift: 70 });
          goTill(entry);
        },
        { cell },
      );
    },
    { x: cell.x, y: cell.y + 2 },
  );
}

function treesByDistance(entry) {
  return level.trees
    .filter((tree) => tree.choppable && !tree.felled && W.inGrid(tree.c, tree.r))
    .map((tree) => ({ tree, distance: Math.hypot(tree.x - entry.x, tree.y - entry.y) }))
    .sort((a, b) => a.distance - b.distance);
}

function goChop(entry, chosen) {
  const candidates = chosen ? [{ tree: chosen }] : treesByDistance(entry).slice(0, 6);
  entry.task = "chop";
  const reached = candidates.some(({ tree }) =>
    walkTo(
      entry,
      W.ring(tree.c, tree.r),
      () => {
        face(entry, tree.x);
        act(entry, "chop", 3.4, () => fell(tree, entry), { tree });
      },
      null,
      !chosen,
    ),
  );
  if (!reached) {
    entry.task = "idle";
    if (!chosen) say("No reachable trees nearby.");
  }
}

function fell(tree, entry) {
  tree.felled = true;
  tree.fall = 0.001;
  tree.fallDir = tree.x >= entry.x ? 1 : -1;
  W.setBlocked(tree.c, tree.r, false);
  level.wood += WOOD_PER_TREE;
  level.felled += 1;
  grant(tree.x, tree.y - 90, 24);
  floater(tree.x, tree.y - 120, `+${WOOD_PER_TREE} wood`, "#f2c27a");
  burst(tree.x, tree.y - 20, 14, ["#c8945a", "#e2b77c", "#7a4e2a"], { lift: 120 });
  if (woodShortfall() > 0) goChop(entry);
  else {
    entry.task = "idle";
    say("Enough lumber for the fence.");
  }
}

function nearestSegment(entry) {
  let best = null;
  level.fence.forEach((segment) => {
    if (segment.built) return;
    const distance = Math.hypot(segment.stand.x - entry.x, segment.stand.y - entry.y);
    if (!best || distance < best.distance) best = { segment, distance };
  });
  return best?.segment || null;
}

function goBuild(entry) {
  const segment = nearestSegment(entry);
  if (!segment) {
    entry.task = "idle";
    say("The fence is complete!");
    return;
  }
  if (level.wood < FENCE_COST) {
    entry.task = "idle";
    say(`Eli needs ${FENCE_COST} wood per section. Chop more trees.`);
    return;
  }
  entry.task = "build";
  const tile = tileAt(segment.stand.x, segment.stand.y);
  walkTo(
    entry,
    [[tile.c, tile.r]],
    () => {
      face(entry, (segment.a.x + segment.b.x) / 2);
      act(
        entry,
        "build",
        1.8,
        () => {
          if (level.wood >= FENCE_COST) {
            level.wood -= FENCE_COST;
            segment.built = true;
            grant((segment.a.x + segment.b.x) / 2, (segment.a.y + segment.b.y) / 2, 22);
            burst((segment.a.x + segment.b.x) / 2, (segment.a.y + segment.b.y) / 2, 8, ["#b07a46", "#e0b27a"], { lift: 60 });
          }
          goBuild(entry);
        },
        { segment },
      );
    },
    segment.stand,
  );
}

function moveTo(entry, x, y, offset = 0) {
  const angle = offset * 2.1;
  const tx = x + (offset ? Math.cos(angle) * 34 : 0);
  const ty = y + (offset ? Math.sin(angle) * 17 : 0);
  const tile = tileAt(tx, ty);
  const goal = W.nearestWalkable(tile.c, tile.r);
  if (!goal) return;
  const exact = goal[0] === tile.c && goal[1] === tile.r ? { x: tx, y: ty } : null;
  entry.task = "walk";
  walkTo(entry, [goal], () => {
    entry.task = "idle";
  }, exact);
}

function goAssist(entry, leader, point, offset) {
  clearTask(entry);
  entry.task = "assist";
  entry.helping = leader.id;
  const angle = offset * 2.4;
  const tx = point.x + Math.cos(angle) * 42;
  const ty = point.y + Math.sin(angle) * 20;
  const tile = tileAt(tx, ty);
  const goal = W.nearestWalkable(tile.c, tile.r);
  if (!goal) return;
  walkTo(entry, [goal], () => {
    entry.task = "assist";
    entry.helping = leader.id;
    face(entry, leader.x);
    entry.bubble = { text: `Helping ${leader.name}!`, life: 2.4 };
  });
}

function treeAt(x, y) {
  let best = null;
  level.trees.forEach((tree) => {
    if (!tree.choppable || tree.felled) return;
    const size = spriteSize(tree.kind, tree.scale);
    if (Math.abs(x - tree.x) > size.w * 0.32 || y > tree.y + 8 || y < tree.y - size.h * 0.9) return;
    if (!best || tree.y > best.y) best = tree;
  });
  return best;
}

export function targetAt(x, y) {
  const buckets = bucketSpot();
  if (level.bucketsLeft > 0 && Math.abs(x - buckets.x) < 34 && y < buckets.y + 14 && y > buckets.y - 40) return { type: "buckets" };
  const drum = drumSpot();
  if (Math.abs(x - drum.x) < 30 && y < drum.y + 10 && y > drum.y - 70) return { type: "drum" };
  const tree = treeAt(x, y);
  if (tree) return { type: "tree", tree };
  const tile = tileAt(x, y);
  if (W.isWater(tile.c, tile.r)) return { type: "water" };
  const cell = level.cells.find((entry) => entry.c === tile.c && entry.r === tile.r);
  if (cell) return { type: "plot", cell };
  return { type: "ground" };
}

export function describe(target, group) {
  const has = (id) => group.some((entry) => entry.id === id);
  const ade = group.find((entry) => entry.id === "ade");
  switch (target.type) {
    case "buckets":
      return has("ade") ? { label: ade.bucket ? "Ade has a bucket" : "Pick up a bucket", ok: !ade.bucket } : { label: "Ade handles buckets", ok: false };
    case "water":
      if (!has("ade")) return { label: "Only Ade carries water", ok: false };
      if (!ade.bucket) return { label: "Needs a bucket first", ok: false };
      return level.drum < 100 ? { label: "Start the water run", ok: true } : { label: "The drum is full", ok: false };
    case "drum":
      if (!has("ade")) return { label: `Water drum ${level.drum}%`, ok: false };
      if (!ade.bucket) return { label: "Needs a bucket first", ok: false };
      if (!level.seen.water && ade.bucket !== "full") return { label: "Find the water first", ok: false };
      return { label: "Start the water run", ok: level.drum < 100 };
    case "tree":
      return has("eli") ? { label: "Chop this tree", ok: true } : { label: "Eli has the axe", ok: false };
    case "plot":
      if (has("mei")) return { label: target.cell.tilled ? "Till the next patch" : "Till the soil", ok: tilledCount() < level.cells.length };
      if (has("eli")) return { label: level.wood >= FENCE_COST ? "Build the fence" : "Needs wood to fence", ok: level.wood >= FENCE_COST };
      return { label: "Walk here", ok: true };
    default:
      return { label: "Walk here", ok: true };
  }
}

export function order(group, target, point) {
  const solo = group.length === 1;
  const owner = {
    buckets: "ade",
    water: "ade",
    drum: "ade",
    tree: "eli",
    plot: group.some((entry) => entry.id === "mei") ? "mei" : "eli",
  }[target.type];
  const leader = owner ? group.find((entry) => entry.id === owner) : null;
  group.forEach((entry, index) => {
    const refuse = (message) => {
      if (solo) say(message);
      else if (leader) goAssist(entry, leader, point, index + 1);
      else moveTo(entry, point.x, point.y, index + 1);
    };
    if (target.type === "buckets") {
      if (entry.id !== "ade") return refuse("Ade handles the buckets.");
      if (entry.bucket) return say("Ade already has a bucket.");
      clearTask(entry);
      return goPickup(entry);
    }
    if (target.type === "water") {
      if (entry.id !== "ade") return refuse(`${entry.name} doesn't carry water. That's Ade's job.`);
      if (!entry.bucket) return say("Ade needs a bucket first. Explore to find one.");
      clearTask(entry);
      return startWaterRun(entry);
    }
    if (target.type === "drum") {
      if (entry.id !== "ade") return refuse("Ade fills the water drum.");
      if (!entry.bucket) return say("Ade needs a bucket first. Explore to find one.");
      if (!level.seen.water && entry.bucket !== "full") return say("Find the water source first.");
      clearTask(entry);
      return startWaterRun(entry);
    }
    if (target.type === "tree") {
      if (entry.id !== "eli") return refuse(`${entry.name} has no axe. Eli handles lumber.`);
      clearTask(entry);
      return goChop(entry, target.tree);
    }
    if (target.type === "plot" && entry.id === "mei") {
      clearTask(entry);
      return goTill(entry, target.cell);
    }
    if (target.type === "plot" && entry.id === "eli") {
      if (leader?.id === "mei") return goAssist(entry, leader, point, index + 1);
      clearTask(entry);
      return goBuild(entry);
    }
    if (leader && entry !== leader) return goAssist(entry, leader, point, index + 1);
    clearTask(entry);
    moveTo(entry, point.x, point.y, solo ? 0 : index);
  });
}

export function unitAt(x, y) {
  return [...level.units]
    .sort((a, b) => b.y - a.y)
    .find((entry) => Math.abs(x - entry.x) < 22 && y < entry.y + 8 && y > entry.y - 92);
}

export function taskLabel(entry) {
  const labels = {
    idle: "Waiting for orders",
    walk: "Walking",
    pickup: "Grabbing a bucket",
    fill: "Filling the bucket",
    "loop-fill": "Water run: fetching",
    "loop-pour": "Water run: filling drum",
    till: "Tilling soil",
    chop: "Chopping trees",
    build: "Building the fence",
    assist: entry.helping ? `Helping ${unit(entry.helping).name}` : "Helping",
  };
  return labels[entry.task] || "Waiting for orders";
}

export function equippedLabel(entry) {
  if (entry.id === "ade") return entry.bucket === "full" ? "Full Bucket" : entry.bucket === "empty" ? "Empty Bucket" : "Nothing yet";
  if (entry.id === "mei") return "Hoe";
  return level.wood ? `Axe, ${level.wood} wood` : "Axe";
}

function updateUnit(entry, dt) {
  entry.hop = Math.max(0, entry.hop - dt * 3);
  if (entry.path.length) {
    const next = entry.path[0];
    const dx = next.x - entry.x;
    const dy = next.y - entry.y;
    const distance = Math.hypot(dx, dy);
    const step = SPEED * dt;
    face(entry, next.x);
    entry.walkClock += dt;
    if (distance <= step) {
      entry.x = next.x;
      entry.y = next.y;
      entry.path.shift();
      if (!entry.path.length && entry.onArrive) {
        const arrive = entry.onArrive;
        entry.onArrive = null;
        arrive();
      }
    } else {
      entry.x += (dx / distance) * step;
      entry.y += (dy / distance) * step;
    }
    return;
  }
  const action = entry.action;
  if (!action) return;
  const helpers = level.units.filter(
    (helper) => helper.helping === entry.id && helper.task === "assist" && Math.hypot(helper.x - entry.x, helper.y - entry.y) < 120,
  ).length;
  action.t += dt * (1 + helpers * 0.45);
  const beat = Math.floor(action.t / 0.55);
  if (beat !== action.beat) {
    action.beat = beat;
    if (action.kind === "chop" && action.tree) {
      action.tree.shake = 1;
      burst(action.tree.x, action.tree.y - 18, 5, ["#d9a86a", "#f0cf98", "#8a5a32"], { lift: 80, speed: 70 });
    }
    if (action.kind === "till" && action.cell) burst(action.cell.x, action.cell.y, 4, ["#4a2e18", "#6b4628"], { lift: 50 });
    if (action.kind === "build" && action.segment) {
      const s = action.segment;
      burst((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2 - 10, 3, ["#c8945a", "#e8c48a"], { lift: 40 });
    }
    if (action.kind === "fill" && action.splash) burst(action.splash.x, action.splash.y, 6, ["#bfe4ff", "#6fb6ec", "#ffffff"], { lift: 70, z: 2 });
    if (action.kind === "pour") {
      const drum = drumSpot();
      burst(drum.x, drum.y - 54, 6, ["#bfe4ff", "#6fb6ec", "#ffffff"], { lift: 40, z: 0 });
    }
  }
  if (action.cell) action.cell.progress = Math.min(1, action.t / action.duration);
  if (action.t >= action.duration) {
    const done = action.done;
    entry.action = null;
    done();
  }
}

function updateCows(dt) {
  level.cows.forEach((cow) => {
    if (cow.wait > 0) {
      cow.wait -= dt;
      return;
    }
    const du = cow.tu - cow.u;
    const dv = cow.tv - cow.v;
    const distance = Math.hypot(du, dv);
    if (distance < 0.05) {
      cow.wait = 2 + Math.random() * 4;
      cow.tu = W.PADDOCK.u0 + 0.8 + Math.random() * (W.PADDOCK.u1 - W.PADDOCK.u0 - 1.6);
      cow.tv = W.PADDOCK.v0 + 0.8 + Math.random() * (W.PADDOCK.v1 - W.PADDOCK.v0 - 1.6);
      return;
    }
    const step = Math.min(distance, 0.4 * dt);
    const before = toWorld(cow.u, cow.v).x;
    cow.u += (du / distance) * step;
    cow.v += (dv / distance) * step;
    const after = toWorld(cow.u, cow.v).x;
    if (Math.abs(after - before) > 0.01) cow.facing = after > before ? 1 : -1;
  });
}

function discover() {
  level.units.forEach((entry) => reveal(entry.x, entry.y, 250));
  const buckets = bucketSpot();
  if (!level.seen.buckets && level.units.some((entry) => Math.hypot(entry.x - buckets.x, entry.y - buckets.y) < 190)) {
    level.seen.buckets = true;
    say("Buckets spotted! Send Ade to grab one.");
  }
  if (!level.seen.water) {
    const near = level.shore.some(([c, r]) => {
      const point = tileCenter(c, r);
      return level.units.some((entry) => Math.hypot(entry.x - point.x, entry.y - point.y) < 170);
    });
    if (near) {
      level.seen.water = true;
      say("Water source found!");
    }
  }
}

export function updateLevel(dt) {
  if (level.status !== "play") return;
  level.elapsed += dt;
  level.time = Math.max(0, level.time - dt);
  if (!level.warned && level.time <= WARNING_AT) {
    level.warned = true;
    level.warningClock = 0;
    cue("warn");
  }
  if (level.warningClock >= 0) level.warningClock += dt;
  level.units.forEach((entry) => updateUnit(entry, dt));
  updateCallouts(dt);
  updateCows(dt);
  discover();
  level.trees.forEach((tree) => {
    tree.shake = Math.max(0, tree.shake - dt * 4);
    if (tree.felled && tree.fall < 1) tree.fall = Math.min(1, tree.fall + dt * 1.5);
  });
  level.particles = level.particles.filter((particle) => {
    particle.life += dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vz -= 320 * dt;
    particle.z = Math.max(0, particle.z + particle.vz * dt);
    return particle.life < particle.max;
  });
  level.floaters = level.floaters.filter((entry) => {
    entry.t += dt;
    return entry.t < 1.6;
  });
  level.clouds.forEach((cloud) => {
    cloud.x += dt * 14;
    if (cloud.x - cloud.size * 2 > WORLD.w) cloud.x = -cloud.size * 2;
  });
  const p = progress();
  if (p.water >= 1 && p.till >= 1 && p.fence >= 1) {
    level.status = "won";
    level.timeBonus = Math.round(level.time * 12);
    level.score += level.timeBonus;
    level.stars = level.time >= 60 ? 3 : level.time >= 25 ? 2 : 1;
  } else if (level.time <= 0) level.status = "lost";
}

function drawFence(ctx, segment) {
  const { a, b } = segment;
  ctx.lineCap = "round";
  [11, 20].forEach((height) => {
    ctx.strokeStyle = "#3e220e";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - height);
    ctx.lineTo(b.x, b.y - height);
    ctx.stroke();
    ctx.strokeStyle = "#a8703c";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - height - 0.8);
    ctx.lineTo(b.x, b.y - height - 0.8);
    ctx.stroke();
  });
  [a, b].forEach((post) => {
    ctx.fillStyle = "#2e1909";
    ctx.fillRect(post.x - 4, post.y - 28, 8, 29);
    ctx.fillStyle = "#7a4a22";
    ctx.fillRect(post.x - 3, post.y - 27, 6, 27);
    ctx.fillStyle = "#a8703c";
    ctx.fillRect(post.x - 3, post.y - 27, 2, 27);
    ctx.fillStyle = "#c99a62";
    ctx.fillRect(post.x - 3, post.y - 27, 6, 2);
  });
}

function drawGhostFence(ctx, segment, time) {
  const { a, b } = segment;
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -time * 12;
  ctx.strokeStyle = "rgba(255, 233, 168, 0.55)";
  ctx.lineWidth = 2;
  [11, 20].forEach((height) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y - height);
    ctx.lineTo(b.x, b.y - height);
    ctx.stroke();
  });
  ctx.restore();
}

function diamond(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y);
  ctx.closePath();
}

function shadow(ctx, x, y, rx, alpha = 0.28) {
  ctx.fillStyle = `rgba(16, 26, 8, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawUnit(ctx, entry, time) {
  const walking = entry.path.length > 0;
  const action = entry.action;
  let bob = walking ? Math.abs(Math.sin(entry.walkClock * 11)) * 3.5 : Math.sin(time * 2 + entry.x) * 0.6;
  let rotate = walking ? Math.sin(entry.walkClock * 11) * 0.04 : 0;
  if (action?.kind === "chop") rotate = Math.sin(action.t * 11) * 0.13 * entry.facing;
  if (action?.kind === "till" || action?.kind === "build") bob = -Math.abs(Math.sin(action.t * 6)) * 4;
  bob += Math.sin(entry.hop * Math.PI) * 10;
  const flip = entry.facing === 1 ? -1 : 1;
  const pose = { name: entry.sprite, flip, rotate, sink: 4 };
  const box = drawSprite(ctx, entry.sprite, entry.x, entry.y - bob, pose);
  pose.x = entry.x;
  pose.y = entry.y - bob;
  if (entry.bucket) {
    const bx = entry.x + entry.facing * 18;
    const by = entry.y - 26 - bob * 0.6;
    drawSprite(ctx, "bucket", bx, by + 14, { scale: 0.9 });
    if (entry.bucket === "full") {
      ctx.fillStyle = "#4aa3e8";
      ctx.beginPath();
      ctx.ellipse(bx, by - 6, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#bfe4ff";
      ctx.fillRect(bx - 4, by - 7, 3, 1.5);
    }
  }
  if (action && action.duration > 0.8) {
    const cx = entry.x;
    const cy = entry.y - 108;
    ctx.fillStyle = "rgba(20, 12, 6, 0.7)";
    ctx.beginPath();
    ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffd84a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 6, -Math.PI / 2, -Math.PI / 2 + (action.t / action.duration) * Math.PI * 2);
    ctx.stroke();
  }
  return box ? { box, pose } : null;
}

function inView(view, x, y, margin) {
  return x > view.x - margin && x < view.x + view.w + margin && y > view.y - margin && y < view.y + view.h + margin * 1.6;
}

export function renderWorld(ctx, view, time, options = {}) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ground, 0, 0, WORLD.w, WORLD.h);

  level.cells.forEach((cell) => {
    if (!cell.tilled && !cell.progress) return;
    const top = toWorld(cell.c, cell.r);
    ctx.globalAlpha = cell.tilled ? 1 : cell.progress;
    ctx.drawImage(tilled, top.x - 32, top.y, 64, 32);
    ctx.globalAlpha = 1;
  });

  sparkles.forEach((spark) => {
    const glow = Math.sin(time * 2.2 + spark.phase);
    if (glow < 0.75) return;
    ctx.fillStyle = `rgba(220, 242, 255, ${(glow - 0.75) * 3})`;
    ctx.fillRect(spark.x, spark.y, 6, 2);
  });

  const selected = level.units.filter((entry) => entry.selected);
  const showGhost = selected.some((entry) => entry.id === "eli") || level.wood >= FENCE_COST || builtCount() > 0;
  if (showGhost) level.fence.forEach((segment) => !segment.built && drawGhostFence(ctx, segment, time));

  if (options.hover) {
    const { target } = options.hover;
    ctx.save();
    ctx.strokeStyle = options.hover.ok ? "rgba(255, 236, 160, 0.95)" : "rgba(255, 140, 120, 0.85)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -time * 10;
    let spot = null;
    if (target.type === "tree") spot = { x: target.tree.x, y: target.tree.y, w: 70 };
    if (target.type === "buckets") spot = { ...bucketSpot(), w: 80 };
    if (target.type === "drum") spot = { ...drumSpot(), w: 74 };
    if (target.type === "plot") spot = { x: target.cell.x, y: target.cell.y, w: 64 };
    if (spot) {
      diamond(ctx, spot.x, spot.y, spot.w, spot.w / 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  selected.forEach((entry) => {
    if (!entry.path.length) return;
    ctx.save();
    ctx.setLineDash([3, 7]);
    ctx.strokeStyle = "rgba(255, 236, 160, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(entry.x, entry.y);
    entry.path.forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.stroke();
    ctx.restore();
    const end = entry.path[entry.path.length - 1];
    ctx.strokeStyle = "#ffe48a";
    ctx.lineWidth = 2;
    diamond(ctx, end.x, end.y, 26 + Math.sin(time * 6) * 3, 13);
    ctx.stroke();
  });

  level.units.forEach((entry) => {
    if (!entry.selected && entry !== options.hoverUnit) return;
    const pulse = entry.selected ? 1 + Math.sin(time * 5) * 0.08 : 1;
    ctx.strokeStyle = entry.selected ? "#ffd84a" : "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = entry.selected ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(entry.x, entry.y + 1, 24 * pulse, 11 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  const drawables = [];
  const push = (y, x, draw, margin = 200, cover = false) => {
    if (inView(view, x, y, margin)) drawables.push({ y, draw, cover });
  };

  level.trees.forEach((tree) => {
    push(tree.y, tree.x, () => {
      if (tree.felled) {
        drawSprite(ctx, "stump", tree.x, tree.y + 6, { scale: tree.scale });
        if (tree.fall < 1) {
          const alpha = 1 - Math.max(0, (tree.fall - 0.55) / 0.45);
          drawSprite(ctx, tree.kind, tree.x, tree.y, {
            scale: tree.scale,
            flip: tree.flip,
            rotate: tree.fallDir * tree.fall * tree.fall * 1.5,
            alpha,
          });
        }
        return;
      }
      const sway = Math.sin(time * 60) * tree.shake * 3;
      const size = spriteSize(tree.kind, tree.scale);
      shadow(ctx, tree.x + 6, tree.y + 2, size.w * 0.3, 0.26);
      return drawSprite(ctx, tree.kind, tree.x + sway, tree.y + 6, { scale: tree.scale, flip: tree.flip });
    }, 260, true);
  });

  const barnAnchor = toWorld(W.BARN.u1, W.BARN.v1);
  push(toWorld((W.BARN.u0 + W.BARN.u1) / 2, (W.BARN.v0 + W.BARN.v1) / 2).y, barnAnchor.x, () => {
    shadow(ctx, barnAnchor.x - 10, barnAnchor.y - 40, 150, 0.22);
    return drawSprite(ctx, "barn", barnAnchor.x, barnAnchor.y + 8);
  }, 400, true);

  const drum = drumSpot();
  push(drum.y, drum.x, () => {
    shadow(ctx, drum.x, drum.y + 2, 26);
    drawSprite(ctx, "drum", drum.x, drum.y + 6);
    const height = 44;
    const gx = drum.x + 30;
    const gy = drum.y - 54;
    ctx.fillStyle = "#1c0f07";
    ctx.fillRect(gx - 1, gy - 1, 9, height + 2);
    ctx.fillStyle = "#2a3644";
    ctx.fillRect(gx, gy, 7, height);
    ctx.fillStyle = "#3f9be8";
    ctx.fillRect(gx, gy + height * (1 - level.drum / 100), 7, height * (level.drum / 100));
  });

  const pile = tileCenter(W.STOCKPILE.c, W.STOCKPILE.r);
  if (level.wood > 0) {
    push(pile.y, pile.x, () => {
      shadow(ctx, pile.x, pile.y + 2, 34);
      drawSprite(ctx, "logs", pile.x, pile.y + 6, { scale: clamp(0.55 + level.wood / 60, 0.55, 1.15) });
    });
  }

  const buckets = bucketSpot();
  [
    [-14, -4],
    [12, -2],
    [0, 8],
  ]
    .slice(0, level.bucketsLeft)
    .forEach(([dx, dy]) => {
      push(buckets.y + dy, buckets.x + dx, () => {
        shadow(ctx, buckets.x + dx, buckets.y + dy + 1, 10, 0.3);
        drawSprite(ctx, "bucket", buckets.x + dx, buckets.y + dy + 4);
      });
    });

  level.decor.forEach((item) => {
    const tall = item.sprite === "corn" || item.sprite === "haystack";
    push(
      item.y,
      item.x,
      () => drawSprite(ctx, item.sprite, item.x, item.y + 4, { scale: item.scale, flip: item.flip }),
      160,
      tall,
    );
  });

  level.cows.forEach((cow) => {
    const point = toWorld(cow.u, cow.v);
    push(point.y, point.x, () => {
      shadow(ctx, point.x, point.y + 2, 30, 0.25);
      drawSprite(ctx, "cow", point.x, point.y + 6, { flip: cow.facing === 1 ? -1 : 1 });
    });
  });

  level.paddockFence.forEach((segment) => push(segment.y, segment.a.x, () => drawFence(ctx, segment), 120));
  level.fence.forEach((segment) => {
    if (segment.built) push(segment.y, segment.a.x, () => drawFence(ctx, segment), 120);
  });

  level.units.forEach((entry) => {
    push(entry.y, entry.x, () => {
      shadow(ctx, entry.x, entry.y + 1, 17, 0.32);
      return drawUnit(ctx, entry, time);
    });
  });

  const covers = [];
  const people = [];
  drawables.sort((a, b) => a.y - b.y).forEach((item) => {
    const drawn = item.draw();
    if (!drawn) return;
    if (item.cover) covers.push({ y: item.y, box: drawn.box || drawn });
    else if (drawn.pose) people.push({ y: item.y, ...drawn });
  });
  people.forEach((person) => {
    const body = {
      x: person.box.x + person.box.w * 0.34,
      y: person.box.y + person.box.h * 0.12,
      w: person.box.w * 0.32,
      h: person.box.h * 0.42,
    };
    const hidden = covers.some((cover) => {
      if (cover.y < person.y + 18) return false;
      const core = {
        x: cover.box.x + cover.box.w * 0.32,
        y: cover.box.y + cover.box.h * 0.42,
        w: cover.box.w * 0.36,
        h: cover.box.h * 0.48,
      };
      return body.x < core.x + core.w && body.x + body.w > core.x && body.y < core.y + core.h && body.y + body.h > core.y;
    });
    if (hidden) drawOutline(ctx, person.pose.name, person.pose.x, person.pose.y, person.pose);
  });

  level.particles.forEach((particle) => {
    ctx.globalAlpha = 1 - particle.life / particle.max;
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.z - particle.size / 2, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;

  level.clouds.forEach((cloud) => {
    ctx.fillStyle = "rgba(12, 22, 8, 0.07)";
    [
      [0, 0, 1],
      [cloud.size * 0.7, cloud.size * 0.1, 0.8],
      [-cloud.size * 0.6, cloud.size * 0.15, 0.7],
    ].forEach(([dx, dy, s]) => {
      ctx.beginPath();
      ctx.ellipse(cloud.x + dx, cloud.y + dy, cloud.size * s, cloud.size * s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  if (!options.noFog) {
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(level.fog, 0, 0, level.fog.width * FOG_SCALE, level.fog.height * FOG_SCALE);
    ctx.restore();
  }

  level.units.forEach((entry) => {
    if (!entry.bubble) return;
    const { lines, width } = wrap(ctx, entry.bubble.text, 220, 15);
    const w = Math.max(128, width + 28);
    const h = 16 + lines.length * 18;
    const x = entry.x - w / 2;
    const y = entry.y - 138 - h;
    parchment(ctx, x, y, w, h);
    ctx.fillStyle = "#d9bf8c";
    ctx.beginPath();
    ctx.moveTo(entry.x - 7, y + h - 2);
    ctx.lineTo(entry.x + 7, y + h - 2);
    ctx.lineTo(entry.x, y + h + 10);
    ctx.fill();
    lines.forEach((line, index) => {
      text(ctx, line, entry.x, y + 22 + index * 18, { size: 15, align: "center", color: "#3a2210", shadow: false });
    });
  });

  level.floaters.forEach((entry) => {
    const rise = entry.t * 34;
    ctx.globalAlpha = Math.min(1, 2.4 - entry.t * 1.5);
    ctx.font = `700 15px "Pixelify Sans", monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillText(entry.text, entry.x + 1.5, entry.y - rise + 1.5);
    ctx.fillStyle = entry.color;
    ctx.fillText(entry.text, entry.x, entry.y - rise);
  });
  ctx.globalAlpha = 1;
}

export const HINTS = [
  {
    id: "buckets",
    text: "Locate buckets to store water",
    at: () => toWorld(13.6, 13.2),
    show: () => level.elapsed > 0.8,
    done: () => Boolean(unit("ade").bucket),
  },
  {
    id: "lumber",
    text: "Clear trees for lumber",
    at: () => toWorld(26.4, 19.6),
    show: () => level.elapsed > 5,
    done: () => level.felled > 0,
  },
  {
    id: "till",
    text: "Till the earth before the ground hardens.",
    at: () => toWorld(13, 26.4),
    show: () => level.elapsed > 9.5,
    done: () => tilledCount() >= 2,
  },
  {
    id: "water",
    text: "Find the water source",
    at: () => toWorld(25, 15.4),
    show: () => Boolean(unit("ade").bucket) && !level.seen.water,
    done: () => level.seen.water,
  },
  {
    id: "loop",
    text: "Send Ade to the water or the drum to start a water run",
    at: () => {
      const point = drumSpot();
      return { x: point.x, y: point.y - 70 };
    },
    show: () => level.seen.water && Boolean(unit("ade").bucket) && !unit("ade").loop && level.drum < 100,
    done: () => unit("ade").loop || level.drum >= 100,
  },
  {
    id: "fence",
    text: "Enough lumber! Send Eli to fence the tilled soil",
    at: () => toWorld(16.2, 22.6),
    show: () => woodShortfall() <= 0 && builtCount() < level.fence.length,
    done: () => builtCount() > 0,
  },
];
