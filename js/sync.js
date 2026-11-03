// Verbindung zur Datenbank (Supabase) – alle Aufrufe laufen mit dem Konto des angemeldeten Nutzers.
import { CONFIG } from "./config.js";
import * as store from "./store.js";
import { accessToken, authEnabled } from "./auth.js";

export const backendEnabled = authEnabled;

async function rpc(fn, args = {}) {
  const token = await accessToken();
  let res;
  try {
    res = await fetch(`${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: CONFIG.supabaseAnonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(args),
    });
  } catch {
    const e = new Error("Keine Verbindung zum Server.");
    e.offline = true;
    throw e;
  }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = JSON.parse(text).message || text; } catch { /* Text behalten */ }
    throw new Error(msg || `Fehler ${res.status}`);
  }
  return text ? JSON.parse(text) : null;
}

/* ---------------- eigenes Konto ---------------- */

export const myProfile = () => rpc("my_profile");
export const updateMyProfile = (name, course) => rpc("update_my_profile", { p_name: name, p_course: course || null });
export const myHistory = () => rpc("my_history");
export const deleteMyAccount = () => rpc("delete_my_account");

/* ---------------- Ausbilder ---------------- */

export const courseStats = () => rpc("my_course_stats");
export const pendingRegistrations = () => rpc("pending_registrations");
export const approve = (id) => rpc("approve_registration", { p_user: id });
export const reject = (id) => rpc("reject_registration", { p_user: id });
export const removeLearner = (id) => rpc("remove_learner", { p_user: id });
export const setLearnerPassword = (id, password) => rpc("learner_set_password", { p_user: id, p_password: password });
export const courseInstructors = () => rpc("course_instructors");
export const approveAsInstructor = (id) => rpc("approve_as_instructor", { p_user: id });
export const promoteToInstructor = (id) => rpc("promote_to_instructor", { p_user: id });
export const demoteInstructor = (id) => rpc("demote_instructor", { p_user: id });

/* ---------------- Lernfortschritt übertragen ---------------- */

export function pendingCount() {
  const st = store.getState();
  return st.history.length - st.syncedCount + st.exams.filter((e) => !e.synced).length;
}

let flushing = false;
export async function flush() {
  const st = store.getState();
  const p = st.profile;
  if (!backendEnabled() || !p || p.role !== "learner" || flushing || !navigator.onLine) return { skipped: true };
  flushing = true;
  try {
    while (st.syncedCount < st.history.length) {
      const batch = st.history.slice(st.syncedCount, st.syncedCount + 500);
      await rpc("record_my_progress", { p_attempts: batch, p_exams: [] });
      st.syncedCount += batch.length;
      store.save();
    }
    const exams = st.exams.filter((e) => !e.synced);
    if (exams.length) {
      await rpc("record_my_progress", { p_attempts: [], p_exams: exams.map(({ score, total, passed, at }) => ({ score, total, passed, at })) });
      exams.forEach((e) => { e.synced = true; });
    }
    st.lastSync = Date.now();
    store.save();
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  } finally {
    flushing = false;
  }
}

// Profil vom Server holen und den Lernstand mit dem Server-Verlauf abgleichen
// (so geht es auf einem neuen Gerät dort weiter, wo man aufgehört hat).
export async function refreshAccount() {
  const prof = await myProfile();
  const profile = {
    id: prof.id,
    name: prof.name,
    email: prof.email,
    role: prof.role,
    courseCode: prof.course_code || prof.requested_course || null,
    courseName: prof.course_name || null,
  };
  store.useAccount(profile);
  if (prof.role === "learner") {
    try {
      const h = await myHistory();
      store.mergeServerHistory(h.attempts || [], h.exams || []);
    } catch { /* später erneut */ }
  }
  return profile;
}
