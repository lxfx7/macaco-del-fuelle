const $ = (selector) => document.querySelector(selector);

const NOTE_NAMES = ["DO", "DO♯", "RE", "MI♭", "MI", "FA", "FA♯", "SOL", "SOL♯", "LA", "SI♭", "SI"];
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const RHYTHMS = [
  { id: "chamame", name: "CHAMAMÉ", detail: "PICADITO", bpm: 118, meter: 4, swing: 0.07, beatPattern: [0, 1.5, 2, 3.5] },
  { id: "polka", name: "POLCA", detail: "SALTARINA", bpm: 126, meter: 4, swing: 0.04, beatPattern: [0, 1, 2, 3] },
  { id: "vals", name: "VALS CRIOLLO", detail: "TRES PASITOS", bpm: 108, meter: 3, swing: 0, beatPattern: [0, 1, 2] },
  { id: "cumbia", name: "CUMBIA", detail: "CON SABOR", bpm: 104, meter: 4, swing: 0.09, beatPattern: [0, 1.5, 2.5, 3] },
  { id: "ranchera", name: "RANCHERA", detail: "BIEN SENTIDA", bpm: 96, meter: 3, swing: 0.02, beatPattern: [0, 1, 2] },
];

const STRUCTURE = [
  { id: "riff-a", type: "riff", name: "RIFF", bars: 2 },
  { id: "verse-a", type: "verse", name: "ESTROFA A", bars: 4 },
  { id: "riff-b", type: "riff", name: "RIFF", bars: 2 },
  { id: "chorus-a", type: "chorus", name: "ESTRIBILLO", bars: 4 },
  { id: "verse-b", type: "verseB", name: "ESTROFA B", bars: 4 },
  { id: "bridge", type: "bridge", name: "PUENTE", bars: 2 },
  { id: "chorus-b", type: "chorus", name: "ESTRIBILLO", bars: 4 },
  { id: "final", type: "final", name: "FINAL", bars: 2 },
];

const ui = {
  shell: $("#appShell"),
  key: $("#keySelect"),
  rhythmButton: $("#rhythmButton"),
  rhythmName: $("#rhythmName"),
  rhythmTempo: $("#rhythmTempo"),
  seed: $("#seedInput"),
  randomSeed: $("#randomSeedButton"),
  regenerate: $("#regenerateButton"),
  play: $("#playButton"),
  playLabel: $(".play-label"),
  duration: $("#durationLabel"),
  title: $("#songTitle"),
  note: $("#currentNote"),
  liveText: $("#liveText"),
  timeline: $("#timeline"),
  progress: $("#timelineProgress"),
  footerSeed: $("#footerSeed"),
  particles: $("#musicParticles"),
  toast: $("#toast"),
};

let rhythmIndex = 0;
let song;
let audioContext;
let master;
let activeSources = [];
let animationFrame;
let startTime = 0;
let visualEventIndex = 0;
let toastTimer;

function hashSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, values) => values[Math.floor(rng() * values.length)];

function buildTitle(rng) {
  const first = ["Caminito", "Suspiro", "Vueltita", "Abrazo", "Corazón", "Domingo", "Besito", "Rincón", "Lunita", "Zapateo"];
  const second = ["de Sol", "del Paraná", "de Miel", "Colorada", "para Dos", "del Monte", "de Abril", "Querendón", "de Azúcar", "y Canela"];
  return `${pick(rng, first)} ${pick(rng, second)}`;
}

function degreeToMidi(root, degree, octave = 0) {
  const wrapped = ((degree % 7) + 7) % 7;
  const octaves = Math.floor(degree / 7);
  return root + SCALE[wrapped] + 12 * (octave + octaves);
}

function createMotif(rng, length, range = 5, lift = 0) {
  const motif = [];
  let degree = Math.floor(rng() * 3) + lift;
  for (let i = 0; i < length; i += 1) {
    const rest = i > 0 && rng() < 0.13;
    const step = pick(rng, [-2, -1, -1, 0, 0, 1, 1, 2]);
    degree = Math.max(lift, Math.min(lift + range, degree + step));
    motif.push(rest ? null : degree);
  }
  motif[0] = lift;
  motif[length - 1] = lift + pick(rng, [0, 2, 4]);
  return motif;
}

function addMelody(events, motif, startBeat, totalBeats, root, kind, rng) {
  const step = kind === "chorus" ? 0.5 : 0.5;
  for (let beat = 0; beat < totalBeats; beat += step) {
    const index = Math.floor(beat / step) % motif.length;
    let degree = motif[index];
    if (degree === null) continue;
    if (kind === "verse" && Math.floor(beat / motif.length) % 2 && rng() < 0.22) degree += pick(rng, [-1, 1]);
    const duration = rng() < 0.17 ? step * 1.8 : step * 0.88;
    events.push({ beat: startBeat + beat, duration, midi: degreeToMidi(root + 12, degree), voice: "lead", velocity: kind === "chorus" ? 0.82 : 0.7 });
  }
}

