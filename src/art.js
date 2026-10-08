export const SPRITES = {
  barn: { w: 316, raster: 1024 },
  drum: { h: 64 },
  bucket: { h: 26 },
  logs: { w: 86 },
  pine: { h: 170, raster: 768 },
  oak: { h: 148, raster: 768, filter: "hue-rotate(32deg) saturate(1.45) brightness(1.06)" },
  stump: { w: 40 },
  cow: { w: 80 },
  haystack: { w: 108 },
  hay: { w: 52 },
  corn: { w: 78 },
  bush: { w: 46 },
  ade: { h: 90, raster: 768 },
  mei: { h: 90, raster: 768 },
  eli: { h: 90, raster: 768 },
  "ade-face": { h: 100 },
  "mei-face": { h: 100 },
  "eli-face": { h: 100 },
};

export const images = {};

function knockOut(image, size, filter) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (filter) context.filter = filter;
  context.drawImage(image, 0, 0, size, size);
  context.filter = "none";
  const frame = context.getImageData(0, 0, size, size);
  const { data } = frame;
  const buckets = new Map();
  let clearBorder = 0;
  const sampleBorder = (index) => {
    const offset = index * 4;
    if (data[offset + 3] < 20) {
      clearBorder += 1;
      return;
    }
    const key = ((data[offset] >> 4) << 8) | ((data[offset + 1] >> 4) << 4) | (data[offset + 2] >> 4);
    const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += data[offset];
    entry.g += data[offset + 1];
    entry.b += data[offset + 2];
    buckets.set(key, entry);
  };
  for (let edge = 0; edge < size; edge += 1) {
    sampleBorder(edge);
    sampleBorder((size - 1) * size + edge);
    sampleBorder(edge * size);
    sampleBorder(edge * size + size - 1);
  }
  let dominant = null;
  buckets.forEach((entry) => {
    if (!dominant || entry.count > dominant.count) dominant = entry;
  });
  const reference =
    dominant && dominant.count > clearBorder
      ? [dominant.r / dominant.count, dominant.g / dominant.count, dominant.b / dominant.count]
      : [255, 255, 255];

  const seen = new Uint8Array(size * size);
  const stack = [];
  const accepts = (index, from) => {
    const offset = index * 4;
    if (data[offset + 3] < 20) return true;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const fromBackground =
      Math.abs(red - reference[0]) + Math.abs(green - reference[1]) + Math.abs(blue - reference[2]);
    if (from < 0) return fromBackground < 120;
    const previous = from * 4;
    const step =
      Math.abs(red - data[previous]) + Math.abs(green - data[previous + 1]) + Math.abs(blue - data[previous + 2]);
    return step < 42 && fromBackground < 150;
  };
  const push = (x, y, from) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const index = y * size + x;
    if (seen[index] || !accepts(index, from)) return;
    seen[index] = 1;
    stack.push(index);
  };
  for (let edge = 0; edge < size; edge += 1) {
    push(edge, 0, -1);
    push(edge, size - 1, -1);
    push(0, edge, -1);
    push(size - 1, edge, -1);
  }
  while (stack.length) {
    const index = stack.pop();
    data[index * 4 + 3] = 0;
    const x = index % size;
    const y = (index - x) / size;
    push(x + 1, y, index);
    push(x - 1, y, index);
    push(x, y + 1, index);
    push(x, y - 1, index);
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const clear = [];
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const index = y * size + x;
        const offset = index * 4;
        if (data[offset + 3] < 20) continue;
        const touching =
          data[(index - 1) * 4 + 3] < 20 ||
          data[(index + 1) * 4 + 3] < 20 ||
          data[(index - size) * 4 + 3] < 20 ||
          data[(index + size) * 4 + 3] < 20;
        if (!touching) continue;
        const red = data[offset];
        const green = data[offset + 1];
        const blue = data[offset + 2];
        const light = Math.min(red, green, blue) > 205 && Math.max(red, green, blue) - Math.min(red, green, blue) < 30;
        if (light) clear.push(offset);
      }
    }
    clear.forEach((offset) => {
      data[offset + 3] = 0;
    });
  }
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (data[(y * size + x) * 4 + 3] < 24) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  context.putImageData(frame, 0, 0);
  if (maxX < 0) return canvas;
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d").drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export function loadArt(onProgress) {
  const names = Object.keys(SPRITES);
  let done = 0;
  return Promise.all(
    names.map(
      (name) =>
        new Promise((resolve) => {
          const image = new Image();
          image.decoding = "async";
          image.onload = () => {
            try {
              images[name] = knockOut(image, SPRITES[name].raster || 512, SPRITES[name].filter);
            } catch {
              images[name] = null;
            }
            done += 1;
            onProgress(done / names.length);
            resolve();
          };
          image.onerror = () => {
            done += 1;
            onProgress(done / names.length);
            resolve();
          };
          image.src = `art/${name}.svg`;
        }),
    ),
  );
}

