const WORLD = { w: 960, h: 640 };
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const hint = document.getElementById("hint");

const keys = new Set();
const spriteNames = ["farmer", "cow", "barn", "hay-bale", "haystack", "fence", "wheat", "vegetables", "tree"];
const sprites = {};

const player = {
  x: 500,
  y: 430,
  facing: 1,
  bob: 0,
};

const cows = [
  { x: 150, y: 118, homeX: 150, homeY: 118, tx: 180, ty: 130, facing: 1, speed: 18 },
  { x: 250, y: 250, homeX: 250, homeY: 250, tx: 300, ty: 230, facing: -1, speed: 22 },
  { x: 390, y: 210, homeX: 390, homeY: 210, tx: 340, ty: 240, facing: 1, speed: 16 },
  { x: 90, y: 360, homeX: 90, homeY: 360, tx: 140, ty: 390, facing: 1, speed: 20 },
];

const fences = [
  [40, 168, 560, 168],
  [40, 168, 40, 300],
  [40, 300, 250, 330],
  [700, 300, 930, 300],
  [930, 300, 930, 500],
  [80, 470, 250, 470],
  [80, 470, 80, 580],
  [80, 580, 250, 600],
];

const barn = { x: 620, y: 150, w: 250, h: 175 };

const spots = [
  {
    x: 745,
    y: 300,
    label: "barn",
    lines: ["The barn smells like warm hay.", "Tools hang just inside the door."],
  },
  {
    x: 165,
    y: 530,
    label: "garden",
    lines: ["You pinch a few weeds.", "The greens look almost ready."],
  },
  {
    x: 470,
    y: 575,
    label: "rows",
    lines: ["These rows were watered this morning.", "A few leaves shiver in the breeze."],
  },
  {
    x: 800,
    y: 450,
    label: "wheat",
    lines: ["The wheat is tall and gold.", "Harvest can wait one more day."],
  },
];

let message = "A quiet morning on the farm.";
let messageTimer = 4;

function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function loadSprites() {
  return Promise.all(
    spriteNames.map(
      (name) =>
        new Promise((resolve) => {
          const image = new Image();
          image.onload = () => {
            sprites[name] = knockOutBackground(image);
            resolve();
          };
          image.onerror = () => resolve();
          image.src = `sprites/${name}.svg`;
        }),
    ),
  );
}

function knockOutBackground(image) {
  const scratch = document.createElement("canvas");
  scratch.width = image.naturalWidth || image.width;
  scratch.height = image.naturalHeight || image.height;
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  scratchCtx.drawImage(image, 0, 0);
  const frame = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
  const { data, width, height } = frame;
  const seen = new Uint8Array(width * height);
  const stack = [];
  const cornerR = data[0];
  const cornerG = data[1];
  const cornerB = data[2];
  const cornerA = data[3];
  const cornerSpan = Math.max(cornerR, cornerG, cornerB) - Math.min(cornerR, cornerG, cornerB);
  const keyed = cornerA > 20 && cornerR > 210 && cornerG > 210 && cornerB > 200 && cornerSpan < 36;
  const isOpen = (index) => {
    const offset = index * 4;
    if (data[offset + 3] <= 20) return true;
    if (!keyed) return false;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    return min >= 198 && max - min < 46;
  };
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (seen[index] || !isOpen(index)) return;
    seen[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < width; x += 1) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const index = stack.pop();
    if (data[index * 4 + 3] > 20) data[index * 4 + 3] = 0;
    const x = index % width;
    const y = (index - x) / width;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  scratchCtx.putImageData(frame, 0, 0);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= 12) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX) return scratch;
  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const cropped = document.createElement("canvas");
  cropped.width = maxX - minX + 1;
  cropped.height = maxY - minY + 1;
  cropped.getContext("2d").drawImage(
    scratch,
    minX,
    minY,
    cropped.width,
    cropped.height,
    0,
    0,
    cropped.width,
    cropped.height,
  );
  return cropped;
}

function drawSprite(name, x, y, w, h, flip = 1) {
  const image = sprites[name];
  if (!image) return false;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, -w / 2, -h, w, h);
  ctx.restore();
  return true;
}

function fillRegion(x, y, w, h, colors) {
  const size = 8;
  for (let py = y; py < y + h; py += size) {
    for (let px = x; px < x + w; px += size) {
      const tone = hash(px, py);
      ctx.fillStyle = colors[Math.floor(tone * colors.length) % colors.length];
      ctx.fillRect(px, py, size, size);
    }
  }
}

