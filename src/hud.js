import { VIEW, formatClock } from "./util.js";
import { icon, images, parchment, roundedRect, text, woodPanel, wrap, drawSprite } from "./art.js";
import { CREW, CREW_ORDER, DURATION, HINTS, equippedLabel, level, progress, taskLabel, builtCount, unit } from "./game.js";

export const UI = {
  gear: { x: 1222, y: 14, w: 44, h: 44 },
  slots: CREW_ORDER.map((id, index) => ({ id, x: 14 + index * 58, y: 526, w: 52, h: 52 })),
  card: { x: 14, y: 586, w: 350, h: 120 },
  tools: [
    { id: "cursor", x: 1222, y: 500, w: 44, h: 44 },
    { id: "hand", x: 1222, y: 548, w: 44, h: 44 },
    { id: "zoom-in", x: 1222, y: 610, w: 44, h: 44 },
    { id: "zoom-out", x: 1222, y: 658, w: 44, h: 44 },
  ],
  objectives: { x: 1000, y: 68, w: 266, h: 150 },
  levelNodes: [
    { n: 1, x: 640, y: 520 },
    { n: 2, x: 556, y: 448 },
    { n: 3, x: 704, y: 378 },
    { n: 4, x: 580, y: 306 },
    { n: 5, x: 712, y: 236 },
    { n: 6, x: 600, y: 170 },
  ],
  menuButtons: [
    { id: "sound", label: "Sound", x: 462, y: 600, w: 112, h: 46 },
    { id: "shop", label: "Shop", x: 584, y: 600, w: 112, h: 46 },
    { id: "back", label: "Back", x: 706, y: 600, w: 112, h: 46 },
  ],
  start: { x: 540, y: 560, w: 200, h: 54 },
  resultButtons: [
    { id: "replay", label: "Play again", x: 470, y: 470, w: 160, h: 50 },
    { id: "levels", label: "Levels", x: 650, y: 470, w: 160, h: 50 },
  ],
  pauseButtons: [
    { id: "resume", label: "Resume", x: 540, y: 268, w: 200, h: 46 },
    { id: "restart", label: "Restart level", x: 540, y: 324, w: 200, h: 46 },
    { id: "sound", label: "Sound", x: 540, y: 380, w: 200, h: 46 },
    { id: "levels", label: "Levels", x: 540, y: 436, w: 200, h: 46 },
  ],
};

const inside = (p, box) => p.x >= box.x && p.y >= box.y && p.x <= box.x + box.w && p.y <= box.y + box.h;

const AUDIO = { x: 420, y: 210, w: 440, h: 290, trackX: 590, trackW: 210, rows: { music: 300, sfx: 370 } };
const STEP_LABELS = ["Off", "Low", "Med", "High"];
const audioClose = { x: 560, y: 424, w: 160, h: 46 };

function audioHit(p) {
  for (const [kind, y] of Object.entries(AUDIO.rows)) {
    if (Math.abs(p.y - y) > 20 || p.x < AUDIO.trackX - 20 || p.x > AUDIO.trackX + AUDIO.trackW + 20) continue;
    const step = Math.round(((p.x - AUDIO.trackX) / AUDIO.trackW) * 3);
    return `audio:${kind}:${Math.max(0, Math.min(3, step))}`;
  }
  if (inside(p, audioClose) || !inside(p, AUDIO)) return "audio:close";
  return "absorb";
}

