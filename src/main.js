import { VIEW, WORLD, clamp, toWorld } from "./util.js";
import { loadArt } from "./art.js";
import * as G from "./game.js";
import * as H from "./hud.js";
import * as A from "./audio.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const STARS_KEY = "greenfield-stars";
const SCORE_KEY = "greenfield-score";
const ZOOM = { min: 0.55, max: 2.2 };

const app = {
  screen: "loading",
  load: 0,
  tool: "hand",
  camera: { x: 0, y: 0, zoom: 1 },
  pointer: { x: VIEW.w / 2, y: VIEW.h / 2 },
  hover: null,
  hoverUnit: null,
  gesture: null,
  keys: new Set(),
  toast: { text: "", t: 0 },
  best: Number(localStorage.getItem(STARS_KEY)) || 0,
  bestScore: Number(localStorage.getItem(SCORE_KEY)) || 0,
  levels: { music: A.audioLevel("music"), sfx: A.audioLevel("sfx") },
  audioPanel: false,
  lastKey: { key: "", t: 0 },
};

let dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = VIEW.w * dpr;
  canvas.height = VIEW.h * dpr;
}
resize();
window.addEventListener("resize", resize);

function toast(message) {
  app.toast = { text: message, t: 2.6 };
}
G.onToast(toast);

function clampCamera() {
  const camera = app.camera;
  const viewW = VIEW.w / camera.zoom;
  const viewH = VIEW.h / camera.zoom;
  camera.x = viewW >= WORLD.w ? (WORLD.w - viewW) / 2 : clamp(camera.x, 0, WORLD.w - viewW);
  camera.y = viewH >= WORLD.h ? (WORLD.h - viewH) / 2 : clamp(camera.y, 0, WORLD.h - viewH);
}

function focus(x, y) {
  app.camera.x = x - VIEW.w / (2 * app.camera.zoom);
  app.camera.y = y - VIEW.h / (2 * app.camera.zoom);
  clampCamera();
}

function zoomBy(factor, anchor = { x: VIEW.w / 2, y: VIEW.h / 2 }) {
  const camera = app.camera;
  const wx = camera.x + anchor.x / camera.zoom;
  const wy = camera.y + anchor.y / camera.zoom;
  camera.zoom = clamp(camera.zoom * factor, ZOOM.min, ZOOM.max);
  camera.x = wx - anchor.x / camera.zoom;
  camera.y = wy - anchor.y / camera.zoom;
  clampCamera();
}

function screenPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: ((event.clientX - rect.left) / rect.width) * VIEW.w, y: ((event.clientY - rect.top) / rect.height) * VIEW.h };
}

function toWorldPoint(point) {
  return { x: app.camera.x + point.x / app.camera.zoom, y: app.camera.y + point.y / app.camera.zoom };
}

function project(point) {
  return { x: (point.x - app.camera.x) * app.camera.zoom, y: (point.y - app.camera.y) * app.camera.zoom };
}

function startLevel() {
  G.resetLevel();
  app.camera.zoom = 1.15;
  const start = toWorld(19.5, 18.5);
  focus(start.x, start.y);
  app.tool = "hand";
  app.screen = "intro";
}

function select(id, additive) {
  const target = G.unit(id);
  if (!additive) G.level.units.forEach((entry) => (entry.selected = false));
  target.selected = additive ? !target.selected : true;
  const now = performance.now();
  if (app.lastKey.key === id && now - app.lastKey.t < 400) focus(target.x, target.y - 40);
  app.lastKey = { key: id, t: now };
}

function runAction(action) {
  if (!action) return false;
  if (action === "absorb") return true;
  if (action === "locked") toast("Locked. Finish level 1 first.");
  if (action === "intro") startLevel();
  if (action === "start") app.screen = "play";
  if (action === "pause") app.screen = "paused";
  if (action === "resume") app.screen = "play";
  if (action === "restart" || action === "replay") {
    startLevel();
    app.screen = "play";
  }
  if (action === "levels") {
    G.resetLevel();
    app.screen = "menu";
  }
  if (action === "sound") {
    app.audioPanel = true;
    A.unlock();
  }
  if (action === "audio:close") app.audioPanel = false;
  if (action.startsWith("audio:") && action !== "audio:close") {
    const [, kind, raw] = action.split(":");
    app.levels[kind] = Number(raw);
    A.setAudioLevel(kind, app.levels[kind]);
  }
  if (action.startsWith("select:")) select(action.slice(7), false);
  if (action === "tool:cursor") app.tool = "cursor";
  if (action === "tool:hand") app.tool = "hand";
  if (action === "tool:zoom-in") zoomBy(1.15);
  if (action === "tool:zoom-out") zoomBy(1 / 1.15);
  return true;
}