function drawGround() {
  fillRegion(0, 0, WORLD.w, WORLD.h, ["#74a64a", "#7cae4e", "#68963f", "#86b856"]);
  fillRegion(0, 0, WORLD.w, 150, ["#e2b84a", "#d7a73a", "#efc85e", "#c99632"]);
  fillRegion(640, 360, 320, 210, ["#e2b84a", "#d7a73a", "#efc85e", "#c99632"]);
  fillRegion(70, 490, 190, 120, ["#5d8a38", "#6b9444", "#4f7830"]);
  fillRegion(340, 530, 280, 90, ["#628b3c", "#567a34", "#6e9846"]);

  ctx.strokeStyle = "#c6a06a";
  ctx.lineWidth = 58;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-10, 300);
  ctx.quadraticCurveTo(260, 330, 500, 410);
  ctx.quadraticCurveTo(700, 470, 990, 500);
  ctx.moveTo(500, 410);
  ctx.quadraticCurveTo(430, 520, 300, 660);
  ctx.stroke();

  ctx.strokeStyle = "#d8b888";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(10, 286);
  ctx.quadraticCurveTo(270, 318, 500, 396);
  ctx.quadraticCurveTo(690, 454, 970, 486);
  ctx.moveTo(488, 404);
  ctx.quadraticCurveTo(424, 508, 310, 640);
  ctx.stroke();
}

function drawFenceFallback(x1, y1, x2, y2) {
  ctx.strokeStyle = "#7a4e2a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawFences() {
  for (const [x1, y1, x2, y2] of fences) {
    const length = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.round(length / 36));
    let drawn = false;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (drawSprite("fence", x, y + 8, 48, 36)) drawn = true;
    }
    if (!drawn) drawFenceFallback(x1, y1, x2, y2);
  }
}

function drawCow(cow, time) {
  const bob = Math.sin(time * 2 + cow.x) * 2;
  if (!drawSprite("cow", cow.x, cow.y + bob, 108, 78, cow.facing)) {
    ctx.save();
    ctx.translate(cow.x, cow.y + bob);
    ctx.scale(cow.facing, 1);
    ctx.fillStyle = "#f4f4f4";
    ctx.fillRect(-28, -32, 56, 28);
    ctx.fillStyle = "#222";
    ctx.fillRect(-20, -28, 12, 10);
    ctx.fillRect(4, -22, 14, 8);
    ctx.restore();
  }
}

function drawFarmer(time) {
  const bob = Math.sin(time * 8) * (keys.size ? 2 : 0.4);
  if (!drawSprite("farmer", player.x, player.y + bob, 48, 72, player.facing)) {
    ctx.save();
    ctx.translate(player.x, player.y + bob);
    ctx.fillStyle = "#f2f2f2";
    ctx.fillRect(-8, -36, 16, 14);
    ctx.fillStyle = "#2d5bd6";
    ctx.fillRect(-9, -22, 18, 16);
    ctx.fillStyle = "#1b1b1b";
    ctx.fillRect(-8, -48, 16, 12);
    ctx.restore();
  }
}

function drawHud() {
  ctx.fillStyle = "rgba(246, 241, 228, 0.92)";
  ctx.fillRect(16, 16, 430, 52);
  ctx.strokeStyle = "#6b3a1f";
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, 430, 52);
  ctx.fillStyle = "#2b2118";
  ctx.font = "10px 'Press Start 2P', monospace";
  ctx.fillText("GREENFIELD FARM", 28, 36);
  ctx.font = "8px 'Press Start 2P', monospace";
  ctx.fillText(message, 28, 56);
}

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / length));
  const x = x1 + t * dx;
  const y = y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function blocked(x, y) {
  if (x < 24 || y < 24 || x > WORLD.w - 24 || y > WORLD.h - 18) return true;
  if (x > barn.x + 20 && x < barn.x + barn.w - 10 && y > barn.y + 30 && y < barn.y + barn.h) return true;
  return fences.some(([x1, y1, x2, y2]) => segmentDistance(x, y, x1, y1, x2, y2) < 12);
}

function tryMove(dx, dy) {
  if (!blocked(player.x + dx, player.y)) player.x += dx;
  if (!blocked(player.x, player.y + dy)) player.y += dy;
}

function nearestSpot() {
  const all = [
    ...spots,
    ...cows.map((cow, index) => ({
      x: cow.x,
      y: cow.y,
      label: `cow-${index}`,
      lines: ["The cow blinks and moos.", "She seems happy with the grass."],
    })),
  ];
  let best = null;
  let bestDistance = 72;
  for (const spot of all) {
    const distance = Math.hypot(player.x - spot.x, player.y - spot.y);
    if (distance < bestDistance) {
      best = spot;
      bestDistance = distance;
    }
  }
  return best;
}