function drawAudioPanel(ctx, app) {
  dim(ctx, 0.45);
  woodPanel(ctx, AUDIO.x, AUDIO.y, AUDIO.w, AUDIO.h, { rivets: true, radius: 12 });
  text(ctx, "Audio", 640, AUDIO.y + 46, { size: 30, weight: 700, align: "center" });
  [
    ["music", "Music"],
    ["sfx", "Sounds"],
  ].forEach(([kind, label]) => {
    const y = AUDIO.rows[kind];
    const value = app.levels[kind];
    text(ctx, label, AUDIO.x + 36, y + 7, { size: 20, weight: 700 });
    ctx.fillStyle = "#1c0f07";
    ctx.fillRect(AUDIO.trackX - 2, y - 5, AUDIO.trackW + 4, 10);
    ctx.fillStyle = "#6fcf4f";
    ctx.fillRect(AUDIO.trackX, y - 3, (AUDIO.trackW * value) / 3, 6);
    for (let step = 0; step < 4; step += 1) {
      const x = AUDIO.trackX + (AUDIO.trackW * step) / 3;
      ctx.beginPath();
      ctx.arc(x, y, step === value ? 11 : 6, 0, Math.PI * 2);
      ctx.fillStyle = step === value ? "#ffd84a" : step < value ? "#6fcf4f" : "#5a4430";
      ctx.fill();
      ctx.strokeStyle = "#1c0f07";
      ctx.lineWidth = 2;
      ctx.stroke();
      text(ctx, STEP_LABELS[step], x, y + 30, { size: 13, align: "center", color: step === value ? "#ffd84a" : "#d9c39a" });
    }
  });
  button(ctx, audioClose, "Done", { primary: true });
}

export function hit(app, p) {
  if (app.audioPanel) return audioHit(p);
  if (app.screen === "menu") {
    const node = UI.levelNodes.find((entry) => Math.hypot(entry.x - p.x, entry.y - p.y) < 34);
    if (node) return node.n === 1 ? "intro" : "locked";
    const menuButton = UI.menuButtons.find((button) => inside(p, button));
    if (menuButton) return menuButton.id === "sound" ? "sound" : "locked";
    return null;
  }
  if (app.screen === "intro") return inside(p, UI.start) ? "start" : "absorb";
  if (app.screen === "won" || app.screen === "lost") {
    const button = UI.resultButtons.find((entry) => inside(p, entry));
    return button ? button.id : "absorb";
  }
  if (app.screen === "paused") {
    const button = UI.pauseButtons.find((entry) => inside(p, entry));
    return button ? button.id : "absorb";
  }
  if (inside(p, UI.gear)) return "pause";
  const slot = UI.slots.find((entry) => inside(p, entry));
  if (slot) return `select:${slot.id}`;
  const tool = UI.tools.find((entry) => inside(p, entry));
  if (tool) return `tool:${tool.id}`;
  if (inside(p, UI.card) || inside(p, UI.objectives)) return "absorb";
  return null;
}

function button(ctx, box, label, options = {}) {
  woodPanel(ctx, box.x, box.y, box.w, box.h, {
    fill: options.primary ? "#c77b2c" : options.dim ? "rgba(70, 48, 30, 0.95)" : "#8a5a2e",
    rim: options.primary ? "#ffd27a" : "#d4a46a",
    radius: 8,
  });
  text(ctx, label, box.x + box.w / 2, box.y + box.h / 2 + 7, { size: options.size || 19, align: "center", weight: 700 });
}

function bar(ctx, x, y, w, h, value, color) {
  ctx.fillStyle = "#14100c";
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = "#2a3644";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, value)), h);
  ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, value)), 2);
}

function drawResources(ctx) {
  woodPanel(ctx, 14, 14, 336, 50);
  icon(ctx, "wood", 28, 24, 30);
  text(ctx, String(level.wood), 64, 47, { size: 22, weight: 700 });
  icon(ctx, "drop", 118, 24, 30);
  text(ctx, `${level.drum}/100`, 152, 47, { size: 22, weight: 700 });
  icon(ctx, "hammer", 238, 24, 30);
  text(ctx, `${builtCount()}/${level.fence.length}`, 274, 47, { size: 22, weight: 700 });
  woodPanel(ctx, 360, 14, 168, 50);
  text(ctx, "SCORE", 376, 32, { size: 13, color: "#f0b54a" });
  text(ctx, level.score.toLocaleString("en-US"), 376, 50, { size: 22, weight: 700 });
}

function drawTimer(ctx, time) {
  const critical = level.time <= 60;
  const flash = critical && Math.sin(time * 8) > 0;
  woodPanel(ctx, 540, 8, 200, 66, { fill: critical ? "rgba(98, 18, 12, 0.95)" : "rgba(60, 22, 14, 0.95)", rim: critical ? "#ff8a6a" : "#c98a5a", radius: 10 });
  text(ctx, formatClock(level.time), 640, 58, {
    size: 46,
    weight: 700,
    align: "center",
    color: flash ? "#ffd2c4" : critical ? "#ff6a4a" : "#fff7e8",
  });
}

