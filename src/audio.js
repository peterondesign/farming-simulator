const KEY = "greenfield-audio";
const LEVELS = [0, 0.33, 0.66, 1];
const MUSIC_PEAK = 0.3;
const SFX_PEAK = 0.45;
const BED_PEAK = 0.22;
const COOLDOWN = { chop: 6, hoe: 7, hammer: 6, splash: 8, pour: 8, bucket: 3, moo: 0, cluck: 0, warn: 0, win: 0 };

let context = null;
let musicGain = null;
let bedGain = null;
let sfxGain = null;
const buffers = {};
const lastPlayed = {};
const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
const levels = { music: saved.music ?? 2, sfx: saved.sfx ?? 2 };
let musicName = "";
let musicNode = null;
let bedNode = null;
let winPlayed = false;
let animalIn = 40;

function ensure() {
  if (context) return context;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  context = new AudioContext();
  musicGain = context.createGain();
  bedGain = context.createGain();
  sfxGain = context.createGain();
  [musicGain, bedGain, sfxGain].forEach((gain) => gain.connect(context.destination));
  applyLevels();
  return context;
}

function applyLevels() {
  if (!context) return;
  const now = context.currentTime;
  musicGain.gain.setTargetAtTime(LEVELS[levels.music] * MUSIC_PEAK, now, 0.08);
  sfxGain.gain.setTargetAtTime(LEVELS[levels.sfx] * SFX_PEAK, now, 0.08);
  bedGain.gain.setTargetAtTime(LEVELS[levels.sfx] * BED_PEAK, now, 0.08);
}

export function audioLevel(kind) {
  return levels[kind];
}

export function setAudioLevel(kind, value) {
  levels[kind] = Math.max(0, Math.min(3, value));
  localStorage.setItem(KEY, JSON.stringify(levels));
  applyLevels();
}

export function unlock() {
  const audio = ensure();
  if (audio && audio.state === "suspended") audio.resume();
}

export async function loadAudio() {
  let manifest = {};
  try {
    const response = await fetch("audio/manifest.json");
    if (response.ok) manifest = await response.json();
  } catch {
    manifest = {};
  }
  const audio = ensure();
  if (!audio) return;
  await Promise.all(
    Object.entries(manifest).map(async ([name, file]) => {
      try {
        const response = await fetch(file);
        if (response.ok) buffers[name] = await audio.decodeAudioData(await response.arrayBuffer());
      } catch {
        buffers[name] = null;
      }
    }),
  );
}

function startLoop(name, gain) {
  if (!buffers[name] || !context) return null;
  const node = context.createBufferSource();
  node.buffer = buffers[name];
  node.loop = true;
  node.connect(gain);
  node.start();
  return node;
}

function stop(node) {
  try {
    node?.stop();
  } catch {
    /* Already stopped. */
  }
}

function playMusic(name) {
  if (musicName === name) return;
  stop(musicNode);
  musicNode = null;
  musicName = name;
  if (name && buffers[name]) musicNode = startLoop(name, musicGain);
}

function playBed(on) {
  if (on && !bedNode) bedNode = startLoop("ambience", bedGain);
  if (!on && bedNode) {
    stop(bedNode);
    bedNode = null;
  }
}

export function playCue(name) {
  if (!levels.sfx || !buffers[name] || !context) return;
  const now = context.currentTime;
  if (now - (lastPlayed[name] ?? -99) < (COOLDOWN[name] ?? 4)) return;
  lastPlayed[name] = now;
  const node = context.createBufferSource();
  node.buffer = buffers[name];
  const gain = context.createGain();
  gain.gain.value = name === "moo" || name === "cluck" ? 0.55 : 0.8;
  node.connect(gain);
  gain.connect(sfxGain);
  node.start();
}

export function sync(screen, drought) {
  if (!context) return;
  if (screen === "menu" || screen === "intro") {
    playMusic("menu");
    playBed(false);
    winPlayed = false;
  } else if (screen === "play" || screen === "paused") {
    playMusic(drought ? "drought" : "play");
    playBed(true);
  } else {
    playMusic("");
    playBed(false);
    if (screen === "won" && !winPlayed) {
      winPlayed = true;
      playCue("win");
    }
  }
}

export function ambience(dt, active) {
  if (!active || !context) return;
  animalIn -= dt;
  if (animalIn > 0) return;
  playCue(Math.random() < 0.7 ? "moo" : "cluck");
  animalIn = 45 + Math.random() * 45;
}