function update(dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (dx || dy) {
    const length = Math.hypot(dx, dy);
    tryMove((dx / length) * 140 * dt, (dy / length) * 140 * dt);
    if (dx) player.facing = dx > 0 ? 1 : -1;
  }

  for (const cow of cows) {
    const step = cow.speed * dt;
    const toX = cow.tx - cow.x;
    const toY = cow.ty - cow.y;
    const distance = Math.hypot(toX, toY);
    if (distance < 4) {
      cow.tx = cow.homeX + (hash(Math.floor(cow.x), Date.now() % 997) - 0.5) * 80;
      cow.ty = cow.homeY + (hash(Date.now() % 991, Math.floor(cow.y)) - 0.5) * 50;
    } else {
      cow.x += (toX / distance) * step;
      cow.y += (toY / distance) * step;
      if (Math.abs(toX) > 1) cow.facing = toX > 0 ? 1 : -1;
    }
  }

  if (messageTimer > 0) messageTimer -= dt;
  else {
    const near = nearestSpot();
    message = near ? "Press E" : "A quiet morning on the farm.";
  }
}

function render(time) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, WORLD.w, WORLD.h);
  drawGround();
  drawFences();

  const layers = [
    { y: 250, draw: () => drawSprite("haystack", 210, 250, 110, 90) },
    { y: 300, draw: () => drawSprite("hay-bale", 690, 300, 54, 40) },
    { y: 310, draw: () => drawSprite("barn", 760, 310, 250, 190) },
    { y: 330, draw: () => drawSprite("hay-bale", 900, 330, 50, 36) },
    { y: 575, draw: () => drawSprite("vegetables", 165, 575, 170, 110) },
    { y: 600, draw: () => drawSprite("vegetables", 470, 600, 200, 90) },
    { y: 630, draw: () => drawSprite("tree", 70, 630, 150, 170) },
    { y: 640, draw: () => drawSprite("tree", 900, 640, 170, 190) },
    ...cows.map((cow) => ({ y: cow.y, draw: () => drawCow(cow, time) })),
    { y: player.y, draw: () => drawFarmer(time) },
  ];

  const wheatSpots = [
    [80, 90],
    [220, 70],
    [420, 100],
    [560, 80],
    [760, 86],
    [880, 70],
    [700, 450],
    [820, 520],
    [910, 410],
  ];
  for (const [x, y] of wheatSpots) layers.push({ y, draw: () => drawSprite("wheat", x, y, 76, 84) });

  layers.sort((a, b) => a.y - b.y);
  for (const layer of layers) layer.draw();
  if (!sprites.wheat) {
    for (const [x, y] of wheatSpots) {
      ctx.fillStyle = "#e6c15a";
      ctx.fillRect(x - 14, y - 36, 28, 36);
    }
  }
  if (!sprites.vegetables) {
    ctx.fillStyle = "#3f7a32";
    ctx.fillRect(90, 500, 150, 70);
    ctx.fillStyle = "#4c8638";
    ctx.fillRect(360, 545, 220, 55);
  }
  if (!sprites.haystack) {
    ctx.fillStyle = "#e0b24a";
    ctx.beginPath();
    ctx.ellipse(210, 230, 40, 28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (!sprites.barn) {
    ctx.fillStyle = "#c5362b";
    ctx.fillRect(barn.x, barn.y, barn.w, barn.h - 30);
    ctx.fillStyle = "#5d6368";
    ctx.beginPath();
    ctx.moveTo(barn.x - 8, barn.y + 20);
    ctx.lineTo(barn.x + barn.w / 2, barn.y - 40);
    ctx.lineTo(barn.x + barn.w + 8, barn.y + 20);
    ctx.fill();
  }
  if (!sprites.tree) {
    ctx.fillStyle = "#1c3a22";
    ctx.beginPath();
    ctx.moveTo(70, 480);
    ctx.lineTo(10, 630);
    ctx.lineTo(130, 630);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(900, 470);
    ctx.lineTo(820, 640);
    ctx.lineTo(980, 640);
    ctx.fill();
  }
  drawHud();
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render(now / 1000);
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  keys.add(key);
  if (key === "e") {
    const near = nearestSpot();
    if (!near) {
      message = "Nothing here but grass.";
    } else {
      const line = near.lines[Math.floor(hash(player.x | 0, player.y | 0) * near.lines.length)];
      message = line;
    }
    messageTimer = 2.4;
    hint.textContent = message;
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

loadSprites().then(() => {
  hint.textContent = "Arrows or WASD to walk · E to tend, pet, or look";
});
requestAnimationFrame(frame);