function drawObjectives(ctx) {
  const box = UI.objectives;
  woodPanel(ctx, box.x, box.y, box.w, box.h, { fill: "rgba(42, 26, 15, 0.9)" });
  text(ctx, "OBJECTIVES:", box.x + 14, box.y + 28, { size: 18, weight: 700 });
  const p = progress();
  [
    ["Fill Water Drum", p.water],
    ["Till Soil", p.till],
    ["Build Wooden Fence", p.fence],
  ].forEach(([label, value], index) => {
    const y = box.y + 54 + index * 34;
    const done = value >= 1;
    text(ctx, `- ${label}: ${Math.round(value * 100)}%`, box.x + 14, y, { size: 15, color: done ? "#9be37a" : "#f3e6c8" });
    bar(ctx, box.x + 22, y + 7, box.w - 44, 8, value, done ? "#6fcf4f" : "#3d8be0");
  });
}

function drawGear(ctx) {
  woodPanel(ctx, UI.gear.x, UI.gear.y, UI.gear.w, UI.gear.h, { radius: 8 });
  icon(ctx, "gear", UI.gear.x + 9, UI.gear.y + 9, 26);
}

function drawSlots(ctx, app) {
  const tools = { ade: "bucket", mei: "hoe", eli: "axe" };
  UI.slots.forEach((slot, index) => {
    const entry = unit(slot.id);
    woodPanel(ctx, slot.x, slot.y, slot.w, slot.h, {
      fill: entry.selected ? "rgba(120, 76, 30, 0.95)" : "rgba(52, 31, 18, 0.92)",
      rim: entry.selected ? "#ffd84a" : "#b9874f",
      radius: 7,
    });
    icon(ctx, tools[slot.id], slot.x + 10, slot.y + 9, 32);
    text(ctx, String(index + 1), slot.x + slot.w - 9, slot.y + slot.h - 6, { size: 12, align: "right", color: "#ffd27a" });
    if (entry.task !== "idle") {
      ctx.fillStyle = "#7fe06a";
      ctx.beginPath();
      ctx.arc(slot.x + 9, slot.y + 9, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const hovered = UI.slots.find((slot) => inside(app.pointer, slot));
  if (hovered) {
    const entry = unit(hovered.id);
    const label = `${entry.name} · ${entry.role}`;
    const width = wrap(ctx, label, 400, 14).width + 20;
    woodPanel(ctx, hovered.x, hovered.y - 34, width, 28, { radius: 6 });
    text(ctx, label, hovered.x + 10, hovered.y - 15, { size: 14 });
  }
}

function drawCard(ctx) {
  const box = UI.card;
  const entry = level.units.find((candidate) => candidate.selected);
  woodPanel(ctx, box.x, box.y, box.w, box.h, { fill: "rgba(42, 26, 15, 0.94)" });
  const frame = { x: box.x + 10, y: box.y + 10, w: 100, h: 100 };
  roundedRect(ctx, frame.x, frame.y, frame.w, frame.h, 6);
  const gradient = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.h);
  gradient.addColorStop(0, "#6f9fca");
  gradient.addColorStop(1, "#2f4e6e");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "#d4a46a";
  ctx.lineWidth = 2;
  ctx.stroke();
  if (!entry) {
    text(ctx, "?", frame.x + 50, frame.y + 66, { size: 46, align: "center", weight: 700, color: "#dfe9f3" });
    text(ctx, "No farmer selected", box.x + 124, box.y + 40, { size: 19, weight: 700 });
    text(ctx, "Click a farmer, or press", box.x + 124, box.y + 68, { size: 14, color: "#d8c8a8" });
    text(ctx, "1, 2 or 3.", box.x + 124, box.y + 88, { size: 14, color: "#d8c8a8" });
    return;
  }
  const face = images[entry.face];
  ctx.save();
  roundedRect(ctx, frame.x + 2, frame.y + 2, frame.w - 4, frame.h - 4, 5);
  ctx.clip();
  if (face) {
    const scale = Math.max((frame.w - 4) / face.width, (frame.h - 4) / face.height);
    const w = face.width * scale;
    const h = face.height * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(face, frame.x + frame.w / 2 - w / 2, frame.y + frame.h - h + 2, w, h);
  } else drawSprite(ctx, entry.sprite, frame.x + frame.w / 2, frame.y + frame.h + 40, { scale: 1.5 });
  ctx.restore();
  const tx = box.x + 124;
  text(ctx, entry.name, tx, box.y + 34, { size: 24, weight: 700, color: "#ffffff" });
  text(ctx, entry.role, tx, box.y + 56, { size: 16, color: "#6cc0ff" });
  text(ctx, "Equipped:", tx, box.y + 82, { size: 15, color: "#f0b54a" });
  text(ctx, equippedLabel(entry), tx + 78, box.y + 82, { size: 15 });
  text(ctx, "Task:", tx, box.y + 104, { size: 15, color: "#f0b54a" });
  text(ctx, taskLabel(entry), tx + 46, box.y + 104, { size: 15 });
}

function drawTools(ctx, app) {
  UI.tools.forEach((tool) => {
    const active = app.tool === tool.id;
    woodPanel(ctx, tool.x, tool.y, tool.w, tool.h, {
      fill: active ? "#2f7fd8" : "rgba(52, 31, 18, 0.92)",
      rim: active ? "#bfe0ff" : "#b9874f",
      radius: 8,
    });
    if (tool.id === "cursor" || tool.id === "hand") icon(ctx, tool.id, tool.x + 10, tool.y + 10, 24);
    else text(ctx, tool.id === "zoom-in" ? "+" : "−", tool.x + tool.w / 2, tool.y + 31, { size: 26, weight: 700, align: "center" });
  });
  const hovered = UI.tools.find((tool) => inside(app.pointer, tool));
  if (hovered) {
    const labels = { cursor: "Select  (V)", hand: "Pan  (H)", "zoom-in": "Zoom in  (+)", "zoom-out": "Zoom out  (−)" };
    const label = labels[hovered.id];
    const width = wrap(ctx, label, 300, 14).width + 20;
    woodPanel(ctx, hovered.x - width - 8, hovered.y + 8, width, 28, { radius: 6 });
    text(ctx, label, hovered.x - width + 2, hovered.y + 27, { size: 14 });
  }
}

function tooltip(ctx, value, x, y, options = {}) {
  const { lines, width } = wrap(ctx, value, options.max || 210, 15);
  const w = width + 22;
  const h = lines.length * 19 + 14;
  const bx = Math.round(x - w / 2);
  const by = Math.round(y - h - 12);
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  woodPanel(ctx, bx, by, w, h, { fill: "rgba(46, 28, 16, 0.94)", rim: "#e0b878", radius: 6 });
  if (options.pointer !== false) {
    ctx.fillStyle = "#e0b878";
    ctx.beginPath();
    ctx.moveTo(x - 7, by + h - 1);
    ctx.lineTo(x + 7, by + h - 1);
    ctx.lineTo(x, by + h + 9);
    ctx.closePath();
    ctx.fill();
  }
  lines.forEach((line, index) => text(ctx, line, x, by + 22 + index * 19, { size: 15, align: "center" }));
  ctx.restore();
}

function drawHints(ctx, app, project) {
  HINTS.forEach((hint) => {
    const state = (level.hints[hint.id] ||= { shown: -1, gone: -1 });
    if (state.shown < 0 && hint.show() && !hint.done()) state.shown = level.elapsed;
    if (state.shown >= 0 && state.gone < 0 && hint.done()) state.gone = level.elapsed;
    if (state.shown < 0) return;
    const fadeIn = Math.min(1, (level.elapsed - state.shown) * 3);
    const fadeOut = state.gone < 0 ? 1 : 1 - (level.elapsed - state.gone) * 2;
    const alpha = Math.min(fadeIn, fadeOut);
    if (alpha <= 0) return;
    const anchor = project(hint.at());
    const margin = { left: 140, right: VIEW.w - 300, top: 120, bottom: VIEW.h - 150 };
    const off = anchor.x < margin.left || anchor.x > margin.right || anchor.y < margin.top || anchor.y > margin.bottom;
    const x = Math.max(margin.left, Math.min(margin.right, anchor.x));
    const y = Math.max(margin.top, Math.min(margin.bottom, anchor.y));
    tooltip(ctx, hint.text, x, y - Math.sin(level.elapsed * 3) * 2, { alpha, pointer: !off });
    if (off) {
      const angle = Math.atan2(anchor.y - y, anchor.x - x);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x + Math.cos(angle) * 24, y - 6 + Math.sin(angle) * 24);
      ctx.rotate(angle);
      ctx.fillStyle = "#ffd27a";
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

function drawVignette(ctx, time) {
  if (level.time > 60 || level.status !== "play") return;
  const urgency = level.time <= 10 ? 1 : 0.65;
  const pulse = (0.55 + Math.sin(time * 5) * 0.45) * urgency;
  const gradient = ctx.createRadialGradient(VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.38, VIEW.w / 2, VIEW.h / 2, VIEW.w * 0.62);
  gradient.addColorStop(0, "rgba(255, 60, 20, 0)");
  gradient.addColorStop(0.7, `rgba(235, 70, 20, ${0.22 * pulse})`);
  gradient.addColorStop(1, `rgba(210, 20, 10, ${0.7 * pulse})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
}

function drawWarning(ctx) {
  const t = level.warningClock;
  if (t < 0 || t > 4.2) return;
  const appear = Math.min(1, t * 4);
  const leave = t > 3.6 ? 1 - (t - 3.6) / 0.6 : 1;
  const scale = 0.8 + 0.2 * appear + Math.sin(Math.min(1, t * 4) * Math.PI) * 0.06;
  ctx.save();
  ctx.globalAlpha = Math.min(appear, leave);
  ctx.translate(640, 150);
  ctx.scale(scale, scale);
  parchment(ctx, -220, -56, 440, 112);
  text(ctx, "Warning: 1 Minute", 0, -8, { size: 34, weight: 700, align: "center", color: "#c41e12", shadowColor: "rgba(80, 20, 0, 0.25)" });
  text(ctx, "Until Drought!", 0, 34, { size: 34, weight: 700, align: "center", color: "#c41e12", shadowColor: "rgba(80, 20, 0, 0.25)" });
  ctx.restore();
}

function drawToast(ctx, app) {
  if (app.toast.t <= 0) return;
  const alpha = Math.min(1, app.toast.t * 3);
  const { width } = wrap(ctx, app.toast.text, 700, 16);
  const w = width + 36;
  ctx.save();
  ctx.globalAlpha = alpha;
  woodPanel(ctx, 640 - w / 2, 470, w, 38, { radius: 8 });
  text(ctx, app.toast.text, 640, 495, { size: 16, align: "center" });
  ctx.restore();
}

function drawCursorLabel(ctx, app) {
  if (!app.hover || app.gesture) return;
  const { label, ok } = app.hover;
  const { width } = wrap(ctx, label, 300, 14);
  const x = app.pointer.x + 18;
  const y = app.pointer.y + 14;
  roundedRect(ctx, x, y, width + 16, 24, 5);
  ctx.fillStyle = ok ? "rgba(40, 26, 14, 0.92)" : "rgba(70, 20, 14, 0.92)";
  ctx.fill();
  ctx.strokeStyle = ok ? "#ffd27a" : "#ff8a6a";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  text(ctx, label, x + 8, y + 17, { size: 14, color: ok ? "#fff3c4" : "#ffc2b0" });
}

function drawBox(ctx, app) {
  const gesture = app.gesture;
  if (!gesture || gesture.kind !== "box" || !gesture.moved) return;
  const x = Math.min(gesture.sx, app.pointer.x);
  const y = Math.min(gesture.sy, app.pointer.y);
  const w = Math.abs(app.pointer.x - gesture.sx);
  const h = Math.abs(app.pointer.y - gesture.sy);
  ctx.fillStyle = "rgba(120, 190, 255, 0.14)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#8fc8ff";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
}

export function drawHUD(ctx, app, time, project) {
  ctx.fillStyle = `rgba(255, 140, 40, ${0.1 * Math.min(1, level.elapsed / DURATION)})`;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  drawVignette(ctx, time);
  drawHints(ctx, app, project);
  drawBox(ctx, app);
  drawResources(ctx);
  drawTimer(ctx, time);
  drawGear(ctx);
  drawObjectives(ctx);
  drawSlots(ctx, app);
  drawCard(ctx);
  drawTools(ctx, app);
  drawWarning(ctx);
  drawToast(ctx, app);
  drawCursorLabel(ctx, app);
  if (app.screen === "intro") drawIntro(ctx);
  if (app.screen === "paused") drawPause(ctx, app);
  if (app.screen === "won" || app.screen === "lost") drawResult(ctx, app);
  if (app.audioPanel) drawAudioPanel(ctx, app);
}

function dim(ctx, alpha = 0.55) {
  ctx.fillStyle = `rgba(10, 8, 4, ${alpha})`;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
}

function drawIntro(ctx) {
  dim(ctx, 0.5);
  parchment(ctx, 330, 96, 620, 540);
  text(ctx, "Level 1 · Drought Prep", 640, 158, { size: 32, weight: 700, align: "center", color: "#4a2a10", shadow: false });
  text(ctx, `A drought hits in ${formatClock(DURATION)}. Get the farm ready.`, 640, 192, {
    size: 18,
    align: "center",
    color: "#6a4422",
    shadow: false,
  });
  const jobs = {
    ade: "Find buckets, then keep the drum filling.",
    mei: "Till every patch of the soil plot.",
    eli: "Chop trees, then fence in the soil.",
  };
  CREW_ORDER.forEach((id, index) => {
    const y = 226 + index * 96;
    const crew = CREW[id];
    roundedRect(ctx, 380, y, 80, 80, 6);
    ctx.fillStyle = "#4f7aa3";
    ctx.fill();
    ctx.strokeStyle = "#8a5a2b";
    ctx.lineWidth = 2;
    ctx.stroke();
    const face = images[crew.face];
    if (face) {
      ctx.save();
      roundedRect(ctx, 382, y + 2, 76, 76, 5);
      ctx.clip();
      const scale = Math.max(76 / face.width, 76 / face.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(face, 420 - (face.width * scale) / 2, y + 80 - face.height * scale, face.width * scale, face.height * scale);
      ctx.restore();
    }
    text(ctx, crew.name, 480, y + 28, { size: 24, weight: 700, color: "#3a2210", shadow: false });
    text(ctx, crew.role, 480, y + 50, { size: 16, color: "#2a6aa8", shadow: false });
    text(ctx, jobs[id], 480, y + 72, { size: 16, color: "#5a3a1c", shadow: false });
  });
  text(ctx, "Click a farmer, then click a spot or task. Drag to pan. Scroll to zoom.", 640, 536, {
    size: 15,
    align: "center",
    color: "#6a4422",
    shadow: false,
  });
  button(ctx, UI.start, "Start", { primary: true, size: 22 });
}

function drawPause(ctx, app) {
  dim(ctx);
  woodPanel(ctx, 490, 186, 300, 320, { rivets: true });
  text(ctx, "Paused", 640, 236, { size: 30, weight: 700, align: "center" });
  UI.pauseButtons.forEach((entry, index) => {
    button(ctx, entry, entry.label, { primary: index === 0 });
  });
}

function drawResult(ctx, app) {
  const won = app.screen === "won";
  dim(ctx, 0.5);
  parchment(ctx, 420, 170, 440, 380);
  text(ctx, won ? "Farm Ready!" : "The Drought Hit", 640, 232, {
    size: 36,
    weight: 700,
    align: "center",
    color: won ? "#2f6a1e" : "#b0220f",
    shadow: false,
  });
  if (won) {
    [0, 1, 2].forEach((index) => icon(ctx, index < level.stars ? "star" : "star-empty", 562 + index * 56, 254, 46));
    text(ctx, `${formatClock(level.time)} to spare`, 640, 318, { size: 18, align: "center", color: "#5a3a1c", shadow: false });
    text(ctx, `Score ${level.score.toLocaleString("en-US")}`, 640, 348, {
      size: 26,
      weight: 700,
      align: "center",
      color: "#2f6a1e",
      shadow: false,
    });
    text(ctx, `includes +${level.timeBonus} for time left`, 640, 372, { size: 15, align: "center", color: "#6a4422", shadow: false });
  } else {
    text(ctx, "The ground hardened before the farm was ready.", 640, 282, { size: 16, align: "center", color: "#5a3a1c", shadow: false });
    text(ctx, `Score ${level.score.toLocaleString("en-US")}`, 640, 322, {
      size: 24,
      weight: 700,
      align: "center",
      color: "#5a3a1c",
      shadow: false,
    });
  }
  const p = progress();
  [
    ["Water drum", p.water],
    ["Soil tilled", p.till],
    ["Fence built", p.fence],
  ].forEach(([label, value], index) => {
    const y = 404 + index * 22;
    text(ctx, label, 470, y, { size: 16, color: "#4a2a10", shadow: false });
    bar(ctx, 600, y - 11, 160, 10, value, value >= 1 ? "#4caf3a" : "#3d8be0");
    text(ctx, `${Math.round(value * 100)}%`, 810, y, { size: 16, align: "right", color: "#4a2a10", shadow: false });
  });
  UI.resultButtons.forEach((entry, index) => button(ctx, entry, won || index ? entry.label : "Try again", { primary: index === 0 }));
}

export function drawMenu(ctx, app, time) {
  dim(ctx, 0.35);
  woodPanel(ctx, 440, 30, 400, 640, { fill: "rgba(72, 112, 44, 0.95)", rim: "#e0b878", rivets: true, radius: 12 });
  text(ctx, "LEVELS", 640, 92, { size: 42, weight: 700, align: "center", color: "#fff1c8" });
  woodPanel(ctx, 560, 108, 160, 36, { radius: 18 });
  icon(ctx, "star", 576, 113, 26);
  text(ctx, app.bestScore.toLocaleString("en-US"), 668, 134, { size: 18, weight: 700, align: "center", color: "#ffd84a" });
  ctx.strokeStyle = "#c69a62";
  ctx.lineWidth = 24;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  UI.levelNodes.forEach((node, index) => (index ? ctx.lineTo(node.x, node.y) : ctx.moveTo(node.x, node.y)));
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 3;
  ctx.setLineDash([2, 10]);
  ctx.stroke();
  ctx.setLineDash([]);
  UI.levelNodes.forEach((node) => {
    const open = node.n === 1;
    const pulse = open ? Math.sin(time * 4) * 3 : 0;
    ctx.beginPath();
    ctx.arc(node.x, node.y, 30 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = "#2a1a0c";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(node.x, node.y, 26 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = open ? "#f0b429" : "#9aa3a9";
    ctx.fill();
    ctx.strokeStyle = open ? "#fff1b8" : "#c9cfd3";
    ctx.lineWidth = 3;
    ctx.stroke();
    if (open) {
      text(ctx, "1", node.x, node.y + 10, { size: 28, weight: 700, align: "center", color: "#3a2210", shadow: false });
      [0, 1, 2].forEach((index) => icon(ctx, index < app.best ? "star" : "star-empty", node.x - 36 + index * 24, node.y + 30, 22));
    } else icon(ctx, "lock", node.x - 13, node.y - 13, 26);
  });
  UI.menuButtons.forEach((entry) => {
    button(ctx, entry, entry.id === "sound" ? "Audio" : entry.label, { dim: entry.id !== "sound", size: 16 });
  });
  drawToast(ctx, app);
  if (app.audioPanel) drawAudioPanel(ctx, app);
}

export function drawLoading(ctx, amount) {
  ctx.fillStyle = "#1a2212";
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  text(ctx, "Preparing the farm…", 640, 330, { size: 28, weight: 700, align: "center" });
  bar(ctx, 440, 360, 400, 14, amount, "#6fcf4f");
}
