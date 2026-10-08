import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "art");
const referencePaths = [path.join(root, "reference", "mockup-crop.jpg"), path.join(root, "reference", "inspiration.jpg")];

function loadToken() {
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN.trim();
  const text = fs.readFileSync(path.join(root, ".env"), "utf8");
  const line = text.split("\n").find((entry) => entry.startsWith("REPLICATE_API_TOKEN="));
  if (!line) throw new Error("REPLICATE_API_TOKEN is missing from .env");
  return line.slice("REPLICATE_API_TOKEN=".length).trim();
}

const token = loadToken();

const isolated =
  "Single isolated game asset, centered, generous empty margin, plain flat white background, no ground, no grass, no shadow, no scenery, no text.";
const sprite = (subject) => `Isometric pixel-art farm game sprite, 3/4 top-down view, crisp detailed pixels, warm palette. ${subject} ${isolated}`;
const person = (subject) =>
  `Isometric pixel-art farm game character sprite, full body standing, 3/4 top-down view facing down-left, crisp detailed pixels, clean dark outline. ${subject} ${isolated}`;
const portrait = (subject) =>
  `Pixel-art RPG character portrait, head and shoulders, facing forward, crisp detailed pixels, clean dark outline. ${subject} Plain flat white background, no frame, no text.`;

const assets = [
  { name: "barn", prompt: sprite("A classic red barn with a dark gray shingled gambrel roof, white trim, white X-braced double doors, small white windows, seen from the front-left corner.") },
  { name: "drum", prompt: sprite("A large wooden water barrel drum with dark iron hoops, empty, slightly open top.") },
  { name: "bucket", prompt: sprite("One small empty galvanized metal bucket with a wire handle.") },
  { name: "logs", prompt: sprite("A neat stack of freshly cut brown logs with light cut ends, about eight logs.") },
  { name: "pine", prompt: sprite("One tall dark green pine tree with layered needles and a short brown trunk.") },
  { name: "oak", prompt: sprite(
      "One leafy round summer oak tree. The canopy is lush vivid green, lit from the top-left with bright lime-green highlights and mid-green shading, never dark or brown. Short thick brown trunk.",
    ) },
  { name: "stump", prompt: sprite("One freshly cut tree stump with pale rings on top and a few wood chips.") },
  { name: "cow", prompt: sprite("One black and white holstein cow standing, body facing left.") },
  { name: "haystack", prompt: sprite("One large round golden haystack mound.") },
  { name: "hay", prompt: sprite("One rectangular golden hay bale tied with twine.") },
  { name: "corn", prompt: sprite("A small patch of tall green corn stalks in three short rows.") },
  { name: "bush", prompt: sprite("One small round green shrub with a few tiny flowers.") },
  {
    name: "ade",
    prompt: person("A Black man farmer with short black hair and a blue baseball cap, white t-shirt, blue denim overalls, brown boots, empty hands."),
  },
  {
    name: "mei",
    prompt: person("An East Asian woman farmer with a black braid and a wide straw hat, green shirt, brown work trousers, boots, holding a garden hoe."),
  },
  {
    name: "eli",
    prompt: person("A white man lumberjack with short ginger hair and a short beard, red plaid flannel shirt, blue jeans, brown boots, holding an axe."),
  },
  { name: "ade-face", prompt: portrait("A Black man farmer with short black hair, a blue baseball cap, white t-shirt and blue overall straps, friendly expression.") },
  { name: "mei-face", prompt: portrait("An East Asian woman farmer with a black braid, a wide straw hat and a green shirt, determined expression.") },
  { name: "eli-face", prompt: portrait("A white man lumberjack with short ginger hair, a short beard and a red plaid flannel shirt, cheerful expression.") },
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
  if (!response.ok) throw new Error(`${response.status} ${pathname}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

async function upload(filePath) {
  const form = new FormData();
  form.append("content", new Blob([fs.readFileSync(filePath)], { type: "image/jpeg" }), path.basename(filePath));
  const file = await replicate("/files", { method: "POST", body: form });
  if (!file?.urls?.get) throw new Error(`Unexpected upload response: ${JSON.stringify(file).slice(0, 300)}`);
  return file.urls.get;
}

async function waitFor(prediction) {
  let current = prediction;
  const started = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(current.status)) {
    if (Date.now() - started > 180000) throw new Error(`Timed out on ${current.id}`);
    await sleep(2500);
    current = await replicate(`/predictions/${current.id}`);
  }
  if (current.status !== "succeeded") throw new Error(`Prediction ${current.status}: ${JSON.stringify(current.error)}`);
  return current;
}

function clean(svg) {
  return svg
    .replace(/<metadata>[\s\S]*?<\/metadata>/, "")
    .replace(/<path[^>]*fill="rgb\(255,255,255\)"[^>]*d="M 0 0 L \d+ 0[\s\S]*?\/>/, "");
}

async function generate(asset, references) {
  console.log(`generating ${asset.name}...`);
  let prediction = await replicate("/models/recraft-ai/recraft-v4-styles-svg/predictions", {
    method: "POST",
    headers: { Prefer: "wait=60" },
    body: JSON.stringify({
      input: { prompt: asset.prompt, aspect_ratio: "1:1", style_match: "precise", style_reference_images: references },
    }),
  });
  if (prediction.status !== "succeeded") prediction = await waitFor(prediction);
  const output = prediction.output;
  const url = typeof output === "string" ? output : output?.image;
  if (!url) throw new Error(`No image for ${asset.name}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed for ${asset.name}: ${response.status}`);
  fs.writeFileSync(path.join(outDir, `${asset.name}.svg`), clean(await response.text()));
  console.log(`saved art/${asset.name}.svg`);
}

fs.mkdirSync(outDir, { recursive: true });
const references = [];
for (const file of referencePaths) references.push(await upload(file));
console.log("uploaded style references");

const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const force = process.argv.includes("--force");
for (const asset of assets) {
  if (only.length && !only.includes(asset.name)) continue;
  if (!force && fs.existsSync(path.join(outDir, `${asset.name}.svg`))) {
    console.log(`skip ${asset.name}`);
    continue;
  }
  try {
    await generate(asset, references);
  } catch (error) {
    console.log(`failed ${asset.name}: ${error.message}`);
  }
}
