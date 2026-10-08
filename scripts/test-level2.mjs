import { images, SPRITES } from "../src/art.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
globalThis.location = { search: "" };
globalThis.window = globalThis;

function ctx2d() {
  const gradient = { addColorStop() {} };
  return {
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    lineWidth: 1,
    lineCap: "butt",
    font: "",
    textAlign: "left",
    canvas: {},
    beginPath() {},
    closePath() {},
    ellipse() {},
    arc() {},
    fill() {},
    stroke() {},
    fillRect() {},
    strokeRect() {},
    rect() {},
    moveTo() {},
    lineTo() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    setLineDash() {},
    clip() {},
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    measureText: (value) => ({ width: String(value).length * 8 }),
    fillText() {},
    drawImage() {},
    putImageData() {},
    getImageData: () => ({ data: new Uint8ClampedArray(16) }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    clearRect() {},
  };
}

globalThis.document = {
  createElement: () => ({ width: 8, height: 8, getContext: () => ctx2d() }),
};

for (const [name, spec] of Object.entries(SPRITES)) {
  const height = spec.h || spec.w || 64;
  const width = spec.w || height;
  images[name] = { width, height };
}

const failures = [];
function check(name, ok, detail = "") {
  if (!ok) failures.push(detail ? `${name}: ${detail}` : name);
}

const G = await import("../src/game.js");
const W = await import("../src/world.js");
const { tileAt, tileCenter } = await import("../src/util.js");

function simulate(seconds, step = 0.2) {
  let left = seconds;
  while (left > 0) {
    const dt = Math.min(step, left);
    G.level.time = Math.max(G.level.time, 30);
    G.updateLevel(dt);
    left -= dt;
    if (G.level.status !== "play") return;
  }
}

function selectOnly(id) {
  G.level.units.forEach((entry) => {
    entry.selected = entry.id === id;
  });
}

function orderSelected(target, point) {
  G.order(G.selectedUnits(), target, point || { x: 0, y: 0 });
}

W.setWorldMode(2);
W.buildWorld();
W.setWorldMode(2);
const built = W.buildWorld();
const woodTrees = built.trees.filter((tree) => tree.choppable && !tree.felled && W.inGrid(tree.c, tree.r));
check("deep wood has a large timber stand", woodTrees.length >= 24, `count ${woodTrees.length}`);
const far = woodTrees.filter((tree) => Math.hypot(tree.c - 20, tree.r - 19) >= 10);
check("most timber sits away from the farm", far.length >= woodTrees.length * 0.8, `${far.length}/${woodTrees.length}`);
check("wheel tile is walkable", W.isWalkable(W.WHEEL_NODE.c, W.WHEEL_NODE.r));
check(
  "wheel sits on the riverbank",
  [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => W.inRiver(W.WHEEL_NODE.c + dc, W.WHEEL_NODE.r + dr)),
);
W.PIPELINE.forEach(([c, r]) => check(`pipe ${c},${r} walkable`, W.isWalkable(c, r)));
W.STORAGE_TILES.forEach(([c, r]) => check(`tank ${c},${r} walkable`, W.isWalkable(c, r)));

const messages = [];
G.onToast((message) => messages.push(message));

G.resetLevel(1);
check("level 1 id", G.level.id === 1);
check("level 1 crew order", G.crewOrder().join() === "ade,mei,eli");
check("level 1 soil starts untilled", G.level.cells.some((cell) => !cell.tilled));
check("level 1 keeps Ade on water", G.unit("ade").role === "Water Logistics");
check("level 1 duration", G.level.duration === 180);
const level1Trees = G.level.trees.filter((tree) => tree.choppable).length;

G.resetLevel(2);
check("level 2 id", G.level.id === 2);
check("level 2 roster", G.crewOrder().join() === "eli,mei,ade");
check("eli is lumber logistics", G.unit("eli").role === "Lumber Logistics");
check("mei is trenching", G.unit("mei").role === "Trenching");
check("ade is engineering", G.unit("ade").role === "Engineering");
check("plots start tilled", G.level.cells.every((cell) => cell.tilled && !cell.trenched && !cell.planted));
check("pipes unbuilt", G.level.pipes.length === W.PIPELINE.length && G.level.pipes.every((pipe) => !pipe.built));
check("level 2 lasts longer", G.level.duration === 240);
const before = G.level.time;
G.updateLevel(1);
check("drought timer counts down", G.level.time < before);
G.level.time = G.level.duration;
check("level 2 hints mention the woods", G.activeHints().some((hint) => /woods/i.test(hint.text)));

let reachableWood = 0;
const eli = G.unit("eli");
for (let guard = 0; guard < 80; guard += 1) {
  const open = G.level.trees
    .filter((tree) => tree.choppable && !tree.felled && W.inGrid(tree.c, tree.r))
    .map((tree) => ({ tree, distance: Math.hypot(tree.x - eli.x, tree.y - eli.y) }))
    .sort((a, b) => a.distance - b.distance);
  const next = open.find(({ tree }) => W.findPath(tileAt(eli.x, eli.y), W.ring(tree.c, tree.r)));
  if (!next) break;
  next.tree.felled = true;
  W.setBlocked(next.tree.c, next.tree.r, false);
  const stand = W.ring(next.tree.c, next.tree.r).find(([c, r]) => W.isWalkable(c, r));
  if (stand) {
    const point = tileCenter(stand[0], stand[1]);
    eli.x = point.x;
    eli.y = point.y;
  }
  reachableWood += 8;
}
check("enough reachable lumber for the works", reachableWood >= 160, `wood ${reachableWood}`);

G.resetLevel(2);
const helperTree = G.level.trees
  .filter((tree) => tree.choppable && !tree.felled && W.inGrid(tree.c, tree.r))
  .find((tree) => W.findPath(tileAt(G.unit("eli").x, G.unit("eli").y), W.ring(tree.c, tree.r)));
G.level.units.forEach((entry) => {
  entry.selected = entry.id === "eli" || entry.id === "mei";
});
G.order(G.selectedUnits(), { type: "tree", tree: helperTree }, { x: helperTree.x, y: helperTree.y });
check("grouped farmers assist the lumber role", G.unit("eli").task === "chop" && G.unit("mei").task === "assist");
G.resetLevel(2);
selectOnly("mei");
const plot = G.level.cells[0];
orderSelected({ type: "plot", cell: plot }, { x: plot.x, y: plot.y });
check("mei accepts trenching", G.unit("mei").task === "trench");
selectOnly("eli");
orderSelected({ type: "plot", cell: plot }, { x: plot.x, y: plot.y });
check("eli cannot trench alone", messages.some((line) => /Mei digs/.test(line)));
simulate(80);
check("channels reach every crop", G.level.cells.every((cell) => cell.trenched), `${G.trenchProgress()}`);

messages.length = 0;
selectOnly("mei");
const sack = tileCenter(W.SEED_SACK.c, W.SEED_SACK.r);
orderSelected(G.targetAt(sack.x, sack.y), sack);
check("planting waits for the water works", messages.some((line) => /wheel|pipe|storage|channel|tank/i.test(line)));
check("seeds are not in yet", G.level.cells.every((cell) => !cell.planted));

selectOnly("eli");
const lumberjack = G.unit("eli");
const timber = G.level.trees
  .filter((tree) => tree.choppable && !tree.felled && W.inGrid(tree.c, tree.r))
  .map((tree) => ({ tree, distance: Math.hypot(tree.x - lumberjack.x, tree.y - lumberjack.y) }))
  .sort((a, b) => a.distance - b.distance)
  .find(({ tree }) => W.findPath(tileAt(lumberjack.x, lumberjack.y), W.ring(tree.c, tree.r)))?.tree;
orderSelected({ type: "tree", tree: timber }, { x: timber.x, y: timber.y });
check("eli harvests", G.unit("eli").task === "chop");
simulate(220);
check("stockpile covers the build", G.lumberProgress() >= 1, `harvested ${G.level.harvested} wood ${G.level.wood}`);

const wheel = tileCenter(W.WHEEL_NODE.c, W.WHEEL_NODE.r);
selectOnly("ade");
G.level.seen.wheel = false;
orderSelected({ type: "wheel" }, wheel);
check("ade marks and builds the wheel", G.level.wheelBuilt || G.unit("ade").task === "wheel" || G.level.seen.wheel);
simulate(30);
check("wheel is built", G.level.wheelBuilt);

selectOnly("ade");
orderSelected({ type: "pipe" }, tileCenter(24, 18));
simulate(80);
check("pipeline is complete", G.level.pipes.every((pipe) => pipe.built), `${G.level.pipes.filter((pipe) => pipe.built).length}`);

selectOnly("ade");
orderSelected({ type: "storage" }, tileCenter(16, 18));
simulate(40);
check("storage modules are up", G.level.storageBuilt === 4, String(G.level.storageBuilt));
simulate(3);
check("tanks catch river water", G.level.reserve >= 25, String(G.level.reserve));

messages.length = 0;
selectOnly("ade");
orderSelected({ type: "seeds" }, sack);
check("one farmer cannot plant", messages.some((line) => /together/.test(line)));
check("still unplanted", G.plantProgress() === 0);

G.level.units.forEach((entry) => {
  entry.selected = true;
});
orderSelected({ type: "seeds" }, sack);
check("the crew starts planting", G.level.units.every((entry) => entry.task === "plant"));
simulate(80);
check("every seed is planted", G.plantProgress() === 1, String(G.plantProgress()));
check("level 2 is won", G.level.status === "won");

G.resetLevel(1);
check("level 1 still starts untilled", G.level.cells.every((cell) => !cell.tilled));
check("level 1 tree supply restored", Math.abs(G.level.trees.filter((tree) => tree.choppable).length - level1Trees) <= 2);
G.level.drum = 100;
G.level.cells.forEach((cell) => {
  cell.tilled = true;
});
G.level.fence.forEach((segment) => {
  segment.built = true;
});
G.level.time = 90;
G.updateLevel(0.05);
check("level 1 win unlocks level 2", G.level.status === "won" && localStorage.getItem("greenfield-unlock") === "2");
localStorage.setItem("greenfield-unlock", "1");
globalThis.location.search = "?unlock=2";
check("query unlock allows testing", G.unlockedMax() === 2);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("level 2 mechanical checks passed");
