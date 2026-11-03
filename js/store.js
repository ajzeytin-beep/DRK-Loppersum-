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
export const listProfiles = () => [...index.profiles].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));

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

export function findProfile(name, courseCode) {
  const n = name.trim().toLowerCase();
  return index.profiles.find((p) => p.name.trim().toLowerCase() === n && (p.courseCode || null) === (courseCode || null)) || null;
}

export function logout() {
  save();
  index.current = null;
  saveIndex();
  state = fresh();
}

export function removeProfile(id) {
  try { localStorage.removeItem(stateKey(id)); } catch { /* ignorieren */ }
  index.profiles = index.profiles.filter((p) => p.id !== id);
  if (index.current === id) { index.current = null; state = fresh(); }
  saveIndex();
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
