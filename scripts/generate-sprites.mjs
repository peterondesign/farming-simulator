import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const spritesDir = path.join(root, "sprites");
const stylePath = path.join(spritesDir, "style-id.txt");
const referencePath = path.join(root, "reference", "inspiration.jpg");

function loadToken() {
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN.trim();
  const envPath = path.join(root, ".env");
  const text = fs.readFileSync(envPath, "utf8");
  const line = text.split("\n").find((entry) => entry.startsWith("REPLICATE_API_TOKEN="));
  if (!line) throw new Error("REPLICATE_API_TOKEN is missing from .env");
  return line.slice("REPLICATE_API_TOKEN=".length).trim();
}

const token = loadToken();

const sprites = [
  {
    name: "farmer",
    prompt:
      "Isometric pixel-art game sprite of one farmer standing idle, short black hair, white shirt, blue denim overalls, black shoes, facing slightly toward the viewer. Single character only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
  {
    name: "cow",
    prompt:
      "Isometric pixel-art game sprite of one black and white holstein cow standing in profile facing right. Single animal only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
  {
    name: "barn",
    prompt:
      "Isometric pixel-art game sprite of one classic red gambrel barn, dark gray roof, white window frames, white double doors with X braces, small red cupola. Building only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
  {
    name: "hay-bale",
    prompt:
      "Isometric pixel-art game sprite of one rectangular golden yellow hay bale. Object only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
  {
    name: "haystack",
    prompt:
      "Isometric pixel-art game sprite of one round golden haystack mound. Object only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
  {
    name: "fence",
    prompt:
      "Isometric pixel-art game sprite of one short wooden farm fence section with brown posts and rails. Object only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
  {
    name: "wheat",
    prompt:
      "Isometric pixel-art game sprite of a dense clump of ripe golden wheat stalks. Crop only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
  {
    name: "vegetables",
    prompt:
      "Isometric pixel-art game sprite of a small vegetable garden plot with neat rows of green leafy crops. Plot only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
  {
    name: "tree",
    prompt:
      "Isometric pixel-art game sprite of one dark green pine tree with a short brown trunk. Tree only, centered, generous padding, flat solid white background, no landscape, no text.",
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replicate(pathname, options = {}, attempt = 0) {
  const response = await fetch(`https://api.replicate.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (response.status === 429 && attempt < 8) {
    const wait = (Number(data.retry_after) || 12) + 1;
    console.log(`rate limited, waiting ${wait}s`);
    await sleep(wait * 1000);
    return replicate(pathname, options, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${pathname}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

async function uploadReference() {
  const bytes = fs.readFileSync(referencePath);
  const form = new FormData();
  form.append("content", new Blob([bytes], { type: "image/jpeg" }), "inspiration.jpg");
  const file = await replicate("/files", { method: "POST", body: form });
  const url = file?.urls?.get;
  if (!url) throw new Error(`Unexpected file upload response: ${JSON.stringify(file).slice(0, 300)}`);
  return url;
}

async function waitForPrediction(prediction) {
  let current = prediction;
  const started = Date.now();
  while (current.status !== "succeeded" && current.status !== "failed" && current.status !== "canceled") {
    if (Date.now() - started > 180000) throw new Error(`Timed out waiting for ${current.id}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    current = await replicate(`/predictions/${current.id}`);
  }
  if (current.status !== "succeeded") {
    throw new Error(`Prediction ${current.status}: ${current.error || "unknown error"}`);
  }
  return current;
}

function stripBackdrop(svg) {
  return svg
    .replace(/<metadata>[\s\S]*?<\/metadata>/, "")
    .replace(/<path[^>]*fill="rgb\(255,255,255\)"[^>]*d="M 0 0 L \d+ 0[\s\S]*?\/>/, "");
}

async function generate(sprite, style) {
  const input = {
    prompt: sprite.prompt,
    aspect_ratio: "1:1",
    style_match: "precise",
    style_reference_images: [style.referenceUrl],
  };

  console.log(`generating ${sprite.name}...`);
  let prediction = await replicate("/models/recraft-ai/recraft-v4-styles-svg/predictions", {
    method: "POST",
    headers: { Prefer: "wait=60" },
    body: JSON.stringify({ input }),
  });
  if (prediction.status !== "succeeded") prediction = await waitForPrediction(prediction);

  const output = prediction.output;
  const imageUrl = typeof output === "string" ? output : output?.image;
  const styleId = (typeof output === "object" && output?.style_id) || prediction.output?.style_id || null;
  if (!imageUrl) throw new Error(`No image URL for ${sprite.name}: ${JSON.stringify(output).slice(0, 300)}`);

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Download failed for ${sprite.name}: ${imageResponse.status}`);
  const svg = stripBackdrop(await imageResponse.text());
  fs.writeFileSync(path.join(spritesDir, `${sprite.name}.svg`), svg);
  console.log(`saved sprites/${sprite.name}.svg`);
  return styleId;
}

fs.mkdirSync(spritesDir, { recursive: true });
const referenceUrl = await uploadReference();
console.log("uploaded style reference");

let styleId = fs.existsSync(stylePath) ? fs.readFileSync(stylePath, "utf8").trim() : "";
const only = process.argv.slice(2);

for (const sprite of sprites) {
  if (only.length && !only.includes(sprite.name)) continue;
  const destination = path.join(spritesDir, `${sprite.name}.svg`);
  if (fs.existsSync(destination) && !process.argv.includes("--force")) {
    console.log(`skip ${sprite.name} (already exists)`);
    continue;
  }
  const nextStyleId = await generate(sprite, { styleId, referenceUrl });
  if (nextStyleId && nextStyleId !== styleId) {
    styleId = nextStyleId;
    fs.writeFileSync(stylePath, `${styleId}\n`);
    console.log("saved style id for the rest of the set");
  }
}