function refreshHover() {
  app.hover = null;
  app.hoverUnit = null;
  if (app.screen !== "play" || H.hit(app, app.pointer)) {
    canvas.style.cursor = H.hit(app, app.pointer) && H.hit(app, app.pointer) !== "absorb" ? "pointer" : "default";
    return;
  }
  const world = toWorldPoint(app.pointer);
  const unit = G.unitAt(world.x, world.y);
  if (unit) {
    app.hoverUnit = unit;
    canvas.style.cursor = "pointer";
    return;
  }
  const group = G.selectedUnits();
  if (group.length) {
    const target = G.targetAt(world.x, world.y);
    const info = G.describe(target, group);
    app.hover = { target, ...info };
  }
  if (app.gesture?.kind === "pan" && app.gesture.moved) canvas.style.cursor = "grabbing";
  else if (app.tool === "hand") canvas.style.cursor = app.hover && app.hover.target.type !== "ground" ? "pointer" : "grab";
  else canvas.style.cursor = app.hover && app.hover.target.type !== "ground" ? "pointer" : "default";
}

function clickWorld(point, shift) {
  const world = toWorldPoint(point);
  const unit = G.unitAt(world.x, world.y);
  if (unit) {
    select(unit.id, shift);
    return;
  }
  const group = G.selectedUnits();
  if (!group.length) {
    toast("Click a farmer first, then click where they should go.");
    return;
  }
  G.order(group, G.targetAt(world.x, world.y), world);
}

canvas.addEventListener("contextmenu", (event) => event.preventDefault());

canvas.addEventListener("pointerdown", (event) => {
  A.unlock();
  const point = screenPoint(event);
  app.pointer = point;
  if (app.screen === "loading") return;
  if (event.button === 0 && runAction(H.hit(app, point))) return;
  if (app.screen !== "play") return;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* Synthetic pointer events have no capture target. */
  }
  const kind = event.button === 0 ? (app.tool === "hand" ? "pan" : "box") : "pan";
  app.gesture = {
    kind,
    button: event.button,
    sx: point.x,
    sy: point.y,
    cx: app.camera.x,
    cy: app.camera.y,
    moved: false,
    shift: event.shiftKey,
  };
});

canvas.addEventListener("pointermove", (event) => {
  app.pointer = screenPoint(event);
  const gesture = app.gesture;
  if (gesture) {
    const dx = app.pointer.x - gesture.sx;
    const dy = app.pointer.y - gesture.sy;
    if (Math.hypot(dx, dy) > 6) gesture.moved = true;
    if (gesture.kind === "pan" && gesture.moved) {
      app.camera.x = gesture.cx - dx / app.camera.zoom;
      app.camera.y = gesture.cy - dy / app.camera.zoom;
      clampCamera();
    }
  }
  refreshHover();
});

canvas.addEventListener("pointerleave", () => {
  app.hover = null;
  app.hoverUnit = null;
});

canvas.addEventListener("pointerup", (event) => {
  const gesture = app.gesture;
  app.gesture = null;
  if (!gesture || app.screen !== "play") return;
  const point = screenPoint(event);
  if (!gesture.moved) {
    if (gesture.button === 0) clickWorld(point, gesture.shift || event.shiftKey);
    if (gesture.button === 2 && G.selectedUnits().length) {
      const world = toWorldPoint(point);
      G.order(G.selectedUnits(), G.targetAt(world.x, world.y), world);
    }
  } else if (gesture.kind === "box") {
    const a = toWorldPoint({ x: gesture.sx, y: gesture.sy });
    const b = toWorldPoint(point);
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    const caught = G.level.units.filter((entry) => entry.x > x0 && entry.x < x1 && entry.y - 40 > y0 && entry.y - 40 < y1);
    if (caught.length) {
      if (!gesture.shift) G.level.units.forEach((entry) => (entry.selected = false));
      caught.forEach((entry) => (entry.selected = true));
    }
  }
  refreshHover();
});

