// Optionale Übertragung des Lernstands an den Kurs-Server (Supabase).
// Ohne Konfiguration arbeitet die App rein lokal; Ausbilder können dann Exportdateien importieren.
import { CONFIG } from "./config.js";
import * as store from "./store.js";

export const backendEnabled = () => Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

async function rpc(fn, args) {
  const res = await fetch(`${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: CONFIG.supabaseAnonKey,
      // Alte „anon“-Schlüssel sind JWTs und gehören zusätzlich in den Authorization-Header,
      // neue „publishable“-Schlüssel (sb_publishable_…) nur in den apikey-Header.
      ...(CONFIG.supabaseAnonKey.startsWith("eyJ") ? { Authorization: `Bearer ${CONFIG.supabaseAnonKey}` } : {}),
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch { /* Text behalten */ }
    throw new Error(msg || `Fehler ${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}

export function joinCourse(code, learnerId, name) {
  return rpc("join_course", { p_code: code, p_learner_id: learnerId, p_name: name });
}

export function courseStats(code, pin) {
  return rpc("course_stats", { p_code: code, p_pin: pin });
}

export function pendingCount() {
  const st = store.getState();
  return st.history.length - st.syncedCount + st.exams.filter((e) => !e.synced).length;
}

let flushing = false;
export async function flush() {
  const st = store.getState();
  if (!backendEnabled() || !st.profile?.courseCode || flushing || !navigator.onLine) return { skipped: true };
  flushing = true;
  try {
    // Beitritt nachholen (z. B. wenn bei der Anmeldung kein Internet da war)
    if (!st.profile.joined) {
      const res = await joinCourse(st.profile.courseCode, st.profile.id, st.profile.name);
      store.setProfile({ joined: true, courseName: res?.name || null });
      st.syncedCount = 0;
    }
    while (st.syncedCount < st.history.length) {
      const batch = st.history.slice(st.syncedCount, st.syncedCount + 500);
      await rpc("record_progress", { p_learner_id: st.profile.id, p_attempts: batch, p_exams: [] });
      st.syncedCount += batch.length;
      store.save();
    }
    const exams = st.exams.filter((e) => !e.synced);
    if (exams.length) {
      await rpc("record_progress", {
        p_learner_id: st.profile.id,
        p_attempts: [],
        p_exams: exams.map(({ score, total, passed, at }) => ({ score, total, passed, at })),
      });
      exams.forEach((e) => { e.synced = true; });
    }
    st.lastSync = Date.now();
    store.save();
    return { ok: true };
  } catch (e) {
    // Auf dem Server unbekannt (z. B. vom Ausbilder entfernt): beim nächsten Mal neu beitreten und alles erneut senden
    if (/Teilnehmer unbekannt/.test(e.message)) {
      store.setProfile({ joined: false });
      st.syncedCount = 0;
      store.save();
    }
    return { error: e.message };
  } finally {
    flushing = false;
  }
}
