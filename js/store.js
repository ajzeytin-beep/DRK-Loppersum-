// Lokaler Lernstand (localStorage). Bleibt auf dem Gerät, auch offline.
// Mehrere Teilnehmende können dasselbe Gerät nutzen – jede Person hat ihren eigenen Lernstand.
import { CONFIG } from "./config.js";

const INDEX_KEY = "sani-trainer-profiles";
const OLD_KEY = "sani-trainer-v1";           // Format bis Version 1 (nur eine Person)
const stateKey = (id) => `sani-trainer-v1:${id}`;
const DAY = 86400000;

const fresh = () => ({
  profile: null,
  progress: {},      // pro Frage/Fall: seen, correct, wrong, box, due, last
  history: [],       // jede einzelne Antwort (auch Fall-Schritte) – Grundlage für Auswertung
  syncedCount: 0,    // so viele history-Einträge sind schon an den Server übertragen
  exams: [],
  settings: { unlockAll: false },
  lastSync: null,
});

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus o. Ä. */ } };

function normalize(s) {
  return { ...fresh(), ...s, settings: { ...fresh().settings, ...(s?.settings || {}) } };
}

function loadIndex() {
  let idx = read(INDEX_KEY);
  if (!idx) {
    idx = { current: null, profiles: [] };
    const old = read(OLD_KEY);
    if (old?.profile?.id) {
      write(stateKey(old.profile.id), old);
      idx.profiles.push({ id: old.profile.id, name: old.profile.name, courseCode: old.profile.courseCode || null, lastUsed: Date.now() });
      idx.current = old.profile.id;
      try { localStorage.removeItem(OLD_KEY); } catch { /* ignorieren */ }
    }
    write(INDEX_KEY, idx);
  }
  return idx;
}

let index = loadIndex();
let state = index.current ? normalize(read(stateKey(index.current)) || {}) : fresh();
if (index.current && !state.profile) { index.current = null; state = fresh(); }

export const getState = () => state;

export function save() {
  if (!state.profile?.id) return;
  write(stateKey(state.profile.id), state);
}

function saveIndex() { write(INDEX_KEY, index); }

export function setProfile(profile) {
  state.profile = { ...(state.profile || {}), ...profile };
  const entry = { id: state.profile.id, name: state.profile.name, courseCode: state.profile.courseCode || null, lastUsed: Date.now() };
  index.profiles = [...index.profiles.filter((p) => p.id !== entry.id), entry];
  index.current = entry.id;
  saveIndex();
  save();
}

export function switchTo(id) {
  const s = read(stateKey(id));
  if (!s?.profile) return false;
  state = normalize(s);
  index.current = id;
  index.profiles = index.profiles.map((p) => (p.id === id ? { ...p, lastUsed: Date.now() } : p));
  saveIndex();
  return true;
}

export function logout() {
  save();
  index.current = null;
  saveIndex();
  state = fresh();
}

// Nach der Anmeldung: lokalen Lernstand des Kontos laden (oder neu anlegen) und Profil aktualisieren
export function useAccount(profile) {
  if (state.profile?.id !== profile.id && !switchTo(profile.id)) state = fresh();
  setProfile(profile);
}

// Verlauf vom Server übernehmen; noch nicht übertragene Antworten dieses Geräts bleiben erhalten
export function mergeServerHistory(attempts, exams) {
  const iso = (t) => { const d = new Date(t); return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString(); };
  const unsynced = state.history.slice(state.syncedCount);
  state.history = [
    ...attempts.map((a) => ({ question_id: a.question_id, topic: a.topic, level: a.level, correct: !!a.correct, mode: a.mode, at: iso(a.at) })),
    ...unsynced,
  ];
  state.syncedCount = attempts.length;
  state.exams = [
    ...exams.map((e) => ({ score: e.score, total: e.total, passed: !!e.passed, at: iso(e.at), synced: true })),
    ...state.exams.filter((e) => !e.synced),
  ];
  rebuildProgress();
  save();
}

// Karteikasten-Stand aus dem Verlauf neu berechnen (Fall-Schritte mit gleicher Uhrzeit = ein Fall)
function rebuildProgress() {
  const prog = {};
  const max = CONFIG.leitnerDays.length - 1;
  const apply = (id, correct, t) => {
    const p = (prog[id] ||= { seen: 0, correct: 0, wrong: 0, box: 0, due: 0 });
    p.seen++;
    if (correct) { p.correct++; p.box = Math.min(p.box + 1, max); } else { p.wrong++; p.box = 0; }
    p.due = t + CONFIG.leitnerDays[p.box] * DAY;
    p.last = correct;
    p.lastAt = t;
  };
  const h = state.history;
  for (let i = 0; i < h.length;) {
    const [id, step] = String(h[i].question_id).split("#");
    const t = Date.parse(h[i].at) || Date.now();
    if (step) {
      let ok = true;
      let j = i;
      while (j < h.length && String(h[j].question_id).split("#")[0] === id && h[j].at === h[i].at) { ok = ok && h[j].correct; j++; }
      apply(id, ok, t);
      i = j;
    } else {
      apply(id, h[i].correct, t);
      i++;
    }
  }
  state.progress = prog;
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

export function recordItem(item, correct, mode, stepResults = [correct]) {
  const now = Date.now();
  const p = state.progress[item.id] || { seen: 0, correct: 0, wrong: 0, box: 0, due: 0 };
  p.seen++;
  if (correct) {
    p.correct++;
    p.box = Math.min(p.box + 1, CONFIG.leitnerDays.length - 1);
  } else {
    p.wrong++;
    p.box = 0;
  }
  p.due = now + CONFIG.leitnerDays[p.box] * DAY;
  p.last = correct;
  p.lastAt = now;
  state.progress[item.id] = p;

  const at = new Date(now).toISOString();
  if (item.type === "case") {
    item.steps.forEach((s, k) => {
      if (k < stepResults.length) {
        state.history.push({ question_id: `${item.id}#${k + 1}`, topic: s.topic || item.topic, level: item.level, correct: !!stepResults[k], mode, at });
      }
    });
  } else {
    state.history.push({ question_id: item.id, topic: item.topic, level: item.level, correct: !!correct, mode, at });
  }
  save();
}

export function recordExam(result) {
  state.exams.push({ ...result, at: new Date().toISOString(), synced: false });
  save();
}

export function resetProgress() {
  const profile = state.profile;
  state = fresh();
  state.profile = profile;
  save();
}
