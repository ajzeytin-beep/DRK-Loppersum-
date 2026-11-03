// Lokaler Lernstand (localStorage). Bleibt auf dem Gerät, auch offline.
import { CONFIG } from "./config.js";

const KEY = "sani-trainer-v1";
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

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...fresh(), ...s, settings: { ...fresh().settings, ...(s.settings || {}) } };
    }
  } catch { /* privater Modus o. Ä. */ }
  return fresh();
}

let state = load();

export const getState = () => state;

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignorieren */ }
}

export function setProfile(profile) {
  state.profile = { ...(state.profile || {}), ...profile };
  save();
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

export function exportData() {
  return {
    format: "sani-trainer-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    learner: {
      id: state.profile?.id,
      name: state.profile?.name,
      courseCode: state.profile?.courseCode || null,
    },
    history: state.history,
    exams: state.exams.map(({ synced, ...e }) => e),
  };
}