function addAccompaniment(events, startBeat, bars, rhythm, root, progression) {
  const meter = rhythm.meter;
  for (let bar = 0; bar < bars; bar += 1) {
    const chordDegree = progression[bar % progression.length];
    const chordRoot = degreeToMidi(root - 12, chordDegree);
    const base = startBeat + bar * meter;
    for (let beat = 0; beat < meter; beat += 1) {
      const isDownbeat = beat === 0;
      events.push({ beat: base + beat, duration: 0.36, midi: isDownbeat ? chordRoot : chordRoot + 7, voice: "bass", velocity: isDownbeat ? 0.55 : 0.36 });
    }
    rhythm.beatPattern.forEach((offset, index) => {
      const chordOctave = chordRoot + 12;
      [0, 4, 7].forEach((interval) => {
        events.push({ beat: base + offset, duration: index % 2 ? 0.18 : 0.27, midi: chordOctave + interval, voice: "chord", velocity: index % 2 ? 0.2 : 0.26 });
      });
    });
  }
}

function compose() {
  const seed = (ui.seed.value.trim() || "NUESTRO-AMOR").toUpperCase();
  ui.seed.value = seed;
  const rhythm = RHYTHMS[rhythmIndex];
  const root = Number(ui.key.value);
  const rng = makeRandom(`${seed}|${root}|${rhythm.id}`);
  const events = [];
  const sections = [];
  const riff = createMotif(rng, rhythm.meter * 4, 4, 0);
  const verse = createMotif(rng, rhythm.meter * 4, 5, 0);
  const chorus = createMotif(rng, rhythm.meter * 4, 5, 2);
  const bridge = createMotif(rng, rhythm.meter * 2, 4, 1);
  const progressions = {
    riff: [0, 4],
    verse: [0, 3, 4, 0],
    verseB: [0, 5, 3, 4],
    chorus: [3, 4, 0, 5],
    bridge: [5, 3],
    final: [4, 0],
  };

  let cursor = 0;
  STRUCTURE.forEach((section) => {
    const start = cursor;
    const beats = section.bars * rhythm.meter;
    const family = section.type.startsWith("verse") ? "verse" : section.type;
    const motif = family === "riff" || family === "final" ? riff : family === "chorus" ? chorus : family === "bridge" ? bridge : verse;
    addMelody(events, motif, cursor, beats, root, family === "final" ? "chorus" : family, rng);
    addAccompaniment(events, cursor, section.bars, rhythm, root, progressions[section.type] || progressions[family]);

    if (family === "final") {
      events.push({ beat: cursor + beats - 0.05, duration: 1.6, midi: root + 24, voice: "lead", velocity: 0.9 });
    }

    cursor += beats;
    sections.push({ ...section, startBeat: start, endBeat: cursor });
  });

  events.sort((a, b) => a.beat - b.beat || (a.voice === "lead" ? -1 : 1));
  song = {
    seed,
    root,
    rhythm,
    title: buildTitle(makeRandom(`${seed}|title`)),
    events,
    sections,
    totalBeats: cursor,
    duration: (cursor * 60) / rhythm.bpm,
  };
  updateInterface();
}

function updateInterface() {
  const { rhythm } = song;
  ui.rhythmName.textContent = rhythm.name;
  ui.rhythmTempo.textContent = `${rhythm.bpm} BPM · ${rhythm.detail}`;
  ui.title.textContent = song.title;
  ui.note.textContent = NOTE_NAMES[song.root % 12];
  ui.duration.textContent = `≈ ${Math.round(song.duration / 5) * 5} SEGUNDOS`;
  ui.footerSeed.textContent = song.seed;
  document.documentElement.style.setProperty("--beat-duration", `${60 / rhythm.bpm}s`);
  renderTimeline();
}

function renderTimeline() {
  ui.timeline.innerHTML = "";
  song.sections.forEach((section) => {
    const item = document.createElement("div");
    item.className = "section-pill";
    item.dataset.section = section.id;
    item.innerHTML = `<strong>${section.name}</strong><small>${section.bars} compases</small>`;
    ui.timeline.append(item);
  });
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function setupAudio() {
  if (!audioContext) {
    audioContext = new AudioContext();
    master = audioContext.createGain();
    master.gain.value = 0.78;
    const compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 14;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.24;
    master.connect(compressor).connect(audioContext.destination);
  }
}

function scheduleNote(event, when) {
  const secondsPerBeat = 60 / song.rhythm.bpm;
  const duration = Math.max(0.06, event.duration * secondsPerBeat);
  const frequency = midiToFrequency(event.midi);
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = event.voice === "bass" ? 900 : event.voice === "chord" ? 1700 : 2600;
  filter.Q.value = 1.1;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(event.velocity * (event.voice === "lead" ? 0.16 : 0.1), when + 0.018);
  gain.gain.setValueAtTime(event.velocity * (event.voice === "lead" ? 0.13 : 0.075), when + Math.max(0.03, duration * 0.62));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  filter.connect(gain).connect(master);

  const oscillatorCount = event.voice === "lead" ? 2 : 1;
  for (let i = 0; i < oscillatorCount; i += 1) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = event.voice === "bass" ? "triangle" : i === 0 ? "sawtooth" : "square";
    oscillator.frequency.value = frequency;
    oscillator.detune.value = event.voice === "lead" ? (i ? 7 : -5) : 0;
    oscillator.connect(filter);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.03);
    activeSources.push(oscillator);
  }
}