export function spriteSize(name, scale = 1) {
  const image = images[name];
  const spec = SPRITES[name];
  if (!image || !spec) return { w: 0, h: 0 };
  const ratio = image.width / image.height;
  if (spec.w) return { w: spec.w * scale, h: (spec.w / ratio) * scale };
  return { w: spec.h * ratio * scale, h: spec.h * scale };
}

const mips = new Map();

function mip(name, pixelHeight) {
  const source = images[name];
  const bucket = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, pixelHeight))));
  if (bucket >= source.height) return source;
  const key = `${name}:${bucket}`;
  if (mips.has(key)) return mips.get(key);
  let current = source;
  while (current.height / 2 >= bucket) {
    const half = document.createElement("canvas");
    half.width = Math.max(1, Math.round(current.width / 2));
    half.height = Math.max(1, Math.round(current.height / 2));
    const context = half.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(current, 0, 0, half.width, half.height);
    current = half;
  }
  mips.set(key, current);
  return current;
}

const outlines = new Map();

function outlineOf(name) {
  if (outlines.has(name)) return outlines.get(name);
  const source = images[name];
  if (!source) return null;
  const pad = 5;
  const tint = document.createElement("canvas");
  tint.width = source.width;
  tint.height = source.height;
  const tintContext = tint.getContext("2d");
  tintContext.drawImage(source, 0, 0);
  tintContext.globalCompositeOperation = "source-in";
  tintContext.fillStyle = "#fff6cf";
  tintContext.fillRect(0, 0, tint.width, tint.height);
  const canvas = document.createElement("canvas");
  canvas.width = source.width + pad * 2;
  canvas.height = source.height + pad * 2;
  const context = canvas.getContext("2d");
  [
    [0, -4],
    [0, 4],
    [-4, 0],
    [4, 0],
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ].forEach(([dx, dy]) => context.drawImage(tint, pad + dx, pad + dy));
  context.globalCompositeOperation = "destination-out";
  context.drawImage(source, pad, pad);
  outlines.set(name, canvas);
  return canvas;
}

export function drawOutline(ctx, name, x, y, options = {}) {
  const image = outlineOf(name);
  const source = images[name];
  if (!image || !source) return;
  const { w, h } = spriteSize(name, options.scale || 1);
  const dw = w * (image.width / source.width);
  const dh = h * (image.height / source.height);
  const lift = 5 * (h / source.height);
  ctx.save();
  ctx.translate(x, y);
  if (options.rotate) ctx.rotate(options.rotate);
  if (options.flip === -1) ctx.scale(-1, 1);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, -dw / 2, -h + (options.sink || 0) - lift, dw, dh);
  ctx.restore();
}

export function drawSprite(ctx, name, x, y, options = {}) {
  const image = images[name];
  if (!image) return null;
  const { w, h } = spriteSize(name, options.scale || 1);
  const deviceScale = ctx.getTransform().d;
  ctx.save();
  ctx.translate(x, y);
  if (options.rotate) ctx.rotate(options.rotate);
  if (options.flip === -1) ctx.scale(-1, 1);
  if (options.alpha !== undefined) ctx.globalAlpha *= options.alpha;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mip(name, h * deviceScale), -w / 2, -h + (options.sink || 0), w, h);
  ctx.restore();
  return { x: x - w / 2, y: y - h, w, h };
}

