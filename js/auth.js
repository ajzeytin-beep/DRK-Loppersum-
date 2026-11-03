// Konten mit E-Mail und Passwort (Supabase Auth).
// Die Sitzung wird im localStorage gehalten und vor Ablauf automatisch erneuert.
import { CONFIG } from "./config.js";

const SESSION_KEY = "sani-trainer-session";
const base = () => CONFIG.supabaseUrl.replace(/\/$/, "");

export const authEnabled = () => Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function writeSession(s) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* ignorieren */ }
}

let session = readSession();
export const getSession = () => session;
export const getUser = () => session?.user || null;

// Fehlermeldungen von Supabase verständlich auf Deutsch
function translate(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-Mail oder Passwort ist falsch.";
  if (m.includes("email not confirmed")) return "Bitte bestätige zuerst deine E-Mail-Adresse (Link in der E-Mail).";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user_already_exists")) return "Mit dieser E-Mail gibt es schon ein Konto. Bitte melde dich an.";
  if (m.includes("password should be at least") || m.includes("weak_password")) return "Das Passwort ist zu kurz oder zu einfach (mindestens 8 Zeichen).";
  if (m.includes("unable to validate email") || m.includes("invalid format") || m.includes("email_address_invalid")) return "Die E-Mail-Adresse ist ungültig.";
  if (m.includes("rate limit") || m.includes("over_email_send_rate_limit") || m.includes("too many")) return "Zu viele Versuche. Bitte warte ein paar Minuten.";
  if (m.includes("same_password") || m.includes("should be different")) return "Das neue Passwort muss sich vom alten unterscheiden.";
  if (m.includes("signups not allowed") || m.includes("signup_disabled")) return "Registrierungen sind zurzeit abgeschaltet.";
  return msg || "Unbekannter Fehler";
}

async function authFetch(path, { method = "POST", body, token } = {}) {
  let res;
  try {
    res = await fetch(`${base()}/auth/v1/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: CONFIG.supabaseAnonKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Keine Verbindung zum Server. Bitte Internetverbindung prüfen.");
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* kein JSON */ }
  if (!res.ok) throw new Error(translate(data.msg || data.error_description || data.message || data.error_code || data.error || `Fehler ${res.status}`));
  return data;
}

function store(data) {
  if (!data?.access_token) return null;
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in || 3600) * 1000,
    user: data.user ? { id: data.user.id, email: data.user.email } : session?.user,
  };
  writeSession(session);
  return session;
}

export async function signUp(email, password, name, course) {
  const data = await authFetch("signup", {
    body: { email: email.trim(), password, data: { name: name.trim(), course: (course || "").trim().toUpperCase() } },
  });
  // Ist die E-Mail-Bestätigung eingeschaltet, kommt noch keine Sitzung zurück
  if (data.access_token) { store(data); return { session }; }
  return { needsConfirmation: true };
}

export async function signIn(email, password) {
  const data = await authFetch("token?grant_type=password", { body: { email: email.trim(), password } });
  return store(data);
}

export async function signOut() {
  const token = session?.access_token;
  session = null;
  writeSession(null);
  if (token) authFetch("logout", { token }).catch(() => {});
}

export async function requestPasswordReset(email) {
  const redirect = CONFIG.appUrl || `${location.origin}${location.pathname}`;
  await authFetch(`recover?redirect_to=${encodeURIComponent(redirect)}`, { body: { email: email.trim() } });
}

export async function updatePassword(password) {
  const token = await accessToken();
  await authFetch("user", { method: "PUT", body: { password }, token });
}

let refreshing = null;
async function refresh() {
  if (!session?.refresh_token) return null;
  refreshing ||= authFetch("token?grant_type=refresh_token", { body: { refresh_token: session.refresh_token } })
    .then(store)
    .catch((e) => {
      // Abgelaufene oder ungültige Sitzung → abmelden (aber nicht bei fehlender Verbindung)
      if (!/Verbindung/.test(e.message)) { session = null; writeSession(null); }
      throw e;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// Gültiges Zugriffs-Token (wird kurz vor Ablauf erneuert)
export async function accessToken() {
  if (!session) return null;
  if (Date.now() > session.expires_at - 60000) await refresh();
  return session?.access_token || null;
}

// Rücksprung aus E-Mail-Links (Bestätigung oder „Passwort vergessen“):
// Supabase hängt die Sitzung als #access_token=…&type=… an die Adresse.
export async function handleRedirect() {
  const h = location.hash.replace(/^#/, "");
  if (!/access_token=|error=|error_description=/.test(h)) return null;
  const p = new URLSearchParams(h);
  history.replaceState(null, "", location.pathname + location.search);
  if (p.get("error") || p.get("error_description")) {
    return { error: translate(p.get("error_description") || p.get("error")) };
  }
  store({
    access_token: p.get("access_token"),
    refresh_token: p.get("refresh_token"),
    expires_at: Number(p.get("expires_at")) || undefined,
    expires_in: Number(p.get("expires_in")) || 3600,
  });
  try {
    const user = await authFetch("user", { method: "GET", token: session.access_token });
    session.user = { id: user.id, email: user.email };
    writeSession(session);
  } catch { /* Nutzer wird später geladen */ }
  return { type: p.get("type") || "login" };
}