async function playSong() {
  if (ui.shell.classList.contains("is-playing")) {
    stopSong();
    return;
  }
  setupAudio();
  await audioContext.resume();
  stopSong(false);

  const leadIn = 0.09;
  startTime = audioContext.currentTime + leadIn;
  visualEventIndex = 0;
  const secondsPerBeat = 60 / song.rhythm.bpm;
  song.events.forEach((event) => {
    let eventBeat = event.beat;
    if (song.rhythm.swing && Math.round(eventBeat * 2) % 2 === 1) eventBeat += song.rhythm.swing;
    scheduleNote(event, startTime + eventBeat * secondsPerBeat);
  });

  ui.shell.classList.add("is-playing");
  ui.playLabel.textContent = "DETENER";
  ui.liveText.textContent = "EN VIVO · TOCANDO";
  tick();
}

function stopSong(reset = true) {
  cancelAnimationFrame(animationFrame);
  activeSources.forEach((source) => {
    try { source.stop(); } catch { /* already stopped */ }
  });
  activeSources = [];
  ui.shell.classList.remove("is-playing");
  ui.playLabel.textContent = "TOCAR CANCIÓN";
  ui.liveText.textContent = "LISTO PARA TOCAR";
  document.querySelectorAll(".section-pill").forEach((item) => item.classList.remove("is-active"));
  if (reset) ui.progress.style.width = "0%";
}

function spawnMusicNote(midi) {
  const particle = document.createElement("span");
  particle.className = "music-note";
  particle.textContent = pick(Math.random, ["♪", "♫", "♩", "✦"]);
  particle.style.left = `${32 + Math.random() * 44}%`;
  particle.style.bottom = `${23 + Math.random() * 18}%`;
  particle.style.setProperty("--drift", `${-85 + Math.random() * 170}px`);
  particle.style.setProperty("--rotation", `${-28 + Math.random() * 56}deg`);
  ui.particles.append(particle);
  ui.note.textContent = NOTE_NAMES[midi % 12];
  particle.addEventListener("animationend", () => particle.remove());
}

function tick() {
  const elapsed = Math.max(0, audioContext.currentTime - startTime);
  const progress = elapsed / song.duration;
  if (progress >= 1) {
    stopSong();
    showToast("¡Fin! El macaco acepta aplausos.");
    return;
  }

  const currentBeat = elapsed * song.rhythm.bpm / 60;
  ui.progress.style.width = `${Math.min(100, progress * 100)}%`;
  const activeSection = song.sections.find((section) => currentBeat >= section.startBeat && currentBeat < section.endBeat);
  document.querySelectorAll(".section-pill").forEach((item) => item.classList.toggle("is-active", item.dataset.section === activeSection?.id));

  while (visualEventIndex < song.events.length && song.events[visualEventIndex].beat <= currentBeat) {
    const event = song.events[visualEventIndex];
    if (event.voice === "lead") spawnMusicNote(event.midi);
    visualEventIndex += 1;
  }
  animationFrame = requestAnimationFrame(tick);
}

function newSeed() {
  const words = ["MATE", "LUNA", "BESO", "MONTE", "MIMOS", "CANELA", "ABRAZO", "DOMINGO", "RISA", "CASITA"];
  ui.seed.value = `${words[Math.floor(Math.random() * words.length)]}-${String(Math.floor(Math.random() * 999)).padStart(3, "0")}`;
  stopSong();
  compose();
  showToast("Nueva semilla plantada");
}

function randomizeRhythm() {
  const previous = rhythmIndex;
  while (rhythmIndex === previous) rhythmIndex = Math.floor(Math.random() * RHYTHMS.length);
  stopSong();
  compose();
  showToast(`Ahora va en ${song.rhythm.name.toLowerCase()}`);
}

function regenerateArrangement() {
  ui.seed.value = `${ui.seed.value.split("·")[0]}·${Math.floor(Math.random() * 90 + 10)}`;
  stopSong();
  compose();
  ui.regenerate.classList.remove("is-spinning");
  void ui.regenerate.offsetWidth;
  ui.regenerate.classList.add("is-spinning");
  showToast("Arreglo regenerado");
}

function showToast(message) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => ui.toast.classList.remove("is-visible"), 1800);
}

ui.play.addEventListener("click", playSong);
ui.rhythmButton.addEventListener("click", randomizeRhythm);
ui.randomSeed.addEventListener("click", newSeed);
ui.regenerate.addEventListener("click", regenerateArrangement);
ui.key.addEventListener("change", () => { stopSong(); compose(); showToast(`Tonalidad: ${NOTE_NAMES[Number(ui.key.value) % 12]} mayor`); });
ui.seed.addEventListener("change", () => { stopSong(); compose(); });
ui.seed.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { ui.seed.blur(); }
});
window.addEventListener("beforeunload", () => stopSong());

compose();