canvas.addEventListener(
  "wheel",
  (event) => {
    if (app.screen !== "play" && app.screen !== "paused") return;
    event.preventDefault();
    zoomBy(Math.exp(-event.deltaY * 0.0015), screenPoint(event));
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  app.keys.add(key);
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  if (app.screen === "intro" && (key === "enter" || key === " ")) app.screen = "play";
  if (key === "escape") {
    if (app.screen === "play" && G.selectedUnits().length) G.level.units.forEach((entry) => (entry.selected = false));
    else if (app.screen === "play") app.screen = "paused";
    else if (app.screen === "paused") app.screen = "play";
  }
  if (app.screen !== "play") return;
  if (key === "1" || key === "2" || key === "3") select(G.CREW_ORDER[Number(key) - 1], event.shiftKey);
  if (key === "h") app.tool = "hand";
  if (key === "v") app.tool = "cursor";
  if (key === "+" || key === "=") zoomBy(1.15);
  if (key === "-" || key === "_") zoomBy(1 / 1.15);
  if (key === " ") {
    const first = G.selectedUnits()[0];
    if (first) focus(first.x, first.y - 40);
  }
});

window.addEventListener("keyup", (event) => app.keys.delete(event.key.toLowerCase()));

function panWithKeys(dt) {
  let vx = 0;
  let vy = 0;
  if (app.keys.has("a") || app.keys.has("arrowleft")) vx -= 1;
  if (app.keys.has("d") || app.keys.has("arrowright")) vx += 1;
  if (app.keys.has("w") || app.keys.has("arrowup")) vy -= 1;
  if (app.keys.has("s") || app.keys.has("arrowdown")) vy += 1;
  if (!vx && !vy) return;
  const length = Math.hypot(vx, vy);
  app.camera.x += (vx / length) * (700 / app.camera.zoom) * dt;
  app.camera.y += (vy / length) * (700 / app.camera.zoom) * dt;
  clampCamera();
}

function worldView() {
  return { x: app.camera.x, y: app.camera.y, w: VIEW.w / app.camera.zoom, h: VIEW.h / app.camera.zoom };
}

function drawWorld(time, options) {
  const { x, y, zoom } = app.camera;
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, -x * dpr * zoom, -y * dpr * zoom);
  G.renderWorld(ctx, worldView(), time, options);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  app.toast.t = Math.max(0, app.toast.t - dt);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (app.screen === "loading") {
    H.drawLoading(ctx, app.load);
  } else if (app.screen === "menu") {
    const saved = { ...app.camera };
    app.camera.zoom = 0.62;
    const drift = toWorld(19 + Math.sin(time * 0.05) * 3, 18 + Math.cos(time * 0.04) * 2);
    focus(drift.x, drift.y);
    drawWorld(time, { noFog: true });
    Object.assign(app.camera, saved);
    H.drawMenu(ctx, app, time);
  } else {
    if (app.screen === "play") {
      G.updateLevel(dt);
      panWithKeys(dt);
      if (G.level.status !== "play") {
        app.screen = G.level.status;
        if (G.level.status === "won") {
          if (G.level.stars > app.best) {
            app.best = G.level.stars;
            localStorage.setItem(STARS_KEY, String(app.best));
          }
          if (G.level.score > app.bestScore) {
            app.bestScore = G.level.score;
            localStorage.setItem(SCORE_KEY, String(app.bestScore));
          }
        }
      }
    }
    drawWorld(time, { hover: app.hover, hoverUnit: app.hoverUnit });
    H.drawHUD(ctx, app, time, project);
  }
  A.sync(app.screen, Boolean(G.level.warned));
  A.ambience(dt, app.screen === "play");
  G.takeCues().forEach((name) => A.playCue(name));
  requestAnimationFrame(frame);
}

async function boot() {
  requestAnimationFrame(frame);
  await document.fonts.load('600 16px "Pixelify Sans"').catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 30));
  G.prepare();
  app.load = 0.15;
  await loadArt((amount) => {
    app.load = 0.15 + amount * 0.7;
  });
  await A.loadAudio();
  app.load = 1;
  G.resetLevel();
  app.screen = "menu";
}

boot();
