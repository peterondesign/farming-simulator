import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "audio");

function loadToken() {
  if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN.trim();
  const text = fs.readFileSync(path.join(root, ".env"), "utf8");
  const line = text.split("\n").find((entry) => entry.startsWith("REPLICATE_API_TOKEN="));
  if (!line) throw new Error("REPLICATE_API_TOKEN is missing from .env");
  return line.slice("REPLICATE_API_TOKEN=".length).trim();
}

const token = loadToken();

const model = "stability-ai/stable-audio-2.5";
const clip = (name, duration, prompt) => ({ name, input: { prompt, duration, steps: 8, cfg_scale: 6 } });
const clips = [
  clip("menu", 16, "Warm cheerful acoustic farm game menu theme, nylon guitar, soft music box, light shaker, no vocals, seamless loop"),
  clip("play", 16, "Gentle cozy farm work music, acoustic guitar, soft upright bass, light shaker, calm and hopeful, no vocals, seamless loop"),
  clip("drought", 12, "Sparse tense acoustic guitar and low strings, dry heat, a drought closing in, no drums, no vocals, seamless loop"),
  clip("ambience", 8, "Gentle farm ambience only, distant cattle, sparrows, light breeze through grass, summer insects, no music, no voices"),
  clip("moo", 3, "A single close cow moo in a quiet pasture, no music, no other animals"),
  clip("cluck", 3, "A few chicken clucks in a farmyard, close microphone, no music, no rooster crow"),
  clip("chop", 2, "One clean axe chop into a log, short foley hit, no voices, no music"),
  clip("hoe", 2, "One garden hoe striking soft soil, short foley hit, no voices, no music"),
  clip("splash", 3, "Water scooped from a pond into a metal bucket, one splash, no voices, no music"),
  clip("pour", 3, "Water poured from a bucket into a large wooden barrel, no voices, no music"),
  clip("bucket", 2, "Picking up an empty metal bucket, one light clank, no voices, no music"),
  clip("hammer", 2, "One hammer hit driving a nail into a wooden fence, short, no voices, no music"),
  clip("warn", 3, "A short urgent wooden farm bell, two strikes, no voices, no music"),
  clip("win", 4, "A short cheerful acoustic victory sting, banjo and a soft bell, no voices"),
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replicate(pathname, options = {}, attempt = 0) {
  const response = await fetch(`https://api.replicate.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
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

async function waitFor(prediction) {
  let current = prediction;
  const started = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(current.status)) {
    if (Date.now() - started > 240000) throw new Error(`Timed out on ${current.id}`);
    await sleep(2500);
    current = await replicate(`/predictions/${current.id}`);
  }
  if (current.status !== "succeeded") throw new Error(`Prediction ${current.status}: ${JSON.stringify(current.error)}`);
  return current;
}

fs.mkdirSync(outDir, { recursive: true });
const manifestPath = path.join(outDir, "manifest.json");
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const force = process.argv.includes("--force");

for (const clip of clips) {
  if (only.length && !only.includes(clip.name)) continue;
  if (!force && manifest[clip.name] && fs.existsSync(path.join(root, manifest[clip.name]))) {
    console.log(`skip ${clip.name}`);
    continue;
  }
  try {
    console.log(`generating ${clip.name}...`);
    let prediction = await replicate(`/models/${model}/predictions`, {
      method: "POST",
      headers: { Prefer: "wait=60" },
      body: JSON.stringify({ input: clip.input }),
    });
    if (prediction.status !== "succeeded") prediction = await waitFor(prediction);
    const output = prediction.output;
    const url = typeof output === "string" ? output : Array.isArray(output) ? output[0] : output?.audio;
    if (!url) throw new Error(`No audio for ${clip.name}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed for ${clip.name}: ${response.status}`);
    const ext = (new URL(url).pathname.match(/\.(mp3|wav|ogg|flac)$/) || [, "wav"])[1];
    const relative = `audio/${clip.name}.${ext}`;
    fs.writeFileSync(path.join(root, relative), Buffer.from(await response.arrayBuffer()));
    manifest[clip.name] = relative;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`saved ${relative}`);
  } catch (error) {
    console.log(`failed ${clip.name}: ${error.message}`);
  }
}