export function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function woodPanel(ctx, x, y, w, h, options = {}) {
  const fill = options.fill || "rgba(52, 31, 18, 0.92)";
  const rim = options.rim || "#b9874f";
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowOffsetY = 3;
  ctx.shadowBlur = 6;
  roundedRect(ctx, x, y, w, h, options.radius ?? 8);
  ctx.fillStyle = "#1c0f07";
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, x + 2, y + 2, w - 4, h - 4, Math.max(2, (options.radius ?? 8) - 2));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = rim;
  ctx.stroke();
  if (options.rivets) {
    ctx.fillStyle = "#6b4526";
    [
      [x + 9, y + 9],
      [x + w - 9, y + 9],
      [x + 9, y + h - 9],
      [x + w - 9, y + h - 9],
    ].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(rx, ry, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

export function parchment(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowOffsetY = 6;
  ctx.shadowBlur = 14;
  roundedRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = "#5a3416";
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, x + 5, y + 5, w - 10, h - 10, 4);
  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, "#f1dfb6");
  gradient.addColorStop(1, "#d9bf8c");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "#8a5a2b";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#3a2210";
  [
    [x + 12, y + 12],
    [x + w - 12, y + 12],
    [x + 12, y + h - 12],
    [x + w - 12, y + h - 12],
  ].forEach(([rx, ry]) => {
    ctx.beginPath();
    ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function outlined(ctx, draw, fill, outline = "#1b0f08", width = 2.5) {
  draw();
  ctx.lineWidth = width;
  ctx.strokeStyle = outline;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function icon(ctx, name, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (name === "drop") {
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(12, 2);
        ctx.bezierCurveTo(16, 8, 20, 12, 20, 15.5);
        ctx.arc(12, 15.5, 8, 0, Math.PI);
        ctx.bezierCurveTo(4, 12, 8, 8, 12, 2);
        ctx.closePath();
      },
      "#3f9be8",
    );
    ctx.fillStyle = "#bfe4ff";
    ctx.fillRect(7.5, 13, 2.5, 4);
  } else if (name === "wood") {
    [
      [5, 15],
      [13, 15],
      [9, 8],
    ].forEach(([cx, cy]) => {
      outlined(
        ctx,
        () => {
          ctx.beginPath();
          ctx.arc(cx + 3, cy + 3, 5.2, 0, Math.PI * 2);
        },
        "#d9a35f",
      );
      ctx.strokeStyle = "#8a5a2b";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx + 3, cy + 3, 2.4, 0, Math.PI * 2);
      ctx.stroke();
    });
  } else if (name === "hammer") {
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(6, 21);
        ctx.lineTo(9, 23);
        ctx.lineTo(17, 10);
        ctx.lineTo(14, 8);
        ctx.closePath();
      },
      "#9a6334",
    );
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(9, 6);
        ctx.lineTo(15, 2);
        ctx.lineTo(22, 8);
        ctx.lineTo(19, 11);
        ctx.lineTo(15, 8);
        ctx.lineTo(12, 10);
        ctx.closePath();
      },
      "#b8c0c8",
    );
  } else if (name === "bucket") {
    ctx.strokeStyle = "#1b0f08";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(12, 10, 7, Math.PI, 0);
    ctx.stroke();
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(4, 9);
        ctx.lineTo(20, 9);
        ctx.lineTo(18, 22);
        ctx.lineTo(6, 22);
        ctx.closePath();
      },
      "#aeb8c2",
    );
    ctx.fillStyle = "#e3e9ee";
    ctx.fillRect(7, 11, 2, 9);
  } else if (name === "hoe") {
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(4, 21);
        ctx.lineTo(6, 23);
        ctx.lineTo(19, 7);
        ctx.lineTo(17, 5);
        ctx.closePath();
      },
      "#a06a38",
    );
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(14, 3);
        ctx.lineTo(22, 3);
        ctx.lineTo(22, 9);
        ctx.lineTo(18, 8);
        ctx.closePath();
      },
      "#aeb8c2",
    );
  } else if (name === "axe") {
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(5, 22);
        ctx.lineTo(8, 23);
        ctx.lineTo(16, 6);
        ctx.lineTo(13, 5);
        ctx.closePath();
      },
      "#a06a38",
    );
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(12, 6);
        ctx.quadraticCurveTo(15, 1, 22, 3);
        ctx.quadraticCurveTo(21, 10, 16, 12);
        ctx.closePath();
      },
      "#c4ccd3",
    );
  } else if (name === "gear") {
    ctx.translate(12, 12);
    ctx.fillStyle = "#d9c7a4";
    for (let tooth = 0; tooth < 8; tooth += 1) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-2.2, -11, 4.4, 5);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b2414";
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (name === "hand") {
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(7, 12);
        ctx.lineTo(7, 6);
        ctx.quadraticCurveTo(9, 4, 10, 6);
        ctx.lineTo(10, 4);
        ctx.quadraticCurveTo(12, 2, 13, 4);
        ctx.lineTo(13, 5);
        ctx.quadraticCurveTo(15, 3, 16, 6);
        ctx.lineTo(16, 8);
        ctx.quadraticCurveTo(18, 6, 19, 9);
        ctx.lineTo(19, 15);
        ctx.quadraticCurveTo(18, 21, 13, 22);
        ctx.quadraticCurveTo(8, 22, 5, 16);
        ctx.lineTo(3.5, 12.5);
        ctx.quadraticCurveTo(5, 10.5, 7, 12);
        ctx.closePath();
      },
      "#f3e6c8",
    );
  } else if (name === "cursor") {
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.moveTo(6, 3);
        ctx.lineTo(6, 20);
        ctx.lineTo(10.5, 15.5);
        ctx.lineTo(14, 22);
        ctx.lineTo(17, 20.5);
        ctx.lineTo(13.5, 14.5);
        ctx.lineTo(19, 14);
        ctx.closePath();
      },
      "#f3e6c8",
    );
  } else if (name === "star" || name === "star-empty") {
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 ? 4.6 : 10.5;
      const angle = -Math.PI / 2 + (point * Math.PI) / 5;
      ctx.lineTo(12 + Math.cos(angle) * radius, 12.5 + Math.sin(angle) * radius);
    }
    ctx.closePath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#3a2210";
    ctx.stroke();
    ctx.fillStyle = name === "star" ? "#ffcf3f" : "#6b5a46";
    ctx.fill();
  } else if (name === "lock") {
    ctx.strokeStyle = "#5b5f63";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(12, 10, 5, Math.PI, 0);
    ctx.stroke();
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.rect(5, 10, 14, 11);
      },
      "#c9ced3",
      "#5b5f63",
      2,
    );
  }
  ctx.restore();
}

export function text(ctx, value, x, y, options = {}) {
  ctx.save();
  ctx.font = `${options.weight || 600} ${options.size || 16}px "Pixelify Sans", monospace`;
  ctx.textAlign = options.align || "left";
  ctx.textBaseline = options.baseline || "alphabetic";
  if (options.shadow !== false) {
    ctx.fillStyle = options.shadowColor || "rgba(0, 0, 0, 0.55)";
    ctx.fillText(value, x + 1.5, y + 2);
  }
  ctx.fillStyle = options.color || "#f3e6c8";
  ctx.fillText(value, x, y);
  ctx.restore();
}

export function wrap(ctx, value, width, size = 15) {
  ctx.save();
  ctx.font = `600 ${size}px "Pixelify Sans", monospace`;
  const words = value.split(" ");
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  });
  if (line) lines.push(line);
  const widest = Math.max(...lines.map((entry) => ctx.measureText(entry).width));
  ctx.restore();
  return { lines, width: widest };
}
